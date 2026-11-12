package com.kopens.factory3d.common;

/** 역할이 모자라 할 수 없는 작업 → 403 */
public class ForbiddenException extends RuntimeException {
    public ForbiddenException(String detail) {
        super(detail);
    }
}
