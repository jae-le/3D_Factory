package com.kopens.factory3d.ai;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.time.LocalDate;
import java.time.ZoneId;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

class AiUsageApiTest extends AiTestBase {
    static final RequestPostProcessor KIM = user("kim").roles("OPERATOR");
    static final RequestPostProcessor ADMIN = user("admin").roles("ADMIN");

    void usageAt(String user, LocalDate day, long input, String cost) {
        jdbc.update("insert into ai_usage (at, username, model, input_tokens, output_tokens, cost_usd, purpose) "
                + "values ((cast(? as date) + time '12:00') at time zone 'Asia/Seoul', ?, 'claude-opus-5-5', ?, 10, cast(? as numeric), 'chat')",
                day.toString(), user, input, cost);
    }

    @Test
    void 일별_사용자별_이번_달_합계() throws Exception {
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Seoul"));
        LocalDate first = today.withDayOfMonth(1);
        usageAt("kim", first, 1000, "0.5");
        usageAt("lee", first, 2000, "1.0");
        usageAt("kim", today, 3000, "1.5");
        usageAt("kim", first.minusDays(1), 9999, "9"); // 지난달
        String d0 = first.toString(), d1 = today.toString();
        mvc.perform(get("/api/admin/ai/usage").with(ADMIN)).andExpect(status().isOk())
                .andExpect(jsonPath("$.group").value("day"))
                .andExpect(jsonPath("$.from").value(d0))
                .andExpect(jsonPath("$.month.calls").value(3))
                .andExpect(jsonPath("$.month.costUsd").value(3.0))
                .andExpect(jsonPath("$.limitUsd").value(50.0))
                .andExpect(jsonPath("$.rows[0].key").value(d1)) // 최근 날짜 먼저
                .andExpect(jsonPath("$.rows[-1].key").value(d0));
        mvc.perform(get("/api/admin/ai/usage?group=user&from=" + d0 + "&to=" + d1).with(ADMIN))
                .andExpect(jsonPath("$.rows.length()").value(2))
                .andExpect(jsonPath("$.rows[0].key").value("kim"))
                .andExpect(jsonPath("$.rows[0].inputTokens").value(4000)) // 비용 큰 사용자 먼저
                .andExpect(jsonPath("$.rows[0].calls").value(2));
        mvc.perform(get("/api/admin/ai/usage?group=model").with(ADMIN)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("group 은 day 또는 user 입니다."));
        mvc.perform(get("/api/admin/ai/usage?from=2026-11-10&to=2026-11-01").with(ADMIN)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("기간이 올바르지 않습니다."));
        mvc.perform(get("/api/admin/ai/usage").with(KIM)).andExpect(status().isForbidden());
    }

    @Test
    void 연결_테스트() throws Exception {
        mvc.perform(post("/api/admin/ai/test").with(ADMIN).with(csrf())).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Claude API 키가 등록되지 않았습니다."));
        enableAi();
        mvc.perform(post("/api/admin/ai/test").with(ADMIN).with(csrf())).andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true))
                .andExpect(jsonPath("$.model").value("claude-opus-5-5"))
                .andExpect(jsonPath("$.latencyMs").isNumber());
        mvc.perform(put("/api/admin/ai/key").contentType(MediaType.APPLICATION_JSON)
                .content("{\"apiKey\":\"sk-ant-invalid-key-000000000000\"}").with(ADMIN).with(csrf())).andExpect(status().isOk());
        mvc.perform(post("/api/admin/ai/test").with(ADMIN).with(csrf())).andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(false))
                .andExpect(jsonPath("$.message").value("API 키가 올바르지 않습니다"));
        mvc.perform(get("/api/admin/ai/usage").with(ADMIN)).andExpect(jsonPath("$.month.calls").value(1)); // 성공한 테스트 1번만
    }
}
