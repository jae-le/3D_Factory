package com.kopens.factory3d.station;

import com.kopens.factory3d.audit.AuditService;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * 나셀 공장 기본 공정 6개 · PJT 4개 (demo DASH_INIT). 시스템이 만든 '나셀 공장' 에 공정·PJT 가 없고
 * 감사 기록에 그 도면의 STATION_SEED 가 없을 때 한 번 (관리자가 지운 뒤에는 다시 넣지 않음).
 */
@Component
public class StationSeeder {
    private static final Logger log = LoggerFactory.getLogger(StationSeeder.class);
    private static final String SEED = "seed/main_factory.stations.json";

    private final JdbcTemplate jdbc;
    private final StationMapper stations;
    private final ProjectMapper projects;
    private final AuditService audit;
    private final ApplicationEventPublisher events;
    private final ObjectMapper json;
    private volatile JsonNode seed;

    public StationSeeder(JdbcTemplate jdbc, StationMapper stations, ProjectMapper projects, AuditService audit,
            ApplicationEventPublisher events, ObjectMapper json) {
        this.jdbc = jdbc;
        this.stations = stations;
        this.projects = projects;
        this.audit = audit;
        this.events = events;
        this.json = json;
    }

    @Transactional
    public int seedFactory() throws IOException {
        Long drawingId = factoryId();
        if (drawingId == null) return 0;
        if (stations.countByDrawing(drawingId) > 0 || projects.countByDrawing(drawingId) > 0) return 0;
        Integer done = jdbc.queryForObject("select count(*) from audit_log where action = 'STATION_SEED' and target = ?",
                Integer.class, "drawing=" + drawingId);
        if (done != null && done > 0) return 0;
        JsonNode root = seed();
        Map<String, Long> pjt = new HashMap<>();
        int order = 1;
        for (JsonNode p : root.get("projects")) {
            var r = new ProjectMapper.Row();
            r.name = p.get("name").asText();
            r.done = p.get("done").asInt();
            r.total = p.get("total").asInt();
            r.period = p.get("period").asText();
            r.state = p.get("state").asText();
            r.sortOrder = order++;
            projects.insert(drawingId, r);
            pjt.put(r.name, r.id);
        }
        int no = 0;
        for (JsonNode s : root.get("stations")) {
            var r = new StationMapper.Row();
            r.no = ++no;
            r.name = s.get("name").asText();
            r.placementName = s.get("placementName").asText();
            r.steps = strings(s.get("steps"));
            r.taktSec = s.get("taktSec").asInt();
            r.warnPp = 10;
            r.delayPp = 20;
            r.projectId = pjt.get(s.get("project").asText());
            r.countsProject = s.get("countsProject").asBoolean();
            r.materials = strings(s.get("materials"));
            stations.insert(drawingId, r);
        }
        audit.logAs("system", "STATION_SEED", "drawing=" + drawingId, "공정 " + no + "개 · PJT " + pjt.size() + "개");
        events.publishEvent(new StationsChanged(drawingId));
        log.info("나셀 공장에 기본 공정 {}개 · PJT {}개를 넣었습니다", no, pjt.size());
        return no;
    }

    /** 상황판 시작 실적·목표 (공정 이름 → {실적, 목표}). 시스템 '나셀 공장' 만, 나머지 도면은 빈 맵 */
    public Map<String, double[]> startValues(long drawingId) {
        Long factory = factoryId();
        if (factory == null || factory != drawingId) return Map.of();
        try {
            Map<String, double[]> out = new HashMap<>();
            for (JsonNode s : seed().get("stations"))
                out.put(s.get("name").asText(), new double[] {s.get("startActual").asDouble(), s.get("startTarget").asDouble()});
            return out;
        } catch (IOException e) {
            log.warn("기본 공정 시작값을 읽지 못했습니다: {}", e.getMessage());
            return Map.of();
        }
    }

    private Long factoryId() {
        List<Long> ids = jdbc.queryForList("select id from drawing where name = '나셀 공장' and created_by = 'system' order by id", Long.class);
        return ids.isEmpty() ? null : ids.get(0);
    }

    private JsonNode seed() throws IOException {
        JsonNode s = seed;
        if (s == null) {
            try (InputStream in = new ClassPathResource(SEED).getInputStream()) {
                seed = s = json.readTree(in.readAllBytes());
            }
        }
        return s;
    }

    private static String[] strings(JsonNode arr) {
        String[] out = new String[arr.size()];
        for (int i = 0; i < out.length; i++) out[i] = arr.get(i).asText();
        return out;
    }
}
