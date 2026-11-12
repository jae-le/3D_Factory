package com.kopens.factory3d.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import java.time.OffsetDateTime;
import java.util.List;

/** 모델 목록·상세. file·thumbnail 경로는 응답에 내보내지 않음 */
public record ModelInfo(long id, String name, String category, String sourceExt, double sizeX, double sizeY, double sizeZ,
        List<String> aliases, int version, int usedDrawings, OffsetDateTime updatedAt,
        @JsonIgnore String file, @JsonIgnore String thumbnail) {}
