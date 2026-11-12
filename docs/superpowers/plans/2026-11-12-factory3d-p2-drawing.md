# Factory3D P2 도면 불러오기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** DXF 도면을 올리면 3D 공장(외벽·낮은 가벽·H빔 기둥·구역·바닥 선)으로 보여 주고, 측정·보정·회전·반전 도구, 도면 추가, 관리자 도면 관리, 기본 도면(나셀 공장)을 제공한다.

**Architecture:** 브라우저가 DXF 를 해석(`demo/index.html` 의 `parseDxf`·`flatten` 이식)해 `plan` JSON 을 만들고, 서버(Spring Boot)는 원본 파일과 `plan` 을 저장한다. 3D 는 three.js 엔진 클래스 `FactoryScene` 하나가 맡고 React 는 명령만 보낸다. 해석·변환은 순수 함수로 나눠 vitest 로 검증하고, WebGL 이 필요한 부분은 Playwright(Edge) 로 확인한다.

**Tech Stack:** 서버 Spring Boot 4.1 · MyBatis · PostgreSQL 17(jsonb) · Jackson 3(`tools.jackson.*`) / 화면 React 19 · TypeScript · three@0.186.1 · vitest(jsdom) · Playwright

**Spec:** `docs/superpowers/specs/2026-11-12-factory3d-p2-drawing-design.md` (전체 설계 `docs/superpowers/specs/2026-11-12-factory3d-platform-design.md` §4.1·§5.1)

## Global Constraints

- 프로젝트 루트 `C:\kopens\project\Factory3D`. 원본 `C:\kopens\project\demo`, `C:\kopens\project\3D_WEB` 는 **수정 금지** (읽고 복사만).
- Docker·Testcontainers 금지. 서버 테스트는 로컬 PostgreSQL 17 `localhost:5433` 의 `factory3d_test` (support/IntegrationTest).
- 이름 규칙: Java 패키지 `com.kopens.factory3d`, 설정 `factory3d.*`, 환경 변수 `F3D_*`, localStorage `f3d:*`.
- 역할 ADMIN ⊃ OPERATOR ⊃ VIEWER. 도면 조회 = 조회 이상, 도면 추가·보정·회전·재해석 = 운전원 이상, 이름 변경·삭제·레이어 규칙 = 관리자.
- three.js 는 npm `three@0.186.1`, `@types/three@0.186.0` (CDN 금지). addons 는 `three/addons/...` 경로.
- 모든 사용자 문구·오류는 한국어. UI 에 `border-left` 강조선·이모지 금지, 아이콘은 lucide-react, 라벨 약 13~15px.
- `plan` 좌표 단위는 m, 원점 = 도면 bbox 최소점 (x 오른쪽, y 위쪽). 3D 로컬 좌표 = `(x - w/2, 0, -(y - h/2))`.
- 도면 원본 최대 50MB, plan JSON 최대 20MB, 도면 이름 1~100자(앞뒤 공백 제거), 같은 이름 409.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. `.superpowers/` 는 커밋하지 않음.
- 웹 테스트 명령: `cd web && npx vitest run`, 빌드 `npm run build`, 린트 `./node_modules/.bin/oxlint`. 서버: `cd server && ./gradlew test`.

## 파일 구조 (이번 단계에서 생기거나 바뀌는 것)

```
server/src/main/java/com/kopens/factory3d/
  common/DataDir.java                  data-dir 절대경로·생성·쓰기 확인 (새로)
  common/PayloadTooLargeException.java (새로) · ApiExceptionHandler.java (413 추가)
  common/SecurityConfig.java           PATCH/DELETE /api/drawings/** → ADMIN
  drawing/DrawingSummary.java          칸 추가 (version, createdBy, width, height)
  drawing/DrawingDetail.java · DrawingMapper.java(+xml) · DrawingService.java · DrawingController.java · DrawingSeeder.java
server/src/main/resources/seed/main_factory.dxf · main_factory.plan.json
server/src/test/java/com/kopens/factory3d/drawing/DrawingApiTest.java (확장) · DrawingSeederTest.java · common/DataDirTest.java

web/package.json                       three, @types/three 추가
web/src/api/client.ts                  apiBuffer 추가
web/src/api/types.ts                   DrawingSummary 칸 추가
web/src/drawing/
  dxf/types.ts · parse.ts · flatten.ts · testDxf.ts (테스트용 DXF 생성기) · dxf.test.ts
  readDxfFile.ts · readDxfFile.test.ts
  plan/types.ts · rules.ts · geometry.ts · buildPlan.ts · transform.ts · interpret.ts · plan.test.ts · transform.test.ts · seedPlan.test.ts
  api.ts · useDrawing.ts · DrawingTools.tsx · DrawingTools.test.tsx · InfoCard.tsx
  AddDrawingDialog.tsx · PlanPreview.tsx · AddDrawingDialog.test.tsx
web/src/scene/
  textures.ts · materials.ts · planToMeshes.ts · planToMeshes.test.ts · labels.ts
  coords.ts · coords.test.ts · navigation.ts · FactoryScene.ts · FactoryView.tsx
web/src/layout/DrawingBar.tsx (onAdd) · layout.test.tsx (갱신)
web/src/pages/FactoryPage.tsx (3D·도구·추가 연결)
web/src/pages/admin/AdminLayout.tsx (탭) · DrawingsPage.tsx · LayerRulesDialog.tsx · drawings.test.tsx
web/src/routes.tsx (/admin/drawings) · web/src/styles/app.css (도구줄·카드·토스트·창)
web/e2e/p2-smoke.mjs · web/e2e/fixtures/small.dxf
```

---

### Task 1: 서버 — 도면 저장·조회·수정·삭제 API

**Files:**
- Create: `server/src/main/java/com/kopens/factory3d/common/DataDir.java`, `common/PayloadTooLargeException.java`
- Modify: `common/ApiExceptionHandler.java`, `common/SecurityConfig.java`
- Create: `drawing/DrawingDetail.java`, `drawing/DrawingService.java`
- Modify: `drawing/DrawingSummary.java`, `drawing/DrawingMapper.java`, `resources/mapper/DrawingMapper.xml`, `drawing/DrawingController.java`
- Test: `server/src/test/java/com/kopens/factory3d/drawing/DrawingApiTest.java` (기존 2개 유지 + 추가), `common/DataDirTest.java`

**Interfaces:**
- Consumes: `IntegrationTest`(mvc, jdbc, dataDir), `AuditService.log(action, target, detail)`, `BadRequestException`, `NotFoundException`, `ConflictException`.
- Produces (REST):
  - `GET /api/drawings` → `[{id, name, sourceType, version, createdBy, updatedAt, width, height}]` (width/height = plan.bounds.w/h, 없으면 null)
  - `GET /api/drawings/{id}` → `{id, name, sourceType, version, createdBy, createdAt, updatedAt, plan, layerRules}` (plan·layerRules 는 JSON 그대로)
  - `GET /api/drawings/{id}/source` → 원본 바이트, Content-Type `application/dxf`
  - `POST /api/drawings` multipart `file`, `name`, `plan`(문자열), `layerRules`(문자열, 선택) → 상세 (201)
  - `PUT /api/drawings/{id}/plan` JSON `{version, plan, layerRules}` (plan·layerRules 는 JSON 객체) → 상세 (version+1). 불일치 409 "다른 사람이 먼저 수정했습니다."
  - `PATCH /api/drawings/{id}` `{name}` (ADMIN) → 상세
  - `DELETE /api/drawings/{id}` (ADMIN) → 204
- Produces (Java): `DataDir.root(): Path`, `DataDir.resolve(String relative): Path`; `DrawingService.createSeed(String name, byte[] dxf, String planJson)` (Task 4 가 사용).

- [ ] **Step 1: 실패 테스트 작성**

`server/src/test/java/com/kopens/factory3d/drawing/DrawingApiTest.java` 를 아래로 바꾼다 (P1 테스트 2개는 그대로 포함):
```java
package com.kopens.factory3d.drawing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.kopens.factory3d.support.IntegrationTest;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

class DrawingApiTest extends IntegrationTest {
    static final RequestPostProcessor VIEWER = user("viewer").roles("VIEWER");
    static final RequestPostProcessor OPERATOR = user("kim").roles("OPERATOR");
    static final RequestPostProcessor ADMIN = user("admin").roles("ADMIN");
    static final String PLAN = "{\"format\":1,\"scale\":0.001,\"rotQ\":0,\"flip\":1,\"bounds\":{\"w\":160.5,\"h\":65.8},\"lines\":[]}";
    static final byte[] DXF = "0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n".getBytes(StandardCharsets.UTF_8);

    private MockMultipartFile file(String name, byte[] body) {
        return new MockMultipartFile("file", name, "application/dxf", body);
    }

    private long create(String name) throws Exception {
        String loc = mvc.perform(multipart("/api/drawings").file(file("a.dxf", DXF))
                        .param("name", name).param("plan", PLAN).param("layerRules", "{}").with(OPERATOR).with(csrf()))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return Long.parseLong(loc.replaceAll("^\\{\"id\":(\\d+).*$", "$1"));
    }

    @Test
    void 도면이_없으면_빈_목록() throws Exception {
        mvc.perform(get("/api/drawings").with(VIEWER)).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void 도면_목록은_등록순() throws Exception {
        jdbc.update("insert into drawing (name, source_type, source_file) values ('나셀 공장', 'dxf', 'drawings/1/a.dxf')");
        jdbc.update("insert into drawing (name, source_type, source_file) values ('2공장', 'image', 'drawings/2/b.png')");
        mvc.perform(get("/api/drawings").with(VIEWER))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].name").value("나셀 공장"))
                .andExpect(jsonPath("$[0].sourceType").value("dxf"))
                .andExpect(jsonPath("$[1].name").value("2공장"))
                .andExpect(jsonPath("$[1].updatedAt").exists());
    }

    @Test
    void 운전원이_올리면_원본과_plan_이_저장되고_목록에_크기가_보임() throws Exception {
        long id = create("  나셀 공장  ");
        mvc.perform(get("/api/drawings/" + id).with(VIEWER))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("나셀 공장"))
                .andExpect(jsonPath("$.version").value(1))
                .andExpect(jsonPath("$.createdBy").value("kim"))
                .andExpect(jsonPath("$.plan.bounds.w").value(160.5))
                .andExpect(jsonPath("$.layerRules").isMap());
        mvc.perform(get("/api/drawings").with(VIEWER))
                .andExpect(jsonPath("$[0].width").value(160.5))
                .andExpect(jsonPath("$[0].height").value(65.8))
                .andExpect(jsonPath("$[0].version").value(1));
        byte[] src = mvc.perform(get("/api/drawings/" + id + "/source").with(VIEWER))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray();
        assertThat(src).isEqualTo(DXF);
        assertThat(Files.exists(dataDir.resolve("drawings/" + id + "/source.dxf"))).isTrue();
        assertThat(jdbc.queryForObject("select count(*) from audit_log where action = 'DRAWING_CREATE'", Integer.class)).isEqualTo(1);
    }

    @Test
    void 잘못된_입력은_한국어_오류() throws Exception {
        mvc.perform(multipart("/api/drawings").file(file("a.dwg", DXF)).param("name", "x").param("plan", PLAN).with(OPERATOR).with(csrf()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("DXF 파일만 올릴 수 있습니다."));
        mvc.perform(multipart("/api/drawings").file(file("a.dxf", DXF)).param("name", " ").param("plan", PLAN).with(OPERATOR).with(csrf()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("도면 이름은 1~100자로 입력하세요."));
        mvc.perform(multipart("/api/drawings").file(file("a.dxf", DXF)).param("name", "x").param("plan", "{\"format\":1}").with(OPERATOR).with(csrf()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("도면 해석 결과(plan)가 올바르지 않습니다."));
        create("중복");
        mvc.perform(multipart("/api/drawings").file(file("a.dxf", DXF)).param("name", "중복").param("plan", PLAN).with(OPERATOR).with(csrf()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.detail").value("같은 이름의 도면이 있습니다."));
    }

    @Test
    void plan_저장은_버전을_올리고_어긋나면_409() throws Exception {
        long id = create("보정");
        String body = "{\"version\":1,\"plan\":" + PLAN.replace("\"rotQ\":0", "\"rotQ\":1") + ",\"layerRules\":{\"WALL\":{\"role\":\"partition\"}}}";
        mvc.perform(put("/api/drawings/" + id + "/plan").contentType(MediaType.APPLICATION_JSON).content(body).with(OPERATOR).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(2))
                .andExpect(jsonPath("$.plan.rotQ").value(1))
                .andExpect(jsonPath("$.layerRules.WALL.role").value("partition"));
        mvc.perform(put("/api/drawings/" + id + "/plan").contentType(MediaType.APPLICATION_JSON).content(body).with(OPERATOR).with(csrf()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.detail").value("다른 사람이 먼저 수정했습니다."));
    }

    @Test
    void 권한_조회는_쓰기불가_운전원은_이름변경_삭제_불가() throws Exception {
        long id = create("권한");
        mvc.perform(multipart("/api/drawings").file(file("a.dxf", DXF)).param("name", "y").param("plan", PLAN).with(VIEWER).with(csrf()))
                .andExpect(status().isForbidden());
        mvc.perform(patch("/api/drawings/" + id).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"z\"}").with(OPERATOR).with(csrf()))
                .andExpect(status().isForbidden());
        mvc.perform(delete("/api/drawings/" + id).with(OPERATOR).with(csrf())).andExpect(status().isForbidden());
    }

    @Test
    void 관리자는_이름변경과_삭제() throws Exception {
        long id = create("옛 이름");
        mvc.perform(patch("/api/drawings/" + id).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"새 이름\"}").with(ADMIN).with(csrf()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.name").value("새 이름"));
        Path dir = dataDir.resolve("drawings/" + id);
        assertThat(Files.exists(dir)).isTrue();
        mvc.perform(delete("/api/drawings/" + id).with(ADMIN).with(csrf())).andExpect(status().isNoContent());
        assertThat(Files.exists(dir)).isFalse();
        mvc.perform(get("/api/drawings/" + id).with(VIEWER))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.detail").value("도면을 찾을 수 없습니다."));
    }
}
```

`server/src/test/java/com/kopens/factory3d/drawing/DrawingSizeLimitTest.java` (작은 한도로 413 확인):
```java
package com.kopens.factory3d.drawing;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.kopens.factory3d.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.TestPropertySource;

@TestPropertySource(properties = {"factory3d.drawing.max-source-bytes=100", "factory3d.drawing.max-plan-bytes=200"})
class DrawingSizeLimitTest extends IntegrationTest {
    @Test
    void 너무_큰_원본과_plan_은_413() throws Exception {
        var op = user("kim").roles("OPERATOR");
        String plan = "{\"format\":1,\"bounds\":{\"w\":1,\"h\":1},\"lines\":[]}";
        mvc.perform(multipart("/api/drawings").file(new MockMultipartFile("file", "a.dxf", "application/dxf", new byte[101]))
                        .param("name", "큰 원본").param("plan", plan).with(op).with(csrf()))
                .andExpect(status().isPayloadTooLarge()).andExpect(jsonPath("$.detail").value("도면 파일이 너무 큽니다."));
        String big = "{\"format\":1,\"bounds\":{\"w\":1,\"h\":1},\"lines\":[],\"pad\":\"" + "x".repeat(300) + "\"}";
        mvc.perform(multipart("/api/drawings").file(new MockMultipartFile("file", "a.dxf", "application/dxf", new byte[10]))
                        .param("name", "큰 plan").param("plan", big).with(op).with(csrf()))
                .andExpect(status().isPayloadTooLarge()).andExpect(jsonPath("$.detail").value("도면 해석 결과가 너무 큽니다."));
    }
}
```

`server/src/test/java/com/kopens/factory3d/common/DataDirTest.java`:
```java
package com.kopens.factory3d.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class DataDirTest {
    @TempDir Path tmp;

    @Test
    void 상대경로는_절대경로로_바꾸고_폴더를_만듦() {
        Path want = tmp.resolve("sub/data");
        DataDir d = new DataDir(want.toString());
        assertThat(d.root().isAbsolute()).isTrue();
        assertThat(Files.isDirectory(want)).isTrue();
        assertThat(d.resolve("drawings/1/source.dxf")).isEqualTo(want.toAbsolutePath().normalize().resolve("drawings/1/source.dxf"));
    }

    @Test
    void 폴더_밖을_가리키는_경로는_거부() {
        DataDir d = new DataDir(tmp.toString());
        assertThatThrownBy(() -> d.resolve("../escape.txt")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 파일이_있는_자리면_시작_실패() throws Exception {
        Path f = Files.createFile(tmp.resolve("not-a-dir"));
        assertThatThrownBy(() -> new DataDir(f.toString())).isInstanceOf(IllegalStateException.class);
    }
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd /c/kopens/project/Factory3D/server && ./gradlew test --tests "*Drawing*" --tests "*DataDirTest"`
Expected: 컴파일 실패 (`DataDir` 없음) 또는 새 테스트 FAIL.

- [ ] **Step 3: 데이터 폴더·413 예외 구현**

`common/DataDir.java`:
```java
package com.kopens.factory3d.common;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** 업로드 파일 폴더. 시작할 때 절대경로로 바꿔 한 번 알리고, 없으면 만들고, 쓸 수 없으면 시작 실패 */
@Component
public class DataDir {
    private static final Logger log = LoggerFactory.getLogger(DataDir.class);
    private final Path root;

    public DataDir(@Value("${factory3d.data-dir:../data}") String configured) {
        Path p = Path.of(configured).toAbsolutePath().normalize();
        try {
            Files.createDirectories(p);
        } catch (IOException e) {
            throw new IllegalStateException("데이터 폴더를 만들 수 없습니다: " + p, e);
        }
        if (!Files.isDirectory(p) || !Files.isWritable(p))
            throw new IllegalStateException("데이터 폴더에 쓸 수 없습니다: " + p);
        this.root = p;
        log.info("데이터 폴더: {}", p);
    }

    public Path root() {
        return root;
    }

    /** 폴더 기준 상대 경로 → 절대 경로 (폴더 밖은 거부) */
    public Path resolve(String relative) {
        Path p = root.resolve(relative).normalize();
        if (!p.startsWith(root)) throw new IllegalArgumentException("데이터 폴더 밖 경로: " + relative);
        return p;
    }
}
```
`Files.createDirectories` 는 같은 이름의 파일이 있으면 `FileAlreadyExistsException`(IOException) → IllegalStateException 이 된다 (DataDirTest 세 번째).

`common/PayloadTooLargeException.java`:
```java
package com.kopens.factory3d.common;

public class PayloadTooLargeException extends RuntimeException {
    public PayloadTooLargeException(String message) {
        super(message);
    }
}
```

`common/ApiExceptionHandler.java` 의 `ConflictException` 처리기 아래에 추가:
```java
    @ExceptionHandler(PayloadTooLargeException.class)
    ProblemDetail tooLarge(PayloadTooLargeException e) {
        return problem(HttpStatus.PAYLOAD_TOO_LARGE, "너무 큼", e.getMessage());
    }
```

`application.yml` 의 `factory3d:` 블록 끝에 추가:
```yaml
  drawing:
    max-source-bytes: ${F3D_DRAWING_MAX_SOURCE:52428800} # 원본 DXF 50MB
    max-plan-bytes: ${F3D_DRAWING_MAX_PLAN:20971520}     # 해석 결과 20MB
```

`common/SecurityConfig.java` 에서 `.requestMatchers(HttpMethod.GET, "/api/**").hasRole("VIEWER")` 줄 **바로 위**에 추가:
```java
                        .requestMatchers(HttpMethod.PATCH, "/api/drawings/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.DELETE, "/api/drawings/**").hasRole("ADMIN")
```

- [ ] **Step 4: 도면 매퍼·서비스·컨트롤러 구현**

`drawing/DrawingSummary.java`:
```java
package com.kopens.factory3d.drawing;

import java.time.OffsetDateTime;

/** 도면 select·관리 표에 쓰는 요약. width/height = plan.bounds (m) */
public record DrawingSummary(long id, String name, String sourceType, int version, String createdBy,
        OffsetDateTime updatedAt, Double width, Double height) {}
```

`drawing/DrawingDetail.java`:
```java
package com.kopens.factory3d.drawing;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonRawValue;
import java.time.OffsetDateTime;

/** 도면 상세. plan·layerRules 는 DB 의 JSON 문자열을 그대로 내보냄 */
public record DrawingDetail(long id, String name, String sourceType, int version, String createdBy,
        OffsetDateTime createdAt, OffsetDateTime updatedAt, @JsonRawValue String plan, @JsonRawValue String layerRules,
        @JsonIgnore String sourceFile) {}
```
(Jackson 3 도 어노테이션은 `com.fasterxml.jackson.annotation` 패키지를 그대로 쓴다. 컴파일이 안 되면 3D_WEB 서버에서 `JsonIgnore` 를 어떻게 import 했는지 `grep -rn "annotation.Json" C:/kopens/project/3D_WEB/server/src` 로 확인해 맞춘다.)

