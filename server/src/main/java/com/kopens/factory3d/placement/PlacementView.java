package com.kopens.factory3d.placement;

import com.fasterxml.jackson.annotation.JsonInclude;

/** 배치 (plan 좌표 m, rot 도). modelId 가 null 이면 임시 상자 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record PlacementView(long id, Long modelId, String name, double x, double y, double rot, String hintLabel) {}
