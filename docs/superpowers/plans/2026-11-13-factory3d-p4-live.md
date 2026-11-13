# Factory3D P4 실시간 상황판 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 서버 가상 MES(ProductionSource → VirtualMes)가 공정이 있는 도면을 1초마다 진행해 WebSocket(`/ws/live`)으로 보내고, 화면 `/dashboard` 가 demo 상황판(KPI 줄·스테이션 칩·바닥 링·이벤트 줄·제작/자재 서랍)을 게이지 애니메이션과 함께 그리며, 관리자 › 공정·생산 기준정보로 공정·PJT 를 고치고, 나셀 공장 기본 공정 6개·PJT 4개를 넣는다.

**Architecture:** 서버는 `station`(기준정보: `station`·`project` 표·API·시드)과 `live`(VirtualMes·스케줄러·WebSocket) 두 패키지로 나눈다. VirtualMes 는 메모리 상태를 `advance(dt)` 로만 바꾸고(테스트가 직접 부름), 기준정보 저장은 `StationsChanged` 이벤트(커밋 뒤)로, 도면 삭제는 `DrawingDeleted` 이벤트로 받는다. 화면은 순수 계산(reducer·게이지·칩 겹침 회피·보간)을 `web/src/dashboard/` 에 두고 vitest 로 검증하며, 3D 쪽은 `FactoryScene` 에 링 레이어·화면 좌표 콜백·전체 보기만 더한다.

**Tech Stack:** Spring Boot 4.1.1 (webmvc · websocket · security · session-jdbc) · MyBatis · PostgreSQL 17 · Jackson 3 (`tools.jackson.databind`) / React 19 · TS · three@0.186.1 · lucide-react · vitest · Playwright(Edge)

**Spec:** `docs/superpowers/specs/2026-11-13-factory3d-p4-live-design.md` (전체 설계 `docs/superpowers/specs/2026-11-12-factory3d-platform-design.md` §5.3·§5.5·§5.8)

## Global Constraints

- 프로젝트 루트 `C:\kopens\project\Factory3D`. `C:\kopens\project\demo`, `C:\kopens\project\3D_WEB` 는 **수정 금지** (읽고 복사만).
- Docker·Testcontainers 금지. 서버 테스트는 로컬 PostgreSQL 17 `localhost:5433` 의 `factory3d_test` (support/IntegrationTest — 매 테스트 전 `pg_tables` 의 모든 표를 truncate 하므로 새 표는 자동 포함, 데이터 폴더 비움).
- 이름 규칙: Java 패키지 `com.kopens.factory3d`, 설정 `factory3d.*`, 환경 변수 `F3D_*`, localStorage `f3d:*`.
- 권한: 조회 이상 = 상황판 보기(`GET /api/**`, `/ws/**`), 관리자 = 공정·PJT 추가·수정·삭제·순서. 운전원은 기준정보를 보기만.
- 상태 판정(demo 그대로): `목표 − 실적 ≤ warn_pp` → `ok`(진행중, `#22c55e`), `≤ delay_pp` → `warn`(주의, `#f59e0b`), 초과 → `bad`(지연, `#ef4444`). 기본 warn 10 · delay 20.
- 가상 시간 = 실제 경과 초 × `factory3d.live.time-scale`(`F3D_LIVE_TIME_SCALE`, 기본 1). 날짜는 `factory3d.time-zone`(기본 Asia/Seoul).
- WebSocket 메시지 모양은 spec §3.2 그대로(서버 `LiveMessages` = 화면 `dashboard/types.ts`). 이벤트 kind 6종: `step_start`·`step_done`·`unit_done`·`status_change`·`material_in`·`move`.
- Jackson 3: `ObjectMapper` 는 `tools.jackson.databind.ObjectMapper`, 주석(`@JsonIgnore` 등)은 `com.fasterxml.jackson.annotation.*`.
- 모든 사용자 문구·오류는 한국어. `border-left` 강조선·이모지 금지, 아이콘 lucide-react, 라벨 약 13~15px.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. `.superpowers/` 는 커밋하지 않음.
- 웹: `cd web && npx vitest run` (출력에 경고 없이), `npm run build`, `./node_modules/.bin/oxlint`. 서버: `cd server && ./gradlew test`.
- TS 설정: verbatimModuleSyntax(`import type`), noUnusedLocals, erasableSyntaxOnly(매개변수 속성 금지). 세미콜론 없음, 작은따옴표.

## 파일 구조

```
server/build.gradle                                   (spring-boot-starter-websocket)
server/src/main/resources/application.yml             (factory3d.live.*)
server/src/main/resources/db/migration/V5__station_live.sql
server/src/main/resources/mapper/StationMapper.xml · ProjectMapper.xml
server/src/main/resources/seed/main_factory.stations.json
server/src/main/java/com/kopens/factory3d/
  station/ StationView · ProjectView · StationMapper · ProjectMapper · StationService · ProjectService
           StationController · ProjectController · StationsChanged · StationSeeder
  live/    LiveMessages · LiveListener · ProductionSource · VirtualMes · LiveScheduler · LiveConfig
           LiveSocketHandler · WebSocketConfig
  drawing/ DrawingDeleted · DrawingService(삭제 이벤트) · DrawingSeeder(공정 시드 순서)
  common/SecurityConfig.java (기준정보 쓰기 관리자, /ws/** 조회 이상)
server/src/test/java/com/kopens/factory3d/
  station/ StationApiTest · StationSeedTest
  live/    VirtualMesTest · LiveSocketTest
  support/IntegrationTest.java (factory3d.live.enabled=false)

web/src/dashboard/
  types.ts · liveReducer.ts · gauge.ts · chipLayout.ts · tween.ts · status.ts   (+ live.test.ts)
  useLive.ts (+ useLive.test.ts) · api.ts
  KpiBar.tsx · StationChip.tsx · ChipLayer.tsx · EventTicker.tsx · LiveDrawer.tsx · LiveBadge.tsx (+ components.test.tsx)
web/src/scene/ringLayer.ts · dashView.ts (+ ringLayer.test.ts · dashView.test.ts)
web/src/scene/FactoryScene.ts (DashHost) · FactoryView.tsx · navigation.ts (flyTo) · objectLayer.ts (top)
web/src/pages/DashboardPage.tsx (+ dashboard.test.tsx) · routes.tsx · layout/IconRail.tsx
web/src/pages/admin/StationsPage.tsx · stationForm.ts · AdminLayout.tsx (+ stations.test.tsx)
web/src/styles/app.css · web/e2e/p4-smoke.mjs · README.md
```

---

### Task 1: 서버 — 공정·PJT 기준정보 표(V5) · API · 권한 · 감사

**Files:**
- Create: `server/src/main/resources/db/migration/V5__station_live.sql`
- Create: `server/src/main/java/com/kopens/factory3d/station/{StationView,ProjectView,StationMapper,ProjectMapper,StationService,ProjectService,StationController,ProjectController,StationsChanged}.java`, `server/src/main/resources/mapper/{StationMapper,ProjectMapper}.xml`
- Modify: `server/src/main/java/com/kopens/factory3d/common/SecurityConfig.java`
- Test: `server/src/test/java/com/kopens/factory3d/station/StationApiTest.java`

**Interfaces:**
- Consumes: `AuditService.log/logAs`, `DrawingMapper.findById`, `TextArrayHandler` (model), `BadRequestException`·`ConflictException`·`NotFoundException` (common).
- Produces (REST): spec §3.3 표 그대로. 공정 JSON `{id,no,name,placementName,steps,taktSec,warnPp,delayPp,projectId,countsProject,materials}` (순서대로), PJT JSON `{id,name,done,total,period,state,sortOrder}`.
- Produces (Java, Task 2·3 이 씀):
  - `record StationView(long id, int no, String name, String placementName, List<String> steps, int taktSec, int warnPp, int delayPp, Long projectId, boolean countsProject, List<String> materials)`
  - `record ProjectView(long id, String name, int done, int total, String period, String state, int sortOrder)`
  - `StationMapper.findByDrawing(long): List<StationView>`, `countByDrawing(long): int`, `insert(long drawingId, Row row)` (`Row`: `id,no,name,placementName,steps(String[]),taktSec,warnPp,delayPp,projectId,countsProject,materials(String[])`)
  - `ProjectMapper.findByDrawing(long): List<ProjectView>`, `countByDrawing(long): int`, `insert(long drawingId, Row row)` (`Row`: `id,name,done,total,period,state,sortOrder`), `setDone(long id, int done)`
  - `record StationsChanged(long drawingId)` — 기준정보가 바뀔 때마다(같은 트랜잭션 안에서) 발행.
- Produces (DB): `project`, `station`, `live_daily` 표.

- [ ] **Step 1: 마이그레이션 작성**

`server/src/main/resources/db/migration/V5__station_live.sql`:
```sql
-- PJT (제작 현황): 도면별. 상황판 서랍의 제작 현황 표 · 메인 스테이션 칩의 'PJT #호기'
create table project (
    id          bigserial    primary key,
    drawing_id  bigint       not null references drawing (id) on delete cascade,
    name        varchar(100) not null,
    done        int          not null default 0,
    total       int          not null,
    period      varchar(40),
    state       varchar(8)   not null default 'run' check (state in ('run', 'wait', 'done')),
    sort_order  int          not null default 0,
    check (total >= 1 and done >= 0 and done <= total),
    unique (drawing_id, name)
);

-- 공정 기준정보: sort_order = 칩 번호 1..n, placement_name = 칩을 붙일 같은 도면의 배치 이름
create table station (
    id              bigserial    primary key,
    drawing_id      bigint       not null references drawing (id) on delete cascade,
    sort_order      int          not null,
    name            varchar(100) not null,
    placement_name  varchar(100),
    steps           text[]       not null check (cardinality(steps) between 1 and 40),
    takt_sec        int          not null default 1200 check (takt_sec between 60 and 604800),
    warn_pp         int          not null default 10,
    delay_pp        int          not null default 20,
    project_id      bigint       references project (id) on delete set null,
    counts_project  boolean      not null default false,
    materials       text[]       not null default '{}',
    check (warn_pp >= 0 and warn_pp < delay_pp and delay_pp <= 100),
    unique (drawing_id, name)
);
create index station_drawing on station (drawing_id, sort_order);

-- 오늘 완료 수 (factory3d.time-zone 날짜). 진행 상태는 메모리, 이 값과 project.done 만 DB
create table live_daily (
    drawing_id  bigint not null references drawing (id) on delete cascade,
    day         date   not null,
    done        int    not null default 0,
    primary key (drawing_id, day)
);
```

- [ ] **Step 2: 실패 테스트 작성**

`server/src/test/java/com/kopens/factory3d/station/StationApiTest.java`:
```java
package com.kopens.factory3d.station;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.jayway.jsonpath.JsonPath;
import com.kopens.factory3d.support.IntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

class StationApiTest extends IntegrationTest {
    static final RequestPostProcessor VIEWER = user("viewer").roles("VIEWER");
    static final RequestPostProcessor OPERATOR = user("kim").roles("OPERATOR");
    static final RequestPostProcessor ADMIN = user("admin").roles("ADMIN");
    long drawing;
    long other;

    @BeforeEach
    void setUp() {
        drawing = jdbc.queryForObject("insert into drawing (name, source_type, source_file) values ('공장', 'dxf', 'x') returning id", Long.class);
        other = jdbc.queryForObject("insert into drawing (name, source_type, source_file) values ('2공장', 'dxf', 'x') returning id", Long.class);
    }

    private ResultActions send(MockHttpServletRequestBuilder req, String json, RequestPostProcessor who) throws Exception {
        return mvc.perform(req.contentType(MediaType.APPLICATION_JSON).content(json).with(who).with(csrf()));
    }

    private static long id(ResultActions r) throws Exception {
        return ((Number) JsonPath.read(r.andReturn().getResponse().getContentAsString(), "$.id")).longValue();
    }

    private String stations() {
        return "/api/drawings/" + drawing + "/stations";
    }

    private long station(String name) throws Exception {
        return id(send(post(stations()), "{\"name\":\"" + name + "\",\"steps\":[\"a\",\"b\"]}", ADMIN).andExpect(status().isCreated()));
    }

    private long project(long drawingId, String name) throws Exception {
        return id(send(post("/api/drawings/" + drawingId + "/projects"),
                "{\"name\":\"" + name + "\",\"done\":3,\"total\":13,\"period\":\"'25.09~'27.03\"}", ADMIN).andExpect(status().isCreated()));
    }

    private int audits(String action) {
        return jdbc.queryForObject("select count(*) from audit_log where action = ?", Integer.class, action);
    }

    @Test
    void 관리자만_추가하고_조회는_누구나() throws Exception {
        send(post(stations()), "{\"name\":\"Hub 조립장\",\"steps\":[\"a\"]}", OPERATOR).andExpect(status().isForbidden());
        long pjt = project(drawing, "야월해상");
        send(post(stations()), "{\"name\":\"Hub 조립장\",\"placementName\":\"Hub 조립장\",\"steps\":[\" Hub Casting 세팅 \",\"Pitch Bearing 장착\"],"
                + "\"taktSec\":1800,\"projectId\":" + pjt + ",\"countsProject\":true,\"materials\":[\"Hub Casting\"]}", ADMIN)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.no").value(1))
                .andExpect(jsonPath("$.placementName").value("Hub 조립장"))
                .andExpect(jsonPath("$.steps[0]").value("Hub Casting 세팅"))
                .andExpect(jsonPath("$.taktSec").value(1800))
                .andExpect(jsonPath("$.warnPp").value(10))
                .andExpect(jsonPath("$.delayPp").value(20))
                .andExpect(jsonPath("$.projectId").value(pjt))
                .andExpect(jsonPath("$.countsProject").value(true))
                .andExpect(jsonPath("$.materials[0]").value("Hub Casting"));
        station("Main Station 3");
        mvc.perform(get(stations()).with(VIEWER))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[1].name").value("Main Station 3"))
                .andExpect(jsonPath("$[1].no").value(2))
                .andExpect(jsonPath("$[1].taktSec").value(1200));
        mvc.perform(get("/api/drawings/" + drawing + "/projects").with(VIEWER))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("야월해상"))
                .andExpect(jsonPath("$[0].done").value(3))
                .andExpect(jsonPath("$[0].state").value("run"));
        mvc.perform(get("/api/drawings/999999/stations").with(VIEWER)).andExpect(status().isNotFound());
        assertThat(audits("STATION_CREATE")).isEqualTo(2);
        assertThat(audits("PROJECT_CREATE")).isEqualTo(1);
    }

    @Test
    void 잘못된_공정은_한국어_오류() throws Exception {
        send(post(stations()), "{\"name\":\" \",\"steps\":[\"a\"]}", ADMIN)
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("공정 이름은 1~100자로 입력하세요."));
        send(post(stations()), "{\"name\":\"A\",\"steps\":[]}", ADMIN)
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("step 은 1~40개, 각 1~100자로 입력하세요."));
        send(post(stations()), "{\"name\":\"A\",\"steps\":[\"a\"],\"taktSec\":59}", ADMIN)
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("택타임은 60~604800초(1분~7일)여야 합니다."));
        send(post(stations()), "{\"name\":\"A\",\"steps\":[\"a\"],\"warnPp\":20,\"delayPp\":20}", ADMIN)
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("주의·지연 기준은 0 ≤ 주의 < 지연 ≤ 100 이어야 합니다."));
        long otherPjt = project(other, "다른 PJT");
        send(post(stations()), "{\"name\":\"A\",\"steps\":[\"a\"],\"projectId\":" + otherPjt + "}", ADMIN)
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("이 도면의 PJT 가 아닙니다."));
        station("A");
        send(post(stations()), "{\"name\":\"A\",\"steps\":[\"a\"]}", ADMIN)
                .andExpect(status().isConflict()).andExpect(jsonPath("$.detail").value("같은 이름의 공정이 있습니다."));
        send(post("/api/drawings/999999/stations"), "{\"name\":\"B\",\"steps\":[\"a\"]}", ADMIN).andExpect(status().isNotFound());
    }

    @Test
    void 부분_수정하고_지우면_번호를_다시_매김() throws Exception {
        long a = station("A");
        long b = station("B");
        station("C");
        long pjt = project(drawing, "야월해상");
        send(patch("/api/stations/" + b), "{\"taktSec\":600,\"projectId\":" + pjt + "}", OPERATOR).andExpect(status().isForbidden());
        send(patch("/api/stations/" + b), "{\"taktSec\":600,\"projectId\":" + pjt + "}", ADMIN)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("B"))
                .andExpect(jsonPath("$.taktSec").value(600))
                .andExpect(jsonPath("$.steps.length()").value(2))
                .andExpect(jsonPath("$.projectId").value(pjt));
        send(patch("/api/stations/" + b), "{\"clearProject\":true,\"placementName\":\"Main Station 1\"}", ADMIN)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.placementName").value("Main Station 1"))
                .andExpect(jsonPath("$.taktSec").value(600));
        assertThat(jdbc.queryForObject("select project_id from station where id = ?", Long.class, b)).isNull();
        mvc.perform(delete("/api/stations/" + a).with(OPERATOR).with(csrf())).andExpect(status().isForbidden());
        mvc.perform(delete("/api/stations/" + a).with(ADMIN).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(get(stations()).with(VIEWER))
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].name").value("B"))
                .andExpect(jsonPath("$[0].no").value(1))
                .andExpect(jsonPath("$[1].no").value(2));
        assertThat(audits("STATION_UPDATE")).isEqualTo(2);
        assertThat(audits("STATION_DELETE")).isEqualTo(1);
    }

    @Test
    void 순서_바꾸기는_모든_공정을_한_번씩() throws Exception {
        long a = station("A");
        long b = station("B");
        long c = station("C");
        String order = stations() + "/order";
        send(put(order), "[" + c + "," + a + "," + b + "]", OPERATOR).andExpect(status().isForbidden());
        send(put(order), "[" + c + "," + a + "," + b + "]", ADMIN)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("C"))
                .andExpect(jsonPath("$[0].no").value(1))
                .andExpect(jsonPath("$[2].name").value("B"))
                .andExpect(jsonPath("$[2].no").value(3));
        send(put(order), "[" + c + "," + a + "]", ADMIN)
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("순서에는 이 도면의 모든 공정이 한 번씩 있어야 합니다."));
        send(put(order), "[" + c + "," + a + "," + a + "]", ADMIN).andExpect(status().isBadRequest());
        assertThat(audits("STATION_ORDER")).isEqualTo(1);
    }

    @Test
    void PJT_검사·수정·삭제하면_공정의_PJT_비움() throws Exception {
        String projects = "/api/drawings/" + drawing + "/projects";
        long pjt = project(drawing, "야월해상");
        send(post(projects), "{\"name\":\"야월해상\",\"total\":13}", ADMIN)
                .andExpect(status().isConflict()).andExpect(jsonPath("$.detail").value("같은 이름의 PJT 가 있습니다."));
        send(post(projects), "{\"name\":\"B\",\"done\":14,\"total\":13}", ADMIN)
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("제작 수는 0 ≤ 제작 ≤ 전체, 전체 ≥ 1 이어야 합니다."));
        send(post(projects), "{\"name\":\"B\",\"total\":13,\"state\":\"x\"}", ADMIN)
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("상태는 run, wait, done 중 하나입니다."));
        send(post(projects), "{\"name\":\"B\",\"total\":13}", OPERATOR).andExpect(status().isForbidden());
        send(patch("/api/projects/" + pjt), "{\"done\":1}", OPERATOR).andExpect(status().isForbidden());
        send(patch("/api/projects/" + pjt), "{\"done\":4,\"state\":\"wait\"}", ADMIN)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.done").value(4))
                .andExpect(jsonPath("$.state").value("wait"))
                .andExpect(jsonPath("$.total").value(13))
                .andExpect(jsonPath("$.period").value("'25.09~'27.03"));
        long s = id(send(post(stations()), "{\"name\":\"A\",\"steps\":[\"a\"],\"projectId\":" + pjt + "}", ADMIN).andExpect(status().isCreated()));
        mvc.perform(delete("/api/projects/" + pjt).with(ADMIN).with(csrf())).andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("select project_id from station where id = ?", Long.class, s)).isNull();
        assertThat(audits("PROJECT_UPDATE")).isEqualTo(1);
        assertThat(audits("PROJECT_DELETE")).isEqualTo(1);
    }
}
```

Run: `cd /c/kopens/project/Factory3D/server && ./gradlew test --tests "*StationApiTest"`
Expected: FAIL (컴파일 오류 — station 패키지 없음).

- [ ] **Step 3: 구현 — 보기·매퍼**

`station/StationView.java`:
```java
package com.kopens.factory3d.station;

import java.util.List;

/** 공정 기준정보 한 개. no = 칩 번호(순서 1..n), placementName = 칩을 붙일 같은 도면 배치 이름 */
public record StationView(long id, int no, String name, String placementName, List<String> steps, int taktSec, int warnPp,
        int delayPp, Long projectId, boolean countsProject, List<String> materials) {}
```

`station/ProjectView.java`:
```java
package com.kopens.factory3d.station;

/** PJT (제작 현황). state: run 진행 · wait 대기 · done 완료 */
public record ProjectView(long id, String name, int done, int total, String period, String state, int sortOrder) {}
```

`station/StationMapper.java`:
```java
package com.kopens.factory3d.station;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface StationMapper {
    List<StationView> findByDrawing(long drawingId);

    StationView findById(long id);

    Long drawingOf(long id);

    int countByDrawing(long drawingId);

    boolean existsByName(@Param("drawingId") long drawingId, @Param("name") String name, @Param("excludeId") Long excludeId);

    void insert(@Param("drawingId") long drawingId, @Param("row") Row row);

    void update(@Param("id") long id, @Param("row") Row row);

    void setOrder(@Param("id") long id, @Param("no") int no);

    void delete(long id);

    /** 추가·수정용 (no = sort_order) */
    final class Row {
        public Long id;
        public int no;
        public String name;
        public String placementName;
        public String[] steps;
        public int taktSec;
        public int warnPp;
        public int delayPp;
        public Long projectId;
        public boolean countsProject;
        public String[] materials;
    }
}
```

`resources/mapper/StationMapper.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "https://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.kopens.factory3d.station.StationMapper">

    <resultMap id="view" type="com.kopens.factory3d.station.StationView">
        <constructor>
            <idArg column="id" javaType="_long"/>
            <arg column="sort_order" javaType="_int"/>
            <arg column="name" javaType="String"/>
            <arg column="placement_name" javaType="String"/>
            <arg column="steps" javaType="java.util.List" typeHandler="com.kopens.factory3d.model.TextArrayHandler"/>
            <arg column="takt_sec" javaType="_int"/>
            <arg column="warn_pp" javaType="_int"/>
            <arg column="delay_pp" javaType="_int"/>
            <arg column="project_id" javaType="java.lang.Long"/>
            <arg column="counts_project" javaType="_boolean"/>
            <arg column="materials" javaType="java.util.List" typeHandler="com.kopens.factory3d.model.TextArrayHandler"/>
        </constructor>
    </resultMap>

    <sql id="cols">id, sort_order, name, placement_name, steps, takt_sec, warn_pp, delay_pp, project_id, counts_project, materials</sql>

    <select id="findByDrawing" resultMap="view">
        select <include refid="cols"/> from station where drawing_id = #{drawingId} order by sort_order, id
    </select>
    <select id="findById" resultMap="view">select <include refid="cols"/> from station where id = #{id}</select>
    <select id="drawingOf" resultType="java.lang.Long">select drawing_id from station where id = #{id}</select>
    <select id="countByDrawing" resultType="_int">select count(*) from station where drawing_id = #{drawingId}</select>
    <select id="existsByName" resultType="_boolean">
        select exists(select 1 from station where drawing_id = #{drawingId} and name = #{name}
            <if test="excludeId != null">and id &lt;&gt; #{excludeId}</if>)
    </select>

    <insert id="insert" useGeneratedKeys="true" keyProperty="row.id" keyColumn="id">
        insert into station (drawing_id, sort_order, name, placement_name, steps, takt_sec, warn_pp, delay_pp, project_id,
                             counts_project, materials)
        values (#{drawingId}, #{row.no}, #{row.name}, #{row.placementName,jdbcType=VARCHAR},
                #{row.steps,typeHandler=org.apache.ibatis.type.ArrayTypeHandler}, #{row.taktSec}, #{row.warnPp}, #{row.delayPp},
                #{row.projectId,jdbcType=BIGINT}, #{row.countsProject},
                #{row.materials,typeHandler=org.apache.ibatis.type.ArrayTypeHandler})
    </insert>

    <update id="update">
        update station set name = #{row.name}, placement_name = #{row.placementName,jdbcType=VARCHAR},
            steps = #{row.steps,typeHandler=org.apache.ibatis.type.ArrayTypeHandler}, takt_sec = #{row.taktSec},
            warn_pp = #{row.warnPp}, delay_pp = #{row.delayPp}, project_id = #{row.projectId,jdbcType=BIGINT},
            counts_project = #{row.countsProject},
            materials = #{row.materials,typeHandler=org.apache.ibatis.type.ArrayTypeHandler}
        where id = #{id}
    </update>

    <update id="setOrder">update station set sort_order = #{no} where id = #{id}</update>

    <delete id="delete">delete from station where id = #{id}</delete>
</mapper>
```

`station/ProjectMapper.java`:
```java
package com.kopens.factory3d.station;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface ProjectMapper {
    List<ProjectView> findByDrawing(long drawingId);

    ProjectView findById(long id);

    Long drawingOf(long id);

    int countByDrawing(long drawingId);

    boolean existsByName(@Param("drawingId") long drawingId, @Param("name") String name, @Param("excludeId") Long excludeId);

    int nextOrder(long drawingId);

    void insert(@Param("drawingId") long drawingId, @Param("row") Row row);

    void update(@Param("id") long id, @Param("row") Row row);

    /** 상황판 한 대 완료 (VirtualMes) */
    void setDone(@Param("id") long id, @Param("done") int done);

    void delete(long id);

    final class Row {
        public Long id;
        public String name;
        public int done;
        public int total;
        public String period;
        public String state;
        public int sortOrder;
    }
}
```

`resources/mapper/ProjectMapper.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "https://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.kopens.factory3d.station.ProjectMapper">

    <resultMap id="view" type="com.kopens.factory3d.station.ProjectView">
        <constructor>
            <idArg column="id" javaType="_long"/>
            <arg column="name" javaType="String"/>
            <arg column="done" javaType="_int"/>
            <arg column="total" javaType="_int"/>
            <arg column="period" javaType="String"/>
            <arg column="state" javaType="String"/>
            <arg column="sort_order" javaType="_int"/>
        </constructor>
    </resultMap>

    <select id="findByDrawing" resultMap="view">
        select id, name, done, total, period, state, sort_order from project where drawing_id = #{drawingId} order by sort_order, id
    </select>
    <select id="findById" resultMap="view">select id, name, done, total, period, state, sort_order from project where id = #{id}</select>
    <select id="drawingOf" resultType="java.lang.Long">select drawing_id from project where id = #{id}</select>
    <select id="countByDrawing" resultType="_int">select count(*) from project where drawing_id = #{drawingId}</select>
    <select id="existsByName" resultType="_boolean">
        select exists(select 1 from project where drawing_id = #{drawingId} and name = #{name}
            <if test="excludeId != null">and id &lt;&gt; #{excludeId}</if>)
    </select>
    <select id="nextOrder" resultType="_int">select coalesce(max(sort_order), 0) + 1 from project where drawing_id = #{drawingId}</select>

    <insert id="insert" useGeneratedKeys="true" keyProperty="row.id" keyColumn="id">
        insert into project (drawing_id, name, done, total, period, state, sort_order)
        values (#{drawingId}, #{row.name}, #{row.done}, #{row.total}, #{row.period,jdbcType=VARCHAR}, #{row.state}, #{row.sortOrder})
    </insert>

    <update id="update">
        update project set name = #{row.name}, done = #{row.done}, total = #{row.total}, period = #{row.period,jdbcType=VARCHAR},
            state = #{row.state}
        where id = #{id}
    </update>

    <update id="setDone">update project set done = #{done} where id = #{id}</update>

    <delete id="delete">delete from project where id = #{id}</delete>
</mapper>
```

- [ ] **Step 4: 구현 — 서비스·컨트롤러·이벤트**

`station/StationsChanged.java`:
```java
package com.kopens.factory3d.station;

/** 한 도면의 공정·PJT 기준정보가 바뀜 → 상황판(VirtualMes)이 커밋 뒤 그 도면을 처음부터 다시 올림 */
public record StationsChanged(long drawingId) {}
```

