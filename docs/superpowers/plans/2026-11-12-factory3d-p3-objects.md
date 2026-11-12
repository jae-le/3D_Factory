# Factory3D P3 객체 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공용 3D 모델 라이브러리와 도면별 배치를 만들고, 객체 추가(3D 파일 업로드→glb), demo 편집(격자·회전·겹침·되돌리기), 도면 표기 자동 배치, 관리자 객체관리, 나셀 공장 기본 배치 79개를 제공한다.

**Architecture:** 서버는 `model`·`placement` 표와 REST API, 첫 실행 시드(모델 11종 glb + 배치 79개)를 맡는다. 화면은 순수 계산(격자·매칭·되돌리기)을 `web/src/objects/` 에 두고 vitest 로 검증하며, 3D 표시·배치·끌기는 `FactoryScene` 에 붙는 `objectLayer` 가 맡는다. 기본 모델은 demo 의 절차 모델 코드를 브라우저에서 한 번 구워 glb 로 저장소에 넣는다.

**Tech Stack:** Spring Boot 4.1 · MyBatis · PostgreSQL 17 / React 19 · TS · three@0.186.1 (GLTFLoader·GLTFExporter·FBXLoader·OBJLoader·STLLoader) · vitest · Playwright(Edge)

**Spec:** `docs/superpowers/specs/2026-11-12-factory3d-p3-objects-design.md` (전체 설계 `docs/superpowers/specs/2026-11-12-factory3d-platform-design.md` §4.2·§4.3·§5.2)

## Global Constraints

- 프로젝트 루트 `C:\kopens\project\Factory3D`. `C:\kopens\project\demo`, `C:\kopens\project\3D_WEB` 는 **수정 금지** (읽고 복사만).
- Docker·Testcontainers 금지. 서버 테스트는 로컬 PostgreSQL 17 `localhost:5433` 의 `factory3d_test` (support/IntegrationTest — 매 테스트 전 모든 표·데이터 폴더 비움).
- 이름 규칙: Java 패키지 `com.kopens.factory3d`, 설정 `factory3d.*`, 환경 변수 `F3D_*`, localStorage `f3d:*`.
- 권한: 조회 = 보기·선택, 운전원 = 모델 업로드·배치·편집, 관리자 = 모델 수정·교체·삭제.
- 모델 파일은 항상 glb, m 단위, 바닥 중심 원점(bbox 아래면 y=0, x·z 중심 0), 앞쪽 +X. size: `sizeX` = +X 길이, `sizeY` = 세로(three 의 z 방향 폭), `sizeZ` = 높이(three 의 y).
- 배치 좌표는 plan 좌표(m, 원점 = 도면 bbox 최소점, y 위쪽). `rot` 은 도(°), 반시계. 3D: 위치 `planToLocal(x, y, bounds)`, `rotation.y = rot·π/180`, 객체는 FactoryScene root 아래.
- 같은 도면 안 배치 이름 중복 금지 (P4 상황판 연결 키).
- 모든 사용자 문구·오류는 한국어. `border-left` 강조선·이모지 금지, 아이콘 lucide-react, 라벨 약 13~15px.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. `.superpowers/` 는 커밋하지 않음.
- 웹: `cd web && npx vitest run` (출력에 경고 없이), `npm run build`, `./node_modules/.bin/oxlint`. 서버: `cd server && ./gradlew test`.
- TS 설정: verbatimModuleSyntax(`import type`), noUnusedLocals, erasableSyntaxOnly(매개변수 속성 금지). 세미콜론 없음, 작은따옴표.

## 파일 구조

```
server/src/main/resources/db/migration/V4__model_placement.sql
server/src/main/java/com/kopens/factory3d/
  model/ ModelInfo · ModelMapper(+xml) · ModelService · ModelController · ModelSeeder
  placement/ PlacementView · PlacementMapper(+xml) · PlacementService · PlacementController · PlacementSeeder
  drawing/ DrawingController(PlanSave.scaleFactor) · DrawingService(scaleFactor) · DrawingSummary(placements) · DrawingMapper.xml · DrawingSeeder(순서)
  common/SecurityConfig.java (모델 PATCH·PUT·DELETE 관리자)
server/src/main/resources/seed/models.json · seed/models/<key>/model.glb · thumb.png · seed/main_factory.placements.json

web/src/objects/
  types.ts · grid.ts · match.ts · history.ts (+ 테스트)
  api.ts · useModels.ts · usePlacements.ts (+ 테스트)
  builtin/ materials.ts · equipMesh.ts · bakePage.ts   (demo 이식, 굽기 전용)
  seed/mainScenario.ts · seed/seedPlacements.test.ts
  convert/ load.ts · normalize.ts · exportGlb.ts · thumbnail.ts (+ normalize 테스트)
  ObjectPanel.tsx · ModelCard.tsx · PlacementList.tsx · ObjectInfo.tsx · EditTag.tsx · AddModelDialog.tsx (+ 테스트)
web/src/scene/objectLayer.ts · FactoryScene.ts(객체 API 추가) · FactoryView.tsx
web/src/pages/FactoryPage.tsx · admin/ModelsPage.tsx · admin/AdminLayout.tsx · admin/DrawingsPage.tsx · routes.tsx
web/src/drawing/DrawingTools.tsx · useDrawing.ts · api.ts (scaleFactor) · AddDrawingDialog.tsx(자동 배치)
web/bake.html · web/scripts/bake-models.mjs · web/e2e/p3-smoke.mjs · web/e2e/fixtures/box.obj
```

---

### Task 1: 서버 — 모델 라이브러리 API

**Files:**
- Create: `server/src/main/resources/db/migration/V4__model_placement.sql`
- Create: `server/src/main/java/com/kopens/factory3d/model/{ModelInfo,ModelMapper,ModelService,ModelController}.java`, `server/src/main/resources/mapper/ModelMapper.xml`
- Modify: `server/src/main/java/com/kopens/factory3d/common/SecurityConfig.java`, `server/src/main/resources/application.yml`
- Test: `server/src/test/java/com/kopens/factory3d/model/ModelApiTest.java`

**Interfaces:**
- Consumes: `DataDir.resolve(String)`, `AuditService.log/logAs`, `BadRequestException`, `ConflictException`, `NotFoundException`, `PayloadTooLargeException` (common).
- Produces (REST): spec §4.1 의 `/api/models` 7개. 목록 JSON `[{id,name,category,sourceExt,sizeX,sizeY,sizeZ,aliases,version,usedDrawings,updatedAt}]` 이름순.
- Produces (Java): `ModelService.createSeed(String name, String category, List<String> aliases, double sx, double sy, double sz, byte[] glb, byte[] png): ModelInfo` (Task 5), `ModelMapper.count(): int`, `ModelMapper.findIdByName(String): Long`.
- Produces (DB): `model`, `placement` 표 (Task 2 가 placement 사용).

- [ ] **Step 1: 마이그레이션 작성**

`server/src/main/resources/db/migration/V4__model_placement.sql`:
```sql
-- 공용 3D 모델 라이브러리 (항상 glb, m 단위, 바닥 중심 원점, 앞쪽 +X)
create table model (
    id          bigserial    primary key,
    name        varchar(100) not null unique,
    category    varchar(8)   not null check (category in ('equip', 'mat', 'mover')),
    file        varchar(300) not null default '',
    source_ext  varchar(8)   not null,
    size_x      double precision not null check (size_x > 0),
    size_y      double precision not null check (size_y > 0),
    size_z      double precision not null check (size_z > 0),
    thumbnail   varchar(300) not null default '',
    aliases     text[]       not null default '{}',
    version     int          not null default 1,
    created_by  varchar(32),
    created_at  timestamptz  not null default now(),
    updated_at  timestamptz  not null default now()
);

-- 도면별 배치 (plan 좌표 m, rot 도·반시계). 모델이 지워지면 임시 상자(model_id null)
create table placement (
    id          bigserial    primary key,
    drawing_id  bigint       not null references drawing (id) on delete cascade,
    model_id    bigint       references model (id) on delete set null,
    name        varchar(100) not null,
    x           double precision not null,
    y           double precision not null,
    rot         double precision not null default 0,
    hint_label  varchar(100),
    created_at  timestamptz  not null default now(),
    updated_at  timestamptz  not null default now(),
    unique (drawing_id, name)
);
create index placement_drawing on placement (drawing_id);
```

- [ ] **Step 2: 실패 테스트 작성**

`server/src/test/java/com/kopens/factory3d/model/ModelApiTest.java`:
```java
package com.kopens.factory3d.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.jayway.jsonpath.JsonPath;
import com.kopens.factory3d.support.IntegrationTest;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.file.Files;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

class ModelApiTest extends IntegrationTest {
    static final RequestPostProcessor VIEWER = user("viewer").roles("VIEWER");
    static final RequestPostProcessor OPERATOR = user("kim").roles("OPERATOR");
    static final RequestPostProcessor ADMIN = user("admin").roles("ADMIN");

    /** 최소 glb: 12바이트 머리 (magic glTF, version 2, length) */
    static byte[] glb() {
        return ByteBuffer.allocate(12).order(ByteOrder.LITTLE_ENDIAN).putInt(0x46546C67).putInt(2).putInt(12).array();
    }

    static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0};

    private MockMultipartHttpServletRequestBuilder upload(String name, byte[] glb) {
        return (MockMultipartHttpServletRequestBuilder) multipart("/api/models")
                .file(new MockMultipartFile("file", "m.glb", "model/gltf-binary", glb))
                .file(new MockMultipartFile("thumbnail", "t.png", "image/png", PNG))
                .param("name", name).param("category", "mat").param("sourceExt", "obj")
                .param("sizeX", "4").param("sizeY", "3.5").param("sizeZ", "2").param("aliases", "HUB, 허브 ");
    }

    private long create(String name) throws Exception {
        String body = mvc.perform(upload(name, glb()).with(OPERATOR).with(csrf()))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(body, "$.id")).longValue();
    }

    @Test
    void 운전원이_올리면_목록·파일·썸네일() throws Exception {
        long id = create("허브");
        mvc.perform(get("/api/models").with(VIEWER))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("허브"))
                .andExpect(jsonPath("$[0].category").value("mat"))
                .andExpect(jsonPath("$[0].sizeY").value(3.5))
                .andExpect(jsonPath("$[0].aliases[0]").value("HUB"))
                .andExpect(jsonPath("$[0].aliases[1]").value("허브"))
                .andExpect(jsonPath("$[0].version").value(1))
                .andExpect(jsonPath("$[0].usedDrawings").value(0));
        byte[] file = mvc.perform(get("/api/models/" + id + "/file").with(VIEWER))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "model/gltf-binary"))
                .andExpect(header().string("Cache-Control", "max-age=31536000, immutable"))
                .andReturn().getResponse().getContentAsByteArray();
        assertThat(file).isEqualTo(glb());
        mvc.perform(get("/api/models/" + id + "/thumbnail").with(VIEWER))
                .andExpect(status().isOk()).andExpect(header().string("Content-Type", "image/png"));
        assertThat(Files.exists(dataDir.resolve("models/" + id + "/model.glb"))).isTrue();
        assertThat(jdbc.queryForObject("select count(*) from audit_log where action = 'MODEL_CREATE'", Integer.class)).isEqualTo(1);
    }

    @Test
    void 잘못된_업로드는_한국어_오류() throws Exception {
        mvc.perform(upload("가짜", new byte[] {1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12}).with(OPERATOR).with(csrf()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("glb 파일이 아닙니다."));
        mvc.perform(upload("크기", glb()).param("sizeX", "0").with(OPERATOR).with(csrf()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("모델 크기가 올바르지 않습니다."));
        mvc.perform(upload("분류", glb()).param("category", "x").with(OPERATOR).with(csrf()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("분류는 equip, mat, mover 중 하나입니다."));
        create("중복");
        mvc.perform(upload("중복", glb()).with(OPERATOR).with(csrf()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.detail").value("같은 이름의 모델이 있습니다."));
        mvc.perform(upload("조회", glb()).with(VIEWER).with(csrf())).andExpect(status().isForbidden());
    }

    @Test
    void 관리자만_수정·파일교체·삭제() throws Exception {
        long id = create("링");
        mvc.perform(patch("/api/models/" + id).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"베어링 링\"}").with(OPERATOR).with(csrf()))
                .andExpect(status().isForbidden());
        mvc.perform(patch("/api/models/" + id).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"베어링 링\",\"category\":\"equip\",\"aliases\":[\"RING\"]}").with(ADMIN).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("베어링 링"))
                .andExpect(jsonPath("$.category").value("equip"))
                .andExpect(jsonPath("$.aliases[0]").value("RING"));
        mvc.perform(multipart("/api/models/" + id + "/file")
                        .file(new MockMultipartFile("file", "m.glb", "model/gltf-binary", glb()))
                        .file(new MockMultipartFile("thumbnail", "t.png", "image/png", PNG))
                        .param("sourceExt", "fbx").param("sizeX", "5").param("sizeY", "5").param("sizeZ", "1")
                        .with(r -> { r.setMethod("PUT"); return r; }).with(ADMIN).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(2))
                .andExpect(jsonPath("$.sourceExt").value("fbx"))
                .andExpect(jsonPath("$.sizeX").value(5.0));
        mvc.perform(delete("/api/models/" + id).with(OPERATOR).with(csrf())).andExpect(status().isForbidden());
        mvc.perform(delete("/api/models/" + id).with(ADMIN).with(csrf())).andExpect(status().isNoContent());
        assertThat(Files.exists(dataDir.resolve("models/" + id))).isFalse();
        mvc.perform(get("/api/models/" + id + "/file").with(VIEWER))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.detail").value("모델을 찾을 수 없습니다."));
    }
}
```

Run: `cd /c/kopens/project/Factory3D/server && ./gradlew test --tests "*ModelApiTest"`
Expected: FAIL (404 / 컴파일 오류).

- [ ] **Step 3: 구현**

`application.yml` 의 `factory3d.drawing` 블록 아래(같은 들여쓰기)에 추가:
```yaml
  model:
    max-bytes: ${F3D_MODEL_MAX:104857600}        # glb 100MB
    max-thumbnail-bytes: ${F3D_MODEL_THUMB_MAX:2097152}
```

`model/ModelInfo.java`:
```java
package com.kopens.factory3d.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import java.time.OffsetDateTime;
import java.util.List;

/** 모델 목록·상세. file·thumbnail 경로는 응답에 내보내지 않음 */
public record ModelInfo(long id, String name, String category, String sourceExt, double sizeX, double sizeY, double sizeZ,
        List<String> aliases, int version, int usedDrawings, OffsetDateTime updatedAt,
        @JsonIgnore String file, @JsonIgnore String thumbnail) {}
```

`model/ModelMapper.java`:
```java
package com.kopens.factory3d.model;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface ModelMapper {
    List<ModelInfo> findAll();

    ModelInfo findById(long id);

    Long findIdByName(String name);

    int count();

    boolean existsByName(@Param("name") String name, @Param("excludeId") Long excludeId);

    void insert(ModelRow row);

    void setFiles(@Param("id") long id, @Param("file") String file, @Param("thumbnail") String thumbnail);

    void update(@Param("id") long id, @Param("name") String name, @Param("category") String category,
            @Param("aliases") String[] aliases);

    void replaceFile(@Param("id") long id, @Param("sourceExt") String sourceExt, @Param("sx") double sx,
            @Param("sy") double sy, @Param("sz") double sz);

    void delete(long id);

    final class ModelRow {
        public Long id;
        public String name;
        public String category;
        public String sourceExt;
        public double sizeX;
        public double sizeY;
        public double sizeZ;
        public String[] aliases;
        public String createdBy;
    }
}
```

`resources/mapper/ModelMapper.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "https://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.kopens.factory3d.model.ModelMapper">

    <resultMap id="info" type="com.kopens.factory3d.model.ModelInfo">
        <constructor>
            <idArg column="id" javaType="_long"/>
            <arg column="name" javaType="String"/>
            <arg column="category" javaType="String"/>
            <arg column="source_ext" javaType="String"/>
            <arg column="size_x" javaType="_double"/>
            <arg column="size_y" javaType="_double"/>
            <arg column="size_z" javaType="_double"/>
            <arg column="aliases" javaType="java.util.List" typeHandler="com.kopens.factory3d.model.TextArrayHandler"/>
            <arg column="version" javaType="_int"/>
            <arg column="used_drawings" javaType="_int"/>
            <arg column="updated_at" javaType="java.time.OffsetDateTime"/>
            <arg column="file" javaType="String"/>
            <arg column="thumbnail" javaType="String"/>
        </constructor>
    </resultMap>

    <sql id="cols">
        m.id, m.name, m.category, m.source_ext, m.size_x, m.size_y, m.size_z, m.aliases, m.version, m.updated_at,
        m.file, m.thumbnail,
        (select count(distinct p.drawing_id) from placement p where p.model_id = m.id) as used_drawings
    </sql>

    <select id="findAll" resultMap="info">select <include refid="cols"/> from model m order by m.name</select>
    <select id="findById" resultMap="info">select <include refid="cols"/> from model m where m.id = #{id}</select>
    <select id="findIdByName" resultType="java.lang.Long">select id from model where name = #{name}</select>
    <select id="count" resultType="_int">select count(*) from model</select>
    <select id="existsByName" resultType="_boolean">
        select exists(select 1 from model where name = #{name}
            <if test="excludeId != null">and id &lt;&gt; #{excludeId}</if>)
    </select>

    <insert id="insert" useGeneratedKeys="true" keyProperty="id" keyColumn="id">
        insert into model (name, category, source_ext, size_x, size_y, size_z, aliases, created_by)
        values (#{name}, #{category}, #{sourceExt}, #{sizeX}, #{sizeY}, #{sizeZ},
                #{aliases,typeHandler=org.apache.ibatis.type.ArrayTypeHandler}, #{createdBy,jdbcType=VARCHAR})
    </insert>

    <update id="setFiles">update model set file = #{file}, thumbnail = #{thumbnail} where id = #{id}</update>

    <update id="update">
        update model set name = #{name}, category = #{category},
            aliases = #{aliases,typeHandler=org.apache.ibatis.type.ArrayTypeHandler}, updated_at = now()
        where id = #{id}
    </update>

    <update id="replaceFile">
        update model set source_ext = #{sourceExt}, size_x = #{sx}, size_y = #{sy}, size_z = #{sz},
            version = version + 1, updated_at = now()
        where id = #{id}
    </update>

    <delete id="delete">delete from model where id = #{id}</delete>
</mapper>
```

