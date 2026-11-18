package com.kopens.factory3d.change;

import static com.kopens.factory3d.change.Snapshots.text;

import com.kopens.factory3d.audit.AuditService;
import com.kopens.factory3d.common.ConflictException;
import com.kopens.factory3d.common.ForbiddenException;
import com.kopens.factory3d.common.NotFoundException;
import com.kopens.factory3d.drawing.DrawingDetail;
import com.kopens.factory3d.drawing.DrawingMapper;
import com.kopens.factory3d.model.ModelMapper;
import com.kopens.factory3d.placement.PlacementMapper;
import com.kopens.factory3d.placement.PlacementView;
import com.kopens.factory3d.station.StationMapper;
import com.kopens.factory3d.station.StationView;
import com.kopens.factory3d.station.StationsChanged;
import java.util.List;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/** 변경 묶음 되돌리기 (사람·AI 공통): 뒤에서부터 before 로 역적용, 한 트랜잭션. 하나라도 못 하면 409 로 전부 취소 */
@Service
public class RevertService {
    static final String LATER = "이후에 바뀐 객체가 있어 되돌릴 수 없습니다";

    public record Result(String batchId, int reverted) {}

    private final ChangeLogService changes;
    private final PlacementMapper placements;
    private final StationMapper stations;
    private final DrawingMapper drawings;
    private final ModelMapper models;
    private final AuditService audit;
    private final ApplicationEventPublisher events;
    private final ObjectMapper json;

    public RevertService(ChangeLogService changes, PlacementMapper placements, StationMapper stations, DrawingMapper drawings,
            ModelMapper models, AuditService audit, ApplicationEventPublisher events, ObjectMapper json) {
        this.changes = changes;
        this.placements = placements;
        this.stations = stations;
        this.drawings = drawings;
        this.models = models;
        this.audit = audit;
        this.events = events;
        this.json = json;
    }

    @Transactional
    public Result revert(String user, boolean admin, String batchId) {
        List<ChangeEntry> rows = changes.batch(batchId);
        if (rows.isEmpty()) throw new NotFoundException("변경 묶음을 찾을 수 없습니다.");
        if (rows.stream().allMatch(ChangeEntry::reverted)) throw new ConflictException("이미 되돌린 묶음입니다.");
        if (!admin && rows.stream().anyMatch(r -> !user.equals(r.username()))) throw new ForbiddenException("자기가 한 변경만 되돌릴 수 있습니다.");
        if (!admin && rows.stream().anyMatch(r -> r.kind().startsWith("station.")))
            throw new ForbiddenException("공정 기준정보 변경은 관리자만 되돌릴 수 있습니다.");
        long drawingId = rows.get(0).drawingId();
        long maxId = rows.stream().mapToLong(ChangeEntry::id).max().orElseThrow();
        List<String> keys = rows.stream().map(ChangeEntry::targetKey).distinct().toList();
        if (changes.mapper().countLater(drawingId, keys, maxId, batchId) > 0) throw new ConflictException(LATER);

        DrawingDetail d = drawings.findById(drawingId);
        ObjectNode plan = (ObjectNode) json.readTree(d.plan());
        boolean planChanged = false, stationsChanged = false;
        for (ChangeEntry r : rows.reversed()) {
            JsonNode before = r.before() == null ? null : json.readTree(r.before());
            JsonNode after = r.after() == null ? null : json.readTree(r.after());
            if (r.kind().startsWith("placement.")) placement(r, drawingId, before, after);
            else if (r.kind().equals("station.update")) {
                station(r, before, after);
                stationsChanged = true;
            } else {
                plan(r, plan, before, after);
                planChanged = true;
            }
        }
        if (planChanged && drawings.updatePlan(drawingId, d.version(), plan.toString(), d.layerRules()) == 0) throw new ConflictException(LATER);
        changes.mapper().markReverted(batchId, user);
        if (stationsChanged) events.publishEvent(new StationsChanged(drawingId));
        audit.logAs(user, "CHANGE_REVERT", "drawing=" + drawingId, batchId + " (" + rows.size() + "건)");
        return new Result(batchId, rows.size());
    }

