package com.kopens.factory3d.ai;

import static org.assertj.core.api.Assertions.assertThat;

import com.anthropic.core.ObjectMappers;
import com.anthropic.models.beta.AnthropicBeta;
import com.anthropic.models.beta.messages.BetaMessage;
import com.anthropic.models.beta.messages.MessageCreateParams;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kopens.factory3d.ai.ClaudeGateway.*;
import java.util.List;
import org.junit.jupiter.api.Test;

class AnthropicGatewayTest {
    static final ObjectMapper SDK = ObjectMappers.jsonMapper(); // SDK 의 Jackson 2 — 이 테스트와 AnthropicGateway 안에서만
    static final ToolSpec TOOL = new ToolSpec("move_object", "옮김",
            "{\"type\":\"object\",\"properties\":{\"name\":{\"type\":\"string\"},\"dx\":{\"type\":\"number\"}},"
                    + "\"required\":[\"name\"],\"additionalProperties\":false}");

    static Call call(String model) {
        return new Call("k", model, "시스템 프롬프트", List.of(TOOL), 16000);
    }

    static String body(MessageCreateParams p) throws Exception {
        return SDK.writeValueAsString(p._body());
    }

    @Test
    void 요청은_strict_도구_medium_캐시_auto_fallback_생각_없음() throws Exception {
        MessageCreateParams p = AnthropicGateway.params(call("claude-opus-5-5"), List.of());
        String j = body(p);
        assertThat(j).contains("\"model\":\"claude-opus-5-5\"", "\"strict\":true", "\"additionalProperties\":false",
                "\"effort\":\"medium\"", "\"cache_control\"", "\"fallbacks\":\"default\"", "\"tool_choice\":{\"type\":\"auto\"}",
                "\"max_tokens\":16000", "시스템 프롬프트");
        assertThat(j).doesNotContain("\"thinking\"", "budget_tokens", "temperature", "top_p");
        assertThat(p.betas().orElse(List.of())).contains(AnthropicBeta.SERVER_SIDE_FALLBACK_2026_07_01);
    }

    @Test
    void Haiku_는_서버측_fallback_을_보내지_않음() throws Exception {
        MessageCreateParams p = AnthropicGateway.params(call("claude-haiku-5-5"), List.of());
        assertThat(body(p)).doesNotContain("fallbacks");
        assertThat(p.betas().orElse(List.of())).doesNotContain(AnthropicBeta.SERVER_SIDE_FALLBACK_2026_07_01);
    }

    @Test
    void 도구_호출_응답_읽기와_그대로_붙이기() throws Exception {
        BetaMessage m = SDK.readValue("""
                {"id":"msg_1","type":"message","role":"assistant","model":"claude-opus-5-5","stop_reason":"tool_use",
                 "stop_sequence":null,
                 "content":[{"type":"thinking","thinking":"","signature":"sig"},{"type":"text","text":"장면을 볼게요"},
                            {"type":"tool_use","id":"tu_1","name":"get_scene","input":{}}],
                 "usage":{"input_tokens":100,"output_tokens":20,"cache_read_input_tokens":50,"cache_creation_input_tokens":10}}
                """, BetaMessage.class);
        Turn t = AnthropicGateway.read(m);
        assertThat(t.stop()).isEqualTo(Stop.TOOL_USE);
        assertThat(t.text()).isEqualTo("장면을 볼게요");
        assertThat(t.toolCalls()).containsExactly(new ToolCall("tu_1", "get_scene", "{}"));
        assertThat(t.usage()).isEqualTo(new Usage("claude-opus-5-5", 100, 20, 50, 10));
        assertThat(AnthropicGateway.replayBlocks(m.content())).hasSize(3); // 생각 블록까지 그대로
    }