`drawing/DrawingMapper.java`:
```java
package com.kopens.factory3d.drawing;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface DrawingMapper {
    List<DrawingSummary> findAll();

    DrawingDetail findById(long id);

    int count();

    boolean existsByName(@Param("name") String name, @Param("excludeId") Long excludeId);

    void insert(DrawingRow row);

    void setSourceFile(@Param("id") long id, @Param("sourceFile") String sourceFile);

    int updatePlan(@Param("id") long id, @Param("version") int version, @Param("plan") String plan,
            @Param("layerRules") String layerRules);

    void rename(@Param("id") long id, @Param("name") String name);

    void delete(long id);

    /** insert 용 (생성된 id 를 돌려받음) */
    final class DrawingRow {
        public Long id;
        public String name;
        public String sourceType;
        public String plan;
        public String layerRules;
        public String createdBy;
    }
}
```

`resources/mapper/DrawingMapper.xml` 전체:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "https://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.kopens.factory3d.drawing.DrawingMapper">

    <resultMap id="summary" type="com.kopens.factory3d.drawing.DrawingSummary">
        <constructor>
            <idArg column="id" javaType="_long"/>
            <arg column="name" javaType="String"/>
            <arg column="source_type" javaType="String"/>
            <arg column="version" javaType="_int"/>
            <arg column="created_by" javaType="String"/>
            <arg column="updated_at" javaType="java.time.OffsetDateTime"/>
            <arg column="width" javaType="Double"/>
            <arg column="height" javaType="Double"/>
        </constructor>
    </resultMap>

    <resultMap id="detail" type="com.kopens.factory3d.drawing.DrawingDetail">
        <constructor>
            <idArg column="id" javaType="_long"/>
            <arg column="name" javaType="String"/>
            <arg column="source_type" javaType="String"/>
            <arg column="version" javaType="_int"/>
            <arg column="created_by" javaType="String"/>
            <arg column="created_at" javaType="java.time.OffsetDateTime"/>
            <arg column="updated_at" javaType="java.time.OffsetDateTime"/>
            <arg column="plan" javaType="String"/>
            <arg column="layer_rules" javaType="String"/>
            <arg column="source_file" javaType="String"/>
        </constructor>
    </resultMap>

    <select id="findAll" resultMap="summary">
        select id, name, source_type, version, created_by, updated_at,
               (plan -> 'bounds' ->> 'w')::float8 as width, (plan -> 'bounds' ->> 'h')::float8 as height
        from drawing order by id
    </select>

    <select id="findById" resultMap="detail">
        select id, name, source_type, version, created_by, created_at, updated_at,
               plan::text as plan, layer_rules::text as layer_rules, source_file
        from drawing where id = #{id}
    </select>

    <select id="count" resultType="_int">select count(*) from drawing</select>

    <select id="existsByName" resultType="_boolean">
        select exists(select 1 from drawing where name = #{name}
            <if test="excludeId != null">and id &lt;&gt; #{excludeId}</if>)
    </select>

    <insert id="insert" useGeneratedKeys="true" keyProperty="id" keyColumn="id">
        insert into drawing (name, source_type, source_file, plan, layer_rules, created_by)
        values (#{name}, #{sourceType}, '', cast(#{plan} as jsonb), cast(#{layerRules} as jsonb),
                #{createdBy,jdbcType=VARCHAR})
    </insert>

    <update id="setSourceFile">
        update drawing set source_file = #{sourceFile} where id = #{id}
    </update>

    <update id="updatePlan">
        update drawing set plan = cast(#{plan} as jsonb), layer_rules = cast(#{layerRules} as jsonb),
               version = version + 1, updated_at = now()
        where id = #{id} and version = #{version}
    </update>

    <update id="rename">
        update drawing set name = #{name}, updated_at = now() where id = #{id}
    </update>

    <delete id="delete">delete from drawing where id = #{id}</delete>
</mapper>
```

`drawing/DrawingService.java`:
```java
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
```
주의: `@Transactional` 메서드 안에서 `UncheckedIOException`(RuntimeException) 이 나면 롤백된다. `ApiExceptionHandler` 의 `Exception` 처리기가 500 으로 바꾼다.

`drawing/DrawingController.java` 전체:
```java
package com.kopens.factory3d.drawing;

import java.io.IOException;
import java.nio.file.Files;
import java.util.List;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import tools.jackson.databind.JsonNode;

/** 도면 (GET 조회 이상, 쓰기 운전원 이상, 이름 변경·삭제 관리자 — SecurityConfig) */
@RestController
@RequestMapping("/api/drawings")
public class DrawingController {
    public record PlanSave(int version, JsonNode plan, JsonNode layerRules) {}

    public record Rename(String name) {}

    private final DrawingService drawings;

    public DrawingController(DrawingService drawings) {
        this.drawings = drawings;
    }

    @GetMapping
    public List<DrawingSummary> list() {
        return drawings.list();
    }

    @GetMapping("/{id}")
    public DrawingDetail get(@PathVariable long id) {
        return drawings.get(id);
    }

    @GetMapping("/{id}/source")
    public ResponseEntity<Resource> source(@PathVariable long id) {
        return ResponseEntity.ok().contentType(MediaType.parseMediaType("application/dxf"))
                .body(new FileSystemResource(drawings.source(id)));
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<DrawingDetail> create(@RequestParam("file") MultipartFile file, @RequestParam("name") String name,
            @RequestParam("plan") String plan, @RequestParam(value = "layerRules", required = false) String layerRules,
            Authentication auth) throws IOException {
        DrawingDetail d = drawings.create(file.getOriginalFilename(), file.getBytes(), name, plan, layerRules, auth.getName());
        return ResponseEntity.status(HttpStatus.CREATED).body(d);
    }

    @PutMapping("/{id}/plan")
    public DrawingDetail savePlan(@PathVariable long id, @RequestBody PlanSave body) {
        return drawings.savePlan(id, body.version(), body.plan(), body.layerRules());
    }

    @PatchMapping("/{id}")
    public DrawingDetail rename(@PathVariable long id, @RequestBody Rename body) {
        return drawings.rename(id, body.name());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable long id) {
        drawings.delete(id);
        return ResponseEntity.noContent().build();
    }
}
```
`Files` import 가 쓰이지 않으면 지운다. `DrawingDetail` 의 `sourceFile` 은 `@JsonIgnore` 라 응답에 안 나간다.

`IntegrationTest` 의 dataDir 은 `factory3d.data-dir` 로 이미 주입되므로 테스트는 `dataDir.resolve("drawings/<id>/source.dxf")` 로 파일을 확인한다.

- [ ] **Step 5: 통과 확인 (전체)**

Run: `cd /c/kopens/project/Factory3D/server && ./gradlew test`
Expected: `BUILD SUCCESSFUL`, 기존 테스트 + DrawingApiTest 7개 + DrawingSizeLimitTest + DataDirTest 3개 통과.

- [ ] **Step 6: Commit**

```bash
cd /c/kopens/project/Factory3D && git add server
git commit -m "feat(server): 도면 저장·조회·plan 저장(버전)·이름변경·삭제 API, 데이터 폴더 확인

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 웹 — DXF 해석기 이식 + 파일 읽기

**Files:**
- Create: `web/src/drawing/dxf/types.ts`, `dxf/parse.ts`, `dxf/flatten.ts`, `dxf/testDxf.ts`, `dxf/dxf.test.ts`
- Create: `web/src/drawing/readDxfFile.ts`, `web/src/drawing/readDxfFile.test.ts`

**Interfaces:**
- Produces (types.ts 의 이름 그대로):
```ts
export type Pt = [number, number]
export interface DxfRecord { type: string; g: [number, string][] }
export interface DxfLayer { color: number; off: boolean }
export interface DxfBlock { name: string; bx: number; by: number; recs: DxfRecord[] }
export interface DxfDoc { header: Record<string, string>; layers: Record<string, DxfLayer>; blocks: Record<string, DxfBlock>; entities: DxfRecord[] }
export interface PolyPrim { kind: 'poly'; layer: string; color: number | null; pts: Pt[]; closed: boolean }
export interface TextPrim { kind: 'text'; layer: string; color: number | null; x: number; y: number; h: number; rot: number; str: string; ha: 0 | 1 | 2; va: 0 | 1 | 2 | 3 }
export interface InsertPrim { kind: 'insert'; layer: string; color: number | null; block: string; x: number; y: number; rot: number }
export type Prim = PolyPrim | TextPrim | InsertPrim
export interface Flattened { prims: Prim[]; stats: Record<string, number>; unsupported: Record<string, number> }
```
- Produces: `parseDxf(text: string): DxfDoc`, `flatten(doc: DxfDoc): Flattened`, `aci(n: number): number`, `INSUNITS: Record<number, [string, number | null]>` (parse.ts 에서 export)
- Produces: `readDxfFile(buf: ArrayBuffer): string` (실패 시 `DxfReadError` throw, `message` 는 한국어), `class DxfReadError extends Error`
- Produces (테스트 도우미): `dxfText(opts: { insunits?: number; layers?: Record<string, number>; blocks?: { name: string; bx?: number; by?: number; ents: Ent[] }[]; ents: Ent[] }): string`, `type Ent = { type: string; g: [number, string | number][] }`

- [ ] **Step 1: 테스트용 DXF 생성기 작성**

`web/src/drawing/dxf/testDxf.ts`:
```ts
/** 테스트용 ASCII DXF 문자열 만들기 (그룹코드/값 줄 쌍) */
export type Ent = { type: string; g: [number, string | number][] }

function rec(type: string, g: [number, string | number][]): string[] {
  return ['0', type, ...g.flatMap(([c, v]) => [String(c), String(v)])]
}

export function dxfText(opts: {
  insunits?: number
  layers?: Record<string, number>
  blocks?: { name: string; bx?: number; by?: number; ents: Ent[] }[]
  ents: Ent[]
}): string {
  const out: string[] = []
  if (opts.insunits !== undefined) out.push('0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', String(opts.insunits), '0', 'ENDSEC')
  out.push('0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER')
  for (const [name, color] of Object.entries(opts.layers ?? {})) out.push(...rec('LAYER', [[2, name], [62, color]]))
  out.push('0', 'ENDTAB', '0', 'ENDSEC')
  out.push('0', 'SECTION', '2', 'BLOCKS')
  for (const b of opts.blocks ?? []) {
    out.push(...rec('BLOCK', [[2, b.name], [10, b.bx ?? 0], [20, b.by ?? 0]]))
    for (const e of b.ents) out.push(...rec(e.type, e.g))
    out.push('0', 'ENDBLK')
  }
  out.push('0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES')
  for (const e of opts.ents) out.push(...rec(e.type, e.g))
  out.push('0', 'ENDSEC', '0', 'EOF')
  return out.join('\n')
}

export const line = (layer: string, x1: number, y1: number, x2: number, y2: number): Ent => ({
  type: 'LINE', g: [[8, layer], [10, x1], [20, y1], [11, x2], [21, y2]],
})
export const rect = (layer: string, x: number, y: number, w: number, h: number): Ent => ({
  type: 'LWPOLYLINE', g: [[8, layer], [90, 4], [70, 1], [10, x], [20, y], [10, x + w], [20, y], [10, x + w], [20, y + h], [10, x], [20, y + h]],
})
export const text = (layer: string, x: number, y: number, h: number, str: string): Ent => ({
  type: 'TEXT', g: [[8, layer], [10, x], [20, y], [40, h], [1, str]],
})
```

- [ ] **Step 2: 해석기 실패 테스트 작성**

`web/src/drawing/dxf/dxf.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { flatten } from './flatten'
import { aci, parseDxf } from './parse'
import { dxfText, line, rect, text } from './testDxf'
import type { InsertPrim, PolyPrim, TextPrim } from './types'

const polys = (t: string) => flatten(parseDxf(t)).prims.filter((p): p is PolyPrim => p.kind === 'poly')

describe('parseDxf', () => {
  it('헤더 단위, 레이어 색·꺼짐, 엔티티', () => {
    const doc = parseDxf(dxfText({ insunits: 4, layers: { WALL: 7, HIDE: -1, RED: 1 }, ents: [line('WALL', 0, 0, 10, 0)] }))
    expect(doc.header.$INSUNITS).toBe('4')
    expect(doc.layers.WALL).toEqual({ color: 0xffffff, off: false })
    expect(doc.layers.HIDE.off).toBe(true)
    expect(doc.layers.RED.color).toBe(0xff0000)
    expect(doc.entities).toHaveLength(1)
    expect(aci(8)).toBe(0x808080)
  })
})

describe('flatten', () => {
  it('LINE 은 2점 열린 선, LWPOLYLINE 닫힘', () => {
    const p = polys(dxfText({ ents: [line('WALL', 0, 0, 10, 0), rect('ZONE', 0, 0, 4, 2)] }))
    expect(p[0]).toMatchObject({ layer: 'WALL', pts: [[0, 0], [10, 0]], closed: false, color: null })
    expect(p[1].closed).toBe(true)
    expect(p[1].pts).toHaveLength(4)
  })

  it('LWPOLYLINE bulge 는 호로 펼침 (반원: 시작·끝 사이에 점이 더 생김)', () => {
    const t = dxfText({ ents: [{ type: 'LWPOLYLINE', g: [[8, 'A'], [90, 2], [70, 0], [10, 0], [20, 0], [42, 1], [10, 10], [20, 0]] }] })
    const p = polys(t)[0]
    expect(p.pts.length).toBeGreaterThan(4)
    expect(p.pts[0]).toEqual([0, 0])
    const last = p.pts[p.pts.length - 1]
    expect(last[0]).toBeCloseTo(10)
    expect(last[1]).toBeCloseTo(0)
    expect(Math.min(...p.pts.map((q) => q[1]))).toBeCloseTo(-5, 0) // 반지름 5 반원 (b=1 → 시계 반대, 아래쪽)
  })

  it('ARC·CIRCLE 은 점 목록', () => {
    const p = polys(dxfText({ ents: [
      { type: 'CIRCLE', g: [[8, 'C'], [10, 0], [20, 0], [40, 2]] },
      { type: 'ARC', g: [[8, 'C'], [10, 0], [20, 0], [40, 2], [50, 0], [51, 90]] },
    ] }))
    expect(p[0].closed).toBe(true)
    expect(Math.hypot(...p[0].pts[5])).toBeCloseTo(2)
    expect(p[1].pts[0][0]).toBeCloseTo(2)
    expect(p[1].pts[p[1].pts.length - 1][1]).toBeCloseTo(2)
  })

  it('INSERT 중첩: 위치·회전·배율 적용, 레이어 0 은 INSERT 레이어 상속, insert 기본도형도 남김', () => {
    const t = dxfText({
      blocks: [
        { name: 'INNER', ents: [line('0', 0, 0, 1, 0)] },
        { name: 'OUTER', ents: [{ type: 'INSERT', g: [[8, '0'], [2, 'INNER'], [10, 1], [20, 0]] }] },
      ],
      ents: [{ type: 'INSERT', g: [[8, 'EQUIP'], [2, 'OUTER'], [10, 100], [20, 50], [41, 2], [42, 2], [50, 90]] }],
    })
    const f = flatten(parseDxf(t))
    const p = f.prims.filter((x): x is PolyPrim => x.kind === 'poly')[0]
    expect(p.layer).toBe('EQUIP')
    expect(p.pts[0][0]).toBeCloseTo(100)
    expect(p.pts[0][1]).toBeCloseTo(52) // (1,0)*2 회전 90° → (0,2)
    expect(p.pts[1][1]).toBeCloseTo(54)
    const ins = f.prims.filter((x): x is InsertPrim => x.kind === 'insert')
    expect(ins[0]).toMatchObject({ block: 'OUTER', layer: 'EQUIP', x: 100, y: 50 })
    expect(ins[0].rot).toBeCloseTo(Math.PI / 2)
  })

  it('TEXT·MTEXT 글자와 정렬, 빈 글자 무시, 지원 안 되는 엔티티 집계', () => {
    const f = flatten(parseDxf(dxfText({ ents: [
      text('STATION', 5, 6, 0.8, 'Hub 조립장'),
      { type: 'MTEXT', g: [[8, 'T'], [10, 1], [20, 2], [40, 1], [71, 5], [1, '{\\fArial;첫줄\\P둘째}']] },
      text('T', 0, 0, 1, '   '),
      { type: 'HATCH', g: [[8, 'H']] },
    ] })))
    const ts = f.prims.filter((x): x is TextPrim => x.kind === 'text')
    expect(ts).toHaveLength(2)
    expect(ts[0]).toMatchObject({ str: 'Hub 조립장', x: 5, y: 6, h: 0.8, ha: 0, va: 0 })
    expect(ts[1]).toMatchObject({ str: '첫줄\n둘째', ha: 1, va: 2 })
    expect(f.unsupported).toEqual({ HATCH: 1 })
    expect(f.stats.TEXT).toBe(2)
  })

  it('도면공간(67=1) 엔티티는 건너뜀', () => {
    expect(polys(dxfText({ ents: [{ type: 'LINE', g: [[8, 'A'], [67, 1], [10, 0], [20, 0], [11, 1], [21, 1]] }] }))).toHaveLength(0)
  })
})
```

Run: `cd /c/kopens/project/Factory3D/web && npx vitest run src/drawing/dxf`
Expected: FAIL — `Failed to resolve import "./flatten"`.

- [ ] **Step 3: 해석기 이식**

`web/src/drawing/dxf/types.ts` — 위 Interfaces 블록의 타입을 그대로 쓴다.

`web/src/drawing/dxf/parse.ts` — `C:\kopens\project\demo\index.html` **460~544행**을 옮긴다: `INSUNITS`, `parseDxf`, `grp`, `aci`, `hsv`, `decodeText`, `stripMText`. 바꿀 점:
- 모두 `export` (단, `hsv` 는 내부). TypeScript 타입: `parseDxf(text: string): DxfDoc`, `grp(rec: DxfRecord): { get(code: number): string | undefined; get(code: number, def: string | number): string; all(code: number): string[] }` — 구현은 `get(code: number, def?: string | number): string | undefined` 하나로 하고 `def` 가 숫자면 `String(def)` 로 돌려준다. 호출부의 `+g.get(..)` 는 그대로 숫자 변환.
- `INSUNITS` 타입 `Record<number, [string, number | null]>`.
- 로직은 바꾸지 않는다 (줄 단위 이식, 세미콜론 없이 프로젝트 스타일).

`web/src/drawing/dxf/flatten.ts` — demo **550~663행**(`I2`, `mul`, `ap`, `arcPts`, `bulgePts`, `flatten`) 을 옮긴다. 바꿀 점:
- `export function flatten(doc: DxfDoc): Flattened`. 행렬 타입 `type M2 = [number, number, number, number, number, number]`.
- `case 'INSERT'` 에서 블록을 펼치기 **전에** INSERT 자체를 기본도형으로 추가한다 (DIMENSION 은 추가 안 함):
```ts
if (r.type === 'INSERT') {
  const [ix, iy] = ap(M, +g.get(10, 0) * ocs, +g.get(20, 0))
  prims.push({ kind: 'insert', layer, color, block: g.get(2) ?? '', x: ix, y: iy, rot: +g.get(50, 0) * Math.PI / 180 + Math.atan2(M[1], M[0]) })
}
```
  (블록이 없어도 insert 기본도형은 남긴다 — 블록 확인 `if (!blk || depth > 8) break;` 는 이 코드 **뒤로** 옮긴다.)
- TEXT/MTEXT 의 `ha`·`va` 는 `as 0 | 1 | 2` / `as 0 | 1 | 2 | 3` 로 단언.

- [ ] **Step 4: 해석기 통과 확인**

Run: `npx vitest run src/drawing/dxf`
Expected: PASS 7개. 실패하면 이식 차이를 demo 원문과 줄 단위로 비교해 고친다(테스트 기대값을 바꾸지 말 것 — 단, bulge 반원 테스트의 아래/위 방향이 반대로 나오면 demo 와 같은 결과인지 확인하고 테스트의 `-5` 를 `5` 로 바꾸며 보고서에 적는다).

- [ ] **Step 5: 파일 읽기 실패 테스트**

`web/src/drawing/readDxfFile.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { DxfReadError, readDxfFile } from './readDxfFile'

const buf = (bytes: number[] | Uint8Array) => new Uint8Array(bytes).buffer

describe('readDxfFile', () => {
  it('UTF-8 은 그대로', () => {
    expect(readDxfFile(new TextEncoder().encode('0\nSECTION\n허브').buffer)).toBe('0\nSECTION\n허브')
  })
  it('UTF-8 이 깨지면 EUC-KR 로 다시 읽음', () => {
    // "허브" EUC-KR = C7 E3 BA EA
    expect(readDxfFile(buf([0x30, 0x0a, 0xc7, 0xe3, 0xba, 0xea]))).toBe('0\n허브')
  })
  it('DWG·바이너리 DXF 는 한국어 안내로 거부', () => {
    expect(() => readDxfFile(new TextEncoder().encode('AC1032xxxx').buffer)).toThrow(DxfReadError)
    expect(() => readDxfFile(new TextEncoder().encode('AC1032xxxx').buffer)).toThrow('DWG 파일은 읽을 수 없습니다. DXF(ASCII) 로 변환해 주세요 (ODA File Converter).')
    expect(() => readDxfFile(new TextEncoder().encode('AutoCAD Binary DXF\r\n').buffer)).toThrow('바이너리 DXF 는 읽을 수 없습니다. DXF(ASCII) 로 저장해 주세요.')
  })
})
```

Run: `npx vitest run src/drawing/readDxfFile`
Expected: FAIL — import 실패.

- [ ] **Step 6: 파일 읽기 구현**

`web/src/drawing/readDxfFile.ts`:
```ts
/** 올린 파일 바이트 → DXF 글자. UTF-8 로 읽고 깨지면 EUC-KR. DWG·바이너리 DXF 는 거부 */
export class DxfReadError extends Error {}

export function readDxfFile(buf: ArrayBuffer): string {
  const head = new TextDecoder('latin1').decode(buf.slice(0, 22))
  if (/^AC10\d\d/.test(head)) throw new DxfReadError('DWG 파일은 읽을 수 없습니다. DXF(ASCII) 로 변환해 주세요 (ODA File Converter).')
  if (head.startsWith('AutoCAD Binary DXF')) throw new DxfReadError('바이너리 DXF 는 읽을 수 없습니다. DXF(ASCII) 로 저장해 주세요.')
  const utf8 = new TextDecoder('utf-8').decode(buf)
  if (!utf8.includes('\uFFFD')) return utf8
  return new TextDecoder('euc-kr').decode(buf)
}
```

Run: `npx vitest run src/drawing`
Expected: PASS 전부.

- [ ] **Step 7: 빌드·린트 후 Commit**

```bash
cd /c/kopens/project/Factory3D/web && npx vitest run && npm run build && ./node_modules/.bin/oxlint
cd .. && git add web/src/drawing
git commit -m "feat(web): DXF 해석기 이식(parse·flatten·INSERT 표기) · 파일 읽기(UTF-8/EUC-KR, DWG 거부)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 웹 — 레이어 규칙 · plan 만들기 · 보정/회전 변환

**Files:**
- Create: `web/src/drawing/plan/types.ts`, `plan/rules.ts`, `plan/geometry.ts`, `plan/buildPlan.ts`, `plan/transform.ts`, `plan/interpret.ts`
- Test: `web/src/drawing/plan/plan.test.ts`, `plan/transform.test.ts`

**Interfaces:**
- Consumes: Task 2 의 `parseDxf`, `flatten`, `INSUNITS`, 타입들, `dxfText`/`line`/`rect`/`text`.
- Produces (`plan/types.ts`, 이 이름 그대로):
```ts
import type { Pt } from '../dxf/types'
export type { Pt }
export type Role = 'wall' | 'partition' | 'column' | 'zone' | 'object' | 'line'
export type UnitName = 'inch' | 'feet' | 'mm' | 'cm' | 'm'
export interface LayerRule { role: Role; height?: number; thickness?: number }
export type LayerRules = Record<string, LayerRule>
export interface PlanLayer { name: string; color: string; count: number; role: Role; height: number; thickness: number; visible: boolean }
export interface PlanLine { layer: string; pts: Pt[]; closed: boolean; color: string | null }
export interface PlanText { layer: string; x: number; y: number; h: number; rot: number; str: string; ha: 0 | 1 | 2; va: 0 | 1 | 2 | 3; color: string | null }
export interface WallSeg { id: string; pts: Pt[]; h: number; t: number }
export interface Column { id: string; x: number; y: number; w: number; d: number; h: number }
export interface Zone { id: string; name: string; poly: Pt[]; color: string; stationId: string | null }
export interface ObjectHint { id: string; label: string; x: number; y: number; rot: number }
export interface Plan {
  format: 1; unit: UnitName; scale: number; rotQ: 0 | 1 | 2 | 3; flip: 1 | -1
  bounds: { w: number; h: number }
  layers: PlanLayer[]; lines: PlanLine[]; texts: PlanText[]
  walls: WallSeg[]; partitions: WallSeg[]; columns: Column[]; zones: Zone[]; objectHints: ObjectHint[]
  warnings: { unsupported: Record<string, number>; unitGuessed: boolean }
}
```
- Produces: `defaultRule(layerName: string): Required<LayerRule>`, `ruleFor(layerName: string, rules: LayerRules): Required<LayerRule>` (rules.ts)
- Produces: `buildPlan(doc: DxfDoc, flat: Flattened, opts?: { rules?: LayerRules; unit?: UnitName }): Plan` (buildPlan.ts)
- Produces: `calibrate(plan: Plan, measured: number, actual: number): Plan`, `rotate(plan: Plan): Plan`, `flipPlan(plan: Plan): Plan` (transform.ts)
- Produces: `interpretDxf(text: string, opts?: { rules?: LayerRules; unit?: UnitName }): Plan`, `reinterpretDxf(text: string, rules: LayerRules, old: Plan): Plan` (interpret.ts) — 재해석은 old 의 `unit`·보정 배율·`rotQ`·`flip` 유지.
- Produces: `pointInPolygon(p: Pt, poly: Pt[]): boolean`, `polygonArea(poly: Pt[]): number` (geometry.ts)

- [ ] **Step 1: 실패 테스트 작성**

`web/src/drawing/plan/plan.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { dxfText, line, rect, text } from '../dxf/testDxf'
import { interpretDxf, reinterpretDxf } from './interpret'
import { defaultRule, ruleFor } from './rules'

describe('레이어 규칙', () => {
  it('기본 규칙: 가벽을 벽보다 먼저 봄', () => {
    expect(defaultRule('PARTITION')).toEqual({ role: 'partition', height: 1.2, thickness: 0.5 })
    expect(defaultRule('벽체_칸막이')).toEqual({ role: 'partition', height: 1.2, thickness: 0.5 })
    expect(defaultRule('A-WALL')).toEqual({ role: 'wall', height: 8, thickness: 0.2 })
    expect(defaultRule('COLUMN')).toEqual({ role: 'column', height: 9.5, thickness: 0 })
    expect(defaultRule('STATION')).toEqual({ role: 'zone', height: 0, thickness: 0 })
    expect(defaultRule('EQUIP')).toEqual({ role: 'object', height: 0, thickness: 0 })
    expect(defaultRule('FORK_PATH')).toEqual({ role: 'line', height: 0, thickness: 0 })
  })
  it('덮어쓰기는 빠진 칸을 그 역할의 기본값으로 채움', () => {
    expect(ruleFor('외곽선', { 외곽선: { role: 'wall' } })).toEqual({ role: 'wall', height: 8, thickness: 0.2 })
    expect(ruleFor('외곽선', { 외곽선: { role: 'wall', height: 5 } })).toEqual({ role: 'wall', height: 5, thickness: 0.2 })
  })
})

const factory = dxfText({
  insunits: 4,
  layers: { WALL: 7, PARTITION: 254, COLUMN: 8, STATION: 1, EQUIP: 3 },
  ents: [
    line('WALL', 0, 0, 20000, 0),
    rect('PARTITION', 2000, 2000, 3000, 1000),
    rect('COLUMN', 10000, 0, 600, 600),
    rect('STATION', 1000, 3000, 4000, 3000),
    text('STATION', 2000, 4000, 800, 'Hub 조립장'),
    text('STATION', 2000, 5000, 300, '작은글자'),
    rect('STATION', 15000, 3000, 500, 500), // 0.25㎡ → 구역 아님
    text('EQUIP', 3000, 4500, 300, 'HUB'),
    line('FORK_PATH', 0, 8000, 20000, 8000),
  ],
})

describe('buildPlan', () => {
  const p = interpretDxf(factory)

  it('단위·원점·크기 (mm → m, 원점 = bbox 최소점)', () => {
    expect(p.format).toBe(1)
    expect(p.unit).toBe('mm')
    expect(p.scale).toBe(0.001)
    expect(p.warnings.unitGuessed).toBe(false)
    expect(p.bounds).toEqual({ w: 20, h: 8 })
    expect(p.rotQ).toBe(0)
    expect(p.flip).toBe(1)
  })

  it('레이어 목록과 역할', () => {
    const byName = Object.fromEntries(p.layers.map((l) => [l.name, l]))
    expect(byName.PARTITION).toMatchObject({ role: 'partition', height: 1.2, thickness: 0.5, visible: true })
    expect(byName.WALL.color).toBe('#ffffff')
    expect(byName.FORK_PATH.role).toBe('line')
    expect(byName.STATION.count).toBe(4)
  })

  it('외벽·가벽(닫힌 사각형은 첫 점 반복)·기둥', () => {
    expect(p.walls).toEqual([{ id: 'w1', pts: [[0, 0], [20, 0]], h: 8, t: 0.2 }])
    expect(p.partitions[0]).toMatchObject({ id: 'p1', h: 1.2, t: 0.5 })
    expect(p.partitions[0].pts).toEqual([[2, 2], [5, 2], [5, 3], [2, 3], [2, 2]])
    expect(p.columns).toEqual([{ id: 'c1', x: 10.3, y: 0.3, w: 0.6, d: 0.6, h: 9.5 }])
  })

  it('구역: 안의 가장 큰 글자를 이름으로, 1㎡ 미만 무시', () => {
    expect(p.zones).toHaveLength(1)
    expect(p.zones[0]).toMatchObject({ id: 'z1', name: 'Hub 조립장', color: '#ff0000', stationId: null })
    expect(p.zones[0].poly).toHaveLength(4)
  })

  it('객체 표기 · 모든 선과 글자는 바닥 그림으로', () => {
    expect(p.objectHints).toEqual([{ id: 'h1', label: 'HUB', x: 3, y: 4.5, rot: 0 }])
    expect(p.lines).toHaveLength(6)
    expect(p.texts.map((t) => t.str)).toContain('Hub 조립장')
    expect(p.texts.find((t) => t.str === 'Hub 조립장')!.h).toBeCloseTo(0.8)
  })

  it('단위가 없으면 크기로 추정하고 표시, 직접 지정 가능', () => {
    const noUnit = dxfText({ ents: [line('WALL', 0, 0, 5000, 0)] })
    const g = interpretDxf(noUnit)
    expect(g.unit).toBe('mm')
    expect(g.warnings.unitGuessed).toBe(true)
    expect(g.bounds.w).toBeCloseTo(5)
    const m = interpretDxf(noUnit, { unit: 'cm' })
    expect(m.unit).toBe('cm')
    expect(m.bounds.w).toBeCloseTo(50)
    expect(interpretDxf(dxfText({ ents: [line('WALL', 0, 0, 50, 0)] })).unit).toBe('m')
  })

  it('규칙 덮어쓰기로 다시 해석해도 보정 배율·회전·반전 유지', () => {
    const old = { ...p, scale: 0.002, bounds: { w: 40, h: 16 }, rotQ: 1 as const, flip: -1 as const }
    const r = reinterpretDxf(factory, { WALL: { role: 'partition' } }, old)
    expect(r.walls).toHaveLength(0)
    expect(r.partitions).toHaveLength(2)
    expect(r.scale).toBeCloseTo(0.002)
    expect(r.bounds.w).toBeCloseTo(40)
    expect(r.rotQ).toBe(1)
    expect(r.flip).toBe(-1)
  })
})
```

`web/src/drawing/plan/transform.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { dxfText, line, rect, text } from '../dxf/testDxf'
import { interpretDxf } from './interpret'
import { calibrate, flipPlan, rotate } from './transform'

const base = interpretDxf(dxfText({ insunits: 4, ents: [
  line('WALL', 0, 0, 10000, 0), rect('PARTITION', 0, 0, 2000, 1000), rect('COLUMN', 5000, 0, 600, 600),
  rect('STATION', 0, 2000, 4000, 2000), text('STATION', 1000, 3000, 500, 'A'), text('EQUIP', 1000, 1000, 300, 'HUB'),
] }))

describe('보정·회전·반전', () => {
  it('보정: 좌표·크기·글자 높이를 k 배, 벽 높이·두께는 그대로, scale *= k', () => {
    const c = calibrate(base, 5, 10)
    expect(c.scale).toBeCloseTo(0.002)
    expect(c.bounds.w).toBeCloseTo(base.bounds.w * 2)
    expect(c.walls[0].pts[1][0]).toBeCloseTo(20)
    expect(c.walls[0].h).toBe(8)
    expect(c.partitions[0].t).toBe(0.5)
    expect(c.columns[0]).toMatchObject({ w: 1.2, d: 1.2, h: 9.5 })
    expect(c.columns[0].x).toBeCloseTo(base.columns[0].x * 2)
    expect(c.zones[0].poly[2][1]).toBeCloseTo(base.zones[0].poly[2][1] * 2)
    expect(c.texts[0].h).toBeCloseTo(base.texts[0].h * 2)
    expect(c.objectHints[0].x).toBeCloseTo(base.objectHints[0].x * 2)
    expect(c.lines[0].pts[1][0]).toBeCloseTo(20)
    expect(base.scale).toBe(0.001) // 원본은 그대로
  })
  it('보정 입력이 0 이하면 오류', () => {
    expect(() => calibrate(base, 0, 10)).toThrow('거리는 0보다 커야 합니다.')
    expect(() => calibrate(base, 5, -1)).toThrow('거리는 0보다 커야 합니다.')
  })
  it('회전은 90° 단위로 돌고, 반전은 1 ↔ -1', () => {
    expect(rotate(base).rotQ).toBe(1)
    expect(rotate(rotate(rotate(rotate(base)))).rotQ).toBe(0)
    expect(flipPlan(base).flip).toBe(-1)
    expect(flipPlan(flipPlan(base)).flip).toBe(1)
  })
})
```

Run: `cd /c/kopens/project/Factory3D/web && npx vitest run src/drawing/plan`
Expected: FAIL — import 실패.

- [ ] **Step 2: 타입·규칙·기하 구현**

`plan/types.ts` — Interfaces 블록 그대로.

`plan/rules.ts`:
```ts
import type { LayerRule, LayerRules, Role } from './types'

const DEFAULTS: Record<Role, { height: number; thickness: number }> = {
  wall: { height: 8, thickness: 0.2 },
  partition: { height: 1.2, thickness: 0.5 },
  column: { height: 9.5, thickness: 0 },
  zone: { height: 0, thickness: 0 },
  object: { height: 0, thickness: 0 },
  line: { height: 0, thickness: 0 },
}

// 위에서부터 첫 일치 (가벽을 벽보다 먼저)
const PATTERNS: [RegExp, Role][] = [
  [/PARTITION|칸막이|가벽/, 'partition'],
  [/WALL|벽/, 'wall'],
  [/^COL|COLUMN|기둥/, 'column'],
  [/STATION|ZONE|구역|공정/, 'zone'],
  [/EQUIP|설비|OBJECT/, 'object'],
]

export function defaultRule(layerName: string): Required<LayerRule> {
  const n = layerName.toUpperCase()
  const role = PATTERNS.find(([re]) => re.test(n))?.[1] ?? 'line'
  return { role, ...DEFAULTS[role] }
}

/** 도면별 덮어쓰기 → 없으면 기본 규칙. 빠진 높이·두께는 그 역할의 기본값 */
export function ruleFor(layerName: string, rules: LayerRules): Required<LayerRule> {
  const r = rules[layerName]
  if (!r) return defaultRule(layerName)
  return { role: r.role, height: r.height ?? DEFAULTS[r.role].height, thickness: r.thickness ?? DEFAULTS[r.role].thickness }
}
```

`plan/geometry.ts`:
```ts
import type { Pt } from './types'

export function pointInPolygon([x, y]: Pt, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export function polygonArea(poly: Pt[]): number {
  let s = 0
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) s += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1])
  return Math.abs(s / 2)
}
```

- [ ] **Step 3: plan 만들기 구현**

`plan/buildPlan.ts`:
```ts
import { INSUNITS } from '../dxf/parse'
import type { DxfDoc, Flattened, PolyPrim, Pt, TextPrim } from '../dxf/types'
import { pointInPolygon, polygonArea } from './geometry'
import { ruleFor } from './rules'
import type { LayerRules, Plan, PlanLayer, UnitName } from './types'

const UNIT_SCALE: Record<UnitName, number> = { inch: 0.0254, feet: 0.3048, mm: 0.001, cm: 0.01, m: 1 }
const CODE_UNIT: Record<number, UnitName> = { 1: 'inch', 2: 'feet', 4: 'mm', 5: 'cm', 6: 'm' }
const r4 = (v: number) => Math.round(v * 1e4) / 1e4
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0')

/** DXF 해석 결과 + 레이어 규칙 → plan (좌표 m, 원점 = bbox 최소점) */
export function buildPlan(doc: DxfDoc, flat: Flattened, opts: { rules?: LayerRules; unit?: UnitName } = {}): Plan {
  const rules = opts.rules ?? {}
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const p of flat.prims)
    for (const [x, y] of p.kind === 'poly' ? p.pts : [[p.x, p.y] as Pt]) {
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  if (!Number.isFinite(x0)) { x0 = y0 = x1 = y1 = 0 }

  const code = Number(doc.header.$INSUNITS ?? 0)
  const known = CODE_UNIT[code] && INSUNITS[code]?.[1] != null ? CODE_UNIT[code] : null
  const unit: UnitName = opts.unit ?? known ?? (Math.max(x1 - x0, y1 - y0) > 2000 ? 'mm' : 'm')
  const s = UNIT_SCALE[unit]
  const P = ([x, y]: Pt): Pt => [r4((x - x0) * s), r4((y - y0) * s)]

  const byLayer = new Map<string, number>()
  for (const p of flat.prims) byLayer.set(p.layer, (byLayer.get(p.layer) ?? 0) + 1)
  const layers: PlanLayer[] = [...byLayer].map(([name, count]) => {
    const r = ruleFor(name, rules)
    return { name, color: hex(doc.layers[name]?.color ?? 0xffffff), count, role: r.role, height: r.height, thickness: r.thickness, visible: !doc.layers[name]?.off }
  })
  const L = new Map(layers.map((l) => [l.name, l]))
  const colorOf = (c: number | null) => (c == null ? null : hex(c))

  const polys = flat.prims.filter((p): p is PolyPrim => p.kind === 'poly')
  const texts = flat.prims.filter((p): p is TextPrim => p.kind === 'text')
  const plan: Plan = {
    format: 1, unit, scale: s, rotQ: 0, flip: 1,
    bounds: { w: r4((x1 - x0) * s), h: r4((y1 - y0) * s) },
    layers,
    lines: polys.map((p) => ({ layer: p.layer, pts: p.pts.map(P), closed: p.closed, color: colorOf(p.color) })),
    texts: texts.map((t) => {
      const [x, y] = P([t.x, t.y])
      return { layer: t.layer, x, y, h: r4(t.h * s), rot: t.rot, str: t.str, ha: t.ha, va: t.va, color: colorOf(t.color) }
    }),
    walls: [], partitions: [], columns: [], zones: [], objectHints: [],
    warnings: { unsupported: { ...flat.unsupported }, unitGuessed: !opts.unit && !known },
  }

  for (const p of polys) {
    const l = L.get(p.layer)!
    const pts = p.pts.map(P)
    if (l.role === 'wall' || l.role === 'partition') {
      const seq = p.closed ? [...pts, pts[0]] : pts
      if (seq.length < 2) continue
      const list = l.role === 'wall' ? plan.walls : plan.partitions
      list.push({ id: `${l.role === 'wall' ? 'w' : 'p'}${list.length + 1}`, pts: seq, h: l.height, t: l.thickness })
    } else if (l.role === 'column' && p.closed && pts.length >= 3) {
      const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1])
      const [ax, bx, ay, by] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
      plan.columns.push({ id: `c${plan.columns.length + 1}`, x: r4((ax + bx) / 2), y: r4((ay + by) / 2), w: r4(bx - ax), d: r4(by - ay), h: l.height })
    } else if (l.role === 'zone' && p.closed && pts.length >= 3 && polygonArea(pts) >= 1) {
      const inside = plan.texts.filter((t) => t.str.trim() && pointInPolygon([t.x, t.y], pts))
      const same = inside.filter((t) => t.layer === p.layer)
      const pick = (same.length ? same : inside).sort((a, b) => b.h - a.h)[0]
      plan.zones.push({ id: `z${plan.zones.length + 1}`, name: pick?.str.trim() ?? `구역 ${plan.zones.length + 1}`, poly: pts, color: colorOf(p.color) ?? l.color, stationId: null })
    }
  }
  for (const pr of flat.prims) {
    const l = L.get(pr.layer)!
    if (l.role !== 'object' || pr.kind === 'poly') continue
    const [x, y] = P([pr.x, pr.y])
    const label = pr.kind === 'text' ? pr.str.trim() : pr.block
    if (label) plan.objectHints.push({ id: `h${plan.objectHints.length + 1}`, label, x, y, rot: pr.rot })
  }
  return plan
}
```
(구역 글자 높이는 글자가 구역 안이어야 하므로 `plan.texts` 의 m 좌표로 판정. 첫 테스트의 텍스트 'Hub 조립장'(0.8m) 이 '작은글자'(0.3m) 보다 커서 선택된다.)

- [ ] **Step 4: 변환·해석 진입점 구현**

`plan/transform.ts`:
```ts
import type { Plan, Pt } from './types'

