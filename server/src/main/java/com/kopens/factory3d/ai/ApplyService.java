package com.kopens.factory3d.ai;

import static com.kopens.factory3d.change.Snapshots.text;

import com.kopens.factory3d.audit.AuditService;
import com.kopens.factory3d.change.ChangeLogService;
import com.kopens.factory3d.change.PlanEdits;
import com.kopens.factory3d.change.Snapshots;
import com.kopens.factory3d.common.ConflictException;
import com.kopens.factory3d.common.NotFoundException;
import com.kopens.factory3d.drawing.DrawingDetail;
import com.kopens.factory3d.drawing.DrawingMapper;
import com.kopens.factory3d.model.ModelMapper;
import com.kopens.factory3d.placement.PlacementMapper;
import com.kopens.factory3d.placement.PlacementView;
import com.kopens.factory3d.station.StationMapper;
import com.kopens.factory3d.station.StationView;
import com.kopens.factory3d.station.StationsChanged;
import java.util.ArrayList;
import java.util.List;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * AI 제안 묶음 적용: 한 트랜잭션 · 항목마다 DB 의 지금 값이 제안의 before 와 같을 때만 · 적용한 항목은 change_log(AI).
 * 다른 서비스를 부르지 않고 mapper 로 직접 (서비스 예외가 트랜잭션을 rollback-only 로 만들지 않게 — 검사는 여기서)
 */
@Service
public class ApplyService {
    static final String NO_PROPOSAL = "제안을 찾을 수 없습니다. (이미 적용·취소했거나 대화가 비워졌습니다)";
    static final String CHANGED = "제안 뒤에 다른 곳에서 바뀌었습니다";

    public record Skip(int seq, String reason) {}

    public record Result(String batchId, long drawingId, int applied, List<Skip> skipped) {}

    private record Applied(Changeset.Item item, String targetKey, Object before, Object after) {}

    private final ProposalStore store;
    private final PlacementMapper placements;
    private final StationMapper stations;
    private final DrawingMapper drawings;
    private final ModelMapper models;
    private final ChangeLogService changes;
    private final AuditService audit;
    private final ApplicationEventPublisher events;
    private final ObjectMapper json;

    public ApplyService(ProposalStore store, PlacementMapper placements, StationMapper stations, DrawingMapper drawings, ModelMapper models,
            ChangeLogService changes, AuditService audit, ApplicationEventPublisher events, ObjectMapper json) {
        this.store = store;
        this.placements = placements;
        this.stations = stations;
        this.drawings = drawings;
        this.models = models;
        this.changes = changes;
        this.audit = audit;
        this.events = events;
        this.json = json;
    }

    @Transactional
    public Result apply(String user, boolean admin, String batchId) {
        ProposalStore.Conversation c = store.byChangeset(user, batchId).orElseThrow(() -> new NotFoundException(NO_PROPOSAL));
        if (!c.lock.tryLock()) throw new ConflictException("AI 가 아직 답하는 중입니다. 끝난 뒤 다시 누르세요.");
        try {
            Changeset cs = c.changeset;
            if (!cs.id().equals(batchId)) throw new NotFoundException(NO_PROPOSAL);
            long drawingId = c.drawingId;
            DrawingDetail d = drawings.findById(drawingId);
            if (d == null) throw new NotFoundException("도면을 찾을 수 없습니다.");
            ObjectNode plan = (ObjectNode) json.readTree(d.plan());
            boolean planChanged = false, stationsChanged = false;
            List<Applied> done = new ArrayList<>();
            List<Skip> skipped = new ArrayList<>();
            for (Changeset.Item it : cs.items()) {
                String why;
                if (it.kind().startsWith("placement.")) why = placement(it, drawingId, done);
                else if (it.kind().equals("station.update")) {
                    why = admin ? station(it, done) : "공정 기준정보는 관리자만 바꿀 수 있습니다";
                    stationsChanged |= why == null;
                } else {
                    why = plan(it, plan, done);
                    planChanged |= why == null;
                }
                if (why != null) skipped.add(new Skip(it.seq(), why));
            }
            if (planChanged && drawings.updatePlan(drawingId, d.version(), plan.toString(), d.layerRules()) == 0)
                throw new ConflictException("도면이 그 사이 바뀌었습니다. 새 대화로 다시 요청하세요.");
            for (Applied a : done)
                changes.record(user, "AI", drawingId, cs.id(), a.item().kind(), a.item().target(), a.targetKey(), a.before(), a.after());
            if (stationsChanged) events.publishEvent(new StationsChanged(drawingId));
            audit.logAs(user, "AI_APPLY", "drawing=" + drawingId, done.size() + "건 적용, " + skipped.size() + "건 건너뜀");
            c.finish("[직전 제안 묶음: " + done.size() + "건 적용" + (skipped.isEmpty() ? "" : ", " + skipped.size() + "건 건너뜀") + "]");
            return new Result(cs.id(), drawingId, done.size(), skipped);
        } finally {
            c.lock.unlock();
        }
    }