`model/TextArrayHandler.java` (PostgreSQL `text[]` → `List<String>`):
```java
package com.kopens.factory3d.model;

import java.sql.Array;
import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Arrays;
import java.util.List;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;

/** text[] ↔ List&lt;String&gt; */
public class TextArrayHandler extends BaseTypeHandler<List<String>> {
    @Override
    public void setNonNullParameter(PreparedStatement ps, int i, List<String> v, JdbcType t) throws SQLException {
        ps.setArray(i, ps.getConnection().createArrayOf("text", v.toArray()));
    }

    @Override
    public List<String> getNullableResult(ResultSet rs, String col) throws SQLException {
        return of(rs.getArray(col));
    }

    @Override
    public List<String> getNullableResult(ResultSet rs, int i) throws SQLException {
        return of(rs.getArray(i));
    }

    @Override
    public List<String> getNullableResult(CallableStatement cs, int i) throws SQLException {
        return of(cs.getArray(i));
    }

    private static List<String> of(Array a) throws SQLException {
        return a == null ? List.of() : Arrays.asList((String[]) a.getArray());
    }
}
```

`model/ModelService.java`:
```java
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
```
`glb[4] != 2`: glb 머리 5번째 바이트(리틀 엔디언 버전의 첫 바이트)가 2 인지 확인.

`model/ModelController.java`:
```java
package com.kopens.factory3d.model;

import java.io.IOException;
import java.util.List;
import java.util.concurrent.TimeUnit;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

/** 모델 라이브러리 (GET 조회, POST 운전원, PATCH·PUT·DELETE 관리자 — SecurityConfig) */
@RestController
@RequestMapping("/api/models")
public class ModelController {
    public record ModelPatch(String name, String category, List<String> aliases) {}

    private static final CacheControl FOREVER = CacheControl.maxAge(365, TimeUnit.DAYS).cachePublic().immutable();
    private final ModelService models;

    public ModelController(ModelService models) {
        this.models = models;
    }

    @GetMapping
    public List<ModelInfo> list() {
        return models.list();
    }

    @GetMapping("/{id}/file")
    public ResponseEntity<Resource> file(@PathVariable long id) {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(365, TimeUnit.DAYS).immutable())
                .contentType(MediaType.parseMediaType("model/gltf-binary")).body(new FileSystemResource(models.file(id)));
    }

    @GetMapping("/{id}/thumbnail")
    public ResponseEntity<Resource> thumbnail(@PathVariable long id) {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(365, TimeUnit.DAYS).immutable())
                .contentType(MediaType.IMAGE_PNG).body(new FileSystemResource(models.thumbnail(id)));
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ModelInfo> create(@RequestParam MultipartFile file, @RequestParam MultipartFile thumbnail,
            @RequestParam String name, @RequestParam String category, @RequestParam String sourceExt,
            @RequestParam double sizeX, @RequestParam double sizeY, @RequestParam double sizeZ,
            @RequestParam(required = false) String aliases, Authentication auth) throws IOException {
        ModelInfo m = models.create(name, category, sourceExt, sizeX, sizeY, sizeZ, aliases, file.getSize(), file.getBytes(),
                thumbnail.getSize(), thumbnail.getBytes(), auth.getName());
        return ResponseEntity.status(HttpStatus.CREATED).body(m);
    }

    @PatchMapping("/{id}")
    public ModelInfo update(@PathVariable long id, @RequestBody ModelPatch body) {
        return models.update(id, body.name(), body.category(), body.aliases());
    }

    @PutMapping(value = "/{id}/file", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ModelInfo replaceFile(@PathVariable long id, @RequestParam MultipartFile file, @RequestParam MultipartFile thumbnail,
            @RequestParam String sourceExt, @RequestParam double sizeX, @RequestParam double sizeY,
            @RequestParam double sizeZ) throws IOException {
        return models.replaceFile(id, sourceExt, sizeX, sizeY, sizeZ, file.getSize(), file.getBytes(), thumbnail.getSize(),
                thumbnail.getBytes());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable long id) {
        models.delete(id);
        return ResponseEntity.noContent().build();
    }
}
```
`FOREVER` 상수는 쓰지 않으면 지운다. 테스트는 `Cache-Control: max-age=31536000, immutable` 를 기대한다 — `CacheControl.maxAge(365, DAYS).immutable()` 이 다른 문자열(예: `public` 포함)을 만들면 테스트 기대값이 아니라 코드 쪽을 `ResponseEntity.ok().header("Cache-Control", "max-age=31536000, immutable")` 로 바꿔 맞춘다.

`ModelMapper.xml` 의 `aliases` 결과 매핑은 `TextArrayHandler`, 입력은 MyBatis 내장 `ArrayTypeHandler`(`String[]`) 를 쓴다.

`common/SecurityConfig.java` 에서 `.requestMatchers(HttpMethod.PATCH, "/api/drawings/**").hasRole("ADMIN")` 줄 바로 위에 추가:
```java
                        .requestMatchers(HttpMethod.PATCH, "/api/models/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.PUT, "/api/models/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.DELETE, "/api/models/**").hasRole("ADMIN")
```

- [ ] **Step 4: 통과 확인 (전체)**

Run: `./gradlew test`
Expected: `BUILD SUCCESSFUL` (기존 + ModelApiTest 3개). PUT 업로드 테스트의 `with(r -> { r.setMethod("PUT"); return r; })` 가 컴파일 안 되면 `multipart(HttpMethod.PUT, "/api/models/" + id + "/file")` 를 쓴다.

- [ ] **Step 5: Commit**

```bash
cd /c/kopens/project/Factory3D && git add server
git commit -m "feat(server): 모델 라이브러리 — 표(V4)·업로드 검사·목록·파일·관리자 수정/교체/삭제

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 서버 — 배치 API · 도면 연동(보정 배율·배치 수)

**Files:**
- Create: `server/src/main/java/com/kopens/factory3d/placement/{PlacementView,PlacementMapper,PlacementService,PlacementController}.java`, `server/src/main/resources/mapper/PlacementMapper.xml`
- Modify: `drawing/DrawingController.java` (PlanSave.scaleFactor), `drawing/DrawingService.java` (savePlan 배율), `drawing/DrawingSummary.java` + `mapper/DrawingMapper.xml` (placements 수)
- Test: `server/src/test/java/com/kopens/factory3d/placement/PlacementApiTest.java`, `drawing/DrawingApiTest.java` (배율·배치 수 추가)

**Interfaces:**
- Consumes: Task 1 의 `model` 표, `ModelApiTest.glb()` 같은 도우미는 쓰지 않고 테스트에서 직접 `insert into model`.
- Produces (REST): `GET /api/drawings/{id}/placements` → `[{id,modelId,name,x,y,rot,hintLabel}]` id 순; `POST /api/drawings/{id}/placements` body `[{modelId?,name,x,y,rot?,hintLabel?}]` → 201 만든 목록; `PATCH /api/placements/{id}` `{name?,x?,y?,rot?,modelId?,clearModel?}` → 바뀐 배치; `DELETE /api/placements/{id}` → 204.
- Produces: `DrawingSummary` 에 `placements` (int) 추가; `PUT /api/drawings/{id}/plan` body 에 선택 칸 `scaleFactor`.
- Produces (Java): `PlacementService.createSeed(long drawingId, List<PlacementMapper.NewRow> rows)` (Task 5), `PlacementMapper.countByDrawing(long)`.

- [ ] **Step 1: 실패 테스트 작성**

`server/src/test/java/com/kopens/factory3d/placement/PlacementApiTest.java`:
```java
package com.kopens.factory3d.placement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.jayway.jsonpath.JsonPath;
import com.kopens.factory3d.support.IntegrationTest;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

class PlacementApiTest extends IntegrationTest {
    static final RequestPostProcessor VIEWER = user("viewer").roles("VIEWER");
    static final RequestPostProcessor OPERATOR = user("kim").roles("OPERATOR");
    static final RequestPostProcessor ADMIN = user("admin").roles("ADMIN");
    long drawing;
    long hub;

    @BeforeEach
    void setUp() {
        drawing = jdbc.queryForObject("insert into drawing (name, source_type, source_file, plan) values ('공장', 'dxf', 'x', "
                + "'{\"format\":1,\"bounds\":{\"w\":10,\"h\":5},\"lines\":[]}') returning id", Long.class);
        hub = jdbc.queryForObject("insert into model (name, category, source_ext, size_x, size_y, size_z) values ('허브', 'mat', 'glb', 4, 4, 3) returning id", Long.class);
    }

    private String post(String json, RequestPostProcessor who) throws Exception {
        return mvc.perform(post("/api/drawings/" + drawing + "/placements").contentType(MediaType.APPLICATION_JSON).content(json).with(who).with(csrf()))
                .andReturn().getResponse().getContentAsString();
    }

    @Test
    void 여러_개_추가하고_도면별로_조회() throws Exception {
        mvc.perform(post("/api/drawings/" + drawing + "/placements").contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"modelId\":" + hub + ",\"name\":\"허브 1\",\"x\":1.5,\"y\":2,\"rot\":90},"
                                + "{\"name\":\"표기 PUMP\",\"x\":3,\"y\":4,\"hintLabel\":\"PUMP\"}]").with(OPERATOR).with(csrf()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].modelId").value(hub))
                .andExpect(jsonPath("$[1].modelId").doesNotExist())
                .andExpect(jsonPath("$[1].hintLabel").value("PUMP"));
        mvc.perform(get("/api/drawings/" + drawing + "/placements").with(VIEWER))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].name").value("허브 1"))
                .andExpect(jsonPath("$[0].rot").value(90.0))
                .andExpect(jsonPath("$[1].rot").value(0.0));
        mvc.perform(get("/api/drawings").with(VIEWER)).andExpect(jsonPath("$[0].placements").value(2));
        assertThat(jdbc.queryForObject("select count(*) from audit_log where action = 'PLACEMENT_CREATE'", Integer.class)).isEqualTo(1);
    }

    @Test
    void 잘못된_배치는_한국어_오류() throws Exception {
        post("[{\"name\":\"허브 1\",\"x\":1,\"y\":1}]", OPERATOR);
        mvc.perform(post("/api/drawings/" + drawing + "/placements").contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"name\":\"허브 1\",\"x\":1,\"y\":1}]").with(OPERATOR).with(csrf()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.detail").value("같은 이름의 객체가 이 도면에 있습니다."));
        mvc.perform(post("/api/drawings/" + drawing + "/placements").contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"name\":\"a\",\"x\":1,\"y\":1},{\"name\":\"a\",\"x\":2,\"y\":2}]").with(OPERATOR).with(csrf()))
                .andExpect(status().isConflict());
        mvc.perform(post("/api/drawings/" + drawing + "/placements").contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"modelId\":99999,\"name\":\"b\",\"x\":1,\"y\":1}]").with(OPERATOR).with(csrf()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("모델을 찾을 수 없습니다."));
        mvc.perform(post("/api/drawings/" + drawing + "/placements").contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"name\":\" \",\"x\":1,\"y\":1}]").with(OPERATOR).with(csrf()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("객체 이름은 1~100자로 입력하세요."));
        mvc.perform(post("/api/drawings/" + drawing + "/placements").contentType(MediaType.APPLICATION_JSON)
                        .content("[]").with(OPERATOR).with(csrf()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("추가할 객체는 1~2000개여야 합니다."));
        mvc.perform(post("/api/drawings/99999/placements").contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"name\":\"c\",\"x\":1,\"y\":1}]").with(OPERATOR).with(csrf()))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.detail").value("도면을 찾을 수 없습니다."));
        mvc.perform(post("/api/drawings/" + drawing + "/placements").contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"name\":\"d\",\"x\":1,\"y\":1}]").with(VIEWER).with(csrf()))
                .andExpect(status().isForbidden());
    }

    @Test
    void 이동·회전·이름·모델지정·삭제() throws Exception {
        long id = ((Number) JsonPath.read(post("[{\"name\":\"표기 HUB\",\"x\":1,\"y\":1,\"hintLabel\":\"HUB\"}]", OPERATOR), "$[0].id")).longValue();
        mvc.perform(patch("/api/placements/" + id).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"x\":5,\"y\":6,\"rot\":180,\"name\":\"허브 1\",\"modelId\":" + hub + "}").with(OPERATOR).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.x").value(5.0))
                .andExpect(jsonPath("$.rot").value(180.0))
                .andExpect(jsonPath("$.name").value("허브 1"))
                .andExpect(jsonPath("$.modelId").value(hub))
                .andExpect(jsonPath("$.hintLabel").value("HUB"));
        mvc.perform(patch("/api/placements/" + id).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"clearModel\":true}").with(OPERATOR).with(csrf()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.modelId").doesNotExist());
        mvc.perform(patch("/api/placements/" + id).contentType(MediaType.APPLICATION_JSON).content("{\"x\":1}").with(VIEWER).with(csrf()))
                .andExpect(status().isForbidden());
        mvc.perform(delete("/api/placements/" + id).with(OPERATOR).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(patch("/api/placements/" + id).contentType(MediaType.APPLICATION_JSON).content("{\"x\":1}").with(OPERATOR).with(csrf()))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.detail").value("객체를 찾을 수 없습니다."));
    }

    @Test
    void 모델을_지우면_임시상자_도면을_지우면_배치도_삭제() throws Exception {
        post("[{\"modelId\":" + hub + ",\"name\":\"허브 1\",\"x\":1,\"y\":1}]", OPERATOR);
        mvc.perform(delete("/api/models/" + hub).with(ADMIN).with(csrf())).andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("select model_id from placement", Long.class)).isNull();
        mvc.perform(delete("/api/drawings/" + drawing).with(ADMIN).with(csrf())).andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("select count(*) from placement", Integer.class)).isZero();
    }

    @Test
    void 보정_배율을_주면_배치_좌표도_같이_바뀜() throws Exception {
        post("[{\"name\":\"a\",\"x\":2,\"y\":3}]", OPERATOR);
        String body = "{\"version\":1,\"plan\":{\"format\":1,\"bounds\":{\"w\":20,\"h\":10},\"lines\":[]},\"layerRules\":{},\"scaleFactor\":2}";
        mvc.perform(put("/api/drawings/" + drawing + "/plan").contentType(MediaType.APPLICATION_JSON).content(body).with(OPERATOR).with(csrf()))
                .andExpect(status().isOk());
        List<Double> xy = jdbc.queryForList("select unnest(array[x, y]) from placement", Double.class);
        assertThat(xy).containsExactly(4.0, 6.0);
        String bad = body.replace("\"version\":1", "\"version\":2").replace("\"scaleFactor\":2", "\"scaleFactor\":-1");
        mvc.perform(put("/api/drawings/" + drawing + "/plan").contentType(MediaType.APPLICATION_JSON).content(bad).with(OPERATOR).with(csrf()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("배율은 0보다 커야 합니다."));
    }
}
```
(`drawing` 표에 `layer_rules` 기본값 `{}` 이 있어 PUT 의 layerRules `{}` 는 운전원도 허용된다 — P2 규칙.)

Run: `./gradlew test --tests "*PlacementApiTest"`
Expected: FAIL.

- [ ] **Step 2: 구현**

`placement/PlacementView.java`:
```java
package com.kopens.factory3d.placement;

import com.fasterxml.jackson.annotation.JsonInclude;

/** 배치 (plan 좌표 m, rot 도). modelId 가 null 이면 임시 상자 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record PlacementView(long id, Long modelId, String name, double x, double y, double rot, String hintLabel) {}
```
(테스트의 `jsonPath("$[1].modelId").doesNotExist()` 를 위해 null 칸은 생략.)

`placement/PlacementMapper.java`:
```java
package com.kopens.factory3d.placement;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface PlacementMapper {
    List<PlacementView> findByDrawing(long drawingId);

    PlacementView findById(long id);

    Long drawingOf(long id);

    int countByDrawing(long drawingId);

    int countNames(@Param("drawingId") long drawingId, @Param("names") List<String> names, @Param("excludeId") Long excludeId);

    void insert(@Param("drawingId") long drawingId, @Param("row") NewRow row);

    void update(@Param("id") long id, @Param("modelId") Long modelId, @Param("name") String name, @Param("x") double x,
            @Param("y") double y, @Param("rot") double rot);

    void scale(@Param("drawingId") long drawingId, @Param("k") double k);

    void delete(long id);

    final class NewRow {
        public Long id;
        public Long modelId;
        public String name;
        public double x;
        public double y;
        public double rot;
        public String hintLabel;
    }
}
```

`resources/mapper/PlacementMapper.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "https://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.kopens.factory3d.placement.PlacementMapper">

    <resultMap id="view" type="com.kopens.factory3d.placement.PlacementView">
        <constructor>
            <idArg column="id" javaType="_long"/>
            <arg column="model_id" javaType="java.lang.Long"/>
            <arg column="name" javaType="String"/>
            <arg column="x" javaType="_double"/>
            <arg column="y" javaType="_double"/>
            <arg column="rot" javaType="_double"/>
            <arg column="hint_label" javaType="String"/>
        </constructor>
    </resultMap>

    <select id="findByDrawing" resultMap="view">
        select id, model_id, name, x, y, rot, hint_label from placement where drawing_id = #{drawingId} order by id
    </select>
    <select id="findById" resultMap="view">select id, model_id, name, x, y, rot, hint_label from placement where id = #{id}</select>
    <select id="drawingOf" resultType="java.lang.Long">select drawing_id from placement where id = #{id}</select>
    <select id="countByDrawing" resultType="_int">select count(*) from placement where drawing_id = #{drawingId}</select>
    <select id="countNames" resultType="_int">
        select count(*) from placement where drawing_id = #{drawingId} and name in
        <foreach collection="names" item="n" open="(" separator="," close=")">#{n}</foreach>
        <if test="excludeId != null">and id &lt;&gt; #{excludeId}</if>
    </select>

    <insert id="insert" useGeneratedKeys="true" keyProperty="row.id" keyColumn="id">
        insert into placement (drawing_id, model_id, name, x, y, rot, hint_label)
        values (#{drawingId}, #{row.modelId,jdbcType=BIGINT}, #{row.name}, #{row.x}, #{row.y}, #{row.rot}, #{row.hintLabel,jdbcType=VARCHAR})
    </insert>

    <update id="update">
        update placement set model_id = #{modelId,jdbcType=BIGINT}, name = #{name}, x = #{x}, y = #{y}, rot = #{rot}, updated_at = now()
        where id = #{id}
    </update>

    <update id="scale">update placement set x = x * #{k}, y = y * #{k}, updated_at = now() where drawing_id = #{drawingId}</update>

    <delete id="delete">delete from placement where id = #{id}</delete>
</mapper>
```

`placement/PlacementService.java`:
```java
package com.kopens.factory3d.placement;

import com.kopens.factory3d.audit.AuditService;
import com.kopens.factory3d.common.BadRequestException;
import com.kopens.factory3d.common.ConflictException;
import com.kopens.factory3d.common.NotFoundException;
import com.kopens.factory3d.drawing.DrawingMapper;
import com.kopens.factory3d.model.ModelMapper;
import java.util.HashSet;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 도면별 객체 배치 */
@Service
public class PlacementService {
    public record NewPlacement(Long modelId, String name, Double x, Double y, Double rot, String hintLabel) {}

