package com.kopens.factory3d.drawing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.kopens.factory3d.support.IntegrationTest;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

class DrawingApiTest extends IntegrationTest {
    static final RequestPostProcessor VIEWER = user("viewer").roles("VIEWER");
    static final RequestPostProcessor OPERATOR = user("kim").roles("OPERATOR");
    static final RequestPostProcessor ADMIN = user("admin").roles("ADMIN");
    static final String PLAN = "{\"format\":1,\"scale\":0.001,\"rotQ\":0,\"flip\":1,\"bounds\":{\"w\":160.5,\"h\":65.8},\"lines\":[]}";
    static final byte[] DXF = "0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n".getBytes(StandardCharsets.UTF_8);

    private MockMultipartFile file(String name, byte[] body) {
        return new MockMultipartFile("file", name, "application/dxf", body);
    }

    private long create(String name) throws Exception {
        String loc = mvc.perform(multipart("/api/drawings").file(file("a.dxf", DXF))
                        .param("name", name).param("plan", PLAN).param("layerRules", "{}").with(OPERATOR).with(csrf()))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return ((Number) com.jayway.jsonpath.JsonPath.read(loc, "$.id")).longValue();
    }

    @Test
    void 도면이_없으면_빈_목록() throws Exception {
        mvc.perform(get("/api/drawings").with(VIEWER)).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void 도면_목록은_등록순() throws Exception {
        jdbc.update("insert into drawing (name, source_type, source_file) values ('나셀 공장', 'dxf', 'drawings/1/a.dxf')");
        jdbc.update("insert into drawing (name, source_type, source_file) values ('2공장', 'image', 'drawings/2/b.png')");
        mvc.perform(get("/api/drawings").with(VIEWER))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].name").value("나셀 공장"))
                .andExpect(jsonPath("$[0].sourceType").value("dxf"))
                .andExpect(jsonPath("$[1].name").value("2공장"))
                .andExpect(jsonPath("$[1].updatedAt").exists());
    }

