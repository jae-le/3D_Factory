package com.kopens.factory3d.change;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.jayway.jsonpath.JsonPath;
import com.kopens.factory3d.support.IntegrationTest;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

class ChangeLogApiTest extends IntegrationTest {
    static final RequestPostProcessor OPERATOR = user("kim").roles("OPERATOR");
    static final RequestPostProcessor ADMIN = user("admin").roles("ADMIN");
    long drawing;

    @BeforeEach
    void setUp() {
        drawing = jdbc.queryForObject("insert into drawing (name, source_type, source_file, plan) values ('공장', 'dxf', 'x', "
                + "'{\"format\":1,\"bounds\":{\"w\":10,\"h\":5},\"lines\":[]}') returning id", Long.class);
    }

    private long create(String body) throws Exception {
        String res = mvc.perform(post("/api/drawings/" + drawing + "/placements").contentType(MediaType.APPLICATION_JSON).content(body)
                .with(OPERATOR).with(csrf())).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(res, "$[0].id")).longValue();
    }

    private void patchOk(long id, String body) throws Exception {
        mvc.perform(patch("/api/placements/" + id).contentType(MediaType.APPLICATION_JSON).content(body).with(OPERATOR).with(csrf()))
                .andExpect(status().isOk());
    }

    @Test
    void 사용자_편집이_변경_이력에_남음() throws Exception {
        long a = create("[{\"name\":\"A\",\"x\":1,\"y\":1},{\"name\":\"B\",\"x\":2,\"y\":2}]");
        assertThat(jdbc.queryForList("select distinct batch_id::text from change_log", String.class)).hasSize(1); // 한 번에 추가 = 한 묶음
        patchOk(a, "{\"x\":3}");
        patchOk(a, "{\"name\":\"A1\"}");
        patchOk(a, "{\"rot\":90}");
        patchOk(a, "{\"x\":4,\"rot\":180}");
        mvc.perform(delete("/api/placements/" + a).with(OPERATOR).with(csrf())).andExpect(status().isNoContent());

        List<String> kinds = jdbc.queryForList("select kind from change_log order by id", String.class);
        assertThat(kinds).containsExactly("placement.add", "placement.add", "placement.move", "placement.rename", "placement.rotate",
                "placement.update", "placement.delete");
        assertThat(jdbc.queryForList("select distinct source from change_log", String.class)).containsExactly("USER");
        assertThat(jdbc.queryForList("select distinct username from change_log", String.class)).containsExactly("kim");
        assertThat(jdbc.queryForObject("select target_key from change_log where kind = 'placement.move'", String.class))
                .isEqualTo("placement:" + a);
        assertThat(jdbc.queryForObject("select (before->>'x') || '>' || (after->>'x') from change_log where kind = 'placement.move'",
                String.class)).isEqualTo("1.0>3.0");
        assertThat(jdbc.queryForObject("select after is null from change_log where kind = 'placement.delete'", Boolean.class)).isTrue();
        assertThat(jdbc.queryForObject("select count(distinct batch_id) from change_log", Integer.class)).isEqualTo(6);
    }

    @Test
    void 바뀐_것이_없으면_기록하지_않음() throws Exception {
        long a = create("[{\"name\":\"A\",\"x\":1,\"y\":1}]");
        patchOk(a, "{\"x\":1,\"y\":1}");
        assertThat(jdbc.queryForObject("select count(*) from change_log", Integer.class)).isEqualTo(1);
    }

    @Test
    void 관리자만_조회하고_필터() throws Exception {
        long a = create("[{\"name\":\"A\",\"x\":1,\"y\":1}]");
        patchOk(a, "{\"x\":2}");
        mvc.perform(get("/api/changes").with(OPERATOR)).andExpect(status().isForbidden());
        mvc.perform(get("/api/changes").with(ADMIN)).andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(2))
                .andExpect(jsonPath("$.size").value(50))
                .andExpect(jsonPath("$.items[0].kind").value("placement.move")) // 최근 것 먼저
                .andExpect(jsonPath("$.items[0].drawingName").value("공장"))
                .andExpect(jsonPath("$.items[0].source").value("USER"))
                .andExpect(jsonPath("$.items[0].before.x").value(1.0))
                .andExpect(jsonPath("$.items[0].after.x").value(2.0))
                .andExpect(jsonPath("$.items[0].targetKey").doesNotExist())
                .andExpect(jsonPath("$.items[1].before").isEmpty());
        mvc.perform(get("/api/changes?source=AI").with(ADMIN)).andExpect(jsonPath("$.total").value(0));
        mvc.perform(get("/api/changes?drawingId=" + (drawing + 1)).with(ADMIN)).andExpect(jsonPath("$.total").value(0));
        mvc.perform(get("/api/changes?from=2000-01-01&to=2000-01-02").with(ADMIN)).andExpect(jsonPath("$.total").value(0));
        mvc.perform(get("/api/changes?source=ROBOT").with(ADMIN)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("출처는 USER 또는 AI 입니다."));
    }
}