    public record Patch(String name, Double x, Double y, Double rot, Long modelId, Boolean clearModel) {}

    private final PlacementMapper placements;
    private final DrawingMapper drawings;
    private final ModelMapper models;
    private final AuditService audit;

    public PlacementService(PlacementMapper placements, DrawingMapper drawings, ModelMapper models, AuditService audit) {
        this.placements = placements;
        this.drawings = drawings;
        this.models = models;
        this.audit = audit;
    }

    public List<PlacementView> list(long drawingId) {
        requireDrawing(drawingId);
        return placements.findByDrawing(drawingId);
    }

    @Transactional
    public List<PlacementView> create(long drawingId, List<NewPlacement> items) {
        requireDrawing(drawingId);
        if (items == null || items.isEmpty() || items.size() > 2000) throw new BadRequestException("추가할 객체는 1~2000개여야 합니다.");
        List<PlacementMapper.NewRow> rows = items.stream().map(this::toRow).toList();
        insertAll(drawingId, rows);
        audit.log("PLACEMENT_CREATE", "drawing=" + drawingId, rows.size() + "개");
        return rows.stream().map(r -> placements.findById(r.id)).toList();
    }

    /** 첫 실행 기본 배치 (검사 생략, 감사는 system) */
    @Transactional
    public int createSeed(long drawingId, List<PlacementMapper.NewRow> rows) {
        insertAll(drawingId, rows);
        audit.logAs("system", "PLACEMENT_SEED", "drawing=" + drawingId, rows.size() + "개");
        return rows.size();
    }

    @Transactional
    public PlacementView update(long id, Patch p) {
        PlacementView cur = placements.findById(id);
        if (cur == null) throw new NotFoundException("객체를 찾을 수 없습니다.");
        long drawingId = placements.drawingOf(id);
        String name = p.name() == null ? cur.name() : checkName(p.name());
        if (!name.equals(cur.name()) && placements.countNames(drawingId, List.of(name), id) > 0)
            throw new ConflictException("같은 이름의 객체가 이 도면에 있습니다.");
        Long modelId = Boolean.TRUE.equals(p.clearModel()) ? null : p.modelId() != null ? requireModel(p.modelId()) : cur.modelId();
        double x = p.x() == null ? cur.x() : finite(p.x());
        double y = p.y() == null ? cur.y() : finite(p.y());
        double rot = p.rot() == null ? cur.rot() : finite(p.rot());
        placements.update(id, modelId, name, x, y, rot);
        audit.log("PLACEMENT_UPDATE", name, "id=" + id);
        return placements.findById(id);
    }

    @Transactional
    public void delete(long id) {
        PlacementView cur = placements.findById(id);
        if (cur == null) throw new NotFoundException("객체를 찾을 수 없습니다.");
        placements.delete(id);
        audit.log("PLACEMENT_DELETE", cur.name(), "id=" + id);
    }

    /** 도면 보정: 그 도면 모든 배치 좌표 k 배 */
    public void scale(long drawingId, double k) {
        placements.scale(drawingId, k);
    }

    private void insertAll(long drawingId, List<PlacementMapper.NewRow> rows) {
        List<String> names = rows.stream().map(r -> r.name).toList();
        if (new HashSet<>(names).size() != names.size() || placements.countNames(drawingId, names, null) > 0)
            throw new ConflictException("같은 이름의 객체가 이 도면에 있습니다.");
        for (var r : rows) placements.insert(drawingId, r);
    }

    private PlacementMapper.NewRow toRow(NewPlacement n) {
        var r = new PlacementMapper.NewRow();
        r.modelId = n.modelId() == null ? null : requireModel(n.modelId());
        r.name = checkName(n.name());
        r.x = finite(n.x());
        r.y = finite(n.y());
        r.rot = n.rot() == null ? 0 : finite(n.rot());
        r.hintLabel = n.hintLabel() == null || n.hintLabel().isBlank() ? null : n.hintLabel().strip();
        if (r.hintLabel != null && r.hintLabel.length() > 100) r.hintLabel = r.hintLabel.substring(0, 100);
        return r;
    }

    private void requireDrawing(long id) {
        if (drawings.findById(id) == null) throw new NotFoundException("도면을 찾을 수 없습니다.");
    }

    private Long requireModel(long id) {
        if (models.findById(id) == null) throw new BadRequestException("모델을 찾을 수 없습니다.");
        return id;
    }

    private static String checkName(String name) {
        String n = name == null ? "" : name.strip();
        if (n.isEmpty() || n.length() > 100) throw new BadRequestException("객체 이름은 1~100자로 입력하세요.");
        return n;
    }

    private static double finite(Double v) {
        if (v == null || !Double.isFinite(v)) throw new BadRequestException("좌표가 올바르지 않습니다.");
        return v;
    }
}
```

`placement/PlacementController.java`:
```java
package com.kopens.factory3d.placement;

import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** 배치 (GET 조회, 쓰기 운전원 — SecurityConfig 기본 규칙) */
@RestController
public class PlacementController {
    private final PlacementService placements;

    public PlacementController(PlacementService placements) {
        this.placements = placements;
    }

    @GetMapping("/api/drawings/{id}/placements")
    public List<PlacementView> list(@PathVariable long id) {
        return placements.list(id);
    }

    @PostMapping("/api/drawings/{id}/placements")
    public ResponseEntity<List<PlacementView>> create(@PathVariable long id, @RequestBody List<PlacementService.NewPlacement> body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(placements.create(id, body));
    }

    @PatchMapping("/api/placements/{id}")
    public PlacementView update(@PathVariable long id, @RequestBody PlacementService.Patch body) {
        return placements.update(id, body);
    }

    @DeleteMapping("/api/placements/{id}")
    public ResponseEntity<Void> delete(@PathVariable long id) {
        placements.delete(id);
        return ResponseEntity.noContent().build();
    }
}
```
`DrawingMapper.findById(long)` 가 이미 있음(P2). 없다면 `DrawingDetail findById(long id)` 를 쓴다.

도면 연동:
- `DrawingController.PlanSave` 에 `Double scaleFactor` 칸을 끝에 추가하고 `drawings.savePlan(...)` 호출에 넘긴다.
- `DrawingService.savePlan` 에 매개변수 `Double scaleFactor` 를 추가: 버전 갱신 성공 후 `if (scaleFactor != null) { if (!(scaleFactor > 0) || !Double.isFinite(scaleFactor)) throw new BadRequestException("배율은 0보다 커야 합니다."); if (Math.abs(scaleFactor - 1) > 1e-12) placementService.scale(id, scaleFactor); }` — 검사는 버전 갱신 **전에** 하고(잘못된 배율이면 아무것도 안 바꿈), 배율 적용은 같은 트랜잭션. `DrawingService` 생성자에 `PlacementService` 대신 순환 의존을 피하려 `PlacementMapper` 를 주입해 `placements.scale(id, k)` 를 직접 부른다.
- `DrawingSummary` 끝에 `int placements` 추가, `DrawingMapper.xml` `findAll` 에 `(select count(*) from placement p where p.drawing_id = drawing.id) as placements` 와 resultMap `<arg column="placements" javaType="_int"/>` 추가.
- `DrawingApiTest` 기존 테스트가 summary 생성자/필드 순서에 의존하면 맞춘다 (JSON 필드 추가만이라 대부분 그대로 통과).

- [ ] **Step 3: 통과 확인 (전체)**

Run: `./gradlew test`
Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 4: Commit**

```bash
cd /c/kopens/project/Factory3D && git add server
git commit -m "feat(server): 배치 API(여러 개 추가·이동·회전·이름·모델 지정·삭제), 보정 배율 연동, 도면별 배치 수

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 웹 — 객체 타입 · 격자 계산 · 매칭 · 되돌리기 기록 (순수 함수)

**Files:**
- Create: `web/src/objects/types.ts`, `grid.ts`, `match.ts`, `history.ts`
- Test: `web/src/objects/grid.test.ts`, `match.test.ts`, `history.test.ts`

**Interfaces:**
- Produces (`types.ts`, 이름 그대로):
```ts
export type Category = 'equip' | 'mat' | 'mover'
export const CATEGORY_LABEL: Record<Category, string> = { equip: '설비', mat: '자재', mover: '운반' }
export interface ModelInfo { id: number; name: string; category: Category; sourceExt: string; sizeX: number; sizeY: number; sizeZ: number; aliases: string[]; version: number; usedDrawings: number; updatedAt: string }
export interface Placement { id: number; modelId?: number | null; name: string; x: number; y: number; rot: number; hintLabel?: string | null }
export interface NewPlacement { modelId?: number | null; name: string; x: number; y: number; rot?: number; hintLabel?: string | null }
export interface PlacementPatch { name?: string; x?: number; y?: number; rot?: number; modelId?: number; clearModel?: boolean }
export const BOX_SIZE = { sizeX: 2, sizeY: 2, sizeZ: 2 }   // 모델 없는 배치(임시 상자)
```
- Produces (`grid.ts`):
```ts
export interface Rect { x: number; y: number; ux: number; uy: number; hl: number; hw: number }
export interface Cell { x: number; y: number; hit: boolean }   // 칸 왼쪽 아래 모서리 (plan m)
export function cellSize(bounds: { w: number; h: number }): number
export function rectOf(p: { x: number; y: number; rot: number }, size: { sizeX: number; sizeY: number }): Rect
export function rectsHit(a: Rect, b: Rect): boolean
export function cellHits(r: Rect, x0: number, y0: number, c: number): boolean
export function snapToCells(r: Rect, x: number, y: number, c: number): { x: number; y: number }
export function editCells(r: Rect, others: Rect[], c: number): Cell[]
export function editTag(r: Rect, cells: Cell[], c: number): string
```
- Produces (`match.ts`): `norm(s: string): string`, `matchModel(label: string, models: ModelInfo[]): ModelInfo | null`, `nextName(base: string, taken: Iterable<string>): string`, `hintsToPlacements(hints: ObjectHint[], models: ModelInfo[], taken: Iterable<string>): { items: NewPlacement[]; unmatched: number }`.
- Produces (`history.ts`):
```ts
export type Change =
  | { kind: 'add'; placement: Placement }
  | { kind: 'delete'; placement: Placement }
  | { kind: 'update'; id: number; before: PlacementPatch; after: PlacementPatch }
export class History {
  constructor(limit?: number)          // 기본 50
  push(c: Change): void                // 다시 하기 기록은 비움
  undo(): Change | null                // 되돌릴 변경 (호출자가 반대 요청을 보냄)
  redo(): Change | null
  remap(oldId: number, newId: number): void   // 삭제 되돌리기로 id 가 바뀌면 기록 안의 id 를 바꿈
  clear(): void
  get canUndo(): boolean
  get canRedo(): boolean
}
```

- [ ] **Step 1: 실패 테스트 작성**

`web/src/objects/grid.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { cellHits, cellSize, editCells, editTag, rectOf, rectsHit, snapToCells } from './grid'

describe('격자 계산 (demo snapToCells·cellHits·rectsHit 와 같음)', () => {
  it('격자 크기: 큰 변 40m 미만 0.5m, 아니면 1m', () => {
    expect(cellSize({ w: 39, h: 10 })).toBe(0.5)
    expect(cellSize({ w: 160, h: 65 })).toBe(1)
  })

  it('회전 사각형: 0° 는 x 축, 90° 는 y 축으로 길이', () => {
    const r0 = rectOf({ x: 5, y: 5, rot: 0 }, { sizeX: 4, sizeY: 2 })
    expect(r0).toMatchObject({ x: 5, y: 5, hl: 2, hw: 1 })
    expect(r0.ux).toBeCloseTo(1)
    const r90 = rectOf({ x: 5, y: 5, rot: 90 }, { sizeX: 4, sizeY: 2 })
    expect(r90.ux).toBeCloseTo(0)
    expect(r90.uy).toBeCloseTo(1)
  })

  it('모서리 기준 붙기: 4×2 는 바깥 상자 서쪽·남쪽 모서리가 격자선에', () => {
    const r = rectOf({ x: 0, y: 0, rot: 0 }, { sizeX: 4, sizeY: 2 })
    expect(snapToCells(r, 5.3, 5.6, 1)).toEqual({ x: 5, y: 6 })
    expect(snapToCells(r, 5.6, 5.4, 1)).toEqual({ x: 6, y: 5 })
    const odd = rectOf({ x: 0, y: 0, rot: 0 }, { sizeX: 3, sizeY: 1 })
    expect(snapToCells(odd, 5.2, 5.2, 1)).toEqual({ x: 5.5, y: 5.5 })
    const r90 = rectOf({ x: 0, y: 0, rot: 90 }, { sizeX: 3, sizeY: 1 })
    expect(snapToCells(r90, 5.2, 5.2, 1)).toEqual({ x: 5.5, y: 5.5 })
  })

  it('겹침: 축 정렬·회전 사각형 SAT, 모서리만 닿으면 겹침 아님', () => {
    const a = rectOf({ x: 0, y: 0, rot: 0 }, { sizeX: 2, sizeY: 2 })
    expect(rectsHit(a, rectOf({ x: 1.5, y: 0, rot: 0 }, { sizeX: 2, sizeY: 2 }))).toBe(true)
    expect(rectsHit(a, rectOf({ x: 2, y: 0, rot: 0 }, { sizeX: 2, sizeY: 2 }))).toBe(false)
    expect(rectsHit(a, rectOf({ x: 2.3, y: 0, rot: 45 }, { sizeX: 2, sizeY: 2 }))).toBe(true)
    expect(rectsHit(a, rectOf({ x: 2.5, y: 0, rot: 45 }, { sizeX: 2, sizeY: 2 }))).toBe(false)
    expect(cellHits(a, 0, 0, 1)).toBe(true)
    expect(cellHits(a, 1, 0, 1)).toBe(false) // 모서리만 닿음
  })

  it('차지한 칸·겹친 칸·태그', () => {
    const me = rectOf({ x: 2, y: 1, rot: 0 }, { sizeX: 4, sizeY: 2 }) // [0,4]×[0,2]
    const other = rectOf({ x: 4, y: 1, rot: 0 }, { sizeX: 2, sizeY: 2 }) // [3,5]×[0,2]
    const cells = editCells(me, [other], 1)
    expect(cells).toHaveLength(8)
    expect(cells.filter((c) => c.hit)).toHaveLength(2)
    expect(cells.find((c) => c.x === 3 && c.y === 0)!.hit).toBe(true)
    expect(editTag(me, cells, 1)).toBe('가로 4 × 세로 2칸 · 총 8칸 · 8.0㎡ · 겹침 2칸')
    const alone = editCells(me, [], 0.5)
    expect(editTag(me, alone, 0.5)).toBe('가로 8 × 세로 4칸 · 총 32칸 · 8.0㎡')
    const tilted = rectOf({ x: 2, y: 2, rot: 30 }, { sizeX: 2, sizeY: 1 })
    expect(editTag(tilted, editCells(tilted, [], 1), 1)).toMatch(/^총 \d+칸 · \d+\.\d㎡$/)
  })
})
```

`web/src/objects/match.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { hintsToPlacements, matchModel, nextName, norm } from './match'
import type { ModelInfo } from './types'

const m = (id: number, name: string, aliases: string[] = []): ModelInfo => ({
  id, name, category: 'mat', sourceExt: 'glb', sizeX: 1, sizeY: 1, sizeZ: 1, aliases, version: 1, usedDrawings: 0, updatedAt: '',
})
const models = [m(1, '허브', ['HUB']), m(2, '베어링 링', ['RING', 'BEARING']), m(3, '메인 프레임', ['MAIN FRAME'])]

describe('별칭 매칭 · 이름', () => {
  it('대소문자·공백 무시, 모델 이름도 별칭', () => {
    expect(norm(' Main  Frame ')).toBe('MAINFRAME')
    expect(matchModel('hub', models)?.id).toBe(1)
    expect(matchModel('베어링링', models)?.id).toBe(2)
    expect(matchModel('mainframe', models)?.id).toBe(3)
    expect(matchModel('PUMP', models)).toBeNull()
  })
  it('다음 이름: 비어 있는 가장 작은 번호', () => {
    expect(nextName('허브', [])).toBe('허브 1')
    expect(nextName('허브', ['허브 1', '허브 3'])).toBe('허브 2')
  })
  it('도면 표기 → 배치 (회전은 라디안→도, 미매칭은 임시 상자)', () => {
    const r = hintsToPlacements(
      [
        { id: 'h1', label: 'HUB', x: 1, y: 2, rot: Math.PI / 2 },
        { id: 'h2', label: 'hub', x: 3, y: 4, rot: 0 },
        { id: 'h3', label: 'PUMP', x: 5, y: 6, rot: 0 },
      ],
      models,
      ['허브 1'],
    )
    expect(r.unmatched).toBe(1)
    expect(r.items).toEqual([
      { modelId: 1, name: '허브 2', x: 1, y: 2, rot: 90, hintLabel: 'HUB' },
      { modelId: 1, name: '허브 3', x: 3, y: 4, rot: 0, hintLabel: 'hub' },
      { modelId: null, name: '표기 PUMP', x: 5, y: 6, rot: 0, hintLabel: 'PUMP' },
    ])
  })
})
```

