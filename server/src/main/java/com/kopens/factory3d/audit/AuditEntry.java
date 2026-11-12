package com.kopens.factory3d.audit;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;

/** 감사 기록 한 줄: 언제·누가·무엇을·어디에 */
public record AuditEntry(
        @Schema(requiredMode = REQUIRED) long id,
        @Schema(requiredMode = REQUIRED) OffsetDateTime at,
        String username,
        @Schema(requiredMode = REQUIRED) String action,
        String target,
        String detail,
        String ip) {}
