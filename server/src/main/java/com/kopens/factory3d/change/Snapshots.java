package com.kopens.factory3d.change;

import com.kopens.factory3d.placement.PlacementView;
import com.kopens.factory3d.station.StationMapper;
import com.kopens.factory3d.station.StationView;
import java.util.Objects;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** 변경 이력·AI 제안의 before/after 모양 (배치·공정) 과 비교 도우미 */
public final class Snapshots {
    static final double EPS = 1e-6;

    private Snapshots() {}

    /** {id, name, modelId(null 가능), x, y, rot, hintLabel?} */
    public static ObjectNode placement(ObjectMapper json, PlacementView p) {
        ObjectNode n = json.createObjectNode();
        n.put("id", p.id());
        n.put("name", p.name());
        if (p.modelId() == null) n.putNull("modelId");
        else n.put("modelId", p.modelId());
        n.put("x", p.x());
        n.put("y", p.y());
        n.put("rot", p.rot());
        if (p.hintLabel() != null) n.put("hintLabel", p.hintLabel());
        return n;
    }

    /** {id, name, placementName(null 가능), taktSec, warnPp, delayPp} — AI 가 바꿀 수 있는 칸만 */
    public static ObjectNode station(ObjectMapper json, StationView s) {
        ObjectNode n = json.createObjectNode();
        n.put("id", s.id());
        n.put("name", s.name());
        if (s.placementName() == null) n.putNull("placementName");
        else n.put("placementName", s.placementName());
        n.put("taktSec", s.taktSec());
        n.put("warnPp", s.warnPp());
        n.put("delayPp", s.delayPp());
        return n;
    }

    public static boolean samePlacement(PlacementView cur, JsonNode s) {
        return s != null && cur.name().equals(text(s, "name")) && Objects.equals(cur.modelId(), longOrNull(s, "modelId"))
                && Math.abs(cur.x() - s.path("x").asDouble()) < EPS && Math.abs(cur.y() - s.path("y").asDouble()) < EPS
                && Math.abs(cur.rot() - s.path("rot").asDouble()) < EPS;
    }

    public static boolean sameStation(StationView cur, JsonNode s) {
        return s != null && cur.name().equals(text(s, "name")) && Objects.equals(cur.placementName(), text(s, "placementName"))
                && cur.taktSec() == s.path("taktSec").asInt() && cur.warnPp() == s.path("warnPp").asInt()
                && cur.delayPp() == s.path("delayPp").asInt();
    }

    /** 지금 공정 그대로의 수정용 줄 (AI 적용·되돌리기는 바꿀 칸만 덮어씀) */
    public static StationMapper.Row stationRow(StationView v) {
        var r = new StationMapper.Row();
        r.id = v.id();
        r.no = v.no();
        r.name = v.name();
        r.placementName = v.placementName();
        r.steps = v.steps().toArray(String[]::new);
        r.taktSec = v.taktSec();
        r.warnPp = v.warnPp();
        r.delayPp = v.delayPp();
        r.projectId = v.projectId();
        r.countsProject = v.countsProject();
        r.materials = v.materials().toArray(String[]::new);
        return r;
    }

    /** 배치 전후 → 종류 (이름·위치·회전 중 하나만 = 그 종류, 여럿이거나 모델이 바뀜 = update, 같음 = null) */
    public static String placementKind(JsonNode before, JsonNode after) {
        boolean name = !Objects.equals(text(before, "name"), text(after, "name"));
        boolean pos = Math.abs(before.path("x").asDouble() - after.path("x").asDouble()) > EPS
                || Math.abs(before.path("y").asDouble() - after.path("y").asDouble()) > EPS;
        boolean rot = Math.abs(before.path("rot").asDouble() - after.path("rot").asDouble()) > EPS;
        boolean model = !Objects.equals(longOrNull(before, "modelId"), longOrNull(after, "modelId"));
        int n = (name ? 1 : 0) + (pos ? 1 : 0) + (rot ? 1 : 0);
        if (model || n > 1) return "placement.update";
        if (name) return "placement.rename";
        if (rot) return "placement.rotate";
        if (pos) return "placement.move";
        return null;
    }

    public static String text(JsonNode n, String field) {
        JsonNode v = n == null ? null : n.get(field);
        return v == null || v.isNull() ? null : v.asText();
    }

    public static Long longOrNull(JsonNode n, String field) {
        JsonNode v = n == null ? null : n.get(field);
        return v == null || v.isNull() ? null : v.asLong();
    }

    /** "placement:12" → 12 */
    public static long idOf(String targetKey) {
        return Long.parseLong(targetKey.substring(targetKey.indexOf(':') + 1));
    }
}
