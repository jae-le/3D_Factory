package com.kopens.factory3d.ai;

import static com.kopens.factory3d.change.Snapshots.text;

import com.kopens.factory3d.change.Snapshots;
import com.kopens.factory3d.common.NotFoundException;
import com.kopens.factory3d.drawing.DrawingDetail;
import com.kopens.factory3d.drawing.DrawingMapper;
import com.kopens.factory3d.model.ModelInfo;
import com.kopens.factory3d.model.ModelMapper;
import com.kopens.factory3d.placement.PlacementMapper;
import com.kopens.factory3d.placement.PlacementView;
import com.kopens.factory3d.station.StationMapper;
import com.kopens.factory3d.station.StationView;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Claude 에게 주는 도구. 읽기(get_scene)는 DB + 쌓인 제안을 보여 주고, 쓰기는 DB 를 바꾸지 않고 Changeset 에만 쌓는다.
 * 좌표는 plan m (왼쪽 아래 원점, y 위쪽), rot 도·반시계.
 */
@Component
public class SceneTools {
    public record Result(String content, boolean isError, String label) {}

    static final int MAX_OBJECTS = 600;
    static final int MAX_MODELS = 200;
    static final double PARTITION_H = 1.2;
    static final double PARTITION_T = 0.5;
    private static final Pattern PART_ID = Pattern.compile("^p(\\d+)$");

    private final DrawingMapper drawings;
    private final PlacementMapper placements;
    private final ModelMapper models;
    private final StationMapper stations;
    private final ObjectMapper json;
    private final List<ClaudeGateway.ToolSpec> specs;

    public SceneTools(DrawingMapper drawings, PlacementMapper placements, ModelMapper models, StationMapper stations, ObjectMapper json) {
        this.drawings = drawings;
        this.placements = placements;
        this.models = models;
        this.stations = stations;
        this.json = json;
        this.specs = List.of(
                spec("get_scene", "지금 도면의 장면을 읽는다: 도면 크기(m), 구역, 가벽, 배치 객체(이름·모델·위치·회전·크기), 공정 기준정보, 쓸 수 있는 모델, 아직 적용 안 한 제안 수. 바꾸기 전에 먼저 부른다.",
                        "{}", "[]"),
                spec("move_object", "배치 객체를 옮기는 제안. 절대 위치(x, y) 또는 상대 이동(dx, dy, m)을 준다. 오른쪽 +x, 위쪽 +y.",
                        "{\"name\":{\"type\":\"string\",\"description\":\"객체 이름\"},\"x\":{\"type\":\"number\"},\"y\":{\"type\":\"number\"},"
                                + "\"dx\":{\"type\":\"number\"},\"dy\":{\"type\":\"number\"}}", "[\"name\"]"),
                spec("rotate_object", "배치 객체의 회전을 rot 도(반시계)로 바꾸는 제안.",
                        "{\"name\":{\"type\":\"string\"},\"rot\":{\"type\":\"number\",\"description\":\"도, 반시계\"}}", "[\"name\",\"rot\"]"),
                spec("add_object", "모델(이름 또는 별칭)을 (x, y)에 새로 놓는 제안. 이름을 안 주면 '<모델> n'.",
                        "{\"model\":{\"type\":\"string\"},\"name\":{\"type\":\"string\"},\"x\":{\"type\":\"number\"},\"y\":{\"type\":\"number\"},"
                                + "\"rot\":{\"type\":\"number\"}}", "[\"model\",\"x\",\"y\"]"),
                spec("delete_object", "배치 객체를 지우는 제안.", "{\"name\":{\"type\":\"string\"}}", "[\"name\"]"),
                spec("rename_object", "배치 객체의 이름을 바꾸는 제안.", "{\"name\":{\"type\":\"string\"},\"newName\":{\"type\":\"string\"}}",
                        "[\"name\",\"newName\"]"),
                spec("set_station", "공정 기준정보를 바꾸는 제안 (관리자만 적용 가능): 택타임(분), 주의·지연 기준(%), 칩을 붙일 배치 이름(빈 문자열 = 없앰).",
                        "{\"name\":{\"type\":\"string\",\"description\":\"공정 이름\"},\"taktMin\":{\"type\":\"number\"},\"warnPp\":{\"type\":\"integer\"},"
                                + "\"delayPp\":{\"type\":\"integer\"},\"placementName\":{\"type\":\"string\"}}", "[\"name\"]"),
                spec("edit_partition", "가벽을 추가(op=add, 두 점 a·b [x, y] m)하거나 지우는(op=delete, id) 제안.",
                        "{\"op\":{\"type\":\"string\",\"enum\":[\"add\",\"delete\"]},\"a\":{\"type\":\"array\",\"items\":{\"type\":\"number\"}},"
                                + "\"b\":{\"type\":\"array\",\"items\":{\"type\":\"number\"}},\"id\":{\"type\":\"string\"}}", "[\"op\"]"),
                spec("rename_zone", "구역 이름을 바꾸는 제안.", "{\"id\":{\"type\":\"string\"},\"name\":{\"type\":\"string\"}}", "[\"id\",\"name\"]"));
    }