const r4 = (v: number) => Math.round(v * 1e4) / 1e4

/** 두 점 보정: 측정 거리(m) 가 실제 거리(m) 가 되도록 모든 좌표·크기를 k 배 (벽 높이·두께는 그대로) */
export function calibrate(plan: Plan, measured: number, actual: number): Plan {
  if (!(measured > 0) || !(actual > 0)) throw new Error('거리는 0보다 커야 합니다.')
  const k = actual / measured
  const P = ([x, y]: Pt): Pt => [r4(x * k), r4(y * k)]
  return {
    ...plan,
    scale: plan.scale * k,
    bounds: { w: r4(plan.bounds.w * k), h: r4(plan.bounds.h * k) },
    lines: plan.lines.map((l) => ({ ...l, pts: l.pts.map(P) })),
    texts: plan.texts.map((t) => ({ ...t, x: r4(t.x * k), y: r4(t.y * k), h: r4(t.h * k) })),
    walls: plan.walls.map((w) => ({ ...w, pts: w.pts.map(P) })),
    partitions: plan.partitions.map((w) => ({ ...w, pts: w.pts.map(P) })),
    columns: plan.columns.map((c) => ({ ...c, x: r4(c.x * k), y: r4(c.y * k), w: r4(c.w * k), d: r4(c.d * k) })),
    zones: plan.zones.map((z) => ({ ...z, poly: z.poly.map(P) })),
    objectHints: plan.objectHints.map((h) => ({ ...h, x: r4(h.x * k), y: r4(h.y * k) })),
  }
}