`web/src/objects/history.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { History } from './history'

const p = (id: number) => ({ id, name: `a${id}`, x: 0, y: 0, rot: 0 })

describe('되돌리기 기록', () => {
  it('되돌리기·다시 하기, 새 변경은 다시 하기 기록을 비움', () => {
    const h = new History()
    expect(h.canUndo).toBe(false)
    h.push({ kind: 'add', placement: p(1) })
    h.push({ kind: 'update', id: 1, before: { x: 0 }, after: { x: 5 } })
    expect(h.undo()).toMatchObject({ kind: 'update', before: { x: 0 } })
    expect(h.canRedo).toBe(true)
    expect(h.redo()).toMatchObject({ kind: 'update', after: { x: 5 } })
    h.undo()
    h.push({ kind: 'delete', placement: p(1) })
    expect(h.canRedo).toBe(false)
  })
  it('최대 개수를 넘으면 오래된 것부터 버림', () => {
    const h = new History(2)
    h.push({ kind: 'add', placement: p(1) })
    h.push({ kind: 'add', placement: p(2) })
    h.push({ kind: 'add', placement: p(3) })
    expect(h.undo()).toMatchObject({ placement: { id: 3 } })
    expect(h.undo()).toMatchObject({ placement: { id: 2 } })
    expect(h.undo()).toBeNull()
  })
  it('삭제를 되돌려 id 가 바뀌면 기록 안의 id 도 바꿈', () => {
    const h = new History()
    h.push({ kind: 'update', id: 7, before: { x: 0 }, after: { x: 1 } })
    h.push({ kind: 'delete', placement: p(7) })
    h.undo() // 호출자가 다시 만들고 새 id 99
    h.remap(7, 99)
    expect(h.undo()).toMatchObject({ kind: 'update', id: 99 })
    expect(h.redo()).toMatchObject({ kind: 'update', id: 99 })
    expect(h.redo()).toMatchObject({ kind: 'delete', placement: { id: 99 } })
  })
})
```

Run: `cd /c/kopens/project/Factory3D/web && npx vitest run src/objects`
Expected: FAIL (모듈 없음).

- [ ] **Step 2: 구현**

`web/src/objects/types.ts` — Interfaces 블록 그대로.

`web/src/objects/grid.ts`:
```ts
/** 편집 격자 계산 (demo snapToCells·cellHits·rectsHit 이식, plan 좌표 m, 격자 원점 = plan 원점) */
export interface Rect { x: number; y: number; ux: number; uy: number; hl: number; hw: number }
export interface Cell { x: number; y: number; hit: boolean }

const EPS = 1e-3

export function cellSize(bounds: { w: number; h: number }): number {
  return Math.max(bounds.w, bounds.h) < 40 ? 0.5 : 1
}

export function rectOf(p: { x: number; y: number; rot: number }, size: { sizeX: number; sizeY: number }): Rect {
  const a = (p.rot * Math.PI) / 180
  return { x: p.x, y: p.y, ux: Math.cos(a), uy: Math.sin(a), hl: size.sizeX / 2, hw: size.sizeY / 2 }
}

/** 회전 사각형 바깥 상자 반폭 */
function extent(r: Rect): { ex: number; ey: number } {
  return { ex: Math.abs(r.ux) * r.hl + Math.abs(r.uy) * r.hw, ey: Math.abs(r.uy) * r.hl + Math.abs(r.ux) * r.hw }
}

/** 축 n 에 대한 사각형의 투영 반폭 */
function proj(r: Rect, nx: number, ny: number): number {
  return Math.abs(r.ux * nx + r.uy * ny) * r.hl + Math.abs(-r.uy * nx + r.ux * ny) * r.hw
}

export function rectsHit(a: Rect, b: Rect): boolean {
  const dx = b.x - a.x, dy = b.y - a.y
  for (const [nx, ny] of [[a.ux, a.uy], [-a.uy, a.ux], [b.ux, b.uy], [-b.uy, b.ux]]) {
    if (Math.abs(dx * nx + dy * ny) >= proj(a, nx, ny) + proj(b, nx, ny) - EPS) return false
  }
  return true
}

/** 칸 [x0, x0+c] × [y0, y0+c] 과 회전 사각형이 겹치는가 */
export function cellHits(r: Rect, x0: number, y0: number, c: number): boolean {
  const cell: Rect = { x: x0 + c / 2, y: y0 + c / 2, ux: 1, uy: 0, hl: c / 2, hw: c / 2 }
  return rectsHit(r, cell)
}

/** 바깥 상자 서쪽·남쪽 모서리를 격자선에 맞춘 중심 */
export function snapToCells(r: Rect, x: number, y: number, c: number): { x: number; y: number } {
  const { ex, ey } = extent(r)
  const s = (v: number, e: number) => Math.round(((v - e) / c) * 1e9) / 1e9
  return { x: Math.round(s(x, ex)) * c + ex, y: Math.round(s(y, ey)) * c + ey }
}

export function editCells(r: Rect, others: Rect[], c: number): Cell[] {
  const { ex, ey } = extent(r)
  const hitters = others.filter((o) => rectsHit(r, o))
  const out: Cell[] = []
  const i0 = Math.floor((r.x - ex) / c + EPS), i1 = Math.ceil((r.x + ex) / c - EPS)
  const j0 = Math.floor((r.y - ey) / c + EPS), j1 = Math.ceil((r.y + ey) / c - EPS)
  for (let i = i0; i < i1; i++)
    for (let j = j0; j < j1; j++) {
      const x0 = i * c, y0 = j * c
      if (!cellHits(r, x0, y0, c)) continue
      out.push({ x: x0, y: y0, hit: hitters.some((o) => cellHits(o, x0, y0, c)) })
    }
  return out
}

export function editTag(r: Rect, cells: Cell[], c: number): string {
  const parts: string[] = []
  const aligned = Math.abs(r.ux) < 1e-6 || Math.abs(r.uy) < 1e-6
  if (aligned && cells.length) {
    const xs = new Set(cells.map((k) => k.x)), ys = new Set(cells.map((k) => k.y))
    parts.push(`가로 ${xs.size} × 세로 ${ys.size}칸`)
  }
  parts.push(`총 ${cells.length}칸`)
  parts.push(`${(cells.length * c * c).toFixed(1)}㎡`)
  const hits = cells.filter((k) => k.hit).length
  if (hits) parts.push(`겹침 ${hits}칸`)
  return parts.join(' · ')
}
```
(`snapToCells` 의 `s` 는 부동소수 반올림 흔들림 방지. 테스트 기대값이 이 계산과 어긋나면 demo `snapToCells`(index.html 2014행) 와 비교해 원인을 보고서에 적는다.)

`web/src/objects/match.ts`:
```ts
import type { ObjectHint } from '../drawing/plan/types'
import type { ModelInfo, NewPlacement } from './types'

export const norm = (s: string) => s.toUpperCase().replace(/\s+/g, '')

/** 도면 표기 글자 ↔ 모델 이름·별칭 (대소문자·공백 무시) */
export function matchModel(label: string, models: ModelInfo[]): ModelInfo | null {
  const k = norm(label)
  if (!k) return null
  return models.find((m) => norm(m.name) === k || m.aliases.some((a) => norm(a) === k)) ?? null
}

/** `<base> n` 중 비어 있는 가장 작은 n */
export function nextName(base: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  for (let n = 1; ; n++) if (!used.has(`${base} ${n}`)) return `${base} ${n}`
}

export function hintsToPlacements(hints: ObjectHint[], models: ModelInfo[], taken: Iterable<string>): { items: NewPlacement[]; unmatched: number } {
  const names = new Set(taken)
  const items: NewPlacement[] = []
  let unmatched = 0
  for (const h of hints) {
    const m = matchModel(h.label, models)
    let name: string
    if (m) name = nextName(m.name, names)
    else {
      unmatched++
      name = `표기 ${h.label}`
      for (let n = 2; names.has(name); n++) name = `표기 ${h.label} ${n}`
    }
    names.add(name)
    items.push({ modelId: m?.id ?? null, name, x: h.x, y: h.y, rot: Math.round(((h.rot * 180) / Math.PI) * 1e6) / 1e6, hintLabel: h.label })
  }
  return { items, unmatched }
}
```

`web/src/objects/history.ts`:
```ts
import type { Placement, PlacementPatch } from './types'

export type Change =
  | { kind: 'add'; placement: Placement }
  | { kind: 'delete'; placement: Placement }
  | { kind: 'update'; id: number; before: PlacementPatch; after: PlacementPatch }

/** 이 화면 세션의 편집 기록 (되돌리기·다시 하기). 실제 요청은 호출자가 보냄 */
export class History {
  private done: Change[] = []
  private undone: Change[] = []
  private limit: number

  constructor(limit = 50) {
    this.limit = limit
  }

  push(c: Change): void {
    this.done.push(c)
    if (this.done.length > this.limit) this.done.shift()
    this.undone = []
  }

  undo(): Change | null {
    const c = this.done.pop() ?? null
    if (c) this.undone.push(c)
    return c
  }

  redo(): Change | null {
    const c = this.undone.pop() ?? null
    if (c) this.done.push(c)
    return c
  }

  remap(oldId: number, newId: number): void {
    const fix = (c: Change): Change =>
      c.kind === 'update' ? (c.id === oldId ? { ...c, id: newId } : c) : c.placement.id === oldId ? { ...c, placement: { ...c.placement, id: newId } } : c
    this.done = this.done.map(fix)
    this.undone = this.undone.map(fix)
  }

  clear(): void {
    this.done = []
    this.undone = []
  }

  get canUndo(): boolean {
    return this.done.length > 0
  }

  get canRedo(): boolean {
    return this.undone.length > 0
  }
}
```

- [ ] **Step 3: 통과 확인**

Run: `npx vitest run src/objects && npx vitest run && npm run build && ./node_modules/.bin/oxlint`
Expected: 모두 PASS.

- [ ] **Step 4: Commit**

```bash
cd /c/kopens/project/Factory3D && git add web/src/objects
git commit -m "feat(web): 객체 타입 · 격자 계산(모서리 붙기·겹침·태그) · 별칭 매칭 · 되돌리기 기록

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 기본 모델 굽기 (demo 모델 → glb·썸네일) + 나셀 공장 배치 json

**Files:**
- Create: `web/src/objects/builtin/materials.ts`, `web/src/objects/builtin/equipMesh.ts`, `web/src/objects/builtin/catalog.ts`, `web/src/objects/builtin/bakePage.ts`, `web/bake.html`, `web/scripts/bake-models.mjs`
- Create: `web/src/objects/seed/mainScenario.ts`, `web/src/objects/seed/seedPlacements.test.ts`
- Create (생성물): `server/src/main/resources/seed/models.json`, `server/src/main/resources/seed/models/<key>/model.glb`, `thumb.png` (11종), `server/src/main/resources/seed/main_factory.placements.json`
- Modify: `web/package.json` (스크립트 `bake:models`, `seed:placements`), `web/src/drawing/plan/buildPlan.ts` (원점 계산을 `bboxMin` 으로 분리해 export)

**Interfaces:**
- Consumes: `interpretDxf`, `flatten`, `parseDxf`, `readDxfFile` (P2), `Category` (Task 3).
- Produces (`catalog.ts`): `export const BUILTIN: { key: string; name: string; category: Category; aliases: string[] }[]` — spec §4.2 표의 11종 순서·값 그대로.
- Produces (`equipMesh.ts`): `makeEquipMesh(key: string): THREE.Group` (선택 테두리 없음, 바닥 y=0, 앞 +X, m).
- Produces (`buildPlan.ts`): `export function bboxMin(flat: Flattened): [number, number]` (buildPlan 이 이것을 씀 — 동작 변화 없음).
- Produces (`models.json`): `[{key,name,category,aliases,sizeX,sizeY,sizeZ}]` (size 는 구운 메쉬의 Box3: sizeX = x 길이, sizeY = z 길이, sizeZ = y 높이, 소수 3자리).
- Produces (`main_factory.placements.json`): `[{model: <key>, name, x, y, rot}]` 79개 (plan 좌표 m, 소수 4자리).

- [ ] **Step 1: demo 모델 코드 이식**

`web/src/objects/builtin/catalog.ts` — spec §4.2 표 그대로:
```ts
import type { Category } from '../types'

/** 기본 모델 11종 (demo EQUIP_TYPES 의 설비·자재) */
export const BUILTIN: { key: string; name: string; category: Category; aliases: string[] }[] = [
  { key: 'jigMain', name: '메인 조립 지그', category: 'equip', aliases: ['JIG_MAIN', 'MAIN JIG'] },
  { key: 'jigSub', name: '서브 조립 지그', category: 'equip', aliases: ['JIG_SUB', 'SUB JIG'] },
  { key: 'jigHub', name: '허브 조립 지그', category: 'equip', aliases: ['JIG_HUB', 'HUB JIG'] },
  { key: 'tensioner', name: '요 베어링 텐셔너', category: 'equip', aliases: ['TENSIONER'] },
  { key: 'frameTable', name: '메인 프레임 조립대', category: 'equip', aliases: ['FRAME_TABLE'] },
  { key: 'hub', name: '허브', category: 'mat', aliases: ['HUB'] },
  { key: 'ring', name: '베어링 링', category: 'mat', aliases: ['RING', 'BEARING'] },
  { key: 'mainframe', name: '메인 프레임', category: 'mat', aliases: ['MAINFRAME', 'MAIN FRAME'] },
  { key: 'longmat', name: '긴 자재 랙', category: 'mat', aliases: ['LONG_RACK'] },
  { key: 'fixture', name: '치구 프레임', category: 'mat', aliases: ['FIXTURE'] },
  { key: 'pallet', name: '부품 팔레트', category: 'mat', aliases: ['PALLET'] },
]
```

`web/src/objects/builtin/materials.ts` — `C:\kopens\project\demo\index.html` 의 다음을 옮긴다:
- 1597~1601행 `mat`, `box`, `rbox`, `cyl` (export).
- 727~732행 `TEX.box` 캔버스 텍스처 (함수 `boxTexture()` 로, 처음 쓸 때 만들고 재사용) 와 738~753 중 `MAT.pallet`, `MAT.load` 두 재질 (export `palletMat()`, `loadMat()`).
- `ENV_I` 는 `0.25` (P2 최종값과 같게).
- `RoundedBoxGeometry` 는 `three/addons/geometries/RoundedBoxGeometry.js`.

`web/src/objects/builtin/equipMesh.ts` — demo 1708~1722행 `mergeByMaterial` 과 1723~1967행 `makeEquipMesh` 를 옮긴다. 바꿀 점:
- `export function makeEquipMesh(key: string): THREE.Group` — `ghost` 매개변수와 가구(`furn`) 분기(약 1850~1960행) 는 **옮기지 않는다**. 설비·자재 11종과 마지막 else(부품 팔레트) 만.
- 끝의 선택 표시 `LineLoop`·`userData.sel` 은 만들지 않는다. `shadowed()` 대신 메쉬마다 `castShadow = receiveShadow = true`.
- `mergeGeometries` 는 `three/addons/utils/BufferGeometryUtils.js`.
- `len/wid` 가 필요한 곳은 demo `EQUIP_TYPES`(1558~1577행) 의 값을 내부 상수로 둔다.

- [ ] **Step 2: 굽기 페이지와 스크립트**

`web/bake.html` (개발 서버 전용 — `vite build` 는 기본 입력이 `index.html` 뿐이라 포함되지 않음):
```html
<!doctype html>
<html lang="ko">
  <head><meta charset="UTF-8" /><title>bake</title></head>
  <body>
    <script type="module" src="/src/objects/builtin/bakePage.ts"></script>
  </body>
</html>
```

`web/src/objects/builtin/bakePage.ts`:
```ts
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { BUILTIN } from './catalog'
import { makeEquipMesh } from './equipMesh'

/** 굽기 전용 페이지: window.bake(key) → glb·png(base64)·크기. scripts/bake-models.mjs 가 Playwright 로 부름 */
const toB64 = (buf: ArrayBuffer) => {
  let s = ''
  const b = new Uint8Array(buf)
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return btoa(s)
}

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
renderer.setSize(240, 180)
renderer.toneMapping = THREE.ACESFilmicToneMapping
document.body.appendChild(renderer.domElement)
const env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture

async function bake(key: string) {
  const g = makeEquipMesh(key)
  const box = new THREE.Box3().setFromObject(g)
  const size = box.getSize(new THREE.Vector3())
  const glb = (await new GLTFExporter().parseAsync(g, { binary: true })) as ArrayBuffer
  // 썸네일 (demo renderThumbs 와 같은 구도)
  const scene = new THREE.Scene()
  scene.environment = env
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f96, 0.6))
  const sun = new THREE.DirectionalLight(0xffffff, 2.6)
  sun.position.set(5, 10, 7)
  scene.add(sun)
  g.rotation.y = -0.6
  scene.add(g)
  const c = new THREE.Box3().setFromObject(g).getCenter(new THREE.Vector3())
  const dist = Math.max(size.x, size.y * 1.25, size.z) * 1.55 + 0.25
  const cam = new THREE.PerspectiveCamera(35, 240 / 180, 0.01, 1000)
  cam.position.copy(c).add(new THREE.Vector3(0.75, 0.5, 0.9).multiplyScalar(dist))
  cam.lookAt(c)
  renderer.render(scene, cam)
  const png = renderer.domElement.toDataURL('image/png').split(',')[1]
  return { glb: toB64(glb), png, size: [size.x, size.z, size.y].map((v) => Math.round(v * 1000) / 1000) }
}

