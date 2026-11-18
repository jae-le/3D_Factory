package com.kopens.factory3d.change;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/** plan JSON 의 가벽·구역 고치기 (AI 적용·되돌리기 공용) */
public final class PlanEdits {
    private PlanEdits() {}

    public static ArrayNode partitions(ObjectNode plan) {
        return plan.get("partitions") instanceof ArrayNode a ? a : plan.putArray("partitions");
    }

    public static int indexOf(ArrayNode parts, String id) {
        for (int i = 0; i < parts.size(); i++) if (id.equals(parts.get(i).path("id").asString())) return i;
        return -1;
    }

    /** 도면 글자 id: 있으면 그 값, 없으면 지금 순서 "t<i>" (처음 고칠 때 이 값으로 굳힘 → 지워도 다른 글자 id 가 안 밀림) */
    public static String textId(JsonNode t, int index) {
        String id = t.path("id").asString("");
        return id.isEmpty() ? "t" + index : id;
    }

    public static ArrayNode texts(ObjectNode plan) {
        ArrayNode a = plan.get("texts") instanceof ArrayNode x ? x : plan.putArray("texts");
        for (int i = 0; i < a.size(); i++) if (a.get(i) instanceof ObjectNode o && o.path("id").asString("").isEmpty()) o.put("id", "t" + i);
        return a;
    }

    /** id 로 글자 위치 (없으면 -1). 옛 기록의 index 도 받음 */
    public static int textIndex(ObjectNode plan, JsonNode ref) {
        ArrayNode a = texts(plan);
        String id = ref.has("id") ? ref.path("id").asString("") : "t" + ref.path("index").asInt(-1);
        for (int i = 0; i < a.size(); i++) if (id.equals(a.get(i).path("id").asString())) return i;
        return -1;
    }

    public static ObjectNode zone(ObjectNode plan, String id) {
        for (JsonNode z : plan.path("zones")) if (id.equals(z.path("id").asString()) && z instanceof ObjectNode o) return o;
        return null;
    }
}
