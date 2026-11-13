package com.kopens.factory3d.live;

import com.kopens.factory3d.drawing.DrawingDeleted;
import com.kopens.factory3d.live.LiveMessages.Kpi;
import com.kopens.factory3d.live.LiveMessages.LiveEvent;
import com.kopens.factory3d.live.LiveMessages.ProjectLive;
import com.kopens.factory3d.live.LiveMessages.StationLive;
import com.kopens.factory3d.station.ProjectMapper;
import com.kopens.factory3d.station.ProjectView;
import com.kopens.factory3d.station.StationMapper;
import com.kopens.factory3d.station.StationSeeder;
import com.kopens.factory3d.station.StationView;
import com.kopens.factory3d.station.StationsChanged;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicLong;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * 가상 MES (ProductionSource 첫 구현). 공정이 있는 도면마다 메모리에서 생산을 진행한다 (demo dashStep).
 * 목표는 택타임마다 100%, 실적은 스테이션 속도(rate) 배. 1초 진행은 LiveScheduler 가 tick(), 테스트는 advance(dt).
 * 상태는 this 로 잠그고, 구독자 전달은 그 잠금 밖에서 한다 (snapshot 읽기가 느린 구독자를 기다리지 않게).
 * 계산+전달은 deliverLock 으로 한 줄로 세워, 스케줄러의 tick 과 reload 의 snapshot 이 만든 순서대로 구독자에게 간다.
 * 잠금 순서는 항상 deliverLock → this.
 */
@Service
public class VirtualMes implements ProductionSource {
    private static final Logger log = LoggerFactory.getLogger(VirtualMes.class);
    static final int MAX_EVENTS = 50;
    static final int MAX_MATERIALS = 20;
    static final double MAX_DT = 5; // 서버가 잠깐 멈췄다 돌아와도 한 번에 5초까지만
    static final String RACK = "자재 랙";

    /** 스테이션 하나의 진행 상태 */
    private static final class Unit {
        final StationView s;
        final Random rnd;
        double actual;
        double target;
        double rate;
        double nextMaterial; // 다음 자재 입고 가상 시각 (Board.simT 기준)
        int step;
        String status;

        Unit(StationView s) {
            this.s = s;
            this.rnd = new Random(s.id());
        }
    }

    /** 도면 하나의 진행 상태 */
    private static final class Board {
        final long drawingId;
        final List<Unit> units = new ArrayList<>();
        final Map<Long, ProjectView> projects = new LinkedHashMap<>();
        final Deque<LiveEvent> events = new ArrayDeque<>();
        final Deque<LiveEvent> materials = new ArrayDeque<>();
        LocalDate day;
        int doneToday;
        double simT; // 올린 뒤 흐른 가상 시간(초)

        Board(long drawingId) {
            this.drawingId = drawingId;
        }
    }

    private record Delivery(long drawingId, List<Object> messages) {}

    private final StationMapper stationMapper;
    private final ProjectMapper projectMapper;
    private final StationSeeder seeds;
    private final JdbcTemplate jdbc;
    private final ZoneId zone;
    private final Map<Long, Board> boards = new HashMap<>(); // this 로 잠금
    private final Map<Long, List<LiveListener>> listeners = new ConcurrentHashMap<>();
    private final AtomicLong eventIds = new AtomicLong();
    private final Object deliverLock = new Object();
    private volatile Clock clock = Clock.systemUTC();
    private volatile double scale;
    private long lastTick = -1;

    public VirtualMes(StationMapper stationMapper, ProjectMapper projectMapper, StationSeeder seeds, JdbcTemplate jdbc,
            @Value("${factory3d.time-zone:Asia/Seoul}") String timeZone, @Value("${factory3d.live.time-scale:1}") double scale) {
        this.stationMapper = stationMapper;
        this.projectMapper = projectMapper;
        this.seeds = seeds;
        this.jdbc = jdbc;
        this.zone = ZoneId.of(timeZone);
        this.scale = scale > 0 ? scale : 1;
    }

    /* ---------------- 공개 ---------------- */

    @EventListener(ApplicationReadyEvent.class)
    public void start() {
        List<Long> ids = jdbc.queryForList("select distinct drawing_id from station order by drawing_id", Long.class);
        synchronized (this) {
            for (long id : ids) {
                if (boards.containsKey(id)) continue;
                Board b = load(id);
                if (b != null) boards.put(id, b);
            }
            log.info("상황판: 공정이 있는 도면 {}개를 올렸습니다 (진행 배율 {})", boards.size(), scale);
        }
    }