Object.assign(window, { bake, BUILTIN })
```
(`size` 는 `[sizeX(x), sizeY(z), sizeZ(y 높이)]`.)

`web/scripts/bake-models.mjs`:
```js
// 기본 모델 11종을 glb·썸네일로 구워 server/src/main/resources/seed/models/ 에 저장 (Edge 필요)
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(web, '../server/src/main/resources/seed/models')
const server = await createServer({ root: web, server: { port: 5299, strictPort: true }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch({ channel: 'msedge' })
try {
  const page = await browser.newPage()
  page.on('pageerror', (e) => console.error(e))
  await page.goto('http://localhost:5299/bake.html')
  await page.waitForFunction(() => 'bake' in window)
  const list = await page.evaluate(() => window.BUILTIN)
  const meta = []
  for (const m of list) {
    const r = await page.evaluate((k) => window.bake(k), m.key)
    mkdirSync(resolve(out, m.key), { recursive: true })
    writeFileSync(resolve(out, m.key, 'model.glb'), Buffer.from(r.glb, 'base64'))
    writeFileSync(resolve(out, m.key, 'thumb.png'), Buffer.from(r.png, 'base64'))
    meta.push({ ...m, sizeX: r.size[0], sizeY: r.size[1], sizeZ: r.size[2] })
    console.log(m.key, r.size.join(' × '), 'm')
  }
  writeFileSync(resolve(out, '../models.json'), JSON.stringify(meta, null, 2) + '\n')
} finally {
  await browser.close()
  await server.close()
}
```
`web/package.json` scripts 에 `"bake:models": "node scripts/bake-models.mjs"`.

Run: `cd /c/kopens/project/Factory3D/web && npm run bake:models`
Expected: 11줄 크기 출력(지그류는 대략 7~11m, 팔레트 약 1.2×1.0m), `server/src/main/resources/seed/models/*/model.glb`·`thumb.png`, `seed/models.json` 생성. glb 마다 첫 4바이트가 `glTF` 인지 `head -c 4` 로 확인. 썸네일 3개 이상을 Read 로 열어 모델이 보이는지 확인.

- [ ] **Step 3: 나셀 공장 배치 json — 실패 테스트**

`web/src/drawing/plan/buildPlan.ts` 에서 bbox 최소점 계산을 함수로 분리:
```ts
/** prims 의 bbox 최소점 (도면 원좌표) — plan 원점 */
export function bboxMin(flat: Flattened): [number, number] { /* buildPlan 의 x0,y0 계산 그대로, 비면 [0,0] */ }
```
buildPlan 은 이것으로 x0·y0 를 얻는다 (기존 테스트 그대로 통과해야 함).

`web/src/objects/seed/mainScenario.ts`:
```ts
/** demo mainScenario (index.html 3431~3469) 의 설비·자재 배치 — put(type, px, py, ang, name) 를 그대로 옮긴 표.
 *  운반(addMover)·경로망 부분은 옮기지 않는다. */
export type Put = [key: string, px: number, py: number, ang?: number, name?: string]
export const PUTS: Put[] = [
  // demo 의 put(...) 호출을 등장 순서대로 79개 전부 옮긴다 (루프로 만든 것은 펼쳐서)
]

const K = 107.8 // mm / px
/** demo 픽셀 → 도면 mm */
export const pxToMm = (px: number, py: number): [number, number] => [(px - 57) * K, (912 - py) * K]
```
`PUTS` 는 demo `mainScenario` 를 읽고 **전부** 채운다 (루프·배열로 만든 호출은 같은 순서로 펼친다). 79개, 타입별 수: pallet 28, hub 13, fixture 10, longmat 7, frameTable 5, jigMain 4, jigSub 4, ring 4, tensioner 2, jigHub 1, mainframe 1.

`web/src/objects/seed/seedPlacements.test.ts`:
```ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { flatten } from '../../drawing/dxf/flatten'
import { parseDxf } from '../../drawing/dxf/parse'
import { bboxMin } from '../../drawing/plan/buildPlan'
import { readDxfFile } from '../../drawing/readDxfFile'
import { BUILTIN } from '../builtin/catalog'
import { nextName } from '../match'
import { PUTS, pxToMm } from './mainScenario'

const SEED = resolve(process.cwd(), '../server/src/main/resources/seed')
const OUT = resolve(SEED, 'main_factory.placements.json')
const r4 = (v: number) => Math.round(v * 1e4) / 1e4

function build() {
  const buf = readFileSync(resolve(SEED, 'main_factory.dxf'))
  const [x0, y0] = bboxMin(flatten(parseDxf(readDxfFile(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)))))
  const names = new Set<string>()
  return PUTS.map(([key, px, py, ang = 0, name]) => {
    const model = BUILTIN.find((b) => b.key === key)
    if (!model) throw new Error(`모르는 모델 ${key}`)
    const n = name ?? nextName(model.name, names)
    names.add(n)
    const [X, Y] = pxToMm(px, py)
    return { model: key, name: n, x: r4((X - x0) * 0.001), y: r4((Y - y0) * 0.001), rot: ang }
  })
}

/** 나셀 공장 기본 배치 79개. demo 표를 바꾸면 `npm run seed:placements` 로 다시 만든다 */
describe('나셀 공장 기본 배치', () => {
  const list = build()
  it('79개, 타입별 수, 이름 붙은 설비, 이름 중복 없음', () => {
    expect(list).toHaveLength(79)
    const count = (k: string) => list.filter((p) => p.model === k).length
    expect([count('pallet'), count('hub'), count('fixture'), count('longmat'), count('frameTable')]).toEqual([28, 13, 10, 7, 5])
    expect([count('jigMain'), count('jigSub'), count('ring'), count('tensioner'), count('jigHub'), count('mainframe')]).toEqual([4, 4, 4, 2, 1, 1])
    for (const n of ['Hub 조립장', 'Main Station 1', 'Main Station 2', 'Main Station 3', 'Sub_Main Frame 조립장', 'Sub_Yaw Bearing'])
      expect(list.map((p) => p.name)).toContain(n)
    expect(new Set(list.map((p) => p.name)).size).toBe(79)
  })
  it('모두 도면 안 (plan 0~167 × 0~88.5 m)', () => {
    for (const p of list) {
      expect(p.x).toBeGreaterThan(0)
      expect(p.x).toBeLessThan(167)
      expect(p.y).toBeGreaterThan(0)
      expect(p.y).toBeLessThan(88.5)
    }
  })
  it('저장소의 main_factory.placements.json 과 같음', () => {
    if (process.env.UPDATE_SEED === '1' || !existsSync(OUT)) writeFileSync(OUT, JSON.stringify(list, null, 1) + '\n')
    expect(JSON.parse(readFileSync(OUT, 'utf8'))).toEqual(list)
  })
})
```
`web/package.json` scripts 에 `"seed:placements"`: `scripts/seed-plan.mjs` 와 같은 방식으로 `UPDATE_SEED=1` 을 넣고 `npx vitest run src/objects/seed/seedPlacements.test.ts` 를 실행하는 `scripts/seed-placements.mjs` 를 만들어 연결.

Run: `npx vitest run src/objects/seed`
Expected: 처음엔 PUTS 가 비어 FAIL → PUTS 를 다 채운 뒤 `npm run seed:placements` → PASS, json 생성.

- [ ] **Step 4: 전체 확인 후 Commit**

Run: `npx vitest run && npm run build && ./node_modules/.bin/oxlint`
Expected: 모두 PASS (bake.html·bakePage 는 빌드 결과에 없어도 tsc 검사는 통과해야 함).

```bash
cd /c/kopens/project/Factory3D && git add web server/src/main/resources/seed
git commit -m "feat: 기본 모델 11종 굽기(demo 모델 → glb·썸네일) · 나셀 공장 기본 배치 79개 json

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 서버 — 기본 모델·배치 넣기 (새 설치·기존 설치)

**Files:**
- Create: `server/src/main/java/com/kopens/factory3d/model/ModelSeeder.java`, `server/src/main/java/com/kopens/factory3d/placement/PlacementSeeder.java`
- Modify: `server/src/main/java/com/kopens/factory3d/drawing/DrawingSeeder.java` (순서: 모델 → 도면 → 배치)
- Test: `server/src/test/java/com/kopens/factory3d/placement/SeedTest.java`

**Interfaces:**
- Consumes: `ModelService.createSeed(...)`, `ModelMapper.count()/findIdByName()` (Task 1), `PlacementService.createSeed(drawingId, rows)`, `PlacementMapper.countByDrawing()`, `PlacementMapper.NewRow` (Task 2), 시드 파일 (Task 4).
- Produces: `ModelSeeder.seedIfEmpty(): int` (넣은 개수), `PlacementSeeder.seedFactory(): int` (넣은 개수, 이미 있으면 0).

- [ ] **Step 1: 실패 테스트**

`server/src/test/java/com/kopens/factory3d/placement/SeedTest.java`:
```java
package com.kopens.factory3d.placement;

import static org.assertj.core.api.Assertions.assertThat;

import com.kopens.factory3d.drawing.DrawingSeeder;
import com.kopens.factory3d.model.ModelSeeder;
import com.kopens.factory3d.support.IntegrationTest;
import java.nio.file.Files;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class SeedTest extends IntegrationTest {
    @Autowired ModelSeeder modelSeeder;
    @Autowired PlacementSeeder placementSeeder;
    @Autowired DrawingSeeder drawingSeeder;

    @Test
    void 새_설치_모델11·나셀공장·배치79() throws Exception {
        drawingSeeder.seedAll();
        assertThat(jdbc.queryForObject("select count(*) from model", Integer.class)).isEqualTo(11);
        assertThat(jdbc.queryForObject("select count(*) from placement", Integer.class)).isEqualTo(79);
        assertThat(jdbc.queryForObject("select count(*) from placement where model_id is null", Integer.class)).isZero();
        assertThat(jdbc.queryForList("select name from placement", String.class)).contains("Main Station 1", "Hub 조립장");
        String glb = jdbc.queryForObject("select file from model where name = '허브'", String.class);
        assertThat(Files.size(dataDir.resolve(glb))).isGreaterThan(1000);
        drawingSeeder.seedAll(); // 다시 해도 그대로
        assertThat(jdbc.queryForObject("select count(*) from model", Integer.class)).isEqualTo(11);
        assertThat(jdbc.queryForObject("select count(*) from placement", Integer.class)).isEqualTo(79);
    }

    @Test
    void 기존_설치_나셀공장만_있으면_배치만_한번() throws Exception {
        drawingSeeder.seedIfEmpty(); // P2 상태: 도면만
        assertThat(jdbc.queryForObject("select count(*) from placement", Integer.class)).isZero();
        assertThat(modelSeeder.seedIfEmpty()).isEqualTo(11);
        assertThat(placementSeeder.seedFactory()).isEqualTo(79);
        assertThat(placementSeeder.seedFactory()).isZero();
    }

    @Test
    void 사용자가_만든_같은_이름_도면에는_넣지_않음() throws Exception {
        modelSeeder.seedIfEmpty();
        jdbc.update("insert into drawing (name, source_type, source_file, created_by) values ('나셀 공장', 'dxf', 'x', 'kim')");
        assertThat(placementSeeder.seedFactory()).isZero();
    }
}
```

Run: `./gradlew test --tests "*SeedTest"`
Expected: FAIL.

- [ ] **Step 2: 구현**

`model/ModelSeeder.java`:
```java
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
```
(Jackson 3 의 `asText()` 가 deprecated/없으면 `asString()` 을 쓴다 — 컴파일 오류로 확인.)

`placement/PlacementSeeder.java`:
```java
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
```

`drawing/DrawingSeeder.java` — 생성자에 `ModelSeeder modelSeeder, PlacementSeeder placementSeeder` 추가하고:
```java
    @Override
    public void run(ApplicationArguments args) {
        seedAll();
    }

    /** 시작 순서: 기본 모델 → 기본 도면 → 기본 배치. 단계별로 실패해도 다음 단계 시도 */
    public void seedAll() {
        try {
            modelSeeder.seedIfEmpty();
        } catch (Exception e) {
            log.warn("기본 모델을 넣지 못했습니다: {}", e.getMessage());
        }
        try {
            seedIfEmpty();
        } catch (Exception e) {
            log.warn("기본 도면을 넣지 못했습니다: {}", e.getMessage());
        }
        try {
            placementSeeder.seedFactory();
        } catch (Exception e) {
            log.warn("기본 배치를 넣지 못했습니다: {}", e.getMessage());
        }
    }
```
순환 의존이 생기면(PlacementSeeder → ModelSeeder → … ) 생성자 주입 대상만 확인해 끊는다 (`DrawingSeeder` 가 두 시더를 받는 방향만 있으면 순환 없음).

- [ ] **Step 3: 통과 확인 (전체)**

Run: `./gradlew test`
Expected: `BUILD SUCCESSFUL`. (모든 테스트 컨텍스트 시작 때 시드가 들어가지만 `IntegrationTest` 가 매 테스트 전에 비운다.)

- [ ] **Step 4: Commit**

```bash
cd /c/kopens/project/Factory3D && git add server
git commit -m "feat(server): 기본 모델 11종·나셀 공장 배치 79개 넣기 (새 설치·기존 설치, 재실행 안전)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 웹 — 객체 API · 모델 목록 · 배치 훅(저장·되돌리기)

**Files:**
- Create: `web/src/objects/api.ts`, `web/src/objects/useModels.ts`, `web/src/objects/usePlacements.ts`
- Test: `web/src/objects/usePlacements.test.tsx`, `web/src/objects/useModels.test.tsx`

**Interfaces:**
- Consumes: `apiJson`, `apiSend`, `apiSendForm`, `ApiError` (api/client), Task 3 의 types·`History`·`Change`.
- Produces (`api.ts`):
```ts
export const modelFileUrl = (m: Pick<ModelInfo, 'id' | 'version'>) => `/api/models/${m.id}/file?v=${m.version}`
export const modelThumbUrl = (m: Pick<ModelInfo, 'id' | 'version'>) => `/api/models/${m.id}/thumbnail?v=${m.version}`
export function listModels(): Promise<ModelInfo[]>
export interface ModelUpload { glb: Blob; thumbnail: Blob; sourceExt: string; sizeX: number; sizeY: number; sizeZ: number }
export function createModel(u: ModelUpload & { name: string; category: Category; aliases: string[] }): Promise<ModelInfo>
export function updateModel(id: number, patch: { name?: string; category?: Category; aliases?: string[] }): Promise<ModelInfo>
export function replaceModelFile(id: number, u: ModelUpload): Promise<ModelInfo>
export function deleteModel(id: number): Promise<void>
export function listPlacements(drawingId: number): Promise<Placement[]>
export function createPlacements(drawingId: number, items: NewPlacement[]): Promise<Placement[]>
export function updatePlacement(id: number, patch: PlacementPatch): Promise<Placement>
export function deletePlacement(id: number): Promise<void>
```
- Produces (`useModels.ts`): `useModels(): { state: { kind: 'loading' } | { kind: 'ok'; list: ModelInfo[] } | { kind: 'error'; error: ApiError }; reload(): void }`
- Produces (`usePlacements.ts`):
```ts
export function usePlacements(drawingId: number | null): {
  list: Placement[]; loading: boolean; error: string | null
  add(items: NewPlacement[]): Promise<Placement[]>          // 기록: 1개일 때만 'add' (여러 개 자동 배치는 기록 안 함)
  update(id: number, patch: PlacementPatch): Promise<void>   // 기록: before = 바뀌는 칸의 이전 값
  remove(id: number): Promise<void>                          // 기록: 'delete'
  undo(): Promise<void>; redo(): Promise<void>; canUndo: boolean; canRedo: boolean
  reload(): void                                            // 서버 목록 다시 (기록 유지 안 함 → clear)
}
```
  - 실패한 요청은 `error` 에 메시지, 목록은 서버 기준으로 다시 불러온다.
  - 도면이 바뀌면 기록을 비우고 새로 불러온다. 늦게 온 이전 도면 응답은 버린다(id ref).

- [ ] **Step 1: 실패 테스트 작성**

`web/src/objects/usePlacements.test.tsx`:
```tsx
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePlacements } from './usePlacements'

const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body })

function fakeServer() {
  let seq = 10
  const rows = new Map<number, { id: number; name: string; x: number; y: number; rot: number; modelId?: number }>([[1, { id: 1, name: '허브 1', x: 0, y: 0, rot: 0, modelId: 5 }]])
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const m = init?.method ?? 'GET'
    if (url === '/api/drawings/3/placements' && m === 'GET') return json(200, [...rows.values()])
    if (url === '/api/drawings/3/placements' && m === 'POST') {
      const made = JSON.parse(String(init!.body)).map((n: object) => ({ rot: 0, ...n, id: ++seq }))
      for (const p of made) rows.set(p.id, p)
      return json(201, made)
    }
    const id = Number(url.split('/').pop())
    if (m === 'PATCH') {
      const p = { ...rows.get(id)!, ...JSON.parse(String(init!.body)) }
      rows.set(id, p)
      return json(200, p)
    }
    if (m === 'DELETE') {
      rows.delete(id)
      return { ok: true, status: 204, json: async () => undefined }
    }
    return json(404, { detail: 'x' })
  })
  return { fetch, rows }
}

describe('usePlacements', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('불러오기 · 이동 · 되돌리기 · 다시 하기', async () => {
    const s = fakeServer()
    vi.stubGlobal('fetch', s.fetch)
    const { result } = renderHook(() => usePlacements(3))
    await waitFor(() => expect(result.current.list).toHaveLength(1))
    await act(() => result.current.update(1, { x: 5, y: 6 }))
    expect(result.current.list[0]).toMatchObject({ x: 5, y: 6 })
    expect(result.current.canUndo).toBe(true)
    await act(() => result.current.undo())
    expect(s.rows.get(1)).toMatchObject({ x: 0, y: 0 })
    expect(result.current.list[0]).toMatchObject({ x: 0, y: 0 })
    await act(() => result.current.redo())
    expect(s.rows.get(1)).toMatchObject({ x: 5, y: 6 })
  })

  it('추가를 되돌리면 삭제, 삭제를 되돌리면 다시 만들고 이후 기록 id 도 바뀜', async () => {
    const s = fakeServer()
    vi.stubGlobal('fetch', s.fetch)
    const { result } = renderHook(() => usePlacements(3))
    await waitFor(() => expect(result.current.list).toHaveLength(1))
    await act(async () => { await result.current.add([{ name: '허브 2', x: 1, y: 1, modelId: 5 }]) })
    expect(result.current.list).toHaveLength(2)
    await act(() => result.current.undo())
    expect(result.current.list).toHaveLength(1)
    await act(() => result.current.update(1, { rot: 90 }))
    await act(() => result.current.remove(1))
    expect(result.current.list).toHaveLength(0)
    await act(() => result.current.undo()) // 다시 만들어짐 (새 id)
    expect(result.current.list).toHaveLength(1)
    const newId = result.current.list[0].id
    expect(newId).not.toBe(1)
    await act(() => result.current.undo()) // 회전 되돌리기는 새 id 로
    expect(s.rows.get(newId)).toMatchObject({ rot: 0 })
  })

  it('여러 개 자동 배치는 기록하지 않음, 실패하면 오류 문구', async () => {
    const s = fakeServer()
    vi.stubGlobal('fetch', s.fetch)
    const { result } = renderHook(() => usePlacements(3))
    await waitFor(() => expect(result.current.list).toHaveLength(1))
    await act(async () => { await result.current.add([{ name: 'a', x: 0, y: 0 }, { name: 'b', x: 1, y: 1 }]) })
    expect(result.current.canUndo).toBe(false)
    s.fetch.mockImplementationOnce(async () => json(409, { detail: '같은 이름의 객체가 이 도면에 있습니다.' }))
    await act(() => result.current.update(1, { name: 'a' }))
    expect(result.current.error).toBe('같은 이름의 객체가 이 도면에 있습니다.')
  })

  it('도면이 없으면 빈 목록', () => {
    const { result } = renderHook(() => usePlacements(null))
    expect(result.current.list).toEqual([])
  })
})
```

`web/src/objects/useModels.test.tsx`:
```tsx
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { modelFileUrl, modelThumbUrl } from './api'
import { useModels } from './useModels'

