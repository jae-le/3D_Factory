package com.kopens.factory3d.common;

/** 잘못된 입력 → 400 */
public class BadRequestException extends RuntimeException {
    public BadRequestException(String detail) {
        super(detail);
    }
}