export function rotate(plan: Plan): Plan {
  return { ...plan, rotQ: ((plan.rotQ + 1) % 4) as Plan['rotQ'] }
}

export function flipPlan(plan: Plan): Plan {
  return { ...plan, flip: plan.flip === 1 ? -1 : 1 }
}
```

`plan/interpret.ts`:
```ts
import { flatten } from '../dxf/flatten'
import { parseDxf } from '../dxf/parse'
import { buildPlan } from './buildPlan'
import { calibrate } from './transform'
import type { LayerRules, Plan, UnitName } from './types'

/** DXF 글자 → plan */
export function interpretDxf(text: string, opts: { rules?: LayerRules; unit?: UnitName } = {}): Plan {
  const doc = parseDxf(text)
  return buildPlan(doc, flatten(doc), opts)
}

/** 규칙을 바꿔 다시 해석: 예전 plan 의 단위·보정 배율·회전·반전 유지 */
export function reinterpretDxf(text: string, rules: LayerRules, old: Plan): Plan {
  const fresh = interpretDxf(text, { rules, unit: old.unit })
  const k = old.scale / fresh.scale
  const scaled = Math.abs(k - 1) > 1e-9 ? calibrate(fresh, 1, k) : fresh
  return { ...scaled, rotQ: old.rotQ, flip: old.flip }
}
```

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run src/drawing`
Expected: PASS 전부 (plan 7개 + transform 3개 + Task 2 것).

- [ ] **Step 6: 빌드·린트 후 Commit**

```bash
cd /c/kopens/project/Factory3D/web && npx vitest run && npm run build && ./node_modules/.bin/oxlint
cd .. && git add web/src/drawing/plan
git commit -m "feat(web): 레이어 규칙 · plan 만들기(벽·가벽·기둥·구역·표기) · 보정/회전/반전 · 재해석

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 기본 도면(나셀 공장) — 시드 plan 만들기 + 서버 자동 등록

**Files:**
- Create: `server/src/main/resources/seed/main_factory.dxf` (demo 에서 복사), `server/src/main/resources/seed/main_factory.plan.json` (생성)
- Create: `web/src/drawing/seedPlan.test.ts`
- Modify: `web/package.json` (스크립트 `seed:plan`)
- Create: `server/src/main/java/com/kopens/factory3d/drawing/DrawingSeeder.java`
- Test: `server/src/test/java/com/kopens/factory3d/drawing/DrawingSeederTest.java`

**Interfaces:**
- Consumes: `interpretDxf` (Task 3), `readDxfFile` (Task 2), `DrawingService.createSeed(name, bytes, planJson)` · `DrawingMapper.count()` (Task 1).
- Produces: 서버가 시작할 때 도면 0개면 "나셀 공장" 등록 (`created_by='system'`, 감사 `DRAWING_SEED`). `DrawingSeeder.seedIfEmpty(): boolean`.

- [ ] **Step 1: DXF 복사, 시드 비교 테스트 작성**

```bash
cd /c/kopens/project/Factory3D && mkdir -p server/src/main/resources/seed
cp ../demo/drawings/main_factory/main_factory.dxf server/src/main/resources/seed/main_factory.dxf
```

`web/src/drawing/seedPlan.test.ts`:
```ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { interpretDxf } from './plan/interpret'
import { readDxfFile } from './readDxfFile'

const SEED = resolve(__dirname, '../../../server/src/main/resources/seed')
const DXF = resolve(SEED, 'main_factory.dxf')
const JSON_PATH = resolve(SEED, 'main_factory.plan.json')

/** 서버에 넣은 기본 도면 plan 이 지금 해석기 결과와 같은지. 해석기를 바꿨으면 `npm run seed:plan` 으로 다시 만든다 */
describe('기본 도면(나셀 공장) plan', () => {
  const buf = readFileSync(DXF)
  const plan = interpretDxf(readDxfFile(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)))

  it('해석 결과가 공장 모양 (가벽·구역이 있음)', () => {
    expect(plan.unit).toBe('mm')
    expect(plan.bounds.w).toBeGreaterThan(150)
    expect(plan.bounds.w).toBeLessThan(200)
    expect(plan.walls.length).toBeGreaterThan(0)
    expect(plan.partitions.length).toBeGreaterThan(0)
    expect(plan.partitions.every((p) => p.h === 1.2 && p.t === 0.5)).toBe(true)
    expect(plan.zones.length).toBeGreaterThan(0)
    expect(plan.columns.length).toBeGreaterThan(0)
  })

  it('저장소의 main_factory.plan.json 과 같음', () => {
    const text = JSON.stringify(plan)
    if (process.env.UPDATE_SEED === '1' || !existsSync(JSON_PATH)) writeFileSync(JSON_PATH, text)
    expect(JSON.parse(readFileSync(JSON_PATH, 'utf8'))).toEqual(plan)
  })
})
```
`web/package.json` 의 `scripts` 에 추가:
```json
    "seed:plan": "node -e \"process.env.UPDATE_SEED='1'; require('child_process').execSync('npx vitest run src/drawing/seedPlan.test.ts', {stdio:'inherit', env: process.env})\""
```

- [ ] **Step 2: 시드 plan 생성·확인**

Run: `cd /c/kopens/project/Factory3D/web && npm run seed:plan && npx vitest run src/drawing/seedPlan.test.ts`
Expected: 두 번 다 PASS, `server/src/main/resources/seed/main_factory.plan.json` 생성. 첫 테스트가 실패하면(예: 가벽 0개) 원인을 `make_dxf.py`(`C:\kopens\project\demo\drawings\main_factory\make_dxf.py`) 의 레이어 이름과 Task 3 규칙을 비교해 보고서에 적고 BLOCKED 로 보고한다 (규칙을 임의로 바꾸지 말 것).

- [ ] **Step 3: 서버 시드 실패 테스트**

`server/src/test/java/com/kopens/factory3d/drawing/DrawingSeederTest.java`:
```java
package com.kopens.factory3d.drawing;

import static org.assertj.core.api.Assertions.assertThat;

import com.kopens.factory3d.support.IntegrationTest;
import java.nio.file.Files;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class DrawingSeederTest extends IntegrationTest {
    @Autowired DrawingSeeder seeder;

    @Test
    void 도면이_없을_때만_나셀_공장을_넣음() throws Exception {
        assertThat(seeder.seedIfEmpty()).isTrue();
        assertThat(seeder.seedIfEmpty()).isFalse();
        var rows = jdbc.queryForList("select id, name, created_by, source_file, (plan -> 'bounds' ->> 'w')::float8 as w from drawing");
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).get("name")).isEqualTo("나셀 공장");
        assertThat(rows.get(0).get("created_by")).isEqualTo("system");
        assertThat((Double) rows.get(0).get("w")).isGreaterThan(150);
        assertThat(Files.size(dataDir.resolve((String) rows.get(0).get("source_file")))).isGreaterThan(10_000);
        assertThat(jdbc.queryForObject("select count(*) from audit_log where action = 'DRAWING_SEED'", Integer.class)).isEqualTo(1);
    }
}
```

Run: `cd ../server && ./gradlew test --tests "*DrawingSeederTest"`
Expected: FAIL — `DrawingSeeder` 없음.

- [ ] **Step 4: 시드 구현**

`drawing/DrawingSeeder.java`:
```java
package com.kopens.factory3d.drawing;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/** 첫 실행 기본 도면: 도면이 하나도 없으면 demo 의 나셀 공장 배치(main_factory.dxf)를 넣음 */
@Component
public class DrawingSeeder implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(DrawingSeeder.class);
    private final DrawingMapper drawings;
    private final DrawingService service;

    public DrawingSeeder(DrawingMapper drawings, DrawingService service) {
        this.drawings = drawings;
        this.service = service;
    }

    @Override
    public void run(ApplicationArguments args) throws IOException {
        seedIfEmpty();
    }

    public boolean seedIfEmpty() throws IOException {
        if (drawings.count() > 0) return false;
        byte[] dxf = read("seed/main_factory.dxf");
        String plan = new String(read("seed/main_factory.plan.json"), StandardCharsets.UTF_8);
        service.createSeed("나셀 공장", dxf, plan);
        log.info("기본 도면 '나셀 공장' 을 넣었습니다");
        return true;
    }

    private static byte[] read(String path) throws IOException {
        try (InputStream in = new ClassPathResource(path).getInputStream()) {
            return in.readAllBytes();
        }
    }
}
```
주의: 서버가 시작할 때(테스트 포함) 이 러너가 시드를 넣지만, `IntegrationTest` 가 매 테스트 전에 모든 표를 비우므로 다른 테스트에는 영향이 없다. plan JSON 이 `factory3d.drawing.max-plan-bytes` 보다 크면 `DrawingSizeLimitTest` 컨텍스트 시작이 실패하므로, `run()` 은 예외를 잡아 경고 로그만 남긴다:
```java
    @Override
    public void run(ApplicationArguments args) {
        try {
            seedIfEmpty();
        } catch (Exception e) {
            log.warn("기본 도면을 넣지 못했습니다: {}", e.getMessage());
        }
    }
```
(위 `run` 을 이 버전으로 쓴다.)

- [ ] **Step 5: 통과 확인 (서버 전체)**

Run: `./gradlew test`
Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 6: Commit**

```bash
cd /c/kopens/project/Factory3D && git add server/src/main/resources/seed server/src/main/java server/src/test web/src/drawing/seedPlan.test.ts web/package.json
git commit -m "feat: 기본 도면(나셀 공장) — 시드 plan 생성·검증, 서버 첫 실행 자동 등록

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 3D 엔진 — plan → 메쉬, FactoryScene

**Files:**
- Modify: `web/package.json` (`three@0.186.1`, `@types/three@0.186.0`)
- Create: `web/src/scene/coords.ts`, `coords.test.ts`, `textures.ts`, `materials.ts`, `labels.ts`, `planToMeshes.ts`, `planToMeshes.test.ts`, `navigation.ts`, `FactoryScene.ts`

**Interfaces:**
- Consumes: `Plan`, `Pt` (Task 3).
- Produces (coords.ts): `planToLocal(x: number, y: number, b: {w:number;h:number}): [number, number]` → `[x - w/2, -(y - h/2)]` (three 의 x, z); `localToPlan(lx: number, lz: number, b): Pt`.
- Produces (materials.ts): `interface Materials { ground3d; groundPlan; panel; drywall; plinth; steel }` (모두 `THREE.MeshStandardMaterial`), `createMaterials(tex?: Textures): Materials`.
- Produces (textures.ts): `interface Textures { concrete: THREE.Texture; panel: THREE.Texture }`, `createTextures(): Textures` (canvas 필요 — 브라우저 전용).
- Produces (planToMeshes.ts): `interface PlanMeshes { group: THREE.Group; lineMats: THREE.LineBasicMaterial[]; labelMats: THREE.MeshBasicMaterial[]; verts: Pt[] }`, `planToMeshes(plan: Plan, mats: Materials, opts: { labels: boolean }): PlanMeshes`. `group` 의 자식 이름: `'lines'`, `'labels'`, `'zones'`, `'solids'`.
- Produces (FactoryScene.ts):
```ts
export type ViewMode = '3d' | 'plan'
export type Quality = 'high' | 'low'
export interface GroundPick { x: number; y: number }   // plan 좌표(m)
export interface PickSource { setGroundClick(cb: ((p: GroundPick) => void) | null): void; setMarkers(pts: Pt[]): void }
export class FactoryScene implements PickSource {
  constructor(container: HTMLElement)
  setPlan(plan: Plan | null): void
  setView(mode: ViewMode): void
  setQuality(q: Quality): void
  setGroundClick(cb: ((p: GroundPick) => void) | null): void
  setMarkers(pts: Pt[]): void
  dispose(): void
}
```

- [ ] **Step 1: three 설치**

```bash
cd /c/kopens/project/Factory3D/web && npm install three@0.186.1 && npm install -D @types/three@0.186.0
```
`package.json` 의 버전이 `^` 없이 정확히 `0.186.1` / `0.186.0` 인지 확인하고, `^` 가 붙었으면 지운다.

- [ ] **Step 2: 좌표 변환 실패 테스트**

`web/src/scene/coords.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { localToPlan, planToLocal } from './coords'

describe('plan ↔ 3D 로컬 좌표', () => {
  const b = { w: 10, h: 4 }
  it('가운데가 원점, plan y 는 -z', () => {
    expect(planToLocal(0, 0, b)).toEqual([-5, 2])
    expect(planToLocal(10, 4, b)).toEqual([5, -2])
    expect(planToLocal(5, 2, b)).toEqual([0, -0])
  })
  it('되돌리기', () => {
    expect(localToPlan(-5, 2, b)).toEqual([0, 0])
    expect(localToPlan(1.5, -0.5, b)).toEqual([6.5, 2.5])
  })
})
```

Run: `npx vitest run src/scene/coords`
Expected: FAIL.

`web/src/scene/coords.ts`:
```ts
import type { Pt } from '../drawing/plan/types'

/** plan(m, 원점 = 왼쪽 아래) → three 로컬 (x, z). 도면 가운데가 원점, plan y 위쪽 = -z */
export function planToLocal(x: number, y: number, b: { w: number; h: number }): [number, number] {
  return [x - b.w / 2, -(y - b.h / 2)]
}

export function localToPlan(lx: number, lz: number, b: { w: number; h: number }): Pt {
  return [lx + b.w / 2, -lz + b.h / 2]
}
```

Run: `npx vitest run src/scene/coords` → PASS.

- [ ] **Step 3: 메쉬 변환 실패 테스트**

`web/src/scene/planToMeshes.test.ts`:
```ts
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import type { Plan } from '../drawing/plan/types'
import { createMaterials } from './materials'
import { planToMeshes } from './planToMeshes'

const plan: Plan = {
  format: 1, unit: 'm', scale: 1, rotQ: 0, flip: 1, bounds: { w: 10, h: 4 },
  layers: [
    { name: 'WALL', color: '#ffffff', count: 1, role: 'wall', height: 8, thickness: 0.2, visible: true },
    { name: 'FORK', color: '#ff00ff', count: 1, role: 'line', height: 0, thickness: 0, visible: true },
    { name: 'OFF', color: '#00ff00', count: 1, role: 'line', height: 0, thickness: 0, visible: false },
  ],
  lines: [
    { layer: 'WALL', pts: [[0, 0], [10, 0], [10, 4]], closed: false, color: null },
    { layer: 'FORK', pts: [[0, 2], [10, 2]], closed: false, color: null },
    { layer: 'OFF', pts: [[0, 3], [10, 3]], closed: false, color: null },
  ],
  texts: [{ layer: 'FORK', x: 1, y: 1, h: 0.5, rot: 0, str: 'A', ha: 0, va: 0, color: null }],
  walls: [{ id: 'w1', pts: [[0, 0], [10, 0], [10, 4]], h: 8, t: 0.2 }],
  partitions: [{ id: 'p1', pts: [[2, 1], [2, 3]], h: 1.2, t: 0.5 }],
  columns: [{ id: 'c1', x: 5, y: 2, w: 0.6, d: 0.6, h: 9.5 }],
  zones: [{ id: 'z1', name: 'Hub', poly: [[1, 1], [3, 1], [3, 3], [1, 3]], color: '#ff0000', stationId: null }],
  objectHints: [],
  warnings: { unsupported: {}, unitGuessed: false },
}

const child = (g: THREE.Group, name: string) => g.getObjectByName(name) as THREE.Group

describe('planToMeshes', () => {
  const m = planToMeshes(plan, createMaterials(), { labels: false })

  it('외벽: 선분마다 패널 + 걸레받이 (높이 > 4m)', () => {
    const walls = child(m.group, 'solids').children.filter((o) => o.userData.kind === 'wall')
    expect(walls).toHaveLength(2)
    const plinths = child(m.group, 'solids').children.filter((o) => o.userData.kind === 'plinth')
    expect(plinths).toHaveLength(2)
    const first = walls[0] as THREE.Mesh<THREE.BoxGeometry>
    expect(first.geometry.parameters).toMatchObject({ width: 10, height: 8, depth: 0.2 })
    expect(first.position.x).toBeCloseTo(0)
    expect(first.position.y).toBeCloseTo(4)
    expect(first.position.z).toBeCloseTo(2) // plan y=0 → z = +h/2
  })

  it('가벽: 두께 0.5 · 높이 1.2, 걸레받이 없음', () => {
    const parts = child(m.group, 'solids').children.filter((o) => o.userData.kind === 'partition') as THREE.Mesh<THREE.BoxGeometry>[]
    expect(parts).toHaveLength(1)
    expect(parts[0].geometry.parameters).toMatchObject({ width: 2, height: 1.2, depth: 0.5 })
    expect(parts[0].position.y).toBeCloseTo(0.6)
  })

  it('기둥은 H빔 묶음, 구역은 바닥 면 하나', () => {
    const cols = child(m.group, 'solids').children.filter((o) => o.userData.kind === 'column')
    expect(cols).toHaveLength(1)
    expect((cols[0] as THREE.Group).children).toHaveLength(4)
    const zones = child(m.group, 'zones').children
    expect(zones).toHaveLength(1)
    expect(zones[0].userData).toMatchObject({ kind: 'zone', id: 'z1', name: 'Hub' })
  })

  it('바닥 선: 레이어마다 LineSegments, 꺼진 레이어는 숨김, 끝점 목록', () => {
    const lines = child(m.group, 'lines').children as THREE.LineSegments[]
    expect(lines).toHaveLength(3)
    expect(lines.find((l) => l.name === 'OFF')!.visible).toBe(false)
    expect(m.lineMats).toHaveLength(3)
    expect(m.verts).toContainEqual([10, 4])
    expect(m.verts).toContainEqual([0, 2])
  })

  it('labels:false 면 글자 메쉬 없음', () => {
    expect(child(m.group, 'labels').children).toHaveLength(0)
  })
})
```

Run: `npx vitest run src/scene/planToMeshes`
Expected: FAIL — import 실패.

- [ ] **Step 4: 재질·텍스처·글자·메쉬 변환 구현**

`web/src/scene/textures.ts` — demo **706~721행**(`canvasTex`, `rng`, `TEX.concrete`, `TEX.panel`) 을 옮긴다. `TEX.box` 는 옮기지 않는다. 형태:
```ts
import * as THREE from 'three'
export interface Textures { concrete: THREE.Texture; panel: THREE.Texture }
export function createTextures(): Textures { /* demo 706~726 의 canvasTex·rng·concrete·panel 그대로 */ }
```

`web/src/scene/materials.ts`:
```ts
import * as THREE from 'three'
import type { Textures } from './textures'

export const ENV_I = 0.4 // 환경맵 반사 세기 (너무 크면 그림자가 묻힘)

export interface Materials {
  ground3d: THREE.MeshStandardMaterial
  groundPlan: THREE.MeshStandardMaterial
  panel: THREE.MeshStandardMaterial
  drywall: THREE.MeshStandardMaterial
  plinth: THREE.MeshStandardMaterial
  steel: THREE.MeshStandardMaterial
}

/** 공유 재질 (demo MAT 의 도면 부분). tex 가 없으면(테스트) 색만 */
export function createMaterials(tex?: Textures): Materials {
  const m: Materials = {
    ground3d: new THREE.MeshStandardMaterial({ map: tex?.concrete ?? null, color: tex ? 0xffffff : 0xb9bcbf, roughness: 0.85, metalness: 0 }),
    groundPlan: new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 1 }),
    panel: new THREE.MeshStandardMaterial({ map: tex?.panel ?? null, color: tex ? 0xffffff : 0xdfe2e6, roughness: 0.55, metalness: 0.35 }),
    drywall: new THREE.MeshStandardMaterial({ color: 0xeceef0, roughness: 0.9 }),
    plinth: new THREE.MeshStandardMaterial({ color: 0x8e9399, roughness: 0.95 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x5b6573, roughness: 0.45, metalness: 0.6 }),
  }
  for (const x of Object.values(m)) {
    x.envMapIntensity = ENV_I
    x.userData.keep = true
  }
  return m
}
```

