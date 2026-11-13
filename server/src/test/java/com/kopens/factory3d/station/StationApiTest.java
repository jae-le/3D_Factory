package com.kopens.factory3d.station;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.jayway.jsonpath.JsonPath;
import com.kopens.factory3d.support.IntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

class StationApiTest extends IntegrationTest {
    static final RequestPostProcessor VIEWER = user("viewer").roles("VIEWER");
    static final RequestPostProcessor OPERATOR = user("kim").roles("OPERATOR");
    static final RequestPostProcessor ADMIN = user("admin").roles("ADMIN");
    long drawing;
    long other;

    @BeforeEach
    void setUp() {
        drawing = jdbc.queryForObject("insert into drawing (name, source_type, source_file) values ('공장', 'dxf', 'x') returning id", Long.class);
        other = jdbc.queryForObject("insert into drawing (name, source_type, source_file) values ('2공장', 'dxf', 'x') returning id", Long.class);
    }

    private ResultActions send(MockHttpServletRequestBuilder req, String json, RequestPostProcessor who) throws Exception {
        return mvc.perform(req.contentType(MediaType.APPLICATION_JSON).content(json).with(who).with(csrf()));
    }

    private static long id(ResultActions r) throws Exception {
        return ((Number) JsonPath.read(r.andReturn().getResponse().getContentAsString(), "$.id")).longValue();
    }

    private String stations() {
        return "/api/drawings/" + drawing + "/stations";
    }

    private long station(String name) throws Exception {
        return id(send(post(stations()), "{\"name\":\"" + name + "\",\"steps\":[\"a\",\"b\"]}", ADMIN).andExpect(status().isCreated()));
    }

    private long project(long drawingId, String name) throws Exception {
        return id(send(post("/api/drawings/" + drawingId + "/projects"),
                "{\"name\":\"" + name + "\",\"done\":3,\"total\":13,\"period\":\"'25.09~'27.03\"}", ADMIN).andExpect(status().isCreated()));
    }

    private int audits(String action) {
        return jdbc.queryForObject("select count(*) from audit_log where action = ?", Integer.class, action);
    }