    public void discard(String user, String batchId) {
        ProposalStore.Conversation c = store.byChangeset(user, batchId).orElseThrow(() -> new NotFoundException(NO_PROPOSAL));
        if (!c.lock.tryLock()) throw new ConflictException("AI 가 아직 답하는 중입니다. 끝난 뒤 다시 누르세요.");
        try {
            c.finish("[직전 제안 묶음: 사용자가 취소함]");
        } finally {
            c.lock.unlock();
        }
    }

    private String placement(Changeset.Item it, long drawingId, List<Applied> done) {
        JsonNode a = it.after();
        if (it.kind().equals("placement.add")) {
            String name = text(a, "name");
            if (placements.countNames(drawingId, List.of(name), null) > 0) return "같은 이름의 객체가 이미 있습니다: " + name;
            Long modelId = Snapshots.longOrNull(a, "modelId");
            if (modelId != null && models.findById(modelId) == null) return "모델이 지워졌습니다";
            var row = new PlacementMapper.NewRow();
            row.modelId = modelId;
            row.name = name;
            row.x = a.path("x").asDouble();
            row.y = a.path("y").asDouble();
            row.rot = a.path("rot").asDouble();
            placements.insert(drawingId, row);
            PlacementView v = placements.findById(row.id);
            done.add(new Applied(it, "placement:" + row.id, null, Snapshots.placement(json, v)));
            return null;
        }
        long id = Snapshots.idOf(it.targetKey());
        PlacementView cur = placements.findById(id);
        if (cur == null) return "객체가 이미 지워졌습니다";
        if (!Snapshots.samePlacement(cur, it.before())) return CHANGED;
        if (it.kind().equals("placement.delete")) {
            placements.delete(id);
            done.add(new Applied(it, it.targetKey(), Snapshots.placement(json, cur), null));
            return null;
        }
        String name = text(a, "name");
        if (!name.equals(cur.name()) && placements.countNames(drawingId, List.of(name), id) > 0) return "같은 이름의 객체가 이미 있습니다: " + name;
        placements.update(id, cur.modelId(), name, a.path("x").asDouble(), a.path("y").asDouble(), a.path("rot").asDouble());
        done.add(new Applied(it, it.targetKey(), Snapshots.placement(json, cur), Snapshots.placement(json, placements.findById(id))));
        return null;
    }

    private String station(Changeset.Item it, List<Applied> done) {
        long id = Snapshots.idOf(it.targetKey());
        StationView cur = stations.findById(id);
        if (cur == null) return "공정이 이미 지워졌습니다";
        if (!Snapshots.sameStation(cur, it.before())) return CHANGED;
        JsonNode a = it.after();
        StationMapper.Row r = Snapshots.stationRow(cur);
        r.placementName = text(a, "placementName");
        r.taktSec = a.path("taktSec").asInt();
        r.warnPp = a.path("warnPp").asInt();
        r.delayPp = a.path("delayPp").asInt();
        stations.update(id, r);
        done.add(new Applied(it, it.targetKey(), Snapshots.station(json, cur), Snapshots.station(json, stations.findById(id))));
        return null;
    }

    private String plan(Changeset.Item it, ObjectNode plan, List<Applied> done) {
        ArrayNode parts = PlanEdits.partitions(plan);
        switch (it.kind()) {
            case "plan.partition.add" -> {
                if (PlanEdits.indexOf(parts, text(it.after(), "id")) >= 0) return "같은 id 의 가벽이 이미 있습니다";
                parts.add(it.after().deepCopy());
            }
            case "plan.partition.delete" -> {
                int i = PlanEdits.indexOf(parts, text(it.before(), "id"));
                if (i < 0) return "가벽이 이미 없습니다";
                if (!parts.get(i).equals(it.before())) return CHANGED;
                parts.remove(i);
            }
            case "plan.text.rename" -> {
                int i = PlanEdits.textIndex(plan, it.after());
                if (i < 0) return "글자가 이미 없습니다";
                ObjectNode t = (ObjectNode) PlanEdits.texts(plan).get(i);
                if (!t.path("str").asString("").equals(text(it.before(), "str"))) return CHANGED;
                t.put("str", text(it.after(), "str"));
            }
            case "plan.text.add" -> {
                if (PlanEdits.textIndex(plan, it.after()) >= 0) return "같은 id 의 글자가 이미 있습니다";
                PlanEdits.texts(plan).add(it.after().deepCopy());
            }
            case "plan.text.delete" -> {
                int i = PlanEdits.textIndex(plan, it.before());
                if (i < 0) return "글자가 이미 없습니다";
                if (!PlanEdits.texts(plan).get(i).path("str").asString("").equals(text(it.before(), "str"))) return CHANGED;
                PlanEdits.texts(plan).remove(i);
            }
            case "plan.zone.rename" -> {
                ObjectNode z = PlanEdits.zone(plan, text(it.after(), "id"));
                if (z == null) return "구역이 이미 없습니다";
                if (!z.path("name").asString().equals(text(it.before(), "name"))) return CHANGED;
                z.put("name", text(it.after(), "name"));
            }
            default -> {
                return "모르는 종류입니다: " + it.kind();
            }
        }
        done.add(new Applied(it, it.targetKey(), it.before(), it.after()));
        return null;
    }
}
