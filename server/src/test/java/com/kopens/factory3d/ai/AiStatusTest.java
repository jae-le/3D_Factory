package com.kopens.factory3d.ai;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class AiStatusTest {
    @Test
    void 막는_이유는_마스터키_키_사용여부_한도_순() {
        assertThat(AiSettingService.reason(false, false, false, true)).isEqualTo("no-master-key");
        assertThat(AiSettingService.reason(true, false, true, true)).isEqualTo("no-key");
        assertThat(AiSettingService.reason(true, true, false, true)).isEqualTo("disabled");
        assertThat(AiSettingService.reason(true, true, true, true)).isEqualTo("over-limit");
        assertThat(AiSettingService.reason(true, true, true, false)).isNull();
    }

    @Test
    void 이유마다_한국어_안내() {
        assertThat(AiSettingService.reasonText("no-key")).isEqualTo("Claude API 키가 등록되지 않았습니다 (관리자 › Claude API 관리)");
        assertThat(AiSettingService.reasonText("over-limit")).isEqualTo("이번 달 AI 사용 한도를 넘었습니다");
        assertThat(AiSettingService.reasonText("disabled")).isEqualTo("AI 챗봇이 사용 중지되어 있습니다 (관리자 › Claude API 관리)");
        assertThat(AiSettingService.reasonText("no-master-key")).isEqualTo("서버에 F3D_AI_MASTER_KEY 가 설정되지 않았습니다");
    }
}