describe('useModels', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('목록과 버전 붙은 주소', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [{ id: 2, name: '허브', version: 3 }] })))
    const { result } = renderHook(() => useModels())
    await waitFor(() => expect(result.current.state.kind).toBe('ok'))
    expect(modelFileUrl({ id: 2, version: 3 })).toBe('/api/models/2/file?v=3')
    expect(modelThumbUrl({ id: 2, version: 3 })).toBe('/api/models/2/thumbnail?v=3')
  })
})
```

Run: `npx vitest run src/objects`
Expected: FAIL.

- [ ] **Step 2: 구현**

`web/src/objects/api.ts`:
```ts
import { apiJson, apiSend, apiSendForm } from '../api/client'
import type { Category, ModelInfo, NewPlacement, Placement, PlacementPatch } from './types'

export const modelFileUrl = (m: Pick<ModelInfo, 'id' | 'version'>) => `/api/models/${m.id}/file?v=${m.version}`
export const modelThumbUrl = (m: Pick<ModelInfo, 'id' | 'version'>) => `/api/models/${m.id}/thumbnail?v=${m.version}`

export interface ModelUpload { glb: Blob; thumbnail: Blob; sourceExt: string; sizeX: number; sizeY: number; sizeZ: number }

function form(u: ModelUpload): FormData {
  const f = new FormData()
  f.append('file', u.glb, 'model.glb')
  f.append('thumbnail', u.thumbnail, 'thumb.png')
  f.append('sourceExt', u.sourceExt)
  f.append('sizeX', String(u.sizeX))
  f.append('sizeY', String(u.sizeY))
  f.append('sizeZ', String(u.sizeZ))
  return f
}

export const listModels = () => apiJson<ModelInfo[]>('/api/models')

export function createModel(u: ModelUpload & { name: string; category: Category; aliases: string[] }): Promise<ModelInfo> {
  const f = form(u)
  f.append('name', u.name)
  f.append('category', u.category)
  f.append('aliases', u.aliases.join(','))
  return apiSendForm<ModelInfo>('POST', '/api/models', f)
}

export const updateModel = (id: number, patch: { name?: string; category?: Category; aliases?: string[] }) =>
  apiSend<ModelInfo>('PATCH', `/api/models/${id}`, patch)
export const replaceModelFile = (id: number, u: ModelUpload) => apiSendForm<ModelInfo>('PUT', `/api/models/${id}/file`, form(u))
export const deleteModel = (id: number) => apiSend<void>('DELETE', `/api/models/${id}`)

export const listPlacements = (drawingId: number) => apiJson<Placement[]>(`/api/drawings/${drawingId}/placements`)
export const createPlacements = (drawingId: number, items: NewPlacement[]) =>
  apiSend<Placement[]>('POST', `/api/drawings/${drawingId}/placements`, items)
export const updatePlacement = (id: number, patch: PlacementPatch) => apiSend<Placement>('PATCH', `/api/placements/${id}`, patch)
export const deletePlacement = (id: number) => apiSend<void>('DELETE', `/api/placements/${id}`)
```

`web/src/objects/useModels.ts`:
```ts
import { useCallback, useEffect, useState } from 'react'
import type { ApiError } from '../api/client'
import { listModels } from './api'
import type { ModelInfo } from './types'

export type ModelsState = { kind: 'loading' } | { kind: 'ok'; list: ModelInfo[] } | { kind: 'error'; error: ApiError }

/** 모델 라이브러리 목록 */
export function useModels() {
  const [state, setState] = useState<ModelsState>({ kind: 'loading' })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let cancel = false
    listModels()
      .then((list) => !cancel && setState({ kind: 'ok', list }))
      .catch((error: ApiError) => !cancel && setState({ kind: 'error', error }))
    return () => {
      cancel = true
    }
  }, [tick])
  const reload = useCallback(() => setTick((n) => n + 1), [])
  return { state, reload }
}
```

`web/src/objects/usePlacements.ts` — Interfaces 의 동작대로 구현한다. 규칙:
- 상태: `list`, `loading`, `error`; `History` 는 `useRef(new History())`; `canUndo/canRedo` 는 기록을 바꿀 때마다 `setVersion(n+1)` 으로 다시 그리게 해서 `history.canUndo` 를 읽는다.
- `idRef` 에 현재 drawingId — 응답이 왔을 때 `idRef.current !== drawingId` 면 버림 (P2 useDrawing 과 같은 방식).
- `update(id, patch)`: `before` = patch 의 각 칸에 대한 현재 목록 값(`name`,`x`,`y`,`rot`, `modelId`/`clearModel` 은 이전 modelId 가 있으면 `{modelId}` 없으면 `{clearModel:true}`). 서버 응답으로 목록의 그 항목 교체. 성공 시 기록 push.
- `remove(id)`: 지우기 전 항목을 기록 `{kind:'delete', placement}`.
- `add(items)`: 응답을 목록 끝에 추가. `items.length === 1` 이면 기록 `{kind:'add', placement: 응답[0]}`.
- `undo()`: `c = history.undo()`; add → deletePlacement(c.placement.id) 후 목록에서 제거; delete → createPlacements(drawingId, [{modelId, name, x, y, rot, hintLabel}]) 후 `history.remap(old, new)`, 목록 추가; update → updatePlacement(c.id, c.before). `redo()` 는 반대(add → 다시 만들고 remap, delete → 지움, update → after).
- 모든 요청 실패: `error = e.message`, `reload` (목록만 다시, 기록은 clear).
- 성공한 요청은 `error = null`.

- [ ] **Step 3: 통과 확인**

Run: `npx vitest run && npm run build && ./node_modules/.bin/oxlint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /c/kopens/project/Factory3D && git add web/src/objects
git commit -m "feat(web): 객체 API · 모델 목록 · 배치 훅(즉시 저장·되돌리기·다시 하기)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 3D — 객체 표시·선택·배치 미리보기·편집 끌기 (objectLayer)

**Files:**
- Create: `web/src/scene/objectLayer.ts`, `web/src/scene/modelCache.ts`
- Modify: `web/src/scene/FactoryScene.ts` (객체 API 위임), `web/src/scene/FactoryView.tsx` (onScene 타입)
- Test: `web/src/scene/objectLayer.test.ts` (WebGL 없이 되는 부분)

**Interfaces:**
- Consumes: `planToLocal`, `localToPlan` (scene/coords), `Rect`, `rectOf`, `snapToCells`, `editCells`, `cellSize` (objects/grid), `Placement`, `BOX_SIZE` (objects/types).
- Produces (`objectLayer.ts`):
```ts
export interface SceneObject { id: number; name: string; url: string | null; sizeX: number; sizeY: number; sizeZ: number; x: number; y: number; rot: number; label?: string | null }
export interface ObjectEvents {
  onSelect(id: number | null): void                 // 클릭으로 고름 (빈 곳 클릭 = null)
  onDrag?(id: number, x: number, y: number): void    // 편집 끌기 중 (plan 좌표, 격자 붙음)
  onDrop?(id: number, x: number, y: number): void    // 끌기 끝
  onPlace?(x: number, y: number, rot: number): void  // 배치 모드 클릭
}
export class ObjectLayer {
  constructor(parent: THREE.Group, load: (url: string) => Promise<THREE.Object3D>)
  setBounds(b: { w: number; h: number }): void
  setObjects(list: SceneObject[]): void               // id 기준 차이만 반영 (같은 url 은 캐시 복제)
  setSelected(id: number | null): void                // 바닥 사각 테두리 (size+0.8m) 파랑 #3b82f6
  setEditing(id: number | null): void                 // 편집 격자(차지 칸 파랑·겹침 빨강·격자선 #60a5fa) 표시
  setGhost(g: { url: string | null; sizeX: number; sizeY: number; sizeZ: number } | null): void  // 배치 미리보기 (반투명 0.45)
  moveGhost(x: number, y: number, snap: boolean): { x: number; y: number }   // 격자 붙인 위치 반환
  rotateGhost(): number                                // +90°, 새 rot 반환
  pick(ray: THREE.Raycaster): number | null            // 광선에 맞은 배치 id
  move(id: number, x: number, y: number): void         // 끌기 중 메쉬만 이동 + 편집 격자 다시
  dispose(): void
}
```
- Produces (`FactoryScene` 추가 공개 메서드, `PickSource` 와 별도 인터페이스 `ObjectHost`):
```ts
export interface ObjectHost {
  setObjects(list: SceneObject[]): void
  setSelected(id: number | null): void
  setEditing(id: number | null): void
  setPlacing(g: { url: string | null; sizeX: number; sizeY: number; sizeZ: number } | null): void
  setObjectEvents(e: ObjectEvents | null): void
  focusObject(id: number): void
}
```
  `FactoryView` 의 `onScene` 콜백 타입을 `(s: (PickSource & ObjectHost) | null) => void` 로 바꾼다.

규칙 (구현):
1. **modelCache.ts** — `loadModel(url): Promise<THREE.Object3D>`: `GLTFLoader` 로 한 번만 받아(Promise 캐시, 실패하면 캐시에서 지움) `scene` 을 돌려준다. `instance(src)`: `src.clone(true)` (형상·재질 공유). `disposeCache()`: 캐시의 형상·재질·텍스처 해제.
2. **표시** — 배치마다 `THREE.Group` (`userData.placementId`), 위치 `planToLocal(x, y, bounds)`, `rotation.y = rot·π/180`. url 이 null 이면 회색(`#9aa3ad`) 반투명(0.6) 상자(sizeX×sizeZ×sizeY, 바닥 y=0) + 위에 `label`(없으면 이름) 스프라이트(P2 zone 이름표와 같은 `zoneLabel` 방식 재사용 — `scene/labels.ts`). 모델 로드 전에도 같은 임시 상자를 보여 주고 로드되면 바꾼다. 로드 실패도 임시 상자.
3. **선택 테두리** — 선택된 배치 그룹 아래 `LineLoop` 사각형 (반크기 sizeX/2+0.4, sizeY/2+0.4, y=0.05), `#3b82f6`, `depthTest:false`, `renderOrder 9`.
4. **편집 격자** — `setEditing(id)`: 그 배치의 `rectOf` 와 나머지 배치들의 rect 로 `editCells(r, others, cellSize(bounds))` → 칸마다 바닥 사각형(InstancedMesh 하나, 칸 크기 c×0.94, y=0.035, 파랑 `#3b82f6` / 겹침 빨강 `#ef4444`, opacity 0.45, toneMapped false) + 칸 테두리 격자선(`#60a5fa`, LineSegments, opacity 0.6). 칸 좌표 (x0,y0) → 중심 (x0+c/2, y0+c/2) → `planToLocal`. 최대 6000칸 (demo 와 같음).
5. **pick(ray)** — 모든 배치 그룹과 교차, 가장 가까운 것의 `placementId` (부모로 올라가며 찾음).
6. **배치 미리보기** — `setGhost(g)`: 모델(또는 상자) 을 반투명(0.45, depthWrite false) 으로 복제해 보이고, `moveGhost` 는 `snap` 이면 `snapToCells(rectOf({x,y,rot}, g), x, y, c)` 로 붙여 그 위치로 옮긴다. `rotateGhost` 는 rot += 90 (360 나머지).
7. **FactoryScene 연결**:
   - `root` 아래 `objects` 그룹 하나를 만들고 `ObjectLayer` 생성. `setPlan` 때 `objectLayer.setBounds(plan.bounds)` (plan null 이면 setObjects([])).
   - 클릭(`onClick`) 순서: ① 측정 도구 콜백(`onPick`) 이 있으면 기존대로 ② 배치 모드(`ghost` 있음) 이면 `onPlace(ghostX, ghostY, rot)` ③ 아니면 `objectLayer.pick(ray)` → `onSelect(id 또는 null)`.
   - `pointermove`: 배치 모드면 바닥 교차점 → plan 좌표 → `moveGhost(x, y, !ev.shiftKey)`.
   - `contextmenu`: 배치 모드면 `preventDefault` + `rotateGhost()`.
   - 끌기: `pointerdown` 에서 편집 중(`setEditing(id)`) 인 배치를 맞히면 `controls.enabled = false`, `setPointerCapture`, 잡은 점과 중심의 차이(offset) 기억. `pointermove` → 바닥 점 − offset → Shift 아니면 `snapToCells` → `objectLayer.move` + `onDrag`. `pointerup` → `onDrop`, `controls.enabled = true`, capture 해제. 끌기 중 `click` 은 선택을 바꾸지 않게 무시 (끌기 끝난 직후 플래그).
   - `focusObject(id)`: 그 배치 월드 위치로 `nav.focusOn(pos, max(sizeX, sizeY, 6))`.
   - `dispose` 에서 `objectLayer.dispose()`, `disposeCache()`, 새 이벤트 해제.
8. 그림자: 배치 메쉬 `castShadow = receiveShadow = true`.

- [ ] **Step 1: 실패 테스트 (WebGL 없이 되는 부분)**

`web/src/scene/objectLayer.test.ts`:
```ts
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { ObjectLayer, type SceneObject } from './objectLayer'

const box = async () => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial())
const obj = (id: number, over: Partial<SceneObject> = {}): SceneObject => ({ id, name: `a${id}`, url: null, sizeX: 4, sizeY: 2, sizeZ: 3, x: 5, y: 5, rot: 0, ...over })

describe('ObjectLayer (형상만)', () => {
  it('배치 위치·회전 (plan → 로컬), 차이만 반영', () => {
    const root = new THREE.Group()
    const layer = new ObjectLayer(root, box)
    layer.setBounds({ w: 10, h: 10 })
    layer.setObjects([obj(1), obj(2, { x: 1, y: 9, rot: 90 })])
    const g = root.children.filter((c) => c.userData.placementId != null)
    expect(g).toHaveLength(2)
    const b = g.find((c) => c.userData.placementId === 2)!
    expect(b.position.x).toBeCloseTo(-4)
    expect(b.position.z).toBeCloseTo(-4)
    expect(b.rotation.y).toBeCloseTo(Math.PI / 2)
    const first = g.find((c) => c.userData.placementId === 1)!
    layer.setObjects([obj(1)])
    expect(root.children.filter((c) => c.userData.placementId != null)).toHaveLength(1)
    expect(root.children.find((c) => c.userData.placementId === 1)).toBe(first) // 같은 것은 다시 만들지 않음
  })

  it('광선 선택', () => {
    const root = new THREE.Group()
    const layer = new ObjectLayer(root, box)
    layer.setBounds({ w: 10, h: 10 })
    layer.setObjects([obj(1)])
    root.updateMatrixWorld(true)
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 50, 0), new THREE.Vector3(0, -1, 0))
    expect(layer.pick(ray)).toBe(1)
    ray.set(new THREE.Vector3(4.5, 50, 4.5), new THREE.Vector3(0, -1, 0))
    expect(layer.pick(ray)).toBeNull()
  })

  it('배치 미리보기: 격자 붙기·회전', () => {
    const root = new THREE.Group()
    const layer = new ObjectLayer(root, box)
    layer.setBounds({ w: 100, h: 100 })
    layer.setGhost({ url: null, sizeX: 4, sizeY: 2, sizeZ: 1 })
    expect(layer.moveGhost(5.3, 5.6, true)).toEqual({ x: 5, y: 6 })
    expect(layer.moveGhost(5.3, 5.6, false)).toEqual({ x: 5.3, y: 5.6 })
    expect(layer.rotateGhost()).toBe(90)
    layer.setGhost(null)
  })

  it('편집 격자: 겹친 칸 수만큼 빨강', () => {
    const root = new THREE.Group()
    const layer = new ObjectLayer(root, box)
    layer.setBounds({ w: 100, h: 100 })
    layer.setObjects([obj(1, { x: 2, y: 1 }), obj(2, { x: 4, y: 1, sizeX: 2 })])
    layer.setEditing(1)
    expect(layer.editStats()).toEqual({ cells: 8, hits: 2 })
    layer.setEditing(null)
    expect(layer.editStats()).toBeNull()
  })
})
```
(`editStats(): { cells: number; hits: number } | null` 을 테스트용 공개 메서드로 추가 — Interfaces 에 포함.)

Run: `npx vitest run src/scene/objectLayer`
Expected: FAIL.

- [ ] **Step 2: 구현** — 위 규칙 1~8. `zoneLabel` 이 canvas 없는 jsdom 에서 null 을 돌려주면 라벨 없이 상자만 (test-setup 의 getContext 스텁 때문에 null).

- [ ] **Step 3: 확인**

Run: `npx vitest run && npm run build && ./node_modules/.bin/oxlint`
Expected: PASS. 브라우저 동작은 Task 12 에서 확인하지만, 지금 `npm run dev` + 서버로 한 번 열어 나셀 공장 객체가 보이는지 눈으로 보는 것을 권장 (서버 시드는 Task 5 완료 상태).

- [ ] **Step 4: Commit**

