package com.kopens.factory3d.ai;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** 챗봇 사용 가능 여부 (조회 이상 — 레일 버튼 켜기·끄기) */
@RestController
public class AiStatusController {
    private final AiSettingService settings;

    public AiStatusController(AiSettingService settings) {
        this.settings = settings;
    }

    @GetMapping("/api/ai/status")
    public AiSettingService.Status status() {
        return settings.status();
    }
}
