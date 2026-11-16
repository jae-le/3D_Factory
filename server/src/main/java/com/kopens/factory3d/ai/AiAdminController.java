package com.kopens.factory3d.ai;

import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

/** 관리자 › Claude API 관리 (ADMIN — SecurityConfig 의 /api/admin/**) */
@RestController
@RequestMapping("/api/admin/ai")
public class AiAdminController {
    public record KeyBody(String apiKey) {}

    private final AiSettingService settings;

    public AiAdminController(AiSettingService settings) {
        this.settings = settings;
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