    @Test
    void 거절은_content_보다_먼저() throws Exception {
        BetaMessage m = SDK.readValue("""
                {"id":"msg_2","type":"message","role":"assistant","model":"claude-opus-5-5","stop_reason":"refusal",
                 "stop_sequence":null,"stop_details":{"type":"refusal","category":"cyber","explanation":"정책상 처리할 수 없음"},
                 "content":[{"type":"text","text":"부분"}],
                 "usage":{"input_tokens":5,"output_tokens":1}}
                """, BetaMessage.class);
        Turn t = AnthropicGateway.read(m);
        assertThat(t.stop()).isEqualTo(Stop.REFUSAL);
        assertThat(t.refusal()).isEqualTo("정책상 처리할 수 없음");
        assertThat(t.toolCalls()).isEmpty();
    }

    @Test
    void 중간_fallback_이면_앞_모델의_생각과_도구_호출은_빼고_붙임() throws Exception {
        BetaMessage m = SDK.readValue("""
                {"id":"msg_3","type":"message","role":"assistant","model":"claude-opus-4-8","stop_reason":"tool_use",
                 "stop_sequence":null,
                 "content":[{"type":"thinking","thinking":"","signature":"s1"},
                            {"type":"tool_use","id":"tu_old","name":"get_scene","input":{}},
                            {"type":"fallback","from":{"model":"claude-opus-5-5"},"to":{"model":"claude-opus-4-8"}},
                            {"type":"text","text":"이어서"},
                            {"type":"tool_use","id":"tu_new","name":"get_scene","input":{}}],
                 "usage":{"input_tokens":5,"output_tokens":1}}
                """, BetaMessage.class);
        Turn t = AnthropicGateway.read(m);
        assertThat(t.toolCalls()).extracting(ToolCall::id).containsExactly("tu_new");
        assertThat(t.usage().model()).isEqualTo("claude-opus-4-8");
        assertThat(AnthropicGateway.replayBlocks(m.content())).hasSize(3); // fallback · text · tu_new
    }

    @Test
    void 오류_종류별_한국어() {
        assertThat(new AiCallException(AiCallException.Kind.KEY, null).getMessage()).isEqualTo("API 키가 올바르지 않습니다");
        assertThat(new AiCallException(AiCallException.Kind.NETWORK, null).getMessage()).isEqualTo("Claude 서버에 연결하지 못했습니다");
        assertThat(new AiCallException(AiCallException.Kind.OTHER, "HTTP 400", null).getMessage())
                .isEqualTo("Claude 호출에 실패했습니다 (HTTP 400)");
    }

    @Test
    void 빈_응답은_assistant_메시지로_붙이지_않음() throws Exception {
        BetaMessage m = SDK.readValue("""
                {"id":"msg_4","type":"message","role":"assistant","model":"claude-opus-5-5","stop_reason":"refusal",
                 "stop_sequence":null,"stop_details":{"type":"refusal","category":"cyber","explanation":"x"},
                 "content":[],"usage":{"input_tokens":5,"output_tokens":0}}
                """, BetaMessage.class);
        assertThat(AnthropicGateway.replayBlocks(m)).isEmpty();
        AnthropicGateway.SdkTranscript tr = new AnthropicGateway.SdkTranscript();
        tr.addUserText("안녕");
        AnthropicGateway.append(tr, m);
        assertThat(tr.messages()).isEqualTo(1);
    }

    @Test
    void max_tokens_로_끊긴_도구_호출은_무시하고_붙이지_않음() throws Exception {
        BetaMessage m = SDK.readValue("""
                {"id":"msg_5","type":"message","role":"assistant","model":"claude-opus-5-5","stop_reason":"max_tokens",
                 "stop_sequence":null,
                 "content":[{"type":"text","text":"음"},{"type":"tool_use","id":"tu_cut","name":"get_scene","input":{}}],
                 "usage":{"input_tokens":5,"output_tokens":1}}
                """, BetaMessage.class);
        Turn t = AnthropicGateway.read(m);
        assertThat(t.stop()).isEqualTo(Stop.MAX_TOKENS);
        assertThat(t.toolCalls()).isEmpty();
        assertThat(AnthropicGateway.replayBlocks(m)).hasSize(1);
        AnthropicGateway.SdkTranscript tr = new AnthropicGateway.SdkTranscript();
        tr.addUserText("안녕");
        AnthropicGateway.append(tr, m);
        assertThat(tr.messages()).isEqualTo(2);
    }
}
