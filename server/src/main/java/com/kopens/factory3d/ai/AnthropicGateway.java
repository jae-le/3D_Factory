package com.kopens.factory3d.ai;

import com.anthropic.client.AnthropicClient;
import com.anthropic.client.okhttp.AnthropicOkHttpClient;
import com.anthropic.core.JsonValue;
import com.anthropic.core.ObjectMappers;
import com.anthropic.core.http.StreamResponse;
import com.anthropic.errors.AnthropicIoException;
import com.anthropic.errors.AnthropicRetryableException;
import com.anthropic.errors.AnthropicServiceException;
import com.anthropic.errors.InternalServerException;
import com.anthropic.errors.PermissionDeniedException;
import com.anthropic.errors.RateLimitException;
import com.anthropic.errors.SseException;
import com.anthropic.errors.UnauthorizedException;
import com.anthropic.helpers.BetaMessageAccumulator;
import com.anthropic.models.beta.AnthropicBeta;
import com.anthropic.models.beta.messages.BetaCacheControlEphemeral;
import com.anthropic.models.beta.messages.BetaContentBlock;
import com.anthropic.models.beta.messages.BetaContentBlockParam;
import com.anthropic.models.beta.messages.BetaMessage;
import com.anthropic.models.beta.messages.BetaMessageParam;
import com.anthropic.models.beta.messages.BetaOutputConfig;
import com.anthropic.models.beta.messages.BetaRawMessageStreamEvent;
import com.anthropic.models.beta.messages.BetaStopReason;
import com.anthropic.models.beta.messages.BetaTextBlockParam;
import com.anthropic.models.beta.messages.BetaTool;
import com.anthropic.models.beta.messages.BetaToolChoiceAuto;
import com.anthropic.models.beta.messages.BetaToolResultBlockParam;
import com.anthropic.models.beta.messages.BetaUsage;
import com.anthropic.models.beta.messages.MessageCreateParams;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

/**
 * 실제 Claude 호출 (공식 Java SDK · 베타 메시지 엔드포인트 · 스트리밍). SDK 의 Jackson 2 는 이 클래스 안에서만.
 * 규칙: thinking 안 보냄(Opus 5.5 = 적응형) · effort medium · tool_choice auto · 도구 strict · 시스템 1블록 캐시 ·
 * Haiku 가 아니면 server-side fallback("default") · 거절은 content 보다 먼저 · 응답 content 는 그대로 다음 요청에.
 */
public class AnthropicGateway implements ClaudeGateway {
    private static final ObjectMapper SDK_JSON = ObjectMappers.jsonMapper();

    private String clientKey;
    private AnthropicClient client;

    static final class SdkTranscript implements Transcript {
        final List<BetaMessageParam> messages = new ArrayList<>();

        public void addUserText(String text) {
            messages.add(BetaMessageParam.ofUser(text));
        }

        public void addToolResults(List<ToolResult> results) {
            List<BetaContentBlockParam> blocks = results.stream()
                    .map(r -> BetaContentBlockParam.ofToolResult(BetaToolResultBlockParam.builder()
                            .toolUseId(r.toolUseId()).content(r.content()).isError(r.isError()).build()))
                    .toList();
            messages.add(BetaMessageParam.ofUserOfContentBlockParams(blocks));
        }

        public int messages() {
            return messages.size();
        }

        public void truncate(int n) {
            while (messages.size() > n) messages.removeLast();
        }
    }

    @Override
    public Transcript newTranscript() {
        return new SdkTranscript();
    }

    @Override
    public Turn next(Call call, Transcript t, Consumer<String> onText) {
        SdkTranscript tr = (SdkTranscript) t;
        MessageCreateParams params = params(call, tr.messages);
        BetaMessageAccumulator acc = BetaMessageAccumulator.create();
        Turn turn;
        try (StreamResponse<BetaRawMessageStreamEvent> s = client(call.apiKey()).beta().messages().createStreaming(params)) {
            s.stream().peek(acc::accumulate)
                    .flatMap(e -> e.contentBlockDelta().stream())
                    .flatMap(d -> d.delta().text().stream())
                    .forEach(d -> onText.accept(d.text()));
            BetaMessage msg = acc.message(); // 끊긴 스트림이면 여기서 예외 → 아래에서 번역
            turn = read(msg);
            append(tr, msg);
        } catch (RuntimeException e) {
            throw translate(e);
        }
        return turn;
    }