    private static ClaudeGateway.ToolSpec spec(String name, String description, String props, String required) {
        return new ClaudeGateway.ToolSpec(name, description,
                "{\"type\":\"object\",\"properties\":" + props + ",\"required\":" + required + ",\"additionalProperties\":false}");
    }

    public List<ClaudeGateway.ToolSpec> specs() {
        return specs;
    }

    /** 지금 장면 = DB + 쌓인 제안 */
    final class Scene {
        DrawingDetail drawing;
        JsonNode plan;
        double w;
        double h;
        final Map<String, ObjectNode> objects = new LinkedHashMap<>(); // placement:<id> · new:<seq> → 스냅샷
        final Map<String, ObjectNode> partitions = new LinkedHashMap<>(); // 가벽 id → {id, pts, h, t}
        final Map<String, String> zones = new LinkedHashMap<>(); // 구역 id → 이름
        final Map<String, ObjectNode> stationsByKey = new LinkedHashMap<>(); // station:<id> → 스냅샷
        final Map<String, StationView> stationViews = new LinkedHashMap<>(); // station:<id> → 표시용(step 수·PJT)
        final Map<Long, ModelInfo> modelsById = new LinkedHashMap<>();
        final Set<String> partitionIdsEver = new HashSet<>();
    }

    Scene load(long drawingId, Changeset cs) {
        Scene s = new Scene();
        s.drawing = drawings.findById(drawingId);
        if (s.drawing == null) throw new NotFoundException("도면을 찾을 수 없습니다.");
        s.plan = json.readTree(s.drawing.plan());
        s.w = s.plan.path("bounds").path("w").asDouble();
        s.h = s.plan.path("bounds").path("h").asDouble();
        for (PlacementView p : placements.findByDrawing(drawingId)) s.objects.put("placement:" + p.id(), Snapshots.placement(json, p));
        for (JsonNode p : s.plan.path("partitions")) {
            s.partitions.put(p.path("id").asString(), (ObjectNode) p.deepCopy());
            s.partitionIdsEver.add(p.path("id").asString());
        }
        for (JsonNode z : s.plan.path("zones")) s.zones.put(z.path("id").asString(), z.path("name").asString());
        for (StationView st : stations.findByDrawing(drawingId)) {
            s.stationsByKey.put("station:" + st.id(), Snapshots.station(json, st));
            s.stationViews.put("station:" + st.id(), st);
        }
        for (ModelInfo m : models.findAll()) s.modelsById.put(m.id(), m);
        for (Changeset.Item it : cs.items()) {
            switch (it.kind()) {
                case "placement.delete" -> s.objects.remove(it.targetKey());
                case "station.update" -> s.stationsByKey.put(it.targetKey(), (ObjectNode) it.after());
                case "plan.partition.add" -> {
                    s.partitions.put(text(it.after(), "id"), (ObjectNode) it.after());
                    s.partitionIdsEver.add(text(it.after(), "id"));
                }
                case "plan.partition.delete" -> s.partitions.remove(text(it.before(), "id"));
                case "plan.zone.rename" -> s.zones.put(text(it.after(), "id"), text(it.after(), "name"));
                default -> s.objects.put(it.targetKey(), (ObjectNode) it.after()); // placement.add · move · rotate · rename · update
            }
        }
        return s;
    }

