package com.kopens.factory3d.ai;

import java.util.List;
import java.util.function.Consumer;

/** Claude 호출 경계. 실제(AnthropicGateway) / 가짜(FakeGateway, 테스트·화면 확인). 이 밖의 코드는 SDK 타입을 모른다 */
public interface ClaudeGateway {
    record ToolSpec(String name, String description, String inputSchemaJson) {}

    record Call(String apiKey, String model, String system, List<ToolSpec> tools, long maxTokens) {}

    record ToolCall(String id, String name, String inputJson) {}

    record ToolResult(String toolUseId, String content, boolean isError) {}

    record Usage(String model, long input, long output, long cacheRead, long cacheWrite) {}

    enum Stop { END, TOOL_USE, MAX_TOKENS, REFUSAL, OTHER }

    /** 한 번의 응답. stop == REFUSAL 이면 refusal 에 사유, toolCalls 는 비어 있음 */
    record Turn(Stop stop, List<ToolCall> toolCalls, String text, String refusal, Usage usage) {}

    record Ping(String model, long latencyMs, Usage usage) {}

    Transcript newTranscript();

    /** 지금까지의 대화로 한 번 부름. 글자 조각은 onText 로 흘리고, 응답 content 는 t 에 그대로 붙인다 */
    Turn next(Call call, Transcript t, Consumer<String> onText);

    /** 연결 테스트 (짧은 호출) */
    Ping ping(String apiKey, String model);

    record ModelOption(String id, String label) {}

    /** 이 키로 쓸 수 있는 Gemini 모델 (글 생성 가능한 것만). Gemini 를 모르는 게이트웨이는 빈 목록 */
    default java.util.List<ModelOption> geminiModels(String apiKey) {
        return java.util.List.of();
    }
}
