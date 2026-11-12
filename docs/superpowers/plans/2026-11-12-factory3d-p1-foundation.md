# Factory3D P1 기반 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Factory3D 의 서버·DB·화면 뼈대를 만들고, 로그인·권한·로그인 이력·관리자 화면과 메인 레이아웃(왼쪽 레일 + 도면 select)을 동작시킨다.

**Architecture:** `server/` 는 Spring Boot + MyBatis + PostgreSQL(Flyway), `web/` 는 React + Vite + TS. 로그인·권한·감사·사용자 관리는 `C:\kopens\project\3D_WEB` 에서 파일을 **복사 후 이름만 바꿔** 재사용하고, 새로 필요한 것(로그인 이력, 도면 목록 API, 레이아웃, 관리자 화면 구성)만 새로 쓴다. Docker 없이 로컬 PostgreSQL 17(포트 5433)을 쓴다.

**Tech Stack:** Java 21(toolchain, Gradle foojay 자동 다운로드) · Spring Boot 4.1.1 · MyBatis 4.1.0 · Flyway · Spring Security + Spring Session JDBC · PostgreSQL 17 · React 19 · react-router 7 · Vite 8 · TypeScript 6 · vitest 4 · lucide-react · Playwright(Edge)

**Spec:** `docs/superpowers/specs/2026-11-12-factory3d-platform-design.md` (§2 폴더, §4.3 DB, §5.8 관리자, §5.9 권한, §8 P1)

## Global Constraints

- 프로젝트 루트: `C:\kopens\project\Factory3D`. 원본 `C:\kopens\project\3D_WEB`, `C:\kopens\project\demo` 는 **수정 금지** (읽고 복사만).
- Docker 사용 금지. Testcontainers 사용 금지. DB 는 로컬 PostgreSQL 17 `localhost:5433`.
- 개발 DB `factory3d`(계정 factory3d/factory3d), 테스트 DB `factory3d_test`(계정 factory3d_test/factory3d_test).
- 이름 규칙: Java 패키지 `com.kopens.factory3d`, 설정 접두사 `factory3d.`, 환경 변수 접두사 `F3D_`, 세션 쿠키 `F3D_SESSION`, 화면 이벤트 `f3d:unauthorized`, localStorage 접두사 `f3d:`.
- 역할: ADMIN ⊃ OPERATOR ⊃ VIEWER. 화면 표기 관리자/운전원/조회.
- 모든 사용자 문구·오류는 한국어.
- UI: `border-left` 강조선 금지, 이모지 금지(아이콘은 lucide-react), 라벨 약 13~15px.
- 서버 개발 포트 8080, 화면 개발 포트 5200.
- 각 Task 끝에 커밋. 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## 파일 구조 (이번 단계 끝 모습)

```
Factory3D/
├─ .gitignore
├─ README.md
├─ scripts/setup-db.sql                 개발·테스트 DB와 계정 생성
├─ server/
│  ├─ build.gradle · settings.gradle · gradlew · gradlew.bat · gradle/wrapper/*
│  └─ src/
│     ├─ main/java/com/kopens/factory3d/
│     │  ├─ Factory3dApplication.java
│     │  ├─ common/   ApiExceptionHandler · *Exception · HealthController · SecurityConfig · SpaConfig
│     │  ├─ auth/     (3D_WEB 복사) AdminBootstrap · AppUser · AuthController · AuthService · PasswordPolicy · Role · F3dUser · UserMapper · UserView
│     │  ├─ audit/    (3D_WEB 복사) AuditController · AuditEntry · AuditMapper · AuditService
│     │  ├─ user/     (3D_WEB 복사) UserController · UserService
│     │  ├─ loginhistory/  LoginEvent · LoginHistoryMapper · LoginHistoryService · LoginHistoryController   (새로)
│     │  └─ drawing/  DrawingSummary · DrawingMapper · DrawingController   (새로, 목록만)
│     ├─ main/resources/ application.yml · db/migration/V1__auth.sql · V2__drawing.sql · V3__login_history.sql · mapper/*.xml
│     └─ test/java/com/kopens/factory3d/ support/IntegrationTest · common/CommonWebTest · auth/AuthApiTest · auth/AccessTest · user/UserApiTest · drawing/DrawingApiTest · loginhistory/LoginHistoryApiTest
└─ web/
   ├─ package.json · vite.config.ts · tsconfig*.json · .oxlintrc.json · index.html · public/favicon.svg
   ├─ e2e/p1-smoke.mjs
   └─ src/
      ├─ main.tsx · routes.tsx · test-setup.ts
      ├─ styles/ tokens.css · kp.css · auth.css (3D_WEB 복사) · app.css (새로)
      ├─ api/    client.ts · client.test.ts (복사) · types.ts (새로)
      ├─ auth/   auth.tsx · context.ts · RequireAuth.tsx (복사)
      ├─ layout/ IconRail.tsx · AppShell.tsx · DrawingBar.tsx · layout.test.tsx (새로)
      ├─ drawing/ useDrawings.ts · useDrawings.test.ts (새로)
      ├─ components/ Modal.tsx · UserMenu.tsx (복사)
      └─ pages/  AuthScene · LoginPage · PasswordPage · ErrorPage · ErrorPage.test (복사) · FactoryPage (새로)
                 admin/ AdminLayout · UsersPage(복사) · AuditPage(복사) · format.ts(복사) · LoginHistoryPage · historyQuery.ts · historyQuery.test.ts · admin.test.tsx (새로)
```

---

### Task 1: DB 준비 + 서버 뼈대

**Files:**
- Create: `.gitignore`, `scripts/setup-db.sql`
- Create: `server/settings.gradle`, `server/build.gradle`, `server/gradlew`, `server/gradlew.bat`, `server/gradle/wrapper/*` (복사)
- Create: `server/src/main/java/com/kopens/factory3d/Factory3dApplication.java`
- Create: `server/src/main/java/com/kopens/factory3d/common/{HealthController,SpaConfig,ApiExceptionHandler,BadRequestException,ConflictException,LockedException,NotFoundException,UnauthorizedException}.java` (복사)
- Create: `server/src/main/resources/application.yml`
- Test: `server/src/test/java/com/kopens/factory3d/support/IntegrationTest.java`, `server/src/test/java/com/kopens/factory3d/common/CommonWebTest.java`, `server/src/test/resources/static/index.html` (복사)

**Interfaces:**
- Produces: `IntegrationTest` (추상 클래스, 필드 `protected MockMvc mvc`, `protected JdbcTemplate jdbc`, `protected static Path dataDir`). 매 테스트 전 public 스키마의 모든 표(flyway 이력 제외)를 비움.
- Produces: 설정 `factory3d.data-dir`, `factory3d.time-zone`(기본 `Asia/Seoul`).

- [ ] **Step 1: `.gitignore` 와 DB 생성 스크립트 작성**

`C:\kopens\project\Factory3D\.gitignore`:
```
node_modules/
dist/
build/
.gradle/
data/
*.log
web/e2e/shots/
```

`C:\kopens\project\Factory3D\scripts\setup-db.sql`:
```sql
-- 로컬 PostgreSQL 17 (localhost:5433) 에 postgres 계정으로 한 번 실행
create role factory3d login password 'factory3d';
create database factory3d owner factory3d encoding 'UTF8' template template0;
create role factory3d_test login password 'factory3d_test';
create database factory3d_test owner factory3d_test encoding 'UTF8' template template0;
```

- [ ] **Step 2: DB 생성 (사용자가 직접 실행 — postgres 비밀번호 필요)**

사용자에게 다음을 Claude Code 입력창에서 실행하도록 요청한다 (`!` 접두사):
```
! "C:\Program Files\PostgreSQL\17\bin\psql.exe" -h localhost -p 5433 -U postgres -f C:\kopens\project\Factory3D\scripts\setup-db.sql
```
Expected: `CREATE ROLE` / `CREATE DATABASE` 4줄. 이미 있다는 오류(`already exists`)는 무시해도 됨.

확인:
```bash
PGPASSWORD=factory3d_test "/c/Program Files/PostgreSQL/17/bin/psql.exe" -h localhost -p 5433 -U factory3d_test -d factory3d_test -c "select 1"
```
Expected: `1` 한 줄.

- [ ] **Step 3: Gradle 래퍼 복사, 빌드 파일 작성**

```bash
cd /c/kopens/project/Factory3D && mkdir -p server/gradle/wrapper
cp ../3D_WEB/server/gradlew ../3D_WEB/server/gradlew.bat server/
cp ../3D_WEB/server/gradle/wrapper/gradle-wrapper.jar ../3D_WEB/server/gradle/wrapper/gradle-wrapper.properties server/gradle/wrapper/
```

`server/settings.gradle`:
```groovy
plugins {
    // JDK 21 이 없으면 자동으로 받아 씀 (개발 PC 는 Java 17)
    id 'org.gradle.toolchains.foojay-resolver-convention' version '1.0.0'
}
rootProject.name = 'factory3d-server'
```

`server/build.gradle`:
```groovy
plugins {
    id 'java'
    id 'org.springframework.boot' version '4.1.1'
    id 'io.spring.dependency-management' version '1.1.7'
}

group = 'com.kopens'
version = '0.1.0'

java {
    toolchain { languageVersion = JavaLanguageVersion.of(21) }
}

repositories { mavenCentral() }

dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-webmvc'
    implementation 'org.springframework.boot:spring-boot-starter-validation'
    implementation 'org.springframework.boot:spring-boot-starter-flyway'
    implementation 'org.mybatis.spring.boot:mybatis-spring-boot-starter:4.1.0'
    implementation 'org.flywaydb:flyway-database-postgresql'
    runtimeOnly 'org.postgresql:postgresql'

    testImplementation 'org.springframework.boot:spring-boot-starter-test'
    testImplementation 'org.springframework.boot:spring-boot-starter-webmvc-test'
    testRuntimeOnly 'org.junit.platform:junit-platform-launcher'
}

tasks.withType(JavaCompile).configureEach { options.encoding = 'UTF-8' }

tasks.named('test') { useJUnitPlatform() }

// 화면(web) 빌드 결과를 jar 의 static/ 에 넣음. 이미 빌드했으면 -PskipWebBuild
def isWindows = System.getProperty('os.name').toLowerCase().contains('windows')
tasks.register('buildWeb', Exec) {
    description = '화면(web) 빌드 → ../web/dist'
    workingDir file('../web')
    commandLine isWindows ? ['cmd', '/c', 'npm', 'run', 'build'] : ['npm', 'run', 'build']
    inputs.dir('../web/src')
    inputs.file('../web/index.html')
    inputs.file('../web/package.json')
    outputs.dir('../web/dist')
}

tasks.named('bootJar') {
    archiveFileName = 'factory3d.jar'
    if (!project.hasProperty('skipWebBuild')) dependsOn 'buildWeb'
    from('../web/dist') { into 'BOOT-INF/classes/static' }
}

tasks.named('jar') { enabled = false }
```

- [ ] **Step 4: 공통 클래스 복사 (패키지 이름 바꿈)**

```bash
cd /c/kopens/project/Factory3D/server
SRC=../../3D_WEB/server/src/main/java/com/kopens/twin
DST=src/main/java/com/kopens/factory3d
mkdir -p $DST/common
for f in HealthController SpaConfig ApiExceptionHandler BadRequestException ConflictException LockedException NotFoundException UnauthorizedException; do
  sed -e 's/com\.kopens\.twin/com.kopens.factory3d/g' $SRC/common/$f.java > $DST/common/$f.java
done
mkdir -p src/test/resources/static
cp ../../3D_WEB/server/src/test/resources/static/index.html src/test/resources/static/
```

