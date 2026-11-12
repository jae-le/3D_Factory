package com.kopens.factory3d.auth;

import java.io.Serializable;
import java.security.Principal;

/** 세션에 넣는 로그인 사용자 (DB 세션에 직렬화). getName = 아이디 — Spring Session 이 이걸로 사용자별 세션을 찾음 */
public record F3dUser(long id, String username, String displayName, Role role) implements Principal, Serializable {
    @Override
    public String getName() {
        return username;
    }
}
