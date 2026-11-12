package com.kopens.factory3d.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.kopens.factory3d.support.IntegrationTest;
import com.kopens.factory3d.user.UserService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;

/** 진짜 로그인 흐름 (세션 쿠키 F3D_SESSION 으로 이어짐) — 테스트용 가짜 로그인은 붙이지 않음 */
class AuthApiTest extends IntegrationTest {
    @Autowired PasswordEncoder encoder;
    @Autowired UserService userService;

    private void user(String name, String pwd, Role role, boolean mustChange) {
        jdbc.update("insert into app_user (username, display_name, password_hash, role, must_change_password) values (?, ?, ?, ?, ?)",
                name, name + " 님", encoder.encode(pwd), role.name(), mustChange);
    }

    private Cookie login(String name, String pwd) throws Exception {
        return mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"" + name + "\",\"password\":\"" + pwd + "\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getCookie("F3D_SESSION");
    }

    @Test
    void 로그인_안_하면_401() throws Exception {
        mvc.perform(get("/api/drawings"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("로그인이 필요합니다."));
        mvc.perform(get("/api/health")).andExpect(status().isOk());
    }

    @Test
    void 로그인하면_세션으로_이어지고_로그아웃하면_끊김() throws Exception {
        user("kim", "pass1234", Role.VIEWER, false);
        Cookie s = login("kim", "pass1234");
        assertThat(s).isNotNull();
        mvc.perform(get("/api/auth/me").cookie(s))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("kim"))
                .andExpect(jsonPath("$.role").value("VIEWER"));
        mvc.perform(get("/api/drawings").cookie(s)).andExpect(status().isOk());
        mvc.perform(post("/api/auth/logout").cookie(s).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(get("/api/drawings").cookie(s)).andExpect(status().isUnauthorized());
        assertThat(jdbc.queryForList("select action from audit_log order by id", String.class))
                .containsExactly("LOGIN_OK", "LOGOUT");
    }

    @Test
    void CSRF_토큰_없으면_403() throws Exception {
        user("kim", "pass1234", Role.VIEWER, false);
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"kim\",\"password\":\"pass1234\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.detail", containsString("새로고침")));
    }

    @Test
    void 틀리면_401_다섯_번이면_423_잠김() throws Exception {
        user("kim", "pass1234", Role.VIEWER, false);
        for (int i = 1; i <= 4; i++)
            mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                            .content("{\"username\":\"kim\",\"password\":\"wrong\"}"))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.detail").value("아이디 또는 비밀번호가 틀렸습니다."));
        mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"kim\",\"password\":\"wrong\"}"))
                .andExpect(status().isLocked())
                .andExpect(jsonPath("$.detail", containsString("잠겼습니다")));
        // 잠긴 동안엔 맞는 비밀번호도 안 됨
        mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"kim\",\"password\":\"pass1234\"}"))
                .andExpect(status().isLocked());
    }

    @Test
    void 비밀번호_변경이_필요하면_변경_전까지_설비를_못_봄() throws Exception {
        user("kim", "temp1234", Role.OPERATOR, true);
        Cookie s = login("kim", "temp1234");
        mvc.perform(get("/api/drawings").cookie(s)).andExpect(status().isForbidden());
        mvc.perform(post("/api/auth/password").cookie(s).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"current\":\"temp1234\",\"next\":\"short\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", containsString("8자 이상")));
        // 바꾸면 세션 id 도 새로 (세션 고정 공격 방지) — 브라우저처럼 새 쿠키로 이어감
        Cookie renewed = mvc.perform(post("/api/auth/password").cookie(s).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"current\":\"temp1234\",\"next\":\"newpass99\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mustChangePassword").value(false))
                .andReturn().getResponse().getCookie("F3D_SESSION");
        mvc.perform(get("/api/drawings").cookie(renewed)).andExpect(status().isOk());
    }

    @Test
    void 사용_중지하면_세션이_바로_끊김() throws Exception {
        user("kim", "pass1234", Role.VIEWER, false);
        user("boss", "pass1234", Role.ADMIN, false);
        Cookie s = login("kim", "pass1234");
        long id = jdbc.queryForObject("select id from app_user where username = 'kim'", Long.class);
        userService.update(id, null, null, false, "boss");
        mvc.perform(get("/api/drawings").cookie(s)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"kim\",\"password\":\"pass1234\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail", containsString("사용이 중지된")));
    }
}
