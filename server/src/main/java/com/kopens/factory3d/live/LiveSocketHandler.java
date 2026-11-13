package com.kopens.factory3d.live;

import java.io.IOException;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import org.springframework.web.util.UriComponentsBuilder;
import tools.jackson.databind.ObjectMapper;

/**
 * /ws/live?drawing={id}: 접속하면 snapshot 먼저, 그다음 event·projects·tick. 화면이 보내는 메시지는 없음.
 * 전달은 VirtualMes 가 deliverLock 을 쥔 채 부르므로, 보내기는 항상 ConcurrentWebSocketSessionDecorator(5초·512KB) 로만 —
 * 느린 연결이 스케줄러·기준정보 저장을 붙잡지 않게 (한도를 넘으면 그 연결을 닫음, 화면이 다시 붙음).
 */
@Component
public class LiveSocketHandler extends TextWebSocketHandler {
    static final CloseStatus NOT_FOUND = new CloseStatus(4404, "drawing not found");
    private static final Logger log = LoggerFactory.getLogger(LiveSocketHandler.class);
    private static final String SUB = "f3d.live";
    private static final int SEND_TIME_LIMIT_MS = 5000;
    private static final int BUFFER_LIMIT = 512 * 1024;

    private final ProductionSource source;
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public LiveSocketHandler(ProductionSource source, JdbcTemplate jdbc, ObjectMapper json) {
        this.source = source;
        this.jdbc = jdbc;
        this.json = json;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws IOException {
        Long id = drawingId(session.getUri());
        if (id == null || !Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from drawing where id = ?)", Boolean.class, id))) {
            session.close(NOT_FOUND);
            return;
        }
        var sub = new Sub(id, new ConcurrentWebSocketSessionDecorator(session, SEND_TIME_LIMIT_MS, BUFFER_LIMIT));
        session.getAttributes().put(SUB, sub);
        sub.start(source.subscribeWithSnapshot(id, sub));
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        log.debug("상황판 연결 오류: {}", exception.getMessage());
        unsubscribe(session);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        unsubscribe(session);
    }

    private void unsubscribe(WebSocketSession session) {
        if (session.getAttributes().remove(SUB) instanceof Sub sub) source.unsubscribe(sub.drawingId, sub);
    }

    static Long drawingId(URI uri) {
        if (uri == null) return null;
        String v = UriComponentsBuilder.fromUri(uri).build().getQueryParams().getFirst("drawing");
        try {
            return v == null ? null : Long.valueOf(v);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /**
     * 세션 하나. 구독과 snapshot 은 한 번에 만들어지므로(subscribeWithSnapshot), snapshot 을 보내기 전에 온 메시지는
     * 모두 snapshot 뒤의 진행분 → 모아 두었다가 snapshot 다음에 순서대로 보냄 (빠짐·겹침 없음).
     * 잠금은 상태(ready·pending)에만 쓰고 보내기는 잠금 밖에서 — 전달 스레드가 snapshot 보내기를 기다리지 않게.
     */
    private final class Sub implements LiveListener {
        final long drawingId;
        private final WebSocketSession out;
        private List<Object> pending = new ArrayList<>();
        private boolean ready;

        Sub(long drawingId, WebSocketSession out) {
            this.drawingId = drawingId;
            this.out = out;
        }

        void start(Object snapshot) {
            send(snapshot);
            while (true) {
                List<Object> batch;
                synchronized (this) {
                    if (pending.isEmpty()) {
                        ready = true;
                        pending = null;
                        return;
                    }
                    batch = pending;
                    pending = new ArrayList<>();
                }
                batch.forEach(this::send);
            }
        }

        @Override
        public void onMessage(Object message) {
            synchronized (this) {
                if (!ready) {
                    pending.add(message);
                    return;
                }
            }
            send(message); // 전달은 deliverLock 아래 한 줄이라 순서가 지켜짐
        }

        private void send(Object message) {
            if (!out.isOpen()) return;
            try {
                out.sendMessage(new TextMessage(json.writeValueAsString(message)));
            } catch (Exception e) { // 느리거나 끊긴 연결 → 닫음 (화면이 다시 붙음)
                log.debug("상황판 전송 실패: {}", e.getMessage());
                try {
                    out.close(CloseStatus.SESSION_NOT_RELIABLE);
                } catch (IOException ignored) {
                    // 이미 닫힘
                }
            }
        }
    }
}