`station/StationService.java`:
```java
package com.kopens.factory3d.station;

import com.kopens.factory3d.audit.AuditService;
import com.kopens.factory3d.common.BadRequestException;
import com.kopens.factory3d.common.ConflictException;
import com.kopens.factory3d.common.NotFoundException;
import com.kopens.factory3d.drawing.DrawingMapper;
import java.util.HashSet;
import java.util.List;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 공정 기준정보 (도면별, 순서 = 칩 번호). 저장할 때마다 StationsChanged */
@Service
public class StationService {
    /** 추가·수정 공통. 수정에서 null 은 그대로, clearPlacement·clearProject 로 비움 */
    public record StationInput(String name, String placementName, Boolean clearPlacement, List<String> steps, Integer taktSec,
            Integer warnPp, Integer delayPp, Long projectId, Boolean clearProject, Boolean countsProject, List<String> materials) {}

    static final String STEPS_ERROR = "step 은 1~40개, 각 1~100자로 입력하세요.";
    static final String MATERIALS_ERROR = "입고 자재는 40개까지, 각 1~100자로 입력하세요.";

    private final StationMapper stations;
    private final ProjectMapper projects;
    private final DrawingMapper drawings;
    private final AuditService audit;
    private final ApplicationEventPublisher events;

    public StationService(StationMapper stations, ProjectMapper projects, DrawingMapper drawings, AuditService audit,
            ApplicationEventPublisher events) {
        this.stations = stations;
        this.projects = projects;
        this.drawings = drawings;
        this.audit = audit;
        this.events = events;
    }

    public List<StationView> list(long drawingId) {
        requireDrawing(drawingId);
        return stations.findByDrawing(drawingId);
    }

    @Transactional
    public StationView create(long drawingId, StationInput in) {
        requireDrawing(drawingId);
        StationMapper.Row r = merge(drawingId, null, null, in);
        r.no = stations.countByDrawing(drawingId) + 1;
        stations.insert(drawingId, r);
        audit.log("STATION_CREATE", r.name, "drawing=" + drawingId + " id=" + r.id);
        events.publishEvent(new StationsChanged(drawingId));
        return stations.findById(r.id);
    }

    @Transactional
    public StationView update(long id, StationInput in) {
        StationView cur = require(id);
        long drawingId = stations.drawingOf(id);
        StationMapper.Row r = merge(drawingId, id, cur, in);
        stations.update(id, r);
        audit.log("STATION_UPDATE", r.name, "drawing=" + drawingId + " id=" + id);
        events.publishEvent(new StationsChanged(drawingId));
        return stations.findById(id);
    }

    @Transactional
    public void delete(long id) {
        StationView cur = require(id);
        long drawingId = stations.drawingOf(id);
        stations.delete(id);
        List<StationView> rest = stations.findByDrawing(drawingId);
        for (int i = 0; i < rest.size(); i++) if (rest.get(i).no() != i + 1) stations.setOrder(rest.get(i).id(), i + 1);
        audit.log("STATION_DELETE", cur.name(), "drawing=" + drawingId + " id=" + id);
        events.publishEvent(new StationsChanged(drawingId));
    }

    @Transactional
    public List<StationView> order(long drawingId, List<Long> ids) {
        requireDrawing(drawingId);
        List<Long> cur = stations.findByDrawing(drawingId).stream().map(StationView::id).toList();
        if (ids == null || ids.size() != cur.size() || new HashSet<>(ids).size() != ids.size() || !new HashSet<>(cur).containsAll(ids))
            throw new BadRequestException("순서에는 이 도면의 모든 공정이 한 번씩 있어야 합니다.");
        for (int i = 0; i < ids.size(); i++) stations.setOrder(ids.get(i), i + 1);
        audit.log("STATION_ORDER", "drawing=" + drawingId, ids.toString());
        events.publishEvent(new StationsChanged(drawingId));
        return stations.findByDrawing(drawingId);
    }

    /** cur == null 이면 추가 (기본값: 택타임 1200 · 주의 10 · 지연 20 · 셈 안 함 · 자재 없음) */
    private StationMapper.Row merge(long drawingId, Long selfId, StationView cur, StationInput in) {
        var r = new StationMapper.Row();
        r.name = in.name() != null ? checkName(in.name()) : cur != null ? cur.name() : checkName(null);
        if ((cur == null || !r.name.equals(cur.name())) && stations.existsByName(drawingId, r.name, selfId))
            throw new ConflictException("같은 이름의 공정이 있습니다.");
        r.placementName = Boolean.TRUE.equals(in.clearPlacement()) ? null
                : in.placementName() != null ? optionalName(in.placementName()) : cur != null ? cur.placementName() : null;
        r.steps = in.steps() != null || cur == null ? checkSteps(in.steps()) : cur.steps().toArray(String[]::new);
        r.taktSec = in.taktSec() != null ? checkTakt(in.taktSec()) : cur != null ? cur.taktSec() : 1200;
        r.warnPp = in.warnPp() != null ? in.warnPp() : cur != null ? cur.warnPp() : 10;
        r.delayPp = in.delayPp() != null ? in.delayPp() : cur != null ? cur.delayPp() : 20;
        if (!(0 <= r.warnPp && r.warnPp < r.delayPp && r.delayPp <= 100))
            throw new BadRequestException("주의·지연 기준은 0 ≤ 주의 < 지연 ≤ 100 이어야 합니다.");
        r.projectId = Boolean.TRUE.equals(in.clearProject()) ? null
                : in.projectId() != null ? requireProject(drawingId, in.projectId()) : cur != null ? cur.projectId() : null;
        r.countsProject = in.countsProject() != null ? in.countsProject() : cur != null && cur.countsProject();
        r.materials = in.materials() != null ? checkList(in.materials(), 0, MATERIALS_ERROR)
                : cur != null ? cur.materials().toArray(String[]::new) : new String[0];
        return r;
    }

    private StationView require(long id) {
        StationView s = stations.findById(id);
        if (s == null) throw new NotFoundException("공정을 찾을 수 없습니다.");
        return s;
    }

    private void requireDrawing(long id) {
        if (drawings.findById(id) == null) throw new NotFoundException("도면을 찾을 수 없습니다.");
    }

    private Long requireProject(long drawingId, long projectId) {
        Long d = projects.drawingOf(projectId);
        if (d == null || d != drawingId) throw new BadRequestException("이 도면의 PJT 가 아닙니다.");
        return projectId;
    }

    private static String checkName(String name) {
        String n = name == null ? "" : name.strip();
        if (n.isEmpty() || n.length() > 100) throw new BadRequestException("공정 이름은 1~100자로 입력하세요.");
        return n;
    }

    private static String optionalName(String name) {
        String n = name.strip();
        if (n.length() > 100) throw new BadRequestException("연결 설비 이름은 100자까지입니다.");
        return n.isEmpty() ? null : n;
    }

    private static String[] checkSteps(List<String> steps) {
        return checkList(steps, 1, STEPS_ERROR);
    }

    /** 각 항목 앞뒤 공백 제거, 1~100자, 개수 min~40 */
    private static String[] checkList(List<String> items, int min, String error) {
        if (items == null || items.size() < min || items.size() > 40) throw new BadRequestException(error);
        String[] out = new String[items.size()];
        for (int i = 0; i < out.length; i++) {
            String s = items.get(i) == null ? "" : items.get(i).strip();
            if (s.isEmpty() || s.length() > 100) throw new BadRequestException(error);
            out[i] = s;
        }
        return out;
    }

    private static int checkTakt(int sec) {
        if (sec < 60 || sec > 604800) throw new BadRequestException("택타임은 60~604800초(1분~7일)여야 합니다.");
        return sec;
    }
}
```

`station/ProjectService.java`:
```java
package com.kopens.factory3d.station;

import com.kopens.factory3d.audit.AuditService;
import com.kopens.factory3d.common.BadRequestException;
import com.kopens.factory3d.common.ConflictException;
import com.kopens.factory3d.common.NotFoundException;
import com.kopens.factory3d.drawing.DrawingMapper;
import java.util.List;
import java.util.Set;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** PJT (제작 현황). 저장할 때마다 StationsChanged */
@Service
public class ProjectService {
    /** 추가·수정 공통. 수정에서 null 은 그대로, period "" 는 비움 */
    public record ProjectInput(String name, Integer done, Integer total, String period, String state) {}

    private static final Set<String> STATES = Set.of("run", "wait", "done");

    private final ProjectMapper projects;
    private final DrawingMapper drawings;
    private final AuditService audit;
    private final ApplicationEventPublisher events;

    public ProjectService(ProjectMapper projects, DrawingMapper drawings, AuditService audit, ApplicationEventPublisher events) {
        this.projects = projects;
        this.drawings = drawings;
        this.audit = audit;
        this.events = events;
    }

    public List<ProjectView> list(long drawingId) {
        requireDrawing(drawingId);
        return projects.findByDrawing(drawingId);
    }

    @Transactional
    public ProjectView create(long drawingId, ProjectInput in) {
        requireDrawing(drawingId);
        ProjectMapper.Row r = merge(drawingId, null, null, in);
        r.sortOrder = projects.nextOrder(drawingId);
        projects.insert(drawingId, r);
        audit.log("PROJECT_CREATE", r.name, "drawing=" + drawingId + " id=" + r.id);
        events.publishEvent(new StationsChanged(drawingId));
        return projects.findById(r.id);
    }

    @Transactional
    public ProjectView update(long id, ProjectInput in) {
        ProjectView cur = require(id);
        long drawingId = projects.drawingOf(id);
        ProjectMapper.Row r = merge(drawingId, id, cur, in);
        projects.update(id, r);
        audit.log("PROJECT_UPDATE", r.name, "drawing=" + drawingId + " id=" + id);
        events.publishEvent(new StationsChanged(drawingId));
        return projects.findById(id);
    }

    /** 이 PJT 를 쓰던 공정은 project_id 가 비워짐 (FK on delete set null) */
    @Transactional
    public void delete(long id) {
        ProjectView cur = require(id);
        long drawingId = projects.drawingOf(id);
        projects.delete(id);
        audit.log("PROJECT_DELETE", cur.name(), "drawing=" + drawingId + " id=" + id);
        events.publishEvent(new StationsChanged(drawingId));
    }

    private ProjectMapper.Row merge(long drawingId, Long selfId, ProjectView cur, ProjectInput in) {
        var r = new ProjectMapper.Row();
        r.name = in.name() != null ? checkName(in.name()) : cur != null ? cur.name() : checkName(null);
        if ((cur == null || !r.name.equals(cur.name())) && projects.existsByName(drawingId, r.name, selfId))
            throw new ConflictException("같은 이름의 PJT 가 있습니다.");
        Integer total = in.total() != null ? in.total() : cur != null ? Integer.valueOf(cur.total()) : null;
        int done = in.done() != null ? in.done() : cur != null ? cur.done() : 0;
        if (total == null || total < 1 || done < 0 || done > total)
            throw new BadRequestException("제작 수는 0 ≤ 제작 ≤ 전체, 전체 ≥ 1 이어야 합니다.");
        r.total = total;
        r.done = done;
        String period = in.period() != null ? in.period().strip() : cur != null ? cur.period() : null;
        if (period != null && period.isEmpty()) period = null;
        if (period != null && period.length() > 40) throw new BadRequestException("기간은 40자까지입니다.");
        r.period = period;
        r.state = in.state() != null ? in.state() : cur != null ? cur.state() : "run";
        if (!STATES.contains(r.state)) throw new BadRequestException("상태는 run, wait, done 중 하나입니다.");
        return r;
    }

    private ProjectView require(long id) {
        ProjectView p = projects.findById(id);
        if (p == null) throw new NotFoundException("PJT 를 찾을 수 없습니다.");
        return p;
    }

    private void requireDrawing(long id) {
        if (drawings.findById(id) == null) throw new NotFoundException("도면을 찾을 수 없습니다.");
    }

    private static String checkName(String name) {
        String n = name == null ? "" : name.strip();
        if (n.isEmpty() || n.length() > 100) throw new BadRequestException("PJT 이름은 1~100자로 입력하세요.");
        return n;
    }
}
```

`station/StationController.java`:
```java
package com.kopens.factory3d.station;

import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** 공정 기준정보 (GET 조회 이상, 쓰기 관리자 — SecurityConfig) */
@RestController
public class StationController {
    private final StationService stations;

    public StationController(StationService stations) {
        this.stations = stations;
    }

    @GetMapping("/api/drawings/{id}/stations")
    public List<StationView> list(@PathVariable long id) {
        return stations.list(id);
    }

    @PostMapping("/api/drawings/{id}/stations")
    public ResponseEntity<StationView> create(@PathVariable long id, @RequestBody StationService.StationInput body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(stations.create(id, body));
    }

    @PutMapping("/api/drawings/{id}/stations/order")
    public List<StationView> order(@PathVariable long id, @RequestBody List<Long> ids) {
        return stations.order(id, ids);
    }

    @PatchMapping("/api/stations/{id}")
    public StationView update(@PathVariable long id, @RequestBody StationService.StationInput body) {
        return stations.update(id, body);
    }

    @DeleteMapping("/api/stations/{id}")
    public ResponseEntity<Void> delete(@PathVariable long id) {
        stations.delete(id);
        return ResponseEntity.noContent().build();
    }
}
```

`station/ProjectController.java`:
```java
package com.kopens.factory3d.station;

import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** PJT (GET 조회 이상, 쓰기 관리자 — SecurityConfig) */
@RestController
public class ProjectController {
    private final ProjectService projects;

    public ProjectController(ProjectService projects) {
        this.projects = projects;
    }

    @GetMapping("/api/drawings/{id}/projects")
    public List<ProjectView> list(@PathVariable long id) {
        return projects.list(id);
    }

    @PostMapping("/api/drawings/{id}/projects")
    public ResponseEntity<ProjectView> create(@PathVariable long id, @RequestBody ProjectService.ProjectInput body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(projects.create(id, body));
    }

    @PatchMapping("/api/projects/{id}")
    public ProjectView update(@PathVariable long id, @RequestBody ProjectService.ProjectInput body) {
        return projects.update(id, body);
    }

    @DeleteMapping("/api/projects/{id}")
    public ResponseEntity<Void> delete(@PathVariable long id) {
        projects.delete(id);
        return ResponseEntity.noContent().build();
    }
}
```

`common/SecurityConfig.java` — `filterChain` 의 `authorizeHttpRequests` 에서 `.requestMatchers(HttpMethod.DELETE, "/api/drawings/**").hasRole("ADMIN")` 줄 바로 아래(= `GET /api/**` 규칙보다 위)에 추가:
```java
                        // 공정·PJT 기준정보 쓰기는 관리자 (보기는 아래 GET 규칙 = 조회 이상)
                        .requestMatchers(HttpMethod.POST, "/api/drawings/*/stations", "/api/drawings/*/projects").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.PUT, "/api/drawings/*/stations/order").hasRole("ADMIN")
                        .requestMatchers("/api/stations/**", "/api/projects/**").hasRole("ADMIN")
```

- [ ] **Step 5: 통과 확인 (전체)**

Run: `cd /c/kopens/project/Factory3D/server && ./gradlew test`
Expected: PASS (StationApiTest 5개 포함, 기존 테스트 그대로).

- [ ] **Step 6: Commit**

```bash
cd /c/kopens/project/Factory3D && git add server
git commit -m "feat(server): 공정·PJT 기준정보 — V5 표·API·검사·순서·감사·관리자 권한

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 서버 — 나셀 공장 기본 공정 6개 · PJT 4개 (새 설치·기존 설치)

**Files:**
- Create: `server/src/main/resources/seed/main_factory.stations.json`, `server/src/main/java/com/kopens/factory3d/station/StationSeeder.java`
- Modify: `server/src/main/java/com/kopens/factory3d/drawing/DrawingSeeder.java` (순서: 모델 → 도면 → 배치 → 공정)
- Test: `server/src/test/java/com/kopens/factory3d/station/StationSeedTest.java`

**Interfaces:**
- Consumes: Task 1 `StationMapper`/`ProjectMapper` (`countByDrawing`, `insert`, `Row`), `StationsChanged`; `AuditService.logAs`.
- Produces:
  - `StationSeeder.seedFactory(): int` — 넣은 공정 수 (조건이 안 맞으면 0). 조건: system 이 만든 '나셀 공장' 이 있고, 그 도면의 공정·PJT 가 0개이고, 감사 기록에 `STATION_SEED` / target `drawing=<id>` 가 없음. 넣으면 감사 `STATION_SEED` + `StationsChanged`.
  - `StationSeeder.startValues(long drawingId): Map<String, double[]>` — 시스템 '나셀 공장' 이면 공정 이름 → `{startActual, startTarget}`, 아니면 빈 맵 (Task 3 VirtualMes 가 씀).
  - 시드 json 모양: `{ "projects": [{name,done,total,period,state}], "stations": [{name,placementName,project,countsProject,taktSec,startActual,startTarget,materials[],steps[]}] }`.

- [ ] **Step 1: 시드 json 작성** (demo `index.html` 의 `STEPS`·`DASH_INIT` 그대로)

`server/src/main/resources/seed/main_factory.stations.json`:
```json
{
  "projects": [
    { "name": "야월해상", "done": 3, "total": 13, "period": "'25.09~'27.03", "state": "run" },
    { "name": "서남해상", "done": 7, "total": 13, "period": "'25.11~'26.06", "state": "run" },
    { "name": "신안해상", "done": 2, "total": 13, "period": "'26.01~'26.09", "state": "run" },
    { "name": "다대포", "done": 0, "total": 8, "period": "'26.05~'26.12", "state": "wait" }
  ],
  "stations": [
    {
      "name": "Hub 조립장", "placementName": "Hub 조립장", "project": "야월해상", "countsProject": false, "taktSec": 1200,
      "startActual": 60, "startTarget": 68, "materials": ["Hub Casting", "Pitch Bearing"],
      "steps": ["Hub Casting 세팅", "Pitch Bearing 장착", "Pitch Drive 장착", "Pitch Cabinet 설치", "Slip Ring 설치", "유압 배관", "Cable 포설", "Spinner Bracket 장착", "윤활 계통", "전장 결선", "기능 시험", "출하 검사"]
    },
    {
      "name": "Main Station 3", "placementName": "Main Station 3", "project": "야월해상", "countsProject": true, "taktSec": 1200,
      "startActual": 60, "startTarget": 66, "materials": ["Main Frame", "Nacelle Frame", "Gearbox"],
      "steps": ["Bed Frame 세팅", "Main Shaft 장착", "Main Bearing 장착", "Gearbox 장착", "Generator 장착", "Converter Cooling Pump 조립", "Converter Cabinet 설치", "Yaw Drive 장착", "Cable 포설", "Nacelle Cover 장착", "기능 시험", "출하 검사"]
    },
    {
      "name": "Main Station 2", "placementName": "Main Station 2", "project": "서남해상", "countsProject": true, "taktSec": 1200,
      "startActual": 60, "startTarget": 88, "materials": ["Main Frame", "Nacelle Frame", "Gearbox"],
      "steps": ["Bed Frame 세팅", "Main Shaft 장착", "Main Bearing 장착", "Gearbox 장착", "Generator 장착", "Converter Cooling Pump 조립", "Converter Cabinet 설치", "Yaw Drive 장착", "Cable 포설", "Nacelle Cover 장착", "기능 시험", "출하 검사"]
    },
    {
      "name": "Main Station 1", "placementName": "Main Station 1", "project": "신안해상", "countsProject": true, "taktSec": 1200,
      "startActual": 35, "startTarget": 52, "materials": ["Main Frame", "Nacelle Frame", "Gearbox"],
      "steps": ["Bed Frame 세팅", "Main Shaft 장착", "Main Bearing 장착", "Gearbox 장착", "Generator 장착", "Converter Cooling Pump 조립", "Converter Cabinet 설치", "Yaw Drive 장착", "Cable 포설", "Nacelle Cover 장착", "기능 시험", "출하 검사"]
    },
    {
      "name": "Sub_Main Frame 조립장", "placementName": "Sub_Main Frame 조립장", "project": "야월해상", "countsProject": false, "taktSec": 1200,
      "startActual": 70, "startTarget": 74, "materials": ["Main Frame"],
      "steps": ["Main Frame 세팅", "Main Frame 조립", "Bolt 체결", "Yaw Ring 장착", "Brake Caliper 장착", "Rear Frame 결합", "정렬 측정", "Bolt Tensioning", "배관 브래킷", "도장 보수", "치수 검사", "출하 검사"]
    },
    {
      "name": "Sub_Yaw Bearing", "placementName": "Sub_Yaw Bearing", "project": "야월해상", "countsProject": false, "taktSec": 1200,
      "startActual": 70, "startTarget": 74, "materials": ["Yaw Bearing"],
      "steps": ["Yaw Bearing 세팅", "Bolt 삽입", "50% Bolt Tensioning", "75% Bolt Tensioning", "100% Bolt Tensioning", "Yaw Drive 장착", "Brake Disc 장착", "Grease 주입", "회전 시험", "토크 검사", "도장 보수", "출하 검사"]
    }
  ]
}
```

- [ ] **Step 2: 실패 테스트**

`server/src/test/java/com/kopens/factory3d/station/StationSeedTest.java`:
```java
package com.kopens.factory3d.station;

import static org.assertj.core.api.Assertions.assertThat;