    @Override
    public synchronized LiveMessages.Snapshot snapshot(long drawingId) {
        Board b = boardOf(drawingId);
        return b == null ? empty(drawingId) : snapshotOf(b);
    }

    @Override
    public void subscribe(long drawingId, LiveListener listener) {
        listeners.compute(drawingId, (k, list) -> {
            List<LiveListener> l = list == null ? new CopyOnWriteArrayList<>() : list;
            l.add(listener);
            return l;
        });
    }

    /** 구독과 snapshot 을 deliverLock 안에서 한 번에: 그 사이 진행분이 빠지거나 겹치지 않음 (받는 쪽은 이 snapshot 을 먼저 보냄) */
    @Override
    public LiveMessages.Snapshot subscribeWithSnapshot(long drawingId, LiveListener listener) {
        synchronized (deliverLock) {
            subscribe(drawingId, listener);
            return snapshot(drawingId);
        }
    }

    /** 구독 해제. 도면의 구독자가 모두 빠지면 목록도 지움 */
    @Override
    public void unsubscribe(long drawingId, LiveListener listener) {
        listeners.computeIfPresent(drawingId, (k, list) -> {
            list.remove(listener);
            return list.isEmpty() ? null : list;
        });
    }

    @Override
    public void reload(long drawingId) {
        synchronized (deliverLock) {
            LiveMessages.Snapshot snap;
            synchronized (this) {
                Board b = load(drawingId);
                if (b == null) boards.remove(drawingId);
                else boards.put(drawingId, b);
                snap = b == null ? empty(drawingId) : snapshotOf(b);
            }
            deliver(new Delivery(drawingId, List.of(snap)));
        }
    }

    public synchronized void unload(long drawingId) {
        boards.remove(drawingId);
    }

    @TransactionalEventListener(fallbackExecution = true)
    public void onStationsChanged(StationsChanged e) {
        reload(e.drawingId());
    }

    @TransactionalEventListener(fallbackExecution = true)
    public void onDrawingDeleted(DrawingDeleted e) {
        unload(e.drawingId());
    }

    /** 스케줄러가 1초마다: 실제 경과 초로 진행 (첫 번은 1초, 최대 5초) */
    public void tick() {
        long now = clock.millis();
        double dt;
        synchronized (this) {
            dt = lastTick < 0 ? 1 : (now - lastTick) / 1000.0;
            lastTick = now;
        }
        advance(Math.min(MAX_DT, Math.max(0, dt)));
    }

    /** 올라 있는 모든 도면을 실제 dtSec 초만큼 진행하고 도면별로 event… → projects → tick 을 전달 */
    public void advance(double dtSec) {
        synchronized (deliverLock) {
            List<Delivery> out = new ArrayList<>();
            synchronized (this) {
                for (Board b : boards.values()) out.add(step(b, Math.max(0, dtSec)));
            }
            out.forEach(this::deliver);
        }
    }

    static String statusOf(double gap, int warnPp, int delayPp) {
        return gap <= warnPp ? "ok" : gap <= delayPp ? "warn" : "bad";
    }

    static int stepOf(double actual, int n) {
        return Math.max(1, Math.min(n, (int) Math.floor(actual / 100 * n) + 1));
    }

    /* ---------------- 테스트용 ---------------- */

    void useClock(Clock c) {
        clock = c;
    }

    void setTimeScale(double s) {
        scale = s;
    }

    /** 한 스테이션의 실적·목표·속도를 바로 정함 (이벤트 없음) */
    synchronized void override(long drawingId, long stationId, double actual, double target, double rate) {
        Board b = boardOf(drawingId);
        if (b == null) return;
        for (Unit u : b.units)
            if (u.s.id() == stationId) {
                u.actual = actual;
                u.target = target;
                u.rate = rate;
                u.step = stepOf(actual, u.s.steps().size());
                u.status = statusOf(target - actual, u.s.warnPp(), u.s.delayPp());
            }
    }

    synchronized void unloadAll() {
        boards.clear();
        listeners.clear();
        lastTick = -1;
    }

    /** 구독자 목록이 남아 있는지 (모두 빠지면 목록도 지워져야 함) */
    boolean hasListeners(long drawingId) {
        return listeners.containsKey(drawingId);
    }

    synchronized Set<Long> loaded() {
        return Set.copyOf(boards.keySet());
    }

    /* ---------------- 내부 ---------------- */

    private Board boardOf(long drawingId) {
        Board b = boards.get(drawingId);
        if (b == null) {
            b = load(drawingId);
            if (b != null) boards.put(drawingId, b);
        }
        return b;
    }

