package com.kopens.factory3d.common;

/** 로그인 실패 → 401 */
public class UnauthorizedException extends RuntimeException {
    public UnauthorizedException(String detail) {
        super(detail);
    }
}
