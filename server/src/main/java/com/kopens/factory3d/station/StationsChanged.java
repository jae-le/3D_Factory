package com.kopens.factory3d.station;

/** 한 도면의 공정·PJT 기준정보가 바뀜 → 상황판(VirtualMes)이 커밋 뒤 그 도면을 처음부터 다시 올림 */
public record StationsChanged(long drawingId) {}