    /** DB 기준정보로 처음 상태를 만듦. 공정이 없으면 null */
    private Board load(long drawingId) {
        List<StationView> list = stationMapper.findByDrawing(drawingId);
        if (list.isEmpty()) return null;
        Map<String, double[]> start = seeds.startValues(drawingId);
        Board b = new Board(drawingId);
        for (ProjectView p : projectMapper.findByDrawing(drawingId)) b.projects.put(p.id(), p);
        for (StationView s : list) {
            Unit u = new Unit(s);
            u.rate = 0.70 + u.rnd.nextDouble() * 0.35;
            double[] sv = start.get(s.name());
            if (sv != null) {
                u.actual = sv[0];
                u.target = sv[1];
            } else {
                u.actual = 30 + u.rnd.nextInt(41);
                u.target = u.actual + u.rnd.nextInt(26);
            }
            u.step = stepOf(u.actual, s.steps().size());
            u.status = statusOf(u.target - u.actual, s.warnPp(), s.delayPp());
            u.nextMaterial = s.materials().isEmpty() ? Double.POSITIVE_INFINITY : 60 + u.rnd.nextDouble() * 120;
            b.units.add(u);
        }
        b.day = today();
        b.doneToday = readDaily(drawingId, b.day);
        return b;
    }

    private Delivery step(Board b, double dt) {
        List<Object> msgs = new ArrayList<>();
        LocalDate today = today();
        if (!today.equals(b.day)) {
            b.day = today;
            b.doneToday = 0;
        }
        double sim = dt * scale;
        b.simT += sim;
        boolean projectsChanged = false;
        for (Unit u : b.units) {
            StationView s = u.s;
            int n = s.steps().size();
            double inc = sim / s.taktSec() * 100;
            u.target += inc;
            u.actual += inc * u.rate;
            while (u.actual >= 100) { // 한 대 완료 → 다음 대 (남은 계획 지연분은 이어짐)
                emit(b, msgs, u, "step_done", s.name() + " " + stepName(s, u.step) + " 완료", Map.of("step", u.step));
                projectsChanged |= unitDone(b, msgs, u);
                u.actual -= 100;
                u.target = Math.max(0, u.target - 100);
                u.step = stepOf(u.actual, n);
                emit(b, msgs, u, "step_start", s.name() + " " + stepName(s, u.step) + " 시작", Map.of("step", u.step));
            }
            int k = stepOf(u.actual, n);
            if (k != u.step) {
                emit(b, msgs, u, "step_done", s.name() + " " + stepName(s, u.step) + " 완료", Map.of("step", u.step));
                u.step = k;
                emit(b, msgs, u, "step_start", s.name() + " " + stepName(s, k) + " 시작", Map.of("step", k));
            }
            String st = statusOf(u.target - u.actual, s.warnPp(), s.delayPp());
            if (!st.equals(u.status)) {
                String text = switch (st) {
                    case "ok" -> s.name() + " 공정 정상화";
                    case "warn" -> s.name() + " 제작 주의";
                    default -> s.name() + " 제작 지연";
                };
                emit(b, msgs, u, "status_change", text, Map.of("from", u.status, "to", st));
                u.status = st;
            }
            if (b.simT >= u.nextMaterial) {
                String mat = s.materials().get(u.rnd.nextInt(s.materials().size()));
                emit(b, msgs, u, "material_in", mat + " 입고 → " + s.name(), Map.of("material", mat));
                emit(b, msgs, u, "move", mat + " 운반 · " + RACK + " → " + s.name(), Map.of("from", RACK, "to", s.name(), "material", mat));
                u.nextMaterial = b.simT + 60 + u.rnd.nextDouble() * 120;
            }
        }
        if (projectsChanged) msgs.add(new LiveMessages.Projects("projects", projectsOf(b)));
        msgs.add(new LiveMessages.Tick("tick", kpi(b), stationsOf(b)));
        return new Delivery(b.drawingId, msgs);
    }

    /** 한 대 완료: 메인 스테이션은 PJT 제작 수 +1 (DB), 모든 완료가 오늘 완료 +1 (DB). PJT 가 바뀌었으면 true */
    private boolean unitDone(Board b, List<Object> msgs, Unit u) {
        StationView s = u.s;
        ProjectView p = s.projectId() == null ? null : b.projects.get(s.projectId());
        boolean changed = false;
        String text;
        Map<String, Object> data = new LinkedHashMap<>();
        if (s.countsProject() && p != null) {
            int done = Math.min(p.total(), p.done() + 1);
            if (done != p.done()) {
                p = new ProjectView(p.id(), p.name(), done, p.total(), p.period(), p.state(), p.sortOrder());
                b.projects.put(p.id(), p);
                persistDone(p);
                changed = true;
            }
            text = s.name() + " · " + p.name() + " " + done + "호기 완료";
            data.put("project", p.name());
            data.put("unitNo", done);
        } else {
            text = s.name() + " 1대 조립 완료";
        }
        b.doneToday++;
        persistDaily(b.drawingId, b.day);
        u.rate = Math.max(0.6, Math.min(1.1, u.rate + (u.rnd.nextDouble() * 0.16 - 0.08)));
        emit(b, msgs, u, "unit_done", text, data);
        return changed;
    }