    @Test
    void 관리자만_추가하고_조회는_누구나() throws Exception {
        send(post(stations()), "{\"name\":\"Hub 조립장\",\"steps\":[\"a\"]}", OPERATOR).andExpect(status().isForbidden());
        long pjt = project(drawing, "야월해상");
        send(post(stations()), "{\"name\":\"Hub 조립장\",\"placementName\":\"Hub 조립장\",\"steps\":[\" Hub Casting 세팅 \",\"Pitch Bearing 장착\"],"
                + "\"taktSec\":1800,\"projectId\":" + pjt + ",\"countsProject\":true,\"materials\":[\"Hub Casting\"]}", ADMIN)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.no").value(1))
                .andExpect(jsonPath("$.placementName").value("Hub 조립장"))
                .andExpect(jsonPath("$.steps[0]").value("Hub Casting 세팅"))
                .andExpect(jsonPath("$.taktSec").value(1800))
                .andExpect(jsonPath("$.warnPp").value(10))
                .andExpect(jsonPath("$.delayPp").value(20))
                .andExpect(jsonPath("$.projectId").value(pjt))
                .andExpect(jsonPath("$.countsProject").value(true))
                .andExpect(jsonPath("$.materials[0]").value("Hub Casting"));
        station("Main Station 3");
        mvc.perform(get(stations()).with(VIEWER))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[1].name").value("Main Station 3"))
                .andExpect(jsonPath("$[1].no").value(2))
                .andExpect(jsonPath("$[1].taktSec").value(1200));
        mvc.perform(get("/api/drawings/" + drawing + "/projects").with(VIEWER))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("야월해상"))
                .andExpect(jsonPath("$[0].done").value(3))
                .andExpect(jsonPath("$[0].state").value("run"));
        mvc.perform(get("/api/drawings/999999/stations").with(VIEWER)).andExpect(status().isNotFound());
        assertThat(audits("STATION_CREATE")).isEqualTo(2);
        assertThat(audits("PROJECT_CREATE")).isEqualTo(1);
    }

    @Test
    void 잘못된_공정은_한국어_오류() throws Exception {
        send(post(stations()), "{\"name\":\" \",\"steps\":[\"a\"]}", ADMIN)
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("공정 이름은 1~100자로 입력하세요."));
        send(post(stations()), "{\"name\":\"A\",\"steps\":[]}", ADMIN)
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("step 은 1~40개, 각 1~100자로 입력하세요."));
        send(post(stations()), "{\"name\":\"A\",\"steps\":[\"a\"],\"taktSec\":59}", ADMIN)
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("택타임은 60~604800초(1분~7일)여야 합니다."));
        send(post(stations()), "{\"name\":\"A\",\"steps\":[\"a\"],\"warnPp\":20,\"delayPp\":20}", ADMIN)
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("주의·지연 기준은 0 ≤ 주의 < 지연 ≤ 100 이어야 합니다."));
        long otherPjt = project(other, "다른 PJT");
        send(post(stations()), "{\"name\":\"A\",\"steps\":[\"a\"],\"projectId\":" + otherPjt + "}", ADMIN)
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("이 도면의 PJT 가 아닙니다."));
        station("A");
        send(post(stations()), "{\"name\":\"A\",\"steps\":[\"a\"]}", ADMIN)
                .andExpect(status().isConflict()).andExpect(jsonPath("$.detail").value("같은 이름의 공정이 있습니다."));
        send(post("/api/drawings/999999/stations"), "{\"name\":\"B\",\"steps\":[\"a\"]}", ADMIN).andExpect(status().isNotFound());
    }

    @Test
    void 부분_수정하고_지우면_번호를_다시_매김() throws Exception {
        long a = station("A");
        long b = station("B");
        station("C");
        long pjt = project(drawing, "야월해상");
        send(patch("/api/stations/" + b), "{\"taktSec\":600,\"projectId\":" + pjt + "}", OPERATOR).andExpect(status().isForbidden());
        send(patch("/api/stations/" + b), "{\"taktSec\":600,\"projectId\":" + pjt + "}", ADMIN)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("B"))
                .andExpect(jsonPath("$.taktSec").value(600))
                .andExpect(jsonPath("$.steps.length()").value(2))
                .andExpect(jsonPath("$.projectId").value(pjt));
        send(patch("/api/stations/" + b), "{\"clearProject\":true,\"placementName\":\"Main Station 1\"}", ADMIN)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.placementName").value("Main Station 1"))
                .andExpect(jsonPath("$.taktSec").value(600));
        assertThat(jdbc.queryForObject("select project_id from station where id = ?", Long.class, b)).isNull();
        mvc.perform(delete("/api/stations/" + a).with(OPERATOR).with(csrf())).andExpect(status().isForbidden());
        mvc.perform(delete("/api/stations/" + a).with(ADMIN).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(get(stations()).with(VIEWER))
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].name").value("B"))
                .andExpect(jsonPath("$[0].no").value(1))
                .andExpect(jsonPath("$[1].no").value(2));
        assertThat(audits("STATION_UPDATE")).isEqualTo(2);
        assertThat(audits("STATION_DELETE")).isEqualTo(1);
    }

    @Test
    void 순서_바꾸기는_모든_공정을_한_번씩() throws Exception {
        long a = station("A");
        long b = station("B");
        long c = station("C");
        String order = stations() + "/order";
        send(put(order), "[" + c + "," + a + "," + b + "]", OPERATOR).andExpect(status().isForbidden());
        send(put(order), "[" + c + "," + a + "," + b + "]", ADMIN)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("C"))
                .andExpect(jsonPath("$[0].no").value(1))
                .andExpect(jsonPath("$[2].name").value("B"))
                .andExpect(jsonPath("$[2].no").value(3));
        send(put(order), "[" + c + "," + a + "]", ADMIN)
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("순서에는 이 도면의 모든 공정이 한 번씩 있어야 합니다."));
        send(put(order), "[" + c + "," + a + "," + a + "]", ADMIN).andExpect(status().isBadRequest());
        assertThat(audits("STATION_ORDER")).isEqualTo(1);
    }

    @Test
    void PJT_검사_수정_삭제하면_공정의_PJT_비움() throws Exception {
        String projects = "/api/drawings/" + drawing + "/projects";
        long pjt = project(drawing, "야월해상");
        send(post(projects), "{\"name\":\"야월해상\",\"total\":13}", ADMIN)
                .andExpect(status().isConflict()).andExpect(jsonPath("$.detail").value("같은 이름의 PJT 가 있습니다."));
        send(post(projects), "{\"name\":\"B\",\"done\":14,\"total\":13}", ADMIN)
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("제작 수는 0 ≤ 제작 ≤ 전체, 전체 ≥ 1 이어야 합니다."));
        send(post(projects), "{\"name\":\"B\",\"total\":13,\"state\":\"x\"}", ADMIN)
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("상태는 run, wait, done 중 하나입니다."));
        send(post(projects), "{\"name\":\"B\",\"total\":13}", OPERATOR).andExpect(status().isForbidden());
        send(patch("/api/projects/" + pjt), "{\"done\":1}", OPERATOR).andExpect(status().isForbidden());
        send(patch("/api/projects/" + pjt), "{\"done\":4,\"state\":\"wait\"}", ADMIN)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.done").value(4))
                .andExpect(jsonPath("$.state").value("wait"))
                .andExpect(jsonPath("$.total").value(13))
                .andExpect(jsonPath("$.period").value("'25.09~'27.03"));
        long s = id(send(post(stations()), "{\"name\":\"A\",\"steps\":[\"a\"],\"projectId\":" + pjt + "}", ADMIN).andExpect(status().isCreated()));
        mvc.perform(delete("/api/projects/" + pjt).with(ADMIN).with(csrf())).andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("select project_id from station where id = ?", Long.class, s)).isNull();
        assertThat(audits("PROJECT_UPDATE")).isEqualTo(1);
        assertThat(audits("PROJECT_DELETE")).isEqualTo(1);
    }
}