`ApiExceptionHandler.java` 에서 설비 패키지 처리기를 지운다. 아래 블록(빈 줄 포함)을 삭제:
```java
    @ExceptionHandler(InvalidPackageException.class)
    ProblemDetail invalidPackage(InvalidPackageException e) {
        return problem(HttpStatus.BAD_REQUEST, "설비 패키지 오류", e.getMessage());
    }

```

`src/main/java/com/kopens/factory3d/Factory3dApplication.java`:
```java
package com.kopens.factory3d;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class Factory3dApplication {
    public static void main(String[] args) {
        SpringApplication.run(Factory3dApplication.class, args);
    }
}
```

`src/main/resources/application.yml`:
```yaml
spring:
  application:
    name: factory3d
  datasource:
    url: ${F3D_DB_URL:jdbc:postgresql://localhost:5433/factory3d}
    username: ${F3D_DB_USER:factory3d}
    password: ${F3D_DB_PASSWORD:factory3d}
  servlet:
    multipart:
      max-file-size: ${F3D_MAX_UPLOAD:200MB}
      max-request-size: ${F3D_MAX_UPLOAD:200MB}
  mvc:
    problemdetails:
      enabled: true
server:
  port: ${F3D_PORT:8080}
  error:
    whitelabel:
      enabled: false
mybatis:
  mapper-locations: classpath:mapper/*.xml
  configuration:
    map-underscore-to-camel-case: true
factory3d:
  # 업로드 파일 (도면 원본·3D 모델·썸네일). DB 에는 이 폴더 기준 상대 경로만
  data-dir: ${F3D_DATA_DIR:../data}
  time-zone: ${F3D_TIME_ZONE:Asia/Seoul}
```

- [ ] **Step 5: 테스트 바탕 클래스와 공통 웹 테스트 작성**

`src/test/java/com/kopens/factory3d/support/IntegrationTest.java`:
```java
package com.kopens.factory3d.support;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * 로컬 PostgreSQL 테스트 DB(factory3d_test) 위에서 앱 전체를 띄우는 테스트의 바탕. Docker 안 씀.
 * 다른 DB 를 쓰려면 F3D_TEST_DB_URL / F3D_TEST_DB_USER / F3D_TEST_DB_PASSWORD.
 * 시작할 때 public 스키마를 지우고 다시 만듦 — 테스트 전용 DB 만 가리킬 것!
 */
@SpringBootTest
@AutoConfigureMockMvc
public abstract class IntegrationTest {

    static final String URL = env("F3D_TEST_DB_URL", "jdbc:postgresql://localhost:5433/factory3d_test");
    static final String USER = env("F3D_TEST_DB_USER", "factory3d_test");
    static final String PASSWORD = env("F3D_TEST_DB_PASSWORD", "factory3d_test");
    protected static final Path dataDir;

    static {
        resetSchema();
        try {
            dataDir = Files.createTempDirectory("f3d-data-");
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String env(String name, String fallback) {
        String v = System.getenv(name);
        return v == null || v.isBlank() ? fallback : v;
    }

    /** 이전 실행이 남긴 표·마이그레이션 이력을 지워 Flyway 가 처음부터 돌게 함 */
    private static void resetSchema() {
        try (Connection c = DriverManager.getConnection(URL, USER, PASSWORD);
             Statement st = c.createStatement()) {
            st.execute("drop schema public cascade");
            st.execute("create schema public");
        } catch (SQLException e) {
            throw new IllegalStateException("테스트 DB(" + URL + ")를 비우지 못함 — scripts/setup-db.sql 을 실행했는지 확인", e);
        }
    }

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", () -> URL);
        r.add("spring.datasource.username", () -> USER);
        r.add("spring.datasource.password", () -> PASSWORD);
        r.add("factory3d.data-dir", dataDir::toString);
    }

    @Autowired protected MockMvc mvc;
    @Autowired protected JdbcTemplate jdbc;

    @BeforeEach
    void cleanDatabaseAndFiles() throws IOException {
        List<String> tables = jdbc.queryForList(
                "select tablename from pg_tables where schemaname = 'public' and tablename <> 'flyway_schema_history'",
                String.class);
        if (!tables.isEmpty()) jdbc.execute("truncate " + String.join(", ", tables) + " cascade");
        try (Stream<Path> files = Files.walk(dataDir)) {
            files.sorted(Comparator.reverseOrder()).filter(p -> !p.equals(dataDir)).forEach(p -> p.toFile().delete());
        }
    }
}
```

`src/test/java/com/kopens/factory3d/common/CommonWebTest.java`:
```java
package com.kopens.factory3d.common;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.kopens.factory3d.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

class CommonWebTest extends IntegrationTest {

    @Test
    void 상태_확인() throws Exception {
        mvc.perform(get("/api/health")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ok"));
    }

    @Test
    void 없는_API_주소는_ProblemDetail_404() throws Exception {
        mvc.perform(get("/api/no-such"))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(404));
    }

    @Test
    void 화면_주소는_새로고침해도_index_html() throws Exception {
        mvc.perform(get("/admin/users"))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("id=\"root\"")));
        mvc.perform(get("/아무-주소/깊은/곳"))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("id=\"root\"")));
    }
}
```

- [ ] **Step 6: 테스트 실행**

```bash
cd /c/kopens/project/Factory3D/server && ./gradlew test
```
Expected: `BUILD SUCCESSFUL`, CommonWebTest 3개 통과. (첫 실행은 JDK 21·의존성 다운로드로 수 분 걸릴 수 있음)

- [ ] **Step 7: Commit**

```bash
cd /c/kopens/project/Factory3D
git add .gitignore scripts server
git commit -m "feat(server): 서버 뼈대 · 로컬 PostgreSQL 테스트 바탕

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 로그인·권한·감사·사용자 관리 (3D_WEB 이식) + 도면 목록 API

**Files:**
- Modify: `server/build.gradle` (보안·세션·springdoc 의존성)
- Modify: `server/src/main/resources/application.yml` (세션·관리자 비밀번호)
- Create: `server/src/main/java/com/kopens/factory3d/{auth,audit,user}/*` (복사), `common/SecurityConfig.java` (복사 후 수정)
- Create: `server/src/main/resources/db/migration/V1__auth.sql`, `V2__drawing.sql`, `mapper/{UserMapper,AuditMapper,DrawingMapper}.xml`
- Create: `server/src/main/java/com/kopens/factory3d/drawing/{DrawingSummary,DrawingMapper,DrawingController}.java`
- Modify: `server/src/test/java/com/kopens/factory3d/common/CommonWebTest.java` (`@WithMockUser`)
- Test: `auth/AuthApiTest.java`, `user/UserApiTest.java` (복사), `auth/AccessTest.java`, `drawing/DrawingApiTest.java` (새로)

**Interfaces:**
- Consumes: `IntegrationTest` (Task 1)
- Produces: `AuditService.log(String action, String target, String detail)`, `AuditService.logAs(String username, ...)`
- Produces: `AuthService.authenticate(String username, String password): AppUser` — Task 3 이 수정
- Produces: `F3dUser(long id, String username, String displayName, Role role)` (세션 principal)
- Produces: REST `POST /api/auth/login|logout|password`, `GET /api/auth/me` → `UserView{id,username,displayName,role,enabled,mustChangePassword,locked,lastLoginAt,createdAt}`; `GET|POST /api/users`, `PATCH /api/users/{id}`, `POST /api/users/{id}/reset-password`, `DELETE /api/users/{id}`; `GET /api/audit?limit=`
- Produces: `GET /api/drawings` → `[{id:number, name:string, sourceType:'dxf'|'image', updatedAt:string}]` (VIEWER 이상)
- Produces: 권한 규칙 — `/api/health`·`/api/auth/login` 누구나, `/api/auth/**` 로그인, `/api/users/**`·`/api/audit/**`·`/api/admin/**` ADMIN, 그 밖의 `GET /api/**` VIEWER, 그 밖의 쓰기 `/api/**` OPERATOR

- [ ] **Step 1: 의존성·설정 추가**

`server/build.gradle` 의 `dependencies` 에서 `implementation 'org.flywaydb:flyway-database-postgresql'` 줄 바로 아래에 추가:
```groovy
    implementation 'org.springframework.boot:spring-boot-starter-security'
    implementation 'org.springframework.boot:spring-boot-starter-session-jdbc'
    implementation 'org.springdoc:springdoc-openapi-starter-webmvc-ui:3.1.1'
```
그리고 `testImplementation 'org.springframework.boot:spring-boot-starter-webmvc-test'` 줄 아래에 추가:
```groovy
    testImplementation 'org.springframework.boot:spring-boot-starter-security-test'
```

`application.yml` 의 `spring.mvc` 블록 아래(같은 들여쓰기)에 추가:
```yaml
  session:
    timeout: 8h
    jdbc:
      initialize-schema: never # 표는 Flyway V1 이 만듦
```
그리고 `factory3d:` 블록 끝에 추가:
```yaml
  # 처음 관리자(admin) 비밀번호. 비우면 임의로 만들어 로그에 한 번 출력 (첫 로그인 때 변경 강제)
  admin-password: ${F3D_ADMIN_PASSWORD:}
```

- [ ] **Step 2: 3D_WEB 인증·감사·사용자 코드와 테스트 복사 (이름 바꿈)**

```bash
cd /c/kopens/project/Factory3D/server
SRC=../../3D_WEB/server/src
DST=src
R='s/com\.kopens\.twin/com.kopens.factory3d/g; s/TwinUser/F3dUser/g; s/TWIN_SESSION/F3D_SESSION/g; s/TWIN_/F3D_/g; s/\${twin\./${factory3d./g'
mkdir -p $DST/main/java/com/kopens/factory3d/{auth,audit,user} $DST/main/resources/{mapper,db/migration} $DST/test/java/com/kopens/factory3d/{auth,user}
for f in AdminBootstrap AppUser AuthController AuthService PasswordPolicy Role UserMapper UserView; do
  sed -e "$R" $SRC/main/java/com/kopens/twin/auth/$f.java > $DST/main/java/com/kopens/factory3d/auth/$f.java
done
sed -e "$R" $SRC/main/java/com/kopens/twin/auth/TwinUser.java > $DST/main/java/com/kopens/factory3d/auth/F3dUser.java
for f in AuditController AuditEntry AuditMapper AuditService; do
  sed -e "$R" $SRC/main/java/com/kopens/twin/audit/$f.java > $DST/main/java/com/kopens/factory3d/audit/$f.java
done
for f in UserController UserService; do
  sed -e "$R" $SRC/main/java/com/kopens/twin/user/$f.java > $DST/main/java/com/kopens/factory3d/user/$f.java
done
sed -e "$R" $SRC/main/java/com/kopens/twin/common/SecurityConfig.java > $DST/main/java/com/kopens/factory3d/common/SecurityConfig.java
for f in UserMapper AuditMapper; do sed -e "$R" $SRC/main/resources/mapper/$f.xml > $DST/main/resources/mapper/$f.xml; done
cp $SRC/main/resources/db/migration/V3__auth.sql $DST/main/resources/db/migration/V1__auth.sql
sed -e "$R; s#/api/equipment#/api/drawings#g" $SRC/test/java/com/kopens/twin/auth/AuthApiTest.java > $DST/test/java/com/kopens/factory3d/auth/AuthApiTest.java
sed -e "$R" $SRC/test/java/com/kopens/twin/user/UserApiTest.java > $DST/test/java/com/kopens/factory3d/user/UserApiTest.java
grep -rn "twin\|Twin\|equipment" $DST --include=*.java --include=*.xml | grep -v "^.*://" || echo "남은 twin/equipment 없음"
```
Expected: 마지막 줄 `남은 twin/equipment 없음`. 무언가 출력되면 해당 줄을 같은 규칙(`com.kopens.factory3d`, `F3dUser`, `/api/drawings`)으로 고친다.

`auth/F3dUser.java` 파일 안의 클래스 선언이 `F3dUser` 인지 확인 (sed 로 바뀜).

- [ ] **Step 3: 권한 규칙 수정**

`common/SecurityConfig.java` 의 `authorizeHttpRequests(a -> a ... )` 안 규칙 전체를 아래로 바꾼다 (기존 `.requestMatchers("/api/health"...` 부터 `.anyRequest().permitAll())` 까지):
```java
        http.authorizeHttpRequests(a -> a
                        .requestMatchers("/api/health", "/api/auth/login").permitAll()
                        .requestMatchers("/api/auth/**").authenticated()
                        .requestMatchers("/api/users/**", "/api/audit/**", "/api/admin/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.GET, "/api/**").hasRole("VIEWER")
                        .requestMatchers("/api/**").hasRole("OPERATOR")
                        .anyRequest().permitAll())
```
같은 파일에서 `c.setCookieName("TWIN_SESSION")` 이 `F3D_SESSION` 으로 바뀌었는지 확인.

- [ ] **Step 4: 도면 표 마이그레이션과 목록 API 실패 테스트 작성**

`src/main/resources/db/migration/V2__drawing.sql`:
```sql
-- 도면: 원본 파일 + 해석 결과(plan). P1 은 목록만, 업로드·해석은 P2
create table drawing (
    id          bigserial    primary key,
    name        varchar(100) not null,
    source_type varchar(8)   not null check (source_type in ('dxf', 'image')),
    source_file varchar(300) not null,
    plan        jsonb        not null default '{}'::jsonb,
    layer_rules jsonb        not null default '{}'::jsonb,
    version     int          not null default 1,
    created_by  varchar(32),
    created_at  timestamptz  not null default now(),
    updated_at  timestamptz  not null default now()
);
```

`src/test/java/com/kopens/factory3d/drawing/DrawingApiTest.java`:
```java
package com.kopens.factory3d.drawing;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.kopens.factory3d.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.security.test.context.support.WithMockUser;

@WithMockUser(username = "viewer", roles = "VIEWER")
class DrawingApiTest extends IntegrationTest {

    @Test
    void 도면이_없으면_빈_목록() throws Exception {
        mvc.perform(get("/api/drawings")).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void 도면_목록은_등록순() throws Exception {
        jdbc.update("insert into drawing (name, source_type, source_file) values ('나셀 공장', 'dxf', 'drawings/1/a.dxf')");
        jdbc.update("insert into drawing (name, source_type, source_file) values ('2공장', 'image', 'drawings/2/b.png')");
        mvc.perform(get("/api/drawings"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].name").value("나셀 공장"))
                .andExpect(jsonPath("$[0].sourceType").value("dxf"))
                .andExpect(jsonPath("$[1].name").value("2공장"))
                .andExpect(jsonPath("$[1].updatedAt").exists());
    }
}
```

`src/test/java/com/kopens/factory3d/auth/AccessTest.java`:
```java
package com.kopens.factory3d.auth;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.kopens.factory3d.support.IntegrationTest;
import org.junit.jupiter.api.Test;

/** 역할별로 열리는 API (관리자 ⊃ 운전원 ⊃ 조회) */
class AccessTest extends IntegrationTest {