`web/src/scene/labels.ts` — demo **829~853행**(`canvasLabel`, `hexCss`, `textMesh`) 을 옮긴다. 바꿀 점:
- `export function textMesh(t: PlanText, colorCss: string, b: { w: number; h: number }): THREE.Mesh | null` — canvas `getContext('2d')` 가 null 이면 null 반환.
- 위치: `const [lx, lz] = planToLocal(t.x, t.y, b); m.position.set(lx, 0.02, lz)` (demo 의 `S.center` 빼기 대신).
- 글꼴은 `"Pretendard Variable", "Malgun Gothic", sans-serif`.

`web/src/scene/planToMeshes.ts`:
```ts
import * as THREE from 'three'
import type { Plan, Pt, WallSeg } from '../drawing/plan/types'
import { planToLocal } from './coords'
import { textMesh } from './labels'
import type { Materials } from './materials'

export interface PlanMeshes {
  group: THREE.Group
  lineMats: THREE.LineBasicMaterial[]
  labelMats: THREE.MeshBasicMaterial[]
  verts: Pt[]
}

/** plan → 3D (로컬 좌표: 도면 가운데 원점, XZ 평면, m). 회전·반전은 FactoryScene 의 root 가 맡음 */
export function planToMeshes(plan: Plan, mats: Materials, opts: { labels: boolean }): PlanMeshes {
  const b = plan.bounds
  const L = (x: number, y: number) => planToLocal(x, y, b)
  const group = new THREE.Group()
  const lines = named('lines'), labels = named('labels'), zones = named('zones'), solids = named('solids')
  group.add(zones, lines, labels, solids)
  const lineMats: THREE.LineBasicMaterial[] = [], labelMats: THREE.MeshBasicMaterial[] = []
  const verts: Pt[] = []
  const layer = new Map(plan.layers.map((l) => [l.name, l]))
  const c = new THREE.Color()

  // 바닥 선 그림: 레이어마다 LineSegments 하나 (정점색)
  const byLayer = new Map<string, typeof plan.lines>()
  for (const ln of plan.lines) byLayer.set(ln.layer, [...(byLayer.get(ln.layer) ?? []), ln])
  for (const [name, list] of byLayer) {
    const pos: number[] = [], col: number[] = []
    for (const ln of list) {
      c.set(ln.color ?? layer.get(name)?.color ?? '#ffffff')
      const pts = ln.closed ? [...ln.pts, ln.pts[0]] : ln.pts
      for (const p of ln.pts) verts.push(p)
      for (let j = 0; j + 1 < pts.length; j++) {
        const [ax, az] = L(...pts[j]), [bx, bz] = L(...pts[j + 1])
        pos.push(ax, 0.01, az, bx, 0.01, bz)
        col.push(c.r, c.g, c.b, c.r, c.g, c.b)
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 1 })
    lineMats.push(mat)
    const seg = new THREE.LineSegments(geo, mat)
    seg.name = name
    seg.visible = layer.get(name)?.visible ?? true
    lines.add(seg)
  }

  // 글자 (브라우저에서만)
  if (opts.labels)
    for (const t of plan.texts) {
      if (layer.get(t.layer)?.visible === false) continue
      const m = textMesh(t, t.color ?? layer.get(t.layer)?.color ?? '#ffffff', b)
      if (m) {
        labelMats.push(m.material as THREE.MeshBasicMaterial)
        labels.add(m)
      }
    }

  // 구역: 반투명 바닥 면
  for (const z of plan.zones) {
    const shape = new THREE.Shape(z.poly.map(([x, y]) => new THREE.Vector2(x - b.w / 2, y - b.h / 2)))
    const geo = new THREE.ShapeGeometry(shape)
    geo.rotateX(-Math.PI / 2)
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: z.color, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }))
    mesh.position.y = 0.005
    mesh.userData = { kind: 'zone', id: z.id, name: z.name }
    zones.add(mesh)
  }

  // 외벽·가벽: 선분마다 상자. 높이 > 4m 는 골강판 + 걸레받이(1.2m), 낮은 벽은 석고 (demo rebuildSolids 의 wall 분기)
  const wallSeg = (w: WallSeg, kind: 'wall' | 'partition') => {
    const inner = w.h <= 4
    for (let j = 0; j + 1 < w.pts.length; j++) {
      const [ax, az] = L(...w.pts[j]), [bx, bz] = L(...w.pts[j + 1])
      const len = Math.hypot(bx - ax, bz - az)
      if (len < 0.05) continue
      const ang = -Math.atan2(bz - az, bx - ax), cx = (ax + bx) / 2, cz = (az + bz) / 2
      const geo = new THREE.BoxGeometry(len, w.h, w.t)
      if (!inner) {
        const uv = geo.attributes.uv
        for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) * len) // 골 간격 1m 유지
      }
      const m = new THREE.Mesh(geo, inner ? mats.drywall : mats.panel)
      m.position.set(cx, w.h / 2, cz)
      m.rotation.y = ang
      m.userData = { kind, id: w.id }
      solids.add(m)
      if (!inner) {
        const base = new THREE.Mesh(new THREE.BoxGeometry(len, 1.2, w.t + 0.06), mats.plinth)
        base.position.set(cx, 0.6, cz)
        base.rotation.y = ang
        base.userData = { kind: 'plinth', id: w.id }
        solids.add(base)
      }
    }
  }
  plan.walls.forEach((w) => wallSeg(w, 'wall'))
  plan.partitions.forEach((w) => wallSeg(w, 'partition'))

  // 기둥: H빔 (플랜지 2 + 웨브 + 베이스 플레이트) — demo hbeam 분기
  for (const col of plan.columns) {
    const g = new THREE.Group()
    const tf = Math.max(0.02, col.d * 0.08), tw = Math.max(0.015, col.w * 0.06)
    const add = (x: number, y: number, z: number, sx: number, sy: number, sz: number, mat: THREE.Material) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat)
      m.position.set(x, y, z)
      g.add(m)
    }
    add(0, col.h / 2, -col.d / 2 + tf / 2, col.w, col.h, tf, mats.steel)
    add(0, col.h / 2, col.d / 2 - tf / 2, col.w, col.h, tf, mats.steel)
    add(0, col.h / 2, 0, tw, col.h, col.d, mats.steel)
    add(0, 0.02, 0, col.w * 1.5, 0.04, col.d * 1.5, mats.plinth)
    const [x, z] = L(col.x, col.y)
    g.position.set(x, 0, z)
    g.userData = { kind: 'column', id: col.id }
    solids.add(g)
  }

  solids.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true
      o.receiveShadow = true
    }
  })
  return { group, lineMats, labelMats, verts }
}

function named(name: string) {
  const g = new THREE.Group()
  g.name = name
  return g
}
```

Run: `npx vitest run src/scene`
Expected: PASS (coords 2 + planToMeshes 5).

- [ ] **Step 5: 카메라 이동·FactoryScene 구현 (브라우저 전용, 단위 테스트 없음)**

`web/src/scene/navigation.ts` — demo **3600~3608행**(`focusOn`, `stepCamAnim`) 과 **3631~3668행**(`KEYS`, 키 이벤트, `keyNav`) 을 클래스로 옮긴다:
```ts
import * as THREE from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'

/** 더블클릭 다가가기(0.6초) · WASD/방향키 이동 · Q/E 회전 · R/F 높이 · Shift 3배 (demo 그대로) */
export class Navigator {
  constructor(camera: THREE.PerspectiveCamera, controls: OrbitControls, dom: HTMLElement)
  focusOn(p: THREE.Vector3, size?: number): void   // demo focusOn
  update(dt: number): void                          // stepCamAnim + keyNav
  cancel(): void                                     // camAnim = null
  dispose(): void                                    // window 이벤트 해제
}
```
- 키 이벤트는 `window` 에 등록하고 `dispose()` 에서 해제. `typing()` 은 demo 그대로 (INPUT/SELECT/TEXTAREA 에 포커스 있으면 무시).
- `dom` 의 `pointerdown`·`wheel` 에서 `cancel()` (demo 3628~3629).

`web/src/scene/FactoryScene.ts`:
```ts
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import type { Plan, Pt } from '../drawing/plan/types'
import { localToPlan, planToLocal } from './coords'
import { createMaterials, type Materials } from './materials'
import { Navigator } from './navigation'
import { planToMeshes, type PlanMeshes } from './planToMeshes'
import { createTextures, type Textures } from './textures'

export type ViewMode = '3d' | 'plan'
export type Quality = 'high' | 'low'
export interface GroundPick { x: number; y: number }
export interface PickSource {
  setGroundClick(cb: ((p: GroundPick) => void) | null): void
  setMarkers(pts: Pt[]): void
}

const SNAP_PX = 12

/** 3D 공장 화면. React 는 setPlan·setView·setQuality·도구 콜백만 부른다 */
export class FactoryScene implements PickSource {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100000)
  private controls: OrbitControls
  private composer: EffectComposer
  private hemi = new THREE.HemisphereLight(0xffffff, 0x8a8f96, 0.5)
  private sun = new THREE.DirectionalLight(0xfff3e0, 2.4)
  private tex: Textures
  private mats: Materials
  private ground: THREE.Mesh
  private grid: THREE.GridHelper | null = null
  private root = new THREE.Group()       // 회전·반전 (plan.rotQ, plan.flip)
  private overlay = new THREE.Group()    // 측정 점·선 (root 아래)
  private meshes: PlanMeshes | null = null
  private plan: Plan | null = null
  private mode: ViewMode = '3d'
  private quality: Quality = 'high'
  private nav: Navigator
  private onPick: ((p: GroundPick) => void) | null = null
  private resizeObs: ResizeObserver
  private clock = new THREE.Clock()
  private downAt: { x: number; y: number } | null = null

  constructor(private container: HTMLElement) { /* 아래 규칙대로 */ }
  setPlan(plan: Plan | null): void { /* … */ }
  setView(mode: ViewMode): void { /* … */ }
  setQuality(q: Quality): void { /* … */ }
  setGroundClick(cb: ((p: GroundPick) => void) | null): void { this.onPick = cb }
  setMarkers(pts: Pt[]): void { /* … */ }
  dispose(): void { /* … */ }
}
```
구현 규칙 (demo 줄 번호는 `C:\kopens\project\demo\index.html`):
1. **생성자** — demo 671~700행: `WebGLRenderer({ antialias: true })`, pixelRatio ≤ 2, ACES 톤매핑 노출 1.05, PCFSoft 그림자, `container.appendChild(renderer.domElement)`. OrbitControls(damping, `maxPolarAngle = π/2 - 0.02`). `PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture` 를 `scene.environment` 로. hemi·sun(그림자 bias -0.0004, normalBias 0.03) 추가. composer: RenderPass → GTAOPass(radius 0.6, distanceExponent 1.5, thickness 1, scale 1.2, samples 12, blendIntensity 0.9) → OutputPass. `tex = createTextures()`, `mats = createMaterials(tex)`. ground = `PlaneGeometry(1,1)` + `mats.ground3d`, `rotation.x = -π/2`, `position.y = -0.01`, receiveShadow. `scene.add(ground, root)`, `root.add(overlay)`. `nav = new Navigator(camera, controls, renderer.domElement)`. `ResizeObserver(container)` → `renderer.setSize`·`composer.setSize`·`camera.aspect`. `renderer.setAnimationLoop(this.tick)` — tick: `nav.update(dt)`, `controls.update()`, 3D·고품질이면 `composer.render()` 아니면 `renderer.render(scene, camera)`.
2. **클릭 → 바닥 좌표** — `pointerdown` 위치 저장, `pointerup` 에서 이동이 5px 미만이면 클릭으로 봄 (드래그 회전과 구분). Raycaster 로 y=0 평면 교차 → `root.worldToLocal` → `localToPlan(v.x, v.z, plan.bounds)`. `meshes.verts` 중 화면 거리(`Vector3.project` → 픽셀) 가 `SNAP_PX` 이하인 가장 가까운 점이 있으면 그 점으로 붙인다 (demo `pickGround` 1144~1160 방식). `onPick?.({x, y})`.
3. **더블클릭** — 바닥 교차점으로 `nav.focusOn(hit, camera.position.distanceTo(controls.target) * 0.35)` (demo 3623~3627).
4. **setPlan** — 이전 `meshes.group` 을 root 에서 빼고 geometry·material 해제 (`userData.keep` 재질은 남김, demo `disposeGroup` 779~785). plan 이 null 이면 끝. 아니면 `planToMeshes(plan, mats, { labels: true })` → root 에 추가. `root.scale.set(plan.flip, 1, 1)`, `root.rotation.y = plan.rotQ * π / 2`. span = `max(bounds.w, bounds.h) || 50`: ground.scale(span*3, span*3), 콘크리트 반복 `tex.concrete.repeat.set(span*3/4, span*3/4)`, grid 새로 (demo 905~911: `GridHelper(gs, div, 0x2b3240, 0x20252e)`, `gs = ceil(span*1.6/10)*10`, `div = min(200, round(gs/niceStep(gs)))`, niceStep 은 demo 929행). 카메라 near/far 와 위치는 **도면이 바뀔 때만** demo 910~911 처럼 초기화 (같은 도면의 회전·보정 저장 때는 카메라 유지 — `plan` 이 들어올 때 `bounds` 와 이전 도면 bounds 가 다르거나 이전 plan 이 null 이면 초기화). 마지막에 `applyLook()`.
5. **applyLook** (private) — demo 789~812 에서 DOM 부분(`$('btnView')`, `$('opacity')`, localStorage) 을 뺀 것. 선 투명도 `op = 1`: 3D 면 선 재질 `color 0x2c3138`, `opacity 0.45`, 글자 재질 `color 0x2c3138`, `opacity 0.6`; 도면 보기면 흰색·1. grid 는 도면 보기에서만 보임. 구역 면(`zones` 그룹) 은 두 보기 모두 보임. 그림자 맵 크기 고품질 4096 / 저사양 2048. 도면 보기면 `controls` 를 위에서 내려다보게: 카메라를 `target + (0, span*1.2, 0.001)` 로 옮김 (3D 로 돌아오면 demo 911 의 비스듬한 위치).
6. **setView / setQuality** — 값 저장 후 `applyLook()`.
7. **setMarkers(pts)** — overlay 를 비우고, 각 점에 작은 파란 원판(`CircleGeometry(0.25)`, `0x1f6feb`, y=0.03, 눕힘) 을 `planToLocal` 위치에, 점이 2개 이상이면 그 사이 파란 선(`LineBasicMaterial 0x1f6feb`). plan 이 없으면 무시.
8. **dispose** — `setAnimationLoop(null)`, ResizeObserver 해제, `nav.dispose()`, 이벤트 해제, `controls.dispose()`, 메쉬·텍스처·재질·`renderer.dispose()`, `renderer.domElement.remove()`.

- [ ] **Step 6: 빌드·린트·테스트 확인**

Run: `cd /c/kopens/project/Factory3D/web && npx vitest run && npm run build && ./node_modules/.bin/oxlint`
Expected: 테스트 PASS, `tsc -b` 오류 0 (three addons 타입 포함), 린트 0.

- [ ] **Step 7: Commit**

```bash
cd /c/kopens/project/Factory3D && git add web/package.json web/package-lock.json web/src/scene
git commit -m "feat(web): 3D 엔진 — plan → 바닥 선·글자·구역·외벽·가벽·H빔, FactoryScene(조명·GTAO·보기 전환·클릭·이동)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 메인 화면에 3D 연결 (도면 상세 불러오기 · 보기 전환 · 정보 카드)

**Files:**
- Modify: `web/src/api/client.ts` (apiBuffer), `web/src/api/types.ts` (DrawingSummary 칸)
- Create: `web/src/drawing/api.ts`, `web/src/drawing/useDrawing.ts`, `web/src/drawing/InfoCard.tsx`, `web/src/scene/FactoryView.tsx`
- Modify: `web/src/pages/FactoryPage.tsx`, `web/src/layout/DrawingBar.tsx`, `web/src/styles/app.css`
- Test: `web/src/layout/layout.test.tsx` (갱신), `web/src/drawing/useDrawing.test.tsx`

**Interfaces:**
- Consumes: `GET /api/drawings/{id}`, `PUT /api/drawings/{id}/plan` (Task 1), `Plan`, `LayerRules` (Task 3), `FactoryScene`, `ViewMode`, `Quality`, `PickSource` (Task 5).
- Produces (api/types.ts): `DrawingSummary` 에 `version: number; createdBy: string | null; width: number | null; height: number | null` 추가.
- Produces (client.ts): `apiBuffer(url: string): Promise<ArrayBuffer>` (오류 처리는 `handle` 과 같게).
- Produces (drawing/api.ts):
```ts
export interface DrawingDetail { id: number; name: string; sourceType: 'dxf' | 'image'; version: number; createdBy: string | null; createdAt: string; updatedAt: string; plan: Plan; layerRules: LayerRules }
export function getDrawing(id: number): Promise<DrawingDetail>
export function getSource(id: number): Promise<ArrayBuffer>
export function createDrawing(file: File, name: string, plan: Plan, layerRules: LayerRules): Promise<DrawingDetail>
export function savePlan(id: number, version: number, plan: Plan, layerRules: LayerRules): Promise<DrawingDetail>
export function renameDrawing(id: number, name: string): Promise<DrawingDetail>
export function deleteDrawing(id: number): Promise<void>
```
- Produces (useDrawing.ts):
```ts
export type DrawingState = { kind: 'idle' } | { kind: 'loading' } | { kind: 'ok'; detail: DrawingDetail } | { kind: 'error'; error: ApiError }
export function useDrawing(id: number | null): { state: DrawingState; save(plan: Plan, layerRules?: LayerRules): Promise<'ok' | 'conflict'>; reload(): void }
```
- Produces (FactoryView.tsx): `FactoryView(props: { plan: Plan | null; view: ViewMode; quality: Quality; onScene?: (s: PickSource | null) => void })` — WebGL 생성 실패 시 `<p className="empty-state" role="alert">3D 화면을 표시할 수 없습니다. (WebGL 을 지원하는 브라우저가 필요합니다)</p>`.
- Produces (DrawingBar): props 에 `onAdd: () => void` 추가 — 버튼 활성.
- Produces (FactoryPage): 보기·품질은 localStorage `f3d:view` (`{"mode":"3d","quality":"high"}`) 에 저장.

- [ ] **Step 1: 실패 테스트 작성**

`web/src/drawing/useDrawing.test.tsx`:
```tsx
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDrawing } from './useDrawing'

const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body })
const detail = (version: number) => ({ id: 1, name: '나셀 공장', sourceType: 'dxf', version, createdBy: 'system', createdAt: '', updatedAt: '', plan: { format: 1, rotQ: 0 }, layerRules: {} })

describe('useDrawing', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('id 가 없으면 idle, 있으면 상세를 불러옴', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, detail(1))))
    const { result, rerender } = renderHook(({ id }) => useDrawing(id), { initialProps: { id: null as number | null } })
    expect(result.current.state.kind).toBe('idle')
    rerender({ id: 1 })
    await waitFor(() => expect(result.current.state.kind).toBe('ok'))
  })

  it('저장은 지금 버전으로 PUT, 409 면 다시 불러오고 conflict', async () => {
    let v = 1
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        const body = JSON.parse(String(init.body))
        if (body.version !== v) return json(409, { detail: '다른 사람이 먼저 수정했습니다.' })
        v++
        return json(200, detail(v))
      }
      return json(200, detail(v))
    })
    vi.stubGlobal('fetch', fetch)
    const { result } = renderHook(() => useDrawing(1))
    await waitFor(() => expect(result.current.state.kind).toBe('ok'))
    let r = ''
    await act(async () => { r = await result.current.save({ format: 1, rotQ: 1 } as never) })
    expect(r).toBe('ok')
    expect(result.current.state).toMatchObject({ kind: 'ok', detail: { version: 2 } })
    v = 5 // 다른 사람이 저장함
    await act(async () => { r = await result.current.save({ format: 1, rotQ: 2 } as never) })
    expect(r).toBe('conflict')
    await waitFor(() => expect(result.current.state).toMatchObject({ kind: 'ok', detail: { version: 5 } }))
  })
})
```

`web/src/layout/layout.test.tsx` 를 아래로 바꾼다 (3D 는 jsdom 에서 못 그리므로 FactoryView 를 가짜로):
```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../api/types'
import { StaticAuth } from '../auth/auth'
import { routes } from '../routes'

