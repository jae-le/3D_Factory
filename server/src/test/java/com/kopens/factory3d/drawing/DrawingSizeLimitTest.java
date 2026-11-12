package com.kopens.factory3d.drawing;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.kopens.factory3d.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.TestPropertySource;

@TestPropertySource(properties = {"factory3d.drawing.max-source-bytes=100", "factory3d.drawing.max-plan-bytes=200"})
class DrawingSizeLimitTest extends IntegrationTest {
    @Test
    void 너무_큰_원본과_plan_은_413() throws Exception {
        var op = user("kim").roles("OPERATOR");
        String plan = "{\"format\":1,\"bounds\":{\"w\":1,\"h\":1},\"lines\":[]}";
        mvc.perform(multipart("/api/drawings").file(new MockMultipartFile("file", "a.dxf", "application/dxf", new byte[101]))
                        .param("name", "큰 원본").param("plan", plan).with(op).with(csrf()))
                .andExpect(status().isPayloadTooLarge()).andExpect(jsonPath("$.detail").value("도면 파일이 너무 큽니다."));
        String big = "{\"format\":1,\"bounds\":{\"w\":1,\"h\":1},\"lines\":[],\"pad\":\"" + "x".repeat(300) + "\"}";
        mvc.perform(multipart("/api/drawings").file(new MockMultipartFile("file", "a.dxf", "application/dxf", new byte[10]))
                        .param("name", "큰 plan").param("plan", big).with(op).with(csrf()))
                .andExpect(status().isPayloadTooLarge()).andExpect(jsonPath("$.detail").value("도면 해석 결과가 너무 큽니다."));
    }
}