    @Test
    void 조회_권한은_GET_만() throws Exception {
        var viewer = user("v").roles("VIEWER");
        mvc.perform(get("/api/drawings").with(viewer)).andExpect(status().isOk());
        mvc.perform(post("/api/drawings").with(viewer).with(csrf())).andExpect(status().isForbidden());
        mvc.perform(get("/api/users").with(viewer)).andExpect(status().isForbidden());
        mvc.perform(get("/api/audit").with(viewer)).andExpect(status().isForbidden());
    }

    @Test
    void 운전원은_관리자_API_불가() throws Exception {
        var op = user("o").roles("OPERATOR");
        mvc.perform(get("/api/drawings").with(op)).andExpect(status().isOk());
        mvc.perform(get("/api/users").with(op)).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/anything").with(op)).andExpect(status().isForbidden());
    }

    @Test
    void 관리자는_모두() throws Exception {
        var admin = user("a").roles("ADMIN");
        mvc.perform(get("/api/drawings").with(admin)).andExpect(status().isOk());
        mvc.perform(get("/api/users").with(admin)).andExpect(status().isOk());
        mvc.perform(get("/api/audit").with(admin)).andExpect(status().isOk());
    }

    @Test
    void 로그인_안_하면_401() throws Exception {
        mvc.perform(get("/api/drawings")).andExpect(status().isUnauthorized());
    }
}
```

`CommonWebTest.java` 의 `class CommonWebTest` 선언 바로 위에 `@WithMockUser(username = "tester", roles = "ADMIN")` 을 붙이고 import 추가:
```java
import org.springframework.security.test.context.support.WithMockUser;
```

- [ ] **Step 5: 실패 확인**

```bash
cd /c/kopens/project/Factory3D/server && ./gradlew test
```
Expected: 컴파일은 되고 `DrawingApiTest`, `AccessTest` 의 `/api/drawings` 200 기대가 404 로 FAIL. (AuthApiTest 의 `/api/drawings` 부분도 FAIL 가능)

- [ ] **Step 6: 도면 목록 구현**

`src/main/java/com/kopens/factory3d/drawing/DrawingSummary.java`:
```java
package com.kopens.factory3d.drawing;

import java.time.OffsetDateTime;

/** 도면 select 에 쓰는 요약 */
public record DrawingSummary(long id, String name, String sourceType, OffsetDateTime updatedAt) {}
```

`src/main/java/com/kopens/factory3d/drawing/DrawingMapper.java`:
```java
package com.kopens.factory3d.drawing;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface DrawingMapper {
    List<DrawingSummary> findAll();
}
```

`src/main/resources/mapper/DrawingMapper.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "https://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.kopens.factory3d.drawing.DrawingMapper">

    <resultMap id="summary" type="com.kopens.factory3d.drawing.DrawingSummary">
        <constructor>
            <idArg column="id" javaType="_long"/>
            <arg column="name" javaType="String"/>
            <arg column="source_type" javaType="String"/>
            <arg column="updated_at" javaType="java.time.OffsetDateTime"/>
        </constructor>
    </resultMap>

    <select id="findAll" resultMap="summary">
        select id, name, source_type, updated_at from drawing order by id
    </select>
</mapper>
```

`src/main/java/com/kopens/factory3d/drawing/DrawingController.java`:
```java
package com.kopens.factory3d.drawing;

import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** 도면 목록 (조회 이상). 업로드·해석은 P2 */
@RestController
public class DrawingController {
    private final DrawingMapper drawings;

    public DrawingController(DrawingMapper drawings) {
        this.drawings = drawings;
    }

    @GetMapping("/api/drawings")
    public List<DrawingSummary> list() {
        return drawings.findAll();
    }
}
```

- [ ] **Step 7: 전체 테스트 통과 확인**

```bash
cd /c/kopens/project/Factory3D/server && ./gradlew test
```
Expected: `BUILD SUCCESSFUL` — CommonWebTest, AuthApiTest, UserApiTest, AccessTest, DrawingApiTest 모두 통과. AccessTest 의 `post("/api/drawings")` 는 OPERATOR 규칙에 먼저 막혀 403 이어야 한다.

- [ ] **Step 8: Commit**

```bash
cd /c/kopens/project/Factory3D
git add server
git commit -m "feat(server): 로그인·권한·감사·사용자 관리 이식, 도면 목록 API

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 로그인 이력

**Files:**
- Create: `server/src/main/resources/db/migration/V3__login_history.sql`
- Create: `server/src/main/java/com/kopens/factory3d/loginhistory/{LoginEvent,LoginHistoryMapper,LoginHistoryService,LoginHistoryController}.java`, `server/src/main/resources/mapper/LoginHistoryMapper.xml`
- Modify: `server/src/main/java/com/kopens/factory3d/auth/AuthService.java`, `auth/AuthController.java`
- Test: `server/src/test/java/com/kopens/factory3d/loginhistory/LoginHistoryApiTest.java`

**Interfaces:**
- Consumes: `AuthService.authenticate`, `AuthController.logout` (Task 2), `BadRequestException(String)` (Task 1)
- Produces: `LoginHistoryService.record(String username, String result, String detail)` — result 는 `OK|FAIL|LOCKED|LOGOUT`
- Produces: REST `GET /api/admin/login-history?username=&result=&from=YYYY-MM-DD&to=YYYY-MM-DD&limit=200` (ADMIN) → `[{id, at, username, result, detail, ip, userAgent}]` 최신순. `to` 는 그날 끝까지 포함. 잘못된 result → 400 "결과는 OK, FAIL, LOCKED, LOGOUT 중 하나입니다."

- [ ] **Step 1: 실패 테스트 작성**

`src/test/java/com/kopens/factory3d/loginhistory/LoginHistoryApiTest.java`:
```java
package com.kopens.factory3d.loginhistory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.kopens.factory3d.support.IntegrationTest;
import jakarta.servlet.http.Cookie;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;

class LoginHistoryApiTest extends IntegrationTest {
    @Autowired PasswordEncoder encoder;

    private void kim() {
        jdbc.update("insert into app_user (username, display_name, password_hash, role, must_change_password) values ('kim', '김', ?, 'OPERATOR', false)",
                encoder.encode("Passw0rd!"));
    }

    private org.springframework.test.web.servlet.ResultActions login(String name, String pwd) throws Exception {
        return mvc.perform(post("/api/auth/login").with(csrf()).header("User-Agent", "JUnit-Browser")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"" + name + "\",\"password\":\"" + pwd + "\"}"));
    }

    @Test
    void 성공_실패_없는아이디_로그아웃이_기록됨() throws Exception {
        kim();
        login("kim", "wrong").andExpect(status().isUnauthorized());
        login("ghost", "x").andExpect(status().isUnauthorized());
        Cookie s = login("kim", "Passw0rd!").andExpect(status().isOk()).andReturn().getResponse().getCookie("F3D_SESSION");
        mvc.perform(post("/api/auth/logout").cookie(s).with(csrf())).andExpect(status().isNoContent());

        List<String> rows = jdbc.queryForList("select username || ':' || result from login_history order by id", String.class);
        assertThat(rows).containsExactly("kim:FAIL", "ghost:FAIL", "kim:OK", "kim:LOGOUT");
        assertThat(jdbc.queryForObject("select user_agent from login_history where result = 'OK'", String.class))
                .isEqualTo("JUnit-Browser");
        assertThat(jdbc.queryForObject("select ip from login_history where result = 'OK'", String.class)).isNotBlank();
    }

    @Test
    void 관리자는_조건으로_조회() throws Exception {
        jdbc.update("insert into login_history (at, username, result, ip) values (now() - interval '3 day', 'kim', 'FAIL', '10.0.0.1')");
        jdbc.update("insert into login_history (at, username, result, ip) values (now(), 'kim', 'FAIL', '10.0.0.2')");
        jdbc.update("insert into login_history (at, username, result, ip) values (now(), 'kim', 'OK', '10.0.0.2')");
        jdbc.update("insert into login_history (at, username, result, ip) values (now(), 'lee', 'FAIL', '10.0.0.3')");
        var admin = user("admin").roles("ADMIN");

        mvc.perform(get("/api/admin/login-history").with(admin))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(4))
                .andExpect(jsonPath("$[0].username").value("lee")); // 최신순
        mvc.perform(get("/api/admin/login-history?username=kim&result=FAIL").with(admin))
                .andExpect(jsonPath("$.length()").value(2));
        String today = java.time.LocalDate.now(java.time.ZoneId.of("Asia/Seoul")).toString();
        mvc.perform(get("/api/admin/login-history?username=kim&result=FAIL&from=" + today + "&to=" + today).with(admin))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].ip").value("10.0.0.2"));
        mvc.perform(get("/api/admin/login-history?limit=1").with(admin)).andExpect(jsonPath("$.length()").value(1));
        mvc.perform(get("/api/admin/login-history?result=BAD").with(admin))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("결과는 OK, FAIL, LOCKED, LOGOUT 중 하나입니다."));
    }

    @Test
    void 운전원은_조회_불가() throws Exception {
        mvc.perform(get("/api/admin/login-history").with(user("o").roles("OPERATOR"))).andExpect(status().isForbidden());
    }
}
```