    public Result execute(long drawingId, Changeset cs, ClaudeGateway.ToolCall call) {
        JsonNode in;
        try {
            in = json.readTree(call.inputJson() == null || call.inputJson().isBlank() ? "{}" : call.inputJson());
        } catch (RuntimeException e) {
            return err("입력 JSON 을 읽지 못했습니다");
        }
        Scene s = load(drawingId, cs);
        return switch (call.name()) {
            case "get_scene" -> scene(s, cs);
            case "move_object" -> move(s, cs, in);
            case "rotate_object" -> rotate(s, cs, in);
            case "add_object" -> add(s, cs, in);
            case "delete_object" -> delete(s, cs, in);
            case "rename_object" -> rename(s, cs, in);
            case "set_station" -> setStation(s, cs, in);
            case "edit_partition" -> partition(s, cs, in);
            case "rename_zone" -> renameZone(s, cs, in);
            default -> err("모르는 도구입니다: " + call.name());
        };
    }

    // ---------- 읽기 ----------

    private Result scene(Scene s, Changeset cs) {
        ObjectNode out = json.createObjectNode();
        out.putObject("drawing").put("name", s.drawing.name()).put("widthM", r2(s.w)).put("heightM", r2(s.h));
        ArrayNode zones = out.putArray("zones");
        for (JsonNode z : s.plan.path("zones")) {
            String id = z.path("id").asString();
            double cx = 0, cy = 0;
            int k = 0;
            for (JsonNode p : z.path("poly")) {
                cx += p.path(0).asDouble();
                cy += p.path(1).asDouble();
                k++;
            }
            ObjectNode zn = zones.addObject().put("id", id).put("name", s.zones.getOrDefault(id, z.path("name").asString()));
            if (k > 0) zn.putArray("center").add(r2(cx / k)).add(r2(cy / k));
        }
        ArrayNode parts = out.putArray("partitions");
        for (ObjectNode p : s.partitions.values()) {
            JsonNode pts = p.path("pts");
            ObjectNode pn = parts.addObject().put("id", p.path("id").asString());
            pn.set("a", pts.path(0));
            pn.set("b", pts.path(pts.size() - 1));
        }
        ArrayNode objs = out.putArray("objects");
        int i = 0;
        for (Map.Entry<String, ObjectNode> oe : s.objects.entrySet()) {
            ObjectNode o = oe.getValue();
            if (i++ >= MAX_OBJECTS) break;
            ModelInfo m = model(s, o);
            ObjectNode on = objs.addObject();
            if (oe.getKey().startsWith("placement:")) on.put("id", Snapshots.idOf(oe.getKey())); else on.putNull("id");
            on.put("name", text(o, "name"))
                    .put("model", m == null ? "(모델 없음)" : m.name()).put("category", m == null ? "" : m.category())
                    .put("x", r2(o.path("x").asDouble())).put("y", r2(o.path("y").asDouble())).put("rot", r2(o.path("rot").asDouble()));
            on.putArray("sizeM").add(r2(m == null ? 2 : m.sizeX())).add(r2(m == null ? 2 : m.sizeY()));
        }
        if (s.objects.size() > MAX_OBJECTS) out.put("omittedObjects", s.objects.size() - MAX_OBJECTS);
        ArrayNode sts = out.putArray("stations");
        for (Map.Entry<String, ObjectNode> se : s.stationsByKey.entrySet()) {
            ObjectNode st = se.getValue();
            StationView sv = s.stationViews.get(se.getKey());
            sts.addObject().put("name", text(st, "name")).put("placementName", text(st, "placementName"))
                    .put("taktMin", r2(st.path("taktSec").asInt() / 60.0)).put("warnPp", st.path("warnPp").asInt())
                    .put("delayPp", st.path("delayPp").asInt())
                    .put("steps", sv == null ? 0 : sv.steps().size());
            if (sv != null && sv.projectId() != null) ((ObjectNode) sts.get(sts.size() - 1)).put("projectId", sv.projectId().longValue());
            else ((ObjectNode) sts.get(sts.size() - 1)).putNull("projectId");
        }
        ArrayNode ms = out.putArray("models");
        int j = 0;
        for (ModelInfo m : s.modelsById.values()) {
            if (j++ >= MAX_MODELS) break;
            ObjectNode mn = ms.addObject().put("name", m.name()).put("category", m.category());
            mn.putArray("sizeM").add(r2(m.sizeX())).add(r2(m.sizeY())).add(r2(m.sizeZ()));
            ArrayNode al = mn.putArray("aliases");
            m.aliases().forEach(al::add);
        }
        out.put("pendingChanges", cs.items().size());
        return new Result(out.toString(), false, "장면 확인 중…");
    }

