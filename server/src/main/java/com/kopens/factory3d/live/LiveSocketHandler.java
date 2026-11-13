package com.kopens.factory3d.live;

import jakarta.annotation.PreDestroy;
import jakarta.websocket.Session;
import java.io.IOException;
import java.net.URI;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.adapter.NativeWebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import org.springframework.web.util.UriComponentsBuilder;
import tools.jackson.databind.ObjectMapper;

/**
 * /ws/live?drawing={id}: 접속하면 snapshot 먼저, 그다음 event·projects·tick. 화면이 보내는 메시지는 없음.
 * VirtualMes 는 deliverLock 을 쥔 채 전달하므로 여기서는 그 스레드로 소켓을 만지지 않는다: 세션마다 LiveOutbox 줄에 넣기만 하고,
 * 보내기·닫기는 senders(스레드 {@value #SENDERS}개)가 세션마다 하나씩 한다 → 느린·멈춘 연결이 스케줄러·기준정보 저장을 붙잡지 않음.
 * 보내기 한 번은 ConcurrentWebSocketSessionDecorator(5초·512KB) 와 Tomcat 블로킹 전송 한도 5초로 묶이고,
 * 줄이 {@value #QUEUE_CAP}개를 넘으면 그 연결을 닫는다 (화면이 다시 붙음).
 * 멈춘 연결이 {@value #SENDERS}개를 넘게 겹치면 다른 연결의 보내기가 최대 5초쯤 늦어질 수 있다 (진행·저장은 영향 없음).
 */
@Component
public class LiveSocketHandler extends TextWebSocketHandler {
    static final CloseStatus NOT_FOUND = new CloseStatus(4404, "drawing not found");
    static final int QUEUE_CAP = 1000;
    static final int SENDERS = 8;
    private static final Logger log = LoggerFactory.getLogger(LiveSocketHandler.class);
    private static final String SUB = "f3d.live";
    private static final int SEND_TIME_LIMIT_MS = 5000;
    private static final int BUFFER_LIMIT = 512 * 1024;
    private static final String TOMCAT_BLOCKING_SEND_TIMEOUT = "org.apache.tomcat.websocket.BLOCKING_SEND_TIMEOUT";

    private final ProductionSource source;
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final ExecutorService senders = Executors.newFixedThreadPool(SENDERS, Thread.ofPlatform().name("live-send-", 0).daemon().factory());

    public LiveSocketHandler(ProductionSource source, JdbcTemplate jdbc, ObjectMapper json) {
        this.source = source;
        this.jdbc = jdbc;
        this.json = json;
    }

    @PreDestroy
    void shutdown() {
        senders.shutdownNow();
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws IOException {
        Long id = drawingId(session.getUri());
        if (id == null || !Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from drawing where id = ?)", Boolean.class, id))) {
            session.close(NOT_FOUND);
            return;
        }
        limitBlockingSend(session);
        var out = new ConcurrentWebSocketSessionDecorator(session, SEND_TIME_LIMIT_MS, BUFFER_LIMIT);
        var box = new LiveOutbox(id, new LiveOutbox.Transport() {
            @Override
            public void send(Object message) throws Exception {
                if (out.isOpen()) out.sendMessage(new TextMessage(json.writeValueAsString(message)));
            }

            @Override
            public void close(CloseStatus status) {
                try {
                    out.close(status);
                } catch (IOException | RuntimeException ignored) {
                    // 이미 닫힘
                }
            }
        }, senders, QUEUE_CAP);
        session.getAttributes().put(SUB, box);
        box.start(source.subscribeWithSnapshot(id, box));
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
        if (session.getAttributes().remove(SUB) instanceof LiveOutbox box) {
            box.stop();
            source.unsubscribe(box.drawingId, box);
        }
    }

    /** Tomcat 블로킹 전송 한도(기본 20초)를 5초로 — 보내는 스레드가 멈춘 연결에 오래 묶이지 않게 */
    private static void limitBlockingSend(WebSocketSession session) {
        if (session instanceof NativeWebSocketSession n && n.getNativeSession(Session.class) instanceof Session s)
            s.getUserProperties().put(TOMCAT_BLOCKING_SEND_TIMEOUT, (long) SEND_TIME_LIMIT_MS);
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
}