    private void emit(Board b, List<Object> msgs, Unit u, String kind, String text, Map<String, Object> data) {
        var e = new LiveEvent(eventIds.incrementAndGet(), now(), kind, u.s.name(), text, data);
        if (!kind.startsWith("step_")) {
            b.events.addFirst(e);
            while (b.events.size() > MAX_EVENTS) b.events.removeLast();
        }
        if (kind.equals("material_in")) {
            b.materials.addFirst(e);
            while (b.materials.size() > MAX_MATERIALS) b.materials.removeLast();
        }
        msgs.add(new LiveMessages.EventMessage("event", e));
    }

    private void deliver(Delivery d) {
        List<LiveListener> list = listeners.get(d.drawingId());
        if (list == null || list.isEmpty()) return;
        for (LiveListener l : list)
            for (Object m : d.messages()) {
                try {
                    l.onMessage(m);
                } catch (RuntimeException e) {
                    log.debug("상황판 전달 실패: {}", e.getMessage());
                }
            }
    }

    private Kpi kpi(Board b) {
        int ok = 0, warn = 0, bad = 0;
        double rate = 0;
        for (Unit u : b.units) {
            switch (u.status) {
                case "ok" -> ok++;
                case "warn" -> warn++;
                default -> bad++;
            }
            rate += Math.min(1, u.actual / Math.max(1, u.target));
        }
        int n = b.units.size();
        return new Kpi(n, ok, warn, bad, b.doneToday, n == 0 ? 0 : (int) Math.round(rate / n * 100), now());
    }

    private List<StationLive> stationsOf(Board b) {
        List<StationLive> out = new ArrayList<>();
        for (Unit u : b.units) {
            StationView s = u.s;
            ProjectView p = s.projectId() == null ? null : b.projects.get(s.projectId());
            out.add(new StationLive(s.id(), s.no(), s.name(), s.placementName(), s.steps(), u.step, round1(u.actual), round1(u.target),
                    u.status, p == null ? null : p.id(), p == null ? null : Math.min(p.total(), p.done() + 1)));
        }
        return out;
    }

    private static List<ProjectLive> projectsOf(Board b) {
        return b.projects.values().stream().map(p -> new ProjectLive(p.id(), p.name(), p.done(), p.total(), p.period(), p.state())).toList();
    }

    private LiveMessages.Snapshot snapshotOf(Board b) {
        return new LiveMessages.Snapshot("snapshot", b.drawingId, kpi(b), stationsOf(b), projectsOf(b), List.copyOf(b.events),
                List.copyOf(b.materials));
    }

    private LiveMessages.Snapshot empty(long drawingId) {
        return new LiveMessages.Snapshot("snapshot", drawingId, new Kpi(0, 0, 0, 0, 0, 0, now()), List.of(), List.of(), List.of(), List.of());
    }

    private void persistDone(ProjectView p) {
        try {
            projectMapper.setDone(p.id(), p.done());
        } catch (RuntimeException e) {
            log.warn("PJT 제작 수를 저장하지 못했습니다: {}", e.getMessage());
        }
    }

    private void persistDaily(long drawingId, LocalDate day) {
        try {
            jdbc.update("insert into live_daily (drawing_id, day, done) values (?, ?, 1) "
                    + "on conflict (drawing_id, day) do update set done = live_daily.done + 1", drawingId, day);
        } catch (RuntimeException e) {
            log.warn("오늘 완료 수를 저장하지 못했습니다: {}", e.getMessage());
        }
    }

    private int readDaily(long drawingId, LocalDate day) {
        List<Integer> r = jdbc.queryForList("select done from live_daily where drawing_id = ? and day = ?", Integer.class, drawingId, day);
        return r.isEmpty() ? 0 : r.get(0);
    }

    private static String stepName(StationView s, int step) {
        return s.steps().get(Math.max(1, Math.min(step, s.steps().size())) - 1);
    }

    private static double round1(double v) {
        return Math.round(v * 10) / 10.0;
    }

    private LocalDate today() {
        return LocalDate.ofInstant(clock.instant(), zone);
    }

    private String now() {
        return Instant.now(clock).toString();
    }
}
