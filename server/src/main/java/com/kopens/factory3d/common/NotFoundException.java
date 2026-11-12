package com.kopens.factory3d.common;

/** 없는 설비·부품·파일 → 404 */
public class NotFoundException extends RuntimeException {
    public NotFoundException(String detail) {
        super(detail);
    }
}
