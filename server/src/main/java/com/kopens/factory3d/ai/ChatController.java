package com.kopens.factory3d.ai;

import com.kopens.factory3d.common.BadRequestException;
import java.time.Duration;
import java.util.concurrent.ExecutorService;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import tools.jackson.databind.ObjectMapper;

/** AI 챗봇 (운전원 이상 — SecurityConfig 기본 규칙). 응답은 SSE */
@RestController
public class ChatController {
    public record ChatBody(Long drawingId, String message) {}

    public record ResetBody(Long drawingId) {}

    private final ChatService chat;
    private final ChatHistory history;
    private final ProposalStore store;
    private final ExecutorService executor;
    private final ObjectMapper json;

    public ChatController(ChatService chat, ChatHistory history, ProposalStore store, @Qualifier("aiExecutor") ExecutorService executor,
            ObjectMapper json) {
        this.chat = chat;
        this.history = history;
        this.store = store;
        this.executor = executor;
        this.json = json;
    }

    @PostMapping("/api/ai/chat")
    public SseEmitter chat(@RequestBody ChatBody body, Authentication auth) {
        if (body == null || body.drawingId() == null) throw new BadRequestException("도면을 고르세요.");
        String message = body.message() == null ? "" : body.message().strip();
        if (message.isEmpty() || message.length() > 2000) throw new BadRequestException("요청은 1~2000자로 입력하세요.");
        SseEmitter emitter = new SseEmitter(Duration.ofMinutes(10).toMillis());
        SseChatSink sink = new SseChatSink(emitter, json);
        String user = auth.getName();
        long drawingId = body.drawingId();
        executor.execute(() -> chat.chat(user, drawingId, message, sink));
        return emitter;
    }

    /** 본인의 지금 대화 기록 (마지막 '새 대화' 뒤) */
    @org.springframework.web.bind.annotation.GetMapping("/api/ai/chat/history")
    public java.util.List<ChatHistory.Entry> history(@org.springframework.web.bind.annotation.RequestParam long drawingId, Authentication auth) {
        return history.current(auth.getName(), drawingId);
    }

    /** 새 대화: 기록에 경계를 남기고 AI 쪽 대화도 비움 */
    @PostMapping("/api/ai/chat/new")
    public ResponseEntity<Void> newChat(@RequestBody ResetBody body, Authentication auth) {
        if (body != null && body.drawingId() != null) {
            store.reset(auth.getName(), body.drawingId());
            history.newChat(auth.getName(), body.drawingId());
        }
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/api/ai/chat/reset")
    public ResponseEntity<Void> reset(@RequestBody ResetBody body, Authentication auth) {
        if (body != null && body.drawingId() != null) store.reset(auth.getName(), body.drawingId());
        return ResponseEntity.noContent().build();
    }
}
