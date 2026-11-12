package com.kopens.factory3d.auth;

import com.kopens.factory3d.audit.AuditService;
import com.kopens.factory3d.common.UnauthorizedException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 로그인·로그아웃·내 정보·내 비밀번호 변경. 세션(쿠키 F3D_SESSION)은 DB 에 저장 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {
    public record LoginRequest(String username, String password) {}

    public record PasswordRequest(String current, String next) {}

    private final SecurityContextRepository contexts = new HttpSessionSecurityContextRepository();
    private final AuthService auth;
    private final UserMapper users;
    private final AuditService audit;

    public AuthController(AuthService auth, UserMapper users, AuditService audit) {
        this.auth = auth;
        this.users = users;
        this.audit = audit;
    }

    @PostMapping("/login")
    public UserView login(@RequestBody LoginRequest body, HttpServletRequest req, HttpServletResponse res) {
        AppUser u = auth.authenticate(body.username(), body.password());
        signIn(u, req, res);
        return UserView.from(u);
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(Authentication a, HttpServletRequest req, HttpServletResponse res) {
        if (a != null) audit.log("LOGOUT", a.getName(), null);
        new SecurityContextLogoutHandler().logout(req, res, a);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/me")
    public UserView me(Authentication a) {
        AppUser u = users.findById(principal(a).id());
        if (u == null || !u.enabled()) throw new UnauthorizedException("로그인이 필요합니다.");
        return UserView.from(u);
    }

    @PostMapping("/password")
    public UserView password(@RequestBody PasswordRequest body, Authentication a, HttpServletRequest req,
            HttpServletResponse res) {
        AppUser u = auth.changePassword(principal(a).id(), body.current(), body.next());
        signIn(u, req, res); // 새 권한(역할)으로 세션 갱신
        return UserView.from(u);
    }

    private static F3dUser principal(Authentication a) {
        if (a != null && a.getPrincipal() instanceof F3dUser t) return t;
        throw new UnauthorizedException("로그인이 필요합니다.");
    }

    /** 세션 고정 공격을 막으려고 세션 id 를 바꾼 뒤 로그인 정보를 세션에 저장 */
    private void signIn(AppUser u, HttpServletRequest req, HttpServletResponse res) {
        if (req.getSession(false) != null) req.changeSessionId();
        else req.getSession(true);
        var principal = new F3dUser(u.id(), u.username(), u.displayName(), u.role());
        var token = UsernamePasswordAuthenticationToken.authenticated(principal, null, AuthService.authorities(u));
        SecurityContext ctx = SecurityContextHolder.createEmptyContext();
        ctx.setAuthentication(token);
        SecurityContextHolder.setContext(ctx);
        contexts.saveContext(ctx, req, res);
    }
}
