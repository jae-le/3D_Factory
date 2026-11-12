package com.kopens.factory3d.common;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.access.hierarchicalroles.RoleHierarchy;
import org.springframework.security.access.hierarchicalroles.RoleHierarchyImpl;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfException;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.session.web.http.CookieSerializer;
import org.springframework.session.web.http.DefaultCookieSerializer;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * 로그인·권한. 화면 파일은 누구나 받지만 /api 는 로그인 필수 (상태 확인·로그인 제외).
 * 역할: 관리자 ⊃ 운전원 ⊃ 조회. CSRF: 쿠키 XSRF-TOKEN 값을 요청 머리 X-XSRF-TOKEN 으로 (화면 API 호출 함수가 붙임).
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    PasswordEncoder passwordEncoder() {
        return PasswordEncoderFactories.createDelegatingPasswordEncoder(); // bcrypt
    }

    /** 세션 쿠키 — 자바스크립트가 못 읽게(HttpOnly), 다른 사이트에서 오는 요청엔 안 붙게(SameSite=Lax) */
    @Bean
    CookieSerializer cookieSerializer() {
        var c = new DefaultCookieSerializer();
        c.setCookieName("F3D_SESSION");
        c.setCookiePath("/");
        c.setUseHttpOnlyCookie(true);
        c.setSameSite("Lax");
        return c;
    }

    @Bean
    RoleHierarchy roleHierarchy() {
        return RoleHierarchyImpl.withDefaultRolePrefix()
                .role("ADMIN").implies("OPERATOR")
                .role("OPERATOR").implies("VIEWER")
                .build();
    }

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http.authorizeHttpRequests(a -> a
                        .requestMatchers("/api/health", "/api/auth/login").permitAll()
                        .requestMatchers("/api/auth/**").authenticated()
                        .requestMatchers("/api/users/**", "/api/audit/**", "/api/admin/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.PATCH, "/api/models/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.PUT, "/api/models/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.DELETE, "/api/models/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.PATCH, "/api/drawings/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.DELETE, "/api/drawings/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.GET, "/api/**").hasRole("VIEWER")
                        .requestMatchers("/api/**").hasRole("OPERATOR")
                        .requestMatchers("/v3/**", "/swagger-ui/**", "/swagger-ui.html").hasRole("ADMIN")
                        .anyRequest().permitAll())
                .csrf(c -> c.csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
                        .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler()))
                .addFilterAfter(new CsrfCookieFilter(), CsrfFilter.class)
                .exceptionHandling(e -> e
                        .authenticationEntryPoint((req, res, ex) -> problem(res, 401, "로그인 필요", "로그인이 필요합니다."))
                        .accessDeniedHandler((req, res, ex) -> problem(res, 403, "권한 없음", ex instanceof CsrfException
                                ? "요청이 만료되었습니다. 화면을 새로고침한 뒤 다시 시도하세요."
                                : "권한이 없습니다.")))
                .formLogin(f -> f.disable())
                .httpBasic(h -> h.disable())
                .logout(l -> l.disable())
                .requestCache(c -> c.disable());
        return http.build();
    }

    private static void problem(HttpServletResponse res, int status, String title, String detail) throws IOException {
        res.setStatus(status);
        res.setContentType("application/problem+json");
        res.setCharacterEncoding(StandardCharsets.UTF_8.name());
        res.getWriter().write("{\"type\":\"about:blank\",\"title\":\"" + title + "\",\"status\":" + status
                + ",\"detail\":\"" + detail + "\"}");
    }

    /** 응답마다 CSRF 토큰을 꺼내 쿠키(XSRF-TOKEN)가 항상 내려가게 */
    static final class CsrfCookieFilter extends OncePerRequestFilter {
        @Override
        protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
                throws ServletException, IOException {
            if (req.getAttribute(CsrfToken.class.getName()) instanceof CsrfToken token) token.getToken();
            chain.doFilter(req, res);
        }
    }
}
