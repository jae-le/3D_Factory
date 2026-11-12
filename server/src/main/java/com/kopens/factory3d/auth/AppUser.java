package com.kopens.factory3d.auth;

import java.time.OffsetDateTime;

/** DB 의 사용자 한 줄 */
public record AppUser(
        long id,
        String username,
        String displayName,
        String passwordHash,
        Role role,
        boolean enabled,
        boolean mustChangePassword,
        int failedCount,
        OffsetDateTime lockedUntil,
        OffsetDateTime lastLoginAt,
        OffsetDateTime createdAt) {

    public boolean lockedAt(OffsetDateTime now) {
        return lockedUntil != null && lockedUntil.isAfter(now);
    }
}