import com.kopens.factory3d.drawing.DrawingSeeder;
import com.kopens.factory3d.support.IntegrationTest;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class StationSeedTest extends IntegrationTest {
    @Autowired DrawingSeeder drawingSeeder;
    @Autowired StationSeeder stationSeeder;

    private int count(String table) {
        return jdbc.queryForObject("select count(*) from " + table, Integer.class);
    }

    @Test
    void 새_설치_나셀공장에_공정6_PJT4() throws Exception {
        drawingSeeder.seedAll();
        assertThat(jdbc.queryForList("select name from station order by sort_order", String.class))
                .containsExactly("Hub 조립장", "Main Station 3", "Main Station 2", "Main Station 1", "Sub_Main Frame 조립장", "Sub_Yaw Bearing");
        assertThat(jdbc.queryForList("select name || ' ' || done || '/' || total || ' ' || state from project order by sort_order", String.class))
                .containsExactly("야월해상 3/13 run", "서남해상 7/13 run", "신안해상 2/13 run", "다대포 0/8 wait");
        Map<String, Object> main2 = jdbc.queryForMap("select s.placement_name, s.counts_project, p.name as pjt, cardinality(s.steps) as n, "
                + "s.steps[1] as first, s.takt_sec from station s join project p on p.id = s.project_id where s.name = 'Main Station 2'");
        assertThat(main2.get("placement_name")).isEqualTo("Main Station 2");
        assertThat(main2.get("counts_project")).isEqualTo(true);
        assertThat(main2.get("pjt")).isEqualTo("서남해상");
        assertThat(main2.get("n")).isEqualTo(12);
        assertThat(main2.get("first")).isEqualTo("Bed Frame 세팅");
        assertThat(main2.get("takt_sec")).isEqualTo(1200);
        // 모든 공정의 연결 설비가 기본 배치에 있음 (칩이 빠지지 않음)
        assertThat(jdbc.queryForObject("select count(*) from station s where not exists (select 1 from placement p "
                + "where p.drawing_id = s.drawing_id and p.name = s.placement_name)", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from audit_log where action = 'STATION_SEED'", Integer.class)).isEqualTo(1);
        drawingSeeder.seedAll(); // 다시 해도 그대로
        assertThat(count("station")).isEqualTo(6);
        assertThat(count("project")).isEqualTo(4);
    }

    @Test
    void 기존_설치는_한_번만_넣고_지워도_다시_넣지_않음() throws Exception {
        drawingSeeder.seedIfEmpty(); // P3 까지의 상태: 나셀 공장 도면은 있고 공정은 없음
        assertThat(count("station")).isZero();
        assertThat(stationSeeder.seedFactory()).isEqualTo(6);
        assertThat(stationSeeder.seedFactory()).isZero();
        jdbc.update("delete from station");
        jdbc.update("delete from project");
        assertThat(stationSeeder.seedFactory()).isZero(); // 감사 기록 STATION_SEED 가 있으므로
    }

    @Test
    void 사용자가_만든_같은_이름_도면에는_넣지_않음() throws Exception {
        jdbc.update("insert into drawing (name, source_type, source_file, created_by) values ('나셀 공장', 'dxf', 'x', 'kim')");
        assertThat(stationSeeder.seedFactory()).isZero();
        assertThat(count("station")).isZero();
    }

    @Test
    void 시작_실적·목표는_나셀_공장만() throws Exception {
        long factory = jdbc.queryForObject("insert into drawing (name, source_type, source_file, created_by) values ('나셀 공장', 'dxf', 'x', 'system') returning id", Long.class);
        long mine = jdbc.queryForObject("insert into drawing (name, source_type, source_file, created_by) values ('2공장', 'dxf', 'x', 'kim') returning id", Long.class);
        assertThat(stationSeeder.startValues(factory).get("Main Station 2")).containsExactly(60.0, 88.0);
        assertThat(stationSeeder.startValues(factory)).hasSize(6);
        assertThat(stationSeeder.startValues(mine)).isEmpty();
    }
}
```

Run: `cd /c/kopens/project/Factory3D/server && ./gradlew test --tests "*StationSeedTest"`
Expected: FAIL (StationSeeder 없음).

- [ ] **Step 3: 구현**

`station/StationSeeder.java`:
```java
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
```

`drawing/DrawingSeeder.java` — 생성자에 `com.kopens.factory3d.station.StationSeeder stationSeeder` 를 추가해 필드로 두고, `seedAll()` 의 배치 단계 뒤에 넣고 주석을 고친다:
```java
    /** 시작 순서: 기본 모델 → 기본 도면 → 기본 배치 → 기본 공정. 단계별로 실패해도 다음 단계 시도 */
    public void seedAll() {
        // (기존 모델·도면·배치 try 블록 3개 그대로)
        try {
            stationSeeder.seedFactory();
        } catch (Exception e) {
            log.warn("기본 공정을 넣지 못했습니다: {}", e.getMessage());
        }
    }
```
생성자 전체:
```java
    private final com.kopens.factory3d.station.StationSeeder stationSeeder;

    public DrawingSeeder(DrawingMapper drawings, DrawingService service, com.kopens.factory3d.model.ModelSeeder modelSeeder,
            com.kopens.factory3d.placement.PlacementSeeder placementSeeder,
            com.kopens.factory3d.station.StationSeeder stationSeeder) {
        this.drawings = drawings;
        this.service = service;
        this.modelSeeder = modelSeeder;
        this.placementSeeder = placementSeeder;
        this.stationSeeder = stationSeeder;
    }
```

- [ ] **Step 4: 통과 확인 (전체)**

Run: `cd /c/kopens/project/Factory3D/server && ./gradlew test`
Expected: PASS (기존 SeedTest·DrawingSeederTest 도 그대로 통과 — SeedTest 는 공정 표를 보지 않음).

- [ ] **Step 5: Commit**

```bash
cd /c/kopens/project/Factory3D && git add server
git commit -m "feat(server): 나셀 공장 기본 공정 6개·PJT 4개 시드 (새 설치·기존 설치 한 번)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 3: 서버 — 가상 MES (ProductionSource · VirtualMes · 1초 진행 · DB 반영)

**Files:**
- Create: `server/src/main/java/com/kopens/factory3d/live/{LiveMessages,LiveListener,ProductionSource,VirtualMes,LiveScheduler,LiveConfig}.java`, `server/src/main/java/com/kopens/factory3d/drawing/DrawingDeleted.java`
- Modify: `server/src/main/java/com/kopens/factory3d/drawing/DrawingService.java` (삭제 시 `DrawingDeleted`), `server/src/main/resources/application.yml` (`factory3d.live.*`), `server/src/test/java/com/kopens/factory3d/support/IntegrationTest.java` (테스트는 스케줄러 끔)
- Test: `server/src/test/java/com/kopens/factory3d/live/VirtualMesTest.java`

**Interfaces:**
- Consumes: Task 1 `StationMapper.findByDrawing`, `ProjectMapper.findByDrawing/setDone`, `StationView`, `ProjectView`, `StationsChanged`; Task 2 `StationSeeder.startValues(long)`.
- Produces (Task 4·화면이 씀):
```java
public interface ProductionSource {
    LiveMessages.Snapshot snapshot(long drawingId);         // 안 올라 있으면 DB 에서 올림, 공정이 없으면 빈 목록
    void subscribe(long drawingId, LiveListener listener);
    void unsubscribe(long drawingId, LiveListener listener);
    void reload(long drawingId);                            // 처음부터 다시 + 구독자에게 새 snapshot
}
@FunctionalInterface public interface LiveListener { void onMessage(Object message); }   // message = LiveMessages 의 record
// LiveMessages: Kpi(running,ok,warn,bad,doneToday,planRate,at) · StationLive(id,no,name,placementName,steps,step,actual,target,status,projectId,unitNo)
//   ProjectLive(id,name,done,total,period,state) · LiveEvent(id,at,kind,station,text,data)
//   Snapshot("snapshot",drawingId,kpi,stations,projects,events,materials) · Tick("tick",kpi,stations)
//   EventMessage("event",event) · Projects("projects",projects)
```
- Produces (`VirtualMes`, 테스트·스케줄러용): `tick()` (실제 경과 초로 advance, 최대 5초), `advance(double dtSec)` (모든 도면 진행 → 도면별로 event… → projects(바뀌었으면) → tick 순서로 전달), `static statusOf(double gap, int warnPp, int delayPp)`, `static stepOf(double actual, int n)`, 패키지 전용 `useClock(Clock)`, `setTimeScale(double)`, `override(drawingId, stationId, actual, target, rate)`, `unloadAll()`, `loaded(): Set<Long>`.
- Produces: `record DrawingDeleted(long drawingId)` (drawing 패키지, DrawingService.delete 가 발행).
- 설정: `factory3d.live.enabled`(`F3D_LIVE_ENABLED`, 기본 true — false 면 1초 진행 안 함), `factory3d.live.time-scale`(`F3D_LIVE_TIME_SCALE`, 기본 1).

진행 규칙 (spec §3.1, 구현이 따를 것):
1. 가상 dt = 실제 dt × scale. 스테이션마다 `target += dt/takt·100`, `actual += dt/takt·100·rate`.
2. `actual ≥ 100` 인 동안: `step_done`(지금 step) → `unit_done` → `actual −= 100`, `target = max(0, target − 100)` → step = stepOf(actual) → `step_start`. 그 밖에 step 이 바뀌면 `step_done`(이전) → `step_start`(새).
3. `unit_done`: counts_project 이고 PJT 가 있으면 done+1(≤ total, `project.done` 저장), 글 `<공정> · <PJT> <done>호기 완료`, 아니면 `<공정> 1대 조립 완료`. **모든 한 대 완료**가 오늘 완료 +1 (`live_daily` upsert, demo `DASH.done++` 와 같음). rate 를 ±0.08 안에서 다시 뽑아 [0.6, 1.1] 로 자름.
4. 상태 = statusOf(target − actual). 바뀌면 `status_change` (data `{from,to}`, 글 `… 공정 정상화` / `… 제작 주의` / `… 제작 지연`).
5. 자재: 가상 시간이 그 공정의 다음 입고 시각(올린 뒤 가상 60~180초 무작위)을 넘으면 `material_in`(글 `<자재> 입고 → <공정>`) 바로 뒤 `move`(글 `<자재> 운반 · 자재 랙 → <공정>`, data `{from:'자재 랙',to,material}`).
6. 무작위는 스테이션마다 `new Random(station.id)` (rate 0.70~1.05, 시작 실적 30~70·목표 = 실적 + 0~25, 자재 시각). 나셀 공장은 `startValues` 의 실적/목표 (처음 올릴 때와 reload 때 모두 — reload 는 "처음부터").
7. 최근 이벤트: step_* 은 보관하지 않음(너무 잦음 — 보내기만), 나머지 50개(새 것 먼저), material_in 은 따로 20개.
8. 날짜(`factory3d.time-zone`)가 바뀌면 오늘 완료 0 부터. 처음 올릴 때 `live_daily` 의 오늘 값.
9. 기동(`ApplicationReadyEvent`) 때 공정 있는 도면 전부 올림. `StationsChanged` → 커밋 뒤 `reload`, `DrawingDeleted` → 커밋 뒤 내림.

- [ ] **Step 1: 설정·테스트 바탕**

`application.yml` 의 `factory3d.model` 블록 아래(같은 들여쓰기)에 추가:
```yaml
  live:
    enabled: ${F3D_LIVE_ENABLED:true}          # 가상 MES 1초 진행 (테스트는 끔 — advance 를 직접 부름)
    time-scale: ${F3D_LIVE_TIME_SCALE:1}       # 진행 속도 배율 (1 = 실제 시간, 화면 확인은 30)
```

`support/IntegrationTest.java` 의 `props` 에 한 줄 추가:
```java
        r.add("factory3d.live.enabled", () -> "false"); // 1초 진행은 테스트가 advance 로 직접
```

- [ ] **Step 2: 실패 테스트**

`server/src/test/java/com/kopens/factory3d/live/VirtualMesTest.java`:
```java
package com.kopens.factory3d.live;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.kopens.factory3d.live.LiveMessages.LiveEvent;
import com.kopens.factory3d.live.LiveMessages.StationLive;
import com.kopens.factory3d.station.StationSeeder;
import com.kopens.factory3d.support.IntegrationTest;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

class VirtualMesTest extends IntegrationTest {
    /** 테스트가 시각을 바꾸는 시계 */
    static final class MutableClock extends Clock {
        volatile Instant now;

        MutableClock(Instant now) {
            this.now = now;
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }

    @Autowired VirtualMes mes;
    @Autowired StationSeeder stationSeeder;
    final List<Object> got = new CopyOnWriteArrayList<>();
    final MutableClock clock = new MutableClock(Instant.parse("2026-11-13T01:00:00Z")); // 서울 10시
    long drawing;
    long project;
    long station;

    @BeforeEach
    void setUp() {
        mes.unloadAll();
        mes.useClock(clock);
        mes.setTimeScale(1);
        drawing = jdbc.queryForObject("insert into drawing (name, source_type, source_file) values ('공장', 'dxf', 'x') returning id", Long.class);
        project = jdbc.queryForObject("insert into project (drawing_id, name, done, total, period, state) values (?, '야월해상', 3, 13, '''25.09~''27.03', 'run') returning id",
                Long.class, drawing);
        // step 4개 (한 step = 25%), 택타임 100초 → 1초에 목표 +1%
        station = jdbc.queryForObject("insert into station (drawing_id, sort_order, name, placement_name, steps, takt_sec, project_id, counts_project) "
                + "values (?, 1, 'Main Station 3', 'Main Station 3', array['a','b','c','d'], 100, ?, true) returning id", Long.class, drawing, project);
        mes.subscribe(drawing, got::add);
    }

    @AfterEach
    void restore() {
        mes.unloadAll();
        mes.useClock(Clock.systemUTC());
        mes.setTimeScale(1);
    }

    private List<LiveEvent> events() {
        return got.stream().filter(m -> m instanceof LiveMessages.EventMessage).map(m -> ((LiveMessages.EventMessage) m).event()).toList();
    }

    private StationLive live() {
        return mes.snapshot(drawing).stations().get(0);
    }

    @Test
    void 상태_판정_경계와_step_번호() {
        assertThat(VirtualMes.statusOf(-5, 10, 20)).isEqualTo("ok");
        assertThat(VirtualMes.statusOf(10, 10, 20)).isEqualTo("ok");
        assertThat(VirtualMes.statusOf(10.01, 10, 20)).isEqualTo("warn");
        assertThat(VirtualMes.statusOf(20, 10, 20)).isEqualTo("warn");
        assertThat(VirtualMes.statusOf(20.01, 10, 20)).isEqualTo("bad");
        assertThat(VirtualMes.stepOf(0, 12)).isEqualTo(1);
        assertThat(VirtualMes.stepOf(60, 12)).isEqualTo(8);
        assertThat(VirtualMes.stepOf(99.9, 12)).isEqualTo(12);
        assertThat(VirtualMes.stepOf(100, 12)).isEqualTo(12);
    }

    @Test
    void step_경계를_넘으면_step_done_다음_step_start_그리고_tick() {
        mes.override(drawing, station, 24, 24, 1);
        mes.advance(1); // 실적 25 → step 2
        assertThat(events()).extracting(LiveEvent::kind).containsExactly("step_done", "step_start");
        assertThat(events().get(0).data()).containsEntry("step", 1);
        assertThat(events().get(1).data()).containsEntry("step", 2);
        assertThat(events().get(1).text()).isEqualTo("Main Station 3 b 시작");
        assertThat(got.get(got.size() - 1)).isInstanceOf(LiveMessages.Tick.class); // 이벤트 다음에 tick
        assertThat(live().step()).isEqualTo(2);
        assertThat(mes.snapshot(drawing).events()).isEmpty(); // step_* 은 보관하지 않음
    }

    @Test
    void 백퍼센트면_한_대_완료·PJT_제작수·오늘_완료·넘친_실적_이어짐() {
        mes.override(drawing, station, 99.5, 99.5, 1);
        mes.advance(1);
        assertThat(events()).extracting(LiveEvent::kind).containsExactly("step_done", "unit_done", "step_start");
        assertThat(events().get(1).text()).isEqualTo("Main Station 3 · 야월해상 4호기 완료");
        assertThat(jdbc.queryForObject("select done from project where id = ?", Integer.class, project)).isEqualTo(4);
        assertThat(jdbc.queryForObject("select done from live_daily where drawing_id = ?", Integer.class, drawing)).isEqualTo(1);
        var snap = mes.snapshot(drawing);
        assertThat(snap.kpi().doneToday()).isEqualTo(1);
        assertThat(snap.projects().get(0).done()).isEqualTo(4);
        assertThat(snap.stations().get(0).actual()).isEqualTo(0.5);
        assertThat(snap.stations().get(0).target()).isEqualTo(0.5);
        assertThat(snap.stations().get(0).step()).isEqualTo(1);
        assertThat(snap.stations().get(0).unitNo()).isEqualTo(5);
        assertThat(snap.events()).extracting(LiveEvent::kind).containsExactly("unit_done");
        assertThat(got).anyMatch(m -> m instanceof LiveMessages.Projects p && p.projects().get(0).done() == 4);
    }

    @Test
    void 상태가_바뀔_때_한_번만_status_change() {
        mes.override(drawing, station, 50, 59, 0); // 실적 멈춤, 목표만 1초에 +1
        mes.advance(1); // 차 10 → 진행중 그대로
        mes.advance(1); // 차 11 → 주의
        mes.advance(1); // 차 12 → 그대로
        var changes = events().stream().filter(e -> e.kind().equals("status_change")).toList();
        assertThat(changes).hasSize(1);
        assertThat(changes.get(0).text()).isEqualTo("Main Station 3 제작 주의");
        assertThat(changes.get(0).data()).containsEntry("from", "ok").containsEntry("to", "warn");
        assertThat(live().status()).isEqualTo("warn");
        assertThat(mes.snapshot(drawing).kpi().warn()).isEqualTo(1);
    }

    @Test
    void 진행_배율() {
        mes.override(drawing, station, 0, 0, 1);
        mes.advance(1);
        assertThat(live().target()).isEqualTo(1.0);
        mes.setTimeScale(30);
        mes.advance(1);
        assertThat(live().target()).isEqualTo(31.0);
    }

    @Test
    void 다시_읽으면_처음부터_새_snapshot() {
        mes.override(drawing, station, 99, 99, 1);
        mes.reload(drawing);
        assertThat(got.get(got.size() - 1)).isInstanceOf(LiveMessages.Snapshot.class);
        var s = live();
        assertThat(s.actual()).isBetween(30.0, 70.0);
        assertThat(s.target()).isBetween(s.actual(), s.actual() + 25);
    }

    @Test
    void 공정을_고치면_커밋_뒤_상황판도_새로() throws Exception {
        mes.snapshot(drawing);
        mvc.perform(patch("/api/stations/" + station).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"메인 3\"}")
                        .with(user("admin").roles("ADMIN")).with(csrf()))
                .andExpect(status().isOk());
        assertThat(mes.snapshot(drawing).stations().get(0).name()).isEqualTo("메인 3");
        assertThat(got).anyMatch(m -> m instanceof LiveMessages.Snapshot);
    }

    @Test
    void 도면을_지우면_내림() throws Exception {
        mes.snapshot(drawing);
        assertThat(mes.loaded()).contains(drawing);
        mvc.perform(delete("/api/drawings/" + drawing).with(user("admin").roles("ADMIN")).with(csrf())).andExpect(status().isNoContent());
        assertThat(mes.loaded()).doesNotContain(drawing);
    }

    @Test
    void 자재_입고_다음_운반() {
        jdbc.update("update station set materials = array['Main Frame'], takt_sec = 604800 where id = ?", station);
        mes.reload(drawing);
        got.clear();
        mes.advance(181); // 첫 입고는 올린 뒤 가상 60~180초 사이
        var kinds = events().stream().map(LiveEvent::kind).filter(k -> k.equals("material_in") || k.equals("move")).toList();
        assertThat(kinds).containsExactly("material_in", "move");
        assertThat(events().stream().filter(e -> e.kind().equals("material_in")).findFirst().orElseThrow().text())
                .isEqualTo("Main Frame 입고 → Main Station 3");
        assertThat(events().stream().filter(e -> e.kind().equals("move")).findFirst().orElseThrow().data())
                .containsEntry("from", "자재 랙").containsEntry("to", "Main Station 3").containsEntry("material", "Main Frame");
        assertThat(mes.snapshot(drawing).materials()).hasSize(1);
    }

    @Test
    void 날짜가_바뀌면_오늘_완료_0부터() {
        mes.override(drawing, station, 99.5, 99.5, 1);
        mes.advance(1);
        assertThat(mes.snapshot(drawing).kpi().doneToday()).isEqualTo(1);
        clock.now = Instant.parse("2026-11-14T01:00:00Z");
        mes.advance(0);
        assertThat(mes.snapshot(drawing).kpi().doneToday()).isZero();
    }

    @Test
    void 나셀_공장은_시드의_시작값() throws Exception {
        jdbc.update("insert into drawing (name, source_type, source_file, created_by) values ('나셀 공장', 'dxf', 'x', 'system')");
        assertThat(stationSeeder.seedFactory()).isEqualTo(6);
        long id = jdbc.queryForObject("select id from drawing where name = '나셀 공장'", Long.class);
        var snap = mes.snapshot(id);
        var main2 = snap.stations().stream().filter(s -> s.name().equals("Main Station 2")).findFirst().orElseThrow();
        assertThat(main2.no()).isEqualTo(3);
        assertThat(main2.actual()).isEqualTo(60.0);
        assertThat(main2.target()).isEqualTo(88.0);
        assertThat(main2.status()).isEqualTo("bad");
        assertThat(snap.kpi().running()).isEqualTo(6);
        assertThat(snap.projects()).hasSize(4);
    }
}
```

Run: `cd /c/kopens/project/Factory3D/server && ./gradlew test --tests "*VirtualMesTest"`
Expected: FAIL (live 패키지 없음).

- [ ] **Step 3: 구현 — 메시지·인터페이스·삭제 이벤트**

`live/LiveMessages.java`:
```java
package com.kopens.factory3d.live;

import java.util.List;
import java.util.Map;

/** WebSocket 으로 보내는 JSON (화면 web/src/dashboard/types.ts 와 같은 모양). actual·target 은 소수 1자리 */
public final class LiveMessages {
    private LiveMessages() {}

    public record Kpi(int running, int ok, int warn, int bad, int doneToday, int planRate, String at) {}

    public record StationLive(long id, int no, String name, String placementName, List<String> steps, int step, double actual,
            double target, String status, Long projectId, Integer unitNo) {}

    public record ProjectLive(long id, String name, int done, int total, String period, String state) {}

    public record LiveEvent(long id, String at, String kind, String station, String text, Map<String, Object> data) {}

    public record Snapshot(String type, long drawingId, Kpi kpi, List<StationLive> stations, List<ProjectLive> projects,
            List<LiveEvent> events, List<LiveEvent> materials) {}

    public record Tick(String type, Kpi kpi, List<StationLive> stations) {}

    public record EventMessage(String type, LiveEvent event) {}

    public record Projects(String type, List<ProjectLive> projects) {}
}
```

`live/LiveListener.java`:
```java
package com.kopens.factory3d.live;

/** 한 도면의 실시간 메시지를 받는 쪽 (WebSocket 세션 하나). message 는 LiveMessages 의 record */
@FunctionalInterface
public interface LiveListener {
    void onMessage(Object message);
}
```

`live/ProductionSource.java`:
```java
package com.kopens.factory3d.live;

/** 생산 데이터 원천. 첫 구현 = VirtualMes(가상 MES). 나중에 실제 MES 연동도 이 인터페이스로 */
public interface ProductionSource {
    /** 지금 상태 전체. 공정이 없는 도면은 빈 목록 */
    LiveMessages.Snapshot snapshot(long drawingId);

    void subscribe(long drawingId, LiveListener listener);

    void unsubscribe(long drawingId, LiveListener listener);

    /** 기준정보를 다시 읽어 처음부터 진행하고 구독자에게 새 snapshot */
    void reload(long drawingId);
}
```

`drawing/DrawingDeleted.java`:
```java
package com.kopens.factory3d.drawing;

/** 도면이 지워짐 → 상황판(VirtualMes)이 커밋 뒤 그 도면을 내림 */
public record DrawingDeleted(long drawingId) {}
```

`drawing/DrawingService.java` — `import org.springframework.context.ApplicationEventPublisher;` 를 추가하고, 필드 `private final ApplicationEventPublisher events;` 와 생성자 매개변수(맨 끝, `long maxPlan` 다음) `ApplicationEventPublisher events` → `this.events = events;`. `delete` 의 `audit.log("DRAWING_DELETE", d.name(), "id=" + id);` 바로 아래에:
```java
        events.publishEvent(new DrawingDeleted(id));
```
(`grep -rn "new DrawingService(" server/src` 결과가 없어야 함 — 직접 만드는 곳이 없으므로 생성자 변경은 스프링만 영향.)

- [ ] **Step 4: 구현 — VirtualMes·스케줄러**

`live/VirtualMes.java`:
```java
package com.kopens.factory3d.live;

import com.kopens.factory3d.drawing.DrawingDeleted;
import com.kopens.factory3d.live.LiveMessages.Kpi;
import com.kopens.factory3d.live.LiveMessages.LiveEvent;
import com.kopens.factory3d.live.LiveMessages.ProjectLive;
import com.kopens.factory3d.live.LiveMessages.StationLive;
import com.kopens.factory3d.station.ProjectMapper;
import com.kopens.factory3d.station.ProjectView;
import com.kopens.factory3d.station.StationMapper;
import com.kopens.factory3d.station.StationSeeder;
import com.kopens.factory3d.station.StationView;
import com.kopens.factory3d.station.StationsChanged;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicLong;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * 가상 MES (ProductionSource 첫 구현). 공정이 있는 도면마다 메모리에서 생산을 진행한다 (demo dashStep).
 * 목표는 택타임마다 100%, 실적은 스테이션 속도(rate) 배. 1초 진행은 LiveScheduler 가 tick(), 테스트는 advance(dt).
 * 상태는 this 로 잠그고, 구독자 전달은 잠금 밖에서 한다.
 */
@Service
public class VirtualMes implements ProductionSource {
    private static final Logger log = LoggerFactory.getLogger(VirtualMes.class);
    static final int MAX_EVENTS = 50;
    static final int MAX_MATERIALS = 20;
    static final double MAX_DT = 5; // 서버가 잠깐 멈췄다 돌아와도 한 번에 5초까지만
    static final String RACK = "자재 랙";

    /** 스테이션 하나의 진행 상태 */
    private static final class Unit {
        final StationView s;
        final Random rnd;
        double actual;
        double target;
        double rate;
        double nextMaterial; // 다음 자재 입고 가상 시각 (Board.simT 기준)
        int step;
        String status;

        Unit(StationView s) {
            this.s = s;
            this.rnd = new Random(s.id());
        }
    }

    /** 도면 하나의 진행 상태 */
    private static final class Board {
        final long drawingId;
        final List<Unit> units = new ArrayList<>();
        final Map<Long, ProjectView> projects = new LinkedHashMap<>();
        final Deque<LiveEvent> events = new ArrayDeque<>();
        final Deque<LiveEvent> materials = new ArrayDeque<>();
        LocalDate day;
        int doneToday;
        double simT; // 올린 뒤 흐른 가상 시간(초)

        Board(long drawingId) {
            this.drawingId = drawingId;
        }
    }

    private record Delivery(long drawingId, List<Object> messages) {}

    private final StationMapper stationMapper;
    private final ProjectMapper projectMapper;
    private final StationSeeder seeds;
    private final JdbcTemplate jdbc;
    private final ZoneId zone;
    private final Map<Long, Board> boards = new HashMap<>(); // this 로 잠금
    private final Map<Long, List<LiveListener>> listeners = new ConcurrentHashMap<>();
    private final AtomicLong eventIds = new AtomicLong();
    private volatile Clock clock = Clock.systemUTC();
    private volatile double scale;
    private long lastTick = -1;

    public VirtualMes(StationMapper stationMapper, ProjectMapper projectMapper, StationSeeder seeds, JdbcTemplate jdbc,
            @Value("${factory3d.time-zone:Asia/Seoul}") String timeZone, @Value("${factory3d.live.time-scale:1}") double scale) {
        this.stationMapper = stationMapper;
        this.projectMapper = projectMapper;
        this.seeds = seeds;
        this.jdbc = jdbc;
        this.zone = ZoneId.of(timeZone);
        this.scale = scale > 0 ? scale : 1;
    }

    /* ---------------- 공개 ---------------- */

    @EventListener(ApplicationReadyEvent.class)
    public void start() {
        List<Long> ids = jdbc.queryForList("select distinct drawing_id from station order by drawing_id", Long.class);
        synchronized (this) {
            for (long id : ids) {
                if (boards.containsKey(id)) continue;
                Board b = load(id);
                if (b != null) boards.put(id, b);
            }
            log.info("상황판: 공정이 있는 도면 {}개를 올렸습니다 (진행 배율 {})", boards.size(), scale);
        }
    }

    @Override
    public synchronized LiveMessages.Snapshot snapshot(long drawingId) {
        Board b = boardOf(drawingId);
        return b == null ? empty(drawingId) : snapshotOf(b);
    }

    @Override
    public void subscribe(long drawingId, LiveListener listener) {
        listeners.computeIfAbsent(drawingId, k -> new CopyOnWriteArrayList<>()).add(listener);
    }

    @Override
    public void unsubscribe(long drawingId, LiveListener listener) {
        List<LiveListener> list = listeners.get(drawingId);
        if (list != null) list.remove(listener);
    }

    @Override
    public void reload(long drawingId) {
        LiveMessages.Snapshot snap;
        synchronized (this) {
            Board b = load(drawingId);
            if (b == null) boards.remove(drawingId);
            else boards.put(drawingId, b);
            snap = b == null ? empty(drawingId) : snapshotOf(b);
        }
        deliver(new Delivery(drawingId, List.of(snap)));
    }

    public synchronized void unload(long drawingId) {
        boards.remove(drawingId);
    }

    @TransactionalEventListener(fallbackExecution = true)
    public void onStationsChanged(StationsChanged e) {
        reload(e.drawingId());
    }

    @TransactionalEventListener(fallbackExecution = true)
    public void onDrawingDeleted(DrawingDeleted e) {
        unload(e.drawingId());
    }

    /** 스케줄러가 1초마다: 실제 경과 초로 진행 (첫 번은 1초, 최대 5초) */
    public void tick() {
        long now = clock.millis();
        double dt;
        synchronized (this) {
            dt = lastTick < 0 ? 1 : (now - lastTick) / 1000.0;
            lastTick = now;
        }
        advance(Math.min(MAX_DT, Math.max(0, dt)));
    }

    /** 올라 있는 모든 도면을 실제 dtSec 초만큼 진행하고 도면별로 event… → projects → tick 을 전달 */
    public void advance(double dtSec) {
        List<Delivery> out = new ArrayList<>();
        synchronized (this) {
            for (Board b : boards.values()) out.add(step(b, Math.max(0, dtSec)));
        }
        out.forEach(this::deliver);
    }

    static String statusOf(double gap, int warnPp, int delayPp) {
        return gap <= warnPp ? "ok" : gap <= delayPp ? "warn" : "bad";
    }

    static int stepOf(double actual, int n) {
        return Math.max(1, Math.min(n, (int) Math.floor(actual / 100 * n) + 1));
    }

    /* ---------------- 테스트용 ---------------- */

    void useClock(Clock c) {
        clock = c;
    }

    void setTimeScale(double s) {
        scale = s;
    }

    /** 한 스테이션의 실적·목표·속도를 바로 정함 (이벤트 없음) */
    synchronized void override(long drawingId, long stationId, double actual, double target, double rate) {
        Board b = boardOf(drawingId);
        if (b == null) return;
        for (Unit u : b.units)
            if (u.s.id() == stationId) {
                u.actual = actual;
                u.target = target;
                u.rate = rate;
                u.step = stepOf(actual, u.s.steps().size());
                u.status = statusOf(target - actual, u.s.warnPp(), u.s.delayPp());
            }
    }

    synchronized void unloadAll() {
        boards.clear();
        listeners.clear();
        lastTick = -1;
    }

    synchronized Set<Long> loaded() {
        return Set.copyOf(boards.keySet());
    }

    /* ---------------- 내부 ---------------- */

    private Board boardOf(long drawingId) {
        Board b = boards.get(drawingId);
        if (b == null) {
            b = load(drawingId);
            if (b != null) boards.put(drawingId, b);
        }
        return b;
    }

    /** DB 기준정보로 처음 상태를 만듦. 공정이 없으면 null */
    private Board load(long drawingId) {
        List<StationView> list = stationMapper.findByDrawing(drawingId);
        if (list.isEmpty()) return null;
        Map<String, double[]> start = seeds.startValues(drawingId);
        Board b = new Board(drawingId);
        for (ProjectView p : projectMapper.findByDrawing(drawingId)) b.projects.put(p.id(), p);
        for (StationView s : list) {
            Unit u = new Unit(s);
            u.rate = 0.70 + u.rnd.nextDouble() * 0.35;
            double[] sv = start.get(s.name());
            if (sv != null) {
                u.actual = sv[0];
                u.target = sv[1];
            } else {
                u.actual = 30 + u.rnd.nextInt(41);
                u.target = u.actual + u.rnd.nextInt(26);
            }
            u.step = stepOf(u.actual, s.steps().size());
            u.status = statusOf(u.target - u.actual, s.warnPp(), s.delayPp());
            u.nextMaterial = s.materials().isEmpty() ? Double.POSITIVE_INFINITY : 60 + u.rnd.nextDouble() * 120;
            b.units.add(u);
        }
        b.day = today();
        b.doneToday = readDaily(drawingId, b.day);
        return b;
    }

    private Delivery step(Board b, double dt) {
        List<Object> msgs = new ArrayList<>();
        LocalDate today = today();
        if (!today.equals(b.day)) {
            b.day = today;
            b.doneToday = 0;
        }
        double sim = dt * scale;
        b.simT += sim;
        boolean projectsChanged = false;
        for (Unit u : b.units) {
            StationView s = u.s;
            int n = s.steps().size();
            double inc = sim / s.taktSec() * 100;
            u.target += inc;
            u.actual += inc * u.rate;
            while (u.actual >= 100) { // 한 대 완료 → 다음 대 (남은 계획 지연분은 이어짐)
                emit(b, msgs, u, "step_done", s.name() + " " + stepName(s, u.step) + " 완료", Map.of("step", u.step));
                projectsChanged |= unitDone(b, msgs, u);
                u.actual -= 100;
                u.target = Math.max(0, u.target - 100);
                u.step = stepOf(u.actual, n);
                emit(b, msgs, u, "step_start", s.name() + " " + stepName(s, u.step) + " 시작", Map.of("step", u.step));
            }
            int k = stepOf(u.actual, n);
            if (k != u.step) {
                emit(b, msgs, u, "step_done", s.name() + " " + stepName(s, u.step) + " 완료", Map.of("step", u.step));
                u.step = k;
                emit(b, msgs, u, "step_start", s.name() + " " + stepName(s, k) + " 시작", Map.of("step", k));
            }
            String st = statusOf(u.target - u.actual, s.warnPp(), s.delayPp());
            if (!st.equals(u.status)) {
                String text = switch (st) {
                    case "ok" -> s.name() + " 공정 정상화";
                    case "warn" -> s.name() + " 제작 주의";
                    default -> s.name() + " 제작 지연";
                };
                emit(b, msgs, u, "status_change", text, Map.of("from", u.status, "to", st));
                u.status = st;
            }
            if (b.simT >= u.nextMaterial) {
                String mat = s.materials().get(u.rnd.nextInt(s.materials().size()));
                emit(b, msgs, u, "material_in", mat + " 입고 → " + s.name(), Map.of("material", mat));
                emit(b, msgs, u, "move", mat + " 운반 · " + RACK + " → " + s.name(), Map.of("from", RACK, "to", s.name(), "material", mat));
                u.nextMaterial = b.simT + 60 + u.rnd.nextDouble() * 120;
            }
        }
        if (projectsChanged) msgs.add(new LiveMessages.Projects("projects", projectsOf(b)));
        msgs.add(new LiveMessages.Tick("tick", kpi(b), stationsOf(b)));
        return new Delivery(b.drawingId, msgs);
    }

    /** 한 대 완료: 메인 스테이션은 PJT 제작 수 +1 (DB), 모든 완료가 오늘 완료 +1 (DB). PJT 가 바뀌었으면 true */
    private boolean unitDone(Board b, List<Object> msgs, Unit u) {
        StationView s = u.s;
        ProjectView p = s.projectId() == null ? null : b.projects.get(s.projectId());
        boolean changed = false;
        String text;
        Map<String, Object> data = new LinkedHashMap<>();
        if (s.countsProject() && p != null) {
            int done = Math.min(p.total(), p.done() + 1);
            if (done != p.done()) {
                p = new ProjectView(p.id(), p.name(), done, p.total(), p.period(), p.state(), p.sortOrder());
                b.projects.put(p.id(), p);
                persistDone(p);
                changed = true;
            }
            text = s.name() + " · " + p.name() + " " + done + "호기 완료";
            data.put("project", p.name());
            data.put("unitNo", done);
        } else {
            text = s.name() + " 1대 조립 완료";
        }
        b.doneToday++;
        persistDaily(b.drawingId, b.day);
        u.rate = Math.max(0.6, Math.min(1.1, u.rate + (u.rnd.nextDouble() * 0.16 - 0.08)));
        emit(b, msgs, u, "unit_done", text, data);
        return changed;
    }

    private void emit(Board b, List<Object> msgs, Unit u, String kind, String text, Map<String, Object> data) {
        var e = new LiveEvent(eventIds.incrementAndGet(), now(), kind, u.s.name(), text, data);
        if (!kind.startsWith("step_")) {
            b.events.addFirst(e);
            while (b.events.size() > MAX_EVENTS) b.events.removeLast();
        }
        if (kind.equals("material_in")) {
            b.materials.addFirst(e);
            while (b.materials.size() > MAX_MATERIALS) b.materials.removeLast();
        }
        msgs.add(new LiveMessages.EventMessage("event", e));
    }

    private void deliver(Delivery d) {
        List<LiveListener> list = listeners.get(d.drawingId());
        if (list == null || list.isEmpty()) return;
        for (LiveListener l : list)
            for (Object m : d.messages()) {
                try {
                    l.onMessage(m);
                } catch (RuntimeException e) {
                    log.debug("상황판 전달 실패: {}", e.getMessage());
                }
            }
    }

    private Kpi kpi(Board b) {
        int ok = 0, warn = 0, bad = 0;
        double rate = 0;
        for (Unit u : b.units) {
            switch (u.status) {
                case "ok" -> ok++;
                case "warn" -> warn++;
                default -> bad++;
            }
            rate += Math.min(1, u.actual / Math.max(1, u.target));
        }
        int n = b.units.size();
        return new Kpi(n, ok, warn, bad, b.doneToday, n == 0 ? 0 : (int) Math.round(rate / n * 100), now());
    }

    private List<StationLive> stationsOf(Board b) {
        List<StationLive> out = new ArrayList<>();
        for (Unit u : b.units) {
            StationView s = u.s;
            ProjectView p = s.projectId() == null ? null : b.projects.get(s.projectId());
            out.add(new StationLive(s.id(), s.no(), s.name(), s.placementName(), s.steps(), u.step, round1(u.actual), round1(u.target),
                    u.status, p == null ? null : p.id(), p == null ? null : Math.min(p.total(), p.done() + 1)));
        }
        return out;
    }

    private static List<ProjectLive> projectsOf(Board b) {
        return b.projects.values().stream().map(p -> new ProjectLive(p.id(), p.name(), p.done(), p.total(), p.period(), p.state())).toList();
    }

    private LiveMessages.Snapshot snapshotOf(Board b) {
        return new LiveMessages.Snapshot("snapshot", b.drawingId, kpi(b), stationsOf(b), projectsOf(b), List.copyOf(b.events),
                List.copyOf(b.materials));
    }

    private LiveMessages.Snapshot empty(long drawingId) {
        return new LiveMessages.Snapshot("snapshot", drawingId, new Kpi(0, 0, 0, 0, 0, 0, now()), List.of(), List.of(), List.of(), List.of());
    }

    private void persistDone(ProjectView p) {
        try {
            projectMapper.setDone(p.id(), p.done());
        } catch (RuntimeException e) {
            log.warn("PJT 제작 수를 저장하지 못했습니다: {}", e.getMessage());
        }
    }

    private void persistDaily(long drawingId, LocalDate day) {
        try {
            jdbc.update("insert into live_daily (drawing_id, day, done) values (?, ?, 1) "
                    + "on conflict (drawing_id, day) do update set done = live_daily.done + 1", drawingId, day);
        } catch (RuntimeException e) {
            log.warn("오늘 완료 수를 저장하지 못했습니다: {}", e.getMessage());
        }
    }

    private int readDaily(long drawingId, LocalDate day) {
        List<Integer> r = jdbc.queryForList("select done from live_daily where drawing_id = ? and day = ?", Integer.class, drawingId, day);
        return r.isEmpty() ? 0 : r.get(0);
    }

    private static String stepName(StationView s, int step) {
        return s.steps().get(Math.max(1, Math.min(step, s.steps().size())) - 1);
    }

    private static double round1(double v) {
        return Math.round(v * 10) / 10.0;
    }

    private LocalDate today() {
        return LocalDate.ofInstant(clock.instant(), zone);
    }

    private String now() {
        return Instant.now(clock).toString();
    }
}
```

`live/LiveConfig.java`:
```java
package com.kopens.factory3d.live;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/** @Scheduled 켜기 (LiveScheduler) */
@Configuration
@EnableScheduling
public class LiveConfig {}
```

`live/LiveScheduler.java`:
```java
package com.kopens.factory3d.live;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** 1초마다 가상 MES 진행 (factory3d.live.enabled=false 면 없음 — 테스트) */
@Component
@ConditionalOnProperty(name = "factory3d.live.enabled", havingValue = "true", matchIfMissing = true)
public class LiveScheduler {
    private static final Logger log = LoggerFactory.getLogger(LiveScheduler.class);
    private final VirtualMes mes;

    public LiveScheduler(VirtualMes mes) {
        this.mes = mes;
    }

    @Scheduled(fixedRate = 1000)
    public void run() {
        try {
            mes.tick();
        } catch (RuntimeException e) {
            log.warn("상황판 진행 실패: {}", e.getMessage());
        }
    }
}
```

- [ ] **Step 5: 통과 확인 (전체)**

Run: `cd /c/kopens/project/Factory3D/server && ./gradlew test`
Expected: PASS (VirtualMesTest 11개 포함, 기존 테스트 그대로).

- [ ] **Step 6: Commit**

```bash
cd /c/kopens/project/Factory3D && git add server
git commit -m "feat(server): 가상 MES — ProductionSource·VirtualMes(advance·이벤트·KPI)·1초 진행·PJT/오늘 완료 저장

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 서버 — WebSocket `/ws/live`

**Files:**
- Modify: `server/build.gradle` (websocket starter), `server/src/main/resources/application.yml` (`allowed-origins`), `server/src/main/java/com/kopens/factory3d/common/SecurityConfig.java` (`/ws/**`)
- Create: `server/src/main/java/com/kopens/factory3d/live/{LiveSocketHandler,WebSocketConfig}.java`
- Test: `server/src/test/java/com/kopens/factory3d/live/LiveSocketTest.java`

**Interfaces:**
- Consumes: Task 3 `ProductionSource.snapshot/subscribe/unsubscribe`, `LiveListener`, `VirtualMes.advance/unloadAll` (테스트).
- Produces: `ws(s)://<host>/ws/live?drawing=<id>` — 조회 이상 로그인 세션 필요(아니면 핸드셰이크 401), 허용되지 않은 출처 403, `drawing` 이 숫자가 아니거나 없는 도면이면 close 4404. 접속 직후 `snapshot` 1번, 그 뒤 `event`·`projects`·`tick`. 설정 `factory3d.live.allowed-origins`(`F3D_LIVE_ORIGINS`, 기본 `http://localhost:5200`, 같은 출처는 항상 허용).

- [ ] **Step 1: 의존성·설정**

`server/build.gradle` 의 `implementation 'org.springframework.boot:spring-boot-starter-security'` 아래에 (Boot 4 의 starter 이름 규칙은 기존 `spring-boot-starter-webmvc`·`-security` 와 같음):
```groovy
    implementation 'org.springframework.boot:spring-boot-starter-websocket'
```
Run: `cd /c/kopens/project/Factory3D/server && ./gradlew dependencies --configuration runtimeClasspath | grep -E "spring-websocket|tomcat-embed-websocket" | head -3`
Expected: `org.springframework:spring-websocket:7.x` 와 `org.apache.tomcat.embed:tomcat-embed-websocket` 이 보임.

`application.yml` 의 `factory3d.live` 블록 끝에 한 줄 추가:
```yaml
    allowed-origins: ${F3D_LIVE_ORIGINS:http://localhost:5200} # 같은 출처는 항상 허용, 개발 서버(vite) 추가
```

- [ ] **Step 2: 실패 테스트**

`server/src/test/java/com/kopens/factory3d/live/LiveSocketTest.java`:
```java
package com.kopens.factory3d.live;

import static java.util.concurrent.TimeUnit.SECONDS;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.kopens.factory3d.support.IntegrationTest;
import java.net.CookieManager;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.WebSocket;
import java.net.http.WebSocketHandshakeException;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.LinkedBlockingQueue;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.crypto.password.PasswordEncoder;

/** 진짜 서버(임의 포트) + 진짜 로그인 세션으로 WebSocket 접속 (JDK HttpClient 의 WebSocket) */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LiveSocketTest extends IntegrationTest {
    /** 받은 글 메시지·닫힘 코드 */
    static final class Collector implements WebSocket.Listener {
        final BlockingQueue<String> messages = new LinkedBlockingQueue<>();
        final CompletableFuture<Integer> closed = new CompletableFuture<>();
        private final StringBuilder buf = new StringBuilder();

        @Override
        public CompletionStage<?> onText(WebSocket ws, CharSequence data, boolean last) {
            buf.append(data);
            if (last) {
                messages.add(buf.toString());
                buf.setLength(0);
            }
            ws.request(1);
            return null;
        }

        @Override
        public CompletionStage<?> onClose(WebSocket ws, int code, String reason) {
            closed.complete(code);
            return null;
        }

        @Override
        public void onError(WebSocket ws, Throwable error) {
            closed.completeExceptionally(error);
        }
    }

    @Value("${local.server.port}") int port;
    @Autowired PasswordEncoder encoder;
    @Autowired VirtualMes mes;
    long drawing;

    @BeforeEach
    void setUp() {
        mes.unloadAll();
        drawing = jdbc.queryForObject("insert into drawing (name, source_type, source_file) values ('공장', 'dxf', 'x') returning id", Long.class);
        jdbc.update("insert into station (drawing_id, sort_order, name, steps) values (?, 1, '공정A', array['a','b'])", drawing);
        jdbc.update("insert into app_user (username, display_name, password_hash, role, must_change_password) values ('kim', '김', ?, 'VIEWER', false)",
                encoder.encode("pass1234"));
    }

    @AfterEach
    void tearDown() {
        mes.unloadAll();
    }

    private String base() {
        return "http://localhost:" + port;
    }

    /** /api/health 로 XSRF-TOKEN 쿠키를 받고 로그인 → "F3D_SESSION=..." */
    private String login() throws Exception {
        var cookies = new CookieManager();
        var http = HttpClient.newBuilder().cookieHandler(cookies).build();
        http.send(HttpRequest.newBuilder(URI.create(base() + "/api/health")).build(), HttpResponse.BodyHandlers.discarding());
        String xsrf = cookies.getCookieStore().getCookies().stream().filter(c -> c.getName().equals("XSRF-TOKEN")).findFirst().orElseThrow().getValue();
        var res = http.send(HttpRequest.newBuilder(URI.create(base() + "/api/auth/login"))
                .header("Content-Type", "application/json").header("X-XSRF-TOKEN", xsrf)
                .POST(HttpRequest.BodyPublishers.ofString("{\"username\":\"kim\",\"password\":\"pass1234\"}")).build(), HttpResponse.BodyHandlers.ofString());
        assertThat(res.statusCode()).isEqualTo(200);
        return cookies.getCookieStore().getCookies().stream().filter(c -> c.getName().equals("F3D_SESSION")).findFirst()
                .map(c -> "F3D_SESSION=" + c.getValue()).orElseThrow();
    }

    private CompletableFuture<WebSocket> open(Collector c, String cookie, String origin, String drawingParam) {
        var b = HttpClient.newHttpClient().newWebSocketBuilder();
        if (cookie != null) b.header("Cookie", cookie);
        if (origin != null) b.header("Origin", origin);
        return b.buildAsync(URI.create("ws://localhost:" + port + "/ws/live?drawing=" + drawingParam), c);
    }

    @Test
    void 로그인_안_하면_거부() throws Exception {
        mvc.perform(get("/ws/live").param("drawing", String.valueOf(drawing))).andExpect(status().isUnauthorized());
        assertThatThrownBy(() -> open(new Collector(), null, null, String.valueOf(drawing)).get(5, SECONDS))
                .hasRootCauseInstanceOf(WebSocketHandshakeException.class);
    }

    @Test
    void 접속하면_snapshot_먼저_그다음_tick() throws Exception {
        var c = new Collector();
        WebSocket ws = open(c, login(), null, String.valueOf(drawing)).get(5, SECONDS);
        String first = c.messages.poll(5, SECONDS);
        assertThat(first).contains("\"type\":\"snapshot\"").contains("\"name\":\"공정A\"").contains("\"drawingId\":" + drawing);
        mes.advance(1);
        String next;
        do next = c.messages.poll(5, SECONDS);
        while (next != null && !next.contains("\"type\":\"tick\""));
        assertThat(next).contains("\"running\":1");
        ws.sendClose(WebSocket.NORMAL_CLOSURE, "").get(5, SECONDS);
    }

    @Test
    void 없는_도면이나_숫자가_아니면_4404로_닫음() throws Exception {
        String cookie = login();
        var c1 = new Collector();
        open(c1, cookie, null, "999999999").get(5, SECONDS);
        assertThat(c1.closed.get(5, SECONDS)).isEqualTo(4404);
        var c2 = new Collector();
        open(c2, cookie, null, "abc").get(5, SECONDS);
        assertThat(c2.closed.get(5, SECONDS)).isEqualTo(4404);
    }

    @Test
    void 다른_출처는_거부() throws Exception {
        String cookie = login();
        assertThatThrownBy(() -> open(new Collector(), cookie, "http://evil.example", String.valueOf(drawing)).get(5, SECONDS))
                .hasRootCauseInstanceOf(WebSocketHandshakeException.class);
    }
}
```

Run: `cd /c/kopens/project/Factory3D/server && ./gradlew test --tests "*LiveSocketTest"`
Expected: FAIL (`/ws/live` 없음 — 핸드셰이크 실패).

- [ ] **Step 3: 구현**

`common/SecurityConfig.java` — `.requestMatchers("/v3/**", "/swagger-ui/**", "/swagger-ui.html").hasRole("ADMIN")` 줄 바로 위에 추가:
```java
                        .requestMatchers("/ws/**").hasRole("VIEWER") // 상황판 WebSocket: 조회 이상 (비밀번호 변경 전 세션은 403)
```

`live/LiveSocketHandler.java`:
```java
package com.kopens.factory3d.live;

import java.io.IOException;
import java.net.URI;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import org.springframework.web.util.UriComponentsBuilder;
import tools.jackson.databind.ObjectMapper;

/** /ws/live?drawing={id}: 접속하면 snapshot 먼저, 그다음 event·projects·tick. 화면이 보내는 메시지는 없음 */
@Component
public class LiveSocketHandler extends TextWebSocketHandler {
    static final CloseStatus NOT_FOUND = new CloseStatus(4404, "drawing not found");
    private static final Logger log = LoggerFactory.getLogger(LiveSocketHandler.class);
    private static final String SUB = "f3d.live";
    private static final int SEND_TIME_LIMIT_MS = 5000;
    private static final int BUFFER_LIMIT = 512 * 1024;

    private final ProductionSource source;
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public LiveSocketHandler(ProductionSource source, JdbcTemplate jdbc, ObjectMapper json) {
        this.source = source;
        this.jdbc = jdbc;
        this.json = json;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws IOException {
        Long id = drawingId(session.getUri());
        if (id == null || !Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from drawing where id = ?)", Boolean.class, id))) {
            session.close(NOT_FOUND);
            return;
        }
        var sub = new Sub(id, new ConcurrentWebSocketSessionDecorator(session, SEND_TIME_LIMIT_MS, BUFFER_LIMIT));
        session.getAttributes().put(SUB, sub);
        source.subscribe(id, sub);
        sub.start(source.snapshot(id));
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        if (session.getAttributes().remove(SUB) instanceof Sub sub) source.unsubscribe(sub.drawingId, sub);
    }

    static Long drawingId(URI uri) {
        if (uri == null) return null;
        String v = UriComponentsBuilder.fromUri(uri).build().getQueryParams().getFirst("drawing");
        try {
            return v == null ? null : Long.valueOf(v);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** 세션 하나. snapshot 을 보내기 전에 온 메시지는 버림 (snapshot 에 이미 들어 있음, 겹친 event 는 화면이 id 로 거름) */
    private final class Sub implements LiveListener {
        final long drawingId;
        private final WebSocketSession out;
        private boolean ready;

        Sub(long drawingId, WebSocketSession out) {
            this.drawingId = drawingId;
            this.out = out;
        }

        synchronized void start(Object snapshot) {
            send(snapshot);
            ready = true;
        }

        @Override
        public synchronized void onMessage(Object message) {
            if (ready) send(message);
        }

        private void send(Object message) {
            if (!out.isOpen()) return;
            try {
                out.sendMessage(new TextMessage(json.writeValueAsString(message)));
            } catch (Exception e) { // 느리거나 끊긴 연결 → 닫음 (화면이 다시 붙음)
                log.debug("상황판 전송 실패: {}", e.getMessage());
                try {
                    out.close(CloseStatus.SESSION_NOT_RELIABLE);
                } catch (IOException ignored) {
                    // 이미 닫힘
                }
            }
        }
    }
}
```

`live/WebSocketConfig.java`:
```java
package com.kopens.factory3d.live;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

/** raw WebSocket (JSON 글). 같은 출처는 항상 허용, 그 밖에는 factory3d.live.allowed-origins 만 */
@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {
    private final LiveSocketHandler handler;
    private final String[] origins;

    public WebSocketConfig(LiveSocketHandler handler, @Value("${factory3d.live.allowed-origins:http://localhost:5200}") String[] origins) {
        this.handler = handler;
        this.origins = origins;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, "/ws/live").setAllowedOrigins(origins);
    }
}
```

- [ ] **Step 4: 통과 확인 (전체)**

Run: `cd /c/kopens/project/Factory3D/server && ./gradlew test`
Expected: PASS. (`LiveSocketTest` 는 임의 포트로 앱을 한 번 더 띄우므로 조금 느림.)

- [ ] **Step 5: Commit**

```bash
cd /c/kopens/project/Factory3D && git add server
git commit -m "feat(server): 상황판 WebSocket /ws/live — 로그인 세션·출처 검사·snapshot 먼저·4404

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 웹 — 상황판 순수 모듈 (types · liveReducer · gauge · chipLayout · tween · status)

**Files:**
- Create: `web/src/dashboard/{types,liveReducer,gauge,chipLayout,tween,status}.ts`
- Test: `web/src/dashboard/live.test.ts`

**Interfaces:**
- Consumes: 없음 (lucide-react 아이콘만).
- Produces:
```ts
// types.ts — 서버 LiveMessages 와 같은 모양
export type Status = 'ok' | 'warn' | 'bad'
export type EventKind = 'step_start' | 'step_done' | 'unit_done' | 'status_change' | 'material_in' | 'move'
export type Conn = 'connecting' | 'live' | 'retrying' | 'closed'
export interface Kpi { running; ok; warn; bad; doneToday; planRate: number; at: string }
export interface StationLive { id; no; name; placementName: string | null; steps: string[]; step; actual; target; status: Status; projectId: number | null; unitNo: number | null }
export interface ProjectLive { id; name; done; total; period: string | null; state: 'run' | 'wait' | 'done' }
export interface LiveEvent { id: number; at: string; kind: EventKind; station: string; text: string; data: Record<string, unknown> }
export interface LiveState { drawingId: number; kpi: Kpi; stations: StationLive[]; projects: ProjectLive[]; events: LiveEvent[]; materials: LiveEvent[] }
export type LiveMessage = ({ type: 'snapshot' } & LiveState) | { type: 'tick'; kpi; stations } | { type: 'event'; event } | { type: 'projects'; projects }
// liveReducer.ts
export const MAX_EVENTS = 50, MAX_MATERIALS = 20
export function isStepEvent(e: Pick<LiveEvent, 'kind'>): boolean
export function liveReducer(state: LiveState | null, msg: LiveMessage): LiveState | null
// gauge.ts
export interface Cell { on: boolean; target: boolean; current: boolean }
export function stepOf(actual: number, n: number): number
export function gaugeCells(n: number, actual: number, target: number): Cell[]
// chipLayout.ts
export interface ChipIn { id: number; x: number; y: number; w: number; h: number }      // 설비 기준점 화면 px, 칩 크기
export interface ChipOut { id: number; cx: number; bottom: number; lift: number; dx: number }
export function layoutChips(chips: ChipIn[], view: { w: number; h: number }, top?: number): ChipOut[]   // top 기본 62
// tween.ts
export const easeOutCubic: (k: number) => number
export interface Tween { from: number; to: number; t0: number; ms: number }
export function valueAt(t: Tween, now: number): number
export function retarget(cur: Tween, value: number, now: number, ms: number, snapDown?: boolean): Tween
export function useTweened(value: number, ms?: number, opts?: { snapDown?: boolean }): number   // 처음 값은 보간 없이
export function useCountUp(value: number, ms?: number): number                                   // 정수
// status.ts
export const STATUS_LABEL: Record<Status, string>       // 진행중·주의·지연
export const STATUS_COLOR: Record<Status, string>       // #22c55e · #f59e0b · #ef4444
export const PROJECT_STATE_LABEL: Record<ProjectLive['state'], string>   // 진행·대기·완료
export function eventIcon(e: LiveEvent): { icon: LucideIcon; color: string } | null    // step_* 은 null (이벤트 줄·서랍에 안 넣음)
export function fmtTime(iso: string): string            // HH:MM:SS (브라우저 시간대)
```

- [ ] **Step 1: 실패 테스트**

`web/src/dashboard/live.test.ts`:
```ts
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { layoutChips, type ChipIn, type ChipOut } from './chipLayout'
import { gaugeCells, stepOf } from './gauge'
import { liveReducer, MAX_EVENTS } from './liveReducer'
import { eventIcon, fmtTime } from './status'
import { easeOutCubic, retarget, useTweened, valueAt } from './tween'
import type { Kpi, LiveEvent, LiveState, StationLive } from './types'

const KPI: Kpi = { running: 1, ok: 1, warn: 0, bad: 0, doneToday: 0, planRate: 100, at: '2026-11-13T01:00:00Z' }
const ST: StationLive = { id: 1, no: 1, name: 'A', placementName: 'A', steps: ['a', 'b'], step: 1, actual: 10, target: 12, status: 'ok', projectId: null, unitNo: null }
const ev = (id: number, kind: LiveEvent['kind'] = 'unit_done', data: Record<string, unknown> = {}): LiveEvent => ({ id, at: '2026-11-13T01:00:00Z', kind, station: 'A', text: `e${id}`, data })
const snap = (over: Partial<LiveState> = {}) => ({ type: 'snapshot' as const, drawingId: 7, kpi: KPI, stations: [ST], projects: [], events: [], materials: [], ...over })

describe('liveReducer', () => {
  it('snapshot 은 통째로(step_* 빼고), tick 은 kpi·stations 만', () => {
    const s = liveReducer(null, snap({ events: [ev(2), ev(1, 'step_start')] }))!
    expect(s.drawingId).toBe(7)
    expect(s.events.map((e) => e.id)).toEqual([2])
    const t = liveReducer(s, { type: 'tick', kpi: { ...KPI, ok: 0, warn: 1 }, stations: [{ ...ST, actual: 11 }] })!
    expect(t.kpi.warn).toBe(1)
    expect(t.stations[0].actual).toBe(11)
    expect(t.events).toBe(s.events)
  })
  it('snapshot 전 tick·event·projects 는 무시', () => {
    expect(liveReducer(null, { type: 'tick', kpi: KPI, stations: [] })).toBeNull()
    expect(liveReducer(null, { type: 'event', event: ev(1) })).toBeNull()
    expect(liveReducer(null, { type: 'projects', projects: [] })).toBeNull()
  })
  it('event 는 앞에 붙이고 50개, 같은 id·step_* 은 무시, material_in 은 자재에도', () => {
    let s = liveReducer(null, snap())!
    for (let i = 1; i <= 55; i++) s = liveReducer(s, { type: 'event', event: ev(i) })!
    expect(s.events).toHaveLength(MAX_EVENTS)
    expect(s.events[0].id).toBe(55)
    expect(liveReducer(s, { type: 'event', event: ev(55) })).toBe(s)
    expect(liveReducer(s, { type: 'event', event: ev(99, 'step_done') })).toBe(s)
    const m = liveReducer(s, { type: 'event', event: ev(100, 'material_in') })!
    expect(m.events[0].id).toBe(100)
    expect(m.materials.map((e) => e.id)).toEqual([100])
  })
  it('projects 교체', () => {
    const s = liveReducer(liveReducer(null, snap())!, { type: 'projects', projects: [{ id: 1, name: 'P', done: 4, total: 13, period: null, state: 'run' }] })!
    expect(s.projects[0].done).toBe(4)
  })
})

describe('눈금 게이지', () => {
  it('막대 1개 = step 1개, 실적만큼 채움, 목표 막대, 진행 중 막대', () => {
    const c = gaugeCells(12, 60.4, 88)
    expect(c).toHaveLength(12)
    expect(c.filter((x) => x.on)).toHaveLength(7)
    expect(c.findIndex((x) => x.target)).toBe(10)
    expect(c.findIndex((x) => x.current)).toBe(7)
  })
  it('끝값', () => {
    expect(gaugeCells(4, 0, 0).findIndex((x) => x.target)).toBe(0)
    expect(gaugeCells(4, 0, 0).some((x) => x.on)).toBe(false)
    expect(gaugeCells(4, 100, 130).findIndex((x) => x.target)).toBe(3)
    expect(gaugeCells(4, 100, 130).every((x) => x.on)).toBe(true)
    expect(stepOf(0, 12)).toBe(1)
    expect(stepOf(99.9, 12)).toBe(12)
    expect(stepOf(100, 12)).toBe(12)
  })
})

const box = (o: ChipOut, c: ChipIn) => ({ l: o.cx - c.w / 2, r: o.cx + c.w / 2, t: o.bottom - c.h, b: o.bottom })
const overlaps = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b
const VIEW = { w: 1000, h: 800 }

describe('칩 겹침 회피 (demo dashFrame)', () => {
  it('혼자면 설비 바로 위 (꼬리 7px)', () => {
    expect(layoutChips([{ id: 1, x: 500, y: 400, w: 200, h: 100 }], VIEW)).toEqual([{ id: 1, cx: 500, bottom: 393, lift: 0, dx: 0 }])
  })
  it('같은 자리 세 개: 한 칸 위 → 옆, 서로 겹치지 않음', () => {
    const chips = [1, 2, 3].map((id) => ({ id, x: 500, y: 400, w: 200, h: 100 }))
    const out = layoutChips(chips, VIEW)
    expect(out).toEqual([
      { id: 1, cx: 500, bottom: 393, lift: 0, dx: 0 },
      { id: 2, cx: 500, bottom: 285, lift: 108, dx: 0 },
      { id: 3, cx: 710, bottom: 393, lift: 0, dx: 210 },
    ])
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(overlaps(box(out[i], chips[i]), box(out[j], chips[j]))).toBe(false)
  })
  it('아래(가까운) 칩부터 자리를 잡음', () => {
    const out = layoutChips([{ id: 2, x: 500, y: 300, w: 200, h: 100 }, { id: 1, x: 500, y: 400, w: 200, h: 100 }], VIEW)
    expect(out.find((o) => o.id === 1)).toMatchObject({ bottom: 393, lift: 0 })
    expect(out.find((o) => o.id === 2)).toMatchObject({ bottom: 185, lift: 108 })
  })
  it('화면 가장자리·위 KPI 줄 안쪽으로', () => {
    expect(layoutChips([{ id: 1, x: 10, y: 400, w: 200, h: 100 }], VIEW)[0]).toMatchObject({ cx: 106, dx: 96 })
    expect(layoutChips([{ id: 1, x: 500, y: 50, w: 200, h: 100 }], VIEW)[0]).toMatchObject({ bottom: 162, lift: 0 })
  })
})

describe('보간', () => {
  it('ease-out cubic', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875)
    expect(easeOutCubic(1)).toBe(1)
    expect(easeOutCubic(2)).toBe(1)
  })
  it('지금 보이는 값에서 새 값으로, snapDown 이면 내려갈 때 바로', () => {
    const a = retarget({ from: 10, to: 10, t0: 0, ms: 600 }, 20, 0, 600)
    expect(valueAt(a, 0)).toBe(10)
    expect(valueAt(a, 300)).toBeCloseTo(18.75)
    expect(valueAt(a, 600)).toBe(20)
    const b = retarget(a, 30, 300, 600) // 중간에 새 값: 보이는 값(18.75)부터
    expect(valueAt(b, 300)).toBeCloseTo(18.75)
    expect(valueAt(retarget(b, 2, 400, 600, true), 400)).toBe(2) // 한 대 완료(100 → 2): 거꾸로 차오르지 않게 바로
    expect(valueAt(retarget(b, 2, 400, 600, false), 400)).toBeGreaterThan(2)
  })
})

describe('useTweened', () => {
  afterEach(() => vi.useRealTimers())
  it('0.6초 동안 새 값으로, 내려갈 때는 바로', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    const { result, rerender } = renderHook(({ v }) => useTweened(v, 600, { snapDown: true }), { initialProps: { v: 10 } })
    expect(result.current).toBe(10)
    rerender({ v: 20 })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current).toBeGreaterThan(10)
    expect(result.current).toBeLessThan(20)
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(result.current).toBe(20)
    rerender({ v: 3 })
    expect(result.current).toBe(3)
  })
})

describe('상태·이벤트 표', () => {
  it('이벤트 아이콘: step_* 은 없음, 상태 변경은 바뀐 상태 색', () => {
    expect(eventIcon(ev(1, 'step_start'))).toBeNull()
    expect(eventIcon(ev(1, 'unit_done'))?.color).toBe('#22c55e')
    expect(eventIcon(ev(1, 'status_change', { to: 'bad' }))?.color).toBe('#ef4444')
    expect(eventIcon(ev(1, 'status_change', { to: 'warn' }))?.color).toBe('#f59e0b')
    expect(eventIcon(ev(1, 'material_in'))).not.toBeNull()
    expect(eventIcon(ev(1, 'move'))).not.toBeNull()
  })
  it('시각 HH:MM:SS', () => {
    expect(fmtTime('2026-11-13T01:02:03Z')).toMatch(/^\d{2}:02:03$/)
    expect(fmtTime('x')).toBe('')
  })
})
```

Run: `cd /c/kopens/project/Factory3D/web && npx vitest run src/dashboard/live`
Expected: FAIL (모듈 없음).

- [ ] **Step 2: 구현**

`web/src/dashboard/types.ts`:
```ts
/** 상황판 실시간 데이터 — 서버 live/LiveMessages 와 같은 모양 */
export type Status = 'ok' | 'warn' | 'bad'
export type EventKind = 'step_start' | 'step_done' | 'unit_done' | 'status_change' | 'material_in' | 'move'
/** 연결 상태: 처음 연결 전 · 받는 중 · 끊겨서 다시 붙는 중 · 끝(도면 없음 4404) */
export type Conn = 'connecting' | 'live' | 'retrying' | 'closed'

export interface Kpi { running: number; ok: number; warn: number; bad: number; doneToday: number; planRate: number; at: string }
export interface StationLive {
  id: number; no: number; name: string; placementName: string | null; steps: string[]; step: number
  actual: number; target: number; status: Status; projectId: number | null; unitNo: number | null
}
export interface ProjectLive { id: number; name: string; done: number; total: number; period: string | null; state: 'run' | 'wait' | 'done' }
export interface LiveEvent { id: number; at: string; kind: EventKind; station: string; text: string; data: Record<string, unknown> }
export interface LiveState { drawingId: number; kpi: Kpi; stations: StationLive[]; projects: ProjectLive[]; events: LiveEvent[]; materials: LiveEvent[] }

export type LiveMessage =
  | ({ type: 'snapshot' } & LiveState)
  | { type: 'tick'; kpi: Kpi; stations: StationLive[] }
  | { type: 'event'; event: LiveEvent }
  | { type: 'projects'; projects: ProjectLive[] }
```

`web/src/dashboard/liveReducer.ts`:
```ts
import type { LiveEvent, LiveMessage, LiveState } from './types'

export const MAX_EVENTS = 50
export const MAX_MATERIALS = 20

/** step_start·step_done 은 너무 잦아 화면 목록에 넣지 않음 (P5 운반 애니메이션용) */
export const isStepEvent = (e: Pick<LiveEvent, 'kind'>) => e.kind === 'step_start' || e.kind === 'step_done'

/** WebSocket 메시지 → 화면 상태. snapshot 전에 온 메시지는 버림 */
export function liveReducer(state: LiveState | null, msg: LiveMessage): LiveState | null {
  switch (msg.type) {
    case 'snapshot':
      return {
        drawingId: msg.drawingId,
        kpi: msg.kpi,
        stations: msg.stations,
        projects: msg.projects,
        events: msg.events.filter((e) => !isStepEvent(e)).slice(0, MAX_EVENTS),
        materials: msg.materials.slice(0, MAX_MATERIALS),
      }
    case 'tick':
      return state && { ...state, kpi: msg.kpi, stations: msg.stations }
    case 'projects':
      return state && { ...state, projects: msg.projects }
    case 'event': {
      const e = msg.event
      if (!state || isStepEvent(e) || state.events.some((x) => x.id === e.id)) return state
      return {
        ...state,
        events: [e, ...state.events].slice(0, MAX_EVENTS),
        materials: e.kind === 'material_in' ? [e, ...state.materials].slice(0, MAX_MATERIALS) : state.materials,
      }
    }
    default:
      return state
  }
}
```

`web/src/dashboard/gauge.ts`:
```ts
/** 눈금 게이지 막대 하나: 실적만큼 채움(on) · 목표 step 막대(target, 길게) · 실적이 걸친 막대(current, 맥동) */
export interface Cell { on: boolean; target: boolean; current: boolean }

/** 실적 % → 진행 중 step 번호 1..n (demo stStep) */
export function stepOf(actual: number, n: number): number {
  return Math.max(1, Math.min(n, Math.floor((actual / 100) * n) + 1))
}

/** demo gauge(): 막대 1개 = step 1개 */
export function gaugeCells(n: number, actual: number, target: number): Cell[] {
  const fill = Math.round((actual / 100) * n)
  const tg = Math.max(0, Math.min(n - 1, Math.ceil((target / 100) * n) - 1))
  const cur = stepOf(actual, n) - 1
  return Array.from({ length: n }, (_, i) => ({ on: i < fill, target: i === tg, current: i === cur }))
}
```

`web/src/dashboard/chipLayout.ts`:
```ts
/** 칩 하나: 설비 기준점의 화면 좌표(x, y px)와 칩 크기(w, h) */
export interface ChipIn { id: number; x: number; y: number; w: number; h: number }
/** 칩 자리: 아래 가운데(cx, bottom). lift = 설비까지 잇는 선 길이, dx = 꼬리를 설비 쪽에 두기 위한 가로 차이 */
export interface ChipOut { id: number; cx: number; bottom: number; lift: number; dx: number }

const TAIL = 7 // 칩 꼬리 높이
const GAP = 4
const EDGE = 6
const UPS = [0, 1, 2]
const SIDES = [0, 0.55, -0.55, 1.05, -1.05]

/**
 * demo dashFrame: 아래쪽(가까운) 칩부터 자리를 잡고, 겹치면 후보 자리(위로 0~2칸 × 좌우 5) 중
 * 겹치지 않고 가장 덜 움직이는 곳. 화면 안·위 KPI 줄(top) 아래로만.
 */
export function layoutChips(chips: ChipIn[], view: { w: number; h: number }, top = 62): ChipOut[] {
  const placed: { x: number; w: number; top: number; bottom: number }[] = []
  const clampX = (x: number, w: number) => Math.min(view.w - w / 2 - EDGE, Math.max(w / 2 + EDGE, x))
  const free = (cx: number, bottom: number, c: ChipIn) =>
    !placed.some((p) => Math.abs(p.x - cx) < (p.w + c.w) / 2 + GAP && bottom > p.top - GAP && bottom - c.h < p.bottom + GAP)
  const out: ChipOut[] = []
  for (const c of [...chips].sort((a, b) => b.y - a.y)) {
    let best: { cx: number; bottom: number; cost: number } | null = null
    for (const up of UPS)
      for (const side of SIDES) {
        const cx = clampX(c.x + side * c.w, c.w)
        const bottom = Math.max(c.y - TAIL - up * (c.h + 8), top + c.h)
        const cost = Math.abs(cx - c.x) + Math.abs(c.y - TAIL - bottom) * 1.2
        if ((!best || cost < best.cost) && free(cx, bottom, c)) best = { cx, bottom, cost }
      }
    const at = best ?? { cx: clampX(c.x, c.w), bottom: Math.max(c.y - TAIL, top + c.h) }
    placed.push({ x: at.cx, w: c.w, top: at.bottom - c.h, bottom: at.bottom })
    out.push({ id: c.id, cx: at.cx, bottom: at.bottom, lift: Math.max(0, c.y - TAIL - at.bottom), dx: at.cx - c.x })
  }
  return out
}
```

`web/src/dashboard/tween.ts`:
```ts
import { useEffect, useRef, useState } from 'react'

export const easeOutCubic = (k: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3)

/** from → to 를 t0 부터 ms 동안 (ease-out cubic) */
export interface Tween { from: number; to: number; t0: number; ms: number }

export function valueAt(t: Tween, now: number): number {
  if (t.ms <= 0) return t.to
  return t.from + (t.to - t.from) * easeOutCubic((now - t.t0) / t.ms)
}

/** 새 값을 받음: 지금 보이는 값에서 새 값으로. snapDown 이면 내려갈 때는 보간 없이 바로 (한 대 완료 100% → 작은 값) */
export function retarget(cur: Tween, value: number, now: number, ms: number, snapDown = false): Tween {
  const shown = valueAt(cur, now)
  if (snapDown && value < shown) return { from: value, to: value, t0: now, ms }
  return { from: shown, to: value, t0: now, ms }
}

/** 값이 바뀌면 ms 동안 보간한 값을 돌려줌 (처음 값은 보간 없이) */
export function useTweened(value: number, ms = 600, opts: { snapDown?: boolean } = {}): number {
  const snapDown = opts.snapDown ?? false
  const [shown, setShown] = useState(value)
  const tw = useRef<Tween>({ from: value, to: value, t0: 0, ms })
  useEffect(() => {
    if (value === tw.current.to) return
    tw.current = retarget(tw.current, value, performance.now(), ms, snapDown)
    let raf = 0
    const step = () => {
      const t = performance.now()
      setShown(valueAt(tw.current, t))
      if (t - tw.current.t0 < tw.current.ms) raf = requestAnimationFrame(step)
    }
    step()
    return () => cancelAnimationFrame(raf)
  }, [value, ms, snapDown])
  return shown
}

/** KPI 숫자 카운트업 (정수) */
export function useCountUp(value: number, ms = 600): number {
  return Math.round(useTweened(value, ms))
}
```

`web/src/dashboard/status.ts`:
```ts
import { Bell, CircleCheck, Info, PackageOpen, TriangleAlert, Truck, type LucideIcon } from 'lucide-react'
import type { LiveEvent, ProjectLive, Status } from './types'

export const STATUS_LABEL: Record<Status, string> = { ok: '진행중', warn: '주의', bad: '지연' }
export const STATUS_COLOR: Record<Status, string> = { ok: '#22c55e', warn: '#f59e0b', bad: '#ef4444' }
export const PROJECT_STATE_LABEL: Record<ProjectLive['state'], string> = { run: '진행', wait: '대기', done: '완료' }
const MUTED = '#8d939e'
const BLUE = '#3b82f6'

/** 이벤트 줄·서랍 아이콘. step_start·step_done 은 넣지 않음(null) */
export function eventIcon(e: LiveEvent): { icon: LucideIcon; color: string } | null {
  switch (e.kind) {
    case 'unit_done':
      return { icon: CircleCheck, color: STATUS_COLOR.ok }
    case 'status_change':
      if (e.data.to === 'bad') return { icon: TriangleAlert, color: STATUS_COLOR.bad }
      if (e.data.to === 'warn') return { icon: Bell, color: STATUS_COLOR.warn }
      return { icon: Info, color: MUTED }
    case 'material_in':
      return { icon: PackageOpen, color: BLUE }
    case 'move':
      return { icon: Truck, color: MUTED }
    default:
      return null
  }
}

/** ISO 시각 → HH:MM:SS (브라우저 시간대) */
export function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':')
}
```

- [ ] **Step 3: 통과 확인**

Run: `cd /c/kopens/project/Factory3D/web && npx vitest run && npm run build && ./node_modules/.bin/oxlint`
Expected: PASS (경고 없음). `TriangleAlert`·`CircleCheck`·`PackageOpen`·`Truck`·`Bell`·`Info` 는 설치된 lucide-react 1.x 에 있음(`TriangleAlert` 는 `TriangleExclamationPoint` 의 별칭으로 export).

- [ ] **Step 4: Commit**

```bash
cd /c/kopens/project/Factory3D && git add web/src/dashboard
git commit -m "feat(web): 상황판 순수 모듈 — 메시지 reducer·눈금 게이지·칩 겹침 회피·보간·상태 표

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 웹 — useLive (WebSocket · 지수 백오프 · 4404)

**Files:**
- Create: `web/src/dashboard/useLive.ts`
- Test: `web/src/dashboard/useLive.test.ts`

**Interfaces:**
- Consumes: Task 5 `liveReducer`, `Conn`, `LiveMessage`, `LiveState`.
- Produces:
```ts
export const BACKOFF: number[]            // [1000, 2000, 4000, 8000, 16000, 30000] ms
export const CLOSE_NOT_FOUND = 4404
export function liveUrl(drawingId: number, loc?: Pick<Location, 'protocol' | 'host'>): string   // ws(s)://<host>/ws/live?drawing=<id>
export interface Live { conn: Conn; data: LiveState | null }
export function useLive(drawingId: number | null): Live
```
  규칙: 메시지를 받으면 `conn='live'`, snapshot 을 받으면 백오프 횟수 0. 끊기면(4404 아님) `retrying` 으로 두고 마지막 데이터는 유지, `BACKOFF[min(n, 5)]` 뒤 다시 연결. 4404 면 `closed`, 다시 연결 안 함. 도면이 바뀌면 닫고 새로(상태도 `connecting`·`null`).

- [ ] **Step 1: 실패 테스트**

`web/src/dashboard/useLive.test.ts`:
```ts
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLive } from './useLive'

/** 가짜 WebSocket: 만든 것을 모아 두고 테스트가 메시지·끊김을 일으킴 */
class FakeWS {
  static all: FakeWS[] = []
  url: string
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: ((e: { code: number }) => void) | null = null
  closed = false
  constructor(url: string) {
    this.url = url
    FakeWS.all.push(this)
  }
  close() {
    this.closed = true
  }
  send(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) })
  }
  drop(code = 1006) {
    this.onclose?.({ code })
  }
}
const last = () => FakeWS.all[FakeWS.all.length - 1]
const KPI = { running: 0, ok: 0, warn: 0, bad: 0, doneToday: 0, planRate: 0, at: '2026-11-13T01:00:00Z' }
const snap = (drawingId: number) => ({ type: 'snapshot', drawingId, kpi: KPI, stations: [], projects: [], events: [], materials: [] })

