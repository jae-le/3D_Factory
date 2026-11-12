package com.kopens.factory3d.auth;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;

/** 화면에 주는 사용자 정보 (비밀번호 해시 없음) */
public record UserView(
        @Schema(requiredMode = REQUIRED) long id,
        @Schema(requiredMode = REQUIRED) String username,
        @Schema(requiredMode = REQUIRED) String displayName,
        @Schema(requiredMode = REQUIRED) Role role,
        @Schema(requiredMode = REQUIRED) boolean enabled,
        @Schema(requiredMode = REQUIRED) boolean mustChangePassword,
        @Schema(requiredMode = REQUIRED) boolean locked,
        OffsetDateTime lastLoginAt,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt) {

    public static UserView from(AppUser u) {
        return new UserView(u.id(), u.username(), u.displayName(), u.role(), u.enabled(), u.mustChangePassword(),
                u.lockedAt(OffsetDateTime.now()), u.lastLoginAt(), u.createdAt());
    }
}
