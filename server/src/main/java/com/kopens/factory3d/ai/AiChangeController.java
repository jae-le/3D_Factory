package com.kopens.factory3d.ai;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

/** AI 제안 묶음 적용·취소 (운전원 이상 — SecurityConfig 기본 규칙. 공정 항목은 서비스가 관리자만 적용) */
@RestController
public class AiChangeController {
    private final ApplyService apply;

    public AiChangeController(ApplyService apply) {
        this.apply = apply;
    }

    @PostMapping("/api/ai/changes/{batchId}/apply")
    public ApplyService.Result apply(@PathVariable String batchId, Authentication auth) {
        return apply.apply(auth.getName(), isAdmin(auth), batchId);
    }

    @PostMapping("/api/ai/changes/{batchId}/discard")
    public ResponseEntity<Void> discard(@PathVariable String batchId, Authentication auth) {
        apply.discard(auth.getName(), batchId);
        return ResponseEntity.noContent().build();
    }

    static boolean isAdmin(Authentication auth) {
        return auth != null && auth.getAuthorities().stream().anyMatch(a -> "ROLE_ADMIN".equals(a.getAuthority()));
    }
}