    @Test
    void 운전원이_올리면_원본과_plan_이_저장되고_목록에_크기가_보임() throws Exception {
        long id = create("  나셀 공장  ");
        mvc.perform(get("/api/drawings/" + id).with(VIEWER))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("나셀 공장"))
                .andExpect(jsonPath("$.version").value(1))
                .andExpect(jsonPath("$.createdBy").value("kim"))
                .andExpect(jsonPath("$.plan.bounds.w").value(160.5))
                .andExpect(jsonPath("$.layerRules").isMap());
        mvc.perform(get("/api/drawings").with(VIEWER))
                .andExpect(jsonPath("$[0].width").value(160.5))
                .andExpect(jsonPath("$[0].height").value(65.8))
                .andExpect(jsonPath("$[0].version").value(1));
        byte[] src = mvc.perform(get("/api/drawings/" + id + "/source").with(VIEWER))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray();
        assertThat(src).isEqualTo(DXF);
        mvc.perform(get("/api/drawings/" + id + "/source").with(VIEWER))
                .andExpect(header().string("Content-Disposition", "attachment; filename=\"source.dxf\""));
        assertThat(Files.exists(dataDir.resolve("drawings/" + id + "/source.dxf"))).isTrue();
        assertThat(jdbc.queryForObject("select count(*) from audit_log where action = 'DRAWING_CREATE'", Integer.class)).isEqualTo(1);
    }

    @Test
    void 잘못된_입력은_한국어_오류() throws Exception {
        mvc.perform(multipart("/api/drawings").file(file("a.dwg", DXF)).param("name", "x").param("plan", PLAN).with(OPERATOR).with(csrf()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("DXF 파일만 올릴 수 있습니다."));
        mvc.perform(multipart("/api/drawings").file(file("a.dxf", DXF)).param("name", " ").param("plan", PLAN).with(OPERATOR).with(csrf()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("도면 이름은 1~100자로 입력하세요."));
        mvc.perform(multipart("/api/drawings").file(file("a.dxf", DXF)).param("name", "x").param("plan", "{\"format\":1}").with(OPERATOR).with(csrf()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("도면 해석 결과(plan)가 올바르지 않습니다."));
        create("중복");
        mvc.perform(multipart("/api/drawings").file(file("a.dxf", DXF)).param("name", "중복").param("plan", PLAN).with(OPERATOR).with(csrf()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.detail").value("같은 이름의 도면이 있습니다."));
    }

    @Test
    void 숫자가_아닌_bounds_는_400() throws Exception {
        String bad = "{\"format\":1,\"bounds\":{\"w\":\"abc\",\"h\":1},\"lines\":[]}";
        String msg = "도면 해석 결과(plan)가 올바르지 않습니다.";
        mvc.perform(multipart("/api/drawings").file(file("a.dxf", DXF)).param("name", "x").param("plan", bad).with(OPERATOR).with(csrf()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value(msg));
        long id = create("bounds");
        mvc.perform(put("/api/drawings/" + id + "/plan").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"version\":1,\"plan\":" + bad + ",\"layerRules\":{}}").with(OPERATOR).with(csrf()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value(msg));
    }

    @Test
    void plan_저장은_버전을_올리고_어긋나면_409() throws Exception {
        long id = create("보정");
        String body = "{\"version\":1,\"plan\":" + PLAN.replace("\"rotQ\":0", "\"rotQ\":1") + ",\"layerRules\":{\"WALL\":{\"role\":\"partition\"}}}";
        mvc.perform(put("/api/drawings/" + id + "/plan").contentType(MediaType.APPLICATION_JSON).content(body).with(ADMIN).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(2))
                .andExpect(jsonPath("$.plan.rotQ").value(1))
                .andExpect(jsonPath("$.layerRules.WALL.role").value("partition"));
        mvc.perform(put("/api/drawings/" + id + "/plan").contentType(MediaType.APPLICATION_JSON).content(body).with(ADMIN).with(csrf()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.detail").value("다른 사람이 먼저 수정했습니다."));
    }

    @Test
    void 권한_조회는_쓰기불가_운전원은_이름변경_삭제_불가() throws Exception {
        long id = create("권한");
        mvc.perform(multipart("/api/drawings").file(file("a.dxf", DXF)).param("name", "y").param("plan", PLAN).with(VIEWER).with(csrf()))
                .andExpect(status().isForbidden());
        mvc.perform(patch("/api/drawings/" + id).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"z\"}").with(OPERATOR).with(csrf()))
                .andExpect(status().isForbidden());
        mvc.perform(delete("/api/drawings/" + id).with(OPERATOR).with(csrf())).andExpect(status().isForbidden());
    }

    @Test
    void 관리자는_이름변경과_삭제() throws Exception {
        long id = create("옛 이름");
        mvc.perform(patch("/api/drawings/" + id).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"새 이름\"}").with(ADMIN).with(csrf()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.name").value("새 이름"));
        Path dir = dataDir.resolve("drawings/" + id);
        assertThat(Files.exists(dir)).isTrue();
        mvc.perform(delete("/api/drawings/" + id).with(ADMIN).with(csrf())).andExpect(status().isNoContent());
        assertThat(Files.exists(dir)).isFalse();
        mvc.perform(get("/api/drawings/" + id).with(VIEWER))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.detail").value("도면을 찾을 수 없습니다."));
    }

    private org.springframework.test.web.servlet.ResultActions putPlan(long id, String body, RequestPostProcessor who) throws Exception {
        return mvc.perform(put("/api/drawings/" + id + "/plan").contentType(MediaType.APPLICATION_JSON).content(body).with(who).with(csrf()));
    }

    @Test
    void plan_저장_권한_없는_도면_버전_없음() throws Exception {
        long id = create("저장 오류");
        String ok = "{\"version\":1,\"plan\":" + PLAN + ",\"layerRules\":{}}";
        putPlan(id, ok, VIEWER).andExpect(status().isForbidden());
        putPlan(id + 999, ok, OPERATOR).andExpect(status().isNotFound()).andExpect(jsonPath("$.detail").value("도면을 찾을 수 없습니다."));
        putPlan(id, "{\"plan\":" + PLAN + ",\"layerRules\":{}}", OPERATOR)
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("버전이 필요합니다."));
    }

    @Test
    void 레이어_규칙은_관리자만_바꿈_운전원은_같은_규칙으로_회전_저장() throws Exception {
        long id = create("규칙 권한");
        String changed = "{\"version\":1,\"plan\":" + PLAN + ",\"layerRules\":{\"WALL\":{\"role\":\"partition\"}}}";
        putPlan(id, changed, OPERATOR)
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.detail").value("레이어 규칙은 관리자만 바꿀 수 있습니다."));
        putPlan(id, changed, ADMIN).andExpect(status().isOk()).andExpect(jsonPath("$.version").value(2));
        // 키 순서가 달라도 같은 규칙이면 허용
        jdbc.update("update drawing set layer_rules = cast(? as jsonb) where id = ?", "{\"WALL\":{\"role\":\"partition\",\"height\":1.2}}", id);
        String rot = "{\"version\":2,\"plan\":" + PLAN.replace("\"rotQ\":0", "\"rotQ\":1") + ",\"layerRules\":{\"WALL\":{\"height\":1.2,\"role\":\"partition\"}}}";
        putPlan(id, rot, OPERATOR).andExpect(status().isOk()).andExpect(jsonPath("$.plan.rotQ").value(1)).andExpect(jsonPath("$.version").value(3));
    }
}