    // ---------- 배치 ----------

    private Result move(Scene s, Changeset cs, JsonNode in) {
        Found f = findObject(s, text(in, "name"));
        if (f.error != null) return err(f.error);
        double x, y;
        if (in.hasNonNull("x") && in.hasNonNull("y")) {
            x = in.path("x").asDouble();
            y = in.path("y").asDouble();
        } else if (in.hasNonNull("dx") || in.hasNonNull("dy")) {
            x = f.node.path("x").asDouble() + in.path("dx").asDouble(0);
            y = f.node.path("y").asDouble() + in.path("dy").asDouble(0);
        } else return err("x·y 또는 dx·dy 를 주세요");
        String bad = outside(s, x, y);
        if (bad != null) return err(bad);
        ObjectNode next = f.node.deepCopy();
        next.put("x", r2(x));
        next.put("y", r2(y));
        return proposeObject(cs, f, next, "이동");
    }

    private Result rotate(Scene s, Changeset cs, JsonNode in) {
        Found f = findObject(s, text(in, "name"));
        if (f.error != null) return err(f.error);
        if (!in.path("rot").isNumber()) return err("rot(도)를 주세요");
        ObjectNode next = f.node.deepCopy();
        next.put("rot", r2(((in.path("rot").asDouble() % 360) + 360) % 360));
        return proposeObject(cs, f, next, "회전");
    }

    private Result rename(Scene s, Changeset cs, JsonNode in) {
        Found f = findObject(s, text(in, "name"));
        if (f.error != null) return err(f.error);
        String nn = text(in, "newName") == null ? "" : text(in, "newName").strip();
        if (nn.isEmpty() || nn.length() > 100) return err("새 이름은 1~100자로 주세요");
        for (Map.Entry<String, ObjectNode> e : s.objects.entrySet())
            if (!e.getKey().equals(f.key) && nn.equals(text(e.getValue(), "name"))) return err("같은 이름의 객체가 이미 있습니다: " + nn);
        ObjectNode next = f.node.deepCopy();
        next.put("name", nn);
        return proposeObject(cs, f, next, "이름 변경");
    }