describe('useLive', () => {
  beforeEach(() => {
    FakeWS.all = []
    vi.stubGlobal('WebSocket', FakeWS)
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('주소, snapshot 을 받으면 live', () => {
    const { result } = renderHook(() => useLive(7))
    expect(result.current.conn).toBe('connecting')
    expect(last().url).toBe(`ws://${location.host}/ws/live?drawing=7`)
    act(() => last().send(snap(7)))
    expect(result.current.conn).toBe('live')
    expect(result.current.data?.drawingId).toBe(7)
  })

  it('끊기면 retrying, 마지막 데이터는 유지', () => {
    const { result } = renderHook(() => useLive(7))
    act(() => last().send(snap(7)))
    act(() => last().drop())
    expect(result.current.conn).toBe('retrying')
    expect(result.current.data?.drawingId).toBe(7)
  })

  it('1·2·4·8·16·30·30초 뒤 다시 접속, snapshot 을 받으면 1초부터', () => {
    renderHook(() => useLive(7))
    for (const wait of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
      const n = FakeWS.all.length
      act(() => last().drop())
      act(() => vi.advanceTimersByTime(wait - 1))
      expect(FakeWS.all).toHaveLength(n)
      act(() => vi.advanceTimersByTime(1))
      expect(FakeWS.all).toHaveLength(n + 1)
    }
    act(() => last().send(snap(7)))
    const n = FakeWS.all.length
    act(() => last().drop())
    act(() => vi.advanceTimersByTime(1000))
    expect(FakeWS.all).toHaveLength(n + 1)
  })

  it('4404 면 다시 접속하지 않음', () => {
    const { result } = renderHook(() => useLive(7))
    act(() => last().drop(4404))
    expect(result.current.conn).toBe('closed')
    act(() => vi.advanceTimersByTime(60000))
    expect(FakeWS.all).toHaveLength(1)
  })

  it('도면이 바뀌면 닫고 새로, 이전 데이터는 버림', () => {
    const { result, rerender } = renderHook(({ id }) => useLive(id), { initialProps: { id: 7 } })
    const first = last()
    act(() => first.send(snap(7)))
    rerender({ id: 8 })
    expect(first.closed).toBe(true)
    expect(last().url).toContain('drawing=8')
    expect(result.current).toEqual({ conn: 'connecting', data: null })
    act(() => first.send(snap(7))) // 닫힌 연결의 늦은 메시지는 무시
    expect(result.current.data).toBeNull()
  })

  it('도면이 없으면 연결하지 않음', () => {
    renderHook(() => useLive(null))
    expect(FakeWS.all).toHaveLength(0)
  })
})
```

Run: `cd /c/kopens/project/Factory3D/web && npx vitest run src/dashboard/useLive`
Expected: FAIL (모듈 없음).

- [ ] **Step 2: 구현**

`web/src/dashboard/useLive.ts`:
```ts
import { useEffect, useState } from 'react'
import { liveReducer } from './liveReducer'
import type { Conn, LiveMessage, LiveState } from './types'

/** 끊긴 뒤 다시 붙기까지 기다리는 시간 (ms) — 1·2·4·8·16·30초, 그 뒤는 30초 */
export const BACKOFF = [1000, 2000, 4000, 8000, 16000, 30000]
/** 서버가 '도면 없음' 으로 닫을 때의 코드 — 다시 붙지 않음 */
export const CLOSE_NOT_FOUND = 4404

export function liveUrl(drawingId: number, loc: Pick<Location, 'protocol' | 'host'> = window.location): string {
  return `${loc.protocol === 'https:' ? 'wss:' : 'ws:'}//${loc.host}/ws/live?drawing=${drawingId}`
}

export interface Live { conn: Conn; data: LiveState | null }
interface Held extends Live { id: number | null }

/** 한 도면의 상황판 실시간 데이터 (개발 서버는 vite 의 /ws 프록시) */
export function useLive(drawingId: number | null): Live {
  const [held, setHeld] = useState<Held>({ id: drawingId, conn: 'connecting', data: null })
  if (held.id !== drawingId) setHeld({ id: drawingId, conn: 'connecting', data: null }) // 도면이 바뀌면 처음부터 (렌더 중 조정)
  useEffect(() => {
    if (drawingId === null) return
    let ws: WebSocket | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let tries = 0
    let stopped = false
    const update = (f: (h: Held) => Held) => setHeld((h) => (h.id === drawingId ? f(h) : h))
    const connect = () => {
      const sock = new WebSocket(liveUrl(drawingId))
      ws = sock
      sock.onmessage = (e: MessageEvent) => {
        if (stopped || ws !== sock) return
        let msg: LiveMessage
        try {
          msg = JSON.parse(String(e.data)) as LiveMessage
        } catch {
          return
        }
        if (msg.type === 'snapshot') tries = 0
        update((h) => ({ ...h, conn: 'live', data: liveReducer(h.data, msg) }))
      }
      sock.onclose = (e: CloseEvent) => {
        if (stopped || ws !== sock) return
        ws = null
        if (e.code === CLOSE_NOT_FOUND) {
          update((h) => ({ ...h, conn: 'closed' }))
          return
        }
        update((h) => ({ ...h, conn: 'retrying' }))
        timer = setTimeout(connect, BACKOFF[Math.min(tries, BACKOFF.length - 1)])
        tries++
      }
    }
    connect()
    return () => {
      stopped = true
      clearTimeout(timer)
      ws?.close()
    }
  }, [drawingId])
  return held.id === drawingId ? { conn: held.conn, data: held.data } : { conn: 'connecting', data: null }
}
```

- [ ] **Step 3: 통과 확인**

Run: `cd /c/kopens/project/Factory3D/web && npx vitest run && npm run build && ./node_modules/.bin/oxlint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /c/kopens/project/Factory3D && git add web/src/dashboard
git commit -m "feat(web): useLive — 상황판 WebSocket·지수 백오프 재접속·4404 중단

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 3D — 바닥 링 · 화면 좌표 · 전체 보기 · 보기 전용

**Files:**
- Create: `web/src/scene/ringLayer.ts`, `web/src/scene/dashView.ts`
- Modify: `web/src/scene/FactoryScene.ts` (`DashHost`), `web/src/scene/navigation.ts` (`flyTo`), `web/src/scene/objectLayer.ts` (`top`), `web/src/scene/FactoryView.tsx` (`onScene` 타입)
- Test: `web/src/scene/ringLayer.test.ts`, `web/src/scene/dashView.test.ts`, `web/src/scene/objectLayer.test.ts` (추가)

**Interfaces:**
- Consumes: `planToLocal` (coords), `ObjectLayer`, `Navigator`, `PlanMeshes` (벽 메쉬 `userData.kind === 'wall'`).
- Produces:
```ts
// ringLayer.ts
export interface RingSpec { id: number; x: number; y: number; r: number; color: string; strong: boolean }   // plan 좌표 m, 색 '#rrggbb'
export class RingLayer {
  constructor(parent: THREE.Group, now?: () => number)   // now 기본 performance.now
  setBounds(b: { w: number; h: number }): void
  setRings(list: RingSpec[]): void   // id 기준 차이만. 반지름 r·두께 10%(안쪽 0.9r), y 0.04, 투명도 0.6 (strong 0.95), 색 바뀌면 0.6초 전환
  update(): void                     // 매 프레임 색 보간
  dispose(): void
}
// dashView.ts
export interface ScreenPoint { sx: number; sy: number; visible: boolean }
export function toScreen(ndc: THREE.Vector3, w: number, h: number): ScreenPoint     // 카메라 뒤(z>1)·화면 밖 20% 넘으면 안 보임
export function overviewPose(box: THREE.Box3, fovDeg: number, aspect: number): { target: THREE.Vector3; position: THREE.Vector3 }   // demo frameDash
// FactoryScene.ts
export type ScreenProject = (x: number, y: number, h: number) => ScreenPoint   // plan 좌표 + 높이(m) → 화면 px
export interface DashHost {
  setRings(rings: RingSpec[]): void
  onFrame(cb: ((project: ScreenProject) => void) | null): void   // 매 렌더 뒤
  frameOverview(): void                                          // 벽 bbox 가 꽉 차게, 북쪽 위, 약 70°, 0.6초
  objectTop(id: number): number | null                           // 배치 메쉬 bbox 최고 높이 (칩 기준점)
  setInteractive(on: boolean): void                              // false = 선택·끌기·배치 없음
}
export type SceneHost = PickSource & ObjectHost & DashHost
// navigation.ts
Navigator.flyTo(target: THREE.Vector3, position: THREE.Vector3, dur?: number): void   // 0.6초 ease-out cubic
// objectLayer.ts
ObjectLayer.top(id: number): number | null
// FactoryView.tsx
onScene?: (s: SceneHost | null) => void
```

- [ ] **Step 1: 실패 테스트**

`web/src/scene/ringLayer.test.ts`:
```ts
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { RingLayer } from './ringLayer'

type RingMesh = THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>

describe('RingLayer', () => {
  it('설비 중심·반지름·두께 10%·선택 투명도, 차이만 반영', () => {
    const g = new THREE.Group()
    const layer = new RingLayer(g, () => 0)
    layer.setBounds({ w: 10, h: 10 })
    layer.setRings([
      { id: 1, x: 1, y: 9, r: 5, color: '#22c55e', strong: false },
      { id: 2, x: 5, y: 5, r: 2, color: '#ef4444', strong: true },
    ])
    expect(g.children).toHaveLength(2)
    const a = g.children[0] as RingMesh
    expect(a.position.x).toBeCloseTo(-4)
    expect(a.position.z).toBeCloseTo(-4)
    expect(a.position.y).toBeCloseTo(0.04)
    expect(a.geometry.parameters.innerRadius).toBeCloseTo(4.5)
    expect(a.geometry.parameters.outerRadius).toBeCloseTo(5)
    expect(a.material.opacity).toBeCloseTo(0.6)
    expect((g.children[1] as RingMesh).material.opacity).toBeCloseTo(0.95)
    const b = g.children[1]
    layer.setRings([{ id: 2, x: 5, y: 5, r: 2, color: '#ef4444', strong: false }])
    expect(g.children).toEqual([b])
    expect((b as RingMesh).material.opacity).toBeCloseTo(0.6)
    layer.dispose()
    expect(g.children).toHaveLength(0)
  })

  it('색은 0.6초 동안 바뀜', () => {
    let t = 0
    const g = new THREE.Group()
    const layer = new RingLayer(g, () => t)
    layer.setBounds({ w: 10, h: 10 })
    layer.setRings([{ id: 1, x: 5, y: 5, r: 2, color: '#22c55e', strong: false }])
    const m = (g.children[0] as RingMesh).material
    const green = new THREE.Color('#22c55e'), red = new THREE.Color('#ef4444')
    t = 1000
    layer.setRings([{ id: 1, x: 5, y: 5, r: 2, color: '#ef4444', strong: false }])
    layer.update()
    expect(m.color.equals(green)).toBe(true)
    t = 1300
    layer.update()
    expect(m.color.r).toBeGreaterThan(green.r)
    expect(m.color.r).toBeLessThan(red.r)
    t = 1600
    layer.update()
    expect(m.color.getHexString()).toBe('ef4444')
  })
})
```

`web/src/scene/dashView.test.ts`:
```ts
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { overviewPose, toScreen } from './dashView'

describe('상황판 시점', () => {
  it('정규화 좌표 → 화면 px, 카메라 뒤·화면 밖은 안 보임', () => {
    expect(toScreen(new THREE.Vector3(0, 0, 0.5), 800, 600)).toEqual({ sx: 400, sy: 300, visible: true })
    expect(toScreen(new THREE.Vector3(1, 1, 0.5), 800, 600)).toEqual({ sx: 800, sy: 0, visible: true })
    expect(toScreen(new THREE.Vector3(0, 0, 1.5), 800, 600).visible).toBe(false)
    expect(toScreen(new THREE.Vector3(1.3, 0, 0.5), 800, 600).visible).toBe(false)
  })
  it('전체 보기: 벽 범위가 꽉 차게, 남쪽에서 약 70° 내려다봄(북쪽 위)', () => {
    const box = new THREE.Box3(new THREE.Vector3(-80, 0, -33), new THREE.Vector3(80, 8, 33))
    const { target, position } = overviewPose(box, 45, 16 / 9)
    expect(target.x).toBeCloseTo(0)
    expect(target.y).toBe(0)
    expect(target.z).toBeCloseTo(-66 * 0.06)
    const off = position.clone().sub(target)
    expect(off.x).toBeCloseTo(0)
    expect(off.z).toBeGreaterThan(0)
    expect(Math.atan2(off.y, off.z)).toBeCloseTo(1.22)
    const f = Math.tan((22.5 * Math.PI) / 180)
    expect(off.length()).toBeCloseTo(Math.max(((66 * 0.8) / 2 / f) * 1.4, (160 / 2 / f / (16 / 9)) * 1.06))
  })
})
```

`web/src/scene/objectLayer.test.ts` 의 `describe('ObjectLayer (형상만)', …)` 안 끝에 추가:
```ts
  it('칩 기준점: 메쉬 최고 높이', () => {
    const root = new THREE.Group()
    const layer = new ObjectLayer(root, box)
    layer.setBounds({ w: 10, h: 10 })
    layer.setObjects([obj(1)]) // 모델 없는 임시 상자, 높이 sizeZ = 3
    expect(layer.top(1)).toBeCloseTo(3)
    expect(layer.top(99)).toBeNull()
  })
```

Run: `cd /c/kopens/project/Factory3D/web && npx vitest run src/scene`
Expected: FAIL (ringLayer·dashView 없음, `top` 없음).

- [ ] **Step 2: 구현 — 순수 부분**

`web/src/scene/ringLayer.ts`:
```ts
import * as THREE from 'three'
import { planToLocal } from './coords'

/** 상황판 바닥 링 하나 (plan 좌표 m, 반지름 r m, 색 '#rrggbb', strong = 선택) */
export interface RingSpec { id: number; x: number; y: number; r: number; color: string; strong: boolean }

const RING_Y = 0.04
const FADE_MS = 600
const OPACITY = 0.6
const OPACITY_STRONG = 0.95

type RingMesh = THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>
interface Ring { spec: RingSpec; mesh: RingMesh; from: THREE.Color; to: THREE.Color; t0: number }

const noRaycast = () => {}
const ringGeo = (r: number) => new THREE.RingGeometry(r * 0.9, r, 64) // 두께 10%

/** 상황판 바닥 상태 링 (demo buildDashLabels 의 ring). 색이 바뀌면 0.6초 동안 바뀜 */
export class RingLayer {
  private parent: THREE.Group
  private now: () => number
  private bounds = { w: 0, h: 0 }
  private rings = new Map<number, Ring>()

  constructor(parent: THREE.Group, now: () => number = () => performance.now()) {
    this.parent = parent
    this.now = now
  }

  setBounds(b: { w: number; h: number }): void {
    this.bounds = { w: b.w, h: b.h }
    for (const r of this.rings.values()) this.place(r)
  }

  setRings(list: RingSpec[]): void {
    const keep = new Set(list.map((s) => s.id))
    for (const [id, r] of this.rings) if (!keep.has(id)) this.remove(id, r)
    for (const s of list) {
      let r = this.rings.get(s.id)
      if (!r) {
        const mat = new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: OPACITY, depthWrite: false, toneMapped: false })
        const mesh = new THREE.Mesh(ringGeo(s.r), mat) as RingMesh
        mesh.rotation.x = -Math.PI / 2
        mesh.renderOrder = 7
        mesh.raycast = noRaycast
        r = { spec: s, mesh, from: new THREE.Color(s.color), to: new THREE.Color(s.color), t0: -Infinity }
        this.rings.set(s.id, r)
        this.parent.add(mesh)
      } else {
        if (r.spec.r !== s.r) {
          r.mesh.geometry.dispose()
          r.mesh.geometry = ringGeo(s.r)
        }
        if (r.spec.color !== s.color) {
          r.from.copy(r.mesh.material.color)
          r.to.set(s.color)
          r.t0 = this.now()
        }
        r.spec = s
      }
      r.mesh.material.opacity = s.strong ? OPACITY_STRONG : OPACITY
      this.place(r)
    }
  }

  /** 매 프레임: 색 보간 */
  update(): void {
    const t = this.now()
    for (const r of this.rings.values()) {
      const k = Math.min(1, (t - r.t0) / FADE_MS)
      r.mesh.material.color.copy(r.from).lerp(r.to, k)
    }
  }

  dispose(): void {
    for (const [id, r] of this.rings) this.remove(id, r)
  }

  private place(r: Ring) {
    const [x, z] = planToLocal(r.spec.x, r.spec.y, this.bounds)
    r.mesh.position.set(x, RING_Y, z)
  }

  private remove(id: number, r: Ring) {
    this.parent.remove(r.mesh)
    r.mesh.geometry.dispose()
    r.mesh.material.dispose()
    this.rings.delete(id)
  }
}
```

`web/src/scene/dashView.ts`:
```ts
import * as THREE from 'three'

export interface ScreenPoint { sx: number; sy: number; visible: boolean }

/** project() 한 정규화 좌표 → 화면 px. 카메라 뒤이거나 화면 밖으로 20% 넘으면 안 보임 (demo dashFrame) */
export function toScreen(ndc: THREE.Vector3, w: number, h: number): ScreenPoint {
  const visible = !(ndc.z > 1 || Math.abs(ndc.x) > 1.2 || Math.abs(ndc.y) > 1.2)
  return { sx: ((ndc.x + 1) / 2) * w, sy: ((1 - ndc.y) / 2) * h, visible }
}

/** demo frameDash: 벽 범위(월드 box)가 화면에 꽉 차게, 북쪽(-z)이 위로 약 70° 내려다보는 시점 */
export function overviewPose(box: THREE.Box3, fovDeg: number, aspect: number): { target: THREE.Vector3; position: THREE.Vector3 } {
  const c = box.getCenter(new THREE.Vector3()).setY(0)
  const sz = box.getSize(new THREE.Vector3())
  const f = Math.tan((fovDeg * Math.PI) / 360), el = 1.22
  c.z -= sz.z * 0.06 // 공장을 조금 아래로: 북쪽 스테이션 칩이 위 KPI 줄에 걸리지 않게
  const dist = Math.max(((sz.z * 0.8) / 2 / f) * 1.4, (sz.x / 2 / f / aspect) * 1.06) // 기울여 보므로 세로는 약 0.8배
  return { target: c, position: c.clone().add(new THREE.Vector3(0, Math.sin(el) * dist, Math.cos(el) * dist)) }
}
```

`web/src/scene/objectLayer.ts` — `worldPos` 메서드 바로 아래에 추가:
```ts
  /** 배치 메쉬 bbox 최고 높이(월드 y) — 상황판 칩 기준점. 이름표 스프라이트는 빼고 메쉬만 */
  top(id: number): number | null {
    const e = this.items.get(id)
    if (!e) return null
    e.group.updateWorldMatrix(true, true)
    const b = new THREE.Box3()
    e.body.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) b.expandByObject(o)
    })
    return b.isEmpty() ? null : b.max.y
  }
```

`web/src/scene/navigation.ts` — `focusOn` 메서드 바로 아래에 추가:
```ts
  /** 정한 시점으로 0.6초 이동 (상황판 전체 보기) */
  flyTo(target: THREE.Vector3, position: THREE.Vector3, dur = 600): void {
    this.camAnim = {
      t0: performance.now(), dur,
      fT: this.controls.target.clone(), tT: target.clone(),
      fP: this.camera.position.clone(), tP: position.clone(),
    }
  }
```

- [ ] **Step 3: 구현 — FactoryScene·FactoryView**

`web/src/scene/FactoryScene.ts`:
1. import 추가 (`./coords` 다음, `./planToMeshes` 다음):
```ts
import { overviewPose, toScreen, type ScreenPoint } from './dashView'
```
```ts
import { RingLayer, type RingSpec } from './ringLayer'
```
2. `ObjectHost` 인터페이스 바로 아래에 추가:
```ts
/** plan 좌표(m) + 높이(m) → 화면 px (상황판 칩) */
export type ScreenProject = (x: number, y: number, h: number) => ScreenPoint
/** 상황판: 바닥 링 · 매 프레임 화면 좌표 · 전체 보기 · 칩 높이 · 보기 전용 */
export interface DashHost {
  setRings(rings: RingSpec[]): void
  onFrame(cb: ((project: ScreenProject) => void) | null): void
  frameOverview(): void
  objectTop(id: number): number | null
  setInteractive(on: boolean): void
}
export type SceneHost = PickSource & ObjectHost & DashHost
```
3. 클래스 선언 `export class FactoryScene implements PickSource, ObjectHost {` → `export class FactoryScene implements PickSource, ObjectHost, DashHost {`.
4. 필드: `private objectLayer: ObjectLayer` 바로 아래에:
```ts
  private ringGroup = new THREE.Group() // 상황판 바닥 링 (root 아래)
  private rings: RingLayer
  private frameCb: ((project: ScreenProject) => void) | null = null
  private interactive = true // false = 상황판 (선택·끌기·배치 없음)
  private projV = new THREE.Vector3()
```
5. 생성자: `this.root.add(this.overlay, this.objects)` → `this.root.add(this.overlay, this.objects, this.ringGroup)`, 그리고 `this.objectLayer = new ObjectLayer(this.objects, loadModel)` 바로 아래에 `this.rings = new RingLayer(this.ringGroup)`.
6. `setPlan`: `if (!plan) {` 블록의 `this.objectLayer.setObjects([])` 아래에 `this.rings.setRings([])`, 그리고 `this.objectLayer.setBounds(plan.bounds)` 아래에 `this.rings.setBounds(plan.bounds)`.
7. `focusObject` 메서드 바로 아래에 추가:
```ts
  setRings(rings: RingSpec[]): void {
    this.rings.setRings(rings)
  }

  onFrame(cb: ((project: ScreenProject) => void) | null): void {
    this.frameCb = cb
  }

  /** demo frameDash: 벽(없으면 도면 전체) 범위가 꽉 차게, 북쪽 위로 약 70° 내려다봄 (0.6초) */
  frameOverview(): void {
    const m = this.meshes
    if (!m) return
    this.root.updateMatrixWorld(true)
    const walls: THREE.Object3D[] = []
    m.group.traverse((o) => {
      if (o.userData.kind === 'wall') walls.push(o)
    })
    const box = new THREE.Box3()
    for (const o of walls.length ? walls : [m.group]) box.expandByObject(o)
    if (box.isEmpty()) return
    const { target, position } = overviewPose(box, this.camera.fov, this.camera.aspect)
    this.nav.flyTo(target, position)
  }

  objectTop(id: number): number | null {
    return this.objectLayer.top(id)
  }

  setInteractive(on: boolean): void {
    this.interactive = on
    if (on) return
    this.endDrag()
    this.objectLayer.setGhost(null)
  }
```
8. `dispose`: `this.objEvents = null` 아래에 `this.frameCb = null`, 그리고 `this.setPlan(null)` 아래에 `this.rings.dispose()`.
9. `tick` 을 다음으로 바꿈:
```ts
  private tick = () => {
    this.timer.update()
    const dt = Math.min(this.timer.getDelta(), 0.1)
    this.nav.update(dt)
    this.controls.update()
    this.rings.update()
    if (this.mode === '3d' && this.quality === 'high') this.composer.render()
    else this.renderer.render(this.scene, this.camera)
    this.frameCb?.(this.screenOf)
  }

  /** plan 좌표 + 높이 → 화면 px (렌더 직후라 행렬이 최신) */
  private screenOf: ScreenProject = (x, y, h) => {
    const plan = this.plan, w = this.container.clientWidth, hh = this.container.clientHeight
    if (!plan || !w || !hh) return { sx: 0, sy: 0, visible: false }
    const [lx, lz] = planToLocal(x, y, plan.bounds)
    return toScreen(this.projV.set(lx, h, lz).applyMatrix4(this.root.matrixWorld).project(this.camera), w, hh)
  }
```
10. `onPointerDown` 의 조건 `if (ev.button !== 0 || id == null || this.drag || this.onPick || this.objectLayer.hasGhost()) return` → 앞에 `!this.interactive ||` 를 붙임.
11. `onClick` 의 `const events = this.objEvents` 바로 위에 `if (!this.interactive) return // 상황판: 선택 없음 (칩으로 고름)`.

`web/src/scene/FactoryView.tsx`:
- import 를 `import { FactoryScene, type Quality, type SceneHost, type ViewMode } from './FactoryScene'` 로.
- `onScene?: (s: (PickSource & ObjectHost) | null) => void` → `onScene?: (s: SceneHost | null) => void`.
(FactoryPage 의 `setScene`(`(PickSource & ObjectHost) | null`)은 그대로 넘겨도 타입이 맞음 — 넓은 값을 받는 setter.)

- [ ] **Step 4: 통과 확인**

Run: `cd /c/kopens/project/Factory3D/web && npx vitest run && npm run build && ./node_modules/.bin/oxlint`
Expected: PASS. (3D 공장 화면 동작은 바뀌지 않음 — 링은 아무도 안 넣고, interactive 기본 true.)

- [ ] **Step 5: Commit**

```bash
cd /c/kopens/project/Factory3D && git add web/src/scene
git commit -m "feat(web): 3D 상황판 지원 — 바닥 상태 링·매 프레임 화면 좌표·전체 보기·칩 높이·보기 전용

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 웹 — 상황판 덮개 컴포넌트 (KPI 줄 · 칩 · 칩 배치 · 이벤트 줄 · 서랍 · 연결 표시)

**Files:**
- Create: `web/src/dashboard/{KpiBar,StationChip,ChipLayer,EventTicker,LiveDrawer,LiveBadge}.tsx`
- Modify: `web/src/styles/app.css` (demo `#dashBar`·`#dashTicker`·`#dashDrawer`·`.dlabel`·`.gauge`·`.pill`·`.dpanel` 이식 + 애니메이션)
- Test: `web/src/dashboard/components.test.tsx`

**Interfaces:**
- Consumes: Task 5 `gaugeCells`, `useTweened`, `useCountUp`, `layoutChips`, `STATUS_LABEL`, `PROJECT_STATE_LABEL`, `eventIcon`, `fmtTime`, 타입들; Task 6 `Conn`; Task 7 `DashHost`.
- Produces:
```tsx
export function KpiBar(props: { kpi: Kpi })        // role=group, aria-label '공정 KPI'. 숫자는 0.6초 카운트업
export function StationChip(props: { s: StationLive; project?: ProjectLive; selected: boolean; onClick(): void; ref?: Ref<HTMLButtonElement> })
  // <button class="dlabel <status>[ sel][ flash-a|flash-b]"> demo chipHtml 그대로. 실적·목표는 0.6초 보간(snapDown),
  // 게이지 막대 <i class="on|tg|cur">, 상태가 바뀔 때마다 flash-a ↔ flash-b (0.8초 반짝 애니메이션 재시작)
export interface ChipItem { station: StationLive; placementId: number; x: number; y: number; radius: number }
export function ChipLayer(props: { scene: DashHost | null; items: ChipItem[]; projects: ProjectLive[]; selectedId: number | null; onSelect(stationId: number): void })
  // scene.onFrame 으로 매 프레임 칩 transform·--lift·--dx 를 직접 씀 (React 렌더 없음). 기준점 = 배치 꼭대기 + 0.8m
export function EventIcon(props: { e: LiveEvent; size?: number })
export function EventTicker(props: { events: LiveEvent[]; drawerOpen: boolean; onToggle(): void })   // 최근 3개(첫 개만 진하게) + 버튼 '제작·자재 현황'(aria-pressed)
export function LiveDrawer(props: { projects: ProjectLive[]; materials: LiveEvent[]; events: LiveEvent[]; onClose(): void })
  // <aside aria-label="제작·자재 현황">: 제작 현황 표(PJT·제작·기간·상태) · 자재 입고 · 이벤트(최근 20), 닫기 버튼 '서랍 닫기'
export function LiveBadge(props: { conn: Conn })   // role=status: 'LIVE · 가상 데이터' / '재연결 중…' / '연결 중…' / '연결 끊김'
```

- [ ] **Step 1: 실패 테스트**

`web/src/dashboard/components.test.tsx`:
```tsx
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EventTicker } from './EventTicker'
import { KpiBar } from './KpiBar'
import { LiveBadge } from './LiveBadge'
import { LiveDrawer } from './LiveDrawer'
import { StationChip } from './StationChip'
import type { LiveEvent, ProjectLive, StationLive } from './types'

const KPI = { running: 6, ok: 4, warn: 1, bad: 1, doneToday: 3, planRate: 87, at: '2026-11-13T03:04:05Z' }
const ev = (id: number, kind: LiveEvent['kind'], text: string, data: Record<string, unknown> = {}): LiveEvent => ({ id, at: '2026-11-13T03:04:05Z', kind, station: 'Main Station 2', text, data })
const STEPS = Array.from({ length: 12 }, (_, i) => `step ${i + 1}`)
const S: StationLive = { id: 3, no: 3, name: 'Main Station 2', placementName: 'Main Station 2', steps: STEPS, step: 8, actual: 60.4, target: 88, status: 'bad', projectId: 2, unitNo: 8 }
const P: ProjectLive = { id: 2, name: '서남해상', done: 7, total: 13, period: "'25.11~'26.06", state: 'run' }
const EVENTS = [
  ev(5, 'status_change', 'Main Station 2 제작 지연', { from: 'warn', to: 'bad' }),
  ev(4, 'step_start', 'Main Station 2 Cable 포설 시작'),
  ev(3, 'unit_done', 'Hub 조립장 1대 조립 완료'),
  ev(2, 'material_in', 'Main Frame 입고 → Main Station 1'),
  ev(1, 'move', 'Main Frame 운반 · 자재 랙 → Main Station 1'),
]

describe('KPI 줄', () => {
  it('가동·진행중·주의·지연·오늘 완료·달성률·시각', () => {
    render(<KpiBar kpi={KPI} />)
    const bar = screen.getByRole('group', { name: '공정 KPI' })
    for (const t of ['공정 상황판', '6가동', '4진행중', '1주의', '1지연', '3오늘 완료', '87%계획 달성률']) expect(bar).toHaveTextContent(t)
    expect(bar).toHaveTextContent(/\d{2}:04:05/)
  })
})

describe('스테이션 칩', () => {
  it('demo chipHtml 내용: 번호·이름·상태 / PJT #호기·제작 / step / 게이지·실적 / 목표·계획 대비', () => {
    render(<StationChip s={S} project={P} selected={false} onClick={vi.fn()} />)
    const chip = screen.getByRole('button', { name: /Main Station 2/ })
    expect(chip).toHaveClass('dlabel', 'bad')
    for (const t of ['3', '지연', '서남해상 #8', '· 제작 7/13', '8/12', 'step 8', '60%', '목표 88%', '계획 대비 -28%p'])
      expect(within(chip).getByText(t)).toBeInTheDocument()
    const bars = chip.querySelectorAll('.gauge i')
    expect(bars).toHaveLength(12)
    expect(chip.querySelectorAll('.gauge i.on')).toHaveLength(7)
    expect(bars[10]).toHaveClass('tg')
    expect(bars[7]).toHaveClass('cur')
  })
  it('누르면 onClick, 상태가 바뀔 때마다 한 번 반짝', () => {
    const onClick = vi.fn()
    const { rerender } = render(<StationChip s={S} project={P} selected={false} onClick={onClick} />)
    const chip = screen.getByRole('button', { name: /Main Station 2/ })
    fireEvent.click(chip)
    expect(onClick).toHaveBeenCalled()
    expect(chip.className).not.toMatch(/flash/)
    rerender(<StationChip s={{ ...S, status: 'warn' }} project={P} selected onClick={onClick} />)
    expect(chip).toHaveClass('warn', 'sel', 'flash-a')
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    rerender(<StationChip s={{ ...S, status: 'ok' }} project={P} selected onClick={onClick} />)
    expect(chip).toHaveClass('ok', 'flash-b')
  })
  it('PJT 가 없으면 PJT 줄 없음', () => {
    render(<StationChip s={{ ...S, projectId: null, unitNo: null }} selected={false} onClick={vi.fn()} />)
    expect(screen.queryByText(/제작 7\/13/)).toBeNull()
  })
})

describe('이벤트 줄', () => {
  it('최근 3개(step 제외), 첫 개만 진하게, 서랍 버튼', () => {
    const onToggle = vi.fn()
    render(<EventTicker events={EVENTS} drawerOpen={false} onToggle={onToggle} />)
    const items = within(screen.getByRole('list', { name: '최근 이벤트' })).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('Main Station 2 제작 지연')
    expect(items[0]).not.toHaveClass('old')
    expect(items[1]).toHaveClass('old')
    expect(items[2]).toHaveTextContent('Main Frame 입고 → Main Station 1')
    const btn = screen.getByRole('button', { name: /제작·자재 현황/ })
    expect(btn).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(btn)
    expect(onToggle).toHaveBeenCalled()
  })
  it('이벤트가 없으면 안내', () => {
    render(<EventTicker events={[]} drawerOpen={false} onToggle={vi.fn()} />)
    expect(screen.getByText('이벤트 없음')).toBeInTheDocument()
  })
})

describe('제작·자재 서랍', () => {
  it('제작 현황 표·자재 입고·이벤트(step 제외)·닫기', () => {
    const onClose = vi.fn()
    const projects: ProjectLive[] = [P, { id: 4, name: '다대포', done: 0, total: 8, period: "'26.05~'26.12", state: 'wait' }]
    render(<LiveDrawer projects={projects} materials={[EVENTS[3]]} events={EVENTS} onClose={onClose} />)
    const drawer = screen.getByRole('complementary', { name: '제작·자재 현황' })
    expect(drawer.querySelectorAll('tbody tr')).toHaveLength(2)
    for (const t of ['서남해상', '7/13', "'25.11~'26.06", '진행', '다대포', '대기']) expect(within(drawer).getByText(t)).toBeInTheDocument()
    expect(within(drawer).getAllByText('Main Frame 입고 → Main Station 1')).toHaveLength(2) // 자재 입고 + 이벤트
    expect(within(drawer).queryByText('Main Station 2 Cable 포설 시작')).toBeNull()
    fireEvent.click(within(drawer).getByRole('button', { name: '서랍 닫기' }))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('연결 표시', () => {
  it('연결 상태별 문구', () => {
    const { rerender } = render(<LiveBadge conn="connecting" />)
    expect(screen.getByRole('status')).toHaveTextContent('연결 중…')
    rerender(<LiveBadge conn="live" />)
    expect(screen.getByRole('status')).toHaveTextContent('LIVE · 가상 데이터')
    rerender(<LiveBadge conn="retrying" />)
    expect(screen.getByRole('status')).toHaveTextContent('재연결 중…')
    expect(screen.getByRole('status')).toHaveClass('retrying')
  })
})
```

Run: `cd /c/kopens/project/Factory3D/web && npx vitest run src/dashboard/components`
Expected: FAIL (컴포넌트 없음).

- [ ] **Step 2: 구현 — 컴포넌트**

`web/src/dashboard/KpiBar.tsx`:
```tsx
import { fmtTime } from './status'
import { useCountUp } from './tween'
import type { Kpi } from './types'

/** 왼쪽 위 KPI 줄 (demo #dashBar). 숫자는 바뀔 때 0.6초 카운트업 */
export function KpiBar({ kpi }: { kpi: Kpi }) {
  const running = useCountUp(kpi.running)
  const ok = useCountUp(kpi.ok)
  const warn = useCountUp(kpi.warn)
  const bad = useCountUp(kpi.bad)
  const done = useCountUp(kpi.doneToday)
  const rate = useCountUp(kpi.planRate)
  return (
    <div className="dash-bar" role="group" aria-label="공정 KPI">
      <span className="ttl">공정 상황판</span>
      <span className="k"><b>{running}</b>가동</span>
      <span className="k ok"><b>{ok}</b>진행중</span>
      <span className="k warn"><b>{warn}</b>주의</span>
      <span className="k bad"><b>{bad}</b>지연</span>
      <span className="k"><b>{done}</b>오늘 완료</span>
      <span className="k"><b>{rate}%</b>계획 달성률</span>
      <span className="k t">{fmtTime(kpi.at)}</span>
    </div>
  )
}
```

`web/src/dashboard/StationChip.tsx`:
```tsx
import { useState, type Ref } from 'react'
import { gaugeCells } from './gauge'
import { STATUS_LABEL } from './status'
import { useTweened } from './tween'
import type { ProjectLive, StationLive } from './types'

interface Props { s: StationLive; project?: ProjectLive; selected: boolean; onClick(): void; ref?: Ref<HTMLButtonElement> }

/** 설비 위 스테이션 칩 (demo chipHtml). 실적·목표는 0.6초 보간, 한 대 완료(값이 내려감)는 바로 */
export function StationChip({ s, project, selected, onClick, ref }: Props) {
  const actual = useTweened(s.actual, 600, { snapDown: true })
  const target = useTweened(s.target, 600, { snapDown: true })
  // 상태가 바뀔 때마다 반짝 (flash-a ↔ flash-b 로 바꿔 CSS 애니메이션을 다시 시작) — 렌더 중 조정
  const [seen, setSeen] = useState(s.status)
  const [flash, setFlash] = useState(0)
  if (seen !== s.status) {
    setSeen(s.status)
    setFlash((n) => n + 1)
  }
  const st = s.status
  const n = s.steps.length
  const a = Math.round(actual)
  const t = Math.min(100, Math.round(target))
  const gap = a - Math.round(target)
  const cls = ['dlabel', st, selected ? 'sel' : '', flash ? (flash % 2 ? 'flash-a' : 'flash-b') : ''].filter(Boolean).join(' ')
  return (
    <button ref={ref} type="button" className={cls} aria-pressed={selected} onClick={onClick}>
      <span className="ch">
        <span className={`dno ${st}`}>{s.no}</span>
        <b>{s.name}</b>
        <span className={`pill ${st}`}>{STATUS_LABEL[st]}</span>
      </span>
      {project && (
        <span className="pjt">
          {`${project.name} #${s.unitNo ?? Math.min(project.total, project.done + 1)}`} <span>{`· 제작 ${project.done}/${project.total}`}</span>
        </span>
      )}
      <span className="job">
        <span className="stp">{`${s.step}/${n}`}</span>
        {s.steps[s.step - 1] ?? ''}
      </span>
      <span className="cb">
        <span className={`gauge ${st}`} aria-hidden>
          {gaugeCells(n, actual, target).map((c, i) => (
            <i key={i} className={[c.on ? 'on' : '', c.target ? 'tg' : '', c.current ? 'cur' : ''].filter(Boolean).join(' ') || undefined} />
          ))}
        </span>
        <span className="pct">{`${a}%`}</span>
      </span>
      <span className="nums">
        <span>{`목표 ${t}%`}</span>
        <span className={`st ${st}`}>{`계획 대비 ${gap >= 0 ? '+' : ''}${gap}%p`}</span>
      </span>
    </button>
  )
}
```

`web/src/dashboard/ChipLayer.tsx`:
```tsx
import { useEffect, useRef } from 'react'
import type { DashHost } from '../scene/FactoryScene'
import { layoutChips, type ChipIn } from './chipLayout'
import { StationChip } from './StationChip'
import type { ProjectLive, StationLive } from './types'

