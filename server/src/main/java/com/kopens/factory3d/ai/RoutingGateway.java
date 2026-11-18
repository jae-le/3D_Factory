package com.kopens.factory3d.ai;

import java.util.function.Consumer;

/**
 * 모델 이름으로 제공자를 고름: gemini-* → Gemini, 나머지 → Claude.
 * 대화 기록은 처음 부를 때 그 제공자 것으로 만들고, 대화 중 제공자가 바뀌면 새 기록으로(마지막 질문만 옮김).
 */
public class RoutingGateway implements ClaudeGateway {
    private final ClaudeGateway claude;
    private final ClaudeGateway gemini;

    public RoutingGateway(ClaudeGateway claude, ClaudeGateway gemini) {
        this.claude = claude;
        this.gemini = gemini;
    }

    public static boolean isGemini(String model) {
        return model != null && model.startsWith("gemini-");
    }

    private ClaudeGateway target(String model) {
        return isGemini(model) ? gemini : claude;
    }

    static final class RoutedTranscript implements Transcript {
        Transcript inner;
        ClaudeGateway owner;
        String lastUser;
        int pending; // inner 가 생기기 전 넣은 질문 수 (0 또는 1)

        public void addUserText(String text) {
            lastUser = text;
            if (inner != null) inner.addUserText(text);
            else pending = 1;
        }

        public void addToolResults(java.util.List<ToolResult> results) {
            inner.addToolResults(results);
        }

        public int messages() {
            return inner != null ? inner.messages() : pending;
        }

        public void truncate(int n) {
            if (inner != null) inner.truncate(n);
            else if (n == 0) pending = 0;
        }
    }

    @Override
    public Transcript newTranscript() {
        return new RoutedTranscript();
    }

    @Override
    public Turn next(Call call, Transcript t, Consumer<String> onText) {
        RoutedTranscript rt = (RoutedTranscript) t;
        ClaudeGateway g = target(call.model());
        if (rt.owner != g) {
            rt.owner = g;
            rt.inner = g.newTranscript();
            if (rt.lastUser != null) rt.inner.addUserText(rt.lastUser);
            rt.pending = 0;
        }
        return g.next(call, rt.inner, onText);
    }

    @Override
    public java.util.List<ModelOption> geminiModels(String apiKey) {
        return gemini.geminiModels(apiKey);
    }

    @Override
    public Ping ping(String apiKey, String model) {
        return target(model).ping(apiKey, model);
    }
}