    private Result add(Scene s, Changeset cs, JsonNode in) {
        String want = text(in, "model") == null ? "" : text(in, "model").strip();
        ModelInfo m = matchModel(s, want);
        if (m == null) {
            List<String> names = s.modelsById.values().stream().map(ModelInfo::name).limit(10).toList();
            return err("'" + want + "' 모델이 없습니다. 쓸 수 있는 모델: " + String.join(", ", names));
        }
        if (!in.path("x").isNumber() || !in.path("y").isNumber()) return err("x·y 를 주세요");
        double x = in.path("x").asDouble(), y = in.path("y").asDouble();
        String bad = outside(s, x, y);
        if (bad != null) return err(bad);
        Set<String> taken = new HashSet<>();
        s.objects.values().forEach(o -> taken.add(text(o, "name")));
        String name = text(in, "name") == null || text(in, "name").isBlank() ? nextName(m.name(), taken) : text(in, "name").strip();
        if (name.length() > 100) return err("이름은 100자까지입니다");
        if (taken.contains(name)) return err("같은 이름의 객체가 이미 있습니다: " + name);
        ObjectNode node = json.createObjectNode();
        node.put("name", name);
        node.put("modelId", m.id());
        node.put("x", r2(x));
        node.put("y", r2(y));
        node.put("rot", r2(((in.path("rot").asDouble(0) % 360) + 360) % 360));
        Changeset.Item it = cs.add("placement.add", name, "new:" + cs.nextSeq(), null, node, addLabel(node));
        return ok(it, name + " 추가 제안");
    }

    private Result delete(Scene s, Changeset cs, JsonNode in) {
        Found f = findObject(s, text(in, "name"));
        if (f.error != null) return err(f.error);
        String name = text(f.node, "name");
        if (f.key.startsWith("new:")) {
            cs.remove(cs.find(f.key).orElseThrow());
            return new Result("{\"ok\":true,\"message\":\"추가 제안을 지웠습니다: " + esc(name) + "\"}", false, name + " 추가 제안 취소");
        }
        Optional<Changeset.Item> old = cs.find(f.key);
        JsonNode base = old.map(Changeset.Item::before).orElse(f.node);
        String label = text(base, "name") + " 삭제";
        Changeset.Item it = old.isPresent() ? cs.replace(old.get(), "placement.delete", text(base, "name"), base, null, label)
                : cs.add("placement.delete", text(base, "name"), f.key, base, null, label);
        return ok(it, name + " 삭제 제안");
    }

    /** 배치 하나의 제안: 새로 추가한 객체면 추가 항목을, 아니면 대상의 항목을 고침 (원래 값과 같으면 지움) */
    private Result proposeObject(Changeset cs, Found f, ObjectNode next, String verb) {
        String name = text(f.node, "name");
        if (f.key.startsWith("new:")) {
            Changeset.Item add = cs.find(f.key).orElseThrow();
            Changeset.Item it = cs.replace(add, "placement.add", text(next, "name"), null, next, addLabel(next));
            return ok(it, name + " " + verb + " 제안");
        }
        Optional<Changeset.Item> old = cs.find(f.key);
        JsonNode base = old.map(Changeset.Item::before).orElse(f.node);
        String kind = Snapshots.placementKind(base, next);
        if (kind == null) {
            old.ifPresent(cs::remove);
            return new Result("{\"ok\":true,\"message\":\"원래 값과 같아 " + esc(name) + " 제안을 지웠습니다\"}", false, name + " 제안 취소");
        }
        String label = placementLabel(kind, base, next);
        Changeset.Item it = old.isPresent() ? cs.replace(old.get(), kind, text(base, "name"), base, next, label)
                : cs.add(kind, text(base, "name"), f.key, base, next, label);
        return ok(it, name + " " + verb + " 제안");
    }

    // ---------- 공정 · 가벽 · 구역 ----------

