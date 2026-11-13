package com.kopens.factory3d.live;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.kopens.factory3d.live.LiveMessages.LiveEvent;
import com.kopens.factory3d.live.LiveMessages.StationLive;
import com.kopens.factory3d.station.StationSeeder;
import com.kopens.factory3d.support.IntegrationTest;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

class VirtualMesTest extends IntegrationTest {
    /** 테스트가 시각을 바꾸는 시계 */
    static final class MutableClock extends Clock {
        volatile Instant now;

        MutableClock(Instant now) {
            this.now = now;
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }

    @Autowired VirtualMes mes;
    @Autowired StationSeeder stationSeeder;
    final List<Object> got = new CopyOnWriteArrayList<>();
    final MutableClock clock = new MutableClock(Instant.parse("2026-11-13T01:00:00Z")); // 서울 10시
    long drawing;
    long project;
    long station;

    @BeforeEach
    void setUp() {
        mes.unloadAll();
        mes.useClock(clock);
        mes.setTimeScale(1);
        drawing = jdbc.queryForObject("insert into drawing (name, source_type, source_file) values ('공장', 'dxf', 'x') returning id", Long.class);
        project = jdbc.queryForObject("insert into project (drawing_id, name, done, total, period, state) values (?, '야월해상', 3, 13, '''25.09~''27.03', 'run') returning id",
                Long.class, drawing);
        // step 4개 (한 step = 25%), 택타임 100초 → 1초에 목표 +1%
        station = jdbc.queryForObject("insert into station (drawing_id, sort_order, name, placement_name, steps, takt_sec, project_id, counts_project) "
                + "values (?, 1, 'Main Station 3', 'Main Station 3', array['a','b','c','d'], 100, ?, true) returning id", Long.class, drawing, project);
        mes.subscribe(drawing, got::add);
    }

    @AfterEach
    void restore() {
        mes.unloadAll();
        mes.useClock(Clock.systemUTC());
        mes.setTimeScale(1);
    }

    private List<LiveEvent> events() {
        return got.stream().filter(m -> m instanceof LiveMessages.EventMessage).map(m -> ((LiveMessages.EventMessage) m).event()).toList();
    }

    private StationLive live() {
        return mes.snapshot(drawing).stations().get(0);
    }

    @Test
    void 상태_판정_경계와_step_번호() {
        assertThat(VirtualMes.statusOf(-5, 10, 20)).isEqualTo("ok");
        assertThat(VirtualMes.statusOf(10, 10, 20)).isEqualTo("ok");
        assertThat(VirtualMes.statusOf(10.01, 10, 20)).isEqualTo("warn");
        assertThat(VirtualMes.statusOf(20, 10, 20)).isEqualTo("warn");
        assertThat(VirtualMes.statusOf(20.01, 10, 20)).isEqualTo("bad");
        assertThat(VirtualMes.stepOf(0, 12)).isEqualTo(1);
        assertThat(VirtualMes.stepOf(60, 12)).isEqualTo(8);
        assertThat(VirtualMes.stepOf(99.9, 12)).isEqualTo(12);
        assertThat(VirtualMes.stepOf(100, 12)).isEqualTo(12);
    }

    @Test
    void step_경계를_넘으면_step_done_다음_step_start_그리고_tick() {
        mes.override(drawing, station, 24, 24, 1);
        mes.advance(1); // 실적 25 → step 2
        assertThat(events()).extracting(LiveEvent::kind).containsExactly("step_done", "step_start");
        assertThat(events().get(0).data()).containsEntry("step", 1);
        assertThat(events().get(1).data()).containsEntry("step", 2);
        assertThat(events().get(1).text()).isEqualTo("Main Station 3 b 시작");
        assertThat(got.get(got.size() - 1)).isInstanceOf(LiveMessages.Tick.class); // 이벤트 다음에 tick
        assertThat(live().step()).isEqualTo(2);
        assertThat(mes.snapshot(drawing).events()).isEmpty(); // step_* 은 보관하지 않음
    }

    @Test
    void 백퍼센트면_한_대_완료_PJT_제작수_오늘_완료_넘친_실적_이어짐() {
        mes.override(drawing, station, 99.5, 99.5, 1);
        mes.advance(1);
        assertThat(events()).extracting(LiveEvent::kind).containsExactly("step_done", "unit_done", "step_start");
        assertThat(events().get(1).text()).isEqualTo("Main Station 3 · 야월해상 4호기 완료");
        assertThat(jdbc.queryForObject("select done from project where id = ?", Integer.class, project)).isEqualTo(4);
        assertThat(jdbc.queryForObject("select done from live_daily where drawing_id = ?", Integer.class, drawing)).isEqualTo(1);
        var snap = mes.snapshot(drawing);
        assertThat(snap.kpi().doneToday()).isEqualTo(1);
        assertThat(snap.projects().get(0).done()).isEqualTo(4);
        assertThat(snap.stations().get(0).actual()).isEqualTo(0.5);
        assertThat(snap.stations().get(0).target()).isEqualTo(0.5);
        assertThat(snap.stations().get(0).step()).isEqualTo(1);
        assertThat(snap.stations().get(0).unitNo()).isEqualTo(5);
        assertThat(snap.events()).extracting(LiveEvent::kind).containsExactly("unit_done");
        assertThat(got).anyMatch(m -> m instanceof LiveMessages.Projects p && p.projects().get(0).done() == 4);
    }