```bash
cd /c/kopens/project/Factory3D && git add web/src/scene
git commit -m "feat(web): 3D 객체 레이어 — 모델 캐시·배치 표시·선택 테두리·배치 미리보기·편집 격자·끌기

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 메인 화면 — 객체 패널 · 배치 · 선택 · 편집 · 되돌리기

**Files:**
- Create: `web/src/objects/ObjectPanel.tsx`, `ModelCard.tsx`, `PlacementList.tsx`, `ObjectInfo.tsx`, `EditTag.tsx`, `web/src/objects/objects.test.tsx`
- Modify: `web/src/pages/FactoryPage.tsx`, `web/src/layout/layout.test.tsx` (FactoryView 가짜에 객체 메서드), `web/src/styles/app.css`

**Interfaces:**
- Consumes: Task 6 `useModels`, `usePlacements`, `modelFileUrl`, `modelThumbUrl`; Task 3 `CATEGORY_LABEL`, `BOX_SIZE`, `nextName`, `rectOf`, `editCells`, `editTag`, `cellSize`; Task 7 `ObjectHost`, `SceneObject`, `ObjectEvents`.
- Produces:
  - `ObjectPanel(props: { models: ModelInfo[]; placements: Placement[]; canEdit: boolean; selectedId: number | null; placingModelId: number | null; onPickModel(m: ModelInfo): void; onSelect(id: number): void; onAddModel(): void })` — 탭 `설비 · 자재 · 운반`(role tab), 카드 버튼 접근 이름 = 모델 이름, `＋ 객체 추가` 버튼(canEdit), 목록 검색 입력 라벨 `객체 검색`, 목록 행은 버튼(접근 이름 = 객체 이름), 모델 없는 행에 `모델 없음` 표시. 패널 머리 `객체` + 접기 버튼 `객체 패널 닫기`.
  - `ObjectInfo(props: { placement: Placement; model: ModelInfo | null; models: ModelInfo[]; canEdit: boolean; editing: boolean; onRename(name: string): void; onEdit(): void; onRotate(): void; onDelete(): void; onAssign(modelId: number): void; onClose(): void })` — 이름 입력 라벨 `객체 이름`(Enter/blur 로 저장), 버튼 `편집`/`편집 완료`, `90° 회전`, `삭제`(확인 없이 — 되돌리기로 복구), 모델 없을 때 select 라벨 `모델 지정`.
  - `EditTag({ text }: { text: string })` — `<p className="edit-tag" role="status">`.
  - FactoryPage: 단축키 Ctrl+Z / Ctrl+Y(또는 Ctrl+Shift+Z) 되돌리기·다시 하기 (입력칸 포커스 중 제외), Esc → 배치 모드 끝 → 편집 끝 → 선택 해제 순.

규칙 (FactoryPage):
- `models = useModels()`, `placements = usePlacements(detail?.id ?? null)`.
- `sceneObjects` = placements → `SceneObject` (모델 있으면 `url = modelFileUrl(model)`, size = 모델 size, 없으면 `url=null`, `BOX_SIZE`, `label = hintLabel ?? name`). `useEffect` 로 `scene.setObjects(sceneObjects)`.
- 상태: `selectedId`, `editingId`, `placing: ModelInfo | null`, `dragPos: {id,x,y} | null`.
- `scene.setObjectEvents({ onSelect: (id) => { setSelectedId(id); if (id !== editingId) setEditingId(null) }, onDrag: (id,x,y) => setDragPos({id,x,y}), onDrop: (id,x,y) => { setDragPos(null); placements.update(id, { x, y }) }, onPlace: (x,y,rot) => placements.add([{ modelId: placing.id, name: nextName(placing.name, names), x, y, rot }]) })`.
- 배치 모드: 카드 클릭 → `setPlacing(m)` + `scene.setPlacing({url, size})`; 조회 권한은 카드 클릭해도 아무것도 안 함. 배치 후에도 모드 유지(연속), Esc 로 끝.
- 편집: `편집` → `setEditingId(id)` + `scene.setEditing(id)`; 편집 태그 = `editTag(rectOf(pos), editCells(rect, others, cellSize(bounds)), c)` (pos 는 dragPos 가 있으면 그것, 아니면 배치 값), 화면 아래 가운데 `EditTag`.
- 회전: `update(id, { rot: (rot + 90) % 360 })` (편집 중이면 `snapToCells` 로 위치도 다시 맞춰 함께 보냄).
- 목록 행 클릭 → 선택 + `scene.focusObject(id)`.
- `placements.error` 는 토스트로.
- 도구(측정·보정) 가 켜지면 배치 모드·편집을 끝낸다 (DrawingTools 에 `onToolChange?(active: boolean)` 콜백을 추가해 FactoryPage 가 받음).
- 레이아웃: `.object-panel` (왼쪽 300px, 3D 위 겹침, 위 12px·아래 12px·왼쪽 12px, 접으면 머리만), InfoCard 는 패널이 열려 있으면 오른쪽 아래로, ObjectInfo 는 오른쪽 아래(InfoCard 위).

- [ ] **Step 1: 실패 테스트 작성**

`web/src/objects/objects.test.tsx`:
```tsx
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ObjectInfo } from './ObjectInfo'
import { ObjectPanel } from './ObjectPanel'
import type { ModelInfo, Placement } from './types'

const m = (id: number, name: string, category: ModelInfo['category']): ModelInfo => ({
  id, name, category, sourceExt: 'glb', sizeX: 4, sizeY: 4, sizeZ: 3, aliases: [], version: 1, usedDrawings: 1, updatedAt: '',
})
const models = [m(1, '허브', 'mat'), m(2, '메인 조립 지그', 'equip')]
const placements: Placement[] = [
  { id: 10, modelId: 1, name: '허브 1', x: 1, y: 2, rot: 0 },
  { id: 11, modelId: 2, name: 'Main Station 1', x: 3, y: 4, rot: 90 },
  { id: 12, modelId: null, name: '표기 PUMP', x: 5, y: 6, rot: 0, hintLabel: 'PUMP' },
]

function panel(over: Partial<Parameters<typeof ObjectPanel>[0]> = {}) {
  const props = { models, placements, canEdit: true, selectedId: null, placingModelId: null, onPickModel: vi.fn(), onSelect: vi.fn(), onAddModel: vi.fn(), ...over }
  render(<ObjectPanel {...props} />)
  return props
}

describe('객체 패널', () => {
  it('분류 탭별 카드, 카드를 누르면 배치 모드 요청', () => {
    const p = panel()
    expect(screen.getByRole('tab', { name: '설비' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: '메인 조립 지그' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '허브' })).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: '자재' }))
    fireEvent.click(screen.getByRole('button', { name: '허브' }))
    expect(p.onPickModel).toHaveBeenCalledWith(models[0])
  })
  it('목록 검색·선택·모델 없음 표시', () => {
    const p = panel()
    const list = screen.getByRole('list', { name: '이 도면의 객체' })
    expect(within(list).getAllByRole('button')).toHaveLength(3)
    expect(within(list).getByText('모델 없음')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('객체 검색'), { target: { value: 'main' } })
    expect(within(list).getAllByRole('button')).toHaveLength(1)
    fireEvent.click(within(list).getByRole('button', { name: /Main Station 1/ }))
    expect(p.onSelect).toHaveBeenCalledWith(11)
  })
  it('조회 권한은 객체 추가 버튼 없음', () => {
    panel({ canEdit: false })
    expect(screen.queryByRole('button', { name: /객체 추가/ })).toBeNull()
  })
})

