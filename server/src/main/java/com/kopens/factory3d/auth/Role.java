package com.kopens.factory3d.auth;

/** 역할: 관리자 ⊃ 운전원 ⊃ 조회 (SecurityConfig 의 RoleHierarchy) */
public enum Role {
    ADMIN,
    OPERATOR,
    VIEWER;

    /** 비밀번호 변경이 필요한 동안의 권한 — 역할 권한 없이 /api/auth/** 만 */
    public static final String PASSWORD_CHANGE = "PASSWORD_CHANGE";
}
