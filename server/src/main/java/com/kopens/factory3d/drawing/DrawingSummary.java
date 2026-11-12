package com.kopens.factory3d.drawing;

import java.time.OffsetDateTime;

/** 도면 select 에 쓰는 요약 */
public record DrawingSummary(long id, String name, String sourceType, OffsetDateTime updatedAt) {}
