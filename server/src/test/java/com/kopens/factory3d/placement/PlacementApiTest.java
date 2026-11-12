package com.kopens.factory3d.placement;

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

class PlacementApiTest extends IntegrationTest {
    static final RequestPostProcessor VIEWER = user("viewer").roles("VIEWER");
    static final RequestPostProcessor OPERATOR = user("kim").roles("OPERATOR");
    static final RequestPostProcessor ADMIN = user("admin").roles("ADMIN");
    long drawing;
    long hub;

    @BeforeEach
    void setUp() {
        drawing = jdbc.queryForObject("insert into drawing (name, source_type, source_file, plan) values ('공장', 'dxf', 'x', "
                + "'{\"format\":1,\"bounds\":{\"w\":10,\"h\":5},\"lines\":[]}') returning id", Long.class);
        hub = jdbc.queryForObject("insert into model (name, category, source_ext, size_x, size_y, size_z) values ('허브', 'mat', 'glb', 4, 4, 3) returning id", Long.class);
    }

    private String postAs(String json, RequestPostProcessor who) throws Exception {
        return mvc.perform(post("/api/drawings/" + drawing + "/placements").contentType(MediaType.APPLICATION_JSON).content(json).with(who).with(csrf()))
                .andReturn().getResponse().getContentAsString();
    }

    @Test
    void 여러_개_추가하고_도면별로_조회() throws Exception {
        mvc.perform(post("/api/drawings/" + drawing + "/placements").contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"modelId\":" + hub + ",\"name\":\"허브 1\",\"x\":1.5,\"y\":2,\"rot\":90},"
                                + "{\"name\":\"표기 PUMP\",\"x\":3,\"y\":4,\"hintLabel\":\"PUMP\"}]").with(OPERATOR).with(csrf()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].modelId").value(hub))
                .andExpect(jsonPath("$[1].modelId").doesNotExist())
                .andExpect(jsonPath("$[1].hintLabel").value("PUMP"));
        mvc.perform(get("/api/drawings/" + drawing + "/placements").with(VIEWER))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].name").value("허브 1"))
                .andExpect(jsonPath("$[0].rot").value(90.0))
                .andExpect(jsonPath("$[1].rot").value(0.0));
        mvc.perform(get("/api/drawings").with(VIEWER)).andExpect(jsonPath("$[0].placements").value(2));
        assertThat(jdbc.queryForObject("select count(*) from audit_log where action = 'PLACEMENT_CREATE'", Integer.class)).isEqualTo(1);
    }

    @Test
    void 잘못된_배치는_한국어_오류() throws Exception {
        postAs("[{\"name\":\"허브 1\",\"x\":1,\"y\":1}]", OPERATOR);
        mvc.perform(post("/api/drawings/" + drawing + "/placements").contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"name\":\"허브 1\",\"x\":1,\"y\":1}]").with(OPERATOR).with(csrf()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.detail").value("같은 이름의 객체가 이 도면에 있습니다."));
        mvc.perform(post("/api/drawings/" + drawing + "/placements").contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"name\":\"a\",\"x\":1,\"y\":1},{\"name\":\"a\",\"x\":2,\"y\":2}]").with(OPERATOR).with(csrf()))
                .andExpect(status().isConflict());
        mvc.perform(post("/api/drawings/" + drawing + "/placements").contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"modelId\":99999,\"name\":\"b\",\"x\":1,\"y\":1}]").with(OPERATOR).with(csrf()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("모델을 찾을 수 없습니다."));
        mvc.perform(post("/api/drawings/" + drawing + "/placements").contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"name\":\" \",\"x\":1,\"y\":1}]").with(OPERATOR).with(csrf()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("객체 이름은 1~100자로 입력하세요."));
        mvc.perform(post("/api/drawings/" + drawing + "/placements").contentType(MediaType.APPLICATION_JSON)
                        .content("[]").with(OPERATOR).with(csrf()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("추가할 객체는 1~2000개여야 합니다."));
        mvc.perform(post("/api/drawings/99999/placements").contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"name\":\"c\",\"x\":1,\"y\":1}]").with(OPERATOR).with(csrf()))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.detail").value("도면을 찾을 수 없습니다."));
        mvc.perform(post("/api/drawings/" + drawing + "/placements").contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"name\":\"d\",\"x\":1,\"y\":1}]").with(VIEWER).with(csrf()))
                .andExpect(status().isForbidden());
    }

    @Test
    void 이동_회전_이름_모델지정_삭제() throws Exception {
        long id = ((Number) JsonPath.read(postAs("[{\"name\":\"표기 HUB\",\"x\":1,\"y\":1,\"hintLabel\":\"HUB\"}]", OPERATOR), "$[0].id")).longValue();
        mvc.perform(patch("/api/placements/" + id).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"x\":5,\"y\":6,\"rot\":180,\"name\":\"허브 1\",\"modelId\":" + hub + "}").with(OPERATOR).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.x").value(5.0))
                .andExpect(jsonPath("$.rot").value(180.0))
                .andExpect(jsonPath("$.name").value("허브 1"))
                .andExpect(jsonPath("$.modelId").value(hub))
                .andExpect(jsonPath("$.hintLabel").value("HUB"));
        mvc.perform(patch("/api/placements/" + id).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"clearModel\":true}").with(OPERATOR).with(csrf()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.modelId").doesNotExist());
        mvc.perform(patch("/api/placements/" + id).contentType(MediaType.APPLICATION_JSON).content("{\"x\":1}").with(VIEWER).with(csrf()))
                .andExpect(status().isForbidden());
        mvc.perform(delete("/api/placements/" + id).with(OPERATOR).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(patch("/api/placements/" + id).contentType(MediaType.APPLICATION_JSON).content("{\"x\":1}").with(OPERATOR).with(csrf()))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.detail").value("객체를 찾을 수 없습니다."));
    }

    @Test
    void 모델을_지우면_임시상자_도면을_지우면_배치도_삭제() throws Exception {
        postAs("[{\"modelId\":" + hub + ",\"name\":\"허브 1\",\"x\":1,\"y\":1}]", OPERATOR);
        mvc.perform(delete("/api/models/" + hub).with(ADMIN).with(csrf())).andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("select model_id from placement", Long.class)).isNull();
        mvc.perform(delete("/api/drawings/" + drawing).with(ADMIN).with(csrf())).andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("select count(*) from placement", Integer.class)).isZero();
    }

    @Test
    void 보정_배율을_주면_배치_좌표도_같이_바뀜() throws Exception {
        postAs("[{\"name\":\"a\",\"x\":2,\"y\":3}]", OPERATOR);
        String body = "{\"version\":1,\"plan\":{\"format\":1,\"bounds\":{\"w\":20,\"h\":10},\"lines\":[]},\"layerRules\":{},\"scaleFactor\":2}";
        mvc.perform(put("/api/drawings/" + drawing + "/plan").contentType(MediaType.APPLICATION_JSON).content(body).with(OPERATOR).with(csrf()))
                .andExpect(status().isOk());
        List<Double> xy = jdbc.queryForList("select unnest(array[x, y]) from placement", Double.class);
        assertThat(xy).containsExactly(4.0, 6.0);
        String bad = body.replace("\"version\":1", "\"version\":2").replace("\"scaleFactor\":2", "\"scaleFactor\":-1");
        mvc.perform(put("/api/drawings/" + drawing + "/plan").contentType(MediaType.APPLICATION_JSON).content(bad).with(OPERATOR).with(csrf()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("배율은 0보다 커야 합니다."));
    }
}
