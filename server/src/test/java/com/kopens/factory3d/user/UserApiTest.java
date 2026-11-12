package com.kopens.factory3d.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.kopens.factory3d.auth.AdminBootstrap;
import com.kopens.factory3d.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.test.context.support.WithMockUser;

/** 사용자 관리 (관리자 boss 로 로그인한 상태) */
@WithMockUser(username = "boss", roles = "ADMIN")
class UserApiTest extends IntegrationTest {
    @Autowired AdminBootstrap bootstrap;
    @Autowired PasswordEncoder encoder;

    private long insert(String name, String role) {
        jdbc.update("insert into app_user (username, display_name, password_hash, role, must_change_password) values (?, ?, 'x', ?, false)",
                name, name, role);
        return jdbc.queryForObject("select id from app_user where username = ?", Long.class, name);
    }

    private org.springframework.test.web.servlet.ResultActions create(String body) throws Exception {
        return mvc.perform(post("/api/users").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    @Test
    void 추가하면_임시_비밀번호를_한_번_주고_첫_로그인_때_변경() throws Exception {
        create("{\"username\":\"Lee\",\"displayName\":\"이운전\",\"role\":\"OPERATOR\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.username").value("lee"))
                .andExpect(jsonPath("$.user.role").value("OPERATOR"))
                .andExpect(jsonPath("$.user.mustChangePassword").value(true))
                .andExpect(jsonPath("$.tempPassword").isString());
        mvc.perform(get("/api/users")).andExpect(jsonPath("$", hasSize(1)));
        assertThat(jdbc.queryForObject("select username || ' ' || action || ' ' || target from audit_log", String.class))
                .isEqualTo("boss USER_CREATE lee");
    }

    @Test
    void 잘못된_입력과_중복() throws Exception {
        create("{\"username\":\"a\",\"displayName\":\"x\",\"role\":\"VIEWER\"}").andExpect(status().isBadRequest());
        create("{\"username\":\"lee\",\"displayName\":\" \",\"role\":\"VIEWER\"}").andExpect(status().isBadRequest());
        create("{\"username\":\"lee\",\"displayName\":\"이\",\"role\":\"VIEWER\"}").andExpect(status().isOk());
        create("{\"username\":\"lee\",\"displayName\":\"이\",\"role\":\"VIEWER\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("이미 있는 아이디입니다."));
    }

    @Test
    void 마지막_관리자와_자기_자신은_보호() throws Exception {
        long boss = insert("boss", "ADMIN");
        mvc.perform(patch("/api/users/" + boss).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"role\":\"VIEWER\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("마지막 관리자는 역할을 바꾸거나 사용 중지할 수 없습니다."));
        mvc.perform(patch("/api/users/" + boss).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"enabled\":false}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("자기 자신은 사용 중지할 수 없습니다."));
        long other = insert("park", "ADMIN");
        mvc.perform(patch("/api/users/" + other).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"role\":\"VIEWER\",\"displayName\":\"박조회\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("VIEWER"))
                .andExpect(jsonPath("$.displayName").value("박조회"));
    }

    @Test
    void 삭제_자기_자신은_안_되고_감사_기록에_남음() throws Exception {
        long boss = insert("boss", "ADMIN");
        mvc.perform(delete("/api/users/" + boss).with(csrf()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("자기 자신은 삭제할 수 없습니다."));
        long lee = insert("lee", "VIEWER");
        mvc.perform(delete("/api/users/" + lee).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(get("/api/users")).andExpect(jsonPath("$", hasSize(1)));
        assertThat(jdbc.queryForObject("select action || ' ' || target from audit_log", String.class)).isEqualTo("USER_DELETE lee");
        mvc.perform(delete("/api/users/" + lee).with(csrf())).andExpect(status().isNotFound());
    }

    @Test
    @WithMockUser(username = "other", roles = "ADMIN")
    void 마지막_관리자는_삭제_안_됨() throws Exception {
        long boss = insert("boss", "ADMIN");
        mvc.perform(delete("/api/users/" + boss).with(csrf()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("마지막 관리자는 삭제할 수 없습니다."));
    }

    @Test
    void 비밀번호_초기화() throws Exception {
        long id = insert("lee", "VIEWER");
        String temp = com.jayway.jsonpath.JsonPath.read(
                mvc.perform(post("/api/users/" + id + "/reset-password").with(csrf()))
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.user.mustChangePassword").value(true))
                        .andReturn().getResponse().getContentAsString(), "$.tempPassword");
        String hash = jdbc.queryForObject("select password_hash from app_user where id = ?", String.class, id);
        assertThat(encoder.matches(temp, hash)).isTrue();
    }

    @Test
    void 처음_관리자는_사용자가_없을_때만() {
        String pwd = bootstrap.createFirstAdmin("");
        assertThat(pwd).hasSize(12);
        assertThat(jdbc.queryForObject("select must_change_password from app_user where username = 'admin'", Boolean.class)).isTrue();
        assertThat(bootstrap.createFirstAdmin("whatever1")).isNull();
    }
}
