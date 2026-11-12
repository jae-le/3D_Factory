package com.kopens.factory3d.common;

/** 로그인 여러 번 실패로 잠김 → 423 */
public class LockedException extends RuntimeException {
    public LockedException(String detail) {
        super(detail);
    }
}
