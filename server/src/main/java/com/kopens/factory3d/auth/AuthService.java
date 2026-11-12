package com.kopens.factory3d.auth;

import com.kopens.factory3d.audit.AuditService;
import com.kopens.factory3d.common.BadRequestException;
import com.kopens.factory3d.common.LockedException;
import com.kopens.factory3d.common.NotFoundException;
import com.kopens.factory3d.common.UnauthorizedException;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Collection;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

/** 로그인 확인(5번 틀리면 10분 잠금)과 내 비밀번호 변경 */
@Service
public class AuthService {
    static final int MAX_FAIL = 5;
    static final Duration LOCK = Duration.ofMinutes(10);
    static final String BAD_LOGIN = "아이디 또는 비밀번호가 틀렸습니다.";

    private final UserMapper users;
    private final PasswordEncoder encoder;
    private final AuditService audit;
    private final ZoneId zone;
    private final String dummyHash; // 없는 아이디도 비밀번호 확인 시간을 같게

    public AuthService(UserMapper users, PasswordEncoder encoder, AuditService audit,
            @Value("${factory3d.time-zone:Asia/Seoul}") String zone) {
        this.users = users;
        this.encoder = encoder;
        this.audit = audit;
        this.zone = ZoneId.of(zone);
        this.dummyHash = encoder.encode("not-a-real-password-1");
    }

    public AppUser authenticate(String username, String password) {
        String name = username == null ? "" : username.trim().toLowerCase();
        String pwd = password == null ? "" : password;
        AppUser u = users.findByUsername(name);
        if (u == null) {
            encoder.matches(pwd, dummyHash);
            audit.logAs(name, "LOGIN_FAIL", name, "없는 아이디");
            throw new UnauthorizedException(BAD_LOGIN);
        }
        OffsetDateTime now = OffsetDateTime.now();
        if (u.lockedAt(now)) {
            audit.logAs(name, "LOGIN_LOCKED", name, "잠긴 동안 시도");
            throw new LockedException(lockedMessage(u.lockedUntil()));
        }
        if (!encoder.matches(pwd, u.passwordHash())) {
            int failed = u.failedCount() + 1;
            OffsetDateTime until = failed >= MAX_FAIL ? now.plus(LOCK) : null;
            users.loginFailed(u.id(), until == null ? failed : 0, until);
            audit.logAs(name, until == null ? "LOGIN_FAIL" : "LOGIN_LOCKED", name, failed + "번째 실패");
            if (until != null) throw new LockedException(lockedMessage(until));
            throw new UnauthorizedException(BAD_LOGIN);
        }
        if (!u.enabled()) {
            audit.logAs(name, "LOGIN_FAIL", name, "사용 중지된 계정");
            throw new UnauthorizedException("사용이 중지된 계정입니다. 관리자에게 문의하세요.");
        }
        users.loginOk(u.id());
        audit.logAs(name, "LOGIN_OK", name, null);
        return users.findById(u.id());
    }

    public AppUser changePassword(long userId, String current, String next) {
        AppUser u = users.findById(userId);
        if (u == null) throw new NotFoundException("사용자를 찾을 수 없습니다.");
        if (current == null || !encoder.matches(current, u.passwordHash()))
            throw new BadRequestException("현재 비밀번호가 틀렸습니다.");
        if (current.equals(next)) throw new BadRequestException("새 비밀번호가 지금 비밀번호와 같습니다.");
        PasswordPolicy.check(u.username(), next);
        users.setPassword(u.id(), encoder.encode(next), false);
        audit.log("PASSWORD_CHANGE", u.username(), null);
        return users.findById(u.id());
    }

    /** 비밀번호 변경이 필요하면 역할 권한 없이 변경 권한만 */
    public static Collection<GrantedAuthority> authorities(AppUser u) {
        return List.of(new SimpleGrantedAuthority(u.mustChangePassword() ? Role.PASSWORD_CHANGE : "ROLE_" + u.role()));
    }

    private String lockedMessage(OffsetDateTime until) {
        String at = until.atZoneSameInstant(zone).format(DateTimeFormatter.ofPattern("HH:mm"));
        return "로그인을 " + MAX_FAIL + "번 틀려 잠겼습니다. " + at + " 이후 다시 시도하세요.";
    }
}
