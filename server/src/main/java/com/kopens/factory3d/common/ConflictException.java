package com.kopens.factory3d.common;

/** 동시에 할 수 없는 작업 → 409 */
public class ConflictException extends RuntimeException {
    public ConflictException(String detail) {
        super(detail);
    }
}