/** 칩 하나: 스테이션 + 붙일 배치(plan 좌표 m) + 바닥 링 반지름 */
export interface ChipItem { station: StationLive; placementId: number; x: number; y: number; radius: number }

const LIFT_M = 0.8 // 설비 꼭대기 위 0.8m 에 칩 꼬리 (demo)
const DEFAULT_TOP = 3 // 모델을 아직 못 읽었을 때 높이

interface Props { scene: DashHost | null; items: ChipItem[]; projects: ProjectLive[]; selectedId: number | null; onSelect(stationId: number): void }

/** 설비 위 스테이션 칩들 (demo dashFrame). 매 프레임 3D → 화면 좌표 → 겹침 회피를 style 에 직접 씀 */
export function ChipLayer({ scene, items, projects, selectedId, onSelect }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const els = useRef(new Map<number, HTMLElement>())
  const latest = useRef(items)
  useEffect(() => {
    latest.current = items
  })
  useEffect(() => {
    if (!scene) return
    scene.onFrame((project) => {
      const layer = box.current
      if (!layer) return
      const chips: ChipIn[] = []
      for (const it of latest.current) {
        const el = els.current.get(it.station.id)
        if (!el) continue
        const p = project(it.x, it.y, (scene.objectTop(it.placementId) ?? DEFAULT_TOP) + LIFT_M)
        el.style.display = p.visible ? '' : 'none'
        if (p.visible) chips.push({ id: it.station.id, x: p.sx, y: p.sy, w: el.offsetWidth, h: el.offsetHeight })
      }
      for (const o of layoutChips(chips, { w: layer.clientWidth, h: layer.clientHeight })) {
        const el = els.current.get(o.id)
        if (!el) continue
        el.style.setProperty('--lift', `${o.lift.toFixed(1)}px`)
        el.style.setProperty('--dx', `${o.dx.toFixed(1)}px`)
        el.style.transform = `translate(${o.cx.toFixed(1)}px, ${o.bottom.toFixed(1)}px) translate(-50%, -100%)`
      }
    })
    return () => scene.onFrame(null)
  }, [scene])
  const byId = new Map(projects.map((p) => [p.id, p]))
  return (
    <div ref={box} className="chip-layer">
      {items.map((it) => {
        const id = it.station.id
        return (
          <StationChip
            key={id}
            ref={(el: HTMLButtonElement | null) => {
              if (el) els.current.set(id, el)
              else els.current.delete(id)
            }}
            s={it.station}
            project={it.station.projectId != null ? byId.get(it.station.projectId) : undefined}
            selected={selectedId === id}
            onClick={() => onSelect(id)}
          />
        )
      })}
    </div>
  )
}
```

`web/src/dashboard/EventTicker.tsx`:
```tsx
import { PanelRight } from 'lucide-react'
import { eventIcon, fmtTime } from './status'
import type { LiveEvent } from './types'

