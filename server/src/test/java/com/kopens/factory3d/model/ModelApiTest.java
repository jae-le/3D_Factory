package com.kopens.factory3d.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.jayway.jsonpath.JsonPath;
import com.kopens.factory3d.support.IntegrationTest;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.file.Files;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

class ModelApiTest extends IntegrationTest {
    static final RequestPostProcessor VIEWER = user("viewer").roles("VIEWER");
    static final RequestPostProcessor OPERATOR = user("kim").roles("OPERATOR");
    static final RequestPostProcessor ADMIN = user("admin").roles("ADMIN");

    /** 최소 glb: 12바이트 머리 (magic glTF, version 2, length) */
    static byte[] glb() {
        return ByteBuffer.allocate(12).order(ByteOrder.LITTLE_ENDIAN).putInt(0x46546C67).putInt(2).putInt(12).array();
    }

    static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0};

    private MockMultipartHttpServletRequestBuilder upload(String name, byte[] glb) {
        return (MockMultipartHttpServletRequestBuilder) multipart("/api/models")
                .file(new MockMultipartFile("file", "m.glb", "model/gltf-binary", glb))
                .file(new MockMultipartFile("thumbnail", "t.png", "image/png", PNG))
                .param("name", name).param("category", "mat").param("sourceExt", "obj")
                .param("sizeX", "4").param("sizeY", "3.5").param("sizeZ", "2").param("aliases", "HUB, 허브 ");
    }

    private long create(String name) throws Exception {
        String body = mvc.perform(upload(name, glb()).with(OPERATOR).with(csrf()))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(body, "$.id")).longValue();
    }

    @Test
    void 운전원이_올리면_목록_파일_썸네일() throws Exception {
        long id = create("허브");
        mvc.perform(get("/api/models").with(VIEWER))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("허브"))
                .andExpect(jsonPath("$[0].category").value("mat"))
                .andExpect(jsonPath("$[0].sizeY").value(3.5))
                .andExpect(jsonPath("$[0].aliases[0]").value("HUB"))
                .andExpect(jsonPath("$[0].aliases[1]").value("허브"))
                .andExpect(jsonPath("$[0].version").value(1))
                .andExpect(jsonPath("$[0].usedDrawings").value(0));
        byte[] file = mvc.perform(get("/api/models/" + id + "/file").with(VIEWER))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "model/gltf-binary"))
                .andExpect(header().string("Cache-Control", "max-age=31536000, immutable"))
                .andReturn().getResponse().getContentAsByteArray();
        assertThat(file).isEqualTo(glb());
        mvc.perform(get("/api/models/" + id + "/thumbnail").with(VIEWER))
                .andExpect(status().isOk()).andExpect(header().string("Content-Type", "image/png"));
        assertThat(Files.exists(dataDir.resolve("models/" + id + "/model.glb"))).isTrue();
        assertThat(jdbc.queryForObject("select count(*) from audit_log where action = 'MODEL_CREATE'", Integer.class)).isEqualTo(1);
    }

    @Test
    void 잘못된_업로드는_한국어_오류() throws Exception {
        mvc.perform(upload("가짜", new byte[] {1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12}).with(OPERATOR).with(csrf()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("glb 파일이 아닙니다."));
        mvc.perform(upload("크기", glb()).with(r -> { r.setParameter("sizeX", "0"); return r; }).with(OPERATOR).with(csrf()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("모델 크기가 올바르지 않습니다."));
        mvc.perform(upload("분류", glb()).with(r -> { r.setParameter("category", "x"); return r; }).with(OPERATOR).with(csrf()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("분류는 equip, mat, mover 중 하나입니다."));
        create("중복");
        mvc.perform(upload("중복", glb()).with(OPERATOR).with(csrf()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.detail").value("같은 이름의 모델이 있습니다."));
        mvc.perform(upload("조회", glb()).with(VIEWER).with(csrf())).andExpect(status().isForbidden());
    }

    @Test
    void 관리자만_수정_파일교체_삭제() throws Exception {
        long id = create("링");
        mvc.perform(patch("/api/models/" + id).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"베어링 링\"}").with(OPERATOR).with(csrf()))
                .andExpect(status().isForbidden());
        mvc.perform(patch("/api/models/" + id).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"베어링 링\",\"category\":\"equip\",\"aliases\":[\"RING\"]}").with(ADMIN).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("베어링 링"))
                .andExpect(jsonPath("$.category").value("equip"))
                .andExpect(jsonPath("$.aliases[0]").value("RING"));
        mvc.perform(multipart("/api/models/" + id + "/file")
                        .file(new MockMultipartFile("file", "m.glb", "model/gltf-binary", glb()))
                        .file(new MockMultipartFile("thumbnail", "t.png", "image/png", PNG))
                        .param("sourceExt", "fbx").param("sizeX", "5").param("sizeY", "5").param("sizeZ", "1")
                        .with(r -> { r.setMethod("PUT"); return r; }).with(ADMIN).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(2))
                .andExpect(jsonPath("$.sourceExt").value("fbx"))
                .andExpect(jsonPath("$.sizeX").value(5.0));
        mvc.perform(delete("/api/models/" + id).with(OPERATOR).with(csrf())).andExpect(status().isForbidden());
        mvc.perform(delete("/api/models/" + id).with(ADMIN).with(csrf())).andExpect(status().isNoContent());
        assertThat(Files.exists(dataDir.resolve("models/" + id))).isFalse();
        mvc.perform(get("/api/models/" + id + "/file").with(VIEWER))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.detail").value("모델을 찾을 수 없습니다."));
    }
}
