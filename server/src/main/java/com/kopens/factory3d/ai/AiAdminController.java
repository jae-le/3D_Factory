package com.kopens.factory3d.ai;

import java.time.LocalDate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

/** 관리자 › Claude API 관리 (ADMIN — SecurityConfig 의 /api/admin/**) */
@RestController
@RequestMapping("/api/admin/ai")
public class AiAdminController {
    private static final Logger log = LoggerFactory.getLogger(AiAdminController.class);

    public record KeyBody(String apiKey) {}

    public record TestResult(boolean ok, String model, Long latencyMs, String message) {}

    private final AiSettingService settings;
    private final AiUsageService usage;
    private final ClaudeGateway gateway;

    public AiAdminController(AiSettingService settings, AiUsageService usage, ClaudeGateway gateway) {
        this.settings = settings;
        this.usage = usage;
        this.gateway = gateway;
    }

    @GetMapping("/usage")
    public AiUsageService.Report usage(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String group) {
        return usage.report(from, to, group, settings.view().monthlyLimitUsd());
    }

    /** 짧은 호출로 연결 확인 (사용량 purpose test). 실패도 200 + ok:false (원인 문구) */
    @PostMapping("/test")
    public TestResult test(Authentication auth) {
        AiSettingService.Active a = settings.requireKey();
        try {
            ClaudeGateway.Ping p = gateway.ping(a.apiKey(), a.model());
            var u = p.usage();
            usage.record(auth.getName(), null, u.model(), u.input(), u.output(), u.cacheRead(), u.cacheWrite(), "test");
            return new TestResult(true, p.model(), p.latencyMs(), null);
        } catch (AiCallException e) {
            log.warn("Claude 호출 실패 kind={} model={}", e.kind(), a.model(), e.getCause());
            return new TestResult(false, a.model(), null, e.getMessage());
        }
    }

    @GetMapping
    public AiSettingService.View view() {
        return settings.view();
    }

    @PutMapping
    public AiSettingService.View update(@RequestBody AiSettingService.Update body, Authentication auth) {
        return settings.update(body, auth.getName());
    }

    @PutMapping("/key")
    public AiSettingService.View setKey(@RequestBody KeyBody body, Authentication auth) {
        return settings.setKey(body.apiKey(), auth.getName());
    }

    @DeleteMapping("/key")
    public AiSettingService.View deleteKey(Authentication auth) {
        return settings.deleteKey(auth.getName());
    }
}
