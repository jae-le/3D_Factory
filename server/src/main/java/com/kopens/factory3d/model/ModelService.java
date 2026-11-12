package com.kopens.factory3d.model;

import com.kopens.factory3d.audit.AuditService;
import com.kopens.factory3d.common.BadRequestException;
import com.kopens.factory3d.common.ConflictException;
import com.kopens.factory3d.common.DataDir;
import com.kopens.factory3d.common.NotFoundException;
import com.kopens.factory3d.common.PayloadTooLargeException;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.stream.Stream;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 모델 라이브러리: data-dir/models/&lt;id&gt;/model.glb · thumb.png */
@Service
public class ModelService {
    static final Set<String> CATEGORIES = Set.of("equip", "mat", "mover");
    static final Set<String> EXTS = Set.of("glb", "gltf", "fbx", "obj", "stl");

    private final ModelMapper models;
    private final DataDir dataDir;
    private final AuditService audit;
    private final long maxBytes;
    private final long maxThumb;

    public ModelService(ModelMapper models, DataDir dataDir, AuditService audit,
            @Value("${factory3d.model.max-bytes:104857600}") long maxBytes,
            @Value("${factory3d.model.max-thumbnail-bytes:2097152}") long maxThumb) {
        this.models = models;
        this.dataDir = dataDir;
        this.audit = audit;
        this.maxBytes = maxBytes;
        this.maxThumb = maxThumb;
    }

    public List<ModelInfo> list() {
        return models.findAll();
    }

    public ModelInfo get(long id) {
        ModelInfo m = models.findById(id);
        if (m == null) throw new NotFoundException("모델을 찾을 수 없습니다.");
        return m;
    }

    public Path file(long id) {
        return existing(get(id).file());
    }

    public Path thumbnail(long id) {
        return existing(get(id).thumbnail());
    }

    @Transactional
    public ModelInfo create(String name, String category, String sourceExt, double sx, double sy, double sz,
            String aliases, long glbSize, byte[] glb, long pngSize, byte[] png, String by) {
        checkFiles(glbSize, glb, pngSize, png);
        String n = checkName(name, null);
        checkMeta(category, sourceExt, sx, sy, sz);
        long id = insert(n, category, sourceExt.toLowerCase(), sx, sy, sz, splitAliases(aliases), by, glb, png);
        audit.log("MODEL_CREATE", n, "id=" + id);
        return get(id);
    }

    /** 첫 실행 기본 모델 (로그인 없이) */
    @Transactional
    public ModelInfo createSeed(String name, String category, List<String> aliases, double sx, double sy, double sz,
            byte[] glb, byte[] png) {
        long id = insert(name, category, "glb", sx, sy, sz, aliases.toArray(String[]::new), "system", glb, png);
        audit.logAs("system", "MODEL_SEED", name, "id=" + id);
        return get(id);
    }

    @Transactional
    public ModelInfo update(long id, String name, String category, List<String> aliases) {
        ModelInfo m = get(id);
        String n = name == null ? m.name() : checkName(name, id);
        String c = category == null ? m.category() : category;
        if (!CATEGORIES.contains(c)) throw new BadRequestException("분류는 equip, mat, mover 중 하나입니다.");
        String[] a = aliases == null ? m.aliases().toArray(String[]::new) : clean(aliases);
        models.update(id, n, c, a);
        audit.log("MODEL_UPDATE", n, "id=" + id);
        return get(id);
    }

    @Transactional
    public ModelInfo replaceFile(long id, String sourceExt, double sx, double sy, double sz, long glbSize, byte[] glb,
            long pngSize, byte[] png) {
        ModelInfo m = get(id);
        checkFiles(glbSize, glb, pngSize, png);
        checkMeta(m.category(), sourceExt, sx, sy, sz);
        write(id, glb, png);
        models.replaceFile(id, sourceExt.toLowerCase(), sx, sy, sz);
        audit.log("MODEL_FILE", m.name(), "id=" + id);
        return get(id);
    }