    private Result setStation(Scene s, Changeset cs, JsonNode in) {
        String want = text(in, "name");
        Map.Entry<String, ObjectNode> e = findBy(s.stationsByKey, want, o -> text(o, "name"));
        if (e == null) return err("'" + want + "' 공정이 없습니다. 공정: " + String.join(", ", s.stationsByKey.values().stream().map(o -> text(o, "name")).toList()));
        ObjectNode next = e.getValue().deepCopy();
        if (in.hasNonNull("taktMin")) {
            long sec = Math.round(in.path("taktMin").asDouble() * 60);
            if (sec < 60 || sec > 604800) return err("택타임은 1~10080분이어야 합니다");
            next.put("taktSec", (int) sec);
        }
        if (in.hasNonNull("warnPp")) next.put("warnPp", in.path("warnPp").asInt());
        if (in.hasNonNull("delayPp")) next.put("delayPp", in.path("delayPp").asInt());
        int warn = next.path("warnPp").asInt(), delay = next.path("delayPp").asInt();
        if (!(0 <= warn && warn < delay && delay <= 100)) return err("주의·지연 기준은 0 ≤ 주의 < 지연 ≤ 100 이어야 합니다");
        if (in.has("placementName")) {
            String pn = text(in, "placementName") == null ? "" : text(in, "placementName").strip();
            if (pn.isEmpty()) next.putNull("placementName");
            else {
                if (s.objects.values().stream().noneMatch(o -> pn.equals(text(o, "name")))) return err("'" + pn + "' 이름의 객체가 없습니다");
                next.put("placementName", pn);
            }
        }
        Optional<Changeset.Item> old = cs.find(e.getKey());
        JsonNode base = old.map(Changeset.Item::before).orElse(e.getValue());
        String name = text(base, "name");
        if (base.equals(next)) {
            old.ifPresent(cs::remove);
            return new Result("{\"ok\":true,\"message\":\"원래 값과 같아 공정 제안을 지웠습니다\"}", false, "공정 " + name + " 제안 취소");
        }
        String label = stationLabel(base, next);
        Changeset.Item it = old.isPresent() ? cs.replace(old.get(), "station.update", name, base, next, label)
                : cs.add("station.update", name, e.getKey(), base, next, label);
        return ok(it, "공정 " + name + " 변경 제안");
    }