    private void placement(ChangeEntry r, long drawingId, JsonNode before, JsonNode after) {
        long id = Snapshots.idOf(r.targetKey());
        PlacementView cur = placements.findById(id);
        switch (r.kind()) {
            case "placement.add" -> {
                if (cur == null || !Snapshots.samePlacement(cur, after)) throw new ConflictException(LATER);
                placements.delete(id);
            }
            case "placement.delete" -> {
                String name = text(before, "name");
                if (placements.countNames(drawingId, List.of(name), null) > 0) throw new ConflictException("같은 이름의 객체가 있어 되돌릴 수 없습니다");
                Long modelId = Snapshots.longOrNull(before, "modelId");
                var row = new PlacementMapper.NewRow();
                row.modelId = modelId != null && models.findById(modelId) != null ? modelId : null;
                row.name = name;
                row.x = before.path("x").asDouble();
                row.y = before.path("y").asDouble();
                row.rot = before.path("rot").asDouble();
                row.hintLabel = text(before, "hintLabel");
                placements.insert(drawingId, row);
            }
            default -> {
                if (cur == null || !Snapshots.samePlacement(cur, after)) throw new ConflictException(LATER);
                String name = text(before, "name");
                if (!name.equals(cur.name()) && placements.countNames(drawingId, List.of(name), id) > 0)
                    throw new ConflictException("같은 이름의 객체가 있어 되돌릴 수 없습니다");
                Long modelId = Snapshots.longOrNull(before, "modelId");
                placements.update(id, modelId != null && models.findById(modelId) == null ? null : modelId, name,
                        before.path("x").asDouble(), before.path("y").asDouble(), before.path("rot").asDouble());
            }
        }
    }

    private void station(ChangeEntry r, JsonNode before, JsonNode after) {
        StationView cur = stations.findById(Snapshots.idOf(r.targetKey()));
        if (cur == null || !Snapshots.sameStation(cur, after)) throw new ConflictException(LATER);
        StationMapper.Row row = Snapshots.stationRow(cur);
        row.placementName = text(before, "placementName");
        row.taktSec = before.path("taktSec").asInt();
        row.warnPp = before.path("warnPp").asInt();
        row.delayPp = before.path("delayPp").asInt();
        stations.update(cur.id(), row);
    }

    private void plan(ChangeEntry r, ObjectNode plan, JsonNode before, JsonNode after) {
        ArrayNode parts = PlanEdits.partitions(plan);
        switch (r.kind()) {
            case "plan.partition.add" -> {
                int i = PlanEdits.indexOf(parts, text(after, "id"));
                if (i < 0 || !parts.get(i).equals(after)) throw new ConflictException(LATER);
                parts.remove(i);
            }
            case "plan.partition.delete" -> {
                if (PlanEdits.indexOf(parts, text(before, "id")) >= 0) throw new ConflictException(LATER);
                parts.add(before.deepCopy());
            }
            case "plan.text.rename" -> {
                int i = PlanEdits.textIndex(plan, after);
                ObjectNode t = i < 0 ? null : (ObjectNode) PlanEdits.texts(plan).get(i);
                if (t == null || !t.path("str").asString("").equals(text(after, "str"))) throw new ConflictException(LATER);
                t.put("str", text(before, "str"));
            }
            case "plan.text.add" -> {
                int i = PlanEdits.textIndex(plan, after);
                if (i < 0 || !PlanEdits.texts(plan).get(i).path("str").asString("").equals(text(after, "str"))) throw new ConflictException(LATER);
                PlanEdits.texts(plan).remove(i);
            }
            case "plan.text.delete" -> {
                if (PlanEdits.textIndex(plan, before) >= 0) throw new ConflictException(LATER);
                PlanEdits.texts(plan).add(before.deepCopy());
            }
            case "plan.zone.rename" -> {
                ObjectNode z = PlanEdits.zone(plan, text(after, "id"));
                if (z == null || !z.path("name").asString().equals(text(after, "name"))) throw new ConflictException(LATER);
                z.put("name", text(before, "name"));
            }
            default -> throw new ConflictException("되돌릴 수 없는 종류입니다: " + r.kind());
        }
    }
}
