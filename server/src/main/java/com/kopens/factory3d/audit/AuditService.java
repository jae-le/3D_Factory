package com.kopens.factory3d.audit;

import java.util.List;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/** 감사 기록 남기기. 누가 = 지금 로그인한 사람(없으면 지정), IP = 지금 요청 */
@Service
public class AuditService {
    private final AuditMapper mapper;

    public AuditService(AuditMapper mapper) {
        this.mapper = mapper;
    }

    public void log(String action, String target, String detail) {
        Authentication a = SecurityContextHolder.getContext().getAuthentication();
        logAs(a == null || !a.isAuthenticated() ? null : a.getName(), action, target, detail);
    }

    public void logAs(String username, String action, String target, String detail) {
        mapper.insert(username, action, target, detail, clientIp());
    }

    public List<AuditEntry> recent(int limit) {
        return mapper.findRecent(Math.max(1, Math.min(limit, 1000)));
    }

    private static String clientIp() {
        return RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes r
                ? r.getRequest().getRemoteAddr()
                : null;
    }
}
