package com.kopens.factory3d.live;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.Executor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.socket.CloseStatus;

/**
 * 세션 하나의 보낼 줄. onMessage 는 줄에 넣기만 하고 바로 돌아온다 (VirtualMes 가 deliverLock 을 쥔 채 부르므로 소켓을 만지지 않음).
 * 실제 보내기·닫기는 executor 에서 세션마다 한 번에 하나씩(drain) — 순서는 snapshot → 그 전에 온 것 → 그 뒤 것.
 * 줄이 cap 을 넘으면(느린 연결) 버리고 POLICY_VIOLATION 으로, 보내기가 실패하면 SESSION_NOT_RELIABLE 로 닫는다 (화면이 다시 붙음).
 * Gone(도면이 지워짐)을 받으면 4404 로 닫는다 (화면은 다시 붙지 않음).
 */
final class LiveOutbox implements LiveListener {
    /** 실제 보내기·닫기 (WebSocket 세션) */
    interface Transport {
        void send(Object message) throws Exception;

        void close(CloseStatus status);
    }

    private static final Logger log = LoggerFactory.getLogger(LiveOutbox.class);

    final long drawingId;
    private final Transport transport;
    private final Executor executor;
    private final int cap;
    private final Deque<Object> queue = new ArrayDeque<>(); // this 로 잠금
    private boolean started; // snapshot 이 줄 맨 앞에 들어갔는지 (그 전엔 보내지 않고 모아 둠)
    private boolean draining; // 보내는 작업이 executor 에 하나 있음
    private boolean closed;

    LiveOutbox(long drawingId, Transport transport, Executor executor, int cap) {
        this.drawingId = drawingId;
        this.transport = transport;
        this.executor = executor;
        this.cap = cap;
    }

    /** subscribeWithSnapshot 이 돌려준 snapshot 을 줄 맨 앞에 넣고 보내기 시작 */
    void start(Object snapshot) {
        synchronized (this) {
            if (closed) return;
            queue.addFirst(snapshot);
            started = true;
        }
        schedule();
    }

    @Override
    public void onMessage(Object message) {
        if (message instanceof LiveMessages.Gone) { // 도면이 지워짐 → 남은 줄은 버리고 4404 로 닫음 (화면은 다시 붙지 않음)
            synchronized (this) {
                if (closed) return;
                closed = true;
                queue.clear();
            }
            executor.execute(() -> transport.close(LiveSocketHandler.NOT_FOUND));
            return;
        }
        boolean overflow;
        synchronized (this) {
            if (closed) return;
            overflow = queue.size() >= cap;
            if (overflow) {
                closed = true;
                queue.clear();
            } else {
                queue.addLast(message);
            }
        }
        if (overflow) {
            log.debug("상황판 연결이 너무 느려 닫습니다 (보낼 줄 {}개 넘음)", cap);
            executor.execute(() -> transport.close(CloseStatus.POLICY_VIOLATION));
        } else {
            schedule();
        }
    }

    /** 연결이 닫힘 — 남은 줄을 버림 */
    synchronized void stop() {
        closed = true;
        queue.clear();
    }

    private void schedule() {
        synchronized (this) {
            if (!started || draining || closed || queue.isEmpty()) return;
            draining = true;
        }
        executor.execute(this::drain);
    }

    private void drain() {
        while (true) {
            Object m;
            synchronized (this) {
                if (closed || queue.isEmpty()) {
                    draining = false;
                    return;
                }
                m = queue.pollFirst();
            }
            try {
                transport.send(m);
            } catch (Exception e) {
                log.debug("상황판 전송 실패: {}", e.getMessage());
                synchronized (this) {
                    closed = true;
                    queue.clear();
                    draining = false;
                }
                transport.close(CloseStatus.SESSION_NOT_RELIABLE);
                return;
            }
        }
    }
}
