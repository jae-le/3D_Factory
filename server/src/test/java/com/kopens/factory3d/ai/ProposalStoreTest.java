package com.kopens.factory3d.ai;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class ProposalStoreTest {
    static final class MovableClock extends Clock {
        Instant now = Instant.parse("2026-11-13T00:00:00Z");

        public ZoneOffset getZone() {
            return ZoneOffset.UTC;
        }

        public Clock withZone(java.time.ZoneId z) {
            return this;
        }

        public Instant instant() {
            return now;
        }
    }

    final MovableClock clock = new MovableClock();
    final ProposalStore store = new ProposalStore(clock);
    final FakeGateway g = new FakeGateway();

    @Test
    void 사용자_도면별_대화_하나_30분_지나면_새로() {
        ProposalStore.Conversation a = store.get("kim", 1, g::newTranscript);
        assertThat(store.get("kim", 1, g::newTranscript)).isSameAs(a);
        assertThat(store.get("kim", 2, g::newTranscript)).isNotSameAs(a);
        assertThat(store.get("lee", 1, g::newTranscript)).isNotSameAs(a);
        clock.now = clock.now.plus(Duration.ofMinutes(31));
        assertThat(store.get("kim", 1, g::newTranscript)).isNotSameAs(a);
    }

    @Test
    void 묶음_id_로_찾고_끝내면_새_묶음과_메모() {
        ProposalStore.Conversation c = store.get("kim", 1, g::newTranscript);
        String id = c.changeset.id();
        assertThat(store.byChangeset("kim", id)).containsSame(c);
        assertThat(store.byChangeset("lee", id)).isEmpty(); // 다른 사람 묶음은 못 찾음
        c.finish("[직전 제안 묶음: 1건 적용]");
        assertThat(c.changeset.id()).isNotEqualTo(id);
        assertThat(store.byChangeset("kim", id)).isEmpty();
        assertThat(c.takeNote()).isEqualTo("[직전 제안 묶음: 1건 적용]");
        assertThat(c.takeNote()).isNull();
        store.reset("kim", 1);
        assertThat(store.get("kim", 1, g::newTranscript)).isNotSameAs(c);
    }
}