/** 이벤트 종류 아이콘 (step_* 은 없음) */
export function EventIcon({ e, size = 16 }: { e: LiveEvent; size?: number }) {
  const ic = eventIcon(e)
  if (!ic) return null
  const Icon = ic.icon
  return <Icon size={size} color={ic.color} strokeWidth={1.8} aria-hidden />
}

/** 아래 이벤트 줄 (demo #dashTicker): 최근 3개 + 제작·자재 서랍 버튼 */
export function EventTicker({ events, drawerOpen, onToggle }: { events: LiveEvent[]; drawerOpen: boolean; onToggle(): void }) {
  const shown = events.filter((e) => eventIcon(e)).slice(0, 3)
  return (
    <div className="dash-ticker">
      <ul className="evs" aria-label="최근 이벤트">
        {shown.length === 0 ? (
          <li className="ev old">이벤트 없음</li>
        ) : (
          shown.map((e, i) => (
            <li key={e.id} className={i ? 'ev old' : 'ev'}>
              <EventIcon e={e} size={15} />
              <span>{e.text}</span>
              <small>{fmtTime(e.at)}</small>
            </li>
          ))
        )}
      </ul>
      <button type="button" className={drawerOpen ? 'on' : undefined} aria-pressed={drawerOpen} onClick={onToggle}>
        <PanelRight size={15} aria-hidden />
        제작·자재 현황
      </button>
    </div>
  )
}
```

`web/src/dashboard/LiveDrawer.tsx`:
```tsx
import { FileText, Info, Package, X } from 'lucide-react'
import { EventIcon } from './EventTicker'
import { eventIcon, fmtTime, PROJECT_STATE_LABEL } from './status'
import type { LiveEvent, ProjectLive } from './types'

const BLUE = '#3b82f6'

function EventList({ items, empty }: { items: LiveEvent[]; empty: string }) {
  if (items.length === 0) return <p className="dempty">{empty}</p>
  return (
    <ul>
      {items.map((e) => (
        <li key={e.id}>
          <EventIcon e={e} />
          <span>{e.text}</span>
          <small>{fmtTime(e.at)}</small>
        </li>
      ))}
    </ul>
  )
}

