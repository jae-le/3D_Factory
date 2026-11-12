package com.kopens.factory3d.auth;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.kopens.factory3d.support.IntegrationTest;
import org.junit.jupiter.api.Test;

/** 역할별로 열리는 API (관리자 ⊃ 운전원 ⊃ 조회) */
class AccessTest extends IntegrationTest {

    @Test
    void 조회_권한은_GET_만() throws Exception {
        var viewer = user("v").roles("VIEWER");
        mvc.perform(get("/api/drawings").with(viewer)).andExpect(status().isOk());
        mvc.perform(post("/api/drawings").with(viewer).with(csrf())).andExpect(status().isForbidden());
        mvc.perform(get("/api/users").with(viewer)).andExpect(status().isForbidden());
        mvc.perform(get("/api/audit").with(viewer)).andExpect(status().isForbidden());
    }

    @Test
    void 운전원은_관리자_API_불가() throws Exception {
        var op = user("o").roles("OPERATOR");
        mvc.perform(get("/api/drawings").with(op)).andExpect(status().isOk());
        mvc.perform(get("/api/users").with(op)).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/anything").with(op)).andExpect(status().isForbidden());
    }

    @Test
    void 관리자는_모두() throws Exception {
        var admin = user("a").roles("ADMIN");
        mvc.perform(get("/api/drawings").with(admin)).andExpect(status().isOk());
        mvc.perform(get("/api/users").with(admin)).andExpect(status().isOk());
        mvc.perform(get("/api/audit").with(admin)).andExpect(status().isOk());
    }

    @Test
    void API_문서는_관리자만() throws Exception {
        mvc.perform(get("/v3/api-docs")).andExpect(status().isUnauthorized());
        mvc.perform(get("/v3/api-docs").with(user("a").roles("ADMIN"))).andExpect(status().isOk());
    }

    @Test
    void 로그인_안_하면_401() throws Exception {
        mvc.perform(get("/api/drawings")).andExpect(status().isUnauthorized());
    }
}
