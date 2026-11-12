package com.kopens.factory3d.drawing;

import java.time.OffsetDateTime;

/** 도면 select·관리 표에 쓰는 요약. width/height = plan.bounds (m) */
public record DrawingSummary(long id, String name, String sourceType, int version, String createdBy,
        OffsetDateTime updatedAt, Double width, Double height, int placements) {}
