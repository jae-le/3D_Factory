package com.kopens.factory3d.ai;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/** 서버 메모리의 대화 (사용자·도면별 하나): 대화 기록 + 아직 적용 안 한 제안 묶음. 30분 안 쓰면 비움 */
@Component
public class ProposalStore {
    public static final Duration IDLE = Duration.ofMinutes(30);
    public static final int MAX_TURNS = 40;

    public static final class Conversation {
        public final String user;
        public final long drawingId;
        public final Transcript transcript;
        public final ReentrantLock lock = new ReentrantLock();
        public volatile Changeset changeset = new Changeset();
        public int turns;
        volatile Instant lastUsed;
        private String note;

        Conversation(String user, long drawingId, Transcript transcript, Instant now) {
            this.user = user;
            this.drawingId = drawingId;
            this.transcript = transcript;
            this.lastUsed = now;
        }

        /** 다음 사용자 메시지 앞에 붙일 메모 (한 번만) */
        public synchronized String takeNote() {
            String n = note;
            note = null;
            return n;
        }

        /** 묶음을 적용·취소함 → 새 묶음, 다음 메시지에 결과 메모 */
        public synchronized void finish(String note) {
            this.changeset = new Changeset();
            this.note = note;
        }
    }

    private final Clock clock;
    private final Map<String, Conversation> map = new ConcurrentHashMap<>();

    @Autowired
    public ProposalStore() {
        this(Clock.systemUTC());
    }

    public ProposalStore(Clock clock) {
        this.clock = clock;
    }

    public Conversation get(String user, long drawingId, Supplier<Transcript> fresh) {
        purge();
        Instant now = clock.instant();
        Conversation c = map.compute(key(user, drawingId), (k, cur) ->
                cur == null || expired(cur, now) ? new Conversation(user, drawingId, fresh.get(), now) : cur);
        c.lastUsed = now;
        return c;
    }

    public void reset(String user, long drawingId) {
        map.remove(key(user, drawingId));
    }

    public Optional<Conversation> byChangeset(String user, String batchId) {
        purge();
        return map.values().stream().filter(c -> c.user.equals(user) && c.changeset.id().equals(batchId)).findFirst();
    }

    private void purge() {
        Instant now = clock.instant();
        map.values().removeIf(c -> expired(c, now) && !c.lock.isLocked());
    }

    private static boolean expired(Conversation c, Instant now) {
        return c.lastUsed.plus(IDLE).isBefore(now);
    }

    private static String key(String user, long drawingId) {
        return user + ":" + drawingId;
    }
}