    @Test
    void 상태가_바뀔_때_한_번만_status_change() {
        mes.override(drawing, station, 50, 59, 0); // 실적 멈춤, 목표만 1초에 +1
        mes.advance(1); // 차 10 → 진행중 그대로
        mes.advance(1); // 차 11 → 주의
        mes.advance(1); // 차 12 → 그대로
        var changes = events().stream().filter(e -> e.kind().equals("status_change")).toList();
        assertThat(changes).hasSize(1);
        assertThat(changes.get(0).text()).isEqualTo("Main Station 3 제작 주의");
        assertThat(changes.get(0).data()).containsEntry("from", "ok").containsEntry("to", "warn");
        assertThat(live().status()).isEqualTo("warn");
        assertThat(mes.snapshot(drawing).kpi().warn()).isEqualTo(1);
    }

    @Test
    void 진행_배율() {
        mes.override(drawing, station, 0, 0, 1);
        mes.advance(1);
        assertThat(live().target()).isEqualTo(1.0);
        mes.setTimeScale(30);
        mes.advance(1);
        assertThat(live().target()).isEqualTo(31.0);
    }

    @Test
    void 다시_읽으면_처음부터_새_snapshot() {
        mes.override(drawing, station, 99, 99, 1);
        mes.reload(drawing);
        assertThat(got.get(got.size() - 1)).isInstanceOf(LiveMessages.Snapshot.class);
        var s = live();
        assertThat(s.actual()).isBetween(30.0, 70.0);
        assertThat(s.target()).isBetween(s.actual(), s.actual() + 25);
    }

    @Test
    void 공정을_고치면_커밋_뒤_상황판도_새로() throws Exception {
        mes.snapshot(drawing);
        mvc.perform(patch("/api/stations/" + station).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"메인 3\"}")
                        .with(user("admin").roles("ADMIN")).with(csrf()))
                .andExpect(status().isOk());
        assertThat(mes.snapshot(drawing).stations().get(0).name()).isEqualTo("메인 3");
        assertThat(got).anyMatch(m -> m instanceof LiveMessages.Snapshot);
    }

    @Test
    void 도면을_지우면_내림() throws Exception {
        mes.snapshot(drawing);
        assertThat(mes.loaded()).contains(drawing);
        mvc.perform(delete("/api/drawings/" + drawing).with(user("admin").roles("ADMIN")).with(csrf())).andExpect(status().isNoContent());
        assertThat(mes.loaded()).doesNotContain(drawing);
    }

    @Test
    void 자재_입고_다음_운반() {
        jdbc.update("update station set materials = array['Main Frame'], takt_sec = 604800 where id = ?", station);
        mes.reload(drawing);
        got.clear();
        mes.advance(181); // 첫 입고는 올린 뒤 가상 60~180초 사이
        var kinds = events().stream().map(LiveEvent::kind).filter(k -> k.equals("material_in") || k.equals("move")).toList();
        assertThat(kinds).containsExactly("material_in", "move");
        assertThat(events().stream().filter(e -> e.kind().equals("material_in")).findFirst().orElseThrow().text())
                .isEqualTo("Main Frame 입고 → Main Station 3");
        assertThat(events().stream().filter(e -> e.kind().equals("move")).findFirst().orElseThrow().data())
                .containsEntry("from", "자재 랙").containsEntry("to", "Main Station 3").containsEntry("material", "Main Frame");
        assertThat(mes.snapshot(drawing).materials()).hasSize(1);
    }

    @Test
    void 날짜가_바뀌면_오늘_완료_0부터() {
        mes.override(drawing, station, 99.5, 99.5, 1);
        mes.advance(1);
        assertThat(mes.snapshot(drawing).kpi().doneToday()).isEqualTo(1);
        clock.now = Instant.parse("2026-11-14T01:00:00Z");
        mes.advance(0);
        assertThat(mes.snapshot(drawing).kpi().doneToday()).isZero();
    }

    @Test
    void 나셀_공장은_시드의_시작값() throws Exception {
        jdbc.update("insert into drawing (name, source_type, source_file, created_by) values ('나셀 공장', 'dxf', 'x', 'system')");
        assertThat(stationSeeder.seedFactory()).isEqualTo(6);
        long id = jdbc.queryForObject("select id from drawing where name = '나셀 공장'", Long.class);
        var snap = mes.snapshot(id);
        var main2 = snap.stations().stream().filter(s -> s.name().equals("Main Station 2")).findFirst().orElseThrow();
        assertThat(main2.no()).isEqualTo(3);
        assertThat(main2.actual()).isEqualTo(60.0);
        assertThat(main2.target()).isEqualTo(88.0);
        assertThat(main2.status()).isEqualTo("bad");
        assertThat(snap.kpi().running()).isEqualTo(6);
        assertThat(snap.projects()).hasSize(4);
    }
}
