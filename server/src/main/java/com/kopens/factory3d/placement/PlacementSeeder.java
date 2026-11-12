package com.kopens.factory3d.placement;

import com.kopens.factory3d.model.ModelMapper;
import com.kopens.factory3d.model.ModelSeeder;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** 나셀 공장 기본 배치 79개: 시스템이 만든 '나셀 공장' 도면의 배치가 0개일 때 한 번 */
@Component
public class PlacementSeeder {
    private static final Logger log = LoggerFactory.getLogger(PlacementSeeder.class);
    private final JdbcTemplate jdbc;
    private final PlacementMapper placements;
    private final PlacementService service;
    private final ModelMapper models;
    private final ModelSeeder modelSeeder;
    private final ObjectMapper json;

    public PlacementSeeder(JdbcTemplate jdbc, PlacementMapper placements, PlacementService service, ModelMapper models,
            ModelSeeder modelSeeder, ObjectMapper json) {
        this.jdbc = jdbc;
        this.placements = placements;
        this.service = service;
        this.models = models;
        this.modelSeeder = modelSeeder;
        this.json = json;
    }

    public int seedFactory() throws IOException {
        List<Long> ids = jdbc.queryForList("select id from drawing where name = '나셀 공장' and created_by = 'system'", Long.class);
        if (ids.isEmpty()) return 0;
        long drawingId = ids.get(0);
        if (placements.countByDrawing(drawingId) > 0) return 0;
        Map<String, String> names = modelSeeder.keyToName();
        List<PlacementMapper.NewRow> rows = new ArrayList<>();
        JsonNode list;
        try (InputStream in = new ClassPathResource("seed/main_factory.placements.json").getInputStream()) {
            list = json.readTree(in.readAllBytes());
        }
        for (JsonNode p : list) {
            var r = new PlacementMapper.NewRow();
            r.modelId = models.findIdByName(names.get(p.get("model").asText()));
            r.name = p.get("name").asText();
            r.x = p.get("x").asDouble();
            r.y = p.get("y").asDouble();
            r.rot = p.get("rot").asDouble();
            rows.add(r);
        }
        int n = service.createSeed(drawingId, rows);
        log.info("나셀 공장에 기본 배치 {}개를 넣었습니다", n);
        return n;
    }
}
