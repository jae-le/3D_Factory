package com.kopens.factory3d.loginhistory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.kopens.factory3d.support.IntegrationTest;
import jakarta.servlet.http.Cookie;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;

class LoginHistoryApiTest extends IntegrationTest {
    @Autowired PasswordEncoder encoder;

    private void kim() {
        jdbc.update("insert into app_user (username, display_name, password_hash, role, must_change_password) values ('kim', '김', ?, 'OPERATOR', false)",
                encoder.encode("Passw0rd!"));
    }

    private org.springframework.test.web.servlet.ResultActions login(String name, String pwd) throws Exception {
        return mvc.perform(post("/api/auth/login").with(csrf()).header("User-Agent", "JUnit-Browser")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"" + name + "\",\"password\":\"" + pwd + "\"}"));
    }

    @Test
    void 성공_실패_없는아이디_로그아웃이_기록됨() throws Exception {
        kim();
        login("kim", "wrong").andExpect(status().isUnauthorized());
        login("ghost", "x").andExpect(status().isUnauthorized());
        Cookie s = login("kim", "Passw0rd!").andExpect(status().isOk()).andReturn().getResponse().getCookie("F3D_SESSION");
        mvc.perform(post("/api/auth/logout").cookie(s).with(csrf())).andExpect(status().isNoContent());

        List<String> rows = jdbc.queryForList("select username || ':' || result from login_history order by id", String.class);
        assertThat(rows).containsExactly("kim:FAIL", "ghost:FAIL", "kim:OK", "kim:LOGOUT");
        assertThat(jdbc.queryForObject("select user_agent from login_history where result = 'OK'", String.class))
                .isEqualTo("JUnit-Browser");
        assertThat(jdbc.queryForObject("select ip from login_history where result = 'OK'", String.class)).isNotBlank();
    }

    @Test
    void 관리자는_조건으로_조회() throws Exception {
        jdbc.update("insert into login_history (at, username, result, ip) values (now() - interval '3 day', 'kim', 'FAIL', '10.0.0.1')");
        jdbc.update("insert into login_history (at, username, result, ip) values (now(), 'kim', 'FAIL', '10.0.0.2')");
        jdbc.update("insert into login_history (at, username, result, ip) values (now(), 'kim', 'OK', '10.0.0.2')");
        jdbc.update("insert into login_history (at, username, result, ip) values (now(), 'lee', 'FAIL', '10.0.0.3')");
        var admin = user("admin").roles("ADMIN");

        mvc.perform(get("/api/admin/login-history").with(admin))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(4))
                .andExpect(jsonPath("$[0].username").value("lee")); // 최신순
        mvc.perform(get("/api/admin/login-history?username=kim&result=FAIL").with(admin))
                .andExpect(jsonPath("$.length()").value(2));
        String today = java.time.LocalDate.now(java.time.ZoneId.of("Asia/Seoul")).toString();
        mvc.perform(get("/api/admin/login-history?username=kim&result=FAIL&from=" + today + "&to=" + today).with(admin))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].ip").value("10.0.0.2"));
        mvc.perform(get("/api/admin/login-history?limit=1").with(admin)).andExpect(jsonPath("$.length()").value(1));
        mvc.perform(get("/api/admin/login-history?result=BAD").with(admin))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("결과는 OK, FAIL, LOCKED, LOGOUT 중 하나입니다."));
    }

    @Test
    void 운전원은_조회_불가() throws Exception {
        mvc.perform(get("/api/admin/login-history").with(user("o").roles("OPERATOR"))).andExpect(status().isForbidden());
    }
}