    @Override
    public Ping ping(String apiKey, String model) {
        MessageCreateParams p = MessageCreateParams.builder().model(model).maxTokens(256L)
                .outputConfig(BetaOutputConfig.builder().effort(BetaOutputConfig.Effort.LOW).build())
                .addUserMessage("연결 확인입니다. '확인' 이라고만 답하세요.").build();
        long t0 = System.nanoTime();
        try {
            BetaMessage m = client(apiKey).beta().messages().create(p);
            return new Ping(m.model().asString(), (System.nanoTime() - t0) / 1_000_000, usageOf(m));
        } catch (RuntimeException e) {
            throw translate(e);
        }
    }

    private synchronized AnthropicClient client(String apiKey) {
        if (client == null || !apiKey.equals(clientKey)) {
            if (client != null) client.close();
            client = AnthropicOkHttpClient.builder().apiKey(apiKey).maxRetries(2).timeout(Duration.ofMinutes(10)).build();
            clientKey = apiKey;
        }
        return client;
    }

    static MessageCreateParams params(Call call, List<BetaMessageParam> messages) {
        MessageCreateParams.Builder b = MessageCreateParams.builder()
                .model(call.model())
                .maxTokens(call.maxTokens())
                .outputConfig(BetaOutputConfig.builder().effort(BetaOutputConfig.Effort.MEDIUM).build())
                .systemOfBetaTextBlockParams(List.of(BetaTextBlockParam.builder().text(call.system())
                        .cacheControl(BetaCacheControlEphemeral.builder().ttl(BetaCacheControlEphemeral.Ttl.TTL_5M).build())
                        .build()))
                .toolChoice(BetaToolChoiceAuto.builder().build())
                .messages(messages);
        for (ToolSpec s : call.tools()) b.addTool(tool(s));
        if (hasServerFallback(call.model())) b.addBeta(AnthropicBeta.SERVER_SIDE_FALLBACK_2026_07_01).fallbacksDefault();
        return b.build();
    }

    /** Haiku 5.5 는 서버측 fallback 이 없음 (보내면 400) */
    static boolean hasServerFallback(String model) {
        return !model.startsWith("claude-haiku");
    }

    @SuppressWarnings("unchecked")
    static BetaTool tool(ToolSpec s) {
        Map<String, Object> schema;
        try {
            schema = SDK_JSON.readValue(s.inputSchemaJson(), Map.class);
        } catch (Exception e) {
            throw new IllegalStateException("도구 스키마가 올바르지 않습니다: " + s.name(), e);
        }
        var props = BetaTool.InputSchema.Properties.builder();
        ((Map<String, Object>) schema.getOrDefault("properties", Map.of())).forEach((k, v) -> props.putAdditionalProperty(k, JsonValue.from(v)));
        var in = BetaTool.InputSchema.builder().properties(props.build())
                .putAdditionalProperty("additionalProperties", JsonValue.from(false));
        if (schema.get("required") instanceof List<?> req) in.required(req.stream().map(String::valueOf).toList());
        return BetaTool.builder().name(s.name()).description(s.description()).inputSchema(in.build()).strict(true).build();
    }

    static Turn read(BetaMessage msg) {
        Usage usage = usageOf(msg);
        BetaStopReason stop = msg.stopReason().orElse(null);
        if (BetaStopReason.REFUSAL.equals(stop)) return new Turn(Stop.REFUSAL, List.of(), "", refusalReason(msg), usage);
        List<BetaContentBlock> content = msg.content();
        int from = lastFallback(content) + 1; // fallback 뒤 블록만 이번 답
        boolean toolStop = BetaStopReason.TOOL_USE.equals(stop); // 다른 이유로 멈췄으면 (끊긴) 도구 호출은 무시
        StringBuilder text = new StringBuilder();
        List<ToolCall> calls = new ArrayList<>();
        for (BetaContentBlock b : content.subList(from, content.size())) {
            b.text().ifPresent(x -> text.append(x.text()));
            if (toolStop) b.toolUse().ifPresent(u -> calls.add(new ToolCall(u.id(), u.name(), json(u._input()))));
        }
        Stop s = stop == null ? Stop.OTHER
                : BetaStopReason.TOOL_USE.equals(stop) ? Stop.TOOL_USE
                : BetaStopReason.END_TURN.equals(stop) ? Stop.END
                : BetaStopReason.MAX_TOKENS.equals(stop) ? Stop.MAX_TOKENS : Stop.OTHER;
        return new Turn(s, calls, text.toString(), null, usage);
    }

