package com.kopens.factory3d.drawing;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonRawValue;
import java.time.OffsetDateTime;

/** 도면 상세. plan·layerRules 는 DB 의 JSON 문자열을 그대로 내보냄 */
public record DrawingDetail(long id, String name, String sourceType, int version, String createdBy,
        OffsetDateTime createdAt, OffsetDateTime updatedAt, @JsonRawValue String plan, @JsonRawValue String layerRules,
        @JsonIgnore String sourceFile) {}
