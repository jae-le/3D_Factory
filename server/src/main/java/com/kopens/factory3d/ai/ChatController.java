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
    public record ImageBody(String mediaType, String data) {}

    public record ChatBody(Long drawingId, String message, java.util.List<ImageBody> images) {}

    static final int MAX_IMAGES = 3;
    static final long MAX_IMAGE_BYTES = 5L * 1024 * 1024;
    static final java.util.Set<String> IMAGE_TYPES = java.util.Set.of("image/png", "image/jpeg", "image/webp");

    /** 이미지 검사: 3장까지 · PNG/JPG/WEBP · 한 장 5MB 이하 · base64 */
    static java.util.List<ClaudeGateway.Image> images(java.util.List<ImageBody> in) {
        if (in == null || in.isEmpty()) return java.util.List.of();
        if (in.size() > MAX_IMAGES) throw new BadRequestException("이미지는 " + MAX_IMAGES + "장까지 붙일 수 있습니다.");
        java.util.List<ClaudeGateway.Image> out = new java.util.ArrayList<>();
        for (ImageBody b : in) {
            if (b == null || b.mediaType() == null || !IMAGE_TYPES.contains(b.mediaType()))
                throw new BadRequestException("이미지는 PNG, JPG, WEBP 만 붙일 수 있습니다.");
            byte[] raw;
            try {
                raw = java.util.Base64.getDecoder().decode(b.data() == null ? "" : b.data());
            } catch (IllegalArgumentException e) {
                throw new BadRequestException("이미지를 읽지 못했습니다.");
            }
            if (raw.length == 0) throw new BadRequestException("이미지를 읽지 못했습니다.");
            if (raw.length > MAX_IMAGE_BYTES) throw new BadRequestException("이미지 한 장은 5MB 이하만 붙일 수 있습니다.");
            out.add(new ClaudeGateway.Image(b.mediaType(), b.data()));
        }
        return out;
    }

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
        java.util.List<ClaudeGateway.Image> images = images(body.images());
        if ((message.isEmpty() && images.isEmpty()) || message.length() > 2000) throw new BadRequestException("요청은 1~2000자로 입력하세요.");
        SseEmitter emitter = new SseEmitter(Duration.ofMinutes(10).toMillis());
        SseChatSink sink = new SseChatSink(emitter, json);
        String user = auth.getName();
        long drawingId = body.drawingId();
        executor.execute(() -> chat.chat(user, drawingId, message, images, sink));
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