    private Result partition(Scene s, Changeset cs, JsonNode in) {
        String op = text(in, "op");
        if ("add".equals(op)) {
            double[] a = point(in.path("a")), b = point(in.path("b"));
            if (a == null || b == null) return err("a·b 는 [x, y] 로 주세요");
            String bad = outside(s, a[0], a[1]);
            if (bad == null) bad = outside(s, b[0], b[1]);
            if (bad != null) return err(bad);
            if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.5) return err("가벽 길이는 0.5 m 이상이어야 합니다");
            int max = 0;
            for (String id : s.partitionIdsEver) {
                Matcher m = PART_ID.matcher(id);
                if (m.matches()) max = Math.max(max, Integer.parseInt(m.group(1)));
            }
            String id = "p" + (max + 1);
            ObjectNode node = json.createObjectNode();
            node.put("id", id);
            ArrayNode pts = node.putArray("pts");
            pts.addArray().add(r2(a[0])).add(r2(a[1]));
            pts.addArray().add(r2(b[0])).add(r2(b[1]));
            node.put("h", PARTITION_H);
            node.put("t", PARTITION_T);
            Changeset.Item it = cs.add("plan.partition.add", "가벽 " + id, "partition:" + id, null, node,
                    "가벽 추가 (" + f1(a[0]) + ", " + f1(a[1]) + ") → (" + f1(b[0]) + ", " + f1(b[1]) + ")");
            return ok(it, "가벽 추가 제안");
        }
        if ("delete".equals(op)) {
            String id = text(in, "id");
            ObjectNode cur = id == null ? null : s.partitions.get(id);
            if (cur == null) return err("'" + id + "' 가벽이 없습니다. 가벽: " + String.join(", ", s.partitions.keySet()));
            Optional<Changeset.Item> old = cs.find("partition:" + id);
            if (old.isPresent() && old.get().kind().equals("plan.partition.add")) {
                cs.remove(old.get());
                return new Result("{\"ok\":true,\"message\":\"가벽 추가 제안을 지웠습니다\"}", false, "가벽 추가 제안 취소");
            }
            Changeset.Item it = cs.add("plan.partition.delete", "가벽 " + id, "partition:" + id, cur, null, "가벽 " + id + " 삭제");
            return ok(it, "가벽 " + id + " 삭제 제안");
        }
        return err("op 는 add 또는 delete 입니다");
    }

    private Result renameZone(Scene s, Changeset cs, JsonNode in) {
        String id = text(in, "id");
        if (id == null || !s.zones.containsKey(id)) return err("'" + id + "' 구역이 없습니다. 구역: " + s.zones);
        String nn = text(in, "name") == null ? "" : text(in, "name").strip();
        if (nn.isEmpty() || nn.length() > 100) return err("구역 이름은 1~100자로 주세요");
        String key = "zone:" + id;
        Optional<Changeset.Item> old = cs.find(key);
        String baseName = old.map(i -> text(i.before(), "name")).orElse(s.zones.get(id));
        if (baseName.equals(nn)) {
            old.ifPresent(cs::remove);
            return new Result("{\"ok\":true,\"message\":\"원래 이름과 같아 구역 제안을 지웠습니다\"}", false, "구역 제안 취소");
        }
        ObjectNode before = json.createObjectNode().put("id", id).put("name", baseName);
        ObjectNode after = json.createObjectNode().put("id", id).put("name", nn);
        String label = "구역 " + baseName + " → " + nn;
        Changeset.Item it = old.isPresent() ? cs.replace(old.get(), "plan.zone.rename", baseName, before, after, label)
                : cs.add("plan.zone.rename", baseName, key, before, after, label);
        return ok(it, "구역 이름 변경 제안");
    }

    // ---------- 도우미 ----------

    private record Found(String key, ObjectNode node, String error) {}

    private Found findObject(Scene s, String name) {
        if (name == null || name.isBlank()) return new Found(null, null, "객체 이름(name)을 주세요");
        Map.Entry<String, ObjectNode> e = findBy(s.objects, name, o -> text(o, "name"));
        if (e != null) return new Found(e.getKey(), e.getValue(), null);
        String n = norm(name);
        List<String> similar = s.objects.values().stream().map(o -> text(o, "name"))
                .filter(x -> norm(x).contains(n) || n.contains(norm(x))).limit(8).toList();
        return new Found(null, null, "'" + name + "' 이름의 객체가 없습니다" + (similar.isEmpty() ? "" : ". 비슷한 이름: " + String.join(", ", similar)));
    }

    /** 이름 그대로 → 대소문자·공백 무시 순으로 하나 */
    private static <T> Map.Entry<String, T> findBy(Map<String, T> map, String name, Function<T, String> nameOf) {
        if (name == null) return null;
        for (Map.Entry<String, T> e : map.entrySet()) if (name.strip().equals(nameOf.apply(e.getValue()))) return e;
        List<Map.Entry<String, T>> loose = new ArrayList<>();
        for (Map.Entry<String, T> e : map.entrySet()) if (norm(name).equals(norm(nameOf.apply(e.getValue())))) loose.add(e);
        return loose.size() == 1 ? loose.get(0) : null;
    }

    private static ModelInfo matchModel(Scene s, String want) {
        String n = norm(want);
        if (n.isEmpty()) return null;
        for (ModelInfo m : s.modelsById.values()) if (norm(m.name()).equals(n)) return m;
        for (ModelInfo m : s.modelsById.values()) for (String a : m.aliases()) if (norm(a).equals(n)) return m;
        List<ModelInfo> part = s.modelsById.values().stream().filter(m -> norm(m.name()).contains(n)).toList();
        return part.size() == 1 ? part.get(0) : null;
    }

    private static ModelInfo model(Scene s, JsonNode o) {
        Long id = Snapshots.longOrNull(o, "modelId");
        return id == null ? null : s.modelsById.get(id);
    }

    private static String nextName(String base, Set<String> taken) {
        for (int i = 1; ; i++) if (!taken.contains(base + " " + i)) return base + " " + i;
    }

    private static String outside(Scene s, double x, double y) {
        if (!Double.isFinite(x) || !Double.isFinite(y) || x < 0 || y < 0 || x > s.w || y > s.h)
            return "도면 밖입니다 (x 0~" + trim(s.w) + ", y 0~" + trim(s.h) + " m)";
        return null;
    }

    private static double[] point(JsonNode p) {
        if (!p.isArray() || p.size() != 2 || !p.path(0).isNumber() || !p.path(1).isNumber()) return null;
        return new double[] {p.path(0).asDouble(), p.path(1).asDouble()};
    }

    static String placementLabel(String kind, JsonNode b, JsonNode a) {
        String name = text(b, "name");
        return switch (kind) {
            case "placement.move" -> name + " 이동 (" + f1(b.path("x").asDouble()) + ", " + f1(b.path("y").asDouble()) + ") → ("
                    + f1(a.path("x").asDouble()) + ", " + f1(a.path("y").asDouble()) + ")";
            case "placement.rotate" -> name + " 회전 " + f1(b.path("rot").asDouble()) + "° → " + f1(a.path("rot").asDouble()) + "°";
            case "placement.rename" -> name + " 이름 → " + text(a, "name");
            default -> name + " 변경 (" + f1(b.path("x").asDouble()) + ", " + f1(b.path("y").asDouble()) + ", " + f1(b.path("rot").asDouble())
                    + "°) → (" + f1(a.path("x").asDouble()) + ", " + f1(a.path("y").asDouble()) + ", " + f1(a.path("rot").asDouble()) + "°)"
                    + (name.equals(text(a, "name")) ? "" : " · 이름 " + text(a, "name"));
        };
    }

    private static String addLabel(JsonNode a) {
        return text(a, "name") + " 추가 (" + f1(a.path("x").asDouble()) + ", " + f1(a.path("y").asDouble()) + ")";
    }

    static String stationLabel(JsonNode b, JsonNode a) {
        List<String> parts = new ArrayList<>();
        if (b.path("taktSec").asInt() != a.path("taktSec").asInt())
            parts.add("택타임 " + trim(b.path("taktSec").asInt() / 60.0) + "분 → " + trim(a.path("taktSec").asInt() / 60.0) + "분");
        if (b.path("warnPp").asInt() != a.path("warnPp").asInt()) parts.add("주의 " + b.path("warnPp").asInt() + "% → " + a.path("warnPp").asInt() + "%");
        if (b.path("delayPp").asInt() != a.path("delayPp").asInt()) parts.add("지연 " + b.path("delayPp").asInt() + "% → " + a.path("delayPp").asInt() + "%");
        if (!java.util.Objects.equals(text(b, "placementName"), text(a, "placementName")))
            parts.add("연결 설비 " + (text(b, "placementName") == null ? "없음" : text(b, "placementName")) + " → "
                    + (text(a, "placementName") == null ? "없음" : text(a, "placementName")));
        return "공정 " + text(b, "name") + ": " + String.join(" · ", parts);
    }

    private Result ok(Changeset.Item it, String label) {
        ObjectNode o = json.createObjectNode();
        o.put("ok", true);
        o.put("proposal", it.seq());
        o.put("message", "제안 #" + it.seq() + " 기록됨 (아직 적용 안 됨): " + it.label());
        return new Result(o.toString(), false, label);
    }

    private Result err(String message) {
        ObjectNode o = json.createObjectNode();
        o.put("error", message);
        return new Result(o.toString(), true, "확인 필요: " + message);
    }

    static String norm(String s) {
        return s == null ? "" : s.replaceAll("\\s+", "").toLowerCase(Locale.ROOT);
    }

    static double r2(double v) {
        return Math.round(v * 100) / 100.0;
    }

    static String f1(double v) {
        return String.format(Locale.ROOT, "%.1f", v);
    }

    /** 20.0 → "20", 12.5 → "12.5" */
    static String trim(double v) {
        return v == Math.rint(v) ? String.valueOf((long) v) : String.valueOf(r2(v));
    }

    private static String esc(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
