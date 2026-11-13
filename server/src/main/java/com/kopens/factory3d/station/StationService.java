package com.kopens.factory3d.station;

import com.kopens.factory3d.audit.AuditService;
import com.kopens.factory3d.common.BadRequestException;
import com.kopens.factory3d.common.ConflictException;
import com.kopens.factory3d.common.NotFoundException;
import com.kopens.factory3d.drawing.DrawingMapper;
import java.util.HashSet;
import java.util.List;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 공정 기준정보 (도면별, 순서 = 칩 번호). 저장할 때마다 StationsChanged */
@Service
public class StationService {
    /** 추가·수정 공통. 수정에서 null 은 그대로, clearPlacement·clearProject 로 비움 */
    public record StationInput(String name, String placementName, Boolean clearPlacement, List<String> steps, Integer taktSec,
            Integer warnPp, Integer delayPp, Long projectId, Boolean clearProject, Boolean countsProject, List<String> materials) {}

    static final String STEPS_ERROR = "step 은 1~40개, 각 1~100자로 입력하세요.";
    static final String MATERIALS_ERROR = "입고 자재는 40개까지, 각 1~100자로 입력하세요.";

    private final StationMapper stations;
    private final ProjectMapper projects;
    private final DrawingMapper drawings;
    private final AuditService audit;
    private final ApplicationEventPublisher events;

    public StationService(StationMapper stations, ProjectMapper projects, DrawingMapper drawings, AuditService audit,
            ApplicationEventPublisher events) {
        this.stations = stations;
        this.projects = projects;
        this.drawings = drawings;
        this.audit = audit;
        this.events = events;
    }

    public List<StationView> list(long drawingId) {
        requireDrawing(drawingId);
        return stations.findByDrawing(drawingId);
    }

    @Transactional
    public StationView create(long drawingId, StationInput in) {
        requireDrawing(drawingId);
        StationMapper.Row r = merge(drawingId, null, null, in);
        r.no = stations.countByDrawing(drawingId) + 1;
        stations.insert(drawingId, r);
        audit.log("STATION_CREATE", r.name, "drawing=" + drawingId + " id=" + r.id);
        events.publishEvent(new StationsChanged(drawingId));
        return stations.findById(r.id);
    }

    @Transactional
    public StationView update(long id, StationInput in) {
        StationView cur = require(id);
        long drawingId = stations.drawingOf(id);
        StationMapper.Row r = merge(drawingId, id, cur, in);
        stations.update(id, r);
        audit.log("STATION_UPDATE", r.name, "drawing=" + drawingId + " id=" + id);
        events.publishEvent(new StationsChanged(drawingId));
        return stations.findById(id);
    }

    @Transactional
    public void delete(long id) {
        StationView cur = require(id);
        long drawingId = stations.drawingOf(id);
        stations.delete(id);
        List<StationView> rest = stations.findByDrawing(drawingId);
        for (int i = 0; i < rest.size(); i++) if (rest.get(i).no() != i + 1) stations.setOrder(rest.get(i).id(), i + 1);
        audit.log("STATION_DELETE", cur.name(), "drawing=" + drawingId + " id=" + id);
        events.publishEvent(new StationsChanged(drawingId));
    }

    @Transactional
    public List<StationView> order(long drawingId, List<Long> ids) {
        requireDrawing(drawingId);
        List<Long> cur = stations.findByDrawing(drawingId).stream().map(StationView::id).toList();
        if (ids == null || ids.size() != cur.size() || new HashSet<>(ids).size() != ids.size() || !new HashSet<>(cur).containsAll(ids))
            throw new BadRequestException("순서에는 이 도면의 모든 공정이 한 번씩 있어야 합니다.");
        for (int i = 0; i < ids.size(); i++) stations.setOrder(ids.get(i), i + 1);
        audit.log("STATION_ORDER", "drawing=" + drawingId, ids.toString());
        events.publishEvent(new StationsChanged(drawingId));
        return stations.findByDrawing(drawingId);
    }

