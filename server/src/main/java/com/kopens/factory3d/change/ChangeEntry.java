package com.kopens.factory3d.change;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonRawValue;
import java.time.OffsetDateTime;

/** 변경 이력 한 줄. before/after 는 DB 의 JSON 문자열을 그대로 내보냄 (없으면 null) */
public record ChangeEntry(long id, OffsetDateTime at, String username, String source, long drawingId, String drawingName,
        String batchId, String kind, String target, @JsonIgnore String targetKey, @JsonRawValue String before,
        @JsonRawValue String after, boolean reverted, String revertedBy, OffsetDateTime revertedAt) {}
