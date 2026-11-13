package com.kopens.factory3d.station;

import com.kopens.factory3d.audit.AuditService;
import com.kopens.factory3d.common.BadRequestException;
import com.kopens.factory3d.common.ConflictException;
import com.kopens.factory3d.common.NotFoundException;
import com.kopens.factory3d.drawing.DrawingMapper;
import java.util.List;
import java.util.Set;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** PJT (제작 현황). 저장할 때마다 StationsChanged */
@Service
public class ProjectService {
    /** 추가·수정 공통. 수정에서 null 은 그대로, period "" 는 비움 */
    public record ProjectInput(String name, Integer done, Integer total, String period, String state) {}

    private static final Set<String> STATES = Set.of("run", "wait", "done");

    private final ProjectMapper projects;
    private final DrawingMapper drawings;
    private final AuditService audit;
    private final ApplicationEventPublisher events;

    public ProjectService(ProjectMapper projects, DrawingMapper drawings, AuditService audit, ApplicationEventPublisher events) {
        this.projects = projects;
        this.drawings = drawings;
        this.audit = audit;
        this.events = events;
    }

    public List<ProjectView> list(long drawingId) {
        requireDrawing(drawingId);
        return projects.findByDrawing(drawingId);
    }

    @Transactional
    public ProjectView create(long drawingId, ProjectInput in) {
        requireDrawing(drawingId);
        ProjectMapper.Row r = merge(drawingId, null, null, in);
        r.sortOrder = projects.nextOrder(drawingId);
        projects.insert(drawingId, r);
        audit.log("PROJECT_CREATE", r.name, "drawing=" + drawingId + " id=" + r.id);
        events.publishEvent(new StationsChanged(drawingId));
        return projects.findById(r.id);
    }

    @Transactional
    public ProjectView update(long id, ProjectInput in) {
        ProjectView cur = require(id);
        long drawingId = projects.drawingOf(id);
        ProjectMapper.Row r = merge(drawingId, id, cur, in);
        projects.update(id, r);
        audit.log("PROJECT_UPDATE", r.name, "drawing=" + drawingId + " id=" + id);
        events.publishEvent(new StationsChanged(drawingId));
        return projects.findById(id);
    }

    /** 이 PJT 를 쓰던 공정은 project_id 가 비워짐 (FK on delete set null) */
    @Transactional
    public void delete(long id) {
        ProjectView cur = require(id);
        long drawingId = projects.drawingOf(id);
        projects.delete(id);
        audit.log("PROJECT_DELETE", cur.name(), "drawing=" + drawingId + " id=" + id);
        events.publishEvent(new StationsChanged(drawingId));
    }

    private ProjectMapper.Row merge(long drawingId, Long selfId, ProjectView cur, ProjectInput in) {
        var r = new ProjectMapper.Row();
        r.name = in.name() != null ? checkName(in.name()) : cur != null ? cur.name() : checkName(null);
        if ((cur == null || !r.name.equals(cur.name())) && projects.existsByName(drawingId, r.name, selfId))
            throw new ConflictException("같은 이름의 PJT 가 있습니다.");
        Integer total = in.total() != null ? in.total() : cur != null ? Integer.valueOf(cur.total()) : null;
        int done = in.done() != null ? in.done() : cur != null ? cur.done() : 0;
        if (total == null || total < 1 || done < 0 || done > total)
            throw new BadRequestException("제작 수는 0 ≤ 제작 ≤ 전체, 전체 ≥ 1 이어야 합니다.");
        r.total = total;
        r.done = done;
        String period = in.period() != null ? in.period().strip() : cur != null ? cur.period() : null;
        if (period != null && period.isEmpty()) period = null;
        if (period != null && period.length() > 40) throw new BadRequestException("기간은 40자까지입니다.");
        r.period = period;
        r.state = in.state() != null ? in.state() : cur != null ? cur.state() : "run";
        if (!STATES.contains(r.state)) throw new BadRequestException("상태는 run, wait, done 중 하나입니다.");
        return r;
    }

    private ProjectView require(long id) {
        ProjectView p = projects.findById(id);
        if (p == null) throw new NotFoundException("PJT 를 찾을 수 없습니다.");
        return p;
    }

    private void requireDrawing(long id) {
        if (drawings.findById(id) == null) throw new NotFoundException("도면을 찾을 수 없습니다.");
    }

    private static String checkName(String name) {
        String n = name == null ? "" : name.strip();
        if (n.isEmpty() || n.length() > 100) throw new BadRequestException("PJT 이름은 1~100자로 입력하세요.");
        return n;
    }
}
