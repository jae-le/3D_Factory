package com.kopens.factory3d.station;

import java.util.List;

/** 공정 기준정보 한 개. no = 칩 번호(순서 1..n), placementName = 칩을 붙일 같은 도면 배치 이름 */
public record StationView(long id, int no, String name, String placementName, List<String> steps, int taktSec, int warnPp,
        int delayPp, Long projectId, boolean countsProject, List<String> materials) {}
