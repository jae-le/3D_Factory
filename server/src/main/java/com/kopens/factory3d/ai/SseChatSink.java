package com.kopens.factory3d.ai;

import java.io.IOException;
import java.util.Map;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import tools.jackson.databind.ObjectMapper;

/** ChatSink → SSE (data 는 JSON 한 줄). 브라우저가 끊으면 이후 이벤트는 버림 */
final class SseChatSink implements ChatSink {
    private final SseEmitter emitter;
    private final ObjectMapper json;
    private volatile boolean closed;

    SseChatSink(SseEmitter emitter, ObjectMapper json) {
        this.emitter = emitter;
        this.json = json;
        emitter.onCompletion(() -> closed = true);
        emitter.onTimeout(() -> closed = true);
        emitter.onError(e -> closed = true);
    }

    public void text(String chunk) {
        send("text", Map.of("t", chunk));
    }

    public void tool(String name, String label) {
        send("tool", Map.of("name", name, "label", label));
    }

    public void proposal(Changeset.View proposal) {
        send("proposal", proposal);
    }

    public void done(ChatService.Done done) {
        send("done", done);
        complete();
    }

    public void error(String message) {
        send("error", Map.of("message", message));
        complete();
    }

    @Override
    public boolean closed() {
        return closed;
    }

    private void send(String name, Object data) {
        if (closed) return;
        try {
            emitter.send(SseEmitter.event().name(name).data(json.writeValueAsString(data)));
        } catch (IOException | IllegalStateException e) {
            closed = true;
        }
    }

    private void complete() {
        if (closed) return;
        closed = true;
        emitter.complete();
    }
}