/** 오른쪽 서랍 (demo #dashDrawer): 제작 현황 · 자재 입고 · 이벤트 */
export function LiveDrawer({ projects, materials, events, onClose }: { projects: ProjectLive[]; materials: LiveEvent[]; events: LiveEvent[]; onClose(): void }) {
  return (
    <aside className="dash-drawer" aria-label="제작·자재 현황">
      <div className="dh">
        <b>제작 · 자재 현황</b>
        <button type="button" className="icon-btn" aria-label="서랍 닫기" onClick={onClose}>
          <X size={14} aria-hidden />
        </button>
      </div>
      <section className="dpanel">
        <h4><FileText size={16} color={BLUE} aria-hidden />제작 현황</h4>
        <table>
          <thead>
            <tr><th>PJT</th><th>제작</th><th>기간</th><th>상태</th></tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{`${p.done}/${p.total}`}</td>
                <td>{p.period ?? ''}</td>
                <td className={`st ${p.state === 'run' ? 'ok' : p.state === 'wait' ? 'warn' : ''}`}>{PROJECT_STATE_LABEL[p.state]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="dpanel">
        <h4><Package size={16} color={BLUE} aria-hidden />자재 입고</h4>
        <EventList items={materials} empty="입고 기록 없음" />
      </section>
      <section className="dpanel">
        <h4><Info size={16} color={BLUE} aria-hidden />이벤트</h4>
        <EventList items={events.filter((e) => eventIcon(e)).slice(0, 20)} empty="이벤트 없음" />
      </section>
    </aside>
  )
}
```

`web/src/dashboard/LiveBadge.tsx`:
```tsx
import type { Conn } from './types'

const TEXT: Record<Conn, string> = { connecting: '연결 중…', live: 'LIVE · 가상 데이터', retrying: '재연결 중…', closed: '연결 끊김' }

/** 오른쪽 위 연결 표시: 초록 점 LIVE / 주황 깜빡임 재연결 중 */
export function LiveBadge({ conn }: { conn: Conn }) {
  return (
    <p className={`live-badge ${conn}`} role="status">
      <i aria-hidden />
      {TEXT[conn]}
    </p>
  )
}
```

- [ ] **Step 3: 구현 — CSS**

`web/src/styles/app.css` 끝에 추가 (demo `index.html` 의 상황판 CSS 를 앱 색 변수로):
```css
/* 상황판 (demo 이식): 위 KPI 줄 · 설비 위 칩 · 아래 이벤트 줄 · 오른쪽 서랍 · 연결 표시 */
:root { --ok: #22c55e; --warn: #f59e0b; --bad: #ef4444; --float: color-mix(in srgb, var(--panel) 94%, transparent); }
.dash-bar { position: absolute; top: 12px; left: 12px; z-index: 3; display: flex; align-items: center; gap: 4px; padding: 6px 8px; border: 1px solid var(--line-strong); border-radius: var(--kp-radius-sm); background: var(--float); }
.dash-bar .ttl { padding: 0 10px 0 4px; margin-right: 2px; border-right: 1px solid var(--line-strong); font-weight: 700; font-size: var(--kp-text-14); }
.dash-bar .k { display: flex; align-items: baseline; gap: 5px; padding: 3px 9px; color: var(--muted); font-size: var(--kp-text-12); white-space: nowrap; }
.dash-bar .k b { color: var(--text); font-size: 17px; font-weight: 700; font-variant-numeric: tabular-nums; }
.dash-bar .k.ok b { color: var(--ok); }
.dash-bar .k.warn b { color: var(--warn); }
.dash-bar .k.bad b { color: var(--bad); }
.dash-bar .k.t { margin-left: 2px; border-left: 1px solid var(--line-strong); color: var(--text); font-variant-numeric: tabular-nums; }
.live-badge { position: absolute; top: 12px; right: 12px; z-index: 3; display: flex; align-items: center; gap: 6px; margin: 0; padding: 6px 10px; border: 1px solid var(--line-strong); border-radius: var(--kp-radius-sm); background: var(--float); color: var(--text); font-size: var(--kp-text-12); font-weight: 600; }
.live-badge i { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
.live-badge.live i { background: var(--ok); }
.live-badge.retrying { color: var(--warn); }
.live-badge.retrying i { background: var(--warn); animation: live-blink 1s steps(2, start) infinite; }
.live-badge.closed i { background: var(--bad); }
@keyframes live-blink { 50% { opacity: 0.25; } }
.dash-ticker { position: absolute; left: 12px; right: 12px; bottom: 12px; z-index: 3; display: flex; align-items: center; gap: 10px; padding: 6px 6px 6px 12px; border: 1px solid var(--line-strong); border-radius: var(--kp-radius-sm); background: var(--float); }
.dash-ticker .evs { flex: 1; min-width: 0; display: flex; gap: 22px; margin: 0; padding: 0; overflow: hidden; list-style: none; }
.dash-ticker .ev { display: flex; align-items: center; gap: 6px; white-space: nowrap; font-size: var(--kp-text-13); }
.dash-ticker .ev.old { color: var(--muted); }
.dash-ticker .ev small { color: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.dash-ticker button { flex: none; display: flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; border: 1px solid var(--line-strong); border-radius: var(--kp-radius-xs); background: none; font-size: var(--kp-text-13); }
.dash-ticker button.on { border-color: var(--primary); color: #9cc3ff; }
.dash-drawer { position: absolute; top: 64px; right: 12px; bottom: 64px; z-index: 5; width: 300px; overflow-y: auto; padding: 0 10px 10px; border: 1px solid var(--line-strong); border-radius: var(--kp-radius-sm); background: var(--float); }
.dash-drawer .dh { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; justify-content: space-between; padding: 10px 2px; background: var(--panel); font-size: var(--kp-text-14); }
.dpanel { margin-top: 8px; border: 1px solid var(--line); border-radius: var(--kp-radius-sm); background: #ffffff06; }
.dpanel h4 { display: flex; align-items: center; gap: 7px; margin: 0; padding: 8px 12px; border-bottom: 1px solid var(--line); font-size: 12.5px; }
.dpanel table { width: 100%; border-collapse: collapse; font-size: var(--kp-text-12); }
.dpanel th { padding: 6px 6px 4px; color: var(--muted); font-weight: 400; }
.dpanel td { padding: 5px 6px; border-top: 1px solid var(--line); text-align: center; font-variant-numeric: tabular-nums; }
.dpanel td:first-child { padding-left: 12px; font-weight: 600; text-align: left; }
.dpanel ul { margin: 0; padding: 4px 0; list-style: none; }
.dpanel li { display: flex; align-items: center; gap: 8px; padding: 6px 12px; font-size: var(--kp-text-12); }
.dpanel li span { flex: 1; }
.dpanel li small { color: var(--muted); font-size: 11px; }
.dpanel .dempty { margin: 0; padding: 8px 12px; color: var(--muted); font-size: var(--kp-text-12); }
.st.ok { color: var(--ok); }
.st.warn { color: var(--warn); }
.st.bad { color: var(--bad); }
.chip-layer { position: absolute; inset: 0; z-index: 2; overflow: hidden; pointer-events: none; }
.dlabel { position: absolute; left: 0; top: 0; display: block; width: max-content; min-width: 196px; max-width: 250px; padding: 7px 9px; border: 1px solid var(--line-strong); border-radius: 9px; background: var(--float); color: var(--text); font: inherit; text-align: left; box-shadow: 0 4px 14px #0000004d; pointer-events: auto; cursor: pointer; will-change: transform; transform: translate(-200vw, 0); transition: border-color 0.6s; }
.dlabel > span { display: flex; }
.dlabel::after { content: ''; position: absolute; left: calc(50% - var(--dx, 0px)); bottom: calc(-7px - var(--lift, 0px)); margin-left: -6px; border: 6px solid transparent; border-bottom: 0; border-top-color: var(--line-strong); }
.dlabel::before { content: ''; position: absolute; left: calc(50% - var(--dx, 0px)); top: 100%; width: 2px; margin-left: -1px; height: var(--lift, 0px); background: var(--line-strong); }
.dlabel:hover { border-color: #4b5565; z-index: 2; }
.dlabel.sel { border-color: var(--primary); z-index: 3; }
.dlabel.sel::after { border-top-color: var(--primary); }
.dlabel.sel::before { background: var(--primary); }
.dlabel.flash-a { animation: chip-flash-a 0.8s ease-out; }
.dlabel.flash-b { animation: chip-flash-b 0.8s ease-out; }
@keyframes chip-flash-a { from { box-shadow: 0 0 0 0 #ffffffb0, 0 4px 14px #0000004d; } to { box-shadow: 0 0 0 12px #ffffff00, 0 4px 14px #0000004d; } }
@keyframes chip-flash-b { from { box-shadow: 0 0 0 0 #ffffffb0, 0 4px 14px #0000004d; } to { box-shadow: 0 0 0 12px #ffffff00, 0 4px 14px #0000004d; } }
.dlabel .ch { align-items: center; gap: 6px; }
.dlabel .ch b { flex: 1; font-size: 13.5px; white-space: nowrap; }
.dno { flex: none; width: 18px; height: 18px; display: grid; place-items: center; border-radius: 5px; color: #fff; font-weight: 700; font-size: 11px; transition: background-color 0.6s; }
.dno.ok { background: var(--ok); }
.dno.warn { background: var(--warn); }
.dno.bad { background: var(--bad); }
.pill { flex: none; padding: 1px 6px; border-radius: 9px; font-size: 11px; font-weight: 600; transition: color 0.6s, background-color 0.6s; }
.pill.ok { color: var(--ok); background: #22c55e26; }
.pill.warn { color: var(--warn); background: #f59e0b26; }
.pill.bad { color: #fff; background: var(--bad); }
.dlabel .pjt { display: block; margin-top: 3px; color: #93c5fd; font-size: 11.5px; font-weight: 600; }
.dlabel .pjt span { color: var(--muted); font-weight: 400; }
.dlabel .job { gap: 6px; margin-top: 5px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: var(--kp-text-12); }
.dlabel .job .stp { color: var(--muted); font-variant-numeric: tabular-nums; }
.dlabel .cb { align-items: flex-end; gap: 10px; margin-top: 8px; }
.gauge { display: flex; align-items: flex-end; gap: 3px; height: 22px; }
.gauge i { width: 5px; height: 16px; border-radius: 1.5px; background: #343a45; transition: background-color 0.6s; }
.gauge i.tg { height: 22px; background: #c7ccd4; }
.gauge.ok i.on { background: var(--ok); }
.gauge.warn i.on { background: var(--warn); }
.gauge.bad i.on { background: var(--bad); }
.gauge i.cur { animation: gauge-pulse 1.2s ease-in-out infinite; }
@keyframes gauge-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
.dlabel .pct { margin-left: auto; font-size: 17px; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; }
.dlabel .nums { gap: 8px; margin-top: 4px; color: var(--muted); font-size: 11px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.dlabel .nums .st { margin-left: auto; font-weight: 600; }
@media (prefers-reduced-motion: reduce) {
  .gauge i.cur, .live-badge.retrying i, .dlabel.flash-a, .dlabel.flash-b { animation: none; }
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd /c/kopens/project/Factory3D/web && npx vitest run && npm run build && ./node_modules/.bin/oxlint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /c/kopens/project/Factory3D && git add web/src/dashboard web/src/styles/app.css
git commit -m "feat(web): 상황판 덮개 — KPI 줄·스테이션 칩(게이지 보간·반짝)·칩 배치·이벤트 줄·서랍·연결 표시

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 웹 — 상황판 화면 `/dashboard` + 레일

**Files:**
- Create: `web/src/pages/DashboardPage.tsx`
- Modify: `web/src/routes.tsx` (`/dashboard`), `web/src/layout/IconRail.tsx` (상황판 열기), `web/src/layout/layout.test.tsx` (상황판 버튼 켜짐), `web/src/styles/app.css` (`.dash-empty`)
- Test: `web/src/pages/dashboard.test.tsx`

**Interfaces:**
- Consumes: Task 6 `useLive`, `Live`; Task 7 `SceneHost`, `RingSpec`; Task 8 `ChipLayer`, `ChipItem`, `KpiBar`, `EventTicker`, `LiveDrawer`, `LiveBadge`; Task 5 `STATUS_COLOR`; 기존 `useDrawings`·`pickDrawing`·`loadStored`·`saveStored`·`useDrawing`·`useModels`·`usePlacements`·`modelFileUrl`·`BOX_SIZE`·`DrawingBar`·`AppShell`·`FactoryView`.
- Produces: `export function DashboardPage()` — 규칙:
  - 머리글: `DrawingBar`(추가 버튼 없음, 3D 공장과 같은 저장값 `f3d:drawing:<user>`) + 품질 버튼(`f3d:view` 의 quality 를 같이 씀). 본문: `FactoryView view="3d"` + 배치 객체(`setObjects`) + `setInteractive(false)`.
  - 도면이 정해지고 plan 이 그려지면 `frameOverview()`.
  - 칩 = 스테이션 중 `placementName` 과 같은 이름의 배치가 있는 것. 링 반지름 = `max(sizeX, sizeY)·0.62` (모델 없으면 `BOX_SIZE`), 색 = `STATUS_COLOR[status]`, 선택이면 strong.
  - 칩 클릭: 다른 칩 → 선택 + `focusObject(배치 id)`, 같은 칩 다시 → 선택 해제 + `frameOverview()`. 도면이 바뀌면 선택 해제.
  - 공정 없는 도면(`data.stations` 비어 있음): 가운데 `이 도면에는 공정 기준정보가 없습니다` + 관리자에게만 링크 `기준정보 설정` → `/admin/stations?drawing=<id>`. KPI·칩·이벤트 줄은 숨김.
  - `conn === 'closed'` 이면 `도면을 찾을 수 없습니다.` (role=alert).
- `IconRail` 의 상황판 항목 `to: '/dashboard'` (버튼 이름 `상황판`, 준비 중 아님).

- [ ] **Step 1: 실패 테스트**

`web/src/pages/dashboard.test.tsx`:
```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../api/types'
import { StaticAuth } from '../auth/auth'
import type { Live } from '../dashboard/useLive'
import { routes } from '../routes'

const live = vi.hoisted(() => ({ value: { conn: 'connecting', data: null } as unknown }))
vi.mock('../dashboard/useLive', () => ({ useLive: () => live.value }))
vi.mock('../scene/FactoryView', () => ({
  FactoryView: (p: { view: string; plan: unknown }) => <div data-testid="factory-view" data-view={p.view}>{p.plan ? 'plan' : 'no plan'}</div>,
}))

const ADMIN: User = { id: 1, username: 'admin', displayName: '관리자', role: 'ADMIN', enabled: true, mustChangePassword: false, locked: false, createdAt: '' }
const VIEWER: User = { ...ADMIN, id: 2, username: 'lee', role: 'VIEWER' }
const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body })
const DRAWINGS = [{ id: 1, name: '나셀 공장', sourceType: 'dxf', version: 1, createdBy: 'system', updatedAt: '', width: 160, height: 65.8, placements: 1 }]
const PLAN = { format: 1, unit: 'mm', scale: 0.001, rotQ: 0, flip: 1, bounds: { w: 160, h: 65.8 }, layers: [], lines: [], texts: [], walls: [], partitions: [], columns: [], zones: [], objectHints: [], warnings: { unsupported: {}, unitGuessed: false } }
const KPI = { running: 1, ok: 1, warn: 0, bad: 0, doneToday: 2, planRate: 91, at: '2026-11-13T03:04:05Z' }
const STATION = { id: 3, no: 1, name: 'Main Station 1', placementName: 'Main Station 1', steps: ['a', 'b'], step: 1, actual: 20, target: 22, status: 'ok', projectId: null, unitNo: null }
const liveOf = (stations: unknown[]): Live => ({
  conn: 'live',
  data: { drawingId: 1, kpi: KPI, stations, projects: [], events: [{ id: 9, at: KPI.at, kind: 'unit_done', station: 'Main Station 1', text: 'Main Station 1 1대 조립 완료', data: {} }], materials: [] },
} as unknown as Live)

function show(user: User, placements: unknown[] = []) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/drawings') return json(200, DRAWINGS)
    if (url === '/api/drawings/1') return json(200, { ...DRAWINGS[0], createdAt: '', plan: PLAN, layerRules: {} })
    if (url === '/api/models') return json(200, [])
    if (url === '/api/drawings/1/placements') return json(200, placements)
    return json(404, { detail: '없음' })
  }))
  render(
    <StaticAuth user={user}>
      <RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/dashboard'] })} />
    </StaticAuth>,
  )
}

describe('상황판 화면', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
    live.value = { conn: 'connecting', data: null }
  })

  it('공정이 없는 도면은 안내, 관리자에게만 기준정보 설정 링크', async () => {
    live.value = liveOf([])
    show(ADMIN)
    expect(await screen.findByText('이 도면에는 공정 기준정보가 없습니다')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '기준정보 설정' })).toHaveAttribute('href', '/admin/stations?drawing=1')
    expect(screen.queryByRole('group', { name: '공정 KPI' })).toBeNull()
    expect(screen.getByTestId('factory-view')).toHaveAttribute('data-view', '3d')
    expect(screen.getByRole('button', { name: '상황판' })).toHaveAttribute('aria-current', 'page')
  })

  it('조회 권한은 링크 없이 안내만', async () => {
    live.value = liveOf([])
    show(VIEWER)
    expect(await screen.findByText('이 도면에는 공정 기준정보가 없습니다')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '기준정보 설정' })).toBeNull()
  })

  it('공정이 있으면 KPI·칩·이벤트 줄·연결 표시, 서랍 열고 닫기', async () => {
    live.value = liveOf([STATION])
    show(VIEWER, [{ id: 10, modelId: null, name: 'Main Station 1', x: 5, y: 5, rot: 0 }])
    expect(await screen.findByRole('button', { name: /Main Station 1/ })).toHaveClass('dlabel', 'ok')
    expect(screen.getByRole('group', { name: '공정 KPI' })).toHaveTextContent('1가동')
    expect(screen.getByText('LIVE · 가상 데이터')).toBeInTheDocument()
    expect(screen.getByText('Main Station 1 1대 조립 완료')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /추가/ })).toBeNull() // 도면 추가 버튼 없음
    fireEvent.click(screen.getByRole('button', { name: /제작·자재 현황/ }))
    expect(screen.getByRole('complementary', { name: '제작·자재 현황' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '서랍 닫기' }))
    expect(screen.queryByRole('complementary', { name: '제작·자재 현황' })).toBeNull()
  })

  it('연결 전에는 연결 중 표시', async () => {
    show(VIEWER)
    expect(await screen.findByText('연결 중…')).toBeInTheDocument()
  })
})
```

`web/src/layout/layout.test.tsx` 의 `expect(screen.getByRole('button', { name: /상황판/ })).toBeDisabled()` 를 다음으로 바꿈:
```tsx
    expect(screen.getByRole('button', { name: '상황판' })).toBeEnabled()
```

Run: `cd /c/kopens/project/Factory3D/web && npx vitest run src/pages/dashboard src/layout`
Expected: FAIL (`/dashboard` 없음 → 404 화면, 상황판 버튼 꺼짐).

- [ ] **Step 2: 구현**

`web/src/layout/IconRail.tsx` — `MENU` 의 상황판 항목과 주석:
```tsx
  { key: 'dashboard', label: '상황판', icon: LayoutDashboard, to: '/dashboard' },
```
```tsx
/** 맨 왼쪽 아이콘 메뉴. 실행·AI 챗봇은 다음 단계에서 열림, 관리자는 관리자에게만 */
```

`web/src/routes.tsx` — import `import { DashboardPage } from './pages/DashboardPage'` 를 추가하고 `'/'` 경로 다음에:
```tsx
  { path: '/dashboard', element: <RequireAuth><DashboardPage /></RequireAuth>, errorElement: <ErrorPage code="500" /> },
```

`web/src/pages/DashboardPage.tsx`:
```tsx
import { Gauge } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { hasRole, useAuth } from '../auth/context'
import { ChipLayer, type ChipItem } from '../dashboard/ChipLayer'
import { EventTicker } from '../dashboard/EventTicker'
import { KpiBar } from '../dashboard/KpiBar'
import { LiveBadge } from '../dashboard/LiveBadge'
import { LiveDrawer } from '../dashboard/LiveDrawer'
import { STATUS_COLOR } from '../dashboard/status'
import { useLive } from '../dashboard/useLive'
import { useDrawing } from '../drawing/useDrawing'
import { loadStored, pickDrawing, saveStored, useDrawings } from '../drawing/useDrawings'
import { AppShell } from '../layout/AppShell'
import { DrawingBar } from '../layout/DrawingBar'
import { modelFileUrl } from '../objects/api'
import { BOX_SIZE, type ModelInfo } from '../objects/types'
import { useModels } from '../objects/useModels'
import { usePlacements } from '../objects/usePlacements'
import type { Quality, SceneHost } from '../scene/FactoryScene'
import { FactoryView } from '../scene/FactoryView'
import type { SceneObject } from '../scene/objectLayer'
import { ErrorPage } from './ErrorPage'

const NO_MODELS: ModelInfo[] = []
const RING_K = 0.62 // 링 반지름 = 설비 큰 변 × 0.62 (demo)

/** 3D 공장 화면과 같은 저장값 f3d:view 의 quality */
function loadQuality(): Quality {
  try {
    return JSON.parse(localStorage.getItem('f3d:view') ?? '{}').quality === 'low' ? 'low' : 'high'
  } catch {
    return 'high'
  }
}

function saveQuality(q: Quality) {
  try {
    const v = JSON.parse(localStorage.getItem('f3d:view') ?? '{}') as object
    localStorage.setItem('f3d:view', JSON.stringify({ ...v, quality: q }))
  } catch {
    /* 저장 못 해도 동작 */
  }
}

/** /dashboard — 실시간 상황판: 3D(보기 전용) + KPI 줄 · 스테이션 칩 · 바닥 링 · 이벤트 줄 · 제작·자재 서랍 */
export function DashboardPage() {
  const { user } = useAuth()
  const isAdmin = hasRole(user, 'ADMIN')
  const [drawings, retry] = useDrawings()
  const [chosen, setChosen] = useState<number | null>(() => (user ? loadStored(user.username) : null))
  const [quality, setQuality] = useState<Quality>(loadQuality)
  const [scene, setScene] = useState<SceneHost | null>(null)
  const list = drawings.kind === 'ok' ? drawings.list : []
  const drawingId = pickDrawing(list, chosen)
  const { state } = useDrawing(drawingId)
  const detail = state.kind === 'ok' && state.detail.id === drawingId ? state.detail : null
  const models = useModels()
  const modelList = models.state.kind === 'ok' ? models.state.list : NO_MODELS
  const placements = usePlacements(detail?.id ?? null)
  const live = useLive(drawingId)
  const data = live.data && live.data.drawingId === drawingId ? live.data : null
  const [selId, setSelId] = useState<number | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  // 도면이 바뀌면 칩 선택 해제 (렌더 중 조정)
  const [selDrawing, setSelDrawing] = useState(drawingId)
  if (selDrawing !== drawingId) {
    setSelDrawing(drawingId)
    setSelId(null)
  }

  const byId = useMemo(() => new Map(modelList.map((m) => [m.id, m])), [modelList])
  const sceneObjects = useMemo<SceneObject[]>(
    () =>
      placements.list.map((p) => {
        const m = p.modelId != null ? (byId.get(p.modelId) ?? null) : null
        const size = m ?? BOX_SIZE
        return { id: p.id, name: p.name, url: m ? modelFileUrl(m) : null, sizeX: size.sizeX, sizeY: size.sizeY, sizeZ: size.sizeZ, x: p.x, y: p.y, rot: p.rot, label: p.hintLabel ?? p.name }
      }),
    [placements.list, byId],
  )
  // 스테이션 ↔ 같은 이름의 배치 (못 찾으면 칩·링만 빠지고 KPI·서랍에는 포함)
  const items = useMemo<ChipItem[]>(() => {
    if (!data) return []
    const byName = new Map(placements.list.map((p) => [p.name, p]))
    const out: ChipItem[] = []
    for (const s of data.stations) {
      const p = s.placementName ? byName.get(s.placementName) : undefined
      if (!p) continue
      const size = (p.modelId != null ? byId.get(p.modelId) : undefined) ?? BOX_SIZE
      out.push({ station: s, placementId: p.id, x: p.x, y: p.y, radius: Math.max(size.sizeX, size.sizeY) * RING_K })
    }
    return out
  }, [data, placements.list, byId])

  useEffect(() => scene?.setInteractive(false), [scene])
  useEffect(() => scene?.setObjects(sceneObjects), [scene, sceneObjects])
  useEffect(() => {
    scene?.setRings(items.map((i) => ({ id: i.station.id, x: i.x, y: i.y, r: i.radius, color: STATUS_COLOR[i.station.status], strong: i.station.id === selId })))
  }, [scene, items, selId])
  const detailId = detail?.id ?? null
  useEffect(() => {
    if (scene && detailId !== null) scene.frameOverview() // FactoryView 가 같은 커밋에서 plan 을 먼저 그림
  }, [scene, detailId])

  if (drawings.kind === 'error')
    return <ErrorPage code={drawings.error.kind === 'network' ? 'offline' : '500'} detail={drawings.error.message} onRetry={retry} />
  const select = (id: number) => {
    setChosen(id)
    if (user) saveStored(user.username, id)
  }
  const onChip = (id: number) => {
    const it = items.find((i) => i.station.id === id)
    if (selId === id || !it) {
      setSelId(null)
      scene?.frameOverview()
    } else {
      setSelId(id)
      scene?.focusObject(it.placementId)
    }
  }
  const empty = data !== null && data.stations.length === 0
  const head = (
    <>
      <DrawingBar drawings={list} selectedId={drawingId} onSelect={select} canAdd={false} onAdd={() => {}} />
      <button
        className="bar-btn"
        aria-pressed={quality === 'high'}
        onClick={() => {
          const q: Quality = quality === 'high' ? 'low' : 'high'
          setQuality(q)
          saveQuality(q)
        }}
      >
        <Gauge size={14} aria-hidden /> {quality === 'high' ? '고품질' : '저사양'}
      </button>
    </>
  )
  return (
    <AppShell active="dashboard" head={head}>
      {drawings.kind === 'loading' ? (
        <p className="empty-state" role="status">도면 목록 불러오는 중…</p>
      ) : list.length === 0 ? (
        <div className="empty-state">
          <strong>등록된 도면이 없습니다</strong>
          <span>도면을 추가하면 상황판이 여기에 표시됩니다.</span>
        </div>
      ) : (
        <>
          <FactoryView plan={detail?.plan ?? null} planKey={detail?.id} view="3d" quality={quality} onScene={setScene} />
          {state.kind === 'error' && <p className="empty-state" role="alert">{state.error.message}</p>}
          {data && !empty && <ChipLayer scene={scene} items={items} projects={data.projects} selectedId={selId} onSelect={onChip} />}
          {data && !empty && <KpiBar kpi={data.kpi} />}
          <LiveBadge conn={live.conn} />
          {empty && (
            <div className="empty-state dash-empty">
              <strong>이 도면에는 공정 기준정보가 없습니다</strong>
              {isAdmin && <Link to={`/admin/stations?drawing=${drawingId}`}>기준정보 설정</Link>}
            </div>
          )}
          {live.conn === 'closed' && <p className="empty-state" role="alert">도면을 찾을 수 없습니다.</p>}
          {data && !empty && <EventTicker events={data.events} drawerOpen={drawerOpen} onToggle={() => setDrawerOpen((o) => !o)} />}
          {data && !empty && drawerOpen && (
            <LiveDrawer projects={data.projects} materials={data.materials} events={data.events} onClose={() => setDrawerOpen(false)} />
          )}
        </>
      )}
    </AppShell>
  )
}
```

`web/src/styles/app.css` 끝에 추가:
```css
.dash-empty { pointer-events: none; }
.dash-empty a { pointer-events: auto; color: #9cc3ff; font-size: var(--kp-text-14); }
```

- [ ] **Step 3: 통과 확인**

Run: `cd /c/kopens/project/Factory3D/web && npx vitest run && npm run build && ./node_modules/.bin/oxlint`
Expected: PASS. 권장: 서버(Task 4 까지) + `npm run dev` 로 `/dashboard` 를 한 번 열어 칩 6개·링·KPI 가 움직이는지 눈으로 확인(서버를 `F3D_LIVE_TIME_SCALE=30` 으로 띄우면 빨리 보임).

- [ ] **Step 4: Commit**

```bash
cd /c/kopens/project/Factory3D && git add web
git commit -m "feat(web): 상황판 화면 /dashboard — 3D 보기 전용·칩·링·KPI·이벤트·서랍·전체 보기·레일 열기

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 웹 — 관리자 › 공정·생산 기준정보

**Files:**
- Create: `web/src/dashboard/api.ts`, `web/src/pages/admin/stationForm.ts`, `web/src/pages/admin/StationsPage.tsx`
- Modify: `web/src/pages/admin/AdminLayout.tsx` (탭 `공정·생산 기준정보`, `객체관리` 다음), `web/src/routes.tsx` (`/admin/stations`)
- Test: `web/src/pages/admin/stations.test.tsx`

**Interfaces:**
- Consumes: Task 1 REST(§3.3); 기존 `apiJson`·`apiSend`, `useDrawings`·`pickDrawing`, `listPlacements`, `Modal`; Task 5 `PROJECT_STATE_LABEL`.
- Produces:
```ts
// dashboard/api.ts
export type ProjectState = 'run' | 'wait' | 'done'
export interface Station { id; no; name; placementName: string | null; steps: string[]; taktSec; warnPp; delayPp; projectId: number | null; countsProject: boolean; materials: string[] }
export interface Project { id; name; done; total; period: string | null; state: ProjectState; sortOrder: number }
export interface StationInput { name?; placementName?; clearPlacement?; steps?; taktSec?; warnPp?; delayPp?; projectId?; clearProject?; countsProject?; materials? }
export interface ProjectInput { name?; done?; total?; period?; state? }
export const listStations(drawingId) · createStation(drawingId, s) · updateStation(id, s) · deleteStation(id) · orderStations(drawingId, ids)
export const listProjects(drawingId) · createProject(drawingId, p) · updateProject(id, p) · deleteProject(id)
// pages/admin/stationForm.ts
export interface StationForm { name; placementName; projectId; countsProject: boolean; steps; taktMin; warnPp; delayPp; materials: string }
export interface ProjectForm { name; done; total; period: string; state: ProjectState }
export function stationForm(s: Station | null): StationForm      // 새 공정 기본: 택타임 20분 · 10 / 20
export function projectForm(p: Project | null): ProjectForm
export function parseStationForm(f: StationForm): { input: StationInput } | { error: string }
export function parseProjectForm(f: ProjectForm): { input: ProjectInput } | { error: string }
```
- 화면: 탭 이름 `공정·생산 기준정보`, 제목(h2) 같은 글. 도면 select 라벨 `도면` (`?drawing=` 쿼리 우선, 바꾸면 쿼리 갱신). PJT 표(이름·제작·기간·상태·관리, 버튼 `PJT <이름> 수정`/`PJT <이름> 삭제`, `PJT 추가`). 공정 표(번호·이름·연결 설비·step 수·택타임(분)·주의/지연(%p)·PJT·관리, 버튼 `<이름> 위로`/`<이름> 아래로`/`<이름> 수정`/`<이름> 삭제`, `공정 추가`). 공정 창 라벨: `이름`·`연결 설비`(그 도면 배치 이름 + `없음`)·`PJT`·`완료 시 PJT 제작 수에 셈`·`step (한 줄에 하나)`·`택타임(분)`·`주의 기준(%p)`·`지연 기준(%p)`·`입고 자재`. 오류는 창 안(role=alert), 창 아래 작은 안내 `저장하면 상황판이 이 도면을 처음부터 다시 진행합니다.`

- [ ] **Step 1: 실패 테스트**

`web/src/pages/admin/stations.test.tsx`:
```tsx
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../../api/types'
import { StaticAuth } from '../../auth/auth'
import { routes } from '../../routes'

const ADMIN: User = { id: 1, username: 'admin', displayName: '관리자', role: 'ADMIN', enabled: true, mustChangePassword: false, locked: false, createdAt: '' }
const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body })
const DRAWINGS = [
  { id: 1, name: '나셀 공장', sourceType: 'dxf', version: 1, createdBy: 'system', updatedAt: '', width: 160, height: 65.8, placements: 2 },
  { id: 2, name: '2공장', sourceType: 'dxf', version: 1, createdBy: 'kim', updatedAt: '', width: 40, height: 20, placements: 0 },
]
const STATIONS = [
  { id: 11, no: 1, name: 'Hub 조립장', placementName: 'Hub 조립장', steps: ['a', 'b'], taktSec: 1200, warnPp: 10, delayPp: 20, projectId: 21, countsProject: false, materials: ['Hub Casting'] },
  { id: 12, no: 2, name: 'Main Station 3', placementName: 'Main Station 3', steps: ['a'], taktSec: 1800, warnPp: 10, delayPp: 20, projectId: 21, countsProject: true, materials: [] },
]
const PROJECTS = [{ id: 21, name: '야월해상', done: 3, total: 13, period: "'25.09~'27.03", state: 'run', sortOrder: 1 }]
const PLACEMENTS = [
  { id: 31, modelId: 1, name: 'Hub 조립장', x: 1, y: 1, rot: 0 },
  { id: 32, modelId: 1, name: 'Main Station 3', x: 2, y: 2, rot: 0 },
]
type Call = [string, RequestInit | undefined]

function show(handler: (url: string, init?: RequestInit) => unknown = () => null) {
  const fetch = vi.fn(async (url: string, init?: RequestInit) =>
    handler(url, init) ??
    (url === '/api/drawings' ? json(200, DRAWINGS)
      : url === '/api/drawings/1/stations' ? json(200, STATIONS)
      : url === '/api/drawings/1/projects' ? json(200, PROJECTS)
      : url === '/api/drawings/1/placements' ? json(200, PLACEMENTS)
      : json(200, [])),
  )
  vi.stubGlobal('fetch', fetch)
  render(
    <StaticAuth user={ADMIN}>
      <RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/admin/stations?drawing=1'] })} />
    </StaticAuth>,
  )
  return fetch
}
const sent = (fetch: ReturnType<typeof show>, method: string) => (fetch.mock.calls as unknown as Call[]).filter(([, i]) => i?.method === method)

describe('관리자 › 공정·생산 기준정보', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('PJT 표·공정 표 (택타임 분·기준·PJT), 탭 선택', async () => {
    show()
    const row = (await screen.findAllByText('Main Station 3', { selector: 'td' }))[0].closest('tr')!
    expect(within(row).getByText('30')).toBeInTheDocument()
    expect(within(row).getByText('10 / 20')).toBeInTheDocument()
    expect(within(row).getByText('야월해상')).toBeInTheDocument()
    expect(screen.getByText('3/13')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '공정·생산 기준정보' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('combobox', { name: '도면' })).toHaveValue('1')
    expect(screen.getByRole('button', { name: 'Hub 조립장 위로' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Main Station 3 아래로' })).toBeDisabled()
  })

  it('공정 추가 → POST (step 줄바꿈·택타임 분→초·자재 쉼표)', async () => {
    const fetch = show((url, init) => (init?.method === 'POST' ? json(201, { ...STATIONS[0], id: 13, no: 3, name: '도장' }) : null))
    fireEvent.click(await screen.findByRole('button', { name: /공정 추가/ }))
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '도장' } })
    fireEvent.change(screen.getByLabelText('연결 설비'), { target: { value: 'Hub 조립장' } })
    fireEvent.change(screen.getByLabelText('PJT'), { target: { value: '21' } })
    fireEvent.click(screen.getByLabelText('완료 시 PJT 제작 수에 셈'))
    fireEvent.change(screen.getByLabelText('step (한 줄에 하나)'), { target: { value: '세척\n\n도장\n건조 ' } })
    fireEvent.change(screen.getByLabelText('택타임(분)'), { target: { value: '15' } })
    fireEvent.change(screen.getByLabelText('입고 자재'), { target: { value: 'Paint, Thinner ' } })
    expect(screen.getByText('저장하면 상황판이 이 도면을 처음부터 다시 진행합니다.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(sent(fetch, 'POST')).toHaveLength(1))
    const [url, init] = sent(fetch, 'POST')[0]
    expect(url).toBe('/api/drawings/1/stations')
    expect(JSON.parse(String(init!.body))).toEqual({
      name: '도장', placementName: 'Hub 조립장', projectId: 21, countsProject: true,
      steps: ['세척', '도장', '건조'], taktSec: 900, warnPp: 10, delayPp: 20, materials: ['Paint', 'Thinner'],
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('검사 오류는 창 안에 한국어, 서버 409 도 창 안에', async () => {
    const fetch = show((url, init) => (init?.method === 'POST' ? json(409, { detail: '같은 이름의 공정이 있습니다.' }) : null))
    fireEvent.click(await screen.findByRole('button', { name: /공정 추가/ }))
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: 'Hub 조립장' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(screen.getByRole('alert')).toHaveTextContent('step 은 1~40개, 각 1~100자로 입력하세요.')
    fireEvent.change(screen.getByLabelText('step (한 줄에 하나)'), { target: { value: 'a' } })
    fireEvent.change(screen.getByLabelText('택타임(분)'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(screen.getByRole('alert')).toHaveTextContent('택타임은 1~10080분으로 입력하세요.')
    fireEvent.change(screen.getByLabelText('택타임(분)'), { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText('지연 기준(%p)'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(screen.getByRole('alert')).toHaveTextContent('주의·지연 기준은 0 ≤ 주의 < 지연 ≤ 100 이어야 합니다.')
    expect(sent(fetch, 'POST')).toHaveLength(0)
    fireEvent.change(screen.getByLabelText('지연 기준(%p)'), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(await screen.findByText('같은 이름의 공정이 있습니다.')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: '공정 추가' })).toBeInTheDocument()
  })

  it('순서: 아래로 → PUT 전체 순서', async () => {
    const fetch = show((url, init) => (init?.method === 'PUT' ? json(200, [STATIONS[1], STATIONS[0]]) : null))
    fireEvent.click(await screen.findByRole('button', { name: 'Hub 조립장 아래로' }))
    await waitFor(() => expect(sent(fetch, 'PUT')).toHaveLength(1))
    expect(sent(fetch, 'PUT')[0][0]).toBe('/api/drawings/1/stations/order')
    expect(sent(fetch, 'PUT')[0][1]!.body).toBe(JSON.stringify([12, 11]))
  })

  it('PJT 수정 → PATCH', async () => {
    const fetch = show((url, init) => (init?.method === 'PATCH' ? json(200, { ...PROJECTS[0], done: 4 }) : null))
    fireEvent.click(await screen.findByRole('button', { name: 'PJT 야월해상 수정' }))
    expect(screen.getByLabelText('이름')).toHaveValue('야월해상')
    fireEvent.change(screen.getByLabelText('제작'), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('상태'), { target: { value: 'wait' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(sent(fetch, 'PATCH')).toHaveLength(1))
    const [url, init] = sent(fetch, 'PATCH')[0]
    expect(url).toBe('/api/projects/21')
    expect(JSON.parse(String(init!.body))).toEqual({ name: '야월해상', done: 4, total: 13, period: "'25.09~'27.03", state: 'wait' })
  })
})
```

Run: `cd /c/kopens/project/Factory3D/web && npx vitest run src/pages/admin/stations`
Expected: FAIL (`/admin/stations` 없음).

- [ ] **Step 2: 구현 — API·폼**

`web/src/dashboard/api.ts`:
```ts
import { apiJson, apiSend } from '../api/client'

export type ProjectState = 'run' | 'wait' | 'done'
/** 공정 기준정보 (no = 칩 번호) */
export interface Station {
  id: number; no: number; name: string; placementName: string | null; steps: string[]; taktSec: number
  warnPp: number; delayPp: number; projectId: number | null; countsProject: boolean; materials: string[]
}
export interface Project { id: number; name: string; done: number; total: number; period: string | null; state: ProjectState; sortOrder: number }
/** 추가·수정 (수정에서 빠진 칸은 그대로, clear* 로 비움) */
export interface StationInput {
  name?: string; placementName?: string; clearPlacement?: boolean; steps?: string[]; taktSec?: number; warnPp?: number
  delayPp?: number; projectId?: number; clearProject?: boolean; countsProject?: boolean; materials?: string[]
}
export interface ProjectInput { name?: string; done?: number; total?: number; period?: string; state?: ProjectState }

export const listStations = (drawingId: number) => apiJson<Station[]>(`/api/drawings/${drawingId}/stations`)
export const createStation = (drawingId: number, s: StationInput) => apiSend<Station>('POST', `/api/drawings/${drawingId}/stations`, s)
export const updateStation = (id: number, s: StationInput) => apiSend<Station>('PATCH', `/api/stations/${id}`, s)
export const deleteStation = (id: number) => apiSend<void>('DELETE', `/api/stations/${id}`)
export const orderStations = (drawingId: number, ids: number[]) => apiSend<Station[]>('PUT', `/api/drawings/${drawingId}/stations/order`, ids)

export const listProjects = (drawingId: number) => apiJson<Project[]>(`/api/drawings/${drawingId}/projects`)
export const createProject = (drawingId: number, p: ProjectInput) => apiSend<Project>('POST', `/api/drawings/${drawingId}/projects`, p)
export const updateProject = (id: number, p: ProjectInput) => apiSend<Project>('PATCH', `/api/projects/${id}`, p)
export const deleteProject = (id: number) => apiSend<void>('DELETE', `/api/projects/${id}`)
```

`web/src/pages/admin/stationForm.ts`:
```ts
import type { Project, ProjectInput, ProjectState, Station, StationInput } from '../../dashboard/api'

/** 공정 창 입력값 (모두 글자, 체크만 boolean) */
export interface StationForm {
  name: string; placementName: string; projectId: string; countsProject: boolean
  steps: string; taktMin: string; warnPp: string; delayPp: string; materials: string
}
export interface ProjectForm { name: string; done: string; total: string; period: string; state: ProjectState }

const minutes = (sec: number) => String(Math.round(sec / 6) / 10)

export function stationForm(s: Station | null): StationForm {
  if (!s) return { name: '', placementName: '', projectId: '', countsProject: false, steps: '', taktMin: '20', warnPp: '10', delayPp: '20', materials: '' }
  return {
    name: s.name, placementName: s.placementName ?? '', projectId: s.projectId == null ? '' : String(s.projectId), countsProject: s.countsProject,
    steps: s.steps.join('\n'), taktMin: minutes(s.taktSec), warnPp: String(s.warnPp), delayPp: String(s.delayPp), materials: s.materials.join(', '),
  }
}

export function projectForm(p: Project | null): ProjectForm {
  if (!p) return { name: '', done: '0', total: '1', period: '', state: 'run' }
  return { name: p.name, done: String(p.done), total: String(p.total), period: p.period ?? '', state: p.state }
}

/** 서버와 같은 검사 (문구도 같게, 택타임은 분) */
export function parseStationForm(f: StationForm): { input: StationInput } | { error: string } {
  const name = f.name.trim()
  if (!name || name.length > 100) return { error: '공정 이름은 1~100자로 입력하세요.' }
  const steps = f.steps.split('\n').map((s) => s.trim()).filter(Boolean)
  if (steps.length < 1 || steps.length > 40 || steps.some((s) => s.length > 100)) return { error: 'step 은 1~40개, 각 1~100자로 입력하세요.' }
  const takt = Number(f.taktMin)
  if (!f.taktMin.trim() || !Number.isFinite(takt) || takt < 1 || takt > 10080) return { error: '택타임은 1~10080분으로 입력하세요.' }
  const warnPp = Number(f.warnPp), delayPp = Number(f.delayPp)
  if (!Number.isInteger(warnPp) || !Number.isInteger(delayPp) || !(warnPp >= 0 && warnPp < delayPp && delayPp <= 100))
    return { error: '주의·지연 기준은 0 ≤ 주의 < 지연 ≤ 100 이어야 합니다.' }
  const materials = f.materials.split(',').map((s) => s.trim()).filter(Boolean)
  if (materials.length > 40 || materials.some((m) => m.length > 100)) return { error: '입고 자재는 40개까지, 각 1~100자로 입력하세요.' }
  return {
    input: {
      name, steps, taktSec: Math.round(takt * 60), warnPp, delayPp, countsProject: f.countsProject, materials,
      ...(f.placementName ? { placementName: f.placementName } : { clearPlacement: true }),
      ...(f.projectId ? { projectId: Number(f.projectId) } : { clearProject: true }),
    },
  }
}

export function parseProjectForm(f: ProjectForm): { input: ProjectInput } | { error: string } {
  const name = f.name.trim()
  if (!name || name.length > 100) return { error: 'PJT 이름은 1~100자로 입력하세요.' }
  const done = Number(f.done), total = Number(f.total)
  if (!Number.isInteger(done) || !Number.isInteger(total) || total < 1 || done < 0 || done > total)
    return { error: '제작 수는 0 ≤ 제작 ≤ 전체, 전체 ≥ 1 이어야 합니다.' }
  const period = f.period.trim()
  if (period.length > 40) return { error: '기간은 40자까지입니다.' }
  return { input: { name, done, total, period, state: f.state } }
}
```

- [ ] **Step 3: 구현 — 화면·탭·경로**

`web/src/pages/admin/StationsPage.tsx`:
```tsx
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { Modal } from '../../components/Modal'
import {
  createProject, createStation, deleteProject, deleteStation, listProjects, listStations, orderStations, updateProject, updateStation,
  type Project, type ProjectState, type Station,
} from '../../dashboard/api'
import { PROJECT_STATE_LABEL } from '../../dashboard/status'
import { pickDrawing, useDrawings } from '../../drawing/useDrawings'
import { listPlacements } from '../../objects/api'
import { parseProjectForm, parseStationForm, projectForm, stationForm, type ProjectForm, type StationForm } from './stationForm'

type Dialog =
  | { kind: 'station'; s: Station | null }
  | { kind: 'project'; p: Project | null }
  | { kind: 'deleteStation'; s: Station }
  | { kind: 'deleteProject'; p: Project }
  | null
interface Data { id: number; stations: Station[]; projects: Project[]; placements: string[] }

const STATES = Object.keys(PROJECT_STATE_LABEL) as ProjectState[]
const ICON_BTN = 'kp-btn kp-btn-stroke kp-btn-xs'
const taktMinutes = (sec: number) => Math.round(sec / 6) / 10

/** 관리자 › 공정·생산 기준정보: 도면별 PJT · 공정(순서 = 칩 번호). 저장하면 상황판이 그 도면을 처음부터 */
export function StationsPage() {
  const [params, setParams] = useSearchParams()
  const [drawings] = useDrawings()
  const list = drawings.kind === 'ok' ? drawings.list : []
  const asked = Number(params.get('drawing'))
  const drawingId = pickDrawing(list, Number.isInteger(asked) && asked > 0 ? asked : null)
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [sf, setSf] = useState<StationForm>(() => stationForm(null))
  const [pf, setPf] = useState<ProjectForm>(() => projectForm(null))
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (drawingId == null) return
    let cancel = false
    Promise.all([listStations(drawingId), listProjects(drawingId), listPlacements(drawingId)])
      .then(([stations, projects, placements]) => {
        if (cancel) return
        setData({ id: drawingId, stations, projects, placements: placements.map((p) => p.name) })
        setError(null)
      })
      .catch((e: Error) => !cancel && setError(e.message))
    return () => {
      cancel = true
    }
  }, [drawingId, tick])
  const reload = () => setTick((n) => n + 1)
  const cur = data && data.id === drawingId ? data : null
  const projectName = (id: number | null) => cur?.projects.find((p) => p.id === id)?.name ?? '—'

  const open = (d: Dialog) => {
    setDialogError(null)
    if (d?.kind === 'station') setSf(stationForm(d.s))
    if (d?.kind === 'project') setPf(projectForm(d.p))
    setDialog(d)
  }
  /** 실패하면 창을 열어 둔 채 창 안에 오류 */
  const run = async (f: () => Promise<unknown>) => {
    setDialogError(null)
    setBusy(true)
    try {
      await f()
      setDialog(null)
      reload()
    } catch (e) {
      setDialogError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const saveStation = (e: FormEvent) => {
    e.preventDefault()
    if (dialog?.kind !== 'station' || drawingId == null) return
    const r = parseStationForm(sf)
    if ('error' in r) return setDialogError(r.error)
    const s = dialog.s
    void run(() => (s ? updateStation(s.id, r.input) : createStation(drawingId, r.input)))
  }
  const saveProject = (e: FormEvent) => {
    e.preventDefault()
    if (dialog?.kind !== 'project' || drawingId == null) return
    const r = parseProjectForm(pf)
    if ('error' in r) return setDialogError(r.error)
    const p = dialog.p
    void run(() => (p ? updateProject(p.id, r.input) : createProject(drawingId, r.input)))
  }
  const move = (i: number, d: -1 | 1) => {
    if (!cur || drawingId == null) return
    const ids = cur.stations.map((s) => s.id)
    ;[ids[i], ids[i + d]] = [ids[i + d], ids[i]]
    orderStations(drawingId, ids).then(reload).catch((e: Error) => setError(e.message))
  }
  const placementOptions = cur
    ? [...new Set([...cur.placements, ...(sf.placementName ? [sf.placementName] : [])])].sort((a, b) => a.localeCompare(b, 'ko'))
    : []

  return (
    <section className="kp-card kp-section" aria-label="공정·생산 기준정보">
      <div className="kp-section-head">
        <div>
          <h2>공정·생산 기준정보</h2>
          <p className="kp-desc">상황판에 쓰는 PJT(제작 현황)와 공정(스테이션)을 도면마다 정합니다. 공정 순서가 칩 번호입니다.</p>
        </div>
      </div>
      <div className="kp-filter">
        <label className="kp-field">
          <span>도면</span>
          <select className="kp-input" aria-label="도면" value={drawingId ?? ''} disabled={list.length === 0} onChange={(e) => setParams({ drawing: e.target.value })}>
            {list.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
      </div>
      {error && <p className="kp-error-text" role="alert">{error}</p>}
      {!cur ? (
        <p className="kp-desc">{drawings.kind === 'ok' && list.length === 0 ? '등록된 도면이 없습니다.' : '불러오는 중…'}</p>
      ) : (
        <>
          <div className="kp-section-head">
            <h3>PJT (제작 현황)</h3>
            <button className="kp-btn kp-btn-stroke kp-btn-sm" onClick={() => open({ kind: 'project', p: null })}>
              <Plus size={14} aria-hidden />
              PJT 추가
            </button>
          </div>
          {cur.projects.length === 0 ? (
            <p className="kp-desc">PJT 가 없습니다.</p>
          ) : (
            <table className="kp-table">
              <thead>
                <tr><th>이름</th><th>제작</th><th>기간</th><th>상태</th><th>관리</th></tr>
              </thead>
              <tbody>
                {cur.projects.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td className="num">{`${p.done}/${p.total}`}</td>
                    <td>{p.period ?? ''}</td>
                    <td>{PROJECT_STATE_LABEL[p.state]}</td>
                    <td className="actions">
                      <button className={ICON_BTN} aria-label={`PJT ${p.name} 수정`} onClick={() => open({ kind: 'project', p })}>
                        <Pencil size={14} aria-hidden />
                      </button>
                      <button className="kp-btn kp-btn-danger kp-btn-xs" aria-label={`PJT ${p.name} 삭제`} onClick={() => open({ kind: 'deleteProject', p })}>
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="kp-section-head">
            <h3>공정</h3>
            <button className="kp-btn kp-btn-stroke kp-btn-sm" onClick={() => open({ kind: 'station', s: null })}>
              <Plus size={14} aria-hidden />
              공정 추가
            </button>
          </div>
          {cur.stations.length === 0 ? (
            <p className="kp-desc">공정이 없습니다. 공정을 추가하면 상황판에 표시됩니다.</p>
          ) : (
            <table className="kp-table">
              <thead>
                <tr><th>번호</th><th>이름</th><th>연결 설비</th><th>step 수</th><th>택타임(분)</th><th>주의/지연(%p)</th><th>PJT</th><th>관리</th></tr>
              </thead>
              <tbody>
                {cur.stations.map((s, i) => (
                  <tr key={s.id}>
                    <td className="num">{s.no}</td>
                    <td>{s.name}</td>
                    <td>
                      {s.placementName ?? '—'}
                      {s.placementName && !cur.placements.includes(s.placementName) && <span className="kp-help"> (도면에 없음)</span>}
                    </td>
                    <td className="num">{s.steps.length}</td>
                    <td className="num">{taktMinutes(s.taktSec)}</td>
                    <td className="num">{`${s.warnPp} / ${s.delayPp}`}</td>
                    <td>{projectName(s.projectId)}</td>
                    <td className="actions">
                      <button className={ICON_BTN} aria-label={`${s.name} 위로`} disabled={i === 0} onClick={() => move(i, -1)}>
                        <ArrowUp size={14} aria-hidden />
                      </button>
                      <button className={ICON_BTN} aria-label={`${s.name} 아래로`} disabled={i === cur.stations.length - 1} onClick={() => move(i, 1)}>
                        <ArrowDown size={14} aria-hidden />
                      </button>
                      <button className={ICON_BTN} aria-label={`${s.name} 수정`} onClick={() => open({ kind: 'station', s })}>
                        <Pencil size={14} aria-hidden />
                      </button>
                      <button className="kp-btn kp-btn-danger kp-btn-xs" aria-label={`${s.name} 삭제`} onClick={() => open({ kind: 'deleteStation', s })}>
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {dialog?.kind === 'station' && cur && (
        <Modal title={dialog.s ? '공정 수정' : '공정 추가'} onClose={() => setDialog(null)}>
          <form className="kp-form" onSubmit={saveStation}>
            <label className="kp-field">
              <span>이름</span>
              <input className="kp-input" value={sf.name} maxLength={100} autoFocus onChange={(e) => setSf({ ...sf, name: e.target.value })} />
            </label>
            <label className="kp-field">
              <span>연결 설비</span>
              <select className="kp-input" value={sf.placementName} onChange={(e) => setSf({ ...sf, placementName: e.target.value })}>
                <option value="">없음</option>
                {placementOptions.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label className="kp-field">
              <span>PJT</span>
              <select className="kp-input" value={sf.projectId} onChange={(e) => setSf({ ...sf, projectId: e.target.value })}>
                <option value="">없음</option>
                {cur.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="kp-check">
              <input type="checkbox" checked={sf.countsProject} onChange={(e) => setSf({ ...sf, countsProject: e.target.checked })} />
              완료 시 PJT 제작 수에 셈
            </label>
            <label className="kp-field">
              <span>step (한 줄에 하나)</span>
              <textarea className="kp-input" rows={6} style={{ height: 'auto', paddingTop: 8, paddingBottom: 8 }} value={sf.steps} onChange={(e) => setSf({ ...sf, steps: e.target.value })} />
            </label>
            <label className="kp-field">
              <span>택타임(분)</span>
              <input className="kp-input" type="number" min={1} max={10080} value={sf.taktMin} onChange={(e) => setSf({ ...sf, taktMin: e.target.value })} />
            </label>
            <label className="kp-field">
              <span>주의 기준(%p)</span>
              <input className="kp-input" type="number" min={0} max={99} value={sf.warnPp} onChange={(e) => setSf({ ...sf, warnPp: e.target.value })} />
            </label>
            <label className="kp-field">
              <span>지연 기준(%p)</span>
              <input className="kp-input" type="number" min={1} max={100} value={sf.delayPp} onChange={(e) => setSf({ ...sf, delayPp: e.target.value })} />
            </label>
            <label className="kp-field">
              <span>입고 자재</span>
              <input className="kp-input" value={sf.materials} placeholder="쉼표로 구분" onChange={(e) => setSf({ ...sf, materials: e.target.value })} />
            </label>
            {dialogError && <p className="kp-error-text" role="alert">{dialogError}</p>}
            <p className="kp-help">저장하면 상황판이 이 도면을 처음부터 다시 진행합니다.</p>
            <div className="kp-modal-actions">
              <button type="button" className="kp-btn kp-btn-stroke" onClick={() => setDialog(null)}>취소</button>
              <button type="submit" className="kp-btn kp-btn-primary" disabled={busy}>저장</button>
            </div>
          </form>
        </Modal>
      )}
      {dialog?.kind === 'project' && (
        <Modal title={dialog.p ? 'PJT 수정' : 'PJT 추가'} onClose={() => setDialog(null)}>
          <form className="kp-form" onSubmit={saveProject}>
            <label className="kp-field">
              <span>이름</span>
              <input className="kp-input" value={pf.name} maxLength={100} autoFocus onChange={(e) => setPf({ ...pf, name: e.target.value })} />
            </label>
            <label className="kp-field">
              <span>제작</span>
              <input className="kp-input" type="number" min={0} value={pf.done} onChange={(e) => setPf({ ...pf, done: e.target.value })} />
            </label>
            <label className="kp-field">
              <span>전체</span>
              <input className="kp-input" type="number" min={1} value={pf.total} onChange={(e) => setPf({ ...pf, total: e.target.value })} />
            </label>
            <label className="kp-field">
              <span>기간</span>
              <input className="kp-input" value={pf.period} maxLength={40} placeholder="'25.09~'27.03" onChange={(e) => setPf({ ...pf, period: e.target.value })} />
            </label>
            <label className="kp-field">
              <span>상태</span>
              <select className="kp-input" value={pf.state} onChange={(e) => setPf({ ...pf, state: e.target.value as ProjectState })}>
                {STATES.map((s) => <option key={s} value={s}>{PROJECT_STATE_LABEL[s]}</option>)}
              </select>
            </label>
            {dialogError && <p className="kp-error-text" role="alert">{dialogError}</p>}
            <p className="kp-help">저장하면 상황판이 이 도면을 처음부터 다시 진행합니다.</p>
            <div className="kp-modal-actions">
              <button type="button" className="kp-btn kp-btn-stroke" onClick={() => setDialog(null)}>취소</button>
              <button type="submit" className="kp-btn kp-btn-primary" disabled={busy}>저장</button>
            </div>
          </form>
        </Modal>
      )}
      {dialog?.kind === 'deleteStation' && (
        <Modal title="공정 삭제" onClose={() => setDialog(null)}>
          <p className="kp-desc">{`'${dialog.s.name}' 공정을 삭제합니다. 뒤 공정의 번호는 하나씩 당겨집니다.`}</p>
          {dialogError && <p className="kp-error-text" role="alert">{dialogError}</p>}
          <div className="kp-modal-actions">
            <button type="button" className="kp-btn kp-btn-stroke" onClick={() => setDialog(null)}>취소</button>
            <button type="button" className="kp-btn kp-btn-danger-fill" disabled={busy} onClick={() => run(() => deleteStation(dialog.s.id))}>삭제</button>
          </div>
        </Modal>
      )}
      {dialog?.kind === 'deleteProject' && (
        <Modal title="PJT 삭제" onClose={() => setDialog(null)}>
          <p className="kp-desc">{`'${dialog.p.name}' PJT 를 삭제합니다. 이 PJT 를 쓰던 공정은 PJT 없음이 됩니다.`}</p>
          {dialogError && <p className="kp-error-text" role="alert">{dialogError}</p>}
          <div className="kp-modal-actions">
            <button type="button" className="kp-btn kp-btn-stroke" onClick={() => setDialog(null)}>취소</button>
            <button type="button" className="kp-btn kp-btn-danger-fill" disabled={busy} onClick={() => run(() => deleteProject(dialog.p.id))}>삭제</button>
          </div>
        </Modal>
      )}
    </section>
  )
}
```

`web/src/pages/admin/AdminLayout.tsx` — `<NavLink to="/admin/models">객체관리</NavLink>` 아래에:
```tsx
          <NavLink to="/admin/stations">공정·생산 기준정보</NavLink>
```

`web/src/routes.tsx` — import `import { StationsPage } from './pages/admin/StationsPage'` 추가, admin children 의 `{ path: 'models', element: <ModelsPage /> },` 아래에:
```tsx
      { path: 'stations', element: <StationsPage /> },
```

- [ ] **Step 4: 통과 확인**

Run: `cd /c/kopens/project/Factory3D/web && npx vitest run && npm run build && ./node_modules/.bin/oxlint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /c/kopens/project/Factory3D && git add web
git commit -m "feat(web): 관리자 공정·생산 기준정보 — PJT·공정 표·추가·수정·삭제·순서·창 안 검사 오류

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: 실제 화면 확인 (jar · Edge, 진행 배율 30) + README

**Files:**
- Create: `web/e2e/p4-smoke.mjs`
- Modify: `README.md`, (필요 시) 이전 smoke 스크립트 선택자

**Interfaces:**
- Consumes: 전부. P1~P3 smoke 실행 방식(깨끗한 DB → jar → `p1-smoke.mjs` → `p2-smoke.mjs` → `p3-smoke.mjs`), 그 다음 `p4-smoke.mjs`.

- [ ] **Step 1: 확인 스크립트 `web/e2e/p4-smoke.mjs`**

```js
// P4 실제 화면 확인 (Edge): 상황판 6칩·KPI · 실적 변화 · 칩 클릭 이동 · 서랍 · 기준정보 택타임 수정 → 상황판 반영 · 3D 공장 회귀.
// 서버는 F3D_LIVE_TIME_SCALE=30 으로 띄울 것 (1초에 가상 30초). 스크린샷 e2e/shots/p4-*
// 사용: node e2e/p4-smoke.mjs <주소> <아이디> <비밀번호>   (P3 smoke 다음에)
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const [base = 'http://localhost:8080', id = 'admin', pw = 'Factory3d1!'] = process.argv.slice(2)
mkdirSync('e2e/shots', { recursive: true })
const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const fail = (msg) => {
  console.error('실패:', msg)
  process.exitCode = 1
}
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(e.message))
page.on('console', (m) => m.type() === 'error' && pageErrors.push(m.text()))
const shot = (name) => page.screenshot({ path: `e2e/shots/${name}.png` })
const chips = page.locator('.chip-layer .dlabel')
const chip = (name) => chips.filter({ hasText: name }).first()
const pctOf = async (name) => Number(((await chip(name).locator('.pct').textContent()) ?? '').replace('%', ''))
const drawer = page.getByRole('complementary', { name: '제작·자재 현황' })

/** 상황판에서 나셀 공장을 고르고 칩 6개 · LIVE 까지 기다림 */
async function readyDashboard() {
  const select = page.getByRole('combobox', { name: '도면 선택' })
  await select.waitFor()
  if ((await select.locator('option:checked').textContent()) !== '나셀 공장') await select.selectOption({ label: '나셀 공장' })
  await page.locator('.live-badge', { hasText: 'LIVE' }).waitFor({ timeout: 15000 })
  await chips.nth(5).waitFor({ state: 'attached', timeout: 20000 })
}

/** 관리자 › 공정·생산 기준정보에서 공정 택타임(분) 바꾸기 */
async function setTakt(name, minutes) {
  await page.goto(base + '/admin/stations')
  await page.getByRole('heading', { name: '공정·생산 기준정보' }).waitFor()
  await page.getByRole('button', { name: `${name} 수정` }).click()
  await page.getByLabel('택타임(분)').fill(String(minutes))
  await page.getByRole('button', { name: '저장' }).click()
  await page.getByRole('dialog').waitFor({ state: 'detached' })
  await page.locator('table.kp-table tbody tr', { hasText: name }).first().locator('td', { hasText: new RegExp(`^${minutes}$`) }).waitFor()
}

try {
  await page.goto(base + '/login')
  await page.getByLabel('아이디').fill(id)
  await page.getByLabel('비밀번호').fill(pw)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL((u) => u.pathname === '/')

  // 1. 레일 › 상황판: 칩 6개 · KPI '6 가동'
  await page.getByRole('button', { name: '상황판' }).click()
  await page.waitForURL((u) => u.pathname === '/dashboard')
  await readyDashboard()
  const n = await chips.count()
  if (n !== 6) fail(`칩 ${n}개 (기대 6)`)
  const kpi = (await page.locator('.dash-bar').textContent()) ?? ''
  if (!kpi.includes('6가동')) fail(`KPI 줄: ${kpi}`)
  await page.waitForTimeout(8000) // 모델 내려받기·전체 보기 이동 (headless 는 소프트웨어 WebGL)
  await shot('p4-1-dashboard')

  // 2. 몇 초 뒤 실적 값이 바뀜 (배율 30 → 1초에 약 2.5%)
  const names = ['Main Station 1', 'Main Station 2', 'Hub 조립장']
  const before = await Promise.all(names.map(pctOf))
  await page.waitForTimeout(5000)
  const after = await Promise.all(names.map(pctOf))
  if (before.every((v, i) => v === after[i])) fail(`실적이 그대로: ${before} → ${after}`)
  console.log(`실적 ${before.join('/')} → ${after.join('/')}`)
  await shot('p4-2-progress')

  // 3. 칩 클릭 → 그 설비로 이동(선택), 다시 → 전체 보기
  await chip('Main Station 1').click()
  await page.waitForTimeout(1500)
  if ((await page.locator('.chip-layer .dlabel.sel').count()) !== 1) fail('칩 선택 표시 없음')
  await shot('p4-3-focus')
  await chip('Main Station 1').click()
  await page.waitForTimeout(1000)
  if ((await page.locator('.chip-layer .dlabel.sel').count()) !== 0) fail('같은 칩을 다시 눌러도 선택이 남음')

  // 4. 제작·자재 서랍
  await page.getByRole('button', { name: /제작·자재 현황/ }).click()
  await drawer.waitFor()
  const pjtRows = await drawer.locator('tbody tr').count()
  if (pjtRows !== 4) fail(`제작 현황 ${pjtRows}행 (기대 4)`)
  await page.waitForTimeout(500)
  await shot('p4-4-drawer')

  // 5. 기준정보: Hub 조립장 택타임 20 → 5분. 다시 올리면 Hub 는 60% 부터 1초에 약 7~10% → 10초 안에 한 대 완료
  //    (20분 그대로라면 같은 60% 에서 15초 넘게 걸림)
  await setTakt('Hub 조립장', 5)
  await shot('p4-5-admin-stations')
  await page.goto(base + '/dashboard')
  await readyDashboard()
  await page.getByRole('button', { name: /제작·자재 현황/ }).click()
  await drawer.waitFor()
  await drawer.getByText('Hub 조립장 1대 조립 완료').first().waitFor({ timeout: 10000 })
    .catch(() => fail('택타임 5분으로 바꾼 뒤 10초 안에 Hub 조립장 완료 이벤트가 없음'))
  await shot('p4-6-takt-applied')
  await setTakt('Hub 조립장', 20) // 되돌림

  // 6. 3D 공장 화면 회귀 (P3 smoke 뒤라 배치 81개)
  await page.goto(base + '/')
  await page.locator('.factory-view canvas').waitFor()
  const rows = page.locator('ul.placement-list > li')
  await rows.nth(78).waitFor({ timeout: 15000 }).catch(() => {})
  const count = await rows.count()
  if (count < 79) fail(`3D 공장 객체 목록 ${count}개 (79 이상 기대)`)
  await page.waitForTimeout(4000)
  await shot('p4-7-factory-regression')
} catch (e) {
  fail(e.message)
} finally {
  await browser.close()
}
if (pageErrors.length) console.log('브라우저 오류:\n  ' + pageErrors.join('\n  '))
console.log(process.exitCode ? 'P4 화면 확인 실패' : 'P4 화면 확인 통과')
```

- [ ] **Step 2: 실행**

깨끗한 DB·데이터 폴더 → jar → 서버(진행 배율 30) → P1~P4 smoke:
```bash
cd /c/kopens/project/Factory3D
"/c/Program Files/PostgreSQL/17/bin/psql.exe" -h localhost -p 5433 -U postgres -c "drop database if exists factory3d" -c "create database factory3d owner factory3d encoding 'UTF8' template template0"
rm -rf data
cd server && ./gradlew bootJar
JAVA21="$(ls -d ~/.gradle/jdks/*21*/ | head -1)bin/java"
F3D_ADMIN_PASSWORD=Start1234 F3D_DATA_DIR=/c/kopens/project/Factory3D/data F3D_LIVE_TIME_SCALE=30 "$JAVA21" -jar build/libs/factory3d.jar > "$TEMP/f3d-server.log" 2>&1 &
until curl -sf http://localhost:8080/api/health > /dev/null; do sleep 1; done
cd ../web
node e2e/p1-smoke.mjs http://localhost:8080 Start1234 Factory3d1!
node e2e/p2-smoke.mjs http://localhost:8080 admin Factory3d1!
node e2e/p3-smoke.mjs http://localhost:8080 admin Factory3d1!
node e2e/p4-smoke.mjs http://localhost:8080 admin Factory3d1!
```
Expected: 네 스크립트 모두 `… 화면 확인 통과`. 서버 로그(`$TEMP/f3d-server.log`)에 `나셀 공장에 기본 공정 6개 · PJT 4개를 넣었습니다`, `상황판: 공정이 있는 도면 1개를 올렸습니다 (진행 배율 30.0)`.
(`until … sleep 1` 이 막히면 Monitor 로 `/api/health` 를 기다림. 앞 smoke 가 상황판 레일 버튼을 `준비 중` 으로 기대하면 그 선택자만 고친다.)

- [ ] **Step 3: 스크린샷 눈으로 확인**

`web/e2e/shots/p4-1` ~ `p4-7` 을 Read 로 열어 보고서에 적는다: 칩 6개가 각 설비(Hub·Main Station 1~3·Sub 2곳) 위에 겹치지 않고 꼬리·선이 설비 쪽을 가리키는지, KPI 줄(`6 가동`·상태별 색), 바닥 링 색이 칩 상태와 같은지, 게이지 막대(목표 막대가 길고 흰색), 선택한 칩의 파란 테두리와 카메라 이동, 서랍 표 4행, 관리자 공정 표, 3D 공장 화면이 P3 와 같은지. 깨져 보이면(칩이 화면 왼쪽 위에 몰림, 링이 설비와 어긋남, 카메라가 공장 밖) 원인을 찾아 해당 Task 파일을 고치고 테스트·smoke 를 다시 돌린다. 판단 문제(조금 어둡다 등)는 코드 그대로 두고 적는다. 끝나면 서버를 반드시 종료한다 (`netstat -ano | grep ':8080 .*LISTENING'` 의 PID → `taskkill //PID <pid> //F`).

- [ ] **Step 4: README**

`README.md` 의 `### 객체` 단락 아래에:
```
### 상황판
- 레일 `상황판`: 도면별 공정 현황 — 위 KPI 줄(가동·진행중·주의·지연·오늘 완료·계획 달성률), 설비 위 스테이션 칩(PJT·step·눈금 게이지·실적/목표), 바닥 상태 링, 아래 이벤트 줄, `제작·자재 현황` 서랍. 칩을 누르면 그 설비로 이동, 다시 누르면 전체 보기.
- 데이터는 서버의 가상 MES 가 1초마다 만듭니다 (모든 사용자가 같은 숫자, WebSocket `/ws/live`). 진행 상태는 메모리라 서버를 다시 켜면 처음 값부터, PJT 제작 수·오늘 완료 수는 DB 에 남습니다.
- 처음 실행하면 나셀 공장에 기본 공정 6개 · PJT 4개가 들어갑니다. 관리자 › 공정·생산 기준정보에서 고치면 상황판이 그 도면을 처음부터 다시 진행합니다.
- 진행 속도는 `F3D_LIVE_TIME_SCALE` (기본 1 = 실제 시간, 화면 확인은 30).
```
`## 배포` 의 환경 변수 표에 두 줄 추가:
```
| `F3D_LIVE_TIME_SCALE` | `1` (상황판 진행 배율) |
| `F3D_LIVE_ORIGINS` | `http://localhost:5200` (WebSocket 허용 출처, 같은 출처는 항상 허용) |
```
`## 테스트` 블록에:
```
cd web && node e2e/p4-smoke.mjs http://localhost:8080 admin <비밀번호>   # P3 smoke 다음에, 서버는 F3D_LIVE_TIME_SCALE=30 으로: 상황판·기준정보
```

- [ ] **Step 5: Commit**

```bash
cd /c/kopens/project/Factory3D && git add README.md web/e2e/p4-smoke.mjs
git commit -m "chore: P4 실제 화면 확인 스크립트 · README 상황판 안내

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
(Step 3 에서 고친 코드가 있으면 함께 커밋하고 메시지에 적는다.)

---

## 참고: spec 에서 채우거나 정한 부분

- `/ws/**` 는 `authenticated` 대신 `hasRole("VIEWER")` — 비밀번호 변경 전 세션(권한 `PASSWORD_CHANGE`)은 막음 (상황판 보기 = 조회 이상).
- 오늘 완료 +1 은 모든 한 대 완료에 (demo `DASH.done++`), PJT 제작 수 +1 은 `counts_project` 공정만.
- `step_start`·`step_done` 은 보내기만 하고 최근 50개·snapshot 에 보관하지 않음 (너무 잦아 다른 이벤트를 밀어냄). 화면 reducer 도 버림.
- 나셀 공장 시작 실적/목표(`startActual`/`startTarget`)는 처음 올릴 때와 reload 때 모두 씀 (reload = 처음부터).
- 화면 연결 상태에 `closed`(4404) 를 더함 — `도면을 찾을 수 없습니다.` 표시.
- 기준정보 저장 → `StationsChanged`, 도면 삭제 → `DrawingDeleted` 이벤트를 커밋 뒤(`@TransactionalEventListener`) VirtualMes 가 받음 (패키지 순환 없이 reload·내림).
- 1초 진행은 `LiveScheduler`(`factory3d.live.enabled`, 테스트는 false) 가 `tick()` 을 부르고, 테스트는 `advance(dt)` 를 직접 부름. 시계·배율은 패키지 전용 setter 로 바꿈.
- 공정 PATCH 에서 연결 설비·PJT 비우기는 `clearPlacement`·`clearProject` (P3 배치의 `clearModel` 과 같은 방식).
