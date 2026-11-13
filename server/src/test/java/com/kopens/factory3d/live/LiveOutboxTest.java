package com.kopens.factory3d.live;

import static java.util.concurrent.TimeUnit.SECONDS;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;

import java.time.Duration;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.CloseStatus;

/** 세션 보낼 줄: 넣기는 막히지 않고, 보내기는 snapshot → 그 전에 온 것 → 그 뒤 것 순서 */
class LiveOutboxTest {
    /** 첫 보내기에서 gate 가 열릴 때까지 멈추는 가짜 연결 */
    static final class StalledTransport implements LiveOutbox.Transport {
        final List<Object> sent = new CopyOnWriteArrayList<>();
        final CountDownLatch entered = new CountDownLatch(1);
        final CountDownLatch gate = new CountDownLatch(1);
        final CompletableFuture<CloseStatus> closed = new CompletableFuture<>();

        @Override
        public void send(Object message) throws Exception {
            entered.countDown();
            gate.await();
            sent.add(message);
        }

        @Override
        public void close(CloseStatus status) {
            closed.complete(status);
        }
    }

    final ExecutorService executor = Executors.newFixedThreadPool(2);

    @AfterEach
    void tearDown() {
        executor.shutdownNow();
    }

    @Test
    void 보내기가_멈춰도_넣기는_바로_돌아오고_순서는_snapshot_먼저() throws Exception {
        var t = new StalledTransport();
        var box = new LiveOutbox(1, t, executor, 1000);
        box.onMessage("before"); // 구독 직후 snapshot 보내기 전에 온 진행분
        box.start("snapshot");
        assertThat(t.entered.await(5, SECONDS)).isTrue(); // snapshot 보내기에서 멈춤
        assertTimeoutPreemptively(Duration.ofSeconds(1), () -> {
            for (int i = 0; i < 100; i++) box.onMessage("later" + i);
        });
        t.gate.countDown();
        long until = System.nanoTime() + SECONDS.toNanos(5);
        while (t.sent.size() < 102 && System.nanoTime() < until) Thread.sleep(10);
        assertThat(t.sent).hasSize(102);
        assertThat(t.sent.subList(0, 3)).containsExactly("snapshot", "before", "later0");
        assertThat(t.sent.get(101)).isEqualTo("later99");
        assertThat(t.closed).isNotDone();
    }

    @Test
    void 줄이_넘치면_닫음() throws Exception {
        var t = new StalledTransport();
        var box = new LiveOutbox(1, t, executor, 10);
        box.start("snapshot");
        assertThat(t.entered.await(5, SECONDS)).isTrue();
        assertTimeoutPreemptively(Duration.ofSeconds(1), () -> {
            for (int i = 0; i < 50; i++) box.onMessage(i);
        });
        assertThat(t.closed.get(5, SECONDS)).isEqualTo(CloseStatus.POLICY_VIOLATION);
        t.gate.countDown();
    }

    @Test
    void 보내기가_실패하면_닫고_더_보내지_않음() throws Exception {
        List<Object> sent = new CopyOnWriteArrayList<>();
        var closed = new CompletableFuture<CloseStatus>();
        var box = new LiveOutbox(1, new LiveOutbox.Transport() {
            @Override
            public void send(Object message) throws Exception {
                if (message.equals("bad")) throw new IllegalStateException("끊김");
                sent.add(message);
            }

            @Override
            public void close(CloseStatus status) {
                closed.complete(status);
            }
        }, executor, 1000);
        box.start("snapshot");
        box.onMessage("bad");
        assertThat(closed.get(5, SECONDS)).isEqualTo(CloseStatus.SESSION_NOT_RELIABLE);
        box.onMessage("after");
        Thread.sleep(100);
        assertThat(sent).containsExactly("snapshot");
    }
}
