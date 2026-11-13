package com.kopens.factory3d.station;

/** PJT (제작 현황). state: run 진행 · wait 대기 · done 완료 */
public record ProjectView(long id, String name, int done, int total, String period, String state, int sortOrder) {}
