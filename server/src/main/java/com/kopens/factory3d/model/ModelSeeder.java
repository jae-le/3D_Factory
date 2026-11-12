package com.kopens.factory3d.model;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** 첫 실행 기본 모델 11종 (seed/models.json + seed/models/&lt;key&gt;/model.glb·thumb.png) */
@Component
public class ModelSeeder {
    private static final Logger log = LoggerFactory.getLogger(ModelSeeder.class);
    private final ModelMapper models;
    private final ModelService service;
    private final ObjectMapper json;

    public ModelSeeder(ModelMapper models, ModelService service, ObjectMapper json) {
        this.models = models;
        this.service = service;
        this.json = json;
    }

    public int seedIfEmpty() throws IOException {
        if (models.count() > 0) return 0;
        int n = 0;
        for (JsonNode m : json.readTree(read("seed/models.json"))) {
            String key = m.get("key").asText();
            List<String> aliases = new ArrayList<>();
            m.get("aliases").forEach(a -> aliases.add(a.asText()));
            service.createSeed(m.get("name").asText(), m.get("category").asText(), aliases, m.get("sizeX").asDouble(),
                    m.get("sizeY").asDouble(), m.get("sizeZ").asDouble(), read("seed/models/" + key + "/model.glb"),
                    read("seed/models/" + key + "/thumb.png"));
            n++;
        }
        log.info("기본 모델 {}종을 넣었습니다", n);
        return n;
    }

    /** seed key → 모델 이름 */
    public java.util.Map<String, String> keyToName() throws IOException {
        var map = new java.util.HashMap<String, String>();
        for (JsonNode m : json.readTree(read("seed/models.json"))) map.put(m.get("key").asText(), m.get("name").asText());
        return map;
    }

    static byte[] read(String path) throws IOException {
        try (InputStream in = new ClassPathResource(path).getInputStream()) {
            return in.readAllBytes();
        }
    }
}