describe('객체 정보 카드', () => {
  const base = { model: models[0], models, canEdit: true, editing: false, onRename: vi.fn(), onEdit: vi.fn(), onRotate: vi.fn(), onDelete: vi.fn(), onAssign: vi.fn(), onClose: vi.fn() }
  it('이름 바꾸기(Enter)·편집·회전·삭제', () => {
    const p = { ...base, onRename: vi.fn(), onEdit: vi.fn(), onRotate: vi.fn(), onDelete: vi.fn() }
    render(<ObjectInfo {...p} placement={placements[0]} />)
    expect(screen.getByText('1.00, 2.00 m')).toBeInTheDocument()
    const name = screen.getByLabelText('객체 이름')
    fireEvent.change(name, { target: { value: '허브 A' } })
    fireEvent.keyDown(name, { key: 'Enter' })
    expect(p.onRename).toHaveBeenCalledWith('허브 A')
    fireEvent.click(screen.getByRole('button', { name: '편집' }))
    fireEvent.click(screen.getByRole('button', { name: /90° 회전/ }))
    fireEvent.click(screen.getByRole('button', { name: /삭제/ }))
    expect(p.onEdit).toHaveBeenCalled()
    expect(p.onRotate).toHaveBeenCalled()
    expect(p.onDelete).toHaveBeenCalled()
  })
  it('모델 없는 배치는 모델 지정, 조회 권한은 읽기만', () => {
    const p = { ...base, model: null, onAssign: vi.fn() }
    const { unmount } = render(<ObjectInfo {...p} placement={placements[2]} />)
    fireEvent.change(screen.getByLabelText('모델 지정'), { target: { value: '1' } })
    expect(p.onAssign).toHaveBeenCalledWith(1)
    unmount()
    render(<ObjectInfo {...base} canEdit={false} placement={placements[0]} />)
    expect(screen.queryByRole('button', { name: '편집' })).toBeNull()
    expect(screen.getByLabelText('객체 이름')).toHaveAttribute('readonly')
  })
})
```

`web/src/layout/layout.test.tsx` 의 `vi.mock('../scene/FactoryView', ...)` 는 그대로 두되, FactoryPage 가 `/api/models`·`/api/drawings/<id>/placements` 를 부르므로 fetch 가짜에 `if (url === '/api/models') return json(200, [])`, `if (/\/placements$/.test(url)) return json(200, [])` 를 넣는다.

Run: `npx vitest run src/objects/objects src/layout`
Expected: FAIL (컴포넌트 없음).

- [ ] **Step 2: 구현** — 컴포넌트·FactoryPage 연결·CSS. 카드 썸네일 `<img src={modelThumbUrl(m)} alt="" loading="lazy">`. 탭은 `role="tablist"`/`role="tab"`/`aria-selected`. 목록은 `<ul aria-label="이 도면의 객체">`, 행 `<li><button>` (이름 + 모델 이름 또는 `모델 없음`). 위치 표기 `x.xx, y.yy m`, 회전 `n°`.

`app.css` 에 추가 (예시 값, 기존 도구줄·정보 카드 스타일과 맞춤):
```css
.object-panel { position: absolute; top: 12px; left: 12px; bottom: 12px; width: 300px; display: flex; flex-direction: column; border: 1px solid var(--line-strong); border-radius: var(--kp-radius-sm); background: color-mix(in srgb, var(--panel) 94%, transparent); overflow: hidden; z-index: 2; }
.object-panel.closed { bottom: auto; width: auto; }
.object-panel header { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; font-weight: 600; font-size: var(--kp-text-14); }
.object-tabs { display: flex; gap: 4px; padding: 0 12px 8px; }
.object-tabs button { flex: 1; height: 28px; border: 1px solid var(--line); border-radius: var(--kp-radius-xs); background: none; color: var(--muted); font-size: var(--kp-text-13); }
.object-tabs button[aria-selected='true'] { color: #fff; border-color: var(--primary); background: color-mix(in srgb, var(--primary) 22%, transparent); }
.model-cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; padding: 0 12px 12px; max-height: 40%; overflow: auto; }
.model-card { display: flex; flex-direction: column; gap: 4px; padding: 6px; border: 1px solid var(--line); border-radius: var(--kp-radius-sm); background: #ffffff08; color: var(--text); font-size: var(--kp-text-12); text-align: left; }
.model-card img { width: 100%; aspect-ratio: 4 / 3; object-fit: contain; background: #ffffff10; border-radius: var(--kp-radius-xs); }
.model-card.on { border-color: var(--primary); }
.placement-list { flex: 1; min-height: 0; overflow: auto; margin: 0; padding: 0 6px 8px; list-style: none; }
.placement-list button { width: 100%; display: flex; justify-content: space-between; gap: 8px; padding: 6px 8px; border: 0; border-radius: var(--kp-radius-xs); background: none; color: var(--text); font-size: var(--kp-text-13); text-align: left; }
.placement-list button.on, .placement-list button:hover { background: #ffffff12; }
.placement-list .muted { color: var(--muted); }
.object-info { position: absolute; right: 12px; bottom: 96px; width: 280px; display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px solid var(--line-strong); border-radius: var(--kp-radius-sm); background: color-mix(in srgb, var(--panel) 94%, transparent); font-size: var(--kp-text-13); z-index: 2; }
.edit-tag { position: absolute; left: 50%; bottom: 20px; transform: translateX(-50%); margin: 0; padding: 6px 12px; border: 1px solid var(--line-strong); border-radius: var(--kp-radius-sm); background: color-mix(in srgb, var(--panel) 92%, transparent); color: var(--text); font-weight: 600; font-size: var(--kp-text-13); }
```

- [ ] **Step 3: 통과 확인**

Run: `npx vitest run && npm run build && ./node_modules/.bin/oxlint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /c/kopens/project/Factory3D && git add web
git commit -m "feat(web): 객체 패널·배치 모드·선택·편집(격자 태그)·회전·삭제·되돌리기

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 객체 추가 창 (3D 파일 → glb 변환 · 썸네일 · 업로드)

**Files:**
- Create: `web/src/objects/convert/load.ts`, `normalize.ts`, `exportGlb.ts`, `thumbnail.ts`, `web/src/objects/convert/normalize.test.ts`
- Create: `web/src/objects/AddModelDialog.tsx`, `web/src/objects/AddModelDialog.test.tsx`
- Modify: `web/src/pages/FactoryPage.tsx` (`onAddModel` → 창, 등록 후 그 모델로 배치 모드)

**Interfaces:**
- Consumes: Task 6 `createModel`, `ModelUpload`; `Modal`.
- Produces:
```ts
// load.ts
export const MODEL_EXTS = ['glb', 'gltf', 'fbx', 'obj', 'stl'] as const
export type ModelExt = (typeof MODEL_EXTS)[number]
export function extOf(name: string): ModelExt | null
export function loadModelFiles(files: File[]): Promise<{ object: THREE.Object3D; ext: ModelExt; name: string }>   // 주 파일 = 첫 번째 지원 확장자, gltf 는 나머지를 URL 대체로
// normalize.ts
export type Unit = 'm' | 'cm' | 'mm'
export const UNIT_SCALE: Record<Unit, number>   // m 1, cm 0.01, mm 0.001
export function guessUnit(size: { x: number; y: number; z: number }): Unit   // 가장 긴 변 > 100 → mm, > 10 → cm, 아니면 m
export function normalize(object: THREE.Object3D, unit: Unit, quarterTurns: number): { group: THREE.Group; size: { sizeX: number; sizeY: number; sizeZ: number } }
// exportGlb.ts
export function exportGlb(o: THREE.Object3D): Promise<Blob>   // GLTFExporter binary, type 'model/gltf-binary'
// thumbnail.ts
export function captureThumbnail(o: THREE.Object3D): Promise<Blob>   // 240×180 png (bakePage 와 같은 구도)
// AddModelDialog
export function AddModelDialog(props: { onClose(): void; onCreated(m: ModelInfo): void; deps?: Partial<ConvertDeps> })
export interface ConvertDeps { load: typeof loadModelFiles; exportGlb: typeof exportGlb; thumbnail: typeof captureThumbnail }
```
  - 창 라벨: 파일 입력 `3D 파일` (`accept=".glb,.gltf,.bin,.fbx,.obj,.stl,.png,.jpg,.jpeg"`, multiple), `단위`(select m/cm/mm), 버튼 `90° 돌리기`, `이름`(기본 = 파일 이름), `분류`(select 설비/자재/운반, 기본 설비), `별칭`(쉼표), 버튼 `등록`. 크기 문구 `가로 x.xx × 세로 y.yy × 높이 z.zz m`. 추정 안내 `단위를 mm 로 추정했습니다`(추정한 단위가 m 가 아닐 때).
  - 100MB 넘는 파일 → `파일이 너무 큽니다 (최대 100MB).`; 지원 안 되는 확장자 → `glb, gltf, fbx, obj, stl 파일만 올릴 수 있습니다.`; 로드 실패 → `3D 파일을 읽지 못했습니다: <메시지>`.
  - 미리보기: 작은 three 캔버스(320×200) 에 normalize 결과를 천천히 돌림 — WebGL 없으면 미리보기 자리에 `미리보기를 표시할 수 없습니다` (등록은 가능, 썸네일은 실패 시 회색 1×1 png 대신 서버 요구를 맞추려 `deps.thumbnail` 실패 시 오류 표시하고 등록 불가).

- [ ] **Step 1: 실패 테스트**

`web/src/objects/convert/normalize.test.ts`:
```ts
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { extOf, MODEL_EXTS } from './load'
import { guessUnit, normalize } from './normalize'

describe('모델 정규화', () => {
  it('확장자', () => {
    expect(MODEL_EXTS).toContain('stl')
    expect(extOf('a.FBX')).toBe('fbx')
    expect(extOf('a.dwg')).toBeNull()
  })
  it('단위 추정', () => {
    expect(guessUnit({ x: 4000, y: 2000, z: 3000 })).toBe('mm')
    expect(guessUnit({ x: 40, y: 20, z: 3 })).toBe('cm')
    expect(guessUnit({ x: 4, y: 2, z: 3 })).toBe('m')
  })
  it('배율·바닥 중심·앞방향 회전, 크기(sizeX=x, sizeY=z, sizeZ=높이)', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(4000, 3000, 2000))
    mesh.position.set(10000, 5000, -3000)
    const { group, size } = normalize(mesh, 'mm', 0)
    expect(size.sizeX).toBeCloseTo(4)
    expect(size.sizeY).toBeCloseTo(2)
    expect(size.sizeZ).toBeCloseTo(3)
    const b = new THREE.Box3().setFromObject(group)
    expect(b.min.y).toBeCloseTo(0)
    expect((b.min.x + b.max.x) / 2).toBeCloseTo(0)
    expect((b.min.z + b.max.z) / 2).toBeCloseTo(0)
    const turned = normalize(new THREE.Mesh(new THREE.BoxGeometry(4, 3, 2)), 'm', 1)
    expect(turned.size.sizeX).toBeCloseTo(2)
    expect(turned.size.sizeY).toBeCloseTo(4)
  })
})
```

`web/src/objects/AddModelDialog.test.tsx`:
```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import * as THREE from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AddModelDialog } from './AddModelDialog'

const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body })
const deps = {
  load: vi.fn(async (files: File[]) => ({ object: new THREE.Mesh(new THREE.BoxGeometry(4000, 3000, 2000)), ext: 'obj' as const, name: files[0].name.replace(/\.[^.]+$/, '') })),
  exportGlb: vi.fn(async () => new Blob([new Uint8Array([0x67, 0x6c, 0x54, 0x46])], { type: 'model/gltf-binary' })),
  thumbnail: vi.fn(async () => new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' })),
}

describe('객체 추가 창', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('파일 → 크기·단위 추정 → 등록(변환·썸네일·업로드)', async () => {
    const fetch = vi.fn(async () => json(201, { id: 9, name: '펌프', category: 'equip', version: 1 }))
    vi.stubGlobal('fetch', fetch)
    const onCreated = vi.fn()
    render(<AddModelDialog onClose={vi.fn()} onCreated={onCreated} deps={deps} />)
    fireEvent.change(screen.getByLabelText('3D 파일'), { target: { files: [new File(['o'], '펌프.obj')] } })
    expect(await screen.findByText('가로 4.00 × 세로 2.00 × 높이 3.00 m')).toBeInTheDocument()
    expect(screen.getByText('단위를 mm 로 추정했습니다')).toBeInTheDocument()
    expect(screen.getByLabelText('이름')).toHaveValue('펌프')
    fireEvent.change(screen.getByLabelText('별칭'), { target: { value: 'PUMP, P-1' } })
    fireEvent.click(screen.getByRole('button', { name: '90° 돌리기' }))
    expect(await screen.findByText('가로 2.00 × 세로 4.00 × 높이 3.00 m')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '등록' }))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 9 })))
    const form = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData
    expect(form.get('name')).toBe('펌프')
    expect(form.get('sourceExt')).toBe('obj')
    expect(form.get('aliases')).toBe('PUMP,P-1')
    expect(Number(form.get('sizeX'))).toBeCloseTo(2)
    expect(deps.exportGlb).toHaveBeenCalled()
  })

  it('지원 안 되는 파일·큰 파일·서버 오류', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(409, { detail: '같은 이름의 모델이 있습니다.' })))
    render(<AddModelDialog onClose={vi.fn()} onCreated={vi.fn()} deps={deps} />)
    fireEvent.change(screen.getByLabelText('3D 파일'), { target: { files: [new File(['x'], 'a.dwg')] } })
    expect(await screen.findByText('glb, gltf, fbx, obj, stl 파일만 올릴 수 있습니다.')).toBeInTheDocument()
    const big = new File(['x'], 'big.glb')
    Object.defineProperty(big, 'size', { value: 101 * 1024 * 1024 })
    fireEvent.change(screen.getByLabelText('3D 파일'), { target: { files: [big] } })
    expect(await screen.findByText('파일이 너무 큽니다 (최대 100MB).')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('3D 파일'), { target: { files: [new File(['o'], '허브.obj')] } })
    await screen.findByText(/가로 4.00/)
    fireEvent.click(screen.getByRole('button', { name: '등록' }))
    expect(await screen.findByText('같은 이름의 모델이 있습니다.')).toBeInTheDocument()
  })
})
```

Run: `npx vitest run src/objects/convert src/objects/AddModelDialog`
Expected: FAIL.

- [ ] **Step 2: 구현**
- `load.ts`: 확장자별 three 로더 — `GLTFLoader`(glb: `parseAsync(arrayBuffer, '')`; gltf: 나머지 선택 파일을 `LoadingManager.setURLModifier` 로 `URL.createObjectURL` 대체), `FBXLoader().parse(arrayBuffer, '')`, `OBJLoader().parse(text)`, `STLLoader().parse(arrayBuffer)` → `new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xb8bec6, roughness: 0.6 }))`. 만든 object URL 은 끝나면 `revokeObjectURL`.
- `normalize.ts`: `object.scale.multiplyScalar(UNIT_SCALE[unit])` → `rotation.y = quarterTurns·π/2` → 부모 그룹에 넣고 `updateMatrixWorld` → `Box3` → 그룹 안 자식 위치를 `(-center.x, -min.y, -center.z)` 만큼 옮김 → 다시 Box3 로 size. 입력 object 를 바꾸지 않도록 `object.clone(true)` 로 시작.
- `exportGlb.ts`: `new GLTFExporter().parseAsync(o, { binary: true })` → Blob.
- `thumbnail.ts`: `bakePage.ts` 의 썸네일 구도 그대로 별도 WebGLRenderer(240×180, preserveDrawingBuffer) → `canvas.toBlob('image/png')` → renderer dispose + `forceContextLoss`.
- `AddModelDialog.tsx`: Interfaces 의 라벨·문구 그대로. 파일 고를 때 P2 AddDrawingDialog 처럼 순번 ref 로 늦은 결과 버림. 등록 시 `exportGlb(group)`, `thumbnail(group)` → `createModel({...})`. `deps` 기본값은 실제 함수.
- FactoryPage: `onAddModel` → 창 열기, `onCreated(m)` → `models.reload()` + 그 모델로 배치 모드 진입.

- [ ] **Step 3: 통과 확인**

Run: `npx vitest run && npm run build && ./node_modules/.bin/oxlint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /c/kopens/project/Factory3D && git add web
git commit -m "feat(web): 객체 추가 — glb·gltf·fbx·obj·stl → glb 변환·단위 추정·앞방향·썸네일·업로드

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 도면 연동 — 표기 자동 배치 · 보정 시 배치 이동 · 삭제 안내

**Files:**
- Modify: `web/src/drawing/AddDrawingDialog.tsx` (등록 후 자동 배치), `web/src/drawing/api.ts` (`savePlan` 의 scaleFactor), `web/src/drawing/useDrawing.ts` (`save(plan, layerRules?, scaleFactor?)`), `web/src/drawing/DrawingTools.tsx` (보정 시 배율 전달), `web/src/pages/FactoryPage.tsx` (보정 후 배치 다시 불러오기, 자동 배치 결과 토스트), `web/src/pages/admin/DrawingsPage.tsx` (삭제 문구), `web/src/api/types.ts` (`DrawingSummary.placements`)
- Test: `web/src/drawing/AddDrawingDialog.test.tsx`, `DrawingTools.test.tsx`, `useDrawing.test.tsx`, `web/src/pages/admin/drawings.test.tsx` (추가·수정)

**Interfaces:**
- Consumes: Task 3 `hintsToPlacements`, Task 6 `listModels`, `createPlacements`.
- Produces:
  - `AddDrawingDialog` 의 `onCreated(id: number, placed?: { count: number; unmatched: number })` — 표기가 있으면 모델 목록을 받아 `hintsToPlacements(plan.objectHints, models, [])` → `createPlacements(id, items)` 후 결과를 넘긴다. 자동 배치가 실패해도 도면 등록은 성공으로 두고 `placed` 없이 넘기고 창 안 오류는 띄우지 않음(FactoryPage 토스트 `객체 자동 배치에 실패했습니다: <메시지>`).
  - FactoryPage 토스트: `객체 n개 배치 (모델 없음 m개)` (m=0 이면 `객체 n개 배치`).
  - `savePlan(id, version, plan, layerRules, scaleFactor?)` — scaleFactor 가 있으면 body 에 포함.
  - `DrawingTools.onSave(plan: Plan, opts?: { scaleFactor?: number })` — 보정 때 `{ scaleFactor: actual / measured }`.
  - `DrawingSummary.placements: number`; DrawingsPage 삭제 확인 문구: placements > 0 이면 `'<이름>' 도면을 삭제합니다. 원본 파일과 배치된 객체 n개도 함께 삭제됩니다.`

- [ ] **Step 1: 실패 테스트 추가**
- `AddDrawingDialog.test.tsx`: 표기 있는 DXF(`text('EQUIP', 1000, 1000, 300, 'HUB')`, `text('EQUIP', 2000, 1000, 300, 'PUMP')`, insunits 4, 벽 한 줄) 등록 → fetch 가짜가 `/api/drawings`(POST) 201 `{id: 7}`, `/api/models` 200 `[허브(별칭 HUB)]`, `/api/drawings/7/placements`(POST) 201 → `onCreated` 가 `(7, { count: 2, unmatched: 1 })` 로 불리고, placements POST body 가 `[{modelId:1,name:'허브 1',...,hintLabel:'HUB'},{modelId:null,name:'표기 PUMP',...}]`.
- `DrawingTools.test.tsx`: 보정 테스트에서 `onSave` 두 번째 인자가 `{ scaleFactor: 2 }`.
- `useDrawing.test.tsx`: `save(plan, undefined, 2)` 의 PUT body 에 `scaleFactor: 2`.
- `drawings.test.tsx`: LIST 의 `placements: 79` → 삭제 확인에 `배치된 객체 79개도 함께 삭제됩니다` 포함.

Run: `npx vitest run src/drawing src/pages/admin`
Expected: 새 기대값 FAIL.

- [ ] **Step 2: 구현** — Interfaces 대로. FactoryPage 의 `onSave(p, opts)` 는 `save(p, undefined, opts?.scaleFactor)` 후 `placements.reload()`.

- [ ] **Step 3: 통과 확인**

Run: `npx vitest run && npm run build && ./node_modules/.bin/oxlint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /c/kopens/project/Factory3D && git add web
git commit -m "feat(web): 도면 표기 자동 배치 · 보정 시 배치 함께 이동 · 도면 삭제 시 배치 수 안내

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: 관리자 › 객체관리

**Files:**
- Create: `web/src/pages/admin/ModelsPage.tsx`, `web/src/pages/admin/models.test.tsx`
- Modify: `web/src/pages/admin/AdminLayout.tsx` (탭 `객체관리`, `도면 관리` 다음), `web/src/routes.tsx` (`/admin/models`)

**Interfaces:**
- Consumes: Task 6 `listModels`, `updateModel`, `replaceModelFile`, `deleteModel`, `modelThumbUrl`; Task 9 `AddModelDialog` 의 변환 부분 → 파일 교체에 재사용하기 위해 `AddModelDialog` 에 `mode?: { replace: ModelInfo }` prop 추가 (replace 모드: 이름·분류·별칭 입력 숨김, 버튼 `교체`, `replaceModelFile(id, upload)` 호출, `onCreated(m)` 대신 같은 콜백으로 결과 전달).
- Produces: 표 열 `썸네일 · 이름 · 분류 · 크기 · 별칭 · 사용 도면 · 수정일 · 관리`, 행 버튼 접근 이름 `<이름> 수정`, `<이름> 파일 교체`, `<이름> 삭제`. 수정 창 라벨 `이름`, `분류`, `별칭`, 버튼 `저장`. 삭제 확인: usedDrawings > 0 이면 `'<이름>' 모델을 삭제합니다. <n>개 도면에 배치된 객체는 임시 상자로 바뀝니다.`, 아니면 `'<이름>' 모델을 삭제합니다.`; 버튼 `삭제`. 실패 시 창 안에 오류(P2 DrawingsPage 와 같은 방식, 창 유지).

- [ ] **Step 1: 실패 테스트**

`web/src/pages/admin/models.test.tsx`:
```tsx
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../../api/types'
import { StaticAuth } from '../../auth/auth'
import { routes } from '../../routes'

const ADMIN: User = { id: 1, username: 'admin', displayName: '관리자', role: 'ADMIN', enabled: true, mustChangePassword: false, locked: false, createdAt: '' }
const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body })
const LIST = [
  { id: 1, name: '허브', category: 'mat', sourceExt: 'glb', sizeX: 4, sizeY: 4, sizeZ: 3.2, aliases: ['HUB'], version: 1, usedDrawings: 2, updatedAt: '2026-11-12T00:00:00Z' },
  { id: 2, name: '펌프', category: 'equip', sourceExt: 'obj', sizeX: 1, sizeY: 1, sizeZ: 1, aliases: [], version: 3, usedDrawings: 0, updatedAt: '2026-11-12T00:00:00Z' },
]

function show(handler: (url: string, init?: RequestInit) => unknown = () => null) {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => handler(url, init) ?? (url === '/api/models' ? json(200, LIST) : json(200, [])))
  vi.stubGlobal('fetch', fetch)
  render(
    <StaticAuth user={ADMIN}>
      <RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/admin/models'] })} />
    </StaticAuth>,
  )
  return fetch
}

describe('관리자 › 객체관리', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('목록 (분류·크기·별칭·사용 도면)', async () => {
    show()
    const row = (await screen.findByText('허브', { selector: 'td' })).closest('tr')!
    expect(within(row).getByText('자재')).toBeInTheDocument()
    expect(within(row).getByText('4.0 × 4.0 × 3.2 m')).toBeInTheDocument()
    expect(within(row).getByText('HUB')).toBeInTheDocument()
    expect(within(row).getByText('2')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '객체관리' })).toHaveAttribute('aria-current', 'page')
  })

  it('수정 → PATCH (별칭 쉼표 분리)', async () => {
    const fetch = show((url, init) => (init?.method === 'PATCH' ? json(200, { ...LIST[0], name: '허브 A' }) : null))
    fireEvent.click(await screen.findByRole('button', { name: '허브 수정' }))
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '허브 A' } })
    fireEvent.change(screen.getByLabelText('별칭'), { target: { value: 'HUB, 허브' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(fetch.mock.calls.some(([, i]) => (i as RequestInit | undefined)?.method === 'PATCH')).toBe(true))
    const body = JSON.parse(String((fetch.mock.calls.find(([, i]) => (i as RequestInit | undefined)?.method === 'PATCH')![1] as RequestInit).body))
    expect(body).toEqual({ name: '허브 A', category: 'mat', aliases: ['HUB', '허브'] })
  })

  it('사용 중인 모델 삭제는 임시 상자 안내', async () => {
    const fetch = show((url, init) => (init?.method === 'DELETE' ? { ok: true, status: 204, json: async () => undefined } : null))
    fireEvent.click(await screen.findByRole('button', { name: '허브 삭제' }))
    expect(screen.getByText("'허브' 모델을 삭제합니다. 2개 도면에 배치된 객체는 임시 상자로 바뀝니다.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '삭제' }))
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/models/1', expect.objectContaining({ method: 'DELETE' })))
  })
})
```

Run: `npx vitest run src/pages/admin/models`
Expected: FAIL.

- [ ] **Step 2: 구현** — P2 `DrawingsPage` 와 같은 구조(표·창·창 안 오류). 썸네일 `<img src={modelThumbUrl(m)} alt="" width="64" height="48">`. 크기 `x.x × y.y × z.z m`. 분류 `CATEGORY_LABEL`. 별칭은 쉼표로 연결해 표시하고 입력은 쉼표 분리·공백 제거·빈 값 제거.

- [ ] **Step 3: 통과 확인**

Run: `npx vitest run && npm run build && ./node_modules/.bin/oxlint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /c/kopens/project/Factory3D && git add web
git commit -m "feat(web): 관리자 객체관리 — 목록·수정·파일 교체·삭제(사용 중 안내)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: 실제 화면 확인 (jar · Edge) + README

**Files:**
- Create: `web/e2e/p3-smoke.mjs`, `web/e2e/fixtures/box.obj`
- Modify: `README.md`, (필요 시) 이전 smoke 스크립트 선택자

**Interfaces:**
- Consumes: 전부. P1·P2 smoke 실행 방식(깨끗한 DB → jar → `p1-smoke.mjs` → `p2-smoke.mjs`).

- [ ] **Step 1: 시험용 obj**

`web/e2e/fixtures/box.obj` (2m × 1m × 1.5m 상자, 단위 m):
```
v -1 0 -0.5
v 1 0 -0.5
v 1 0 0.5
v -1 0 0.5
v -1 1.5 -0.5
v 1 1.5 -0.5
v 1 1.5 0.5
v -1 1.5 0.5
f 1 2 3 4
f 5 8 7 6
f 1 5 6 2
f 2 6 7 3
f 3 7 8 4
f 4 8 5 1
```

- [ ] **Step 2: 확인 스크립트 `web/e2e/p3-smoke.mjs`**

P2 스크립트(`p2-smoke.mjs`)와 같은 틀(로그인 → try/finally → 스크린샷 `e2e/shots/p3-*`). 순서:
1. 나셀 공장 선택 상태 확인 → 3초 대기 → `p3-1-factory-objects.png`. `placement-list` 행 수가 79 인지 확인.
2. 객체 목록에서 `Main Station 1` 클릭 → 카메라 이동 대기 1초 → `p3-2-focus.png`, 정보 카드에 `Main Station 1`.
3. `편집` → 3D 캔버스에서 그 객체 화면 위치를 찾기 어려우므로 대신 `90° 회전` 클릭 → 정보 카드 회전 값이 바뀌는지 → `Ctrl+Z` → 원래 값 → `p3-3-edit.png`(편집 격자·태그 `총 n칸` 보임).
4. 자재 탭 → `허브` 카드 클릭 → 캔버스 가운데 클릭(배치) → Esc → 목록 80개 → `p3-4-placed.png`.
5. `＋ 객체 추가` → `3D 파일` 에 `fixtures/box.obj` → `가로 2.00 × 세로 1.00 × 높이 1.50 m` 확인 → 이름 `시험 상자 <시각>` → `등록` → 배치 모드면 캔버스 클릭 → Esc → `p3-5-added-model.png`.
6. 도면 select 에서 P2 smoke 가 만든 `시험 도면 …` 선택 → 목록 0개 → 나셀 공장으로 돌아오면 81개 → `p3-6-switch.png`.
7. `/admin/models` → 표 행 12개 이상 → `p3-7-admin-models.png`.

- [ ] **Step 3: 실행**

깨끗한 DB·데이터 폴더 → `./gradlew bootJar` → jar 백그라운드 실행(`F3D_ADMIN_PASSWORD=Start1234`, `F3D_DATA_DIR=/c/kopens/project/Factory3D/data`) → `/api/health` ok → `node e2e/p1-smoke.mjs http://localhost:8080 Start1234 Factory3d1!` → `node e2e/p2-smoke.mjs http://localhost:8080 admin Factory3d1!` → `node e2e/p3-smoke.mjs http://localhost:8080 admin Factory3d1!`.
Expected: 세 스크립트 모두 통과. 서버 로그에 `기본 모델 11종을 넣었습니다`, `나셀 공장에 기본 배치 79개를 넣었습니다`.

- [ ] **Step 4: 스크린샷 눈으로 확인**

`p3-1` ~ `p3-7` 을 Read 로 열어 보고서에 적는다: 나셀 공장에 지그·허브·팔레트·랙이 자리에 있는지(벽 밖·공중 아님), 크기가 공장에 비해 그럴듯한지(지그 7~11m), 선택 테두리·편집 격자·태그, 새 모델 카드 썸네일, 관리자 표. 깨져 보이면(모델이 안 보임, 크기 1000배, 방향 뒤집힘) 원인을 찾아 해당 Task 파일을 고치고 테스트·smoke 를 다시 돌린다. 판단 문제(조금 어둡다 등)는 코드 그대로 두고 적는다. 서버를 반드시 종료한다.

- [ ] **Step 5: README**

`README.md` 의 `### 도면` 단락 아래에:
```
### 객체
- 처음 실행하면 기본 모델 11종(설비 5 · 자재 6)과 나셀 공장 배치 79개가 들어갑니다.
- 운전원 이상: 왼쪽 객체 패널에서 카드를 눌러 배치(우클릭 90° 회전, Esc 끝), 객체를 골라 `편집`(끌기, Shift 자유)·회전·삭제, Ctrl+Z / Ctrl+Y.
- `＋ 객체 추가`: glb · gltf · fbx · obj · stl (최대 100MB) → 브라우저에서 glb 로 변환해 등록.
- 도면에 EQUIP/설비 레이어 글자·블록이 있으면 모델 이름·별칭과 맞춰 자동 배치합니다 (없으면 임시 상자).
- 기본 모델을 다시 구우려면 `cd web && npm run bake:models` (Edge 필요), 기본 배치는 `npm run seed:placements`.
```
`## 테스트` 블록에 `cd web && node e2e/p3-smoke.mjs http://localhost:8080 admin <비밀번호>   # P2 smoke 다음에` 추가.

- [ ] **Step 6: Commit**

```bash
cd /c/kopens/project/Factory3D && git add README.md web/e2e/p3-smoke.mjs web/e2e/fixtures/box.obj
git commit -m "chore: P3 실제 화면 확인 스크립트 · README 객체 안내

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
(Step 4 에서 고친 코드가 있으면 함께 커밋하고 메시지에 적는다.)