vi.mock('../scene/FactoryView', () => ({
  FactoryView: (p: { plan: { bounds: { w: number } } | null; view: string }) => (
    <div data-testid="factory-view" data-view={p.view}>{p.plan ? `plan ${p.plan.bounds.w}` : 'no plan'}</div>
  ),
}))

const base: User = {
  id: 1, username: 'kim', displayName: '김운전', role: 'OPERATOR', enabled: true,
  mustChangePassword: false, locked: false, createdAt: '2026-11-12T00:00:00Z',
}
const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body })
const drawings = [
  { id: 1, name: '나셀 공장', sourceType: 'dxf', version: 1, createdBy: 'system', updatedAt: '2026-11-12T00:00:00Z', width: 160, height: 65.8 },
  { id: 2, name: '2공장', sourceType: 'dxf', version: 3, createdBy: 'kim', updatedAt: '2026-11-12T00:00:00Z', width: 40, height: 20 },
]
const plan = (w: number) => ({ format: 1, unit: 'mm', scale: 0.001, rotQ: 0, flip: 1, bounds: { w, h: 10 }, layers: [], lines: [], texts: [], walls: [], partitions: [], columns: [], zones: [], objectHints: [], warnings: { unsupported: {}, unitGuessed: false } })

function show(user: User, list: unknown[] = drawings) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const m = /^\/api\/drawings\/(\d+)$/.exec(url)
    if (m) {
      const d = drawings.find((x) => x.id === Number(m[1]))!
      return json(200, { ...d, createdAt: d.updatedAt, plan: plan(d.width), layerRules: {} })
    }
    return json(200, list)
  }))
  render(
    <StaticAuth user={user}>
      <RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/'] })} />
    </StaticAuth>,
  )
}

describe('메인 레이아웃', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('도면 select: 기억한 도면을 3D 로 그리고, 바꾸면 기억', async () => {
    localStorage.setItem('f3d:drawing:kim', '2')
    show(base)
    const select = (await screen.findByRole('combobox', { name: '도면 선택' })) as HTMLSelectElement
    expect(await screen.findByText('plan 40')).toBeInTheDocument()
    expect(select.value).toBe('2')
    fireEvent.change(select, { target: { value: '1' } })
    expect(await screen.findByText('plan 160')).toBeInTheDocument()
    expect(localStorage.getItem('f3d:drawing:kim')).toBe('1')
    expect(screen.getByText('160.0 × 10.0 m')).toBeInTheDocument()
  })

  it('보기 전환은 기억됨', async () => {
    show(base)
    await screen.findByText('plan 160')
    fireEvent.click(screen.getByRole('button', { name: '도면 보기' }))
    expect(screen.getByTestId('factory-view')).toHaveAttribute('data-view', 'plan')
    expect(JSON.parse(localStorage.getItem('f3d:view')!)).toMatchObject({ mode: 'plan' })
  })

  it('도면이 없으면 안내', async () => {
    show(base, [])
    expect(await screen.findByText('등록된 도면이 없습니다')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '도면 선택' })).toBeDisabled()
  })

  it('도면 추가 버튼은 운전원 이상(켜짐), 관리자 메뉴는 관리자만', async () => {
    show(base)
    expect(await screen.findByRole('button', { name: /도면 추가/ })).toBeEnabled()
    expect(screen.queryByRole('button', { name: '관리자' })).toBeNull()
    expect(screen.getByRole('button', { name: /상황판/ })).toBeDisabled()
  })

  it('조회 권한은 도면 추가 버튼 없음', async () => {
    show({ ...base, role: 'VIEWER' })
    await screen.findByRole('combobox', { name: '도면 선택' })
    expect(screen.queryByRole('button', { name: /도면 추가/ })).toBeNull()
  })

  it('관리자는 관리자 메뉴가 보임', async () => {
    show({ ...base, role: 'ADMIN' })
    expect(await screen.findByRole('button', { name: '관리자' })).toBeInTheDocument()
  })
})
```

Run: `cd /c/kopens/project/Factory3D/web && npx vitest run src/layout src/drawing/useDrawing`
Expected: FAIL.

- [ ] **Step 2: API·훅·화면 구현**

`web/src/api/client.ts` 의 `apiJson` 아래에 추가하고, `handle` 을 바이트 응답도 처리하도록 일반화한다:
```ts
async function handle<T>(url: string, send: () => Promise<Response>, read: (r: Response) => Promise<T> = (r) => r.json() as Promise<T>): Promise<T> {
  // 본문은 기존 그대로, 성공 시: if (r.ok) return (r.status === 204 ? undefined : await read(r)) as T
}

/** 파일 바이트 받기 (도면 원본) */
export function apiBuffer(url: string): Promise<ArrayBuffer> {
  return handle<ArrayBuffer>(url, () => fetch(url), (r) => r.arrayBuffer())
}
```
(기존 `handle` 의 나머지 오류 처리 줄은 그대로 둔다.)

`web/src/api/types.ts` 의 `DrawingSummary` 를:
```ts
export interface DrawingSummary {
  id: number
  name: string
  sourceType: 'dxf' | 'image'
  version: number
  createdBy: string | null
  updatedAt: string
  width: number | null
  height: number | null
}
```
(`useDrawings.test.ts` 의 도우미 `d()` 에 새 칸 `version: 1, createdBy: null, width: null, height: null` 을 넣어 타입 오류를 없앤다.)

`web/src/drawing/api.ts`:
```ts
import { apiBuffer, apiJson, apiSend, apiSendForm } from '../api/client'
import type { LayerRules, Plan } from './plan/types'

export interface DrawingDetail {
  id: number
  name: string
  sourceType: 'dxf' | 'image'
  version: number
  createdBy: string | null
  createdAt: string
  updatedAt: string
  plan: Plan
  layerRules: LayerRules
}

export const getDrawing = (id: number) => apiJson<DrawingDetail>(`/api/drawings/${id}`)
export const getSource = (id: number) => apiBuffer(`/api/drawings/${id}/source`)

export function createDrawing(file: File, name: string, plan: Plan, layerRules: LayerRules): Promise<DrawingDetail> {
  const f = new FormData()
  f.append('file', file)
  f.append('name', name)
  f.append('plan', JSON.stringify(plan))
  f.append('layerRules', JSON.stringify(layerRules))
  return apiSendForm<DrawingDetail>('POST', '/api/drawings', f)
}

export const savePlan = (id: number, version: number, plan: Plan, layerRules: LayerRules) =>
  apiSend<DrawingDetail>('PUT', `/api/drawings/${id}/plan`, { version, plan, layerRules })
export const renameDrawing = (id: number, name: string) => apiSend<DrawingDetail>('PATCH', `/api/drawings/${id}`, { name })
export const deleteDrawing = (id: number) => apiSend<void>('DELETE', `/api/drawings/${id}`)
```

`web/src/drawing/useDrawing.ts`:
```ts
import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../api/client'
import { getDrawing, savePlan, type DrawingDetail } from './api'
import type { LayerRules, Plan } from './plan/types'

export type DrawingState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; detail: DrawingDetail }
  | { kind: 'error'; error: ApiError }

/** 고른 도면의 상세(plan) 와 저장. 저장은 버전을 붙여 보내고, 어긋나면(409) 다시 불러와 'conflict' */
export function useDrawing(id: number | null) {
  const [state, setState] = useState<DrawingState>({ kind: 'idle' })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (id == null) return
    let cancel = false
    getDrawing(id)
      .then((detail) => !cancel && setState({ kind: 'ok', detail }))
      .catch((error: ApiError) => !cancel && setState({ kind: 'error', error }))
    return () => {
      cancel = true
    }
  }, [id, tick])
  const reload = useCallback(() => setTick((n) => n + 1), [])
  const save = useCallback(
    async (plan: Plan, layerRules?: LayerRules): Promise<'ok' | 'conflict'> => {
      if (state.kind !== 'ok') return 'conflict'
      const d = state.detail
      try {
        const next = await savePlan(d.id, d.version, plan, layerRules ?? d.layerRules)
        setState({ kind: 'ok', detail: next })
        return 'ok'
      } catch (e) {
        if (e instanceof ApiError && e.kind === 'conflict') {
          reload()
          return 'conflict'
        }
        throw e
      }
    },
    [state, reload],
  )
  return { state: id == null ? ({ kind: 'idle' } as DrawingState) : state, save, reload }
}
```
(id 가 바뀌면 이전 도면이 잠깐 보일 수 있다 — FactoryPage 는 `state.detail.id === selectedId` 일 때만 plan 을 넘긴다.)

`web/src/scene/FactoryView.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react'
import type { Plan } from '../drawing/plan/types'
import { FactoryScene, type PickSource, type Quality, type ViewMode } from './FactoryScene'

