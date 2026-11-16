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

    public static ObjectNode zone(ObjectNode plan, String id) {
        for (JsonNode z : plan.path("zones")) if (id.equals(z.path("id").asString()) && z instanceof ObjectNode o) return o;
        return null;
    }
}