- [ ] **Step 2: 실패 확인**

```bash
cd /c/kopens/project/Factory3D/server && ./gradlew test --tests "*LoginHistoryApiTest"
```
Expected: FAIL — `relation "login_history" does not exist` / 404.

- [ ] **Step 3: 표·매퍼·서비스·컨트롤러 구현**

`src/main/resources/db/migration/V3__login_history.sql`:
```sql
-- 로그인 이력: 성공·실패·잠김·로그아웃, 어디서(IP)·무엇으로(브라우저)
create table login_history (
    id         bigserial    primary key,
    at         timestamptz  not null default now(),
    username   varchar(32),
    result     varchar(16)  not null check (result in ('OK', 'FAIL', 'LOCKED', 'LOGOUT')),
    detail     varchar(200),
    ip         varchar(64),
    user_agent varchar(300)
);
create index login_history_at on login_history (at desc);
create index login_history_user on login_history (username, at desc);
```

`src/main/java/com/kopens/factory3d/loginhistory/LoginEvent.java`:
```java
package com.kopens.factory3d.loginhistory;

import java.time.OffsetDateTime;

public record LoginEvent(long id, OffsetDateTime at, String username, String result, String detail, String ip,
        String userAgent) {}
```

`src/main/java/com/kopens/factory3d/loginhistory/LoginHistoryMapper.java`:
```java
package com.kopens.factory3d.loginhistory;

import java.time.OffsetDateTime;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface LoginHistoryMapper {
    void insert(@Param("username") String username, @Param("result") String result, @Param("detail") String detail,
            @Param("ip") String ip, @Param("userAgent") String userAgent);

    List<LoginEvent> find(@Param("username") String username, @Param("result") String result,
            @Param("from") OffsetDateTime from, @Param("to") OffsetDateTime to, @Param("limit") int limit);
}
```

`src/main/resources/mapper/LoginHistoryMapper.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "https://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.kopens.factory3d.loginhistory.LoginHistoryMapper">

    <resultMap id="event" type="com.kopens.factory3d.loginhistory.LoginEvent">
        <constructor>
            <idArg column="id" javaType="_long"/>
            <arg column="at" javaType="java.time.OffsetDateTime"/>
            <arg column="username" javaType="String"/>
            <arg column="result" javaType="String"/>
            <arg column="detail" javaType="String"/>
            <arg column="ip" javaType="String"/>
            <arg column="user_agent" javaType="String"/>
        </constructor>
    </resultMap>

    <insert id="insert">
        insert into login_history (username, result, detail, ip, user_agent)
        values (#{username,jdbcType=VARCHAR}, #{result}, #{detail,jdbcType=VARCHAR}, #{ip,jdbcType=VARCHAR},
                #{userAgent,jdbcType=VARCHAR})
    </insert>

    <select id="find" resultMap="event">
        select id, at, username, result, detail, ip, user_agent from login_history
        <where>
            <if test="username != null">and username = #{username}</if>
            <if test="result != null">and result = #{result}</if>
            <if test="from != null">and at &gt;= #{from}</if>
            <if test="to != null">and at &lt; #{to}</if>
        </where>
        order by id desc
        limit #{limit}
    </select>
</mapper>
```

`src/main/java/com/kopens/factory3d/loginhistory/LoginHistoryService.java`:
```java
package com.kopens.factory3d.loginhistory;

import com.kopens.factory3d.common.BadRequestException;
import jakarta.servlet.http.HttpServletRequest;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/** 로그인 이력 남기기·찾기. IP·브라우저는 지금 요청에서 */
@Service
public class LoginHistoryService {
    public static final Set<String> RESULTS = Set.of("OK", "FAIL", "LOCKED", "LOGOUT");

    private final LoginHistoryMapper mapper;
    private final ZoneId zone;

    public LoginHistoryService(LoginHistoryMapper mapper, @Value("${factory3d.time-zone:Asia/Seoul}") String zone) {
        this.mapper = mapper;
        this.zone = ZoneId.of(zone);
    }

    public void record(String username, String result, String detail) {
        HttpServletRequest req = RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes r
                ? r.getRequest()
                : null;
        String ip = req == null ? null : req.getRemoteAddr();
        String ua = req == null ? null : req.getHeader("User-Agent");
        if (ua != null && ua.length() > 300) ua = ua.substring(0, 300);
        String name = username == null || username.isBlank() ? null : username.substring(0, Math.min(32, username.length()));
        mapper.insert(name, result, detail, ip, ua);
    }

    /** from·to 는 이 시간대의 날짜. to 는 그날 끝까지 포함 */
    public List<LoginEvent> find(String username, String result, LocalDate from, LocalDate to, int limit) {
        String r = blank(result);
        if (r != null && !RESULTS.contains(r)) throw new BadRequestException("결과는 OK, FAIL, LOCKED, LOGOUT 중 하나입니다.");
        OffsetDateTime f = from == null ? null : from.atStartOfDay(zone).toOffsetDateTime();
        OffsetDateTime t = to == null ? null : to.plusDays(1).atStartOfDay(zone).toOffsetDateTime();
        return mapper.find(blank(username), r, f, t, Math.max(1, Math.min(limit, 1000)));
    }

    private static String blank(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
```

`src/main/java/com/kopens/factory3d/loginhistory/LoginHistoryController.java`:
```java
package com.kopens.factory3d.loginhistory;

import java.time.LocalDate;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 관리자 › 로그인 이력 (ADMIN — SecurityConfig 의 /api/admin/**) */
@RestController
public class LoginHistoryController {
    private final LoginHistoryService history;

    public LoginHistoryController(LoginHistoryService history) {
        this.history = history;
    }

    @GetMapping("/api/admin/login-history")
    public List<LoginEvent> find(
            @RequestParam(required = false) String username,
            @RequestParam(required = false) String result,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "200") int limit) {
        return history.find(username, result, from, to, limit);
    }
}
```

- [ ] **Step 4: 로그인·로그아웃에서 이력 남기기**

`auth/AuthService.java`:
1. import 추가: `import com.kopens.factory3d.loginhistory.LoginHistoryService;`
2. 필드 `private final AuditService audit;` 아래에 `private final LoginHistoryService history;` 추가.
3. 생성자를 아래로 바꾼다:
```java
    public AuthService(UserMapper users, PasswordEncoder encoder, AuditService audit, LoginHistoryService history,
            @Value("${factory3d.time-zone:Asia/Seoul}") String zone) {
        this.users = users;
        this.encoder = encoder;
        this.audit = audit;
        this.history = history;
        this.zone = ZoneId.of(zone);
        this.dummyHash = encoder.encode("not-a-real-password-1");
    }
```
4. `authenticate` 메서드 전체를 아래로 바꾼다 (감사 기록은 그대로 두고 이력을 함께 남김):
```java
    public AppUser authenticate(String username, String password) {
        String name = username == null ? "" : username.trim().toLowerCase();
        String pwd = password == null ? "" : password;
        AppUser u = users.findByUsername(name);
        if (u == null) {
            encoder.matches(pwd, dummyHash);
            audit.logAs(name, "LOGIN_FAIL", name, "없는 아이디");
            history.record(name, "FAIL", "없는 아이디");
            throw new UnauthorizedException(BAD_LOGIN);
        }
        OffsetDateTime now = OffsetDateTime.now();
        if (u.lockedAt(now)) {
            audit.logAs(name, "LOGIN_LOCKED", name, "잠긴 동안 시도");
            history.record(name, "LOCKED", "잠긴 동안 시도");
            throw new LockedException(lockedMessage(u.lockedUntil()));
        }
        if (!encoder.matches(pwd, u.passwordHash())) {
            int failed = u.failedCount() + 1;
            OffsetDateTime until = failed >= MAX_FAIL ? now.plus(LOCK) : null;
            users.loginFailed(u.id(), until == null ? failed : 0, until);
            audit.logAs(name, until == null ? "LOGIN_FAIL" : "LOGIN_LOCKED", name, failed + "번째 실패");
            history.record(name, until == null ? "FAIL" : "LOCKED", failed + "번째 실패");
            if (until != null) throw new LockedException(lockedMessage(until));
            throw new UnauthorizedException(BAD_LOGIN);
        }
        if (!u.enabled()) {
            audit.logAs(name, "LOGIN_FAIL", name, "사용 중지된 계정");
            history.record(name, "FAIL", "사용 중지된 계정");
            throw new UnauthorizedException("사용이 중지된 계정입니다. 관리자에게 문의하세요.");
        }
        users.loginOk(u.id());
        audit.logAs(name, "LOGIN_OK", name, null);
        history.record(name, "OK", null);
        return users.findById(u.id());
    }
```

`auth/AuthController.java`:
1. import 추가: `import com.kopens.factory3d.loginhistory.LoginHistoryService;`
2. 필드 `private final AuditService audit;` 아래에 `private final LoginHistoryService history;` 추가.
3. 생성자를 아래로 바꾼다:
```java
    public AuthController(AuthService auth, UserMapper users, AuditService audit, LoginHistoryService history) {
        this.auth = auth;
        this.users = users;
        this.audit = audit;
        this.history = history;
    }
```
4. `logout` 안의 `if (a != null) audit.log("LOGOUT", a.getName(), null);` 를 아래로 바꾼다:
```java
        if (a != null) {
            audit.log("LOGOUT", a.getName(), null);
            history.record(a.getName(), "LOGOUT", null);
        }
```

- [ ] **Step 5: 통과 확인 (전체)**

```bash
cd /c/kopens/project/Factory3D/server && ./gradlew test
```
Expected: `BUILD SUCCESSFUL` — 기존 테스트 포함 전부 통과.

- [ ] **Step 6: Commit**