/** 3D 화면 껍데기: FactoryScene 을 만들고 plan·보기·품질을 넘김 */
export function FactoryView({ plan, view, quality, onScene }: { plan: Plan | null; view: ViewMode; quality: Quality; onScene?: (s: PickSource | null) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const scene = useRef<FactoryScene | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    try {
      scene.current = new FactoryScene(box.current!)
      onScene?.(scene.current)
    } catch {
      setFailed(true)
    }
    return () => {
      onScene?.(null)
      scene.current?.dispose()
      scene.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => scene.current?.setPlan(plan), [plan])
  useEffect(() => scene.current?.setView(view), [view])
  useEffect(() => scene.current?.setQuality(quality), [quality])
  if (failed)
    return (
      <p className="empty-state" role="alert">
        3D 화면을 표시할 수 없습니다. (WebGL 을 지원하는 브라우저가 필요합니다)
      </p>
    )
  return <div ref={box} className="factory-view" />
}
```
(린트가 eslint-disable 주석을 모르면 그 줄을 지운다. `onScene` 은 처음 한 번만 쓰는 것이 의도.)

`web/src/drawing/InfoCard.tsx`:
```tsx
import type { Plan } from './plan/types'

/** 3D 왼쪽 아래: 도면 이름 · 크기 · 단위 */
export function InfoCard({ name, plan, calibrated }: { name: string; plan: Plan; calibrated: boolean }) {
  return (
    <div className="info-card">
      <strong>{name}</strong>
      <span>{`${plan.bounds.w.toFixed(1)} × ${plan.bounds.h.toFixed(1)} m`}</span>
      <span>{calibrated ? '보정됨' : `단위 ${plan.unit}${plan.warnings.unitGuessed ? ' (추정)' : ''}`}</span>
    </div>
  )
}
```
`calibrated` = 단위 기본 배율(`{inch:0.0254, feet:0.3048, mm:0.001, cm:0.01, m:1}[plan.unit]`) 과 `plan.scale` 이 1e-9 넘게 다를 때 — FactoryPage 에서 계산.

`web/src/layout/DrawingBar.tsx`: props 에 `onAdd: () => void` 를 추가하고, 버튼을 `<button className="bar-btn" onClick={onAdd}>` 로 바꾼다 (`disabled`, `title` 제거).

`web/src/pages/FactoryPage.tsx` 전체:
```tsx
import { Box, Gauge, Map as MapIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { hasRole, useAuth } from '../auth/context'
import { InfoCard } from '../drawing/InfoCard'
import type { Plan, UnitName } from '../drawing/plan/types'
import { useDrawing } from '../drawing/useDrawing'
import { loadStored, pickDrawing, saveStored, useDrawings } from '../drawing/useDrawings'
import { AppShell } from '../layout/AppShell'
import { DrawingBar } from '../layout/DrawingBar'
import type { PickSource, Quality, ViewMode } from '../scene/FactoryScene'
import { FactoryView } from '../scene/FactoryView'
import { ErrorPage } from './ErrorPage'

const UNIT_SCALE: Record<UnitName, number> = { inch: 0.0254, feet: 0.3048, mm: 0.001, cm: 0.01, m: 1 }
type ViewPref = { mode: ViewMode; quality: Quality }

function loadView(): ViewPref {
  try {
    return { mode: '3d', quality: 'high', ...JSON.parse(localStorage.getItem('f3d:view') ?? '{}') }
  } catch {
    return { mode: '3d', quality: 'high' }
  }
}

/** / — 3D 공장 화면: 도면 select · 3D · 보기 전환 · 정보 카드 (도구·추가는 Task 7·8 에서) */
export function FactoryPage() {
  const { user } = useAuth()
  const [drawings, retry] = useDrawings()
  const [chosen, setChosen] = useState<number | null>(() => (user ? loadStored(user.username) : null))
  const [pref, setPref] = useState<ViewPref>(loadView)
  const [, setScene] = useState<PickSource | null>(null)
  const list = drawings.kind === 'ok' ? drawings.list : []
  const selectedId = pickDrawing(list, chosen)
  const { state } = useDrawing(selectedId)
  useEffect(() => {
    try {
      localStorage.setItem('f3d:view', JSON.stringify(pref))
    } catch {
      /* 저장 못 해도 동작 */
    }
  }, [pref])
  if (drawings.kind === 'error')
    return <ErrorPage code={drawings.error.kind === 'network' ? 'offline' : '500'} detail={drawings.error.message} onRetry={retry} />
  const select = (id: number) => {
    setChosen(id)
    if (user) saveStored(user.username, id)
  }
  const detail = state.kind === 'ok' && state.detail.id === selectedId ? state.detail : null
  const plan: Plan | null = detail?.plan ?? null
  const head = (
    <>
      <DrawingBar drawings={list} selectedId={selectedId} onSelect={select} canAdd={hasRole(user, 'OPERATOR')} onAdd={() => {}} />
      <div className="seg" role="group" aria-label="보기">
        <button className={pref.mode === '3d' ? 'on' : ''} aria-pressed={pref.mode === '3d'} onClick={() => setPref({ ...pref, mode: '3d' })}>
          <Box size={14} aria-hidden /> 3D 보기
        </button>
        <button className={pref.mode === 'plan' ? 'on' : ''} aria-pressed={pref.mode === 'plan'} onClick={() => setPref({ ...pref, mode: 'plan' })}>
          <MapIcon size={14} aria-hidden /> 도면 보기
        </button>
      </div>
      <button className="bar-btn" aria-pressed={pref.quality === 'high'} onClick={() => setPref({ ...pref, quality: pref.quality === 'high' ? 'low' : 'high' })}>
        <Gauge size={14} aria-hidden /> {pref.quality === 'high' ? '고품질' : '저사양'}
      </button>
    </>
  )
  return (
    <AppShell active="factory" head={head}>
      {drawings.kind === 'loading' ? (
        <p className="empty-state" role="status">도면 목록 불러오는 중…</p>
      ) : list.length === 0 ? (
        <div className="empty-state">
          <strong>등록된 도면이 없습니다</strong>
          <span>도면을 추가하면 3D 공장이 여기에 표시됩니다.</span>
        </div>
      ) : (
        <>
          <FactoryView plan={plan} view={pref.mode} quality={pref.quality} onScene={setScene} />
          {state.kind === 'error' && <p className="empty-state" role="alert">{state.error.message}</p>}
          {detail && (
            <InfoCard name={detail.name} plan={detail.plan} calibrated={Math.abs(detail.plan.scale - UNIT_SCALE[detail.plan.unit]) > 1e-9} />
          )}
        </>
      )}
    </AppShell>
  )
}
```
(`setScene` 의 값은 Task 7 에서 도구에 넘긴다 — 지금은 `[, setScene]` 으로 받아 린트 경고를 피한다.)

`web/src/styles/app.css` 끝에 추가:
```css
/* 3D 화면 */
.factory-view { position: absolute; inset: 0; }
.factory-view canvas { display: block; }

/* 보기 전환 (붙은 버튼 두 개) */
.seg { display: inline-flex; padding: 2px; border: 1px solid var(--line-strong); border-radius: var(--kp-radius-sm); background: #ffffff08; }
.seg button { display: flex; align-items: center; gap: 6px; height: calc(var(--kp-h-xs) - 6px); padding: 0 10px; border: 0; border-radius: var(--kp-radius-xs); background: none; color: var(--muted); font-size: var(--kp-text-13); }
.seg button.on { background: color-mix(in srgb, var(--primary) 25%, transparent); color: #fff; }

/* 3D 위 정보 카드 (왼쪽 아래) */
.info-card { position: absolute; left: 16px; bottom: 16px; display: flex; flex-direction: column; gap: 2px; padding: 10px 14px; border: 1px solid var(--line-strong); border-radius: var(--kp-radius-sm); background: color-mix(in srgb, var(--panel) 88%, transparent); font-size: var(--kp-text-13); color: var(--muted); }
.info-card strong { color: var(--text); font-size: var(--kp-text-14); }
```

- [ ] **Step 3: 통과 확인**

Run: `cd /c/kopens/project/Factory3D/web && npx vitest run && npm run build && ./node_modules/.bin/oxlint`
Expected: 전부 PASS, 빌드·린트 0. (`admin.test.tsx` 의 로그인 테스트도 그대로 통과해야 함 — 첫 화면이 `/admin/users` 라 FactoryView 를 안 그림.)

- [ ] **Step 4: Commit**

```bash
cd /c/kopens/project/Factory3D && git add web
git commit -m "feat(web): 메인 화면에 3D 연결 — 도면 상세 불러오기·저장(버전), 3D/도면 보기·품질, 정보 카드

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 도면 도구 — 거리 측정 · 스케일 보정 · 회전 · 반전

**Files:**
- Create: `web/src/drawing/DrawingTools.tsx`, `web/src/drawing/DrawingTools.test.tsx`
- Modify: `web/src/pages/FactoryPage.tsx` (도구 · 토스트 연결), `web/src/styles/app.css`

**Interfaces:**
- Consumes: `PickSource`, `GroundPick` (Task 5), `calibrate`, `rotate`, `flipPlan` (Task 3), `useDrawing().save` (Task 6), `Modal` (`components/Modal.tsx`: props `title`, `onClose`, `children` — 파일을 열어 실제 props 확인).
- Produces: `DrawingTools(props: { scene: PickSource | null; plan: Plan; canEdit: boolean; onSave: (plan: Plan) => Promise<void> })`.
  - 버튼: `거리 측정`(모두), `스케일 보정`·`90° 회전`·`좌우 반전`(canEdit).
  - 측정 결과 문구: `거리 12.35 m` (소수 둘째 자리).
  - 보정 창: 제목 `스케일 보정`, 입력 라벨 `실제 거리 (m)`, 버튼 `적용`.
  - Esc → 도구 끝, 표시 점 지움.

- [ ] **Step 1: 실패 테스트 작성**

`web/src/drawing/DrawingTools.test.tsx`:
```tsx
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { GroundPick, PickSource } from '../scene/FactoryScene'
import { DrawingTools } from './DrawingTools'
import type { Plan } from './plan/types'

const plan: Plan = {
  format: 1, unit: 'mm', scale: 0.001, rotQ: 0, flip: 1, bounds: { w: 20, h: 10 },
  layers: [], lines: [{ layer: 'A', pts: [[0, 0], [20, 0]], closed: false, color: null }], texts: [],
  walls: [], partitions: [], columns: [], zones: [], objectHints: [], warnings: { unsupported: {}, unitGuessed: false },
}

function fakeScene() {
  let cb: ((p: GroundPick) => void) | null = null
  const s: PickSource & { click(x: number, y: number): void; markers: unknown[] } = {
    markers: [],
    setGroundClick: (f) => { cb = f },
    setMarkers: (pts) => { s.markers = pts },
    click: (x, y) => act(() => cb?.({ x, y })),
  }
  return s
}

describe('도면 도구', () => {
  it('거리 측정: 두 점 → 거리 표시, Esc 로 끝', () => {
    const s = fakeScene()
    render(<DrawingTools scene={s} plan={plan} canEdit={false} onSave={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /스케일 보정/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /거리 측정/ }))
    s.click(0, 0)
    s.click(3, 4)
    expect(screen.getByText('거리 5.00 m')).toBeInTheDocument()
    expect(s.markers).toEqual([[0, 0], [3, 4]])
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(s.markers).toEqual([])
    expect(screen.queryByText('거리 5.00 m')).toBeNull()
  })

  it('스케일 보정: 두 점(5m) 에 실제 10m → 2배로 저장', async () => {
    const s = fakeScene()
    const onSave = vi.fn(async () => {})
    render(<DrawingTools scene={s} plan={plan} canEdit onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: /스케일 보정/ }))
    s.click(0, 0)
    s.click(3, 4)
    fireEvent.change(await screen.findByLabelText('실제 거리 (m)'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: '적용' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const saved = (onSave.mock.calls[0] as unknown as [Plan])[0]
    expect(saved.bounds.w).toBeCloseTo(40)
    expect(saved.scale).toBeCloseTo(0.002)
  })

  it('보정 거리가 0 이하면 저장 안 함', async () => {
    const s = fakeScene()
    const onSave = vi.fn(async () => {})
    render(<DrawingTools scene={s} plan={plan} canEdit onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: /스케일 보정/ }))
    s.click(0, 0)
    s.click(3, 4)
    fireEvent.change(await screen.findByLabelText('실제 거리 (m)'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: '적용' }))
    expect(await screen.findByText('거리는 0보다 커야 합니다.')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('회전·반전은 바로 저장', async () => {
    const onSave = vi.fn(async () => {})
    render(<DrawingTools scene={fakeScene()} plan={plan} canEdit onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: /90° 회전/ }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect((onSave.mock.calls[0] as unknown as [Plan])[0].rotQ).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: /좌우 반전/ }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2))
    expect((onSave.mock.calls[1] as unknown as [Plan])[0].flip).toBe(-1)
  })
})
```

Run: `npx vitest run src/drawing/DrawingTools`
Expected: FAIL — import 실패.

- [ ] **Step 2: 구현**

`web/src/drawing/DrawingTools.tsx`:
```tsx
import { FlipHorizontal2, RotateCw, Ruler, Scaling } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Modal } from '../components/Modal'
import type { PickSource } from '../scene/FactoryScene'
import type { Plan, Pt } from './plan/types'
import { calibrate, flipPlan, rotate } from './plan/transform'

type Tool = 'none' | 'measure' | 'calib'
const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1])

/** 3D 오른쪽 위 도구줄: 거리 측정(모두) · 스케일 보정 · 90° 회전 · 좌우 반전(운전원 이상) */
export function DrawingTools({ scene, plan, canEdit, onSave }: { scene: PickSource | null; plan: Plan; canEdit: boolean; onSave: (plan: Plan) => Promise<void> }) {
  const [tool, setTool] = useState<Tool>('none')
  const [picks, setPicks] = useState<Pt[]>([])
  const [actual, setActual] = useState('')
  const [error, setError] = useState<string | null>(null)

  const stop = () => {
    setTool('none')
    setPicks([])
    setActual('')
    setError(null)
  }
  useEffect(() => {
    if (!scene) return
    scene.setGroundClick(tool === 'none' ? null : (p) => setPicks((cur) => (cur.length >= 2 ? [[p.x, p.y]] : [...cur, [p.x, p.y]])))
    return () => scene.setGroundClick(null)
  }, [scene, tool])
  useEffect(() => scene?.setMarkers(picks), [scene, picks])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && stop()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const start = (t: Tool) => {
    stop()
    setTool(t)
  }
  const measured = picks.length === 2 ? dist(picks[0], picks[1]) : null
  const apply = async (e: FormEvent) => {
    e.preventDefault()
    try {
      const next = calibrate(plan, measured ?? 0, Number(actual))
      await onSave(next)
      stop()
    } catch (err) {
      setError((err as Error).message)
    }
  }
  return (
    <div className="tool-bar" role="toolbar" aria-label="도면 도구">
      <button className={tool === 'measure' ? 'on' : ''} aria-pressed={tool === 'measure'} onClick={() => start('measure')}>
        <Ruler size={16} aria-hidden /> 거리 측정
      </button>
      {canEdit && (
        <>
          <button className={tool === 'calib' ? 'on' : ''} aria-pressed={tool === 'calib'} onClick={() => start('calib')}>
            <Scaling size={16} aria-hidden /> 스케일 보정
          </button>
          <button onClick={() => onSave(rotate(plan))}>
            <RotateCw size={16} aria-hidden /> 90° 회전
          </button>
          <button onClick={() => onSave(flipPlan(plan))}>
            <FlipHorizontal2 size={16} aria-hidden /> 좌우 반전
          </button>
        </>
      )}
      {tool !== 'none' && (
        <p className="tool-hint" role="status">
          {measured != null && tool === 'measure' ? `거리 ${measured.toFixed(2)} m` : picks.length === 0 ? '첫 점을 클릭하세요 (Esc 취소)' : '둘째 점을 클릭하세요'}
        </p>
      )}
      {tool === 'calib' && measured != null && (
        <Modal title="스케일 보정" onClose={stop}>
          <form className="kp-form" onSubmit={apply}>
            <p className="kp-desc">{`두 점 사이 지금 거리: ${measured.toFixed(2)} m`}</p>
            <label className="kp-field">
              <span>실제 거리 (m)</span>
              <input className="kp-input" type="number" step="any" autoFocus value={actual} onChange={(e) => setActual(e.target.value)} />
            </label>
            {error && <p className="kp-error-text">{error}</p>}
            <div className="kp-modal-actions">
              <button type="button" className="kp-btn kp-btn-stroke" onClick={stop}>취소</button>
              <button type="submit" className="kp-btn kp-btn-primary">적용</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
```
- `Modal` 의 실제 props 이름이 다르면(`components/Modal.tsx` 확인) 그에 맞춘다. `kp-form`·`kp-modal-actions` 클래스가 kp.css 에 없으면 `grep -n "kp-form" web/src/styles/kp.css` 로 확인해 있는 이름(예: UsersPage 가 쓰는 것) 을 쓴다.
- lucide 아이콘 이름(`Ruler`, `Scaling`, `RotateCw`, `FlipHorizontal2`) 이 없으면 `node -e "console.log(Object.keys(require('lucide-react')).filter(k=>/Flip|Scal|Ruler/.test(k)))"` 로 있는 것을 고른다.

`FactoryPage.tsx` 연결:
- `const [, setScene]` → `const [scene, setScene] = useState<PickSource | null>(null)`.
- `const { state, save } = useDrawing(selectedId)`, 토스트 상태 `const [toast, setToast] = useState<string | null>(null)` + 3.5초 뒤 지우는 `useEffect`.
- 저장 함수:
```tsx
const onSave = async (p: Plan) => {
  try {
    if ((await save(p)) === 'conflict') setToast('다른 사람이 먼저 수정했습니다. 다시 불러옵니다.')
  } catch (e) {
    setToast((e as Error).message)
  }
}
```
- `detail` 이 있을 때 `<DrawingTools scene={scene} plan={detail.plan} canEdit={hasRole(user, 'OPERATOR')} onSave={onSave} />` 와 `{toast && <p className="toast" role="status">{toast}</p>}` 를 InfoCard 옆에 추가.

`app.css` 끝에 추가:
```css
/* 3D 위 도구줄 (오른쪽 위) */
.tool-bar { position: absolute; top: 12px; right: 12px; display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 6px; max-width: calc(100% - 24px); }
.tool-bar > button { display: flex; align-items: center; gap: 6px; height: var(--kp-h-xs); padding: 0 10px; border: 1px solid var(--line-strong); border-radius: var(--kp-radius-sm); background: color-mix(in srgb, var(--panel) 88%, transparent); color: var(--text); font-size: var(--kp-text-13); }
.tool-bar > button:hover { background: var(--panel); }
.tool-bar > button.on { border-color: var(--primary); color: #9cc3ff; }
.tool-hint { flex-basis: 100%; margin: 0; text-align: right; font-size: var(--kp-text-13); color: var(--text); }
.toast { position: absolute; left: 50%; bottom: 20px; transform: translateX(-50%); margin: 0; padding: 8px 14px; border-radius: var(--kp-radius-sm); background: #000c; color: #fff; font-size: var(--kp-text-13); }
```

- [ ] **Step 3: 통과 확인**

Run: `npx vitest run && npm run build && ./node_modules/.bin/oxlint`
Expected: 전부 PASS.

- [ ] **Step 4: Commit**

```bash
cd /c/kopens/project/Factory3D && git add web
git commit -m "feat(web): 도면 도구 — 거리 측정·스케일 보정·90° 회전·좌우 반전 (서버 저장, 충돌 안내)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 도면 추가 창 (DXF 선택 · 해석 미리보기 · 등록)

**Files:**
- Create: `web/src/drawing/AddDrawingDialog.tsx`, `web/src/drawing/PlanPreview.tsx`, `web/src/drawing/AddDrawingDialog.test.tsx`
- Modify: `web/src/pages/FactoryPage.tsx` (onAdd → 창, 등록 후 선택), `web/src/styles/app.css`

**Interfaces:**
- Consumes: `readDxfFile`, `DxfReadError` (Task 2), `interpretDxf` (Task 3), `createDrawing` (Task 6), `Modal`.
- Produces: `AddDrawingDialog(props: { onClose: () => void; onCreated: (id: number) => void })`.
  - 파일 입력 라벨 `DXF 파일`, 이름 입력 라벨 `도면 이름`, 단위 select 라벨 `단위` (unitGuessed 일 때만, 값 mm/cm/m), 버튼 `등록`.
  - 요약 문구 `벽 {n} · 가벽 {n} · 기둥 {n} · 구역 {n} · 객체 표기 {n}`, 지원 안 됨 `지원 안 됨: HATCH 12` (있을 때), 추정 `단위를 mm 로 추정했습니다`.
  - 선이 0개면 `도면에서 그릴 선을 찾지 못했습니다.` 표시하고 등록 버튼 비활성.
- Produces: `PlanPreview(props: { plan: Plan })` — `<canvas aria-label="도면 미리보기">`, `getContext('2d')` 가 null 이면 아무것도 안 그림.

- [ ] **Step 1: 실패 테스트 작성**

`web/src/drawing/AddDrawingDialog.test.tsx`:
```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AddDrawingDialog } from './AddDrawingDialog'
import { dxfText, line, rect } from './dxf/testDxf'

const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body })
const dxfFile = (text: string, name = '2공장.dxf') => new File([text], name, { type: 'application/dxf' })

function pick(file: File) {
  fireEvent.change(screen.getByLabelText('DXF 파일'), { target: { files: [file] } })
}

describe('도면 추가 창', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('파일을 고르면 해석 요약·이름, 등록하면 서버에 원본+plan 을 보냄', async () => {
    const fetch = vi.fn(async () => json(201, { id: 7, name: '2공장' }))
    vi.stubGlobal('fetch', fetch)
    const onCreated = vi.fn()
    render(<AddDrawingDialog onClose={vi.fn()} onCreated={onCreated} />)
    pick(dxfFile(dxfText({ insunits: 4, ents: [line('WALL', 0, 0, 20000, 0), rect('PARTITION', 0, 0, 2000, 1000), { type: 'HATCH', g: [[8, 'H']] }] })))
    expect(await screen.findByText('벽 1 · 가벽 1 · 기둥 0 · 구역 0 · 객체 표기 0')).toBeInTheDocument()
    expect(screen.getByText('지원 안 됨: HATCH 1')).toBeInTheDocument()
    expect(screen.getByLabelText('도면 이름')).toHaveValue('2공장')
    expect(screen.queryByLabelText('단위')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '등록' }))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(7))
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/drawings')
    const form = init.body as FormData
    expect(form.get('name')).toBe('2공장')
    expect(JSON.parse(String(form.get('plan'))).partitions).toHaveLength(1)
    expect((form.get('file') as File).name).toBe('2공장.dxf')
  })

  it('단위 추정이면 안내와 단위 선택, 바꾸면 크기 다시 계산', async () => {
    render(<AddDrawingDialog onClose={vi.fn()} onCreated={vi.fn()} />)
    pick(dxfFile(dxfText({ ents: [line('WALL', 0, 0, 5000, 0)] })))
    expect(await screen.findByText('단위를 mm 로 추정했습니다')).toBeInTheDocument()
    expect(screen.getByText('5.0 × 0.0 m')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('단위'), { target: { value: 'cm' } })
    expect(await screen.findByText('50.0 × 0.0 m')).toBeInTheDocument()
  })

  it('DWG 는 안내, 선이 없으면 등록 불가, 서버 오류는 표시', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(409, { detail: '같은 이름의 도면이 있습니다.' })))
    render(<AddDrawingDialog onClose={vi.fn()} onCreated={vi.fn()} />)
    pick(new File(['AC1032 binary'], 'a.dwg'))
    expect(await screen.findByText('DWG 파일은 읽을 수 없습니다. DXF(ASCII) 로 변환해 주세요 (ODA File Converter).')).toBeInTheDocument()
    pick(dxfFile(dxfText({ ents: [] }), 'empty.dxf'))
    expect(await screen.findByText('도면에서 그릴 선을 찾지 못했습니다.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '등록' })).toBeDisabled()
    pick(dxfFile(dxfText({ insunits: 6, ents: [line('WALL', 0, 0, 10, 0)] }), '중복.dxf'))
    await screen.findByText('벽 1 · 가벽 0 · 기둥 0 · 구역 0 · 객체 표기 0')
    fireEvent.click(screen.getByRole('button', { name: '등록' }))
    expect(await screen.findByText('같은 이름의 도면이 있습니다.')).toBeInTheDocument()
  })
})
```

Run: `npx vitest run src/drawing/AddDrawingDialog`
Expected: FAIL.

- [ ] **Step 2: 구현**

`web/src/drawing/PlanPreview.tsx`:
```tsx
import { useEffect, useRef } from 'react'
import type { Plan } from './plan/types'

/** 위에서 본 선 그림 (가벽 주황 굵게, 구역 반투명) — 등록 전 확인용 */
export function PlanPreview({ plan }: { plan: Plan }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    const W = cv.width, H = cv.height, pad = 8
    const k = Math.min((W - pad * 2) / (plan.bounds.w || 1), (H - pad * 2) / (plan.bounds.h || 1))
    const X = (x: number) => pad + x * k, Y = (y: number) => H - pad - y * k
    ctx.fillStyle = '#0e1013'
    ctx.fillRect(0, 0, W, H)
    const path = (pts: [number, number][], close: boolean) => {
      ctx.beginPath()
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))))
      if (close) ctx.closePath()
    }
    for (const z of plan.zones) {
      ctx.fillStyle = z.color + '40'
      path(z.poly, true)
      ctx.fill()
    }
    ctx.lineWidth = 1
    for (const l of plan.lines) {
      ctx.strokeStyle = l.color ?? plan.layers.find((x) => x.name === l.layer)?.color ?? '#ffffff'
      path(l.pts, l.closed)
      ctx.stroke()
    }
    ctx.lineWidth = 3
    ctx.strokeStyle = '#ff8c1a'
    for (const p of plan.partitions) {
      path(p.pts, false)
      ctx.stroke()
    }
  }, [plan])
  return <canvas ref={ref} className="plan-preview" width={560} height={280} aria-label="도면 미리보기" />
}
```

`web/src/drawing/AddDrawingDialog.tsx`:
```tsx
import { useState, type FormEvent } from 'react'
import { Modal } from '../components/Modal'
import { createDrawing } from './api'
import { interpretDxf } from './plan/interpret'
import type { Plan, UnitName } from './plan/types'
import { PlanPreview } from './PlanPreview'
import { readDxfFile } from './readDxfFile'

type Loaded = { file: File; text: string; plan: Plan; guessed: boolean }

