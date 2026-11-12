package com.kopens.factory3d.placement;

import com.kopens.factory3d.audit.AuditService;
import com.kopens.factory3d.common.BadRequestException;
import com.kopens.factory3d.common.ConflictException;
import com.kopens.factory3d.common.NotFoundException;
import com.kopens.factory3d.drawing.DrawingMapper;
import com.kopens.factory3d.model.ModelMapper;
import java.util.HashSet;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 도면별 객체 배치 */
@Service
public class PlacementService {
    public record NewPlacement(Long modelId, String name, Double x, Double y, Double rot, String hintLabel) {}

    public record Patch(String name, Double x, Double y, Double rot, Long modelId, Boolean clearModel) {}

    private final PlacementMapper placements;
    private final DrawingMapper drawings;
    private final ModelMapper models;
    private final AuditService audit;

    public PlacementService(PlacementMapper placements, DrawingMapper drawings, ModelMapper models, AuditService audit) {
        this.placements = placements;
        this.drawings = drawings;
        this.models = models;
        this.audit = audit;
    }

    public List<PlacementView> list(long drawingId) {
        requireDrawing(drawingId);
        return placements.findByDrawing(drawingId);
    }

    @Transactional
    public List<PlacementView> create(long drawingId, List<NewPlacement> items) {
        requireDrawing(drawingId);
        if (items == null || items.isEmpty() || items.size() > 2000) throw new BadRequestException("추가할 객체는 1~2000개여야 합니다.");
        List<PlacementMapper.NewRow> rows = items.stream().map(this::toRow).toList();
        insertAll(drawingId, rows);
        audit.log("PLACEMENT_CREATE", "drawing=" + drawingId, rows.size() + "개");
        return rows.stream().map(r -> placements.findById(r.id)).toList();
    }

    /** 첫 실행 기본 배치 (검사 생략, 감사는 system) */
    @Transactional
    public int createSeed(long drawingId, List<PlacementMapper.NewRow> rows) {
        insertAll(drawingId, rows);
        audit.logAs("system", "PLACEMENT_SEED", "drawing=" + drawingId, rows.size() + "개");
        return rows.size();
    }

    @Transactional
    public PlacementView update(long id, Patch p) {
        PlacementView cur = placements.findById(id);
        if (cur == null) throw new NotFoundException("객체를 찾을 수 없습니다.");
        long drawingId = placements.drawingOf(id);
        String name = p.name() == null ? cur.name() : checkName(p.name());
        if (!name.equals(cur.name()) && placements.countNames(drawingId, List.of(name), id) > 0)
            throw new ConflictException("같은 이름의 객체가 이 도면에 있습니다.");
        Long modelId = Boolean.TRUE.equals(p.clearModel()) ? null : p.modelId() != null ? requireModel(p.modelId()) : cur.modelId();
        double x = p.x() == null ? cur.x() : finite(p.x());
        double y = p.y() == null ? cur.y() : finite(p.y());
        double rot = p.rot() == null ? cur.rot() : finite(p.rot());
        placements.update(id, modelId, name, x, y, rot);
        audit.log("PLACEMENT_UPDATE", name, "id=" + id);
        return placements.findById(id);
    }

    @Transactional
    public void delete(long id) {
        PlacementView cur = placements.findById(id);
        if (cur == null) throw new NotFoundException("객체를 찾을 수 없습니다.");
        placements.delete(id);
        audit.log("PLACEMENT_DELETE", cur.name(), "id=" + id);
    }

    /** 도면 보정: 그 도면 모든 배치 좌표 k 배 */
    public void scale(long drawingId, double k) {
        placements.scale(drawingId, k);
    }

    private void insertAll(long drawingId, List<PlacementMapper.NewRow> rows) {
        List<String> names = rows.stream().map(r -> r.name).toList();
        if (new HashSet<>(names).size() != names.size() || placements.countNames(drawingId, names, null) > 0)
            throw new ConflictException("같은 이름의 객체가 이 도면에 있습니다.");
        for (var r : rows) placements.insert(drawingId, r);
    }

    private PlacementMapper.NewRow toRow(NewPlacement n) {
        var r = new PlacementMapper.NewRow();
        r.modelId = n.modelId() == null ? null : requireModel(n.modelId());
        r.name = checkName(n.name());
        r.x = finite(n.x());
        r.y = finite(n.y());
        r.rot = n.rot() == null ? 0 : finite(n.rot());
        r.hintLabel = n.hintLabel() == null || n.hintLabel().isBlank() ? null : n.hintLabel().strip();
        if (r.hintLabel != null && r.hintLabel.length() > 100) r.hintLabel = r.hintLabel.substring(0, 100);
        return r;
    }

    private void requireDrawing(long id) {
        if (drawings.findById(id) == null) throw new NotFoundException("도면을 찾을 수 없습니다.");
    }

    private Long requireModel(long id) {
        if (models.findById(id) == null) throw new BadRequestException("모델을 찾을 수 없습니다.");
        return id;
    }

    private static String checkName(String name) {
        String n = name == null ? "" : name.strip();
        if (n.isEmpty() || n.length() > 100) throw new BadRequestException("객체 이름은 1~100자로 입력하세요.");
        return n;
    }

    private static double finite(Double v) {
        if (v == null || !Double.isFinite(v)) throw new BadRequestException("좌표가 올바르지 않습니다.");
        return v;
    }
}