```bash
cd /c/kopens/project/Factory3D
git add server
git commit -m "feat(server): 로그인 이력 기록·조회 API

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 화면 뼈대 + 로그인 + 메인 레이아웃(레일·도면 select)

**Files:**
- Create: `web/package.json`, `web/vite.config.ts`, `web/index.html`, `web/tsconfig.json`·`tsconfig.app.json`·`tsconfig.node.json`·`.oxlintrc.json`·`public/favicon.svg` (복사)
- Create: `web/src/{test-setup.ts}`, `styles/{tokens,kp,auth}.css`, `api/client.ts`, `api/client.test.ts`, `auth/*`, `components/{Modal,UserMenu}.tsx`, `pages/{AuthScene,LoginPage,PasswordPage,ErrorPage,ErrorPage.test}.tsx` (복사)
- Create: `web/src/main.tsx`, `routes.tsx`, `styles/app.css`, `api/types.ts`, `layout/{IconRail,AppShell,DrawingBar}.tsx`, `layout/layout.test.tsx`, `drawing/useDrawings.ts`, `drawing/useDrawings.test.ts`, `pages/FactoryPage.tsx`

**Interfaces:**
- Consumes: `GET /api/drawings`, `/api/auth/*` (Task 2)
- Produces: `api/types.ts` — `Role`, `User`, `AuditEntry`, `LoginResult`, `LoginEvent`, `DrawingSummary` (아래 코드)
- Produces: `AppShell({ active: RailKey, head?: ReactNode, children })`, `RailKey = 'factory' | 'dashboard' | 'run' | 'chat' | 'admin'`
- Produces: `pickDrawing(list: DrawingSummary[], stored: number | null): number | null`, `loadStored(username): number | null`, `saveStored(username, id): void`, `useDrawings(): DrawingList`
- Produces: `routes` 배열 — Task 5 가 `/admin` 을 추가

- [ ] **Step 1: 설정 파일 작성·복사, 의존성 설치**

`web/package.json`:
```json
{
  "name": "factory3d-web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "oxlint",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "lucide-react": "^1.57.0",
    "pretendard": "^1.3.9",
    "react": "^19.2.8",
    "react-dom": "^19.2.8",
    "react-router": "^7.18.4"
  },
  "devDependencies": {
    "@testing-library/dom": "^10.4.2",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.3",
    "@types/node": "^24.13.3",
    "@types/react": "^19.2.18",
    "@types/react-dom": "^19.2.7",
    "@vitejs/plugin-react": "^6.1.1",
    "jsdom": "^29.1.1",
    "oxlint": "^1.81.0",
    "playwright": "^1.64.1",
    "typescript": "~6.0.2",
    "vite": "^8.3.0",
    "vitest": "^4.1.11"
  }
}
```

`web/vite.config.ts`:
```ts
/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 개발: 화면 5200, /api·/ws 는 서버 8080 으로
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5200,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        // 서버가 꺼져 있으면 502 → 화면은 "연결 끊김" 으로 보여 줌
        configure: (proxy) =>
          proxy.on('error', (_err, _req, res) => {
            if ('writeHead' in res && !res.headersSent) {
              res.writeHead(502)
              res.end()
            }
          }),
      },
      '/ws': { target: 'ws://localhost:8080', ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
})
```

`web/index.html`:
```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Factory3D</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```bash
cd /c/kopens/project/Factory3D && mkdir -p web/public web/src/{styles,api,auth,components,pages,layout,drawing}
W=../3D_WEB/web
cp $W/tsconfig.json $W/tsconfig.app.json $W/tsconfig.node.json $W/.oxlintrc.json web/
cp $W/public/favicon.svg web/public/
cp $W/src/test-setup.ts web/src/
cp $W/src/styles/tokens.css $W/src/styles/kp.css $W/src/styles/auth.css web/src/styles/
sed 's/twin:unauthorized/f3d:unauthorized/' $W/src/api/client.ts > web/src/api/client.ts
cp $W/src/api/client.test.ts web/src/api/
cp $W/src/auth/auth.tsx $W/src/auth/RequireAuth.tsx $W/src/auth/context.ts web/src/auth/
cp $W/src/components/Modal.tsx $W/src/components/UserMenu.tsx web/src/components/
cp $W/src/pages/AuthScene.tsx $W/src/pages/PasswordPage.tsx $W/src/pages/ErrorPage.test.tsx web/src/pages/
sed 's/DIGITAL TWIN/FACTORY 3D/' $W/src/pages/LoginPage.tsx > web/src/pages/LoginPage.tsx
sed 's/주소가 잘못됐거나 없는 설비입니다./주소가 잘못됐거나 없는 화면입니다./' $W/src/pages/ErrorPage.tsx > web/src/pages/ErrorPage.tsx
cd web && npm install
```
Expected: `added N packages`, 오류 없음.

- [ ] **Step 2: 타입 파일 작성, context.ts 의 타입 출처 교체**

`web/src/api/types.ts`:
```ts
/** 서버 응답 모양 (server/ 의 record 와 같게 유지) */
export type Role = 'ADMIN' | 'OPERATOR' | 'VIEWER'

export interface User {
  id: number
  username: string
  displayName: string
  role: Role
  enabled: boolean
  mustChangePassword: boolean
  locked: boolean
  lastLoginAt?: string | null
  createdAt: string
}

export interface AuditEntry {
  id: number
  at: string
  username?: string | null
  action: string
  target?: string | null
  detail?: string | null
  ip?: string | null
}

export type LoginResult = 'OK' | 'FAIL' | 'LOCKED' | 'LOGOUT'

export interface LoginEvent {
  id: number
  at: string
  username?: string | null
  result: LoginResult
  detail?: string | null
  ip?: string | null
  userAgent?: string | null
}

export interface DrawingSummary {
  id: number
  name: string
  sourceType: 'dxf' | 'image'
  updatedAt: string
}
```

`web/src/auth/context.ts` 위쪽의
```ts
import type { components } from '../api/schema'

export type User = components['schemas']['UserView']
```
를 아래로 바꾼다:
```ts
import type { User } from '../api/types'

export type { User }
```

- [ ] **Step 3: 도면 선택 규칙 실패 테스트 작성**

`web/src/drawing/useDrawings.test.ts`:
```ts
import { afterEach, describe, expect, it } from 'vitest'
import type { DrawingSummary } from '../api/types'
import { loadStored, pickDrawing, saveStored } from './useDrawings'

const d = (id: number): DrawingSummary => ({ id, name: `도면 ${id}`, sourceType: 'dxf', updatedAt: '2026-11-12T00:00:00Z' })

describe('도면 선택', () => {
  afterEach(() => localStorage.clear())

  it('기억한 도면이 목록에 있으면 그것, 없으면 첫 도면, 목록이 비면 null', () => {
    expect(pickDrawing([d(1), d(2)], 2)).toBe(2)
    expect(pickDrawing([d(1), d(2)], 9)).toBe(1)
    expect(pickDrawing([d(1), d(2)], null)).toBe(1)
    expect(pickDrawing([], 1)).toBeNull()
  })

  it('사용자별로 기억', () => {
    saveStored('kim', 2)
    expect(loadStored('kim')).toBe(2)
    expect(loadStored('lee')).toBeNull()
    expect(localStorage.getItem('f3d:drawing:kim')).toBe('2')
  })
})
```

Run: `cd /c/kopens/project/Factory3D/web && npx vitest run src/drawing`
Expected: FAIL — `Failed to resolve import "./useDrawings"`.

- [ ] **Step 4: 도면 목록 훅 구현**

`web/src/drawing/useDrawings.ts`:
```ts
import { useEffect, useState } from 'react'
import { ApiError, apiJson } from '../api/client'
import type { DrawingSummary } from '../api/types'

export type DrawingList =
  | { kind: 'loading' }
  | { kind: 'ok'; list: DrawingSummary[] }
  | { kind: 'error'; error: ApiError }

/** 서버의 도면 목록 */
export function useDrawings(): DrawingList {
  const [state, setState] = useState<DrawingList>({ kind: 'loading' })
  useEffect(() => {
    let cancel = false
    apiJson<DrawingSummary[]>('/api/drawings')
      .then((list) => !cancel && setState({ kind: 'ok', list }))
      .catch((error: ApiError) => !cancel && setState({ kind: 'error', error }))
    return () => {
      cancel = true
    }
  }, [])
  return state
}

/** 기억한 도면이 목록에 있으면 그것, 없으면 첫 도면 */
export function pickDrawing(list: DrawingSummary[], stored: number | null): number | null {
  if (stored !== null && list.some((d) => d.id === stored)) return stored
  return list[0]?.id ?? null
}

const key = (username: string) => `f3d:drawing:${username}`

/** 마지막으로 고른 도면 (사용자별, 브라우저에 저장 — 막혀 있으면 기억 안 함) */
export function loadStored(username: string): number | null {
  try {
    const v = localStorage.getItem(key(username))
    return v ? Number(v) : null
  } catch {
    return null
  }
}

export function saveStored(username: string, id: number): void {
  try {
    localStorage.setItem(key(username), String(id))
  } catch {
    /* 저장 못 해도 화면은 동작 */
  }
}
```

Run: `npx vitest run src/drawing`
Expected: PASS 2개.

- [ ] **Step 5: 레이아웃 실패 테스트 작성**

`web/src/layout/layout.test.tsx`:
```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../api/types'
import { StaticAuth } from '../auth/auth'
import { routes } from '../routes'

const base: User = {
  id: 1, username: 'kim', displayName: '김운전', role: 'OPERATOR', enabled: true,
  mustChangePassword: false, locked: false, createdAt: '2026-11-12T00:00:00Z',
}
const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body })
const drawings = [
  { id: 1, name: '나셀 공장', sourceType: 'dxf', updatedAt: '2026-11-12T00:00:00Z' },
  { id: 2, name: '2공장', sourceType: 'image', updatedAt: '2026-11-12T00:00:00Z' },
]

