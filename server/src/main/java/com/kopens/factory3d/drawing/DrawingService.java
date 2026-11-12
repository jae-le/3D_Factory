package com.kopens.factory3d.drawing;

import com.kopens.factory3d.audit.AuditService;
import com.kopens.factory3d.common.BadRequestException;
import com.kopens.factory3d.common.ConflictException;
import com.kopens.factory3d.common.DataDir;
import com.kopens.factory3d.common.NotFoundException;
import com.kopens.factory3d.common.PayloadTooLargeException;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** 도면: 원본 파일(data-dir/drawings/&lt;id&gt;/source.dxf) + 해석 결과(plan) */
@Service
public class DrawingService {
    private static final Logger log = LoggerFactory.getLogger(DrawingService.class);

    private final DrawingMapper drawings;
    private final DataDir dataDir;
    private final AuditService audit;
    private final ObjectMapper json;
    private final long maxSource;
    private final long maxPlan;

    public DrawingService(DrawingMapper drawings, DataDir dataDir, AuditService audit, ObjectMapper json,
            @Value("${factory3d.drawing.max-source-bytes:52428800}") long maxSource,
            @Value("${factory3d.drawing.max-plan-bytes:20971520}") long maxPlan) {
        this.drawings = drawings;
        this.dataDir = dataDir;
        this.audit = audit;
        this.json = json;
        this.maxSource = maxSource;
        this.maxPlan = maxPlan;
    }

    public List<DrawingSummary> list() {
        return drawings.findAll();
    }

    public DrawingDetail get(long id) {
        DrawingDetail d = drawings.findById(id);
        if (d == null) throw new NotFoundException("도면을 찾을 수 없습니다.");
        return d;
    }

    public Path source(long id) {
        Path p = dataDir.resolve(get(id).sourceFile());
        if (!Files.exists(p)) throw new NotFoundException("도면 원본 파일이 없습니다.");
        return p;
    }

    @Transactional
    public DrawingDetail create(String fileName, byte[] bytes, String name, String plan, String layerRules, String by) {
        if (fileName == null || !fileName.toLowerCase(Locale.ROOT).endsWith(".dxf"))
            throw new BadRequestException("DXF 파일만 올릴 수 있습니다.");
        if (bytes.length > maxSource) throw new PayloadTooLargeException("도면 파일이 너무 큽니다.");
        String n = checkName(name, null);
        String p = checkPlan(plan);
        String r = checkRules(layerRules);
        long id = insert(n, p, r, by, bytes);
        audit.log("DRAWING_CREATE", n, "id=" + id);
        return get(id);
    }

    /** 첫 실행 기본 도면 (로그인 없이 서버가 넣음) */
    @Transactional
    public DrawingDetail createSeed(String name, byte[] bytes, String plan) {
        long id = insert(name, checkPlan(plan), "{}", "system", bytes);
        audit.logAs("system", "DRAWING_SEED", name, "id=" + id);
        return get(id);
    }

    @Transactional
    public DrawingDetail savePlan(long id, int version, JsonNode plan, JsonNode layerRules) {
        get(id);
        String p = checkPlan(plan == null ? null : plan.toString());
        String r = checkRules(layerRules == null ? null : layerRules.toString());
        if (drawings.updatePlan(id, version, p, r) == 0) throw new ConflictException("다른 사람이 먼저 수정했습니다.");
        audit.log("DRAWING_UPDATE", get(id).name(), "id=" + id + " version=" + (version + 1));
        return get(id);
    }

    @Transactional
    public DrawingDetail rename(long id, String name) {
        get(id);
        String n = checkName(name, id);
        drawings.rename(id, n);
        audit.log("DRAWING_RENAME", n, "id=" + id);
        return get(id);
    }

    @Transactional
    public void delete(long id) {
        DrawingDetail d = get(id);
        drawings.delete(id);
        audit.log("DRAWING_DELETE", d.name(), "id=" + id);
        Path dir = dataDir.resolve("drawings/" + id);
        try (Stream<Path> files = Files.exists(dir) ? Files.walk(dir) : Stream.empty()) {
            files.sorted(Comparator.reverseOrder()).forEach(f -> f.toFile().delete());
        } catch (IOException e) {
            log.warn("도면 폴더를 지우지 못함: {}", dir, e);
        }
    }

    private long insert(String name, String plan, String rules, String by, byte[] bytes) {
        var row = new DrawingMapper.DrawingRow();
        row.name = name;
        row.sourceType = "dxf";
        row.plan = plan;
        row.layerRules = rules;
        row.createdBy = by;
        drawings.insert(row);
        String rel = "drawings/" + row.id + "/source.dxf";
        try {
            Path target = dataDir.resolve(rel);
            Files.createDirectories(target.getParent());
            Files.write(target, bytes);
        } catch (IOException e) {
            throw new UncheckedIOException("도면 원본을 저장하지 못했습니다.", e); // 트랜잭션 롤백
        }
        drawings.setSourceFile(row.id, rel);
        return row.id;
    }

    private String checkName(String name, Long excludeId) {
        String n = name == null ? "" : name.strip();
        if (n.isEmpty() || n.length() > 100) throw new BadRequestException("도면 이름은 1~100자로 입력하세요.");
        if (drawings.existsByName(n, excludeId)) throw new ConflictException("같은 이름의 도면이 있습니다.");
        return n;
    }

    private String checkPlan(String plan) {
        if (plan == null) throw new BadRequestException("도면 해석 결과(plan)가 올바르지 않습니다.");
        if (plan.getBytes(StandardCharsets.UTF_8).length > maxPlan) throw new PayloadTooLargeException("도면 해석 결과가 너무 큽니다.");
        try {
            JsonNode n = json.readTree(plan);
            if (!n.isObject() || !n.has("format") || !n.path("bounds").isObject() || !n.path("lines").isArray())
                throw new BadRequestException("도면 해석 결과(plan)가 올바르지 않습니다.");
            return n.toString();
        } catch (JacksonException e) {
            throw new BadRequestException("도면 해석 결과(plan)가 올바르지 않습니다.");
        }
    }

    private String checkRules(String rules) {
        if (rules == null || rules.isBlank()) return "{}";
        try {
            JsonNode n = json.readTree(rules);
            if (!n.isObject()) throw new BadRequestException("레이어 규칙이 올바르지 않습니다.");
            return n.toString();
        } catch (JacksonException e) {
            throw new BadRequestException("레이어 규칙이 올바르지 않습니다.");
        }
    }
}
