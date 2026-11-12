package com.kopens.factory3d.user;

import com.kopens.factory3d.audit.AuditService;
import com.kopens.factory3d.auth.AppUser;
import com.kopens.factory3d.auth.PasswordPolicy;
import com.kopens.factory3d.auth.Role;
import com.kopens.factory3d.auth.UserMapper;
import com.kopens.factory3d.common.BadRequestException;
import com.kopens.factory3d.common.ConflictException;
import com.kopens.factory3d.common.NotFoundException;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 사용자 관리 (관리자). 사용 중지·역할 변경·비밀번호 초기화·삭제는 그 사용자의 세션을 모두 끊는다 */
@Service
public class UserService {
    private static final Pattern USERNAME = Pattern.compile("[a-z0-9._-]{3,32}");

    public record Created(AppUser user, String tempPassword) {}

    private final UserMapper users;
    private final PasswordEncoder encoder;
    private final AuditService audit;
    private final FindByIndexNameSessionRepository<?> sessions;

    public UserService(UserMapper users, PasswordEncoder encoder, AuditService audit,
            FindByIndexNameSessionRepository<?> sessions) {
        this.users = users;
        this.encoder = encoder;
        this.audit = audit;
        this.sessions = sessions;
    }

    public List<AppUser> list() {
        return users.findAll();
    }

    @Transactional
    public Created create(String username, String displayName, Role role) {
        String name = username == null ? "" : username.trim().toLowerCase();
        if (!USERNAME.matcher(name).matches())
            throw new BadRequestException("아이디는 영문 소문자·숫자·. _ - 로 3~32자여야 합니다.");
        if (displayName == null || displayName.isBlank()) throw new BadRequestException("이름을 입력하세요.");
        if (role == null) throw new BadRequestException("역할을 고르세요.");
        if (users.findByUsername(name) != null) throw new ConflictException("이미 있는 아이디입니다.");
        String temp = PasswordPolicy.temporary();
        users.insert(name, displayName.trim(), encoder.encode(temp), role);
        audit.log("USER_CREATE", name, "역할 " + role);
        return new Created(users.findByUsername(name), temp);
    }

    @Transactional
    public AppUser update(long id, String displayName, Role role, Boolean enabled, String actor) {
        AppUser u = get(id);
        String newName = displayName == null || displayName.isBlank() ? u.displayName() : displayName.trim();
        Role newRole = role == null ? u.role() : role;
        boolean newEnabled = enabled == null ? u.enabled() : enabled;
        if (u.username().equals(actor) && !newEnabled) throw new ConflictException("자기 자신은 사용 중지할 수 없습니다.");
        boolean losesAdmin = u.role() == Role.ADMIN && u.enabled() && (newRole != Role.ADMIN || !newEnabled);
        if (losesAdmin && users.countEnabledAdmins() <= 1)
            throw new ConflictException("마지막 관리자는 역할을 바꾸거나 사용 중지할 수 없습니다.");
        users.update(id, newName, newRole, newEnabled);
        List<String> changes = new ArrayList<>();
        if (!newName.equals(u.displayName())) changes.add("이름 " + u.displayName() + " → " + newName);
        if (newRole != u.role()) changes.add("역할 " + u.role() + " → " + newRole);
        if (newEnabled != u.enabled()) changes.add(newEnabled ? "사용" : "사용 중지");
        if (newRole != u.role() || !newEnabled) endSessions(u.username());
        if (!changes.isEmpty()) audit.log("USER_UPDATE", u.username(), String.join(", ", changes));
        return users.findById(id);
    }

    @Transactional
    public Created resetPassword(long id) {
        AppUser u = get(id);
        String temp = PasswordPolicy.temporary();
        users.setPassword(id, encoder.encode(temp), true);
        endSessions(u.username());
        audit.log("USER_RESET_PASSWORD", u.username(), null);
        return new Created(users.findById(id), temp);
    }

    /** 삭제: 자기 자신·마지막 관리자는 안 됨. 세션을 끊고 감사 기록(아이디는 글자로 남음)에 남김 */
    @Transactional
    public void delete(long id, String actor) {
        AppUser u = get(id);
        if (u.username().equals(actor)) throw new ConflictException("자기 자신은 삭제할 수 없습니다.");
        if (u.role() == Role.ADMIN && u.enabled() && users.countEnabledAdmins() <= 1)
            throw new ConflictException("마지막 관리자는 삭제할 수 없습니다.");
        endSessions(u.username());
        users.delete(id);
        audit.log("USER_DELETE", u.username(), u.displayName() + " (" + u.role() + ")");
    }

    private AppUser get(long id) {
        AppUser u = users.findById(id);
        if (u == null) throw new NotFoundException("사용자를 찾을 수 없습니다.");
        return u;
    }

    /** 그 사용자의 모든 로그인 세션 끊기 (다음 요청부터 401) */
    private void endSessions(String username) {
        sessions.findByPrincipalName(username).keySet().forEach(sessions::deleteById);
    }
}