function show(user: User, list: unknown[] = drawings) {
  vi.stubGlobal('fetch', vi.fn(async () => json(200, list)))
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

  it('도면 select: 기억한 도면을 고르고, 바꾸면 기억', async () => {
    localStorage.setItem('f3d:drawing:kim', '2')
    show(base)
    const select = (await screen.findByRole('combobox', { name: '도면 선택' })) as HTMLSelectElement
    expect(await screen.findByRole('option', { name: '2공장' })).toBeInTheDocument()
    expect(select.value).toBe('2')
    fireEvent.change(select, { target: { value: '1' } })
    expect(select.value).toBe('1')
    expect(localStorage.getItem('f3d:drawing:kim')).toBe('1')
    expect(screen.getByText('나셀 공장', { selector: 'strong' })).toBeInTheDocument()
  })

  it('도면이 없으면 안내', async () => {
    show(base, [])
    expect(await screen.findByText('등록된 도면이 없습니다')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '도면 선택' })).toBeDisabled()
  })

  it('도면 추가 버튼은 운전원 이상, 관리자 메뉴는 관리자만', async () => {
    show(base)
    expect(await screen.findByRole('button', { name: /도면 추가/ })).toBeInTheDocument()
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

Run: `npx vitest run src/layout`
Expected: FAIL — `Failed to resolve import "../routes"`.

- [ ] **Step 6: 스타일·레이아웃·페이지·라우트 구현**

`web/src/styles/app.css`:
```css
/* Factory3D 작업 화면 (어두운 바탕). 관리자 화면은 kp.css (흰 바탕) */
:root {
  --bg: #16181c;
  --rail: #111215;
  --panel: #1a1c20;
  --rail-w: 56px;
  --head-h: 48px;
  --primary: var(--kp-primary);
  --line: #ffffff14;
  --line-strong: #ffffff29;
  --text: #e8eaee;
  --muted: #8d939e;
  font-family: var(--kp-font);
  color: var(--text);
  background: var(--bg);
}

* { box-sizing: border-box; }
html, body, #root { height: 100%; margin: 0; }
button { font: inherit; color: inherit; cursor: pointer; }

.app-loading { min-height: 100vh; display: grid; place-items: center; margin: 0; color: var(--muted); background: var(--bg); }

/* 바깥 틀: 레일 + (머리글 · 본문) */
.app-shell { height: 100%; display: grid; grid-template-columns: var(--rail-w) minmax(0, 1fr); grid-template-areas: 'rail main'; background: var(--bg); }
.app-main { grid-area: main; display: flex; flex-direction: column; min-height: 0; }
.app-head { flex: none; height: var(--head-h); display: flex; align-items: center; gap: 12px; padding: 0 16px; border-bottom: 1px solid var(--line); background: var(--panel); }
.app-head .spacer { flex: 1; }
.app-body { position: relative; flex: 1; min-height: 0; }

/* 아이콘 레일 */
.rail { grid-area: rail; display: flex; flex-direction: column; align-items: center; gap: 6px; padding-bottom: 12px; background: var(--rail); border-right: 1px solid var(--line); }
.rail-logo { display: grid; place-items: center; width: var(--rail-w); height: var(--head-h); flex: none; font-size: var(--kp-text-16); font-weight: 700; color: #fff; border-bottom: 1px solid var(--line); margin-bottom: 6px; }
.rail button { width: 40px; height: 40px; display: grid; place-items: center; border: 0; border-radius: var(--kp-radius-sm); background: none; color: var(--muted); }
.rail button:hover:not(:disabled) { background: #ffffff10; color: #fff; }
.rail button.active { background: color-mix(in srgb, var(--primary) 22%, transparent); color: var(--primary); }
.rail button:disabled { opacity: 0.45; cursor: default; }
.rail .rail-bottom { margin-top: auto; }

/* 도면 select + 추가 */
.drawing-bar { display: flex; align-items: center; gap: 8px; }
.drawing-select { display: flex; align-items: center; gap: 8px; font-size: var(--kp-text-13); color: var(--muted); }
.drawing-select select { height: var(--kp-h-xs); min-width: 220px; padding: 0 8px; border: 1px solid var(--line-strong); border-radius: var(--kp-radius-sm); background: #ffffff08; color: var(--text); font: inherit; font-size: var(--kp-text-14); }
.drawing-select select option { color: #111; }
.bar-btn { display: flex; align-items: center; gap: 6px; height: var(--kp-h-xs); padding: 0 12px; border: 1px solid var(--line-strong); border-radius: var(--kp-radius-sm); background: #ffffff08; font-size: var(--kp-text-13); }
.bar-btn:hover:not(:disabled) { background: #ffffff14; }
.bar-btn:disabled { opacity: 0.45; cursor: default; }

/* 빈 화면 안내 */
.empty-state { position: absolute; inset: 0; display: grid; place-content: center; gap: 8px; margin: 0; text-align: center; color: var(--muted); font-size: var(--kp-text-14); }
.empty-state strong { color: var(--text); font-size: var(--kp-text-16); }

/* 사용자 메뉴 (머리글 오른쪽) */
.user-menu { position: relative; }
.user-btn { display: flex; align-items: center; gap: 8px; height: var(--kp-h-xs); padding: 0 10px; border: 1px solid var(--line); border-radius: var(--kp-radius-sm); background: #ffffff08; color: var(--text); font-size: var(--kp-text-13); }
.user-btn:hover { background: #ffffff14; }
.user-name { font-weight: 600; }
.user-role { padding: 1px 6px; border-radius: var(--kp-radius-xs); background: color-mix(in srgb, var(--primary) 25%, transparent); color: #9cc3ff; font-size: var(--kp-text-12); }
.user-pop { position: absolute; z-index: 10; right: 0; top: calc(100% + 6px); min-width: 180px; padding: 6px; border: 1px solid var(--line-strong); border-radius: var(--kp-radius-sm); background: var(--panel); box-shadow: 0 12px 32px #0009; }
.user-id { margin: 0 0 6px; padding: 4px 8px 8px; font-size: var(--kp-text-12); color: var(--muted); border-bottom: 1px solid var(--line); }
.user-pop button { width: 100%; display: flex; align-items: center; gap: 8px; height: var(--kp-h-xs); padding: 0 8px; border: 0; border-radius: var(--kp-radius-xs); background: none; color: var(--text); font-size: var(--kp-text-13); text-align: left; }
.user-pop button:hover { background: #ffffff10; }
```

`web/src/layout/IconRail.tsx`:
```tsx
import { Bot, Box, LayoutDashboard, Play, Settings, type LucideIcon } from 'lucide-react'
import { useNavigate } from 'react-router'
import { hasRole, useAuth } from '../auth/context'

export type RailKey = 'factory' | 'dashboard' | 'run' | 'chat' | 'admin'

interface Item {
  key: RailKey
  label: string
  icon: LucideIcon
  to?: string // 없으면 준비 중
  adminOnly?: boolean
}

const MENU: Item[] = [
  { key: 'factory', label: '3D 공장', icon: Box, to: '/' },
  { key: 'dashboard', label: '상황판', icon: LayoutDashboard },
  { key: 'run', label: '실행', icon: Play },
  { key: 'chat', label: 'AI 챗봇', icon: Bot },
]
const ADMIN: Item = { key: 'admin', label: '관리자', icon: Settings, to: '/admin', adminOnly: true }

/** 맨 왼쪽 아이콘 메뉴. 상황판·실행·AI 챗봇은 다음 단계에서 열림, 관리자는 관리자에게만 */
export function IconRail({ active }: { active: RailKey }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const button = ({ key, label, icon: Icon, to }: Item, extra = '') => {
    const blocked = !to
    const cls = [key === active ? 'active' : '', extra].filter(Boolean).join(' ') || undefined
    return (
      <button
        key={key}
        className={cls}
        aria-current={key === active ? 'page' : undefined}
        aria-label={blocked ? `${label} (준비 중)` : label}
        title={blocked ? `${label} — 준비 중` : label}
        disabled={blocked}
        onClick={() => to && navigate(to)}
      >
        <Icon size={20} strokeWidth={1.8} aria-hidden />
      </button>
    )
  }
  return (
    <nav className="rail" aria-label="메뉴">
      <span className="rail-logo" aria-hidden>
        F3
      </span>
      {MENU.map((m) => button(m))}
      {hasRole(user, 'ADMIN') && button(ADMIN, 'rail-bottom')}
    </nav>
  )
}
```

`web/src/layout/AppShell.tsx`:
```tsx
import type { ReactNode } from 'react'
import { UserMenu } from '../components/UserMenu'
import { IconRail, type RailKey } from './IconRail'

/** 작업 화면 틀: 왼쪽 레일 · 위 머리글(head + 사용자 메뉴) · 본문 */
export function AppShell({ active, head, children }: { active: RailKey; head?: ReactNode; children: ReactNode }) {
  return (
    <div className="app-shell">
      <IconRail active={active} />
      <div className="app-main">
        <header className="app-head">
          {head}
          <span className="spacer" />
          <UserMenu />
        </header>
        <main className="app-body">{children}</main>
      </div>
    </div>
  )
}
```

`web/src/layout/DrawingBar.tsx`:
```tsx
import { Plus } from 'lucide-react'
import type { DrawingSummary } from '../api/types'

interface Props {
  drawings: DrawingSummary[]
  selectedId: number | null
  onSelect: (id: number) => void
  canAdd: boolean
}

/** 머리글 왼쪽: 도면 select + 도면 추가 (추가는 P2 에서 열림) */
export function DrawingBar({ drawings, selectedId, onSelect, canAdd }: Props) {
  return (
    <div className="drawing-bar">
      <label className="drawing-select">
        <span>도면</span>
        <select
          aria-label="도면 선택"
          value={selectedId ?? ''}
          disabled={drawings.length === 0}
          onChange={(e) => onSelect(Number(e.target.value))}
        >
          {drawings.length === 0 ? (
            <option value="">등록된 도면 없음</option>
          ) : (
            drawings.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))
          )}
        </select>
      </label>
      {canAdd && (
        <button className="bar-btn" disabled title="도면 추가 — 다음 단계(P2)에서 제공">
          <Plus size={16} aria-hidden />
          도면 추가
        </button>
      )}
    </div>
  )
}
```

`web/src/pages/FactoryPage.tsx`:
```tsx
import { useState } from 'react'
import { hasRole, useAuth } from '../auth/context'
import { loadStored, pickDrawing, saveStored, useDrawings } from '../drawing/useDrawings'
import { AppShell } from '../layout/AppShell'
import { DrawingBar } from '../layout/DrawingBar'
import { ErrorPage } from './ErrorPage'

/** / — 3D 공장 화면. P1 은 레이아웃과 도면 선택까지, 3D 는 P2 */
export function FactoryPage() {
  const { user } = useAuth()
  const drawings = useDrawings()
  const [chosen, setChosen] = useState<number | null>(() => (user ? loadStored(user.username) : null))
  if (drawings.kind === 'error')
    return <ErrorPage code={drawings.error.kind === 'network' ? 'offline' : '500'} detail={drawings.error.message} />
  const list = drawings.kind === 'ok' ? drawings.list : []
  const selectedId = pickDrawing(list, chosen)
  const current = list.find((d) => d.id === selectedId)
  const select = (id: number) => {
    setChosen(id)
    if (user) saveStored(user.username, id)
  }
  return (
    <AppShell
      active="factory"
      head={<DrawingBar drawings={list} selectedId={selectedId} onSelect={select} canAdd={hasRole(user, 'OPERATOR')} />}
    >
      {drawings.kind === 'loading' ? (
        <p className="empty-state" role="status">
          도면 목록 불러오는 중…
        </p>
      ) : current ? (
        <div className="empty-state">
          <strong>{current.name}</strong>
          <span>3D 화면은 다음 단계(P2)에서 표시됩니다.</span>
        </div>
      ) : (
        <div className="empty-state">
          <strong>등록된 도면이 없습니다</strong>
          <span>도면을 추가하면 3D 공장이 여기에 표시됩니다.</span>
        </div>
      )}
    </AppShell>
  )
}
```

`web/src/routes.tsx`:
```tsx
import type { RouteObject } from 'react-router'
import { RequireAuth } from './auth/RequireAuth'
import { ErrorPage } from './pages/ErrorPage'
import { FactoryPage } from './pages/FactoryPage'
import { LoginPage } from './pages/LoginPage'
import { PasswordPage } from './pages/PasswordPage'

// errorElement = 화면을 그리다 난 예외 → 500 페이지. 로그인 화면 말고는 모두 로그인 필요
export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/password', element: <RequireAuth><PasswordPage /></RequireAuth> },
  { path: '/', element: <RequireAuth><FactoryPage /></RequireAuth>, errorElement: <ErrorPage code="500" /> },
  { path: '*', element: <ErrorPage code="404" /> },
]
```

`web/src/main.tsx`:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
import './styles/tokens.css'
import './styles/kp.css'
import './styles/app.css'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { AuthProvider } from './auth/auth'
import { routes } from './routes'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={createBrowserRouter(routes)} />
    </AuthProvider>
  </StrictMode>,
)
```

- [ ] **Step 7: 전체 테스트·빌드·린트 통과 확인**

```bash
cd /c/kopens/project/Factory3D/web && npm test && npm run build && npm run lint
```
Expected: vitest 전부 PASS(client·ErrorPage·useDrawings·layout), `tsc -b` 오류 없음, `dist/` 생성, oxlint 오류 0.
`UserMenu` 의 `light` 변형 스타일은 kp.css 에 이미 있음 (확인만).

- [ ] **Step 8: Commit**

```bash
cd /c/kopens/project/Factory3D
git add web
git commit -m "feat(web): 화면 뼈대 · 로그인 · 레일과 도면 select

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 관리자 화면 (권한관리 · 로그인 이력 · 감사 기록)

**Files:**
- Create: `web/src/pages/admin/{UsersPage,AuditPage,format}.ts(x)` (복사), `AdminLayout.tsx`, `LoginHistoryPage.tsx`, `historyQuery.ts`, `historyQuery.test.ts`, `admin.test.tsx`
- Modify: `web/src/routes.tsx`

**Interfaces:**
- Consumes: `GET /api/users`… (Task 2), `GET /api/admin/login-history` (Task 3), `IconRail` (Task 4), `LoginEvent`, `AuditEntry` (Task 4 types.ts)
- Produces: `historyQuery(f: HistoryFilter): string`, `HistoryFilter = { username: string; result: '' | LoginResult; from: string; to: string }`
- Produces: 라우트 `/admin` → `/admin/users`, `/admin/login-history`, `/admin/audit` (ADMIN)

- [ ] **Step 1: 3D_WEB 관리 화면 복사**

```bash
cd /c/kopens/project/Factory3D && mkdir -p web/src/pages/admin
W=../3D_WEB/web/src/pages/settings
cp $W/UsersPage.tsx $W/format.ts web/src/pages/admin/
sed -e "s#import type { components } from '../../api/schema'#import type { AuditEntry } from '../../api/types'#" \
    -e "s#type Entry = components\['schemas'\]\['AuditEntry'\]#type Entry = AuditEntry#" \
    -e "s#로그인·사용자 관리·설비 등록 기록입니다.#로그인·사용자 관리 등 관리 기록입니다.#" \
    $W/AuditPage.tsx > web/src/pages/admin/AuditPage.tsx
grep -n "schema\|components\|설비" web/src/pages/admin/*.tsx || echo "정리 완료"
```
Expected: `정리 완료`. AuditPage 의 `PACKAGE_IMPORT` 줄은 남아 있어도 무해하지만 지운다:
`web/src/pages/admin/AuditPage.tsx` 에서 `  PACKAGE_IMPORT: { label: '설비 패키지 등록', tone: 'info' },` 줄 삭제 (위 grep 이 `설비` 를 찾으면 이 줄).

- [ ] **Step 2: 조회 주소 만들기 실패 테스트**

`web/src/pages/admin/historyQuery.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { historyQuery } from './historyQuery'

describe('로그인 이력 조회 주소', () => {
  it('빈 조건은 빼고, 값은 인코딩', () => {
    expect(historyQuery({ username: '', result: '', from: '', to: '' })).toBe('/api/admin/login-history?limit=200')
    expect(historyQuery({ username: ' kim ', result: 'FAIL', from: '2026-11-01', to: '2026-11-12' })).toBe(
      '/api/admin/login-history?username=kim&result=FAIL&from=2026-11-01&to=2026-11-12&limit=200',
    )
    expect(historyQuery({ username: '김 운전', result: '', from: '', to: '' })).toBe(
      '/api/admin/login-history?username=%EA%B9%80+%EC%9A%B4%EC%A0%84&limit=200',
    )
  })
})
```

Run: `cd /c/kopens/project/Factory3D/web && npx vitest run src/pages/admin`
Expected: FAIL — `Failed to resolve import "./historyQuery"`.

- [ ] **Step 3: 조회 주소 구현**

`web/src/pages/admin/historyQuery.ts`:
```ts
import type { LoginResult } from '../../api/types'

export interface HistoryFilter {
  username: string
  result: '' | LoginResult
  from: string // YYYY-MM-DD 또는 ''
  to: string
}

export const EMPTY_FILTER: HistoryFilter = { username: '', result: '', from: '', to: '' }

/** 조건 → 서버 주소 (빈 조건은 뺌, 최근 200건) */
export function historyQuery(f: HistoryFilter): string {
  const q = new URLSearchParams()
  if (f.username.trim()) q.set('username', f.username.trim())
  if (f.result) q.set('result', f.result)
  if (f.from) q.set('from', f.from)
  if (f.to) q.set('to', f.to)
  q.set('limit', '200')
  return `/api/admin/login-history?${q.toString()}`
}
```

Run: `npx vitest run src/pages/admin`
Expected: PASS.

- [ ] **Step 4: 관리자 화면 실패 테스트**

`web/src/pages/admin/admin.test.tsx`:
```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../../api/types'
import { AuthProvider, StaticAuth } from '../../auth/auth'
import { routes } from '../../routes'

const ADMIN: User = {
  id: 1, username: 'admin', displayName: '관리자', role: 'ADMIN', enabled: true,
  mustChangePassword: false, locked: false, createdAt: '2026-11-12T00:00:00Z',
}
const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body })

describe('로그인 화면', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('틀리면 서버의 한국어 안내, 맞으면 원래 주소로 (CSRF 머리 포함)', async () => {
    let tries = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === '/api/auth/me') return json(401, { detail: '로그인이 필요합니다.' })
        if (url === '/api/auth/login') {
          expect(new Headers(init?.headers).has('X-XSRF-TOKEN')).toBe(true)
          return tries++ === 0 ? json(401, { detail: '아이디 또는 비밀번호가 틀렸습니다.' }) : json(200, ADMIN)
        }
        if (url === '/api/users') return json(200, [ADMIN])
        return json(200, [])
      }),
    )
    const router = createMemoryRouter(routes, { initialEntries: ['/login?next=%2Fadmin%2Fusers'] })
    render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    )
    fireEvent.change(await screen.findByLabelText('아이디'), { target: { value: 'admin' } })
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: '로그인' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('아이디 또는 비밀번호가 틀렸습니다.')
    fireEvent.click(screen.getByRole('button', { name: '로그인' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/users'))
  })
})

describe('관리자 › 권한관리', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('목록, 추가하면 임시 비밀번호를 한 번 보여 줌', async () => {
    const lee: User = { ...ADMIN, id: 2, username: 'lee', displayName: '이운전', role: 'OPERATOR', mustChangePassword: true }
    const users = [ADMIN]
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === '/api/users' && init?.method === 'POST') {
          users.push(lee)
          return json(200, { user: lee, tempPassword: 'Tmp4aBcdEf9z' })
        }
        if (url === '/api/users') return json(200, [...users])
        return json(200, [])
      }),
    )
    render(
      <StaticAuth user={ADMIN}>
        <RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/admin'] })} />
      </StaticAuth>,
    )
    expect(await screen.findByText('관리자', { selector: 'td' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '사용자 추가' }))
    fireEvent.change(screen.getByLabelText('아이디'), { target: { value: 'lee' } })
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '이운전' } })
    fireEvent.click(screen.getByRole('radio', { name: /운전원/ }))
    fireEvent.click(screen.getByRole('button', { name: '추가' }))
    expect(await screen.findByText('Tmp4aBcdEf9z')).toBeInTheDocument()
    expect(await screen.findByText('이운전', { selector: 'td' })).toBeInTheDocument()
  })
})

describe('관리자 › 로그인 이력', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('목록을 보여 주고, 조건을 넣고 조회하면 그 주소로 다시 요청', async () => {
    const fetch = vi.fn(async (url: string) =>
      url.startsWith('/api/admin/login-history')
        ? json(200, [
            { id: 2, at: '2026-11-12T01:00:00Z', username: 'kim', result: 'FAIL', detail: '1번째 실패', ip: '10.0.0.2', userAgent: 'Edge' },
            { id: 1, at: '2026-11-12T00:00:00Z', username: 'admin', result: 'OK', detail: null, ip: '10.0.0.1', userAgent: 'Edge' },
          ])
        : json(200, []),
    )
    vi.stubGlobal('fetch', fetch)
    render(
      <StaticAuth user={ADMIN}>
        <RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/admin/login-history'] })} />
      </StaticAuth>,
    )
    expect(await screen.findByText('1번째 실패')).toBeInTheDocument()
    expect(screen.getByText('로그인 실패', { selector: '.kp-state' })).toBeInTheDocument()
    expect(screen.getByText('로그인', { selector: '.kp-state' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('사용자'), { target: { value: 'kim' } })
    fireEvent.change(screen.getByLabelText('결과'), { target: { value: 'FAIL' } })
    fireEvent.click(screen.getByRole('button', { name: '조회' }))
    await waitFor(() =>
      expect(fetch).toHaveBeenLastCalledWith('/api/admin/login-history?username=kim&result=FAIL&limit=200'),
    )
  })

  it('운전원은 관리자 화면 403', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, [])))
    render(
      <StaticAuth user={{ ...ADMIN, role: 'OPERATOR' }}>
        <RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/admin/login-history'] })} />
      </StaticAuth>,
    )
    expect(await screen.findByText('이 화면을 볼 권한이 없습니다')).toBeInTheDocument()
  })
})
```

Run: `npx vitest run src/pages/admin`
Expected: FAIL — `/admin` 라우트 없음(404 화면), `LoginHistoryPage` 없음.

- [ ] **Step 5: 관리자 틀·로그인 이력 화면·라우트 구현**

`web/src/pages/admin/AdminLayout.tsx`:
```tsx
import { NavLink, Outlet } from 'react-router'
import { UserMenu } from '../../components/UserMenu'
import { IconRail } from '../../layout/IconRail'

/** 관리자 (ADMIN): 어두운 아이콘 레일 + 흰 본문 · 밑줄 탭. 다른 관리 메뉴는 해당 단계에서 탭으로 추가 */
export function AdminLayout() {
  return (
    <div className="kp-shell">
      <IconRail active="admin" />
      <div className="kp-shell-main">
        <header className="kp-header">
          <h1 className="kp-current-menu">관리자</h1>
          <span className="spacer" />
          <UserMenu light />
        </header>
        <nav className="kp-tabs" aria-label="관리자 메뉴">
          <NavLink to="/admin/users">권한관리</NavLink>
          <NavLink to="/admin/login-history">로그인 이력</NavLink>
          <NavLink to="/admin/audit">감사 기록</NavLink>
        </nav>
        <main className="kp-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
```

`web/src/pages/admin/LoginHistoryPage.tsx`:
```tsx
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { apiJson } from '../../api/client'
import type { LoginEvent, LoginResult } from '../../api/types'
import { when } from './format'
import { EMPTY_FILTER, historyQuery, type HistoryFilter } from './historyQuery'

const RESULT: Record<LoginResult, { label: string; tone: string }> = {
  OK: { label: '로그인', tone: 'ok' },
  FAIL: { label: '로그인 실패', tone: 'warn' },
  LOCKED: { label: '잠김', tone: 'bad' },
  LOGOUT: { label: '로그아웃', tone: 'info' },
}

/** 관리자 › 로그인 이력: 사용자·결과·기간으로 찾기, 최근 200건 */
export function LoginHistoryPage() {
  const [filter, setFilter] = useState<HistoryFilter>(EMPTY_FILTER)
  const [rows, setRows] = useState<LoginEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback((f: HistoryFilter) => {
    setError(null)
    apiJson<LoginEvent[]>(historyQuery(f))
      .then(setRows)
      .catch((e: Error) => setError(e.message))
  }, [])
  useEffect(() => load(EMPTY_FILTER), [load])
  const submit = (e: FormEvent) => {
    e.preventDefault()
    load(filter)
  }
  const set = (patch: Partial<HistoryFilter>) => setFilter((f) => ({ ...f, ...patch }))
  return (
    <section className="kp-card kp-section" aria-label="로그인 이력">
      <div className="kp-section-head">
        <div>
          <h2>로그인 이력</h2>
          <p className="kp-desc">로그인 성공·실패·잠김·로그아웃 기록입니다. 최근 200건을 보여 줍니다.</p>
        </div>
      </div>
      <form className="kp-filter" onSubmit={submit}>
        <label className="kp-field">
          <span>사용자</span>
          <input className="kp-input" value={filter.username} onChange={(e) => set({ username: e.target.value })} />
        </label>
        <label className="kp-field">
          <span>결과</span>
          <select className="kp-input" value={filter.result} onChange={(e) => set({ result: e.target.value as HistoryFilter['result'] })}>
            <option value="">전체</option>
            {(Object.keys(RESULT) as LoginResult[]).map((r) => (
              <option key={r} value={r}>
                {RESULT[r].label}
              </option>
            ))}
          </select>
        </label>
        <label className="kp-field">
          <span>시작일</span>
          <input className="kp-input" type="date" value={filter.from} onChange={(e) => set({ from: e.target.value })} />
        </label>
        <label className="kp-field">
          <span>종료일</span>
          <input className="kp-input" type="date" value={filter.to} onChange={(e) => set({ to: e.target.value })} />
        </label>
        <button className="kp-btn kp-btn-primary" type="submit">
          조회
        </button>
      </form>
      {error && <p className="kp-error-text">{error}</p>}
      {rows === null ? (
        <p className="kp-desc">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="kp-desc">기록이 없습니다.</p>
      ) : (
        <table className="kp-table">
          <thead>
            <tr>
              <th>시각</th>
              <th>사용자</th>
              <th>결과</th>
              <th>내용</th>
              <th>IP</th>
              <th>브라우저</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const s = RESULT[r.result]
              return (
                <tr key={r.id}>
                  <td>{when(r.at)}</td>
                  <td className="mono">{r.username ?? '—'}</td>
                  <td>
                    <span className={`kp-state ${s.tone}`}>{s.label}</span>
                  </td>
                  <td>{r.detail ?? ''}</td>
                  <td className="mono muted">{r.ip ?? ''}</td>
                  <td className="muted" title={r.userAgent ?? ''}>
                    {(r.userAgent ?? '').slice(0, 40)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}
```

`kp-filter` 스타일을 `web/src/styles/app.css` 끝에 추가 (kp.css 는 원본 그대로 둠):
```css
/* 관리자 표 위 조회 조건 줄 */
.kp-filter { display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--kp-sp-12); margin-bottom: var(--kp-sp-16); }
.kp-filter .kp-field { min-width: 160px; }
```
(`kp-field`, `kp-input`, `kp-btn`, `kp-table`, `kp-state` 는 kp.css 에 있음 — `grep -n "kp-field\|kp-input" web/src/styles/kp.css` 로 확인. 없으면 위 블록에 `.kp-field { display: flex; flex-direction: column; gap: var(--kp-sp-6); font-size: var(--kp-text-13); }` 를 함께 추가.)

`web/src/routes.tsx` 를 아래로 바꾼다:
```tsx
import { Navigate, type RouteObject } from 'react-router'
import { RequireAuth } from './auth/RequireAuth'
import { AdminLayout } from './pages/admin/AdminLayout'
import { AuditPage } from './pages/admin/AuditPage'
import { LoginHistoryPage } from './pages/admin/LoginHistoryPage'
import { UsersPage } from './pages/admin/UsersPage'
import { ErrorPage } from './pages/ErrorPage'
import { FactoryPage } from './pages/FactoryPage'
import { LoginPage } from './pages/LoginPage'
import { PasswordPage } from './pages/PasswordPage'

// errorElement = 화면을 그리다 난 예외 → 500 페이지. 로그인 화면 말고는 모두 로그인 필요
export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/password', element: <RequireAuth><PasswordPage /></RequireAuth> },
  { path: '/', element: <RequireAuth><FactoryPage /></RequireAuth>, errorElement: <ErrorPage code="500" /> },
  {
    path: '/admin',
    element: <RequireAuth role="ADMIN"><AdminLayout /></RequireAuth>,
    errorElement: <ErrorPage code="500" />,
    children: [
      { index: true, element: <Navigate to="users" replace /> },
      { path: 'users', element: <UsersPage /> },
      { path: 'login-history', element: <LoginHistoryPage /> },
      { path: 'audit', element: <AuditPage /> },
    ],
  },
  { path: '*', element: <ErrorPage code="404" /> },
]
```

- [ ] **Step 6: 전체 테스트·빌드·린트**

```bash
cd /c/kopens/project/Factory3D/web && npm test && npm run build && npm run lint
```
Expected: 모두 PASS, 빌드·린트 오류 0.

- [ ] **Step 7: Commit**

```bash
cd /c/kopens/project/Factory3D
git add web
git commit -m "feat(web): 관리자 화면 — 권한관리 · 로그인 이력 · 감사 기록

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: jar 하나로 실행 + 실제 화면 확인 + README

**Files:**
- Create: `web/e2e/p1-smoke.mjs`, `README.md`

**Interfaces:**
- Consumes: 전부 (Task 1~5)

- [ ] **Step 1: 실제 화면 확인 스크립트 작성**

`web/e2e/p1-smoke.mjs`:
```js
// P1 실제 화면 확인: 첫 관리자 로그인 → 비밀번호 변경 → 3D 공장 화면 → 관리자 › 로그인 이력. 스크린샷은 e2e/shots/
// 사용: 깨끗한 DB 로 서버를 F3D_ADMIN_PASSWORD=<처음 비밀번호> 로 띄운 뒤
//   node e2e/p1-smoke.mjs <주소> <처음 비밀번호> <새 비밀번호>
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const [base = 'http://localhost:8080', first = 'Start1234', next = 'Factory3d1!'] = process.argv.slice(2)
mkdirSync('e2e/shots', { recursive: true })
const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const fail = (msg) => {
  console.error('실패:', msg)
  process.exitCode = 1
}

await page.goto(base + '/')
await page.waitForURL(/\/login/)
await page.screenshot({ path: 'e2e/shots/1-login.png' })
await page.getByLabel('아이디').fill('admin')
await page.getByLabel('비밀번호').fill(first)
await page.getByRole('button', { name: '로그인' }).click()
await page.waitForURL(/\/password/)
await page.getByLabel('현재 비밀번호').fill(first)
await page.getByLabel('새 비밀번호', { exact: true }).fill(next)
await page.getByLabel('새 비밀번호 확인').fill(next)
await page.getByRole('button', { name: /변경/ }).click()
await page.waitForURL((u) => u.pathname === '/')
await page.getByText('등록된 도면이 없습니다').waitFor()
await page.screenshot({ path: 'e2e/shots/2-factory.png' })
if (!(await page.getByRole('combobox', { name: '도면 선택' }).isDisabled())) fail('도면이 없는데 select 가 켜져 있음')

await page.getByRole('button', { name: '관리자' }).click()
await page.waitForURL(/\/admin\/users/)
await page.getByRole('link', { name: '로그인 이력' }).click()
await page.locator('table.kp-table .kp-state', { hasText: '로그인' }).first().waitFor()
await page.screenshot({ path: 'e2e/shots/3-login-history.png' })
const rows = await page.locator('table.kp-table tbody tr').count()
if (rows < 1) fail('로그인 이력이 비어 있음')

await browser.close()
console.log(process.exitCode ? 'P1 화면 확인 실패' : `P1 화면 확인 통과 (로그인 이력 ${rows}건)`)
```
> PasswordPage 의 라벨 문구가 다르면(`grep -n "label\|<span" web/src/pages/PasswordPage.tsx`) 스크립트의 `getByLabel` 문구를 그 화면의 실제 라벨로 맞춘다.

- [ ] **Step 2: jar 빌드**

```bash
cd /c/kopens/project/Factory3D/server && ./gradlew bootJar
ls -la build/libs/
```
Expected: `BUILD SUCCESSFUL`, `build/libs/factory3d.jar` 생성(웹 빌드 포함).

- [ ] **Step 3: 개발 DB 를 비우고 jar 로 실행 (백그라운드)**

```bash
PGPASSWORD=factory3d "/c/Program Files/PostgreSQL/17/bin/psql.exe" -h localhost -p 5433 -U factory3d -d factory3d -c "drop schema public cascade; create schema public;"
cd /c/kopens/project/Factory3D/server && F3D_ADMIN_PASSWORD=Start1234 F3D_DATA_DIR=../data "$HOME/.gradle/jdks/eclipse_adoptium-21-amd64-windows.2/bin/java" -jar build/libs/factory3d.jar
```
(두 번째 명령은 `run_in_background` 로 실행. JDK 경로가 다르면 `ls ~/.gradle/jdks` 로 찾은 21 버전 `bin/java` 사용)
확인: `curl -s localhost:8080/api/health` → `{"status":"ok"}` (뜰 때까지 수 초 기다리며 재시도)

- [ ] **Step 4: 실제 화면 확인 실행**

```bash
cd /c/kopens/project/Factory3D/web && node e2e/p1-smoke.mjs http://localhost:8080 Start1234 Factory3d1!
```
Expected: `P1 화면 확인 통과 (로그인 이력 1건)` 이상. `e2e/shots/1-login.png`, `2-factory.png`, `3-login-history.png` 를 Read 로 열어 눈으로 확인: 로그인 카드에 `FACTORY 3D`, 메인 화면 왼쪽 레일(3D 공장 활성·상황판/실행/AI 챗봇 흐림·아래 관리자), 위 도면 select(`등록된 도면 없음`)와 `도면 추가`(흐림), 가운데 안내 문구, 관리자 화면 탭 3개와 로그인 이력 표.

확인 후 서버 프로세스를 종료한다.

- [ ] **Step 5: README 작성**

`C:\kopens\project\Factory3D\README.md`:
````markdown
# Factory3D

2D 도면을 3D 공장으로 불러오고, 도면별 객체 배치 · 실시간 상황판 · 생산 동작 · AI 챗봇 · 관리자 기능을 갖춘 웹 플랫폼.
설계: `docs/superpowers/specs/2026-11-12-factory3d-platform-design.md`

## 준비 (한 번)
- Node 20+, Java 17+ (빌드가 JDK 21 을 자동으로 받음), PostgreSQL 17 (localhost:5433)
- DB·계정 만들기:
  ```
  "C:\Program Files\PostgreSQL\17\bin\psql.exe" -h localhost -p 5433 -U postgres -f scripts/setup-db.sql
  ```
- `cd web && npm install`

## 개발 실행
```
cd server && ./gradlew bootRun      # http://localhost:8080 (API)
cd web && npm run dev               # http://localhost:5200 (화면, /api 는 8080 으로)
```
처음 실행하면 관리자 `admin` 이 만들어집니다. 비밀번호는 환경 변수 `F3D_ADMIN_PASSWORD`, 비우면 서버 로그에 한 번 출력. 첫 로그인 때 변경해야 합니다.

## 배포 (jar 하나 + PostgreSQL)
```
cd server && ./gradlew bootJar      # build/libs/factory3d.jar (화면 포함)
java -jar factory3d.jar             # Java 21
```
| 환경 변수 | 기본값 |
|---|---|
| `F3D_DB_URL` | `jdbc:postgresql://localhost:5433/factory3d` |
| `F3D_DB_USER` / `F3D_DB_PASSWORD` | `factory3d` / `factory3d` |
| `F3D_PORT` | `8080` |
| `F3D_DATA_DIR` | `../data` (업로드 파일) |
| `F3D_ADMIN_PASSWORD` | 비면 임의 생성 |

## 테스트
```
cd server && ./gradlew test         # 테스트 DB factory3d_test 를 매번 비우고 씀
cd web && npm test
cd web && node e2e/p1-smoke.mjs http://localhost:8080 <처음 비밀번호> <새 비밀번호>   # 깨끗한 DB 의 실행 중인 서버로
```
````

- [ ] **Step 6: Commit**

```bash
cd /c/kopens/project/Factory3D
git add README.md web/e2e/p1-smoke.mjs
git commit -m "chore: jar 실행 확인 스크립트 · README

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