/** 도면 추가: DXF 선택 → 브라우저에서 해석·미리보기 → 등록 */
export function AddDrawingDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const choose = async (file: File | undefined) => {
    setError(null)
    setLoaded(null)
    if (!file) return
    try {
      const text = readDxfFile(await file.arrayBuffer())
      const plan = interpretDxf(text)
      setLoaded({ file, text, plan, guessed: plan.warnings.unitGuessed })
      setName(file.name.replace(/\.[^.]+$/, ''))
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const setUnit = (unit: UnitName) => loaded && setLoaded({ ...loaded, plan: interpretDxf(loaded.text, { unit }) })
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!loaded) return
    setBusy(true)
    setError(null)
    try {
      const d = await createDrawing(loaded.file, name, loaded.plan, {})
      onCreated(d.id)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const p = loaded?.plan
  const empty = !!p && p.lines.length === 0
  const unsupported = p ? Object.entries(p.warnings.unsupported) : []
  return (
    <Modal title="도면 추가" onClose={onClose}>
      <form className="kp-form" onSubmit={submit}>
        <label className="kp-field">
          <span>DXF 파일</span>
          <input type="file" accept=".dxf,.DXF" onChange={(e) => choose(e.target.files?.[0])} />
        </label>
        {p && (
          <>
            <PlanPreview plan={p} />
            <p className="kp-desc">{`벽 ${p.walls.length} · 가벽 ${p.partitions.length} · 기둥 ${p.columns.length} · 구역 ${p.zones.length} · 객체 표기 ${p.objectHints.length}`}</p>
            <p className="kp-desc">{`${p.bounds.w.toFixed(1)} × ${p.bounds.h.toFixed(1)} m`}</p>
            {unsupported.length > 0 && <p className="kp-desc">{`지원 안 됨: ${unsupported.map(([k, v]) => `${k} ${v}`).join(', ')}`}</p>}
            {loaded.guessed && (
              <>
                <p className="kp-desc">{`단위를 ${p.unit} 로 추정했습니다`}</p>
                <label className="kp-field">
                  <span>단위</span>
                  <select className="kp-input" value={p.unit} onChange={(e) => setUnit(e.target.value as UnitName)}>
                    <option value="mm">mm</option>
                    <option value="cm">cm</option>
                    <option value="m">m</option>
                  </select>
                </label>
              </>
            )}
            {empty && <p className="kp-error-text">도면에서 그릴 선을 찾지 못했습니다.</p>}
            <label className="kp-field">
              <span>도면 이름</span>
              <input className="kp-input" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
            </label>
          </>
        )}
        {error && <p className="kp-error-text">{error}</p>}
        <div className="kp-modal-actions">
          <button type="button" className="kp-btn kp-btn-stroke" onClick={onClose}>취소</button>
          <button type="submit" className="kp-btn kp-btn-primary" disabled={!p || empty || !name.trim() || busy}>등록</button>
        </div>
      </form>
    </Modal>
  )
}
```
(“DWG 거부” 테스트: 같은 창에서 연속으로 파일을 고르므로 `choose` 가 매번 상태를 비운다. jsdom 의 `File.arrayBuffer` 가 없으면 `new Response(file).arrayBuffer()` 로 바꾼다.)

`FactoryPage.tsx` 연결:
- `const [adding, setAdding] = useState(false)`; `DrawingBar` 의 `onAdd={() => setAdding(true)}`.
- `{adding && <AddDrawingDialog onClose={() => setAdding(false)} onCreated={(id) => { setAdding(false); select(id); retry() }} />}` — 목록이 비어 있을 때도 열 수 있도록 `AppShell` 자식의 맨 끝(조건 밖) 에 둔다.

`app.css` 끝에 추가:
```css
.plan-preview { width: 100%; height: auto; border-radius: var(--kp-radius-sm); background: #0e1013; }
```

- [ ] **Step 3: 통과 확인**

Run: `npx vitest run && npm run build && ./node_modules/.bin/oxlint`
Expected: 전부 PASS.

- [ ] **Step 4: Commit**

```bash
cd /c/kopens/project/Factory3D && git add web
git commit -m "feat(web): 도면 추가 창 — DXF 해석 미리보기·요약·단위 선택·등록

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 관리자 › 도면 관리 (이름 변경 · 레이어 규칙 재해석 · 삭제)

**Files:**
- Create: `web/src/pages/admin/DrawingsPage.tsx`, `web/src/pages/admin/LayerRulesDialog.tsx`, `web/src/pages/admin/drawings.test.tsx`
- Modify: `web/src/pages/admin/AdminLayout.tsx` (탭), `web/src/routes.tsx` (`/admin/drawings`)

**Interfaces:**
- Consumes: `GET /api/drawings` (DrawingSummary 확장), `getDrawing`, `getSource`, `savePlan`, `renameDrawing`, `deleteDrawing` (Task 6), `readDxfFile` (Task 2), `reinterpretDxf`, `defaultRule` (Task 3), `Modal`, `when` (`pages/admin/format.ts`).
- Produces: 탭 `도면 관리` (`/admin/drawings`), 표 열 `이름 · 형식 · 크기 · 버전 · 등록자 · 수정일 · 관리`. 버튼 접근 이름: `이름 바꾸기`, `레이어 규칙`, `삭제` (행마다, `aria-label` 에 도면 이름 포함: `"나셀 공장 이름 바꾸기"` 등).
- Produces: `LayerRulesDialog(props: { id: number; onClose: () => void; onSaved: () => void })` — 레이어마다 `역할` select (값 wall/partition/column/zone/object/line, 표시 `외벽/낮은 가벽/기둥/구역/객체 표기/바닥 선`), 높이·두께 숫자 입력, 버튼 `저장 후 다시 해석`.

- [ ] **Step 1: 실패 테스트 작성**

`web/src/pages/admin/drawings.test.tsx`:
```tsx
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../../api/types'
import { StaticAuth } from '../../auth/auth'
import { dxfText, line } from '../../drawing/dxf/testDxf'
import { interpretDxf } from '../../drawing/plan/interpret'
import { routes } from '../../routes'

const ADMIN: User = { id: 1, username: 'admin', displayName: '관리자', role: 'ADMIN', enabled: true, mustChangePassword: false, locked: false, createdAt: '2026-11-12T00:00:00Z' }
const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body, arrayBuffer: async () => new ArrayBuffer(0) })
const SRC = dxfText({ insunits: 4, ents: [line('WALL', 0, 0, 10000, 0), line('외곽', 0, 0, 0, 5000)] })
const PLAN = interpretDxf(SRC)
const LIST = [{ id: 1, name: '나셀 공장', sourceType: 'dxf', version: 2, createdBy: 'system', updatedAt: '2026-11-12T00:00:00Z', width: 10, height: 5 }]

function show(handler: (url: string, init?: RequestInit) => unknown) {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const r = handler(url, init)
    if (r) return r
    if (url === '/api/drawings') return json(200, LIST)
    if (url === '/api/drawings/1') return json(200, { ...LIST[0], createdAt: '', plan: PLAN, layerRules: {} })
    if (url === '/api/drawings/1/source') return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode(SRC).buffer }
    return json(200, [])
  })
  vi.stubGlobal('fetch', fetch)
  render(
    <StaticAuth user={ADMIN}>
      <RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/admin/drawings'] })} />
    </StaticAuth>,
  )
  return fetch
}

describe('관리자 › 도면 관리', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('목록 (크기·버전·등록자)', async () => {
    show(() => null)
    const row = (await screen.findByText('나셀 공장', { selector: 'td' })).closest('tr')!
    expect(within(row).getByText('10.0 × 5.0 m')).toBeInTheDocument()
    expect(within(row).getByText('2')).toBeInTheDocument()
    expect(within(row).getByText('system')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '도면 관리' })).toHaveAttribute('aria-current', 'page')
  })

  it('레이어 규칙: 역할을 바꾸면 원본을 다시 해석해 버전과 함께 저장', async () => {
    const fetch = show(() => null)
    fireEvent.click(await screen.findByRole('button', { name: '나셀 공장 레이어 규칙' }))
    const role = await screen.findByLabelText('외곽 역할')
    expect(role).toHaveValue('line')
    fireEvent.change(role, { target: { value: 'wall' } })
    fireEvent.click(screen.getByRole('button', { name: '저장 후 다시 해석' }))
    await waitFor(() => expect(fetch.mock.calls.some(([, i]) => (i as RequestInit | undefined)?.method === 'PUT')).toBe(true))
    const put = fetch.mock.calls.find(([, i]) => (i as RequestInit | undefined)?.method === 'PUT')!
    expect(put[0]).toBe('/api/drawings/1/plan')
    const body = JSON.parse(String((put[1] as RequestInit).body))
    expect(body.version).toBe(2)
    expect(body.layerRules['외곽']).toMatchObject({ role: 'wall' })
    expect(body.plan.walls).toHaveLength(2)
  })

  it('이름 바꾸기·삭제 (확인 후)', async () => {
    const fetch = show((url, init) => {
      if (init?.method === 'PATCH') return json(200, { ...LIST[0], name: '1공장' })
      if (init?.method === 'DELETE') return { ok: true, status: 204, json: async () => undefined }
      return null
    })
    fireEvent.click(await screen.findByRole('button', { name: '나셀 공장 이름 바꾸기' }))
    fireEvent.change(screen.getByLabelText('새 이름'), { target: { value: '1공장' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/drawings/1', expect.objectContaining({ method: 'PATCH' })))
    fireEvent.click(screen.getByRole('button', { name: '나셀 공장 삭제' }))
    expect(screen.getByText(/원본 파일까지 삭제됩니다/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '삭제' }))
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/drawings/1', expect.objectContaining({ method: 'DELETE' })))
  })
})
```

Run: `npx vitest run src/pages/admin/drawings`
Expected: FAIL (`/admin/drawings` 없음).

- [ ] **Step 2: 구현**

`web/src/pages/admin/LayerRulesDialog.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { Modal } from '../../components/Modal'
import { getDrawing, getSource, savePlan, type DrawingDetail } from '../../drawing/api'
import { reinterpretDxf } from '../../drawing/plan/interpret'
import type { LayerRules, Role } from '../../drawing/plan/types'
import { readDxfFile } from '../../drawing/readDxfFile'

const ROLES: [Role, string][] = [
  ['wall', '외벽'], ['partition', '낮은 가벽'], ['column', '기둥'], ['zone', '구역'], ['object', '객체 표기'], ['line', '바닥 선'],
]

/** 레이어마다 역할·높이·두께 → 원본을 받아 브라우저에서 다시 해석해 저장 (보정·회전 유지) */
export function LayerRulesDialog({ id, onClose, onSaved }: { id: number; onClose: () => void; onSaved: () => void }) {
  const [detail, setDetail] = useState<DrawingDetail | null>(null)
  const [rules, setRules] = useState<LayerRules>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    getDrawing(id)
      .then((d) => {
        setDetail(d)
        setRules(Object.fromEntries(d.plan.layers.map((l) => [l.name, { role: l.role, height: l.height, thickness: l.thickness }])))
      })
      .catch((e: Error) => setError(e.message))
  }, [id])
  const set = (name: string, patch: Partial<LayerRules[string]>) => setRules((r) => ({ ...r, [name]: { ...r[name], ...patch } }))
  const save = async () => {
    if (!detail) return
    setBusy(true)
    setError(null)
    try {
      const text = readDxfFile(await getSource(id))
      const plan = reinterpretDxf(text, rules, detail.plan)
      await savePlan(id, detail.version, plan, rules)
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title={`레이어 규칙${detail ? ` — ${detail.name}` : ''}`} onClose={onClose}>
      {!detail && !error && <p className="kp-desc">불러오는 중…</p>}
      {detail && (
        <table className="kp-table">
          <thead>
            <tr><th>레이어</th><th>선 수</th><th>역할</th><th>높이(m)</th><th>두께(m)</th></tr>
          </thead>
          <tbody>
            {detail.plan.layers.map((l) => (
              <tr key={l.name}>
                <td><span className="swatch" style={{ background: l.color }} aria-hidden /> {l.name}</td>
                <td className="num">{l.count}</td>
                <td>
                  <select className="kp-input" aria-label={`${l.name} 역할`} value={rules[l.name]?.role} onChange={(e) => set(l.name, { role: e.target.value as Role })}>
                    {ROLES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                  </select>
                </td>
                <td><input className="kp-input" type="number" step="any" aria-label={`${l.name} 높이`} value={rules[l.name]?.height ?? 0} onChange={(e) => set(l.name, { height: Number(e.target.value) })} /></td>
                <td><input className="kp-input" type="number" step="any" aria-label={`${l.name} 두께`} value={rules[l.name]?.thickness ?? 0} onChange={(e) => set(l.name, { thickness: Number(e.target.value) })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {error && <p className="kp-error-text">{error}</p>}
      <div className="kp-modal-actions">
        <button type="button" className="kp-btn kp-btn-stroke" onClick={onClose}>취소</button>
        <button type="button" className="kp-btn kp-btn-primary" disabled={!detail || busy} onClick={save}>저장 후 다시 해석</button>
      </div>
    </Modal>
  )
}
```
주의: 역할을 바꿀 때 높이·두께가 이전 역할 값으로 남는다. 역할 select 의 `onChange` 는 그 역할의 기본값으로 높이·두께도 바꾼다: `set(l.name, { role: r, height: defaultFor(r).height, thickness: defaultFor(r).thickness })` — `defaultFor` 는 `rules.ts` 에 `export function roleDefaults(role: Role): { height: number; thickness: number }` 를 추가해 `DEFAULTS[role]` 를 돌려주게 하고 그것을 쓴다. (테스트: '외곽' 을 wall 로 → 높이 8.)

`web/src/pages/admin/DrawingsPage.tsx`:
```tsx
import { Layers, Pencil, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { apiJson } from '../../api/client'
import type { DrawingSummary } from '../../api/types'
import { Modal } from '../../components/Modal'
import { deleteDrawing, renameDrawing } from '../../drawing/api'
import { when } from './format'
import { LayerRulesDialog } from './LayerRulesDialog'

type Dialog = { kind: 'rename' | 'rules' | 'delete'; d: DrawingSummary } | null

/** 관리자 › 도면 관리: 목록 · 이름 바꾸기 · 레이어 규칙(재해석) · 삭제 */
export function DrawingsPage() {
  const [rows, setRows] = useState<DrawingSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [name, setName] = useState('')
  const load = useCallback(() => {
    apiJson<DrawingSummary[]>('/api/drawings').then(setRows).catch((e: Error) => setError(e.message))
  }, [])
  useEffect(load, [load])
  const done = () => {
    setDialog(null)
    load()
  }
  const run = async (f: () => Promise<unknown>) => {
    setError(null)
    try {
      await f()
      done()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const rename = (e: FormEvent) => {
    e.preventDefault()
    if (dialog) run(() => renameDrawing(dialog.d.id, name))
  }
  return (
    <section className="kp-card kp-section" aria-label="도면 관리">
      <div className="kp-section-head">
        <div>
          <h2>도면 관리</h2>
          <p className="kp-desc">등록된 도면의 이름·레이어 인식 규칙을 바꾸거나 삭제합니다.</p>
        </div>
      </div>
      {error && <p className="kp-error-text">{error}</p>}
      {rows === null ? (
        <p className="kp-desc">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="kp-desc">등록된 도면이 없습니다.</p>
      ) : (
        <table className="kp-table">
          <thead>
            <tr><th>이름</th><th>형식</th><th>크기</th><th>버전</th><th>등록자</th><th>수정일</th><th>관리</th></tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id}>
                <td>{d.name}</td>
                <td className="mono">{d.sourceType.toUpperCase()}</td>
                <td>{d.width != null && d.height != null ? `${d.width.toFixed(1)} × ${d.height.toFixed(1)} m` : '—'}</td>
                <td className="num">{d.version}</td>
                <td className="mono">{d.createdBy ?? '—'}</td>
                <td>{when(d.updatedAt)}</td>
                <td className="actions">
                  <button className="kp-btn kp-btn-stroke kp-btn-xs" aria-label={`${d.name} 이름 바꾸기`} onClick={() => { setName(d.name); setDialog({ kind: 'rename', d }) }}>
                    <Pencil size={14} aria-hidden />
                  </button>
                  <button className="kp-btn kp-btn-stroke kp-btn-xs" aria-label={`${d.name} 레이어 규칙`} onClick={() => setDialog({ kind: 'rules', d })}>
                    <Layers size={14} aria-hidden />
                  </button>
                  <button className="kp-btn kp-btn-stroke kp-btn-xs" aria-label={`${d.name} 삭제`} onClick={() => setDialog({ kind: 'delete', d })}>
                    <Trash2 size={14} aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {dialog?.kind === 'rename' && (
        <Modal title="이름 바꾸기" onClose={() => setDialog(null)}>
          <form className="kp-form" onSubmit={rename}>
            <label className="kp-field">
              <span>새 이름</span>
              <input className="kp-input" value={name} maxLength={100} autoFocus onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="kp-modal-actions">
              <button type="button" className="kp-btn kp-btn-stroke" onClick={() => setDialog(null)}>취소</button>
              <button type="submit" className="kp-btn kp-btn-primary" disabled={!name.trim()}>저장</button>
            </div>
          </form>
        </Modal>
      )}
      {dialog?.kind === 'rules' && <LayerRulesDialog id={dialog.d.id} onClose={() => setDialog(null)} onSaved={done} />}
      {dialog?.kind === 'delete' && (
        <Modal title="도면 삭제" onClose={() => setDialog(null)}>
          <p className="kp-desc">{`'${dialog.d.name}' 도면을 삭제합니다. 원본 파일까지 삭제됩니다.`}</p>
          <div className="kp-modal-actions">
            <button type="button" className="kp-btn kp-btn-stroke" onClick={() => setDialog(null)}>취소</button>
            <button type="button" className="kp-btn kp-btn-danger-fill" onClick={() => run(() => deleteDrawing(dialog.d.id))}>삭제</button>
          </div>
        </Modal>
      )}
    </section>
  )
}
```
- `kp-btn-ghost`·`kp-btn-xs`·`kp-form`·`kp-modal-actions`·`actions` 클래스는 `UsersPage.tsx` 가 실제로 쓰는 이름으로 맞춘다 (`grep -n "className" web/src/pages/admin/UsersPage.tsx | head -40` 로 확인).
- 행의 `<td>` 이름은 테스트가 `selector: 'td'` 로 찾으므로 이름 칸은 글자만 둔다.
- `swatch` 스타일을 `app.css` 끝에 추가: `.swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; vertical-align: middle; }`

`AdminLayout.tsx` 의 탭에 `감사 기록` 다음으로 추가: `<NavLink to="/admin/drawings">도면 관리</NavLink>`.

`routes.tsx` 의 `/admin` children 에 추가: `{ path: 'drawings', element: <DrawingsPage /> }` (+ import).

- [ ] **Step 3: 통과 확인**

Run: `npx vitest run && npm run build && ./node_modules/.bin/oxlint`
Expected: 전부 PASS.

- [ ] **Step 4: Commit**

```bash
cd /c/kopens/project/Factory3D && git add web
git commit -m "feat(web): 관리자 도면 관리 — 목록·이름 바꾸기·레이어 규칙 재해석·삭제

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 실제 화면 확인 (jar · Edge) + README

**Files:**
- Create: `web/e2e/fixtures/small.dxf`, `web/e2e/p2-smoke.mjs`
- Modify: `README.md`

**Interfaces:**
- Consumes: 전부. `web/e2e/p1-smoke.mjs` (첫 로그인·비밀번호 변경) 실행 방식.

- [ ] **Step 1: 시험용 작은 DXF 와 확인 스크립트 작성**

`web/e2e/fixtures/small.dxf` (줄 끝 LF, 그대로):
```
0
SECTION
2
HEADER
9
$INSUNITS
70
4
0
ENDSEC
0
SECTION
2
ENTITIES
0
LINE
8
WALL
10
0
20
0
11
30000
21
0
0
LINE
8
WALL
10
30000
20
0
11
30000
21
15000
0
LINE
8
PARTITION
10
10000
20
0
11
10000
21
8000
0
ENDSEC
0
EOF
```

`web/e2e/p2-smoke.mjs`:
```js
// P2 실제 화면 확인 (Edge): 기본 도면 3D · 도면 보기 · 거리 측정 · 도면 추가 · 관리자 도면 관리. 스크린샷 e2e/shots/p2-*
// 사용: node e2e/p2-smoke.mjs <주소> <아이디> <비밀번호>   (비밀번호 변경이 끝난 계정)
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const [base = 'http://localhost:8080', id = 'admin', pw = 'Factory3d1!'] = process.argv.slice(2)
mkdirSync('e2e/shots', { recursive: true })
const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const fail = (msg) => {
  console.error('실패:', msg)
  process.exitCode = 1
}
try {
  await page.goto(base + '/login')
  await page.getByLabel('아이디').fill(id)
  await page.getByLabel('비밀번호').fill(pw)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL((u) => u.pathname === '/')
  const select = page.getByRole('combobox', { name: '도면 선택' })
  await page.getByText('나셀 공장', { exact: true }).first().waitFor()
  if ((await select.locator('option:checked').textContent()) !== '나셀 공장') fail('기본 도면이 선택되지 않음')
  await page.locator('.factory-view canvas').waitFor()
  await page.waitForTimeout(3000) // 첫 렌더·그림자
  await page.screenshot({ path: 'e2e/shots/p2-1-factory-3d.png' })

  await page.getByRole('button', { name: '도면 보기' }).click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'e2e/shots/p2-2-plan-view.png' })
  await page.getByRole('button', { name: '3D 보기' }).click()

  await page.getByRole('button', { name: /거리 측정/ }).click()
  const box = await page.locator('.factory-view canvas').boundingBox()
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.5)
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.5)
  const hint = await page.locator('.tool-hint').textContent()
  if (!/^거리 \d+\.\d\d m$/.test(hint ?? '')) fail(`측정 결과 문구가 이상함: ${hint}`)
  await page.screenshot({ path: 'e2e/shots/p2-3-measure.png' })
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: /도면 추가/ }).click()
  await page.getByLabel('DXF 파일').setInputFiles(fileURLToPath(new URL('./fixtures/small.dxf', import.meta.url)))
  await page.getByText('벽 2 · 가벽 1 · 기둥 0 · 구역 0 · 객체 표기 0').waitFor()
  await page.getByLabel('도면 이름').fill(`시험 도면 ${Date.now()}`)
  await page.screenshot({ path: 'e2e/shots/p2-4-add-dialog.png' })
  await page.getByRole('button', { name: '등록' }).click()
  await page.waitForTimeout(2000)
  if (!(await select.locator('option:checked').textContent())?.startsWith('시험 도면')) fail('새 도면이 선택되지 않음')
  await page.screenshot({ path: 'e2e/shots/p2-5-added.png' })

  await page.goto(base + '/admin/drawings')
  await page.getByRole('heading', { name: '도면 관리' }).waitFor()
  const rows = await page.locator('table.kp-table tbody tr').count()
  if (rows < 2) fail(`도면 관리 표 행이 ${rows}개`)
  await page.screenshot({ path: 'e2e/shots/p2-6-admin-drawings.png' })
} catch (e) {
  fail(e.message)
} finally {
  await browser.close()
}
console.log(process.exitCode ? 'P2 화면 확인 실패' : 'P2 화면 확인 통과')
```

- [ ] **Step 2: jar 빌드 · 깨끗한 DB 로 실행 · P1 스크립트로 첫 로그인 · P2 확인**

```bash
cd /c/kopens/project/Factory3D/server && ./gradlew bootJar
PGPASSWORD=factory3d "/c/Program Files/PostgreSQL/17/bin/psql.exe" -h localhost -p 5433 -U factory3d -d factory3d -c "drop schema public cascade; create schema public;"
rm -rf /c/kopens/project/Factory3D/data
```
그 다음 서버를 백그라운드로 실행 (8080 이 비어 있는지 먼저 확인; JDK 21 은 `ls ~/.gradle/jdks`):
```bash
cd /c/kopens/project/Factory3D/server && F3D_ADMIN_PASSWORD=Start1234 F3D_DATA_DIR=/c/kopens/project/Factory3D/data "$HOME/.gradle/jdks/<jdk21 폴더>/bin/java" -jar build/libs/factory3d.jar
```
`curl -s localhost:8080/api/health` 가 ok 가 될 때까지 기다린 뒤:
```bash
cd /c/kopens/project/Factory3D/web && node e2e/p1-smoke.mjs http://localhost:8080 Start1234 Factory3d1! && node e2e/p2-smoke.mjs http://localhost:8080 admin Factory3d1!
```
Expected: `P1 화면 확인 통과 …` 그리고 `P2 화면 확인 통과`. 서버 로그에 `데이터 폴더: C:\kopens\project\Factory3D\data` 와 `기본 도면 '나셀 공장' 을 넣었습니다`.

- [ ] **Step 3: 스크린샷 눈으로 확인**

`web/e2e/shots/p2-1-factory-3d.png` ~ `p2-6-admin-drawings.png` 를 Read 로 열어 확인하고 보고서에 적는다:
- p2-1: 콘크리트 바닥, 외벽(골강판), 낮은 가벽(밝은 회색, 사람 허리 높이), 기둥, 구역 바닥 색과 이름 글자, 왼쪽 아래 정보 카드 `나셀 공장 · 1xx.x × 6x.x m · 단위 mm`, 오른쪽 위 도구줄.
- p2-2: 어두운 바탕에 흰 선, 위에서 내려다봄.
- p2-3: 파란 점 2개와 선, `거리 n.nn m`.
- p2-4: 미리보기 canvas 에 선, 요약 문구.
- p2-5: 새 도면 3D.
- p2-6: 관리자 도면 관리 표 2행 이상.
화면이 깨져 보이면(예: 아무것도 안 보임, 벽이 공중에 뜸) 원인을 조사해 고치고(해당 Task 의 파일) 다시 확인한다 — 고친 내용은 보고서에 적는다.

서버 프로세스를 반드시 종료한다.

- [ ] **Step 4: README 갱신**

`README.md` 의 `## 테스트` 블록 마지막 줄 아래에 추가:
```
cd web && node e2e/p2-smoke.mjs http://localhost:8080 admin <비밀번호>   # 비밀번호 변경을 마친 계정으로: 3D·도면 보기·측정·도면 추가·도면 관리
```
그리고 `## 개발 실행` 아래에 단락 추가:
```
### 도면
- 처음 실행하면 기본 도면 '나셀 공장'(demo 의 main_factory.dxf)이 들어갑니다.
- DXF(ASCII)만 올릴 수 있습니다. DWG 는 ODA File Converter 로 변환하세요.
- 레이어 이름으로 역할을 정합니다: PARTITION/칸막이/가벽 → 낮은 가벽(1.2m), WALL/벽 → 외벽(8m), COLUMN/기둥 → H빔, STATION/ZONE/구역 → 구역, EQUIP/설비 → 객체 표기. 관리자 › 도면 관리에서 도면마다 바꿀 수 있습니다.
- 해석기(web/src/drawing)를 바꾸면 `cd web && npm run seed:plan` 으로 기본 도면 plan 을 다시 만드세요.
```

- [ ] **Step 5: Commit**

```bash
cd /c/kopens/project/Factory3D && git add web/e2e/p2-smoke.mjs web/e2e/fixtures README.md
git commit -m "chore: P2 실제 화면 확인 스크립트 · README 도면 안내

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
(Step 3 에서 고친 코드가 있으면 그 파일도 함께 커밋하고 메시지에 적는다.)