    /** cur == null 이면 추가 (기본값: 택타임 1200 · 주의 10 · 지연 20 · 셈 안 함 · 자재 없음) */
    private StationMapper.Row merge(long drawingId, Long selfId, StationView cur, StationInput in) {
        var r = new StationMapper.Row();
        r.name = in.name() != null ? checkName(in.name()) : cur != null ? cur.name() : checkName(null);
        if ((cur == null || !r.name.equals(cur.name())) && stations.existsByName(drawingId, r.name, selfId))
            throw new ConflictException("같은 이름의 공정이 있습니다.");
        r.placementName = Boolean.TRUE.equals(in.clearPlacement()) ? null
                : in.placementName() != null ? optionalName(in.placementName()) : cur != null ? cur.placementName() : null;
        r.steps = in.steps() != null || cur == null ? checkSteps(in.steps()) : cur.steps().toArray(String[]::new);
        r.taktSec = in.taktSec() != null ? checkTakt(in.taktSec()) : cur != null ? cur.taktSec() : 1200;
        r.warnPp = in.warnPp() != null ? in.warnPp() : cur != null ? cur.warnPp() : 10;
        r.delayPp = in.delayPp() != null ? in.delayPp() : cur != null ? cur.delayPp() : 20;
        if (!(0 <= r.warnPp && r.warnPp < r.delayPp && r.delayPp <= 100))
            throw new BadRequestException("주의·지연 기준은 0 ≤ 주의 < 지연 ≤ 100 이어야 합니다.");
        r.projectId = Boolean.TRUE.equals(in.clearProject()) ? null
                : in.projectId() != null ? requireProject(drawingId, in.projectId()) : cur != null ? cur.projectId() : null;
        r.countsProject = in.countsProject() != null ? in.countsProject() : cur != null && cur.countsProject();
        r.materials = in.materials() != null ? checkList(in.materials(), 0, MATERIALS_ERROR)
                : cur != null ? cur.materials().toArray(String[]::new) : new String[0];
        return r;
    }

    private StationView require(long id) {
        StationView s = stations.findById(id);
        if (s == null) throw new NotFoundException("공정을 찾을 수 없습니다.");
        return s;
    }

    private void requireDrawing(long id) {
        if (drawings.findById(id) == null) throw new NotFoundException("도면을 찾을 수 없습니다.");
    }

    private Long requireProject(long drawingId, long projectId) {
        Long d = projects.drawingOf(projectId);
        if (d == null || d != drawingId) throw new BadRequestException("이 도면의 PJT 가 아닙니다.");
        return projectId;
    }

    private static String checkName(String name) {
        String n = name == null ? "" : name.strip();
        if (n.isEmpty() || n.length() > 100) throw new BadRequestException("공정 이름은 1~100자로 입력하세요.");
        return n;
    }

    private static String optionalName(String name) {
        String n = name.strip();
        if (n.length() > 100) throw new BadRequestException("연결 설비 이름은 100자까지입니다.");
        return n.isEmpty() ? null : n;
    }

    private static String[] checkSteps(List<String> steps) {
        return checkList(steps, 1, STEPS_ERROR);
    }

    /** 각 항목 앞뒤 공백 제거, 1~100자, 개수 min~40 */
    private static String[] checkList(List<String> items, int min, String error) {
        if (items == null || items.size() < min || items.size() > 40) throw new BadRequestException(error);
        String[] out = new String[items.size()];
        for (int i = 0; i < out.length; i++) {
            String s = items.get(i) == null ? "" : items.get(i).strip();
            if (s.isEmpty() || s.length() > 100) throw new BadRequestException(error);
            out[i] = s;
        }
        return out;
    }

    private static int checkTakt(int sec) {
        if (sec < 60 || sec > 604800) throw new BadRequestException("택타임은 60~604800초(1분~7일)여야 합니다.");
        return sec;
    }
}
