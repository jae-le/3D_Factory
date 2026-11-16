package com.kopens.factory3d.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.kopens.factory3d.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

class AiSettingApiTest extends IntegrationTest {
    static final RequestPostProcessor VIEWER = user("viewer").roles("VIEWER");
    static final RequestPostProcessor OPERATOR = user("kim").roles("OPERATOR");
    static final RequestPostProcessor ADMIN = user("admin").roles("ADMIN");
    static final String KEY = "sk-ant-api03-test-key-00000000abcd";

    @Autowired AiUsageService usage;

    private ResultActions putJson(String url, String body, RequestPostProcessor who) throws Exception {
        return mvc.perform(put(url).contentType(MediaType.APPLICATION_JSON).content(body).with(who).with(csrf()));
    }

    @Test
    void 처음에는_키_없음과_기본값() throws Exception {
        mvc.perform(get("/api/ai/status").with(VIEWER)).andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(false)).andExpect(jsonPath("$.reason").value("no-key"));
        mvc.perform(get("/api/admin/ai").with(ADMIN)).andExpect(status().isOk())
                .andExpect(jsonPath("$.hasKey").value(false))
                .andExpect(jsonPath("$.model").value("claude-opus-5-5"))
                .andExpect(jsonPath("$.monthlyLimitUsd").value(50.0))
                .andExpect(jsonPath("$.enabled").value(false))
                .andExpect(jsonPath("$.masterKey").value(true));
    }

    @Test
    void 마스터_키가_바뀌어_못_풀면_400_안내() throws Exception {
        putJson("/api/admin/ai/key", "{\"apiKey\":\"" + KEY + "\"}", ADMIN).andExpect(status().isOk());
        jdbc.update("update ai_setting set api_key_enc = decode('00112233445566778899aabbccddeeff0011', 'hex')");
        mvc.perform(post("/api/admin/ai/test").with(ADMIN).with(csrf())).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("저장된 API 키를 풀지 못했습니다. 마스터 키가 바뀌었다면 키를 다시 등록하세요."));
    }

    @Test
    void 키는_암호화해_저장하고_힌트만_보임() throws Exception {
        putJson("/api/admin/ai/key", "{\"apiKey\":\"short\"}", ADMIN).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("API 키 형식이 올바르지 않습니다."));
        putJson("/api/admin/ai/key", "{\"apiKey\":\"" + KEY + "\"}", ADMIN).andExpect(status().isOk())
                .andExpect(jsonPath("$.hasKey").value(true))
                .andExpect(jsonPath("$.keyHint").value("sk-ant-…abcd"))
                .andExpect(content().string(not(containsString(KEY))));
        byte[] enc = jdbc.queryForObject("select api_key_enc from ai_setting where id = 1", byte[].class);
        assertThat(new String(enc)).doesNotContain(KEY);
        mvc.perform(get("/api/ai/status").with(VIEWER)).andExpect(jsonPath("$.reason").value("disabled"));
        putJson("/api/admin/ai", "{\"enabled\":true}", ADMIN).andExpect(status().isOk()).andExpect(jsonPath("$.enabled").value(true));
        mvc.perform(get("/api/ai/status").with(VIEWER))
                .andExpect(jsonPath("$.enabled").value(true)).andExpect(jsonPath("$.reason").isEmpty());
        mvc.perform(get("/api/admin/ai").with(ADMIN)).andExpect(content().string(not(containsString(KEY))));
        assertThat(jdbc.queryForObject("select count(*) from audit_log where action = 'AI_KEY_SET'", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from audit_log where action = 'AI_SETTING'", Integer.class)).isEqualTo(1);
    }

    @Test
    void 모델과_한도_검사() throws Exception {
        putJson("/api/admin/ai", "{\"model\":\"claude-opus-4-8\"}", ADMIN).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("모델은 claude-opus-5-5, claude-sonnet-5-5, claude-haiku-5-5 중 하나입니다."));
        putJson("/api/admin/ai", "{\"monthlyLimitUsd\":-1}", ADMIN).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("월 한도는 0 이상 USD 로 입력하세요."));
        putJson("/api/admin/ai", "{\"model\":\"claude-sonnet-5-5\",\"monthlyLimitUsd\":12.5}", ADMIN).andExpect(status().isOk())
                .andExpect(jsonPath("$.model").value("claude-sonnet-5-5"))
                .andExpect(jsonPath("$.monthlyLimitUsd").value(12.5))
                .andExpect(jsonPath("$.updatedBy").value("admin"));
    }

    @Test
    void 키_삭제() throws Exception {
        putJson("/api/admin/ai/key", "{\"apiKey\":\"" + KEY + "\"}", ADMIN).andExpect(status().isOk());
        mvc.perform(delete("/api/admin/ai/key").with(ADMIN).with(csrf())).andExpect(status().isOk())
                .andExpect(jsonPath("$.hasKey").value(false)).andExpect(jsonPath("$.keyHint").isEmpty());
        mvc.perform(get("/api/ai/status").with(VIEWER)).andExpect(jsonPath("$.reason").value("no-key"));
        assertThat(jdbc.queryForObject("select count(*) from audit_log where action = 'AI_KEY_DELETE'", Integer.class)).isEqualTo(1);
    }

    @Test
    void 관리자만_설정_조회는_누구나() throws Exception {
        mvc.perform(get("/api/admin/ai").with(OPERATOR)).andExpect(status().isForbidden());
        putJson("/api/admin/ai/key", "{\"apiKey\":\"" + KEY + "\"}", OPERATOR).andExpect(status().isForbidden());
        mvc.perform(get("/api/ai/status").with(VIEWER)).andExpect(status().isOk());
    }

    @Test
    void 이번_달_한도를_넘으면_막음() throws Exception {
        putJson("/api/admin/ai/key", "{\"apiKey\":\"" + KEY + "\"}", ADMIN);
        putJson("/api/admin/ai", "{\"enabled\":true,\"monthlyLimitUsd\":1}", ADMIN);
        usage.record("kim", null, "claude-opus-5-5", 100_000, 10_000, 0, 0, "chat"); // 0.6 USD
        mvc.perform(get("/api/ai/status").with(VIEWER)).andExpect(jsonPath("$.enabled").value(true));
        usage.record("kim", null, "claude-opus-5-5", 100_000, 10_000, 0, 0, "chat"); // 합계 1.2 USD
        mvc.perform(get("/api/ai/status").with(VIEWER))
                .andExpect(jsonPath("$.enabled").value(false)).andExpect(jsonPath("$.reason").value("over-limit"));
        assertThat(jdbc.queryForObject("select sum(cost_usd) from ai_usage", java.math.BigDecimal.class)).isEqualByComparingTo("1.2");
    }
}
