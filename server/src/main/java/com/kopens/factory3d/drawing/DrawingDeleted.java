package com.kopens.factory3d.drawing;

/** 도면이 지워짐 → 상황판(VirtualMes)이 커밋 뒤 그 도면을 내림 */
public record DrawingDeleted(long drawingId) {}
