package com.kopens.factory3d.audit;

import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 감사 기록 조회 (관리자 — SecurityConfig) */
@RestController
public class AuditController {
    private final AuditService audit;

    public AuditController(AuditService audit) {
        this.audit = audit;
    }

    @GetMapping("/api/audit")
    public List<AuditEntry> recent(@RequestParam(defaultValue = "200") int limit) {
        return audit.recent(limit);
    }
}