    /** 다음 요청에 붙일 content (그대로, 생각 블록 포함). 단 중간 fallback 이면 마지막 fallback 앞의 thinking·redacted_thinking·tool_use 는 뺌 */
    static List<BetaContentBlockParam> replayBlocks(List<BetaContentBlock> content) {
        return replayBlocks(content, true);
    }

    /** 응답 메시지용: stop_reason 이 tool_use 가 아니면 tool_use 블록도 뺌 (결과를 줄 수 없으므로) */
    static List<BetaContentBlockParam> replayBlocks(BetaMessage msg) {
        return replayBlocks(msg.content(), msg.stopReason().filter(BetaStopReason.TOOL_USE::equals).isPresent());
    }

    /** 빈 content 의 assistant 메시지는 API 가 거부하므로 붙이지 않음 */
    static void append(SdkTranscript tr, BetaMessage msg) {
        List<BetaContentBlockParam> blocks = replayBlocks(msg);
        if (!blocks.isEmpty()) tr.messages.add(BetaMessageParam.ofAssistantOfContentBlockParams(blocks));
    }

    private static List<BetaContentBlockParam> replayBlocks(List<BetaContentBlock> content, boolean keepToolUse) {
        int last = lastFallback(content);
        List<BetaContentBlockParam> out = new ArrayList<>();
        for (int i = 0; i < content.size(); i++) {
            BetaContentBlock b = content.get(i);
            if (i < last && (b.isThinking() || b.isRedactedThinking() || b.isToolUse())) continue;
            if (!keepToolUse && b.isToolUse()) continue;
            out.add(b.toParam());
        }
        return out;
    }

    private static int lastFallback(List<BetaContentBlock> content) {
        int last = -1;
        for (int i = 0; i < content.size(); i++) if (content.get(i).isFallback()) last = i;
        return last;
    }

    private static String refusalReason(BetaMessage msg) {
        return msg.stopDetails().flatMap(d -> d.explanation()).filter(s -> !s.isBlank()).orElse("안전 정책");
    }

    static Usage usageOf(BetaMessage msg) {
        BetaUsage u = msg.usage();
        return new Usage(msg.model().asString(), u.inputTokens(), u.outputTokens(), u.cacheReadInputTokens().orElse(0L),
                u.cacheCreationInputTokens().orElse(0L));
    }

    private static String json(JsonValue v) {
        try {
            return SDK_JSON.writeValueAsString(v);
        } catch (Exception e) {
            return "{}";
        }
    }

    /** SDK 예외 → 사용자 문구 (타입으로 구분, 문자열 비교 안 함) */
    static AiCallException translate(RuntimeException e) {
        if (e instanceof AiCallException a) return a;
        if (e instanceof UnauthorizedException || e instanceof PermissionDeniedException) return new AiCallException(AiCallException.Kind.KEY, e);
        if (e instanceof RateLimitException) return new AiCallException(AiCallException.Kind.RATE, e);
        if (e instanceof InternalServerException || e instanceof SseException || e instanceof AnthropicIoException
                || e instanceof AnthropicRetryableException) return new AiCallException(AiCallException.Kind.NETWORK, e);
        if (e instanceof AnthropicServiceException s)
            return s.statusCode() >= 500 ? new AiCallException(AiCallException.Kind.NETWORK, e)
                    : new AiCallException(AiCallException.Kind.OTHER, "HTTP " + s.statusCode(), e);
        return new AiCallException(AiCallException.Kind.OTHER, e.getClass().getSimpleName(), e);
    }
}