    @Transactional
    public void delete(long id) {
        ModelInfo m = get(id);
        models.delete(id); // 배치는 model_id null (임시 상자)
        audit.log("MODEL_DELETE", m.name(), "id=" + id);
        Path dir = dataDir.resolve("models/" + id);
        try (Stream<Path> files = Files.exists(dir) ? Files.walk(dir) : Stream.empty()) {
            files.sorted(Comparator.reverseOrder()).forEach(f -> f.toFile().delete());
        } catch (IOException e) {
            throw new UncheckedIOException("모델 파일을 지우지 못했습니다.", e);
        }
    }

    private long insert(String name, String category, String ext, double sx, double sy, double sz, String[] aliases,
            String by, byte[] glb, byte[] png) {
        var row = new ModelMapper.ModelRow();
        row.name = name;
        row.category = category;
        row.sourceExt = ext;
        row.sizeX = sx;
        row.sizeY = sy;
        row.sizeZ = sz;
        row.aliases = aliases;
        row.createdBy = by;
        models.insert(row);
        write(row.id, glb, png);
        models.setFiles(row.id, "models/" + row.id + "/model.glb", "models/" + row.id + "/thumb.png");
        return row.id;
    }

    private void write(long id, byte[] glb, byte[] png) {
        try {
            Path g = dataDir.resolve("models/" + id + "/model.glb");
            Files.createDirectories(g.getParent());
            Files.write(g, glb);
            Files.write(dataDir.resolve("models/" + id + "/thumb.png"), png);
        } catch (IOException e) {
            throw new UncheckedIOException("모델 파일을 저장하지 못했습니다.", e);
        }
    }

    private Path existing(String rel) {
        Path p = dataDir.resolve(rel);
        if (rel.isEmpty() || !Files.exists(p)) throw new NotFoundException("모델 파일이 없습니다.");
        return p;
    }

    private void checkFiles(long glbSize, byte[] glb, long pngSize, byte[] png) {
        if (glbSize > maxBytes || glb.length > maxBytes) throw new PayloadTooLargeException("모델 파일이 너무 큽니다.");
        if (glb.length < 12 || glb[0] != 'g' || glb[1] != 'l' || glb[2] != 'T' || glb[3] != 'F' || glb[4] != 2)
            throw new BadRequestException("glb 파일이 아닙니다.");
        if (pngSize > maxThumb || png.length > maxThumb) throw new PayloadTooLargeException("썸네일이 너무 큽니다.");
        byte[] sig = {(byte) 0x89, 'P', 'N', 'G'};
        if (png.length < 8 || !Arrays.equals(Arrays.copyOf(png, 4), sig)) throw new BadRequestException("썸네일은 PNG 여야 합니다.");
    }

    private void checkMeta(String category, String sourceExt, double sx, double sy, double sz) {
        if (category == null || !CATEGORIES.contains(category)) throw new BadRequestException("분류는 equip, mat, mover 중 하나입니다.");
        if (sourceExt == null || !EXTS.contains(sourceExt.toLowerCase())) throw new BadRequestException("지원하지 않는 3D 파일 형식입니다.");
        for (double v : new double[] {sx, sy, sz})
            if (!(v > 0) || Double.isInfinite(v)) throw new BadRequestException("모델 크기가 올바르지 않습니다.");
    }

    private String checkName(String name, Long excludeId) {
        String n = name == null ? "" : name.strip();
        if (n.isEmpty() || n.length() > 100) throw new BadRequestException("모델 이름은 1~100자로 입력하세요.");
        if (models.existsByName(n, excludeId)) throw new ConflictException("같은 이름의 모델이 있습니다.");
        return n;
    }

    static String[] splitAliases(String s) {
        return s == null ? new String[0] : clean(Arrays.asList(s.split(",")));
    }

    static String[] clean(List<String> list) {
        return list.stream().map(String::strip).filter(x -> !x.isEmpty()).map(x -> x.length() > 100 ? x.substring(0, 100) : x)
                .distinct().toArray(String[]::new);
    }
}
