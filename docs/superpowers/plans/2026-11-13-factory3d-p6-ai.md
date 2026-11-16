# Factory3D P6 AI 챗봇 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 3D 공장 화면 옆 AI 챗봇 패널에서 한국어로 요청하면 서버가 공식 Anthropic Java SDK 로 Claude 를 불러 도구(장면 읽기·쓰기 제안)로 **변경 제안 묶음**만 만들고, 화면이 3D 유령 미리보기 → `적용 / 취소` → 적용 시 한 트랜잭션 저장 + `change_log`(사람/AI) + 되돌리기를 하며, 관리자 › Claude API 관리 · 변경 이력 · AI 사용량 화면을 더한다.

**Architecture:** 서버 `ai` 패키지는 설정·키 암호화(`AiSettingService`·`KeyCrypto`) · 사용량(`AiUsageService`·`Pricing`) · Claude 호출 경계(`ClaudeGateway` 인터페이스 — 실제 `AnthropicGateway`(SDK 베타 메시지 + 스트리밍) / 가짜 `FakeGateway`(대본)) · 도구(`SceneTools`, DB 를 안 바꾸고 `Changeset` 에만 쌓음) · 대화 루프(`ChatService` → SSE) · 적용(`ApplyService`)으로 나누고, `change` 패키지가 변경 이력(사용자 편집도 같은 트랜잭션에 기록)·되돌리기를 맡는다. 대화 기록은 게이트웨이가 가진 불투명 `Transcript` 에 응답 content 를 그대로(생각 블록 포함) 붙인다. 화면은 순수 모듈(SSE 파서·챗 reducer·미리보기 계산)을 `web/src/ai/` 에 두고 vitest 로 검증하며, 3D 쪽은 `FactoryScene` 에 미리보기 레이어(`PreviewHost`)만 더한다.

**Tech Stack:** Spring Boot 4.1.1 (webmvc · security · session-jdbc) · MyBatis · PostgreSQL 17 · Jackson 3 (`tools.jackson.databind`) · `com.anthropic:anthropic-java:3.8.0` (안에서 Jackson 2 를 씀 — 섞지 않음) / React 19 · TS · three@0.186.1 · lucide-react · vitest · Playwright(Edge)

**Spec:** `docs/superpowers/specs/2026-11-13-factory3d-p6-ai-design.md` (전체 설계 `docs/superpowers/specs/2026-11-12-factory3d-platform-design.md` §4.3·§5.6·§5.8)

## Global Constraints

- 프로젝트 루트 `C:\kopens\project\Factory3D`, 브랜치 `p6-ai`. `master` 는 건드리지 않는다. `C:\kopens\project\demo`, `C:\kopens\project\3D_WEB` 는 **수정 금지**.
- Docker·Testcontainers 금지. 서버 테스트는 로컬 PostgreSQL 17 `localhost:5433` 의 `factory3d_test` (support/IntegrationTest — 매 테스트 전 `pg_tables` 의 모든 표를 truncate: `ai_setting` 한 줄도 지워지므로 서비스가 `insert … on conflict do nothing` 으로 다시 만든다).
- **테스트는 실제 Claude API 를 절대 부르지 않는다.** `ClaudeGateway` 뒤에 숨기고, `factory3d.ai.fake=true`(환경 변수 `F3D_AI_FAKE`)면 `FakeGateway`(정해 둔 대본). IntegrationTest 는 fake=true · 고정 테스트 마스터 키. `AnthropicGateway` 는 컴파일 + 요청 만들기·응답 읽기 단위 테스트(네트워크 없음)만.
- Claude 호출 규칙 (claude-api 스킬 문서 + SDK 3.8.0 jar 에서 확인한 이름만 씀):
  - 모델 ID 정확히 `claude-opus-5-5`(기본) · `claude-sonnet-5-5` · `claude-haiku-5-5`. 날짜 접미사 없음.
  - 베타 메시지 엔드포인트 `client.beta().messages().createStreaming(params)` (`com.anthropic.models.beta.messages.MessageCreateParams`), 응답은 `BetaMessageAccumulator` 로 모음.
  - `thinking` 은 보내지 않음(Opus 5.5 = 적응형, 끄면 400) · `outputConfig(BetaOutputConfig.builder().effort(BetaOutputConfig.Effort.MEDIUM))` 명시 · `budget_tokens`·온도·top_p 안 씀.
  - `toolChoice(BetaToolChoiceAuto)` 만 (Opus/Sonnet 5.5 에 any/tool 은 400). 각 도구 `strict(true)` + input_schema `additionalProperties: false`.
  - 거절 대비: `addBeta(AnthropicBeta.SERVER_SIDE_FALLBACK_2026_07_01)` + `fallbacksDefault()` (`fallbacks: "default"`). **Haiku 5.5 는 서버측 fallback 이 없어 보내지 않음**(목록이면 400).
  - `stopReason() == BetaStopReason.REFUSAL` 을 content 보다 먼저 확인. 응답 content 는 **그대로**(생각 블록 포함) `BetaContentBlock.toParam()` 으로 다음 요청에 붙임 (예외: 중간 fallback 이면 마지막 `fallback` 블록 앞의 thinking·redacted_thinking·tool_use 는 뺀다 — 문서 규칙).
  - 시스템 프롬프트 고정 문구 1블록 + `cacheControl(BetaCacheControlEphemeral TTL_5M)` (도구 → 시스템 순으로 함께 캐시). 도면 이름·시각은 첫 사용자 메시지 앞 `[ … ]` 줄로.
  - 오류는 SDK 타입별 예외(`UnauthorizedException`·`PermissionDeniedException`·`RateLimitException`·`InternalServerException`·`SseException`·`AnthropicServiceException`·`AnthropicIoException`·`AnthropicRetryableException`)로 구분 — 문자열 비교 금지.
- Jackson: 우리 코드는 Jackson 3(`tools.jackson.databind.ObjectMapper`, 주석은 `com.fasterxml.jackson.annotation.*`). SDK 의 Jackson 2(`com.fasterxml.jackson.databind`)는 `AnthropicGateway` 안(과 그 테스트)에서만. Spring 에 Jackson 2 ObjectMapper 빈을 만들지 않는다.
- 이름 규칙: Java 패키지 `com.kopens.factory3d`, 설정 `factory3d.*`, 환경 변수 `F3D_*`, localStorage `f3d:*`.
- 권한: `/api/ai/status` 조회 이상 · 챗봇(`/api/ai/**` 쓰기)·되돌리기(`/api/changes/*/revert`) 운전원 이상 · `/api/admin/**`·`GET /api/changes` 관리자. 공정 항목 적용은 관리자만(운전원이면 skipped).
- 모든 사용자 문구·오류는 한국어. `border-left` 강조선·이모지 금지, 아이콘 lucide-react, 라벨 약 13~15px.
- Java 테스트 메서드 이름에 `·` 쓰지 않음 (밑줄).
- 커밋 메시지 끝에 빈 줄 + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. `.superpowers/`·`web/e2e/shots/` 는 커밋하지 않음.
- 웹: `cd web && npx vitest run` (출력에 경고 없이), `npm run build`, `./node_modules/.bin/oxlint`. 서버: `cd server && ./gradlew test`.
- TS 설정: verbatimModuleSyntax(`import type`), noUnusedLocals, erasableSyntaxOnly(매개변수 속성 금지). 세미콜론 없음, 작은따옴표.
- 실제 화면 확인은 **포트 8081 · DB `factory3d_test`(사용자/비밀번호 `factory3d_test`, 시작 전 schema 지우고 다시 만듦) · 임시 데이터 폴더 · `F3D_ADMIN_PASSWORD=Start1234` · `F3D_AI_FAKE=true` · `F3D_AI_MASTER_KEY=MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=` · `java -Xmx768m`** 로만. 포트 8080, DB `factory3d`, 저장소 `data/` 는 사용자의 서버가 쓰므로 **절대 건드리지 않는다**.

## 파일 구조

```
server/build.gradle                                   (com.anthropic:anthropic-java:3.8.0)
server/src/main/resources/application.yml             (factory3d.ai.fake · master-key)
server/src/main/resources/db/migration/V6__ai_change.sql   (ai_setting · ai_usage · change_log)
server/src/main/resources/mapper/AiSettingMapper.xml · AiUsageMapper.xml · ChangeLogMapper.xml
server/src/main/java/com/kopens/factory3d/
  ai/   KeyCrypto · AiSettingMapper · AiSettingService · AiAdminController · AiStatusController
        Pricing · AiUsageMapper · AiUsageService · UsageRow
        ClaudeGateway · Transcript · AiCallException · AnthropicGateway · FakeGateway · AiConfig
        Changeset · ProposalStore · SceneTools · Prompts
        ChatSink · ChatService · ChatController · ApplyService · AiChangeController
  change/ ChangeEntry · ChangeLogMapper · ChangeLogService · ChangeController · RevertService
  placement/PlacementService.java (사용자 편집 → change_log USER)
  common/SecurityConfig.java (GET /api/changes 관리자)
server/src/test/java/com/kopens/factory3d/
  ai/   KeyCryptoTest · AiStatusTest · PricingTest · AiSettingApiTest · AnthropicGatewayTest · FakeGatewayTest
        AiTestBase · SceneToolsTest · ChatApiTest · ApplyRevertApiTest · AiUsageApiTest
  change/ ChangeLogApiTest
  support/IntegrationTest.java (factory3d.ai.fake=true · 테스트 마스터 키)

web/src/ai/ types.ts · api.ts · sse.ts · useAiStatus.ts · useChat.ts (+ sse.test.ts · chat.test.ts)
            preview.ts (+ preview.test.ts) · ChatPanel.tsx · ProposalCard.tsx (+ ChatPanel.test.tsx · chatPage.test.tsx)
web/src/scene/previewLayer.ts (+ previewLayer.test.ts) · FactoryScene.ts (PreviewHost)
web/src/layout/IconRail.tsx (AI 챗봇 버튼·안내) · web/src/pages/FactoryPage.tsx (옆 패널 objects|chat · 미리보기)
web/src/pages/admin/AiSettingsPage.tsx · ChangesPage.tsx · changeSummary.ts · AiUsagePage.tsx · AdminLayout.tsx (+ ai-admin.test.tsx)
web/src/routes.tsx · web/src/styles/app.css · web/e2e/p6-smoke.mjs · README.md
```

---

### Task 1: 서버 — V6 표 · 키 암호화 · Claude API 설정 · 상태 · 사용량 기록·월 한도

**Files:**
- Create: `server/src/main/resources/db/migration/V6__ai_change.sql`
- Create: `server/src/main/java/com/kopens/factory3d/ai/{KeyCrypto,AiSettingMapper,AiSettingService,AiAdminController,AiStatusController,Pricing,AiUsageMapper,AiUsageService,UsageRow}.java`, `server/src/main/resources/mapper/{AiSettingMapper,AiUsageMapper}.xml`
- Modify: `server/src/main/resources/application.yml`, `server/src/test/java/com/kopens/factory3d/support/IntegrationTest.java`
- Test: `server/src/test/java/com/kopens/factory3d/ai/{KeyCryptoTest,AiStatusTest,PricingTest,AiSettingApiTest}.java`

**Interfaces:**
- Consumes: `AuditService.log(action, target, detail)`, `BadRequestException` (common).
- Produces (REST): `GET /api/ai/status` → `{enabled, reason}` (reason: `no-master-key`·`no-key`·`disabled`·`over-limit`·null) · `GET /api/admin/ai` → `{hasKey, keyHint, model, monthlyLimitUsd, enabled, masterKey, updatedBy, updatedAt}` · `PUT /api/admin/ai` `{model?, monthlyLimitUsd?, enabled?}` · `PUT /api/admin/ai/key` `{apiKey}` · `DELETE /api/admin/ai/key`. 감사 `AI_KEY_SET`·`AI_KEY_DELETE`·`AI_SETTING`.
- Produces (Java, 뒤 Task 가 씀):
  - `KeyCrypto(String masterKeyBase64)`: `boolean available()`, `byte[] encrypt(String)`, `String decrypt(byte[])`, 상수 `NO_MASTER`.
  - `AiSettingService`: `View view()`, `View update(Update, String by)`, `View setKey(String apiKey, String by)`, `View deleteKey(String by)`, `Status status()`, `Active requireKey()` (평문 키·모델 — 서버 안에서만), `static final List<String> MODELS`, `static String reason(boolean masterKey, boolean hasKey, boolean enabled, boolean overLimit)`, `static String reasonText(String reason)`. 레코드 `Update(String model, BigDecimal monthlyLimitUsd, Boolean enabled)`, `Status(boolean enabled, String reason)`, `Active(String apiKey, String model)`.
  - `Pricing.cost(String model, long input, long output, long cacheRead, long cacheWrite): BigDecimal` (USD, 소수 6자리).
  - `AiUsageService`: `BigDecimal record(String username, Long drawingId, String model, long input, long output, long cacheRead, long cacheWrite, String purpose)`, `BigDecimal monthCost()`, `OffsetDateTime[] monthRange()`.
- Produces (DB): `ai_setting`(id=1 한 줄) · `ai_usage` · `change_log` (change_log 는 Task 2 가 씀).

- [ ] **Step 1: 마이그레이션 작성**

`server/src/main/resources/db/migration/V6__ai_change.sql`:
```sql
-- Claude API 설정: 한 줄(id=1). 키는 AES-GCM 암호문(iv 12바이트 + 본문), 화면에는 key_hint 만
create table ai_setting (
    id                 int           primary key default 1 check (id = 1),
    api_key_enc        bytea,
    key_hint           varchar(16),
    model              varchar(40)   not null default 'claude-opus-5-5'
                       check (model in ('claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5')),
    monthly_limit_usd  numeric(10,2) not null default 50 check (monthly_limit_usd >= 0),
    enabled            boolean       not null default false,
    updated_by         varchar(32),
    updated_at         timestamptz   not null default now()
);
insert into ai_setting (id) values (1);

-- 호출마다 한 줄 (토큰·추정 비용). purpose: chat(챗봇) · test(연결 테스트) · vision(P7)
create table ai_usage (
    id                  bigserial     primary key,
    at                  timestamptz   not null default now(),
    username            varchar(32),
    drawing_id          bigint        references drawing (id) on delete set null,
    model               varchar(40)   not null,
    input_tokens        bigint        not null default 0,
    output_tokens       bigint        not null default 0,
    cache_read_tokens   bigint        not null default 0,
    cache_write_tokens  bigint        not null default 0,
    cost_usd            numeric(12,6) not null default 0,
    purpose             varchar(16)   not null check (purpose in ('chat', 'test', 'vision'))
);
create index ai_usage_at on ai_usage (at);

-- 변경 이력 (사람/AI). batch_id = 한 번에 바뀐 묶음(AI 제안 묶음 id, 사람 편집 1회). target_key = 되돌리기 충돌 검사용
-- (placement:<id> · station:<id> · partition:<id> · zone:<id>)
create table change_log (
    id           bigserial    primary key,
    at           timestamptz  not null default now(),
    username     varchar(32),
    source       varchar(4)   not null check (source in ('USER', 'AI')),
    drawing_id   bigint       not null references drawing (id) on delete cascade,
    batch_id     uuid         not null,
    kind         varchar(32)  not null,
    target       varchar(100),
    target_key   varchar(64)  not null,
    before       jsonb,
    after        jsonb,
    reverted     boolean      not null default false,
    reverted_by  varchar(32),
    reverted_at  timestamptz
);
create index change_log_drawing on change_log (drawing_id, id desc);
create index change_log_batch on change_log (batch_id);
create index change_log_target on change_log (drawing_id, target_key, id);
```

- [ ] **Step 2: 설정 · 테스트 바탕**

`server/src/main/resources/application.yml` 의 `factory3d:` 아래 `live:` 블록 뒤에 추가:
```yaml
  ai:
    fake: ${F3D_AI_FAKE:false}            # true = 가짜 게이트웨이(정해 둔 대본). 실제 Claude 를 부르지 않음 (테스트·화면 확인)
    master-key: ${F3D_AI_MASTER_KEY:}     # base64 32바이트 — API 키 암호화(AES-GCM). 없으면 키 등록 불가
```

`server/src/test/java/com/kopens/factory3d/support/IntegrationTest.java` 의 `props` 끝에 두 줄 추가:
```java
        r.add("factory3d.ai.fake", () -> "true"); // 테스트는 실제 Claude 를 부르지 않음
        r.add("factory3d.ai.master-key", () -> "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="); // base64("0123456789abcdef" × 2) = 32바이트
```

- [ ] **Step 3: 실패 테스트 작성 (단위)**

`server/src/test/java/com/kopens/factory3d/ai/KeyCryptoTest.java`:
```java
package com.kopens.factory3d.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kopens.factory3d.common.BadRequestException;
import java.util.Base64;
import org.junit.jupiter.api.Test;

class KeyCryptoTest {
    static final String MASTER = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

    @Test
    void 암호화_왕복과_매번_다른_암호문() {
        KeyCrypto c = new KeyCrypto(MASTER);
        assertThat(c.available()).isTrue();
        byte[] a = c.encrypt("sk-ant-api03-hello");
        byte[] b = c.encrypt("sk-ant-api03-hello");
        assertThat(a).isNotEqualTo(b); // iv 가 매번 다름
        assertThat(new String(a)).doesNotContain("hello");
        assertThat(c.decrypt(a)).isEqualTo("sk-ant-api03-hello");
        assertThat(c.decrypt(b)).isEqualTo("sk-ant-api03-hello");
    }

    @Test
    void 마스터_키가_없거나_형식이_틀리면_쓸_수_없음() {
        assertThat(new KeyCrypto("").available()).isFalse();
        assertThat(new KeyCrypto(null).available()).isFalse();
        assertThat(new KeyCrypto("@@@ not base64").available()).isFalse();
        assertThat(new KeyCrypto(Base64.getEncoder().encodeToString(new byte[31])).available()).isFalse();
        assertThatThrownBy(() -> new KeyCrypto("").encrypt("x"))
                .isInstanceOf(BadRequestException.class).hasMessage(KeyCrypto.NO_MASTER);
    }

    @Test
    void 다른_마스터_키로는_풀지_못함() {
        byte[] enc = new KeyCrypto(MASTER).encrypt("sk-ant-secret");
        KeyCrypto other = new KeyCrypto(Base64.getEncoder().encodeToString("zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz".getBytes()));
        assertThatThrownBy(() -> other.decrypt(enc)).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("마스터 키가 바뀌었을 수 있습니다");
    }
}
```

`server/src/test/java/com/kopens/factory3d/ai/AiStatusTest.java`:
```java
package com.kopens.factory3d.ai;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class AiStatusTest {
    @Test
    void 막는_이유는_마스터키_키_사용여부_한도_순() {
        assertThat(AiSettingService.reason(false, false, false, true)).isEqualTo("no-master-key");
        assertThat(AiSettingService.reason(true, false, true, true)).isEqualTo("no-key");
        assertThat(AiSettingService.reason(true, true, false, true)).isEqualTo("disabled");
        assertThat(AiSettingService.reason(true, true, true, true)).isEqualTo("over-limit");
        assertThat(AiSettingService.reason(true, true, true, false)).isNull();
    }

    @Test
    void 이유마다_한국어_안내() {
        assertThat(AiSettingService.reasonText("no-key")).isEqualTo("Claude API 키가 등록되지 않았습니다 (관리자 › Claude API 관리)");
        assertThat(AiSettingService.reasonText("over-limit")).isEqualTo("이번 달 AI 사용 한도를 넘었습니다");
        assertThat(AiSettingService.reasonText("disabled")).isEqualTo("AI 챗봇이 사용 중지되어 있습니다 (관리자 › Claude API 관리)");
        assertThat(AiSettingService.reasonText("no-master-key")).isEqualTo("서버에 F3D_AI_MASTER_KEY 가 설정되지 않았습니다");
    }
}
```

`server/src/test/java/com/kopens/factory3d/ai/PricingTest.java`:
```java
package com.kopens.factory3d.ai;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class PricingTest {
    @Test
    void 모델별_백만_토큰_가격() {
        assertThat(Pricing.cost("claude-opus-5-5", 1_000_000, 0, 0, 0)).isEqualByComparingTo("4");
        assertThat(Pricing.cost("claude-opus-5-5", 0, 1_000_000, 0, 0)).isEqualByComparingTo("20");
        assertThat(Pricing.cost("claude-opus-5-5", 0, 0, 1_000_000, 1_000_000)).isEqualByComparingTo("5.20");
        assertThat(Pricing.cost("claude-sonnet-5-5", 1_000_000, 1_000_000, 1_000_000, 1_000_000)).isEqualByComparingTo("14.60");
        assertThat(Pricing.cost("claude-haiku-5-5", 1_000_000, 1_000_000, 1_000_000, 1_000_000)).isEqualByComparingTo("0.735");
    }

    @Test
    void 작은_호출은_소수_6자리_모르는_모델은_opus_가격() {
        BigDecimal c = Pricing.cost("claude-opus-5-5", 1200, 60, 0, 1000);
        assertThat(c.scale()).isEqualTo(6);
        assertThat(c).isEqualByComparingTo("0.011000"); // 1200×4 + 60×20 + 1000×5 = 11000 / 1M
        assertThat(Pricing.cost("claude-opus-4-8", 1_000_000, 0, 0, 0)).isEqualByComparingTo("4"); // fallback 모델 등
    }
}
```

- [ ] **Step 4: 실패 테스트 작성 (API)**

`server/src/test/java/com/kopens/factory3d/ai/AiSettingApiTest.java`:
```java
package com.kopens.factory3d.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.kopens.factory3d.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

class AiSettingApiTest extends IntegrationTest {
    static final RequestPostProcessor VIEWER = user("viewer").roles("VIEWER");
    static final RequestPostProcessor OPERATOR = user("kim").roles("OPERATOR");
    static final RequestPostProcessor ADMIN = user("admin").roles("ADMIN");
    static final String KEY = "sk-ant-api03-test-key-00000000abcd";

    @Autowired AiUsageService usage;

    private ResultActions putJson(String url, String body, RequestPostProcessor who) throws Exception {
        return mvc.perform(put(url).contentType(MediaType.APPLICATION_JSON).content(body).with(who).with(csrf()));
    }

    @Test
    void 처음에는_키_없음과_기본값() throws Exception {
        mvc.perform(get("/api/ai/status").with(VIEWER)).andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(false)).andExpect(jsonPath("$.reason").value("no-key"));
        mvc.perform(get("/api/admin/ai").with(ADMIN)).andExpect(status().isOk())
                .andExpect(jsonPath("$.hasKey").value(false))
                .andExpect(jsonPath("$.model").value("claude-opus-5-5"))
                .andExpect(jsonPath("$.monthlyLimitUsd").value(50.0))
                .andExpect(jsonPath("$.enabled").value(false))
                .andExpect(jsonPath("$.masterKey").value(true));
    }

    @Test
    void 키는_암호화해_저장하고_힌트만_보임() throws Exception {
        putJson("/api/admin/ai/key", "{\"apiKey\":\"short\"}", ADMIN).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("API 키 형식이 올바르지 않습니다."));
        putJson("/api/admin/ai/key", "{\"apiKey\":\"" + KEY + "\"}", ADMIN).andExpect(status().isOk())
                .andExpect(jsonPath("$.hasKey").value(true))
                .andExpect(jsonPath("$.keyHint").value("sk-ant-…abcd"))
                .andExpect(content().string(not(containsString(KEY))));
        byte[] enc = jdbc.queryForObject("select api_key_enc from ai_setting where id = 1", byte[].class);
        assertThat(new String(enc)).doesNotContain(KEY);
        mvc.perform(get("/api/ai/status").with(VIEWER)).andExpect(jsonPath("$.reason").value("disabled"));
        putJson("/api/admin/ai", "{\"enabled\":true}", ADMIN).andExpect(status().isOk()).andExpect(jsonPath("$.enabled").value(true));
        mvc.perform(get("/api/ai/status").with(VIEWER))
                .andExpect(jsonPath("$.enabled").value(true)).andExpect(jsonPath("$.reason").isEmpty());
        mvc.perform(get("/api/admin/ai").with(ADMIN)).andExpect(content().string(not(containsString(KEY))));
        assertThat(jdbc.queryForObject("select count(*) from audit_log where action = 'AI_KEY_SET'", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from audit_log where action = 'AI_SETTING'", Integer.class)).isEqualTo(1);
    }

    @Test
    void 모델과_한도_검사() throws Exception {
        putJson("/api/admin/ai", "{\"model\":\"claude-opus-4-8\"}", ADMIN).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("모델은 claude-opus-5-5, claude-sonnet-5-5, claude-haiku-5-5 중 하나입니다."));
        putJson("/api/admin/ai", "{\"monthlyLimitUsd\":-1}", ADMIN).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("월 한도는 0 이상 USD 로 입력하세요."));
        putJson("/api/admin/ai", "{\"model\":\"claude-sonnet-5-5\",\"monthlyLimitUsd\":12.5}", ADMIN).andExpect(status().isOk())
                .andExpect(jsonPath("$.model").value("claude-sonnet-5-5"))
                .andExpect(jsonPath("$.monthlyLimitUsd").value(12.5))
                .andExpect(jsonPath("$.updatedBy").value("admin"));
    }

    @Test
    void 키_삭제() throws Exception {
        putJson("/api/admin/ai/key", "{\"apiKey\":\"" + KEY + "\"}", ADMIN).andExpect(status().isOk());
        mvc.perform(delete("/api/admin/ai/key").with(ADMIN).with(csrf())).andExpect(status().isOk())
                .andExpect(jsonPath("$.hasKey").value(false)).andExpect(jsonPath("$.keyHint").isEmpty());
        mvc.perform(get("/api/ai/status").with(VIEWER)).andExpect(jsonPath("$.reason").value("no-key"));
        assertThat(jdbc.queryForObject("select count(*) from audit_log where action = 'AI_KEY_DELETE'", Integer.class)).isEqualTo(1);
    }

    @Test
    void 관리자만_설정_조회는_누구나() throws Exception {
        mvc.perform(get("/api/admin/ai").with(OPERATOR)).andExpect(status().isForbidden());
        putJson("/api/admin/ai/key", "{\"apiKey\":\"" + KEY + "\"}", OPERATOR).andExpect(status().isForbidden());
        mvc.perform(get("/api/ai/status").with(VIEWER)).andExpect(status().isOk());
    }

    @Test
    void 이번_달_한도를_넘으면_막음() throws Exception {
        putJson("/api/admin/ai/key", "{\"apiKey\":\"" + KEY + "\"}", ADMIN);
        putJson("/api/admin/ai", "{\"enabled\":true,\"monthlyLimitUsd\":1}", ADMIN);
        usage.record("kim", null, "claude-opus-5-5", 100_000, 10_000, 0, 0, "chat"); // 0.6 USD
        mvc.perform(get("/api/ai/status").with(VIEWER)).andExpect(jsonPath("$.enabled").value(true));
        usage.record("kim", null, "claude-opus-5-5", 100_000, 10_000, 0, 0, "chat"); // 합계 1.2 USD
        mvc.perform(get("/api/ai/status").with(VIEWER))
                .andExpect(jsonPath("$.enabled").value(false)).andExpect(jsonPath("$.reason").value("over-limit"));
        assertThat(jdbc.queryForObject("select sum(cost_usd) from ai_usage", java.math.BigDecimal.class)).isEqualByComparingTo("1.2");
    }
}
```

- [ ] **Step 5: 테스트 실패 확인**

Run: `cd server && ./gradlew test --tests 'com.kopens.factory3d.ai.*'`
Expected: 컴파일 실패 (`KeyCrypto`·`AiSettingService`·`Pricing`·`AiUsageService` 없음)

- [ ] **Step 6: 키 암호화 · 가격**

`server/src/main/java/com/kopens/factory3d/ai/KeyCrypto.java`:
```java
package com.kopens.factory3d.ai;

import com.kopens.factory3d.common.BadRequestException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Claude API 키 암호화 (AES-256-GCM). 저장 형식 = iv 12바이트 + 암호문·태그. 마스터 키는 F3D_AI_MASTER_KEY (base64 32바이트) */
@Component
public class KeyCrypto {
    public static final String NO_MASTER = "F3D_AI_MASTER_KEY 가 설정되지 않아 키를 저장할 수 없습니다";
    private static final Logger log = LoggerFactory.getLogger(KeyCrypto.class);
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;

    private final SecretKey key; // null = 마스터 키 없음
    private final SecureRandom random = new SecureRandom();

    public KeyCrypto(@Value("${factory3d.ai.master-key:}") String masterKey) {
        this.key = parse(masterKey);
    }

    static SecretKey parse(String b64) {
        if (b64 == null || b64.isBlank()) return null;
        try {
            byte[] raw = Base64.getDecoder().decode(b64.strip());
            if (raw.length == 32) return new SecretKeySpec(raw, "AES");
            log.warn("F3D_AI_MASTER_KEY 는 base64 32바이트여야 합니다 (지금 {}바이트) — 키 저장을 끕니다", raw.length);
        } catch (IllegalArgumentException e) {
            log.warn("F3D_AI_MASTER_KEY 가 base64 가 아닙니다 — 키 저장을 끕니다");
        }
        return null;
    }

    public boolean available() {
        return key != null;
    }

    public byte[] encrypt(String plain) {
        if (key == null) throw new BadRequestException(NO_MASTER);
        try {
            byte[] iv = new byte[IV_BYTES];
            random.nextBytes(iv);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            byte[] body = c.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            return ByteBuffer.allocate(IV_BYTES + body.length).put(iv).put(body).array();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("API 키를 암호화하지 못했습니다.", e);
        }
    }

    public String decrypt(byte[] data) {
        if (key == null) throw new BadRequestException(NO_MASTER);
        if (data == null || data.length <= IV_BYTES) throw new IllegalStateException("저장된 API 키가 올바르지 않습니다.");
        try {
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, data, 0, IV_BYTES));
            return new String(c.doFinal(data, IV_BYTES, data.length - IV_BYTES), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("저장된 API 키를 풀지 못했습니다 (마스터 키가 바뀌었을 수 있습니다).", e);
        }
    }
}
```

`server/src/main/java/com/kopens/factory3d/ai/Pricing.java`:
```java
package com.kopens.factory3d.ai;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Map;

/** 추정 비용 (USD / 1M 토큰). 캐시 쓰기 = 5분 캐시(입력의 1.25배). 표에 없는 모델(fallback 등)은 Opus 5.5 가격 */
public final class Pricing {
    public record Rate(double input, double output, double cacheRead, double cacheWrite) {}

    static final Map<String, Rate> RATES = Map.of(
            "claude-opus-5-5", new Rate(4, 20, 0.20, 5),
            "claude-sonnet-5-5", new Rate(2, 10, 0.10, 2.5),
            "claude-haiku-5-5", new Rate(0.10, 0.50, 0.01, 0.125));

    private Pricing() {}

    public static BigDecimal cost(String model, long input, long output, long cacheRead, long cacheWrite) {
        Rate r = RATES.getOrDefault(model, RATES.get("claude-opus-5-5"));
        double usd = (input * r.input() + output * r.output() + cacheRead * r.cacheRead() + cacheWrite * r.cacheWrite()) / 1_000_000d;
        return BigDecimal.valueOf(usd).setScale(6, RoundingMode.HALF_UP);
    }
}
```

- [ ] **Step 7: 사용량 기록 · 이번 달 합계**

`server/src/main/java/com/kopens/factory3d/ai/UsageRow.java`:
```java
package com.kopens.factory3d.ai;

import java.math.BigDecimal;

/** 사용량 묶음 한 줄 (key = 날짜 YYYY-MM-DD · 사용자 · 'month') */
public record UsageRow(String key, long calls, long inputTokens, long outputTokens, long cacheReadTokens, long cacheWriteTokens,
        BigDecimal costUsd) {}
```

`server/src/main/java/com/kopens/factory3d/ai/AiUsageMapper.java`:
```java
package com.kopens.factory3d.ai;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface AiUsageMapper {
    void insert(@Param("r") Row r);

    BigDecimal sumCost(@Param("from") OffsetDateTime from, @Param("to") OffsetDateTime to);

    /** by = day | user | month(전체 한 줄) */
    List<UsageRow> group(@Param("by") String by, @Param("from") OffsetDateTime from, @Param("to") OffsetDateTime to,
            @Param("zone") String zone);

    final class Row {
        public String username;
        public Long drawingId;
        public String model;
        public long inputTokens;
        public long outputTokens;
        public long cacheReadTokens;
        public long cacheWriteTokens;
        public BigDecimal costUsd;
        public String purpose;
    }
}
```

`server/src/main/resources/mapper/AiUsageMapper.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "https://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.kopens.factory3d.ai.AiUsageMapper">

    <resultMap id="row" type="com.kopens.factory3d.ai.UsageRow">
        <constructor>
            <arg column="key" javaType="String"/>
            <arg column="calls" javaType="_long"/>
            <arg column="input_tokens" javaType="_long"/>
            <arg column="output_tokens" javaType="_long"/>
            <arg column="cache_read_tokens" javaType="_long"/>
            <arg column="cache_write_tokens" javaType="_long"/>
            <arg column="cost_usd" javaType="java.math.BigDecimal"/>
        </constructor>
    </resultMap>

    <insert id="insert">
        insert into ai_usage (username, drawing_id, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, purpose)
        values (#{r.username,jdbcType=VARCHAR}, #{r.drawingId,jdbcType=BIGINT}, #{r.model}, #{r.inputTokens}, #{r.outputTokens},
                #{r.cacheReadTokens}, #{r.cacheWriteTokens}, #{r.costUsd}, #{r.purpose})
    </insert>

    <select id="sumCost" resultType="java.math.BigDecimal">
        select coalesce(sum(cost_usd), 0) from ai_usage where at &gt;= #{from} and at &lt; #{to}
    </select>

    <select id="group" resultMap="row">
        select
        <choose>
            <when test="by == 'day'">to_char(at at time zone #{zone}, 'YYYY-MM-DD')</when>
            <when test="by == 'user'">coalesce(username, '—')</when>
            <otherwise>'month'</otherwise>
        </choose> as key,
            count(*) as calls,
            coalesce(sum(input_tokens), 0) as input_tokens,
            coalesce(sum(output_tokens), 0) as output_tokens,
            coalesce(sum(cache_read_tokens), 0) as cache_read_tokens,
            coalesce(sum(cache_write_tokens), 0) as cache_write_tokens,
            coalesce(sum(cost_usd), 0) as cost_usd
        from ai_usage
        where at &gt;= #{from} and at &lt; #{to}
        <if test="by == 'day'">group by 1 order by 1 desc</if>
        <if test="by == 'user'">group by 1 order by sum(cost_usd) desc, 1</if>
    </select>
</mapper>
```

`server/src/main/java/com/kopens/factory3d/ai/AiUsageService.java`:
```java
package com.kopens.factory3d.ai;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/** Claude 호출 사용량 (호출마다 한 줄) · 이번 달 합계 (factory3d.time-zone 기준 달) */
@Service
public class AiUsageService {
    private final AiUsageMapper mapper;
    private final ZoneId zone;

    public AiUsageService(AiUsageMapper mapper, @Value("${factory3d.time-zone:Asia/Seoul}") String zone) {
        this.mapper = mapper;
        this.zone = ZoneId.of(zone);
    }

    /** 기록하고 추정 비용(USD)을 돌려줌 */
    public BigDecimal record(String username, Long drawingId, String model, long input, long output, long cacheRead,
            long cacheWrite, String purpose) {
        var r = new AiUsageMapper.Row();
        r.username = username == null ? null : username.substring(0, Math.min(32, username.length()));
        r.drawingId = drawingId;
        r.model = model;
        r.inputTokens = input;
        r.outputTokens = output;
        r.cacheReadTokens = cacheRead;
        r.cacheWriteTokens = cacheWrite;
        r.costUsd = Pricing.cost(model, input, output, cacheRead, cacheWrite);
        r.purpose = purpose;
        mapper.insert(r);
        return r.costUsd;
    }

    public BigDecimal monthCost() {
        OffsetDateTime[] m = monthRange();
        return mapper.sumCost(m[0], m[1]);
    }

    /** [이번 달 1일 0시, 다음 달 1일 0시) */
    public OffsetDateTime[] monthRange() {
        LocalDate first = LocalDate.now(zone).withDayOfMonth(1);
        return new OffsetDateTime[] {first.atStartOfDay(zone).toOffsetDateTime(), first.plusMonths(1).atStartOfDay(zone).toOffsetDateTime()};
    }

    ZoneId zone() {
        return zone;
    }

    AiUsageMapper mapper() {
        return mapper;
    }
}
```

- [ ] **Step 8: 설정 표 · 서비스 · API**

`server/src/main/java/com/kopens/factory3d/ai/AiSettingMapper.java`:
```java
package com.kopens.factory3d.ai;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface AiSettingMapper {
    /** 한 줄(id=1)이 없으면 기본값으로 넣음 (테스트가 표를 비워도 동작) */
    void ensureRow();

    Row find();

    void updateKey(@Param("enc") byte[] enc, @Param("hint") String hint, @Param("by") String by);

    void update(@Param("model") String model, @Param("limit") BigDecimal limit, @Param("enabled") boolean enabled,
            @Param("by") String by);

    final class Row {
        public byte[] apiKeyEnc;
        public String keyHint;
        public String model;
        public BigDecimal monthlyLimitUsd;
        public boolean enabled;
        public String updatedBy;
        public OffsetDateTime updatedAt;
    }
}
```

`server/src/main/resources/mapper/AiSettingMapper.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "https://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.kopens.factory3d.ai.AiSettingMapper">
    <insert id="ensureRow">insert into ai_setting (id) values (1) on conflict (id) do nothing</insert>

    <select id="find" resultType="com.kopens.factory3d.ai.AiSettingMapper$Row">
        select api_key_enc, key_hint, model, monthly_limit_usd, enabled, updated_by, updated_at from ai_setting where id = 1
    </select>

    <update id="updateKey">
        update ai_setting set api_key_enc = #{enc,jdbcType=BINARY}, key_hint = #{hint,jdbcType=VARCHAR},
            updated_by = #{by,jdbcType=VARCHAR}, updated_at = now()
        where id = 1
    </update>

    <update id="update">
        update ai_setting set model = #{model}, monthly_limit_usd = #{limit}, enabled = #{enabled},
            updated_by = #{by,jdbcType=VARCHAR}, updated_at = now()
        where id = 1
    </update>
</mapper>
```

`server/src/main/java/com/kopens/factory3d/ai/AiSettingService.java`:
```java
package com.kopens.factory3d.ai;

import com.kopens.factory3d.audit.AuditService;
import com.kopens.factory3d.common.BadRequestException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Claude API 관리: 키(암호화·힌트) · 모델 · 월 한도 · 사용 여부 · 챗봇 상태 */
@Service
public class AiSettingService {
    public static final List<String> MODELS = List.of("claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5");
    static final BigDecimal MAX_LIMIT = new BigDecimal("99999999.99");

    /** 화면용 (키 평문은 절대 넣지 않음) */
    public record View(boolean hasKey, String keyHint, String model, BigDecimal monthlyLimitUsd, boolean enabled, boolean masterKey,
            String updatedBy, OffsetDateTime updatedAt) {}

    public record Update(String model, BigDecimal monthlyLimitUsd, Boolean enabled) {}

    public record Status(boolean enabled, String reason) {}

    /** 호출에 쓸 값 — 서버 안에서만 */
    public record Active(String apiKey, String model) {}

    private final AiSettingMapper mapper;
    private final KeyCrypto crypto;
    private final AiUsageService usage;
    private final AuditService audit;

    public AiSettingService(AiSettingMapper mapper, KeyCrypto crypto, AiUsageService usage, AuditService audit) {
        this.mapper = mapper;
        this.crypto = crypto;
        this.usage = usage;
        this.audit = audit;
    }

    public View view() {
        AiSettingMapper.Row r = row();
        return new View(r.apiKeyEnc != null, r.keyHint, r.model, r.monthlyLimitUsd, r.enabled, crypto.available(), r.updatedBy, r.updatedAt);
    }

    @Transactional
    public View update(Update u, String by) {
        AiSettingMapper.Row r = row();
        String model = u.model() == null ? r.model : u.model().strip();
        if (!MODELS.contains(model)) throw new BadRequestException("모델은 claude-opus-5-5, claude-sonnet-5-5, claude-haiku-5-5 중 하나입니다.");
        BigDecimal limit = u.monthlyLimitUsd() == null ? r.monthlyLimitUsd : u.monthlyLimitUsd();
        if (limit.signum() < 0 || limit.compareTo(MAX_LIMIT) > 0) throw new BadRequestException("월 한도는 0 이상 USD 로 입력하세요.");
        boolean enabled = u.enabled() == null ? r.enabled : u.enabled();
        limit = limit.setScale(2, RoundingMode.HALF_UP);
        mapper.update(model, limit, enabled, by);
        audit.log("AI_SETTING", model, "limit=" + limit.toPlainString() + " enabled=" + enabled);
        return view();
    }

    @Transactional
    public View setKey(String apiKey, String by) {
        String k = apiKey == null ? "" : apiKey.strip();
        if (k.length() < 20 || k.length() > 300 || k.chars().anyMatch(Character::isWhitespace))
            throw new BadRequestException("API 키 형식이 올바르지 않습니다.");
        byte[] enc = crypto.encrypt(k); // 마스터 키가 없으면 400 (NO_MASTER)
        String hint = (k.startsWith("sk-ant-") ? "sk-ant-" : "") + "…" + k.substring(k.length() - 4);
        row();
        mapper.updateKey(enc, hint, by);
        audit.log("AI_KEY_SET", hint, null);
        return view();
    }

    @Transactional
    public View deleteKey(String by) {
        row();
        mapper.updateKey(null, null, by);
        audit.log("AI_KEY_DELETE", null, null);
        return view();
    }

    public Status status() {
        AiSettingMapper.Row r = row();
        boolean overLimit = usage.monthCost().compareTo(r.monthlyLimitUsd) >= 0;
        String reason = reason(crypto.available(), r.apiKeyEnc != null, r.enabled, overLimit);
        return new Status(reason == null, reason);
    }

    /** 키·모델 (평문). 마스터 키·키가 없으면 400 */
    public Active requireKey() {
        AiSettingMapper.Row r = row();
        if (!crypto.available()) throw new BadRequestException(KeyCrypto.NO_MASTER);
        if (r.apiKeyEnc == null) throw new BadRequestException("Claude API 키가 등록되지 않았습니다.");
        return new Active(crypto.decrypt(r.apiKeyEnc), r.model);
    }

    /** 챗봇을 막는 이유 (null = 쓸 수 있음). 순서: 마스터 키 → 키 → 사용 여부 → 월 한도 */
    static String reason(boolean masterKey, boolean hasKey, boolean enabled, boolean overLimit) {
        if (!masterKey) return "no-master-key";
        if (!hasKey) return "no-key";
        if (!enabled) return "disabled";
        if (overLimit) return "over-limit";
        return null;
    }

    public static String reasonText(String reason) {
        return switch (reason == null ? "" : reason) {
            case "no-master-key" -> "서버에 F3D_AI_MASTER_KEY 가 설정되지 않았습니다";
            case "no-key" -> "Claude API 키가 등록되지 않았습니다 (관리자 › Claude API 관리)";
            case "disabled" -> "AI 챗봇이 사용 중지되어 있습니다 (관리자 › Claude API 관리)";
            case "over-limit" -> "이번 달 AI 사용 한도를 넘었습니다";
            default -> "AI 챗봇을 쓸 수 없습니다";
        };
    }

    private AiSettingMapper.Row row() {
        mapper.ensureRow();
        return mapper.find();
    }
}
```

`server/src/main/java/com/kopens/factory3d/ai/AiStatusController.java`:
```java
package com.kopens.factory3d.ai;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** 챗봇 사용 가능 여부 (조회 이상 — 레일 버튼 켜기·끄기) */
@RestController
public class AiStatusController {
    private final AiSettingService settings;

    public AiStatusController(AiSettingService settings) {
        this.settings = settings;
    }

    @GetMapping("/api/ai/status")
    public AiSettingService.Status status() {
        return settings.status();
    }
}
```

`server/src/main/java/com/kopens/factory3d/ai/AiAdminController.java`:
```java
package com.kopens.factory3d.ai;

import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

/** 관리자 › Claude API 관리 (ADMIN — SecurityConfig 의 /api/admin/**) */
@RestController
@RequestMapping("/api/admin/ai")
public class AiAdminController {
    public record KeyBody(String apiKey) {}

    private final AiSettingService settings;

    public AiAdminController(AiSettingService settings) {
        this.settings = settings;
    }

    @GetMapping
    public AiSettingService.View view() {
        return settings.view();
    }

    @PutMapping
    public AiSettingService.View update(@RequestBody AiSettingService.Update body, Authentication auth) {
        return settings.update(body, auth.getName());
    }

    @PutMapping("/key")
    public AiSettingService.View setKey(@RequestBody KeyBody body, Authentication auth) {
        return settings.setKey(body.apiKey(), auth.getName());
    }

    @DeleteMapping("/key")
    public AiSettingService.View deleteKey(Authentication auth) {
        return settings.deleteKey(auth.getName());
    }
}
```

- [ ] **Step 9: 테스트 통과 확인**

Run: `cd server && ./gradlew test --tests 'com.kopens.factory3d.ai.*'`
Expected: PASS (KeyCryptoTest 3 · AiStatusTest 2 · PricingTest 2 · AiSettingApiTest 6)

Run: `cd server && ./gradlew test`
Expected: 전체 PASS (기존 테스트 회귀 없음 — 새 표는 truncate 목록에 자동 포함)

- [ ] **Step 10: Commit**

```bash
cd /c/kopens/project/Factory3D && git add server/src/main/resources/db/migration/V6__ai_change.sql server/src/main/resources/application.yml \
  server/src/main/resources/mapper/AiSettingMapper.xml server/src/main/resources/mapper/AiUsageMapper.xml \
  server/src/main/java/com/kopens/factory3d/ai server/src/test/java/com/kopens/factory3d/ai \
  server/src/test/java/com/kopens/factory3d/support/IntegrationTest.java
git commit -m "feat(server): AI 설정 — V6 표 · API 키 AES-GCM 암호화 · 모델·월 한도·사용 여부 · 챗봇 상태 · 사용량 기록

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 서버 — 변경 이력(change_log) · 사용자 편집 기록 · 관리자 조회

**Files:**
- Create: `server/src/main/java/com/kopens/factory3d/change/{ChangeEntry,ChangeLogMapper,ChangeLogService,ChangeController,Snapshots}.java`, `server/src/main/resources/mapper/ChangeLogMapper.xml`
- Modify: `server/src/main/java/com/kopens/factory3d/placement/PlacementService.java`, `server/src/main/java/com/kopens/factory3d/common/SecurityConfig.java`
- Test: `server/src/test/java/com/kopens/factory3d/change/ChangeLogApiTest.java`

**Interfaces:**
- Consumes: Task 1 의 `change_log` 표 (`target_key` 칸 포함).
- Produces (REST): `GET /api/changes?drawingId&source&from&to&page` (관리자) → `{items:[ChangeEntry], total, page, size}` (size 50, 최근 것 먼저). `from`·`to` 는 `YYYY-MM-DD` (to 포함).
- Produces (Java):
  - `ChangeLogService`: `static String newBatch()` (UUID 문자열), `static String currentUser()`, `static boolean isUuid(String)`, `long record(String username, String source, long drawingId, String batchId, String kind, String target, String targetKey, Object before, Object after)` (before/after = Jackson 3 `JsonNode` 또는 직렬화할 객체, null 허용), `Page list(Long drawingId, String source, LocalDate from, LocalDate to, int page)`, `List<ChangeEntry> batch(String batchId)` (UUID 가 아니면 빈 목록), `ChangeLogMapper mapper()`.
  - `ChangeEntry(long id, OffsetDateTime at, String username, String source, long drawingId, String drawingName, String batchId, String kind, String target, String targetKey /*JSON 에는 안 나감*/, String before /*raw JSON*/, String after, boolean reverted, String revertedBy, OffsetDateTime revertedAt)`.
  - `ChangeLogMapper`: `insert(Row)`, `find(Filter, limit, offset)`, `count(Filter)`, `findBatch(String batchId)`, `int countLater(long drawingId, List<String> keys, long afterId, String batchId)`, `void markReverted(String batchId, String by)`.
  - `Snapshots` (변경 이력·AI 제안 before/after 의 공통 모양): `ObjectNode placement(ObjectMapper, PlacementView)` = `{id, name, modelId(null 가능), x, y, rot, hintLabel?}`, `ObjectNode station(ObjectMapper, StationView)` = `{id, name, placementName, taktSec, warnPp, delayPp}`, `boolean samePlacement(PlacementView, JsonNode)`, `boolean sameStation(StationView, JsonNode)`, `StationMapper.Row stationRow(StationView)`, `String text(JsonNode, String)`, `Long longOrNull(JsonNode, String)`, `long idOf(String targetKey)`, `String placementKind(JsonNode before, JsonNode after)`.
  - 종류(kind) 이름: `placement.move` · `placement.rotate` · `placement.rename` · `placement.update`(여러 칸을 한꺼번에 · 모델 바꿈) · `placement.add` · `placement.delete` · `station.update` · `plan.partition.add` · `plan.partition.delete` · `plan.zone.rename`. target_key: `placement:<id>` · `station:<id>` · `partition:<가벽 id>` · `zone:<구역 id>`.
  - 사용자 편집(`PlacementService.create/update/delete`)은 같은 트랜잭션에서 `source=USER` 로 기록 (create 한 번 = 한 묶음). 첫 실행 기본 배치(`createSeed`)·도면 보정(`scale`)은 기록하지 않음.

- [ ] **Step 1: 실패 테스트 작성**

`server/src/test/java/com/kopens/factory3d/change/ChangeLogApiTest.java`:
```java
package com.kopens.factory3d.change;

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

class ChangeLogApiTest extends IntegrationTest {
    static final RequestPostProcessor OPERATOR = user("kim").roles("OPERATOR");
    static final RequestPostProcessor ADMIN = user("admin").roles("ADMIN");
    long drawing;

    @BeforeEach
    void setUp() {
        drawing = jdbc.queryForObject("insert into drawing (name, source_type, source_file, plan) values ('공장', 'dxf', 'x', "
                + "'{\"format\":1,\"bounds\":{\"w\":10,\"h\":5},\"lines\":[]}') returning id", Long.class);
    }

    private long create(String body) throws Exception {
        String res = mvc.perform(post("/api/drawings/" + drawing + "/placements").contentType(MediaType.APPLICATION_JSON).content(body)
                .with(OPERATOR).with(csrf())).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(res, "$[0].id")).longValue();
    }

    private void patch(long id, String body) throws Exception {
        mvc.perform(patch("/api/placements/" + id).contentType(MediaType.APPLICATION_JSON).content(body).with(OPERATOR).with(csrf()))
                .andExpect(status().isOk());
    }

    @Test
    void 사용자_편집이_변경_이력에_남음() throws Exception {
        long a = create("[{\"name\":\"A\",\"x\":1,\"y\":1},{\"name\":\"B\",\"x\":2,\"y\":2}]");
        assertThat(jdbc.queryForList("select distinct batch_id::text from change_log", String.class)).hasSize(1); // 한 번에 추가 = 한 묶음
        patch(a, "{\"x\":3}");
        patch(a, "{\"name\":\"A1\"}");
        patch(a, "{\"rot\":90}");
        patch(a, "{\"x\":4,\"rot\":180}");
        mvc.perform(delete("/api/placements/" + a).with(OPERATOR).with(csrf())).andExpect(status().isNoContent());

        List<String> kinds = jdbc.queryForList("select kind from change_log order by id", String.class);
        assertThat(kinds).containsExactly("placement.add", "placement.add", "placement.move", "placement.rename", "placement.rotate",
                "placement.update", "placement.delete");
        assertThat(jdbc.queryForList("select distinct source from change_log", String.class)).containsExactly("USER");
        assertThat(jdbc.queryForList("select distinct username from change_log", String.class)).containsExactly("kim");
        assertThat(jdbc.queryForObject("select target_key from change_log where kind = 'placement.move'", String.class))
                .isEqualTo("placement:" + a);
        assertThat(jdbc.queryForObject("select (before->>'x') || '>' || (after->>'x') from change_log where kind = 'placement.move'",
                String.class)).isEqualTo("1.0>3.0");
        assertThat(jdbc.queryForObject("select after is null from change_log where kind = 'placement.delete'", Boolean.class)).isTrue();
        assertThat(jdbc.queryForObject("select count(distinct batch_id) from change_log", Integer.class)).isEqualTo(6);
    }

    @Test
    void 바뀐_것이_없으면_기록하지_않음() throws Exception {
        long a = create("[{\"name\":\"A\",\"x\":1,\"y\":1}]");
        patch(a, "{\"x\":1,\"y\":1}");
        assertThat(jdbc.queryForObject("select count(*) from change_log", Integer.class)).isEqualTo(1);
    }

    @Test
    void 관리자만_조회하고_필터() throws Exception {
        long a = create("[{\"name\":\"A\",\"x\":1,\"y\":1}]");
        patch(a, "{\"x\":2}");
        mvc.perform(get("/api/changes").with(OPERATOR)).andExpect(status().isForbidden());
        mvc.perform(get("/api/changes").with(ADMIN)).andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(2))
                .andExpect(jsonPath("$.size").value(50))
                .andExpect(jsonPath("$.items[0].kind").value("placement.move")) // 최근 것 먼저
                .andExpect(jsonPath("$.items[0].drawingName").value("공장"))
                .andExpect(jsonPath("$.items[0].source").value("USER"))
                .andExpect(jsonPath("$.items[0].before.x").value(1.0))
                .andExpect(jsonPath("$.items[0].after.x").value(2.0))
                .andExpect(jsonPath("$.items[0].targetKey").doesNotExist())
                .andExpect(jsonPath("$.items[1].before").isEmpty());
        mvc.perform(get("/api/changes?source=AI").with(ADMIN)).andExpect(jsonPath("$.total").value(0));
        mvc.perform(get("/api/changes?drawingId=" + (drawing + 1)).with(ADMIN)).andExpect(jsonPath("$.total").value(0));
        mvc.perform(get("/api/changes?from=2000-01-01&to=2000-01-02").with(ADMIN)).andExpect(jsonPath("$.total").value(0));
        mvc.perform(get("/api/changes?source=ROBOT").with(ADMIN)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("출처는 USER 또는 AI 입니다."));
    }
}
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd server && ./gradlew test --tests 'com.kopens.factory3d.change.*'`
Expected: FAIL — change_log 0줄, `/api/changes` 없음

- [ ] **Step 3: Mapper · 항목**

`server/src/main/java/com/kopens/factory3d/change/ChangeEntry.java`:
```java
package com.kopens.factory3d.change;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonRawValue;
import java.time.OffsetDateTime;

/** 변경 이력 한 줄. before/after 는 DB 의 JSON 문자열을 그대로 내보냄 (없으면 null) */
public record ChangeEntry(long id, OffsetDateTime at, String username, String source, long drawingId, String drawingName,
        String batchId, String kind, String target, @JsonIgnore String targetKey, @JsonRawValue String before,
        @JsonRawValue String after, boolean reverted, String revertedBy, OffsetDateTime revertedAt) {}
```

`server/src/main/java/com/kopens/factory3d/change/ChangeLogMapper.java`:
```java
package com.kopens.factory3d.change;

import java.time.OffsetDateTime;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface ChangeLogMapper {
    void insert(@Param("r") Row r);

    List<ChangeEntry> find(@Param("f") Filter f, @Param("limit") int limit, @Param("offset") int offset);

    long count(@Param("f") Filter f);

    List<ChangeEntry> findBatch(@Param("batchId") String batchId);

    /** 이 묶음 뒤(id &gt; afterId)에 같은 대상(keys)을 바꾼, 되돌리지 않은 다른 묶음의 기록 수 */
    int countLater(@Param("drawingId") long drawingId, @Param("keys") List<String> keys, @Param("afterId") long afterId,
            @Param("batchId") String batchId);

    void markReverted(@Param("batchId") String batchId, @Param("by") String by);

    final class Row {
        public Long id;
        public String username;
        public String source;
        public long drawingId;
        public String batchId;
        public String kind;
        public String target;
        public String targetKey;
        public String before;
        public String after;
    }

    record Filter(Long drawingId, String source, OffsetDateTime from, OffsetDateTime to) {}
}
```

`server/src/main/resources/mapper/ChangeLogMapper.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "https://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.kopens.factory3d.change.ChangeLogMapper">

    <resultMap id="entry" type="com.kopens.factory3d.change.ChangeEntry">
        <constructor>
            <idArg column="id" javaType="_long"/>
            <arg column="at" javaType="java.time.OffsetDateTime"/>
            <arg column="username" javaType="String"/>
            <arg column="source" javaType="String"/>
            <arg column="drawing_id" javaType="_long"/>
            <arg column="drawing_name" javaType="String"/>
            <arg column="batch_id" javaType="String"/>
            <arg column="kind" javaType="String"/>
            <arg column="target" javaType="String"/>
            <arg column="target_key" javaType="String"/>
            <arg column="before" javaType="String"/>
            <arg column="after" javaType="String"/>
            <arg column="reverted" javaType="_boolean"/>
            <arg column="reverted_by" javaType="String"/>
            <arg column="reverted_at" javaType="java.time.OffsetDateTime"/>
        </constructor>
    </resultMap>

    <sql id="cols">
        c.id, c.at, c.username, c.source, c.drawing_id, d.name as drawing_name, c.batch_id::text as batch_id, c.kind, c.target,
        c.target_key, c.before::text as before, c.after::text as after, c.reverted, c.reverted_by, c.reverted_at
    </sql>

    <sql id="where">
        <where>
            <if test="f.drawingId != null">c.drawing_id = #{f.drawingId}</if>
            <if test="f.source != null">and c.source = #{f.source}</if>
            <if test="f.from != null">and c.at &gt;= #{f.from}</if>
            <if test="f.to != null">and c.at &lt; #{f.to}</if>
        </where>
    </sql>

    <insert id="insert" useGeneratedKeys="true" keyProperty="r.id" keyColumn="id">
        insert into change_log (username, source, drawing_id, batch_id, kind, target, target_key, before, after)
        values (#{r.username,jdbcType=VARCHAR}, #{r.source}, #{r.drawingId}, cast(#{r.batchId} as uuid), #{r.kind},
                #{r.target,jdbcType=VARCHAR}, #{r.targetKey}, cast(#{r.before,jdbcType=VARCHAR} as jsonb),
                cast(#{r.after,jdbcType=VARCHAR} as jsonb))
    </insert>

    <select id="find" resultMap="entry">
        select <include refid="cols"/> from change_log c join drawing d on d.id = c.drawing_id
        <include refid="where"/>
        order by c.id desc limit #{limit} offset #{offset}
    </select>

    <select id="count" resultType="_long">
        select count(*) from change_log c <include refid="where"/>
    </select>

    <select id="findBatch" resultMap="entry">
        select <include refid="cols"/> from change_log c join drawing d on d.id = c.drawing_id
        where c.batch_id = cast(#{batchId} as uuid) order by c.id
    </select>

    <select id="countLater" resultType="_int">
        select count(*) from change_log
        where drawing_id = #{drawingId} and id &gt; #{afterId} and not reverted and batch_id &lt;&gt; cast(#{batchId} as uuid)
          and target_key in <foreach collection="keys" item="k" open="(" separator="," close=")">#{k}</foreach>
    </select>

    <update id="markReverted">
        update change_log set reverted = true, reverted_by = #{by,jdbcType=VARCHAR}, reverted_at = now()
        where batch_id = cast(#{batchId} as uuid) and not reverted
    </update>
</mapper>
```

- [ ] **Step 4: 스냅샷 · 서비스 · API · 권한**

`server/src/main/java/com/kopens/factory3d/change/Snapshots.java`:
```java
package com.kopens.factory3d.change;

import com.kopens.factory3d.placement.PlacementView;
import com.kopens.factory3d.station.StationMapper;
import com.kopens.factory3d.station.StationView;
import java.util.Objects;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** 변경 이력·AI 제안의 before/after 모양 (배치·공정) 과 비교 도우미 */
public final class Snapshots {
    static final double EPS = 1e-6;

    private Snapshots() {}

    /** {id, name, modelId(null 가능), x, y, rot, hintLabel?} */
    public static ObjectNode placement(ObjectMapper json, PlacementView p) {
        ObjectNode n = json.createObjectNode();
        n.put("id", p.id());
        n.put("name", p.name());
        if (p.modelId() == null) n.putNull("modelId");
        else n.put("modelId", p.modelId());
        n.put("x", p.x());
        n.put("y", p.y());
        n.put("rot", p.rot());
        if (p.hintLabel() != null) n.put("hintLabel", p.hintLabel());
        return n;
    }

    /** {id, name, placementName(null 가능), taktSec, warnPp, delayPp} — AI 가 바꿀 수 있는 칸만 */
    public static ObjectNode station(ObjectMapper json, StationView s) {
        ObjectNode n = json.createObjectNode();
        n.put("id", s.id());
        n.put("name", s.name());
        if (s.placementName() == null) n.putNull("placementName");
        else n.put("placementName", s.placementName());
        n.put("taktSec", s.taktSec());
        n.put("warnPp", s.warnPp());
        n.put("delayPp", s.delayPp());
        return n;
    }

    public static boolean samePlacement(PlacementView cur, JsonNode s) {
        return s != null && cur.name().equals(text(s, "name")) && Objects.equals(cur.modelId(), longOrNull(s, "modelId"))
                && Math.abs(cur.x() - s.path("x").asDouble()) < EPS && Math.abs(cur.y() - s.path("y").asDouble()) < EPS
                && Math.abs(cur.rot() - s.path("rot").asDouble()) < EPS;
    }

    public static boolean sameStation(StationView cur, JsonNode s) {
        return s != null && cur.name().equals(text(s, "name")) && Objects.equals(cur.placementName(), text(s, "placementName"))
                && cur.taktSec() == s.path("taktSec").asInt() && cur.warnPp() == s.path("warnPp").asInt()
                && cur.delayPp() == s.path("delayPp").asInt();
    }

    /** 지금 공정 그대로의 수정용 줄 (AI 적용·되돌리기는 바꿀 칸만 덮어씀) */
    public static StationMapper.Row stationRow(StationView v) {
        var r = new StationMapper.Row();
        r.id = v.id();
        r.no = v.no();
        r.name = v.name();
        r.placementName = v.placementName();
        r.steps = v.steps().toArray(String[]::new);
        r.taktSec = v.taktSec();
        r.warnPp = v.warnPp();
        r.delayPp = v.delayPp();
        r.projectId = v.projectId();
        r.countsProject = v.countsProject();
        r.materials = v.materials().toArray(String[]::new);
        return r;
    }

    /** 배치 전후 → 종류 (이름·위치·회전 중 하나만 = 그 종류, 여럿이거나 모델이 바뀜 = update, 같음 = null) */
    public static String placementKind(JsonNode before, JsonNode after) {
        boolean name = !Objects.equals(text(before, "name"), text(after, "name"));
        boolean pos = Math.abs(before.path("x").asDouble() - after.path("x").asDouble()) > EPS
                || Math.abs(before.path("y").asDouble() - after.path("y").asDouble()) > EPS;
        boolean rot = Math.abs(before.path("rot").asDouble() - after.path("rot").asDouble()) > EPS;
        boolean model = !Objects.equals(longOrNull(before, "modelId"), longOrNull(after, "modelId"));
        int n = (name ? 1 : 0) + (pos ? 1 : 0) + (rot ? 1 : 0);
        if (model || n > 1) return "placement.update";
        if (name) return "placement.rename";
        if (rot) return "placement.rotate";
        if (pos) return "placement.move";
        return null;
    }

    public static String text(JsonNode n, String field) {
        JsonNode v = n == null ? null : n.get(field);
        return v == null || v.isNull() ? null : v.asText();
    }

    public static Long longOrNull(JsonNode n, String field) {
        JsonNode v = n == null ? null : n.get(field);
        return v == null || v.isNull() ? null : v.asLong();
    }

    /** "placement:12" → 12 */
    public static long idOf(String targetKey) {
        return Long.parseLong(targetKey.substring(targetKey.indexOf(':') + 1));
    }
}
```

`server/src/main/java/com/kopens/factory3d/change/ChangeLogService.java`:
```java
package com.kopens.factory3d.change;

import com.kopens.factory3d.common.BadRequestException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** 변경 이력 (사람 USER · AI). 기록은 부르는 쪽 트랜잭션 안에서 */
@Service
public class ChangeLogService {
    public static final int PAGE_SIZE = 50;

    public record Page(List<ChangeEntry> items, long total, int page, int size) {}

    private final ChangeLogMapper mapper;
    private final ObjectMapper json;
    private final ZoneId zone;

    public ChangeLogService(ChangeLogMapper mapper, ObjectMapper json, @Value("${factory3d.time-zone:Asia/Seoul}") String zone) {
        this.mapper = mapper;
        this.json = json;
        this.zone = ZoneId.of(zone);
    }

    public static String newBatch() {
        return UUID.randomUUID().toString();
    }

    public static String currentUser() {
        Authentication a = SecurityContextHolder.getContext().getAuthentication();
        return a == null || !a.isAuthenticated() ? null : a.getName();
    }

    public static boolean isUuid(String s) {
        try {
            UUID.fromString(s);
            return true;
        } catch (RuntimeException e) {
            return false;
        }
    }

    public long record(String username, String source, long drawingId, String batchId, String kind, String target, String targetKey,
            Object before, Object after) {
        var r = new ChangeLogMapper.Row();
        r.username = username == null ? null : username.substring(0, Math.min(32, username.length()));
        r.source = source;
        r.drawingId = drawingId;
        r.batchId = batchId;
        r.kind = kind;
        r.target = target == null ? null : target.substring(0, Math.min(100, target.length()));
        r.targetKey = targetKey;
        r.before = toJson(before);
        r.after = toJson(after);
        mapper.insert(r);
        return r.id;
    }

    public Page list(Long drawingId, String source, LocalDate from, LocalDate to, int page) {
        if (source != null && !source.isBlank() && !List.of("USER", "AI").contains(source))
            throw new BadRequestException("출처는 USER 또는 AI 입니다.");
        int p = Math.max(0, page);
        var f = new ChangeLogMapper.Filter(drawingId, source == null || source.isBlank() ? null : source,
                from == null ? null : start(from), to == null ? null : start(to.plusDays(1)));
        return new Page(mapper.find(f, PAGE_SIZE, p * PAGE_SIZE), mapper.count(f), p, PAGE_SIZE);
    }

    public List<ChangeEntry> batch(String batchId) {
        return isUuid(batchId) ? mapper.findBatch(batchId) : List.of();
    }

    public ChangeLogMapper mapper() {
        return mapper;
    }

    private OffsetDateTime start(LocalDate d) {
        return d.atStartOfDay(zone).toOffsetDateTime();
    }

    private String toJson(Object o) {
        if (o == null) return null;
        if (o instanceof JsonNode n) return n.isNull() || n.isMissingNode() ? null : n.toString();
        return json.writeValueAsString(o);
    }
}
```

`server/src/main/java/com/kopens/factory3d/change/ChangeController.java`:
```java
package com.kopens.factory3d.change;

import java.time.LocalDate;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

/** 변경 이력 (조회는 관리자 — SecurityConfig). 되돌리기는 Task 6 에서 더함 */
@RestController
public class ChangeController {
    private final ChangeLogService changes;

    public ChangeController(ChangeLogService changes) {
        this.changes = changes;
    }

    @GetMapping("/api/changes")
    public ChangeLogService.Page list(@RequestParam(required = false) Long drawingId, @RequestParam(required = false) String source,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "0") int page) {
        return changes.list(drawingId, source, from, to, page);
    }
}
```

`server/src/main/java/com/kopens/factory3d/common/SecurityConfig.java` — `.requestMatchers(HttpMethod.GET, "/api/**").hasRole("VIEWER")` 줄 **바로 위**에 추가:
```java
                        // 변경 이력 조회는 관리자 (되돌리기 POST 는 기본 규칙 = 운전원 이상, 서비스가 본인 묶음인지 검사)
                        .requestMatchers(HttpMethod.GET, "/api/changes", "/api/changes/**").hasRole("ADMIN")
```

- [ ] **Step 5: 사용자 편집 기록 (PlacementService)**

`server/src/main/java/com/kopens/factory3d/placement/PlacementService.java`:

1. import 추가:
```java
import com.kopens.factory3d.change.ChangeLogService;
import com.kopens.factory3d.change.Snapshots;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
```
2. 필드·생성자 (`ChangeLogService changes`, `ObjectMapper json` 추가):
```java
    private final ChangeLogService changes;
    private final ObjectMapper json;

    public PlacementService(PlacementMapper placements, DrawingMapper drawings, ModelMapper models, AuditService audit,
            ChangeLogService changes, ObjectMapper json) {
        this.placements = placements;
        this.drawings = drawings;
        this.models = models;
        this.audit = audit;
        this.changes = changes;
        this.json = json;
    }
```
3. `create` 의 `insertAll(drawingId, rows);` 다음 줄에:
```java
        String batch = ChangeLogService.newBatch(), by = ChangeLogService.currentUser();
        for (var r : rows) {
            PlacementView v = placements.findById(r.id);
            changes.record(by, "USER", drawingId, batch, "placement.add", v.name(), "placement:" + v.id(), null, Snapshots.placement(json, v));
        }
```
4. `update` 끝부분(`placements.update(id, modelId, name, x, y, rot);` 부터 `return` 까지)을:
```java
        placements.update(id, modelId, name, x, y, rot);
        PlacementView next = placements.findById(id);
        JsonNode before = Snapshots.placement(json, cur), after = Snapshots.placement(json, next);
        String kind = Snapshots.placementKind(before, after);
        if (kind != null)
            changes.record(ChangeLogService.currentUser(), "USER", drawingId, ChangeLogService.newBatch(), kind, cur.name(),
                    "placement:" + id, before, after);
        audit.log("PLACEMENT_UPDATE", name, "id=" + id);
        return next;
```
5. `delete` 의 `placements.delete(id);` 를:
```java
        long drawingId = placements.drawingOf(id);
        placements.delete(id);
        changes.record(ChangeLogService.currentUser(), "USER", drawingId, ChangeLogService.newBatch(), "placement.delete", cur.name(),
                "placement:" + id, Snapshots.placement(json, cur), null);
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `cd server && ./gradlew test --tests 'com.kopens.factory3d.change.*' --tests 'com.kopens.factory3d.placement.*'`
Expected: PASS (ChangeLogApiTest 3 · 기존 PlacementApiTest·SeedTest 회귀 없음). `"1.0>3.0"` 비교가 PostgreSQL jsonb 숫자 표기(`1.0`/`1`)로 어긋나면 `(before->>'x')::float` 비교로 고친다 (값은 1→3 이어야 함).

- [ ] **Step 7: Commit**

```bash
cd /c/kopens/project/Factory3D && git add server/src/main/java/com/kopens/factory3d/change server/src/main/resources/mapper/ChangeLogMapper.xml \
  server/src/main/java/com/kopens/factory3d/placement/PlacementService.java server/src/main/java/com/kopens/factory3d/common/SecurityConfig.java \
  server/src/test/java/com/kopens/factory3d/change
git commit -m "feat(server): 변경 이력 — 사용자 배치 편집을 같은 트랜잭션에 기록 · 관리자 조회 /api/changes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 서버 — Claude 호출 경계 (ClaudeGateway · 실제 AnthropicGateway · 가짜 FakeGateway)

**Files:**
- Modify: `server/build.gradle`
- Create: `server/src/main/java/com/kopens/factory3d/ai/{ClaudeGateway,Transcript,AiCallException,AnthropicGateway,FakeGateway,AiConfig}.java`
- Test: `server/src/test/java/com/kopens/factory3d/ai/{AnthropicGatewayTest,FakeGatewayTest}.java`

**Interfaces:**
- Consumes: 없음 (SDK 만).
- Produces (Java — 뒤 Task 는 SDK 타입을 전혀 보지 않고 이것만 씀):
  - `ClaudeGateway` (인터페이스): `Transcript newTranscript()`, `Turn next(Call call, Transcript t, Consumer<String> onText)` (스트리밍 글자 조각을 onText 로, 응답 content 를 t 에 그대로 붙임), `Ping ping(String apiKey, String model)`.
  - 중첩 레코드: `ToolSpec(String name, String description, String inputSchemaJson)`, `Call(String apiKey, String model, String system, List<ToolSpec> tools, long maxTokens)`, `ToolCall(String id, String name, String inputJson)`, `ToolResult(String toolUseId, String content, boolean isError)`, `Usage(String model, long input, long output, long cacheRead, long cacheWrite)`, `Turn(Stop stop, List<ToolCall> toolCalls, String text, String refusal, Usage usage)`, `Ping(String model, long latencyMs, Usage usage)`, `enum Stop { END, TOOL_USE, MAX_TOKENS, REFUSAL, OTHER }`.
  - `Transcript` (인터페이스): `void addUserText(String)`, `void addToolResults(List<ClaudeGateway.ToolResult>)`, `int messages()`.
  - `AiCallException extends RuntimeException`: `Kind kind()`, `enum Kind { KEY, RATE, NETWORK, OTHER }`, 메시지는 사용자에게 바로 보일 한국어 (`API 키가 올바르지 않습니다` · `잠시 뒤 다시 시도하세요 (요청이 많습니다)` · `Claude 서버에 연결하지 못했습니다` · `Claude 호출에 실패했습니다 (…)`).
  - 빈 `ClaudeGateway` 하나 (`AiConfig`): `factory3d.ai.fake=true` → `FakeGateway`, 아니면 `AnthropicGateway`. 빈 `aiExecutor` (`ExecutorService`, 가상 스레드) — Task 5 의 SSE 가 씀.
  - `FakeGateway` 대본 (Task 5·6 테스트와 화면 확인이 기대는 동작):
    1. 마지막이 사용자 글 → 글에 `거절` 이 있으면 REFUSAL(사유 `시험용 거절`), `오류` 가 있으면 `AiCallException(RATE)`, 아니면 글자 `장면을 확인하겠습니다.` 를 두 조각으로 흘리고 `get_scene {}` 호출.
    2. 마지막이 도구 결과 → 사용자 글에 `반복` 이 있으면 계속 `get_scene` 호출. 직전 호출이 `get_scene` 이면 사용자 글을 읽어 쓰기 도구 하나를 부름 (아래 표). 직전 호출이 쓰기 도구면 결과가 오류일 때 `요청한 내용을 처리하지 못했습니다: <오류>`, 아니면 `제안을 만들었습니다. 3D 미리보기를 확인하고 적용을 눌러 주세요.` 로 END.
    3. 쓰기 의도 (사용자 글 맨 앞 `[ … ]` 줄은 빼고 읽음):
       | 글 모양 | 도구 · 입력 |
       |---|---|
       | `<이름> 을/를 오른쪽|왼쪽|위쪽|아래쪽으로 <n>m 옮겨…` | `move_object {name, dx, dy}` (오른쪽 +x, 왼쪽 -x, 위쪽 +y, 아래쪽 -y) |
       | `<이름> 을/를 <n>도로 돌려…` | `rotate_object {name, rot}` |
       | `<이름> 을/를 지워…` · `삭제` | `delete_object {name}` |
       | `<이름> 이름을 <새 이름>(으)로 바꿔…` | `rename_object {name, newName}` |
       | `<모델> 을/를 (<x>, <y>)에 추가…` | `add_object {model, x, y}` |
       | `공정 <이름> 택타임 <n>분` | `set_station {name, taktMin}` |
       | `가벽 (<ax>, <ay>)-(<bx>, <by>) 추가` | `edit_partition {op:"add", a, b}` |
       | 그 밖 | END `무엇을 바꿀지 객체 이름과 함께 알려 주세요.` |
    4. 모든 턴의 사용량 = `Usage(call.model(), 1200, 80, 0, 0)`. `ping` = 키에 `invalid` 가 있으면 `AiCallException(KEY)`, 아니면 `Ping(model, 5, Usage(model, 20, 5, 0, 0))`.

- [ ] **Step 1: SDK 의존성**

`server/build.gradle` 의 `dependencies` 에서 `implementation 'org.springdoc:…'` 줄 아래에 추가:
```groovy
    // Claude API 공식 Java SDK (안에서 Jackson 2 를 씀 — 우리 코드는 Jackson 3, SDK 타입은 ai/AnthropicGateway 안에서만)
    implementation 'com.anthropic:anthropic-java:3.8.0'
```
Run: `cd server && ./gradlew dependencies --configuration runtimeClasspath | grep -i anthropic`
Expected: `com.anthropic:anthropic-java:3.8.0` (+ `anthropic-java-core`, `anthropic-java-client-okhttp`)

그다음 SDK 이름을 확인해 둔다 (아래 코드의 이름이 다르면 이 출력에 맞춰 고친다 — 문자열 추측 금지):
```bash
cd server && JAR=$(find ~/.gradle/caches -name 'anthropic-java-core-3.8.0.jar' | head -1) && echo $JAR && \
  javap -cp $JAR com.anthropic.models.beta.messages.MessageCreateParams\$Builder | grep -iE 'fallback|outputConfig|systemOfBeta|toolChoice|addTool\(|messages\(|addBeta' ; \
  javap -cp $JAR com.anthropic.models.beta.messages.BetaContentBlock | grep -iE 'isFallback|isThinking|isRedactedThinking|isToolUse|toParam' ; \
  javap -cp $JAR com.anthropic.models.beta.messages.BetaMessage | grep -iE 'stopDetails|stopReason|model\(' ; \
  javap -cp $JAR com.anthropic.models.beta.AnthropicBeta | grep -i FALLBACK
```

- [ ] **Step 2: 실패 테스트 작성**

`server/src/test/java/com/kopens/factory3d/ai/FakeGatewayTest.java`:
```java
package com.kopens.factory3d.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kopens.factory3d.ai.ClaudeGateway.*;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class FakeGatewayTest {
    final FakeGateway g = new FakeGateway();
    final Call call = new Call("k", "claude-opus-5-5", "sys", List.of(), 16000);

    @Test
    void 장면_확인_뒤_이동_제안_뒤_마무리() {
        Transcript t = g.newTranscript();
        t.addUserText("[도면: 나셀 공장]\nMain Station 1 을 오른쪽으로 2m 옮겨줘");
        List<String> chunks = new ArrayList<>();
        Turn a = g.next(call, t, chunks::add);
        assertThat(String.join("", chunks)).isEqualTo("장면을 확인하겠습니다.");
        assertThat(chunks).hasSize(2);
        assertThat(a.stop()).isEqualTo(Stop.TOOL_USE);
        assertThat(a.toolCalls()).extracting(ToolCall::name).containsExactly("get_scene");
        assertThat(a.usage()).isEqualTo(new Usage("claude-opus-5-5", 1200, 80, 0, 0));

        t.addToolResults(List.of(new ToolResult(a.toolCalls().get(0).id(), "{}", false)));
        Turn b = g.next(call, t, s -> {});
        assertThat(b.toolCalls().get(0).name()).isEqualTo("move_object");
        assertThat(b.toolCalls().get(0).inputJson()).isEqualTo("{\"name\":\"Main Station 1\",\"dx\":2.0,\"dy\":0.0}");

        t.addToolResults(List.of(new ToolResult(b.toolCalls().get(0).id(), "{\"ok\":true}", false)));
        Turn c = g.next(call, t, s -> {});
        assertThat(c.stop()).isEqualTo(Stop.END);
        assertThat(c.text()).contains("제안을 만들었습니다");
        assertThat(t.messages()).isEqualTo(6);
    }

    @Test
    void 여러_쓰기_의도() {
        assertThat(secondCall("허브 2 를 90도로 돌려줘")).isEqualTo("rotate_object {\"name\":\"허브 2\",\"rot\":90.0}");
        assertThat(secondCall("허브 2 를 지워줘")).isEqualTo("delete_object {\"name\":\"허브 2\"}");
        assertThat(secondCall("허브 2 이름을 허브 A 로 바꿔줘")).isEqualTo("rename_object {\"name\":\"허브 2\",\"newName\":\"허브 A\"}");
        assertThat(secondCall("Main Station 을 (30, 12)에 추가해줘")).isEqualTo("add_object {\"model\":\"Main Station\",\"x\":30.0,\"y\":12.0}");
        assertThat(secondCall("공정 Hub 조립장 택타임 25분으로")).isEqualTo("set_station {\"name\":\"Hub 조립장\",\"taktMin\":25.0}");
        assertThat(secondCall("가벽 (1, 2)-(5, 2) 추가해줘")).isEqualTo("edit_partition {\"op\":\"add\",\"a\":[1.0,2.0],\"b\":[5.0,2.0]}");
        assertThat(secondCall("안녕")).isEqualTo("END");
    }

    @Test
    void 거절_오류_반복_키() {
        Transcript t = g.newTranscript();
        t.addUserText("거절해 봐");
        Turn r = g.next(call, t, s -> {});
        assertThat(r.stop()).isEqualTo(Stop.REFUSAL);
        assertThat(r.refusal()).isEqualTo("시험용 거절");

        Transcript e = g.newTranscript();
        e.addUserText("오류 내 봐");
        assertThatThrownBy(() -> g.next(call, e, s -> {})).isInstanceOf(AiCallException.class)
                .hasMessage("잠시 뒤 다시 시도하세요 (요청이 많습니다)");

        Transcript loop = g.newTranscript();
        loop.addUserText("반복");
        for (int i = 0; i < 5; i++) {
            Turn x = g.next(call, loop, s -> {});
            assertThat(x.toolCalls().get(0).name()).isEqualTo("get_scene");
            loop.addToolResults(List.of(new ToolResult(x.toolCalls().get(0).id(), "{}", false)));
        }

        assertThat(g.ping("sk-ant-ok", "claude-haiku-5-5").model()).isEqualTo("claude-haiku-5-5");
        assertThatThrownBy(() -> g.ping("sk-ant-invalid", "claude-opus-5-5")).isInstanceOf(AiCallException.class)
                .hasMessage("API 키가 올바르지 않습니다");
    }

    /** 사용자 글 → (장면 확인 뒤) 두 번째 턴의 도구 "이름 입력" 또는 END */
    private String secondCall(String text) {
        Transcript t = g.newTranscript();
        t.addUserText(text);
        Turn a = g.next(call, t, s -> {});
        t.addToolResults(List.of(new ToolResult(a.toolCalls().get(0).id(), "{}", false)));
        Turn b = g.next(call, t, s -> {});
        return b.stop() == Stop.END ? "END" : b.toolCalls().get(0).name() + " " + b.toolCalls().get(0).inputJson();
    }
}
```

`server/src/test/java/com/kopens/factory3d/ai/AnthropicGatewayTest.java` (네트워크 없음 — 요청 만들기·응답 읽기만):
```java
package com.kopens.factory3d.ai;

import static org.assertj.core.api.Assertions.assertThat;

import com.anthropic.core.ObjectMappers;
import com.anthropic.models.beta.AnthropicBeta;
import com.anthropic.models.beta.messages.BetaMessage;
import com.anthropic.models.beta.messages.MessageCreateParams;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kopens.factory3d.ai.ClaudeGateway.*;
import java.util.List;
import org.junit.jupiter.api.Test;

class AnthropicGatewayTest {
    static final ObjectMapper SDK = ObjectMappers.jsonMapper(); // SDK 의 Jackson 2 — 이 테스트와 AnthropicGateway 안에서만
    static final ToolSpec TOOL = new ToolSpec("move_object", "옮김",
            "{\"type\":\"object\",\"properties\":{\"name\":{\"type\":\"string\"},\"dx\":{\"type\":\"number\"}},"
                    + "\"required\":[\"name\"],\"additionalProperties\":false}");

    static Call call(String model) {
        return new Call("k", model, "시스템 프롬프트", List.of(TOOL), 16000);
    }

    static String body(MessageCreateParams p) throws Exception {
        return SDK.writeValueAsString(p._body());
    }

    @Test
    void 요청은_strict_도구_medium_캐시_auto_fallback_생각_없음() throws Exception {
        MessageCreateParams p = AnthropicGateway.params(call("claude-opus-5-5"), List.of());
        String j = body(p);
        assertThat(j).contains("\"model\":\"claude-opus-5-5\"", "\"strict\":true", "\"additionalProperties\":false",
                "\"effort\":\"medium\"", "\"cache_control\"", "\"fallbacks\":\"default\"", "\"tool_choice\":{\"type\":\"auto\"}",
                "\"max_tokens\":16000", "시스템 프롬프트");
        assertThat(j).doesNotContain("\"thinking\"", "budget_tokens", "temperature", "top_p");
        assertThat(p.betas().orElse(List.of())).contains(AnthropicBeta.SERVER_SIDE_FALLBACK_2026_07_01);
    }

    @Test
    void Haiku_는_서버측_fallback_을_보내지_않음() throws Exception {
        MessageCreateParams p = AnthropicGateway.params(call("claude-haiku-5-5"), List.of());
        assertThat(body(p)).doesNotContain("fallbacks");
        assertThat(p.betas().orElse(List.of())).doesNotContain(AnthropicBeta.SERVER_SIDE_FALLBACK_2026_07_01);
    }

    @Test
    void 도구_호출_응답_읽기와_그대로_붙이기() throws Exception {
        BetaMessage m = SDK.readValue("""
                {"id":"msg_1","type":"message","role":"assistant","model":"claude-opus-5-5","stop_reason":"tool_use",
                 "stop_sequence":null,
                 "content":[{"type":"thinking","thinking":"","signature":"sig"},{"type":"text","text":"장면을 볼게요"},
                            {"type":"tool_use","id":"tu_1","name":"get_scene","input":{}}],
                 "usage":{"input_tokens":100,"output_tokens":20,"cache_read_input_tokens":50,"cache_creation_input_tokens":10}}
                """, BetaMessage.class);
        Turn t = AnthropicGateway.read(m);
        assertThat(t.stop()).isEqualTo(Stop.TOOL_USE);
        assertThat(t.text()).isEqualTo("장면을 볼게요");
        assertThat(t.toolCalls()).containsExactly(new ToolCall("tu_1", "get_scene", "{}"));
        assertThat(t.usage()).isEqualTo(new Usage("claude-opus-5-5", 100, 20, 50, 10));
        assertThat(AnthropicGateway.replayBlocks(m.content())).hasSize(3); // 생각 블록까지 그대로
    }

    @Test
    void 거절은_content_보다_먼저() throws Exception {
        BetaMessage m = SDK.readValue("""
                {"id":"msg_2","type":"message","role":"assistant","model":"claude-opus-5-5","stop_reason":"refusal",
                 "stop_sequence":null,"stop_details":{"type":"refusal","category":"cyber","explanation":"정책상 처리할 수 없음"},
                 "content":[{"type":"text","text":"부분"}],
                 "usage":{"input_tokens":5,"output_tokens":1}}
                """, BetaMessage.class);
        Turn t = AnthropicGateway.read(m);
        assertThat(t.stop()).isEqualTo(Stop.REFUSAL);
        assertThat(t.refusal()).isEqualTo("정책상 처리할 수 없음");
        assertThat(t.toolCalls()).isEmpty();
    }

    @Test
    void 중간_fallback_이면_앞_모델의_생각과_도구_호출은_빼고_붙임() throws Exception {
        BetaMessage m = SDK.readValue("""
                {"id":"msg_3","type":"message","role":"assistant","model":"claude-opus-4-8","stop_reason":"tool_use",
                 "stop_sequence":null,
                 "content":[{"type":"thinking","thinking":"","signature":"s1"},
                            {"type":"tool_use","id":"tu_old","name":"get_scene","input":{}},
                            {"type":"fallback","from":{"model":"claude-opus-5-5"},"to":{"model":"claude-opus-4-8"}},
                            {"type":"text","text":"이어서"},
                            {"type":"tool_use","id":"tu_new","name":"get_scene","input":{}}],
                 "usage":{"input_tokens":5,"output_tokens":1}}
                """, BetaMessage.class);
        Turn t = AnthropicGateway.read(m);
        assertThat(t.toolCalls()).extracting(ToolCall::id).containsExactly("tu_new");
        assertThat(t.usage().model()).isEqualTo("claude-opus-4-8");
        assertThat(AnthropicGateway.replayBlocks(m.content())).hasSize(3); // fallback · text · tu_new
    }

    @Test
    void 오류_종류별_한국어() {
        assertThat(new AiCallException(AiCallException.Kind.KEY, null).getMessage()).isEqualTo("API 키가 올바르지 않습니다");
        assertThat(new AiCallException(AiCallException.Kind.NETWORK, null).getMessage()).isEqualTo("Claude 서버에 연결하지 못했습니다");
        assertThat(new AiCallException(AiCallException.Kind.OTHER, "HTTP 400", null).getMessage())
                .isEqualTo("Claude 호출에 실패했습니다 (HTTP 400)");
    }
}
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd server && ./gradlew test --tests 'com.kopens.factory3d.ai.FakeGatewayTest' --tests 'com.kopens.factory3d.ai.AnthropicGatewayTest'`
Expected: 컴파일 실패 (`ClaudeGateway`·`FakeGateway`·`AnthropicGateway` 없음)

- [ ] **Step 4: 경계 인터페이스 · 오류**

`server/src/main/java/com/kopens/factory3d/ai/ClaudeGateway.java`:
```java
package com.kopens.factory3d.ai;

import java.util.List;
import java.util.function.Consumer;

/** Claude 호출 경계. 실제(AnthropicGateway) / 가짜(FakeGateway, 테스트·화면 확인). 이 밖의 코드는 SDK 타입을 모른다 */
public interface ClaudeGateway {
    record ToolSpec(String name, String description, String inputSchemaJson) {}

    record Call(String apiKey, String model, String system, List<ToolSpec> tools, long maxTokens) {}

    record ToolCall(String id, String name, String inputJson) {}

    record ToolResult(String toolUseId, String content, boolean isError) {}

    record Usage(String model, long input, long output, long cacheRead, long cacheWrite) {}

    enum Stop { END, TOOL_USE, MAX_TOKENS, REFUSAL, OTHER }

    /** 한 번의 응답. stop == REFUSAL 이면 refusal 에 사유, toolCalls 는 비어 있음 */
    record Turn(Stop stop, List<ToolCall> toolCalls, String text, String refusal, Usage usage) {}

    record Ping(String model, long latencyMs, Usage usage) {}

    Transcript newTranscript();

    /** 지금까지의 대화로 한 번 부름. 글자 조각은 onText 로 흘리고, 응답 content 는 t 에 그대로 붙인다 */
    Turn next(Call call, Transcript t, Consumer<String> onText);

    /** 연결 테스트 (짧은 호출) */
    Ping ping(String apiKey, String model);
}
```

`server/src/main/java/com/kopens/factory3d/ai/Transcript.java`:
```java
package com.kopens.factory3d.ai;

import java.util.List;

/** 게이트웨이가 가진 대화 기록 (불투명). 서버 메모리에만 있음 */
public interface Transcript {
    void addUserText(String text);

    /** 한 응답의 도구 호출 결과를 모두 한 사용자 메시지로 */
    void addToolResults(List<ClaudeGateway.ToolResult> results);

    int messages();
}
```

`server/src/main/java/com/kopens/factory3d/ai/AiCallException.java`:
```java
package com.kopens.factory3d.ai;

/** Claude 호출 실패 (메시지는 화면에 그대로 보임) */
public class AiCallException extends RuntimeException {
    public enum Kind { KEY, RATE, NETWORK, OTHER }

    private final Kind kind;

    public AiCallException(Kind kind, Throwable cause) {
        this(kind, null, cause);
    }

    public AiCallException(Kind kind, String detail, Throwable cause) {
        super(text(kind, detail), cause);
        this.kind = kind;
    }

    public Kind kind() {
        return kind;
    }

    static String text(Kind kind, String detail) {
        return switch (kind) {
            case KEY -> "API 키가 올바르지 않습니다";
            case RATE -> "잠시 뒤 다시 시도하세요 (요청이 많습니다)";
            case NETWORK -> "Claude 서버에 연결하지 못했습니다";
            case OTHER -> "Claude 호출에 실패했습니다" + (detail == null ? "" : " (" + detail + ")");
        };
    }
}
```

- [ ] **Step 5: 가짜 게이트웨이 (대본)**

`server/src/main/java/com/kopens/factory3d/ai/FakeGateway.java`:
```java
package com.kopens.factory3d.ai;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 정해 둔 대본으로 Claude 를 흉내 (factory3d.ai.fake=true — 테스트·화면 확인). 실제 API 를 부르지 않음 */
public class FakeGateway implements ClaudeGateway {
    static final Pattern MOVE = Pattern.compile("(.+?)\\s*[을를]\\s*(오른쪽|왼쪽|위쪽|아래쪽)으로\\s*([0-9]+(?:\\.[0-9]+)?)\\s*m");
    static final Pattern ROTATE = Pattern.compile("(.+?)\\s*[을를]\\s*([0-9]+(?:\\.[0-9]+)?)\\s*도로?\\s*돌려");
    static final Pattern DELETE = Pattern.compile("(.+?)\\s*[을를]\\s*(?:지워|삭제)");
    static final Pattern RENAME = Pattern.compile("(.+?)\\s*이름을\\s*(.+?)\\s*(?:으로|로)\\s*바꿔");
    static final Pattern ADD = Pattern.compile("(.+?)\\s*[을를]\\s*\\(\\s*([0-9.]+)\\s*,\\s*([0-9.]+)\\s*\\)\\s*에\\s*추가");
    static final Pattern TAKT = Pattern.compile("공정\\s+(.+?)\\s*택타임\\s*([0-9]+(?:\\.[0-9]+)?)\\s*분");
    static final Pattern WALL = Pattern.compile("가벽\\s*\\(\\s*([0-9.]+)\\s*,\\s*([0-9.]+)\\s*\\)\\s*-\\s*\\(\\s*([0-9.]+)\\s*,\\s*([0-9.]+)\\s*\\)\\s*추가");

    /** 대본용 기록: 사용자 글 · 응답(도구 호출) · 도구 결과 */
    static final class FakeTranscript implements Transcript {
        record Entry(String userText, List<ToolCall> calls, List<ToolResult> results) {}

        final List<Entry> entries = new ArrayList<>();

        public void addUserText(String text) {
            entries.add(new Entry(text, null, null));
        }

        public void addToolResults(List<ToolResult> results) {
            entries.add(new Entry(null, null, List.copyOf(results)));
        }

        void addAssistant(List<ToolCall> calls) {
            entries.add(new Entry(null, List.copyOf(calls), null));
        }

        public int messages() {
            return entries.size();
        }

        String lastUserText() {
            for (int i = entries.size() - 1; i >= 0; i--) if (entries.get(i).userText() != null) return entries.get(i).userText();
            return "";
        }

        ToolCall lastCall() {
            for (int i = entries.size() - 1; i >= 0; i--)
                if (entries.get(i).calls() != null && !entries.get(i).calls().isEmpty()) return entries.get(i).calls().getLast();
            return null;
        }
    }

    private int ids;

    @Override
    public Transcript newTranscript() {
        return new FakeTranscript();
    }

    @Override
    public synchronized Turn next(Call call, Transcript t, Consumer<String> onText) {
        FakeTranscript ft = (FakeTranscript) t;
        Usage usage = new Usage(call.model(), 1200, 80, 0, 0);
        FakeTranscript.Entry last = ft.entries.getLast();
        String said = strip(ft.lastUserText());
        if (last.userText() != null) {
            if (said.contains("거절")) {
                ft.addAssistant(List.of());
                return new Turn(Stop.REFUSAL, List.of(), "", "시험용 거절", usage);
            }
            if (said.contains("오류")) throw new AiCallException(AiCallException.Kind.RATE, null);
            onText.accept("장면을 ");
            onText.accept("확인하겠습니다.");
            return tool(ft, "get_scene", "{}", "장면을 확인하겠습니다.", usage);
        }
        ToolCall prev = ft.lastCall();
        if (said.contains("반복")) return tool(ft, "get_scene", "{}", "", usage);
        if (prev != null && prev.name().equals("get_scene")) {
            String[] w = intent(said);
            if (w != null) return tool(ft, w[0], w[1], "", usage);
            return end(ft, onText, "무엇을 바꿀지 객체 이름과 함께 알려 주세요.", usage);
        }
        ToolResult r = last.results() == null || last.results().isEmpty() ? null : last.results().getLast();
        if (r != null && r.isError()) return end(ft, onText, "요청한 내용을 처리하지 못했습니다: " + r.content(), usage);
        return end(ft, onText, "제안을 만들었습니다. 3D 미리보기를 확인하고 적용을 눌러 주세요.", usage);
    }

    @Override
    public Ping ping(String apiKey, String model) {
        if (apiKey != null && apiKey.contains("invalid")) throw new AiCallException(AiCallException.Kind.KEY, null);
        return new Ping(model, 5, new Usage(model, 20, 5, 0, 0));
    }

    /** 사용자 글 → {도구 이름, 입력 JSON} (없으면 null) */
    static String[] intent(String s) {
        Matcher m;
        if ((m = WALL.matcher(s)).find())
            return new String[] {"edit_partition", "{\"op\":\"add\",\"a\":[" + num(m.group(1)) + "," + num(m.group(2)) + "],\"b\":["
                    + num(m.group(3)) + "," + num(m.group(4)) + "]}"};
        if ((m = TAKT.matcher(s)).find())
            return new String[] {"set_station", "{\"name\":" + q(m.group(1)) + ",\"taktMin\":" + num(m.group(2)) + "}"};
        if ((m = MOVE.matcher(s)).find()) {
            double d = Double.parseDouble(m.group(3));
            double dx = switch (m.group(2)) { case "오른쪽" -> d; case "왼쪽" -> -d; default -> 0; };
            double dy = switch (m.group(2)) { case "위쪽" -> d; case "아래쪽" -> -d; default -> 0; };
            return new String[] {"move_object", "{\"name\":" + q(m.group(1)) + ",\"dx\":" + (dx + 0.0) + ",\"dy\":" + (dy + 0.0) + "}"};
        }
        if ((m = ROTATE.matcher(s)).find())
            return new String[] {"rotate_object", "{\"name\":" + q(m.group(1)) + ",\"rot\":" + num(m.group(2)) + "}"};
        if ((m = RENAME.matcher(s)).find())
            return new String[] {"rename_object", "{\"name\":" + q(m.group(1)) + ",\"newName\":" + q(m.group(2)) + "}"};
        if ((m = ADD.matcher(s)).find())
            return new String[] {"add_object", "{\"model\":" + q(m.group(1)) + ",\"x\":" + num(m.group(2)) + ",\"y\":" + num(m.group(3)) + "}"};
        if ((m = DELETE.matcher(s)).find()) return new String[] {"delete_object", "{\"name\":" + q(m.group(1)) + "}"};
        return null;
    }

    private Turn tool(FakeTranscript ft, String name, String input, String text, Usage usage) {
        ToolCall c = new ToolCall("fake-" + (++ids), name, input);
        ft.addAssistant(List.of(c));
        return new Turn(Stop.TOOL_USE, List.of(c), text, null, usage);
    }

    private static Turn end(FakeTranscript ft, Consumer<String> onText, String text, Usage usage) {
        onText.accept(text);
        ft.addAssistant(List.of());
        return new Turn(Stop.END, List.of(), text, null, usage);
    }

    /** 맨 앞 "[ … ]" 줄(시스템이 붙인 정보) 빼기 */
    static String strip(String s) {
        StringBuilder out = new StringBuilder();
        for (String line : s.split("\n")) if (!(line.startsWith("[") && line.endsWith("]"))) out.append(line).append('\n');
        return out.toString().strip();
    }

    private static String num(String s) {
        return String.valueOf(Double.parseDouble(s));
    }

    private static String q(String s) {
        return "\"" + s.strip().replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }
}
```

- [ ] **Step 6: 실제 게이트웨이 (SDK)**

`server/src/main/java/com/kopens/factory3d/ai/AnthropicGateway.java` — Step 1 의 `javap` 출력과 이름이 다르면 그 이름으로 고친다 (동작은 그대로):
```java
package com.kopens.factory3d.ai;

import com.anthropic.client.AnthropicClient;
import com.anthropic.client.okhttp.AnthropicOkHttpClient;
import com.anthropic.core.JsonValue;
import com.anthropic.core.ObjectMappers;
import com.anthropic.core.http.StreamResponse;
import com.anthropic.errors.AnthropicIoException;
import com.anthropic.errors.AnthropicRetryableException;
import com.anthropic.errors.AnthropicServiceException;
import com.anthropic.errors.InternalServerException;
import com.anthropic.errors.PermissionDeniedException;
import com.anthropic.errors.RateLimitException;
import com.anthropic.errors.SseException;
import com.anthropic.errors.UnauthorizedException;
import com.anthropic.helpers.BetaMessageAccumulator;
import com.anthropic.models.beta.AnthropicBeta;
import com.anthropic.models.beta.messages.BetaCacheControlEphemeral;
import com.anthropic.models.beta.messages.BetaContentBlock;
import com.anthropic.models.beta.messages.BetaContentBlockParam;
import com.anthropic.models.beta.messages.BetaMessage;
import com.anthropic.models.beta.messages.BetaMessageParam;
import com.anthropic.models.beta.messages.BetaOutputConfig;
import com.anthropic.models.beta.messages.BetaRawMessageStreamEvent;
import com.anthropic.models.beta.messages.BetaStopReason;
import com.anthropic.models.beta.messages.BetaTextBlockParam;
import com.anthropic.models.beta.messages.BetaTool;
import com.anthropic.models.beta.messages.BetaToolChoiceAuto;
import com.anthropic.models.beta.messages.BetaToolResultBlockParam;
import com.anthropic.models.beta.messages.BetaUsage;
import com.anthropic.models.beta.messages.MessageCreateParams;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

/**
 * 실제 Claude 호출 (공식 Java SDK · 베타 메시지 엔드포인트 · 스트리밍). SDK 의 Jackson 2 는 이 클래스 안에서만.
 * 규칙: thinking 안 보냄(Opus 5.5 = 적응형) · effort medium · tool_choice auto · 도구 strict · 시스템 1블록 캐시 ·
 * Haiku 가 아니면 server-side fallback("default") · 거절은 content 보다 먼저 · 응답 content 는 그대로 다음 요청에.
 */
public class AnthropicGateway implements ClaudeGateway {
    private static final ObjectMapper SDK_JSON = ObjectMappers.jsonMapper();

    private String clientKey;
    private AnthropicClient client;

    static final class SdkTranscript implements Transcript {
        final List<BetaMessageParam> messages = new ArrayList<>();

        public void addUserText(String text) {
            messages.add(BetaMessageParam.builder().role(BetaMessageParam.Role.USER).content(text).build());
        }

        public void addToolResults(List<ToolResult> results) {
            List<BetaContentBlockParam> blocks = results.stream()
                    .map(r -> BetaContentBlockParam.ofToolResult(BetaToolResultBlockParam.builder()
                            .toolUseId(r.toolUseId()).content(r.content()).isError(r.isError()).build()))
                    .toList();
            messages.add(BetaMessageParam.builder().role(BetaMessageParam.Role.USER).contentOfBetaContentBlockParams(blocks).build());
        }

        public int messages() {
            return messages.size();
        }
    }

    @Override
    public Transcript newTranscript() {
        return new SdkTranscript();
    }

    @Override
    public Turn next(Call call, Transcript t, Consumer<String> onText) {
        SdkTranscript tr = (SdkTranscript) t;
        MessageCreateParams params = params(call, tr.messages);
        BetaMessageAccumulator acc = BetaMessageAccumulator.create();
        try (StreamResponse<BetaRawMessageStreamEvent> s = client(call.apiKey()).beta().messages().createStreaming(params)) {
            s.stream().peek(acc::accumulate)
                    .flatMap(e -> e.contentBlockDelta().stream())
                    .flatMap(d -> d.delta().text().stream())
                    .forEach(d -> onText.accept(d.text()));
        } catch (RuntimeException e) {
            throw translate(e);
        }
        BetaMessage msg = acc.message();
        Turn turn = read(msg);
        tr.messages.add(BetaMessageParam.builder().role(BetaMessageParam.Role.ASSISTANT)
                .contentOfBetaContentBlockParams(replayBlocks(msg.content())).build());
        return turn;
    }

    @Override
    public Ping ping(String apiKey, String model) {
        MessageCreateParams p = MessageCreateParams.builder().model(model).maxTokens(256L)
                .outputConfig(BetaOutputConfig.builder().effort(BetaOutputConfig.Effort.LOW).build())
                .addUserMessage("연결 확인입니다. '확인' 이라고만 답하세요.").build();
        long t0 = System.nanoTime();
        try {
            BetaMessage m = client(apiKey).beta().messages().create(p);
            return new Ping(m.model().asString(), (System.nanoTime() - t0) / 1_000_000, usageOf(m));
        } catch (RuntimeException e) {
            throw translate(e);
        }
    }

    private synchronized AnthropicClient client(String apiKey) {
        if (client == null || !apiKey.equals(clientKey)) {
            if (client != null) client.close();
            client = AnthropicOkHttpClient.builder().apiKey(apiKey).maxRetries(2).timeout(Duration.ofMinutes(10)).build();
            clientKey = apiKey;
        }
        return client;
    }

    static MessageCreateParams params(Call call, List<BetaMessageParam> messages) {
        MessageCreateParams.Builder b = MessageCreateParams.builder()
                .model(call.model())
                .maxTokens(call.maxTokens())
                .outputConfig(BetaOutputConfig.builder().effort(BetaOutputConfig.Effort.MEDIUM).build())
                .systemOfBetaTextBlockParams(List.of(BetaTextBlockParam.builder().text(call.system())
                        .cacheControl(BetaCacheControlEphemeral.builder().ttl(BetaCacheControlEphemeral.Ttl.TTL_5M).build())
                        .build()))
                .toolChoice(BetaToolChoiceAuto.builder().build())
                .messages(messages);
        for (ToolSpec s : call.tools()) b.addTool(tool(s));
        if (hasServerFallback(call.model())) b.addBeta(AnthropicBeta.SERVER_SIDE_FALLBACK_2026_07_01).fallbacksDefault();
        return b.build();
    }

    /** Haiku 5.5 는 서버측 fallback 이 없음 (보내면 400) */
    static boolean hasServerFallback(String model) {
        return !model.startsWith("claude-haiku");
    }

    @SuppressWarnings("unchecked")
    static BetaTool tool(ToolSpec s) {
        Map<String, Object> schema;
        try {
            schema = SDK_JSON.readValue(s.inputSchemaJson(), Map.class);
        } catch (Exception e) {
            throw new IllegalStateException("도구 스키마가 올바르지 않습니다: " + s.name(), e);
        }
        var props = BetaTool.InputSchema.Properties.builder();
        ((Map<String, Object>) schema.getOrDefault("properties", Map.of())).forEach((k, v) -> props.putAdditionalProperty(k, JsonValue.from(v)));
        var in = BetaTool.InputSchema.builder().properties(props.build())
                .putAdditionalProperty("additionalProperties", JsonValue.from(false));
        if (schema.get("required") instanceof List<?> req) in.required(req.stream().map(String::valueOf).toList());
        return BetaTool.builder().name(s.name()).description(s.description()).inputSchema(in.build()).strict(true).build();
    }

    static Turn read(BetaMessage msg) {
        Usage usage = usageOf(msg);
        BetaStopReason stop = msg.stopReason().orElse(null);
        if (BetaStopReason.REFUSAL.equals(stop)) return new Turn(Stop.REFUSAL, List.of(), "", refusalReason(msg), usage);
        List<BetaContentBlock> content = msg.content();
        int from = lastFallback(content) + 1; // fallback 뒤 블록만 이번 답
        StringBuilder text = new StringBuilder();
        List<ToolCall> calls = new ArrayList<>();
        for (BetaContentBlock b : content.subList(from, content.size())) {
            b.text().ifPresent(x -> text.append(x.text()));
            b.toolUse().ifPresent(u -> calls.add(new ToolCall(u.id(), u.name(), json(u._input()))));
        }
        Stop s = stop == null ? Stop.OTHER
                : BetaStopReason.TOOL_USE.equals(stop) ? Stop.TOOL_USE
                : BetaStopReason.END_TURN.equals(stop) ? Stop.END
                : BetaStopReason.MAX_TOKENS.equals(stop) ? Stop.MAX_TOKENS : Stop.OTHER;
        return new Turn(s, calls, text.toString(), null, usage);
    }

    /** 다음 요청에 붙일 content (그대로, 생각 블록 포함). 단 중간 fallback 이면 마지막 fallback 앞의 thinking·redacted_thinking·tool_use 는 뺌 */
    static List<BetaContentBlockParam> replayBlocks(List<BetaContentBlock> content) {
        int last = lastFallback(content);
        List<BetaContentBlockParam> out = new ArrayList<>();
        for (int i = 0; i < content.size(); i++) {
            BetaContentBlock b = content.get(i);
            if (i < last && (b.isThinking() || b.isRedactedThinking() || b.isToolUse())) continue;
            out.add(b.toParam());
        }
        return out;
    }

    private static int lastFallback(List<BetaContentBlock> content) {
        int last = -1;
        for (int i = 0; i < content.size(); i++) if (content.get(i).isFallback()) last = i;
        return last;
    }

    private static String refusalReason(BetaMessage msg) {
        return msg.stopDetails().flatMap(d -> d.explanation()).filter(s -> !s.isBlank()).orElse("안전 정책");
    }

    static Usage usageOf(BetaMessage msg) {
        BetaUsage u = msg.usage();
        return new Usage(msg.model().asString(), u.inputTokens(), u.outputTokens(), u.cacheReadInputTokens().orElse(0L),
                u.cacheCreationInputTokens().orElse(0L));
    }

    private static String json(JsonValue v) {
        try {
            return SDK_JSON.writeValueAsString(v);
        } catch (Exception e) {
            return "{}";
        }
    }

    /** SDK 예외 → 사용자 문구 (타입으로 구분, 문자열 비교 안 함) */
    static AiCallException translate(RuntimeException e) {
        if (e instanceof AiCallException a) return a;
        if (e instanceof UnauthorizedException || e instanceof PermissionDeniedException) return new AiCallException(AiCallException.Kind.KEY, e);
        if (e instanceof RateLimitException) return new AiCallException(AiCallException.Kind.RATE, e);
        if (e instanceof InternalServerException || e instanceof SseException || e instanceof AnthropicIoException
                || e instanceof AnthropicRetryableException) return new AiCallException(AiCallException.Kind.NETWORK, e);
        if (e instanceof AnthropicServiceException s)
            return s.statusCode() >= 500 ? new AiCallException(AiCallException.Kind.NETWORK, e)
                    : new AiCallException(AiCallException.Kind.OTHER, "HTTP " + s.statusCode(), e);
        return new AiCallException(AiCallException.Kind.OTHER, e.getClass().getSimpleName(), e);
    }
}
```
- 이름 확인 메모: `fallbacksDefault()` · `isFallback()` · `stopDetails().explanation()` 의 실제 모양은 Step 1 `javap` 로 확인. `explanation()` 이 `Optional` 이 아니면 `Optional.ofNullable(...)` 으로, `_body()` 가 테스트에서 안 보이면 `javap … MessageCreateParams | grep -i body` 로 공개된 이름을 찾아 테스트만 고친다. 거절·fallback 규칙과 테스트의 기대값은 바꾸지 않는다.

- [ ] **Step 7: 빈 설정**

`server/src/main/java/com/kopens/factory3d/ai/AiConfig.java`:
```java
package com.kopens.factory3d.ai;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** factory3d.ai.fake=true 면 가짜 게이트웨이 (실제 Claude 를 부르지 않음) */
@Configuration
public class AiConfig {
    private static final Logger log = LoggerFactory.getLogger(AiConfig.class);

    @Bean
    ClaudeGateway claudeGateway(@Value("${factory3d.ai.fake:false}") boolean fake) {
        if (fake) {
            log.warn("AI 챗봇이 가짜 게이트웨이로 동작합니다 (F3D_AI_FAKE=true) — 정해 둔 대본으로만 답합니다");
            return new FakeGateway();
        }
        return new AnthropicGateway();
    }

    /** 챗봇 SSE 응답을 만드는 일꾼 (가상 스레드 — 요청마다 하나) */
    @Bean(destroyMethod = "close")
    ExecutorService aiExecutor() {
        return Executors.newVirtualThreadPerTaskExecutor();
    }
}
```

- [ ] **Step 8: 테스트 통과 확인**

Run: `cd server && ./gradlew test --tests 'com.kopens.factory3d.ai.*'`
Expected: PASS (FakeGatewayTest 3 · AnthropicGatewayTest 6 · Task 1 테스트 그대로)

Run: `cd server && ./gradlew test`
Expected: 전체 PASS (Jackson 2 가 classpath 에 들어와도 Spring 이 Jackson 3 로 응답을 쓰는지 — 기존 API 테스트 회귀 없음)

- [ ] **Step 9: Commit**

```bash
cd /c/kopens/project/Factory3D && git add server/build.gradle server/src/main/java/com/kopens/factory3d/ai \
  server/src/test/java/com/kopens/factory3d/ai/FakeGatewayTest.java server/src/test/java/com/kopens/factory3d/ai/AnthropicGatewayTest.java
git commit -m "feat(server): Claude 호출 경계 — 공식 Java SDK 게이트웨이(스트리밍·strict 도구·fallback·거절) · 가짜 대본 게이트웨이

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 서버 — 제안 묶음(Changeset) · 장면 도구(SceneTools) · 대화 저장소(ProposalStore)

**Files:**
- Create: `server/src/main/java/com/kopens/factory3d/ai/{Changeset,SceneTools,ProposalStore,Prompts}.java`
- Test: `server/src/test/java/com/kopens/factory3d/ai/{AiTestBase,SceneToolsTest}.java`, `server/src/test/java/com/kopens/factory3d/ai/ProposalStoreTest.java`

**Interfaces:**
- Consumes: `ClaudeGateway.ToolSpec`·`ToolCall`·`Transcript` (Task 3), `Snapshots` (Task 2), `DrawingMapper.findById`, `PlacementMapper.findByDrawing`, `ModelMapper.findAll`, `StationMapper.findByDrawing`.
- Produces (Java):
  - `Changeset`: `String id()` (UUID — 적용하면 change_log 의 batch_id), `List<Item> items()` (seq 순), `boolean isEmpty()`, `int version()` (바뀔 때마다 +1), `int nextSeq()`, `Optional<Item> find(String targetKey)`, `Item add(kind, target, targetKey, JsonNode before, JsonNode after, String label)`, `Item replace(Item old, kind, target, JsonNode before, JsonNode after, String label)` (seq·targetKey 유지), `void remove(Item)`, `Snapshot snapshot()`, `void restore(Snapshot)`, `View view()`. 레코드 `Item(int seq, String kind, String target, String targetKey, JsonNode before, JsonNode after, String label)`, `View(String id, List<Item> items)`.
  - 제안 규칙: 대상(targetKey)마다 항목 하나 — 같은 대상을 또 바꾸면 그 항목의 after 만 바뀜(before = DB 값 유지, seq 유지, 종류는 before↔after 로 다시 계산). 원래 값으로 돌아오면 항목을 지움. 새로 추가 제안한 객체는 targetKey `new:<seq>` — 그 객체를 옮기면 추가 항목의 after 가 바뀌고, 지우면 추가 항목이 사라짐. 가벽 추가는 `partition:<새 id>` (id = `p<기존 최대 번호+1>`, h 1.2 · t 0.5).
  - `SceneTools`: `List<ClaudeGateway.ToolSpec> specs()` (순서 고정 — 캐시), `Result execute(long drawingId, Changeset cs, ClaudeGateway.ToolCall call)`, 레코드 `Result(String content, boolean isError, String label)` — content 는 Claude 에게 줄 짧은 JSON, label 은 화면 진행 줄 (`장면 확인 중…`, `Main Station 1 이동 제안`, `확인 필요: …`). **DB 를 바꾸지 않는다.**
  - 도구 이름: `get_scene` · `move_object` · `rotate_object` · `add_object` · `delete_object` · `rename_object` · `set_station` · `edit_partition` · `rename_zone`.
  - `ProposalStore`: `Conversation get(String user, long drawingId, Supplier<Transcript> fresh)` (없거나 30분 안 썼으면 새로), `void reset(String user, long drawingId)`, `Optional<Conversation> byChangeset(String user, String batchId)`. `Conversation`: 필드 `user`, `drawingId`, `transcript`, `changeset`, `turns`, `lock`(ReentrantLock), 메서드 `String takeNote()`, `void finish(String note)` (새 Changeset + 다음 메시지 앞에 붙일 note). 상수 `IDLE = 30분`, `MAX_TURNS = 40`. 생성자 `ProposalStore(Clock clock)` + 기본 빈은 `Clock.systemUTC()`.
  - `Prompts.SYSTEM` (고정 시스템 프롬프트), `Prompts.MAX_TOKENS = 16000`.

- [ ] **Step 1: 테스트 바탕 (AI 테스트 공통)**

`server/src/test/java/com/kopens/factory3d/ai/AiTestBase.java`:
```java
package com.kopens.factory3d.ai;

import com.kopens.factory3d.support.IntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * AI 테스트 공통 장면 (가짜 게이트웨이): 도면 40×20m · 가벽 p1 · 구역 z1 '조립 구역' · 모델 'Main Station'(별칭 MS, 4×3×2.5) ·
 * 배치 'Main Station 1'(10,5) 'Main Station 2'(20,5) · 공정 '조립'(Main Station 1, 택타임 1200초)
 */
abstract class AiTestBase extends IntegrationTest {
    static final String PLAN = "{\"format\":1,\"bounds\":{\"w\":40,\"h\":20},\"lines\":[],"
            + "\"partitions\":[{\"id\":\"p1\",\"pts\":[[1,1],[5,1]],\"h\":1.2,\"t\":0.5}],"
            + "\"zones\":[{\"id\":\"z1\",\"name\":\"조립 구역\",\"poly\":[[0,0],[10,0],[10,5],[0,5]],\"color\":\"#88aaff\",\"stationId\":null}]}";

    @Autowired AiSettingService settings;
    long drawing;
    long model;
    long ms1;
    long ms2;
    long station;

    @BeforeEach
    void scene() {
        drawing = jdbc.queryForObject("insert into drawing (name, source_type, source_file, plan) values ('나셀 공장', 'dxf', 'x', cast(? as jsonb)) returning id",
                Long.class, PLAN);
        model = jdbc.queryForObject("insert into model (name, category, source_ext, size_x, size_y, size_z, aliases) "
                + "values ('Main Station', 'equip', 'glb', 4, 3, 2.5, '{MS}') returning id", Long.class);
        ms1 = jdbc.queryForObject("insert into placement (drawing_id, model_id, name, x, y, rot) values (?, ?, 'Main Station 1', 10, 5, 0) returning id",
                Long.class, drawing, model);
        ms2 = jdbc.queryForObject("insert into placement (drawing_id, model_id, name, x, y, rot) values (?, ?, 'Main Station 2', 20, 5, 0) returning id",
                Long.class, drawing, model);
        station = jdbc.queryForObject("insert into station (drawing_id, sort_order, name, placement_name, steps) "
                + "values (?, 1, '조립', 'Main Station 1', '{a,b}') returning id", Long.class, drawing);
    }

    /** 키 등록 + 사용 (가짜 게이트웨이라 키 값은 쓰이지 않음) */
    void enableAi() {
        settings.setKey("sk-ant-api03-test-key-00000000abcd", "admin");
        settings.update(new AiSettingService.Update(null, null, true), "admin");
    }

    double placementX(long id) {
        return jdbc.queryForObject("select x from placement where id = ?", Double.class, id);
    }
}
```

- [ ] **Step 2: 실패 테스트 작성**

`server/src/test/java/com/kopens/factory3d/ai/SceneToolsTest.java`:
```java
package com.kopens.factory3d.ai;

import static org.assertj.core.api.Assertions.assertThat;

import com.kopens.factory3d.ai.ClaudeGateway.ToolCall;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class SceneToolsTest extends AiTestBase {
    @Autowired SceneTools tools;
    final Changeset cs = new Changeset();
    int n;

    SceneTools.Result run(String name, String input) {
        return tools.execute(drawing, cs, new ToolCall("t" + (++n), name, input));
    }

    @Test
    void 도구_목록은_9개_strict_스키마() {
        assertThat(tools.specs()).extracting(ClaudeGateway.ToolSpec::name).containsExactly("get_scene", "move_object", "rotate_object",
                "add_object", "delete_object", "rename_object", "set_station", "edit_partition", "rename_zone");
        assertThat(tools.specs()).allSatisfy(s -> assertThat(s.inputSchemaJson()).contains("\"additionalProperties\":false"));
    }

    @Test
    void 장면_읽기() {
        SceneTools.Result r = run("get_scene", "{}");
        assertThat(r.isError()).isFalse();
        assertThat(r.label()).isEqualTo("장면 확인 중…");
        assertThat(r.content()).contains("\"name\":\"나셀 공장\"", "\"widthM\":40.0", "Main Station 1", "\"model\":\"Main Station\"",
                "조립 구역", "\"id\":\"p1\"", "\"taktMin\":20.0", "\"aliases\":[\"MS\"]", "\"pendingChanges\":0");
    }

    @Test
    void 이동_제안은_겹쳐_계산하고_원래대로면_지움() {
        SceneTools.Result a = run("move_object", "{\"name\":\"Main Station 1\",\"dx\":2}");
        assertThat(a.isError()).isFalse();
        assertThat(a.content()).contains("제안 #1 기록됨 (아직 적용 안 됨)");
        assertThat(a.label()).isEqualTo("Main Station 1 이동 제안");
        Changeset.Item it = cs.items().get(0);
        assertThat(it.kind()).isEqualTo("placement.move");
        assertThat(it.targetKey()).isEqualTo("placement:" + ms1);
        assertThat(it.before().path("x").asDouble()).isEqualTo(10);
        assertThat(it.after().path("x").asDouble()).isEqualTo(12);
        assertThat(it.label()).isEqualTo("Main Station 1 이동 (10.0, 5.0) → (12.0, 5.0)");

        run("move_object", "{\"name\":\"main station 1\",\"dx\":2}"); // 이름은 대소문자·공백 무시
        assertThat(cs.items()).hasSize(1);
        assertThat(cs.items().get(0).seq()).isEqualTo(1);
        assertThat(cs.items().get(0).after().path("x").asDouble()).isEqualTo(14);

        run("rotate_object", "{\"name\":\"Main Station 1\",\"rot\":450}");
        assertThat(cs.items().get(0).kind()).isEqualTo("placement.update");
        assertThat(cs.items().get(0).after().path("rot").asDouble()).isEqualTo(90);

        run("move_object", "{\"name\":\"Main Station 1\",\"x\":10,\"y\":5}");
        run("rotate_object", "{\"name\":\"Main Station 1\",\"rot\":0}");
        assertThat(cs.isEmpty()).isTrue();
        assertThat(placementX(ms1)).isEqualTo(10); // DB 는 그대로
    }

    @Test
    void 잘못된_입력은_오류_결과() {
        assertThat(run("move_object", "{\"name\":\"없는 설비\",\"dx\":1}").content()).contains("'없는 설비' 이름의 객체가 없습니다");
        SceneTools.Result out = run("move_object", "{\"name\":\"Main Station 1\",\"x\":50,\"y\":5}");
        assertThat(out.isError()).isTrue();
        assertThat(out.content()).contains("도면 밖입니다 (x 0~40, y 0~20 m)");
        assertThat(out.label()).startsWith("확인 필요: ");
        assertThat(run("move_object", "{\"name\":\"Main Station 1\"}").content()).contains("x·y 또는 dx·dy 를 주세요");
        assertThat(run("rename_object", "{\"name\":\"Main Station 1\",\"newName\":\"Main Station 2\"}").content())
                .contains("같은 이름의 객체가 이미 있습니다");
        assertThat(run("add_object", "{\"model\":\"로봇팔\",\"x\":1,\"y\":1}").content()).contains("'로봇팔' 모델이 없습니다", "Main Station");
        assertThat(run("nope", "{}").isError()).isTrue();
        assertThat(cs.isEmpty()).isTrue();
    }

    @Test
    void 추가한_객체를_옮기면_추가_항목이_바뀌고_지우면_사라짐() {
        SceneTools.Result a = run("add_object", "{\"model\":\"ms\",\"x\":30,\"y\":10}"); // 별칭
        assertThat(a.isError()).isFalse();
        Changeset.Item add = cs.items().get(0);
        assertThat(add.kind()).isEqualTo("placement.add");
        assertThat(add.target()).isEqualTo("Main Station 3");
        assertThat(add.targetKey()).isEqualTo("new:1");
        assertThat(add.after().path("modelId").asLong()).isEqualTo(model);
        assertThat(add.before()).isNull();

        run("move_object", "{\"name\":\"Main Station 3\",\"dy\":-2}");
        assertThat(cs.items()).hasSize(1);
        assertThat(cs.items().get(0).after().path("y").asDouble()).isEqualTo(8);
        assertThat(cs.items().get(0).label()).isEqualTo("Main Station 3 추가 (30.0, 8.0)");

        run("delete_object", "{\"name\":\"Main Station 3\"}");
        assertThat(cs.isEmpty()).isTrue();
    }

    @Test
    void 삭제_이름변경_공정_가벽_구역() {
        run("delete_object", "{\"name\":\"Main Station 2\"}");
        run("rename_object", "{\"name\":\"Main Station 1\",\"newName\":\"MS-1\"}");
        run("set_station", "{\"name\":\"조립\",\"taktMin\":25,\"warnPp\":12}");
        run("edit_partition", "{\"op\":\"add\",\"a\":[2,10],\"b\":[8,10]}");
        run("edit_partition", "{\"op\":\"delete\",\"id\":\"p1\"}");
        run("rename_zone", "{\"id\":\"z1\",\"name\":\"허브 구역\"}");
        assertThat(cs.items()).extracting(Changeset.Item::kind).containsExactly("placement.delete", "placement.rename", "station.update",
                "plan.partition.add", "plan.partition.delete", "plan.zone.rename");
        assertThat(cs.items()).extracting(Changeset.Item::label).containsExactly(
                "Main Station 2 삭제",
                "Main Station 1 이름 → MS-1",
                "공정 조립: 택타임 20분 → 25분 · 주의 10% → 12%",
                "가벽 추가 (2.0, 10.0) → (8.0, 10.0)",
                "가벽 p1 삭제",
                "구역 조립 구역 → 허브 구역");
        assertThat(cs.items().get(0).after()).isNull();
        assertThat(cs.items().get(2).after().path("taktSec").asInt()).isEqualTo(1500);
        assertThat(cs.items().get(3).targetKey()).isEqualTo("partition:p2");
        assertThat(cs.items().get(3).after().toString()).isEqualTo("{\"id\":\"p2\",\"pts\":[[2.0,10.0],[8.0,10.0]],\"h\":1.2,\"t\":0.5}");
        assertThat(run("set_station", "{\"name\":\"조립\",\"warnPp\":30,\"delayPp\":20}").content())
                .contains("0 ≤ 주의 < 지연 ≤ 100");
        assertThat(run("get_scene", "{}").content()).contains("MS-1", "\"pendingChanges\":6").doesNotContain("\"name\":\"Main Station 2\"");
        assertThat(jdbc.queryForObject("select plan->'zones'->0->>'name' from drawing where id = ?", String.class, drawing)).isEqualTo("조립 구역");
        assertThat(jdbc.queryForObject("select count(*) from placement where drawing_id = ?", Integer.class, drawing)).isEqualTo(2);
    }

    @Test
    void 되돌리기_스냅샷() {
        run("move_object", "{\"name\":\"Main Station 1\",\"dx\":1}");
        Changeset.Snapshot s = cs.snapshot();
        int v = cs.version();
        run("move_object", "{\"name\":\"Main Station 2\",\"dx\":1}");
        cs.restore(s);
        assertThat(cs.items()).hasSize(1);
        assertThat(cs.version()).isGreaterThan(v);
        assertThat(cs.nextSeq()).isEqualTo(2);
    }
}
```

`server/src/test/java/com/kopens/factory3d/ai/ProposalStoreTest.java`:
```java
package com.kopens.factory3d.ai;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class ProposalStoreTest {
    static final class MovableClock extends Clock {
        Instant now = Instant.parse("2026-11-13T00:00:00Z");

        public ZoneOffset getZone() {
            return ZoneOffset.UTC;
        }

        public Clock withZone(java.time.ZoneId z) {
            return this;
        }

        public Instant instant() {
            return now;
        }
    }

    final MovableClock clock = new MovableClock();
    final ProposalStore store = new ProposalStore(clock);
    final FakeGateway g = new FakeGateway();

    @Test
    void 사용자_도면별_대화_하나_30분_지나면_새로() {
        ProposalStore.Conversation a = store.get("kim", 1, g::newTranscript);
        assertThat(store.get("kim", 1, g::newTranscript)).isSameAs(a);
        assertThat(store.get("kim", 2, g::newTranscript)).isNotSameAs(a);
        assertThat(store.get("lee", 1, g::newTranscript)).isNotSameAs(a);
        clock.now = clock.now.plus(Duration.ofMinutes(31));
        assertThat(store.get("kim", 1, g::newTranscript)).isNotSameAs(a);
    }

    @Test
    void 묶음_id_로_찾고_끝내면_새_묶음과_메모() {
        ProposalStore.Conversation c = store.get("kim", 1, g::newTranscript);
        String id = c.changeset.id();
        assertThat(store.byChangeset("kim", id)).containsSame(c);
        assertThat(store.byChangeset("lee", id)).isEmpty(); // 다른 사람 묶음은 못 찾음
        c.finish("[직전 제안 묶음: 1건 적용]");
        assertThat(c.changeset.id()).isNotEqualTo(id);
        assertThat(store.byChangeset("kim", id)).isEmpty();
        assertThat(c.takeNote()).isEqualTo("[직전 제안 묶음: 1건 적용]");
        assertThat(c.takeNote()).isNull();
        store.reset("kim", 1);
        assertThat(store.get("kim", 1, g::newTranscript)).isNotSameAs(c);
    }
}
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd server && ./gradlew test --tests 'com.kopens.factory3d.ai.SceneToolsTest' --tests 'com.kopens.factory3d.ai.ProposalStoreTest'`
Expected: 컴파일 실패 (`Changeset`·`SceneTools`·`ProposalStore` 없음)

- [ ] **Step 4: 제안 묶음**

`server/src/main/java/com/kopens/factory3d/ai/Changeset.java`:
```java
package com.kopens.factory3d.ai;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import tools.jackson.databind.JsonNode;

/** 한 대화의 아직 적용 안 한 변경 제안 묶음. 대상(targetKey)마다 항목 하나, seq 순. 대화 잠금(ProposalStore) 안에서만 바뀜 */
public final class Changeset {
    public record Item(int seq, String kind, String target, String targetKey, JsonNode before, JsonNode after, String label) {}

    public record View(String id, List<Item> items) {}

    public record Snapshot(List<Item> items, int nextSeq) {}

    private final String id = UUID.randomUUID().toString();
    private final List<Item> items = new ArrayList<>();
    private int nextSeq = 1;
    private int version;

    public String id() {
        return id;
    }

    public List<Item> items() {
        return List.copyOf(items);
    }

    public boolean isEmpty() {
        return items.isEmpty();
    }

    public int version() {
        return version;
    }

    public int nextSeq() {
        return nextSeq;
    }

    public Optional<Item> find(String targetKey) {
        return items.stream().filter(i -> i.targetKey().equals(targetKey)).findFirst();
    }

    public Item add(String kind, String target, String targetKey, JsonNode before, JsonNode after, String label) {
        Item it = new Item(nextSeq++, kind, target, targetKey, before, after, label);
        items.add(it);
        version++;
        return it;
    }

    public Item replace(Item old, String kind, String target, JsonNode before, JsonNode after, String label) {
        Item it = new Item(old.seq(), kind, target, old.targetKey(), before, after, label);
        items.set(items.indexOf(old), it);
        version++;
        return it;
    }

    public void remove(Item old) {
        if (items.remove(old)) version++;
    }

    public Snapshot snapshot() {
        return new Snapshot(List.copyOf(items), nextSeq);
    }

    public void restore(Snapshot s) {
        items.clear();
        items.addAll(s.items());
        nextSeq = s.nextSeq();
        version++;
    }

    public View view() {
        return new View(id, items());
    }
}
```

- [ ] **Step 5: 장면 도구**

`server/src/main/java/com/kopens/factory3d/ai/SceneTools.java`:
```java
package com.kopens.factory3d.ai;

import static com.kopens.factory3d.change.Snapshots.text;

import com.kopens.factory3d.change.Snapshots;
import com.kopens.factory3d.common.NotFoundException;
import com.kopens.factory3d.drawing.DrawingDetail;
import com.kopens.factory3d.drawing.DrawingMapper;
import com.kopens.factory3d.model.ModelInfo;
import com.kopens.factory3d.model.ModelMapper;
import com.kopens.factory3d.placement.PlacementMapper;
import com.kopens.factory3d.placement.PlacementView;
import com.kopens.factory3d.station.StationMapper;
import com.kopens.factory3d.station.StationView;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Claude 에게 주는 도구. 읽기(get_scene)는 DB + 쌓인 제안을 보여 주고, 쓰기는 DB 를 바꾸지 않고 Changeset 에만 쌓는다.
 * 좌표는 plan m (왼쪽 아래 원점, y 위쪽), rot 도·반시계.
 */
@Component
public class SceneTools {
    public record Result(String content, boolean isError, String label) {}

    static final int MAX_OBJECTS = 600;
    static final int MAX_MODELS = 200;
    static final double PARTITION_H = 1.2;
    static final double PARTITION_T = 0.5;
    private static final Pattern PART_ID = Pattern.compile("^p(\\d+)$");

    private final DrawingMapper drawings;
    private final PlacementMapper placements;
    private final ModelMapper models;
    private final StationMapper stations;
    private final ObjectMapper json;
    private final List<ClaudeGateway.ToolSpec> specs;

    public SceneTools(DrawingMapper drawings, PlacementMapper placements, ModelMapper models, StationMapper stations, ObjectMapper json) {
        this.drawings = drawings;
        this.placements = placements;
        this.models = models;
        this.stations = stations;
        this.json = json;
        this.specs = List.of(
                spec("get_scene", "지금 도면의 장면을 읽는다: 도면 크기(m), 구역, 가벽, 배치 객체(이름·모델·위치·회전·크기), 공정 기준정보, 쓸 수 있는 모델, 아직 적용 안 한 제안 수. 바꾸기 전에 먼저 부른다.",
                        "{}", "[]"),
                spec("move_object", "배치 객체를 옮기는 제안. 절대 위치(x, y) 또는 상대 이동(dx, dy, m)을 준다. 오른쪽 +x, 위쪽 +y.",
                        "{\"name\":{\"type\":\"string\",\"description\":\"객체 이름\"},\"x\":{\"type\":\"number\"},\"y\":{\"type\":\"number\"},"
                                + "\"dx\":{\"type\":\"number\"},\"dy\":{\"type\":\"number\"}}", "[\"name\"]"),
                spec("rotate_object", "배치 객체의 회전을 rot 도(반시계)로 바꾸는 제안.",
                        "{\"name\":{\"type\":\"string\"},\"rot\":{\"type\":\"number\",\"description\":\"도, 반시계\"}}", "[\"name\",\"rot\"]"),
                spec("add_object", "모델(이름 또는 별칭)을 (x, y)에 새로 놓는 제안. 이름을 안 주면 '<모델> n'.",
                        "{\"model\":{\"type\":\"string\"},\"name\":{\"type\":\"string\"},\"x\":{\"type\":\"number\"},\"y\":{\"type\":\"number\"},"
                                + "\"rot\":{\"type\":\"number\"}}", "[\"model\",\"x\",\"y\"]"),
                spec("delete_object", "배치 객체를 지우는 제안.", "{\"name\":{\"type\":\"string\"}}", "[\"name\"]"),
                spec("rename_object", "배치 객체의 이름을 바꾸는 제안.", "{\"name\":{\"type\":\"string\"},\"newName\":{\"type\":\"string\"}}",
                        "[\"name\",\"newName\"]"),
                spec("set_station", "공정 기준정보를 바꾸는 제안 (관리자만 적용 가능): 택타임(분), 주의·지연 기준(%), 칩을 붙일 배치 이름(빈 문자열 = 없앰).",
                        "{\"name\":{\"type\":\"string\",\"description\":\"공정 이름\"},\"taktMin\":{\"type\":\"number\"},\"warnPp\":{\"type\":\"integer\"},"
                                + "\"delayPp\":{\"type\":\"integer\"},\"placementName\":{\"type\":\"string\"}}", "[\"name\"]"),
                spec("edit_partition", "가벽을 추가(op=add, 두 점 a·b [x, y] m)하거나 지우는(op=delete, id) 제안.",
                        "{\"op\":{\"type\":\"string\",\"enum\":[\"add\",\"delete\"]},\"a\":{\"type\":\"array\",\"items\":{\"type\":\"number\"}},"
                                + "\"b\":{\"type\":\"array\",\"items\":{\"type\":\"number\"}},\"id\":{\"type\":\"string\"}}", "[\"op\"]"),
                spec("rename_zone", "구역 이름을 바꾸는 제안.", "{\"id\":{\"type\":\"string\"},\"name\":{\"type\":\"string\"}}", "[\"id\",\"name\"]"));
    }

    private static ClaudeGateway.ToolSpec spec(String name, String description, String props, String required) {
        return new ClaudeGateway.ToolSpec(name, description,
                "{\"type\":\"object\",\"properties\":" + props + ",\"required\":" + required + ",\"additionalProperties\":false}");
    }

    public List<ClaudeGateway.ToolSpec> specs() {
        return specs;
    }

    /** 지금 장면 = DB + 쌓인 제안 */
    final class Scene {
        DrawingDetail drawing;
        JsonNode plan;
        double w;
        double h;
        final Map<String, ObjectNode> objects = new LinkedHashMap<>(); // placement:<id> · new:<seq> → 스냅샷
        final Map<String, ObjectNode> partitions = new LinkedHashMap<>(); // 가벽 id → {id, pts, h, t}
        final Map<String, String> zones = new LinkedHashMap<>(); // 구역 id → 이름
        final Map<String, ObjectNode> stationsByKey = new LinkedHashMap<>(); // station:<id> → 스냅샷
        final Map<Long, ModelInfo> modelsById = new LinkedHashMap<>();
        final Set<String> partitionIdsEver = new HashSet<>();
    }

    Scene load(long drawingId, Changeset cs) {
        Scene s = new Scene();
        s.drawing = drawings.findById(drawingId);
        if (s.drawing == null) throw new NotFoundException("도면을 찾을 수 없습니다.");
        s.plan = json.readTree(s.drawing.plan());
        s.w = s.plan.path("bounds").path("w").asDouble();
        s.h = s.plan.path("bounds").path("h").asDouble();
        for (PlacementView p : placements.findByDrawing(drawingId)) s.objects.put("placement:" + p.id(), Snapshots.placement(json, p));
        for (JsonNode p : s.plan.path("partitions")) {
            s.partitions.put(p.path("id").asText(), (ObjectNode) p.deepCopy());
            s.partitionIdsEver.add(p.path("id").asText());
        }
        for (JsonNode z : s.plan.path("zones")) s.zones.put(z.path("id").asText(), z.path("name").asText());
        for (StationView st : stations.findByDrawing(drawingId)) s.stationsByKey.put("station:" + st.id(), Snapshots.station(json, st));
        for (ModelInfo m : models.findAll()) s.modelsById.put(m.id(), m);
        for (Changeset.Item it : cs.items()) {
            switch (it.kind()) {
                case "placement.delete" -> s.objects.remove(it.targetKey());
                case "station.update" -> s.stationsByKey.put(it.targetKey(), (ObjectNode) it.after());
                case "plan.partition.add" -> {
                    s.partitions.put(text(it.after(), "id"), (ObjectNode) it.after());
                    s.partitionIdsEver.add(text(it.after(), "id"));
                }
                case "plan.partition.delete" -> s.partitions.remove(text(it.before(), "id"));
                case "plan.zone.rename" -> s.zones.put(text(it.after(), "id"), text(it.after(), "name"));
                default -> s.objects.put(it.targetKey(), (ObjectNode) it.after()); // placement.add · move · rotate · rename · update
            }
        }
        return s;
    }

    public Result execute(long drawingId, Changeset cs, ClaudeGateway.ToolCall call) {
        JsonNode in;
        try {
            in = json.readTree(call.inputJson() == null || call.inputJson().isBlank() ? "{}" : call.inputJson());
        } catch (RuntimeException e) {
            return err("입력 JSON 을 읽지 못했습니다");
        }
        Scene s = load(drawingId, cs);
        return switch (call.name()) {
            case "get_scene" -> scene(s, cs);
            case "move_object" -> move(s, cs, in);
            case "rotate_object" -> rotate(s, cs, in);
            case "add_object" -> add(s, cs, in);
            case "delete_object" -> delete(s, cs, in);
            case "rename_object" -> rename(s, cs, in);
            case "set_station" -> setStation(s, cs, in);
            case "edit_partition" -> partition(s, cs, in);
            case "rename_zone" -> renameZone(s, cs, in);
            default -> err("모르는 도구입니다: " + call.name());
        };
    }

    // ---------- 읽기 ----------

    private Result scene(Scene s, Changeset cs) {
        ObjectNode out = json.createObjectNode();
        out.putObject("drawing").put("name", s.drawing.name()).put("widthM", r2(s.w)).put("heightM", r2(s.h));
        ArrayNode zones = out.putArray("zones");
        for (JsonNode z : s.plan.path("zones")) {
            String id = z.path("id").asText();
            double cx = 0, cy = 0;
            int k = 0;
            for (JsonNode p : z.path("poly")) {
                cx += p.path(0).asDouble();
                cy += p.path(1).asDouble();
                k++;
            }
            ObjectNode zn = zones.addObject().put("id", id).put("name", s.zones.getOrDefault(id, z.path("name").asText()));
            if (k > 0) zn.putArray("center").add(r2(cx / k)).add(r2(cy / k));
        }
        ArrayNode parts = out.putArray("partitions");
        for (ObjectNode p : s.partitions.values()) {
            JsonNode pts = p.path("pts");
            ObjectNode pn = parts.addObject().put("id", p.path("id").asText());
            pn.set("a", pts.path(0));
            pn.set("b", pts.path(pts.size() - 1));
        }
        ArrayNode objs = out.putArray("objects");
        int i = 0;
        for (ObjectNode o : s.objects.values()) {
            if (i++ >= MAX_OBJECTS) break;
            ModelInfo m = model(s, o);
            ObjectNode on = objs.addObject().put("name", text(o, "name"))
                    .put("model", m == null ? "(모델 없음)" : m.name()).put("category", m == null ? "" : m.category())
                    .put("x", r2(o.path("x").asDouble())).put("y", r2(o.path("y").asDouble())).put("rot", r2(o.path("rot").asDouble()));
            on.putArray("sizeM").add(r2(m == null ? 2 : m.sizeX())).add(r2(m == null ? 2 : m.sizeY()));
        }
        if (s.objects.size() > MAX_OBJECTS) out.put("omittedObjects", s.objects.size() - MAX_OBJECTS);
        ArrayNode sts = out.putArray("stations");
        for (ObjectNode st : s.stationsByKey.values())
            sts.addObject().put("name", text(st, "name")).put("placementName", text(st, "placementName"))
                    .put("taktMin", r2(st.path("taktSec").asInt() / 60.0)).put("warnPp", st.path("warnPp").asInt())
                    .put("delayPp", st.path("delayPp").asInt());
        ArrayNode ms = out.putArray("models");
        int j = 0;
        for (ModelInfo m : s.modelsById.values()) {
            if (j++ >= MAX_MODELS) break;
            ObjectNode mn = ms.addObject().put("name", m.name()).put("category", m.category());
            mn.putArray("sizeM").add(r2(m.sizeX())).add(r2(m.sizeY())).add(r2(m.sizeZ()));
            ArrayNode al = mn.putArray("aliases");
            m.aliases().forEach(al::add);
        }
        out.put("pendingChanges", cs.items().size());
        return new Result(out.toString(), false, "장면 확인 중…");
    }

    // ---------- 배치 ----------

    private Result move(Scene s, Changeset cs, JsonNode in) {
        Found f = findObject(s, text(in, "name"));
        if (f.error != null) return err(f.error);
        double x, y;
        if (in.hasNonNull("x") && in.hasNonNull("y")) {
            x = in.path("x").asDouble();
            y = in.path("y").asDouble();
        } else if (in.hasNonNull("dx") || in.hasNonNull("dy")) {
            x = f.node.path("x").asDouble() + in.path("dx").asDouble(0);
            y = f.node.path("y").asDouble() + in.path("dy").asDouble(0);
        } else return err("x·y 또는 dx·dy 를 주세요");
        String bad = outside(s, x, y);
        if (bad != null) return err(bad);
        ObjectNode next = f.node.deepCopy();
        next.put("x", r2(x));
        next.put("y", r2(y));
        return proposeObject(cs, f, next, "이동");
    }

    private Result rotate(Scene s, Changeset cs, JsonNode in) {
        Found f = findObject(s, text(in, "name"));
        if (f.error != null) return err(f.error);
        if (!in.path("rot").isNumber()) return err("rot(도)를 주세요");
        ObjectNode next = f.node.deepCopy();
        next.put("rot", r2(((in.path("rot").asDouble() % 360) + 360) % 360));
        return proposeObject(cs, f, next, "회전");
    }

    private Result rename(Scene s, Changeset cs, JsonNode in) {
        Found f = findObject(s, text(in, "name"));
        if (f.error != null) return err(f.error);
        String nn = text(in, "newName") == null ? "" : text(in, "newName").strip();
        if (nn.isEmpty() || nn.length() > 100) return err("새 이름은 1~100자로 주세요");
        for (Map.Entry<String, ObjectNode> e : s.objects.entrySet())
            if (!e.getKey().equals(f.key) && nn.equals(text(e.getValue(), "name"))) return err("같은 이름의 객체가 이미 있습니다: " + nn);
        ObjectNode next = f.node.deepCopy();
        next.put("name", nn);
        return proposeObject(cs, f, next, "이름 변경");
    }

    private Result add(Scene s, Changeset cs, JsonNode in) {
        String want = text(in, "model") == null ? "" : text(in, "model").strip();
        ModelInfo m = matchModel(s, want);
        if (m == null) {
            List<String> names = s.modelsById.values().stream().map(ModelInfo::name).limit(10).toList();
            return err("'" + want + "' 모델이 없습니다. 쓸 수 있는 모델: " + String.join(", ", names));
        }
        if (!in.path("x").isNumber() || !in.path("y").isNumber()) return err("x·y 를 주세요");
        double x = in.path("x").asDouble(), y = in.path("y").asDouble();
        String bad = outside(s, x, y);
        if (bad != null) return err(bad);
        Set<String> taken = new HashSet<>();
        s.objects.values().forEach(o -> taken.add(text(o, "name")));
        String name = text(in, "name") == null || text(in, "name").isBlank() ? nextName(m.name(), taken) : text(in, "name").strip();
        if (name.length() > 100) return err("이름은 100자까지입니다");
        if (taken.contains(name)) return err("같은 이름의 객체가 이미 있습니다: " + name);
        ObjectNode node = json.createObjectNode();
        node.put("name", name);
        node.put("modelId", m.id());
        node.put("x", r2(x));
        node.put("y", r2(y));
        node.put("rot", r2(((in.path("rot").asDouble(0) % 360) + 360) % 360));
        Changeset.Item it = cs.add("placement.add", name, "new:" + cs.nextSeq(), null, node, addLabel(node));
        return ok(it, name + " 추가 제안");
    }

    private Result delete(Scene s, Changeset cs, JsonNode in) {
        Found f = findObject(s, text(in, "name"));
        if (f.error != null) return err(f.error);
        String name = text(f.node, "name");
        if (f.key.startsWith("new:")) {
            cs.remove(cs.find(f.key).orElseThrow());
            return new Result("{\"ok\":true,\"message\":\"추가 제안을 지웠습니다: " + esc(name) + "\"}", false, name + " 추가 제안 취소");
        }
        Optional<Changeset.Item> old = cs.find(f.key);
        JsonNode base = old.map(Changeset.Item::before).orElse(f.node);
        String label = text(base, "name") + " 삭제";
        Changeset.Item it = old.isPresent() ? cs.replace(old.get(), "placement.delete", text(base, "name"), base, null, label)
                : cs.add("placement.delete", text(base, "name"), f.key, base, null, label);
        return ok(it, name + " 삭제 제안");
    }

    /** 배치 하나의 제안: 새로 추가한 객체면 추가 항목을, 아니면 대상의 항목을 고침 (원래 값과 같으면 지움) */
    private Result proposeObject(Changeset cs, Found f, ObjectNode next, String verb) {
        String name = text(f.node, "name");
        if (f.key.startsWith("new:")) {
            Changeset.Item add = cs.find(f.key).orElseThrow();
            Changeset.Item it = cs.replace(add, "placement.add", text(next, "name"), null, next, addLabel(next));
            return ok(it, name + " " + verb + " 제안");
        }
        Optional<Changeset.Item> old = cs.find(f.key);
        JsonNode base = old.map(Changeset.Item::before).orElse(f.node);
        String kind = Snapshots.placementKind(base, next);
        if (kind == null) {
            old.ifPresent(cs::remove);
            return new Result("{\"ok\":true,\"message\":\"원래 값과 같아 " + esc(name) + " 제안을 지웠습니다\"}", false, name + " 제안 취소");
        }
        String label = placementLabel(kind, base, next);
        Changeset.Item it = old.isPresent() ? cs.replace(old.get(), kind, text(base, "name"), base, next, label)
                : cs.add(kind, text(base, "name"), f.key, base, next, label);
        return ok(it, name + " " + verb + " 제안");
    }

    // ---------- 공정 · 가벽 · 구역 ----------

    private Result setStation(Scene s, Changeset cs, JsonNode in) {
        String want = text(in, "name");
        Map.Entry<String, ObjectNode> e = findBy(s.stationsByKey, want, o -> text(o, "name"));
        if (e == null) return err("'" + want + "' 공정이 없습니다. 공정: " + String.join(", ", s.stationsByKey.values().stream().map(o -> text(o, "name")).toList()));
        ObjectNode next = e.getValue().deepCopy();
        if (in.hasNonNull("taktMin")) {
            long sec = Math.round(in.path("taktMin").asDouble() * 60);
            if (sec < 60 || sec > 604800) return err("택타임은 1~10080분이어야 합니다");
            next.put("taktSec", (int) sec);
        }
        if (in.hasNonNull("warnPp")) next.put("warnPp", in.path("warnPp").asInt());
        if (in.hasNonNull("delayPp")) next.put("delayPp", in.path("delayPp").asInt());
        int warn = next.path("warnPp").asInt(), delay = next.path("delayPp").asInt();
        if (!(0 <= warn && warn < delay && delay <= 100)) return err("주의·지연 기준은 0 ≤ 주의 < 지연 ≤ 100 이어야 합니다");
        if (in.has("placementName")) {
            String pn = text(in, "placementName") == null ? "" : text(in, "placementName").strip();
            if (pn.isEmpty()) next.putNull("placementName");
            else {
                if (s.objects.values().stream().noneMatch(o -> pn.equals(text(o, "name")))) return err("'" + pn + "' 이름의 객체가 없습니다");
                next.put("placementName", pn);
            }
        }
        Optional<Changeset.Item> old = cs.find(e.getKey());
        JsonNode base = old.map(Changeset.Item::before).orElse(e.getValue());
        String name = text(base, "name");
        if (base.equals(next)) {
            old.ifPresent(cs::remove);
            return new Result("{\"ok\":true,\"message\":\"원래 값과 같아 공정 제안을 지웠습니다\"}", false, "공정 " + name + " 제안 취소");
        }
        String label = stationLabel(base, next);
        Changeset.Item it = old.isPresent() ? cs.replace(old.get(), "station.update", name, base, next, label)
                : cs.add("station.update", name, e.getKey(), base, next, label);
        return ok(it, "공정 " + name + " 변경 제안");
    }

    private Result partition(Scene s, Changeset cs, JsonNode in) {
        String op = text(in, "op");
        if ("add".equals(op)) {
            double[] a = point(in.path("a")), b = point(in.path("b"));
            if (a == null || b == null) return err("a·b 는 [x, y] 로 주세요");
            String bad = outside(s, a[0], a[1]);
            if (bad == null) bad = outside(s, b[0], b[1]);
            if (bad != null) return err(bad);
            if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.5) return err("가벽 길이는 0.5 m 이상이어야 합니다");
            int max = 0;
            for (String id : s.partitionIdsEver) {
                Matcher m = PART_ID.matcher(id);
                if (m.matches()) max = Math.max(max, Integer.parseInt(m.group(1)));
            }
            String id = "p" + (max + 1);
            ObjectNode node = json.createObjectNode();
            node.put("id", id);
            ArrayNode pts = node.putArray("pts");
            pts.addArray().add(r2(a[0])).add(r2(a[1]));
            pts.addArray().add(r2(b[0])).add(r2(b[1]));
            node.put("h", PARTITION_H);
            node.put("t", PARTITION_T);
            Changeset.Item it = cs.add("plan.partition.add", "가벽 " + id, "partition:" + id, null, node,
                    "가벽 추가 (" + f1(a[0]) + ", " + f1(a[1]) + ") → (" + f1(b[0]) + ", " + f1(b[1]) + ")");
            return ok(it, "가벽 추가 제안");
        }
        if ("delete".equals(op)) {
            String id = text(in, "id");
            ObjectNode cur = id == null ? null : s.partitions.get(id);
            if (cur == null) return err("'" + id + "' 가벽이 없습니다. 가벽: " + String.join(", ", s.partitions.keySet()));
            Optional<Changeset.Item> old = cs.find("partition:" + id);
            if (old.isPresent() && old.get().kind().equals("plan.partition.add")) {
                cs.remove(old.get());
                return new Result("{\"ok\":true,\"message\":\"가벽 추가 제안을 지웠습니다\"}", false, "가벽 추가 제안 취소");
            }
            Changeset.Item it = cs.add("plan.partition.delete", "가벽 " + id, "partition:" + id, cur, null, "가벽 " + id + " 삭제");
            return ok(it, "가벽 " + id + " 삭제 제안");
        }
        return err("op 는 add 또는 delete 입니다");
    }

    private Result renameZone(Scene s, Changeset cs, JsonNode in) {
        String id = text(in, "id");
        if (id == null || !s.zones.containsKey(id)) return err("'" + id + "' 구역이 없습니다. 구역: " + s.zones);
        String nn = text(in, "name") == null ? "" : text(in, "name").strip();
        if (nn.isEmpty() || nn.length() > 100) return err("구역 이름은 1~100자로 주세요");
        String key = "zone:" + id;
        Optional<Changeset.Item> old = cs.find(key);
        String baseName = old.map(i -> text(i.before(), "name")).orElse(s.zones.get(id));
        if (baseName.equals(nn)) {
            old.ifPresent(cs::remove);
            return new Result("{\"ok\":true,\"message\":\"원래 이름과 같아 구역 제안을 지웠습니다\"}", false, "구역 제안 취소");
        }
        ObjectNode before = json.createObjectNode().put("id", id).put("name", baseName);
        ObjectNode after = json.createObjectNode().put("id", id).put("name", nn);
        String label = "구역 " + baseName + " → " + nn;
        Changeset.Item it = old.isPresent() ? cs.replace(old.get(), "plan.zone.rename", baseName, before, after, label)
                : cs.add("plan.zone.rename", baseName, key, before, after, label);
        return ok(it, "구역 이름 변경 제안");
    }

    // ---------- 도우미 ----------

    private record Found(String key, ObjectNode node, String error) {}

    private Found findObject(Scene s, String name) {
        if (name == null || name.isBlank()) return new Found(null, null, "객체 이름(name)을 주세요");
        Map.Entry<String, ObjectNode> e = findBy(s.objects, name, o -> text(o, "name"));
        if (e != null) return new Found(e.getKey(), e.getValue(), null);
        String n = norm(name);
        List<String> similar = s.objects.values().stream().map(o -> text(o, "name"))
                .filter(x -> norm(x).contains(n) || n.contains(norm(x))).limit(8).toList();
        return new Found(null, null, "'" + name + "' 이름의 객체가 없습니다" + (similar.isEmpty() ? "" : ". 비슷한 이름: " + String.join(", ", similar)));
    }

    /** 이름 그대로 → 대소문자·공백 무시 순으로 하나 */
    private static <T> Map.Entry<String, T> findBy(Map<String, T> map, String name, Function<T, String> nameOf) {
        if (name == null) return null;
        for (Map.Entry<String, T> e : map.entrySet()) if (name.strip().equals(nameOf.apply(e.getValue()))) return e;
        List<Map.Entry<String, T>> loose = new ArrayList<>();
        for (Map.Entry<String, T> e : map.entrySet()) if (norm(name).equals(norm(nameOf.apply(e.getValue())))) loose.add(e);
        return loose.size() == 1 ? loose.get(0) : null;
    }

    private static ModelInfo matchModel(Scene s, String want) {
        String n = norm(want);
        if (n.isEmpty()) return null;
        for (ModelInfo m : s.modelsById.values()) if (norm(m.name()).equals(n)) return m;
        for (ModelInfo m : s.modelsById.values()) for (String a : m.aliases()) if (norm(a).equals(n)) return m;
        List<ModelInfo> part = s.modelsById.values().stream().filter(m -> norm(m.name()).contains(n)).toList();
        return part.size() == 1 ? part.get(0) : null;
    }

    private static ModelInfo model(Scene s, JsonNode o) {
        Long id = Snapshots.longOrNull(o, "modelId");
        return id == null ? null : s.modelsById.get(id);
    }

    private static String nextName(String base, Set<String> taken) {
        for (int i = 1; ; i++) if (!taken.contains(base + " " + i)) return base + " " + i;
    }

    private static String outside(Scene s, double x, double y) {
        if (!Double.isFinite(x) || !Double.isFinite(y) || x < 0 || y < 0 || x > s.w || y > s.h)
            return "도면 밖입니다 (x 0~" + trim(s.w) + ", y 0~" + trim(s.h) + " m)";
        return null;
    }

    private static double[] point(JsonNode p) {
        if (!p.isArray() || p.size() != 2 || !p.path(0).isNumber() || !p.path(1).isNumber()) return null;
        return new double[] {p.path(0).asDouble(), p.path(1).asDouble()};
    }

    static String placementLabel(String kind, JsonNode b, JsonNode a) {
        String name = text(b, "name");
        return switch (kind) {
            case "placement.move" -> name + " 이동 (" + f1(b.path("x").asDouble()) + ", " + f1(b.path("y").asDouble()) + ") → ("
                    + f1(a.path("x").asDouble()) + ", " + f1(a.path("y").asDouble()) + ")";
            case "placement.rotate" -> name + " 회전 " + f1(b.path("rot").asDouble()) + "° → " + f1(a.path("rot").asDouble()) + "°";
            case "placement.rename" -> name + " 이름 → " + text(a, "name");
            default -> name + " 변경 (" + f1(b.path("x").asDouble()) + ", " + f1(b.path("y").asDouble()) + ", " + f1(b.path("rot").asDouble())
                    + "°) → (" + f1(a.path("x").asDouble()) + ", " + f1(a.path("y").asDouble()) + ", " + f1(a.path("rot").asDouble()) + "°)"
                    + (name.equals(text(a, "name")) ? "" : " · 이름 " + text(a, "name"));
        };
    }

    private static String addLabel(JsonNode a) {
        return text(a, "name") + " 추가 (" + f1(a.path("x").asDouble()) + ", " + f1(a.path("y").asDouble()) + ")";
    }

    static String stationLabel(JsonNode b, JsonNode a) {
        List<String> parts = new ArrayList<>();
        if (b.path("taktSec").asInt() != a.path("taktSec").asInt())
            parts.add("택타임 " + trim(b.path("taktSec").asInt() / 60.0) + "분 → " + trim(a.path("taktSec").asInt() / 60.0) + "분");
        if (b.path("warnPp").asInt() != a.path("warnPp").asInt()) parts.add("주의 " + b.path("warnPp").asInt() + "% → " + a.path("warnPp").asInt() + "%");
        if (b.path("delayPp").asInt() != a.path("delayPp").asInt()) parts.add("지연 " + b.path("delayPp").asInt() + "% → " + a.path("delayPp").asInt() + "%");
        if (!java.util.Objects.equals(text(b, "placementName"), text(a, "placementName")))
            parts.add("연결 설비 " + (text(b, "placementName") == null ? "없음" : text(b, "placementName")) + " → "
                    + (text(a, "placementName") == null ? "없음" : text(a, "placementName")));
        return "공정 " + text(b, "name") + ": " + String.join(" · ", parts);
    }

    private Result ok(Changeset.Item it, String label) {
        ObjectNode o = json.createObjectNode();
        o.put("ok", true);
        o.put("proposal", it.seq());
        o.put("message", "제안 #" + it.seq() + " 기록됨 (아직 적용 안 됨): " + it.label());
        return new Result(o.toString(), false, label);
    }

    private Result err(String message) {
        ObjectNode o = json.createObjectNode();
        o.put("error", message);
        return new Result(o.toString(), true, "확인 필요: " + message);
    }

    static String norm(String s) {
        return s == null ? "" : s.replaceAll("\\s+", "").toLowerCase(Locale.ROOT);
    }

    static double r2(double v) {
        return Math.round(v * 100) / 100.0;
    }

    static String f1(double v) {
        return String.format(Locale.ROOT, "%.1f", v);
    }

    /** 20.0 → "20", 12.5 → "12.5" */
    static String trim(double v) {
        return v == Math.rint(v) ? String.valueOf((long) v) : String.valueOf(r2(v));
    }

    private static String esc(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
```

- [ ] **Step 6: 대화 저장소 · 시스템 프롬프트**

`server/src/main/java/com/kopens/factory3d/ai/ProposalStore.java`:
```java
package com.kopens.factory3d.ai;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/** 서버 메모리의 대화 (사용자·도면별 하나): 대화 기록 + 아직 적용 안 한 제안 묶음. 30분 안 쓰면 비움 */
@Component
public class ProposalStore {
    public static final Duration IDLE = Duration.ofMinutes(30);
    public static final int MAX_TURNS = 40;

    public static final class Conversation {
        public final String user;
        public final long drawingId;
        public final Transcript transcript;
        public final ReentrantLock lock = new ReentrantLock();
        public volatile Changeset changeset = new Changeset();
        public int turns;
        volatile Instant lastUsed;
        private String note;

        Conversation(String user, long drawingId, Transcript transcript, Instant now) {
            this.user = user;
            this.drawingId = drawingId;
            this.transcript = transcript;
            this.lastUsed = now;
        }

        /** 다음 사용자 메시지 앞에 붙일 메모 (한 번만) */
        public synchronized String takeNote() {
            String n = note;
            note = null;
            return n;
        }

        /** 묶음을 적용·취소함 → 새 묶음, 다음 메시지에 결과 메모 */
        public synchronized void finish(String note) {
            this.changeset = new Changeset();
            this.note = note;
        }
    }

    private final Clock clock;
    private final Map<String, Conversation> map = new ConcurrentHashMap<>();

    @Autowired
    public ProposalStore() {
        this(Clock.systemUTC());
    }

    public ProposalStore(Clock clock) {
        this.clock = clock;
    }

    public Conversation get(String user, long drawingId, Supplier<Transcript> fresh) {
        purge();
        Instant now = clock.instant();
        Conversation c = map.compute(key(user, drawingId), (k, cur) ->
                cur == null || expired(cur, now) ? new Conversation(user, drawingId, fresh.get(), now) : cur);
        c.lastUsed = now;
        return c;
    }

    public void reset(String user, long drawingId) {
        map.remove(key(user, drawingId));
    }

    public Optional<Conversation> byChangeset(String user, String batchId) {
        purge();
        return map.values().stream().filter(c -> c.user.equals(user) && c.changeset.id().equals(batchId)).findFirst();
    }

    private void purge() {
        Instant now = clock.instant();
        map.values().removeIf(c -> expired(c, now) && !c.lock.isLocked());
    }

    private static boolean expired(Conversation c, Instant now) {
        return c.lastUsed.plus(IDLE).isBefore(now);
    }

    private static String key(String user, long drawingId) {
        return user + ":" + drawingId;
    }
}
```

`server/src/main/java/com/kopens/factory3d/ai/Prompts.java`:
```java
package com.kopens.factory3d.ai;

/** 고정 시스템 프롬프트 (바뀌는 값 — 도면 이름·시각 — 은 넣지 않음: 캐시) */
public final class Prompts {
    public static final long MAX_TOKENS = 16000;
    public static final int MAX_TOOL_CALLS = 20;

    public static final String SYSTEM = """
            너는 공장 도면 3D 편집 보조다. 사용자는 한국어로 3D 공장 화면의 객체(설비·자재·운반 장비), 가벽, 구역, 공정 기준정보를 바꿔 달라고 한다.

            좌표계: 도면(plan) 좌표, 단위 m. 원점은 도면 왼쪽 아래, x 는 오른쪽, y 는 위쪽이다. rot 는 도(°), 반시계 방향이다.
            "오른쪽"은 +x, "왼쪽"은 -x, "위쪽"·"북쪽"은 +y, "아래쪽"·"남쪽"은 -y 로 읽는다.

            일하는 순서:
            1. 먼저 get_scene 으로 지금 장면(객체 이름·위치·크기, 가벽, 구역, 공정, 쓸 수 있는 모델, 아직 적용 안 한 제안)을 확인한다. 같은 요청에서 이미 확인했으면 다시 부르지 않는다.
            2. 바꿀 때는 쓰기 도구(move_object, rotate_object, add_object, delete_object, rename_object, set_station, edit_partition, rename_zone)로 제안만 한다. 쓰기 도구는 저장하지 않는다. 사용자가 화면에서 3D 미리보기를 보고 '적용'을 눌러야 저장된다. 이미 바꿨다고 말하지 않는다.
            3. 도구가 error 를 돌려주면 이유를 읽고 고쳐 다시 시도하거나, 무엇이 필요한지 사용자에게 묻는다.
            4. 사용자가 말한 이름이 장면에 없거나 여러 개와 헷갈리면 추측하지 말고 후보를 보여 주며 묻는다.
            5. 끝나면 무엇을 제안했는지 한국어로 3~6문장 안에서 짧게 정리하고, 미리보기를 확인한 뒤 '적용'을 누르라고 안내한다. 바꿀 것이 없으면 이유를 말한다.

            공정 기준정보(set_station)는 관리자만 적용할 수 있다. 사용자 메시지 맨 앞의 [ … ] 줄은 시스템이 붙인 정보(도면 이름·시각·직전 제안 처리 결과)다.
            """;

    private Prompts() {}
}
```

- [ ] **Step 7: 테스트 통과 확인**

Run: `cd server && ./gradlew test --tests 'com.kopens.factory3d.ai.*'`
Expected: PASS (SceneToolsTest 7 · ProposalStoreTest 2 · 앞 Task 테스트 그대로)

- [ ] **Step 8: Commit**

```bash
cd /c/kopens/project/Factory3D && git add server/src/main/java/com/kopens/factory3d/ai server/src/test/java/com/kopens/factory3d/ai
git commit -m "feat(server): AI 장면 도구 — 읽기·쓰기 제안 9종(DB 안 바꿈) · 대상별 제안 묶음 · 사용자·도면별 대화 저장소 · 시스템 프롬프트

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 서버 — 대화 루프(ChatService) · SSE `/api/ai/chat` · 새 대화

**Files:**
- Create: `server/src/main/java/com/kopens/factory3d/ai/{ChatSink,ChatService,SseChatSink,ChatController}.java`
- Test: `server/src/test/java/com/kopens/factory3d/ai/ChatApiTest.java`

**Interfaces:**
- Consumes: `AiSettingService.status()/requireKey()/reasonText()` · `AiUsageService.record(...)` (Task 1), `ClaudeGateway` · `Transcript` (Task 3), `SceneTools` · `Changeset` · `ProposalStore` · `Prompts` (Task 4), 빈 `aiExecutor` (Task 3).
- Produces (REST):
  - `POST /api/ai/chat` (운전원) `{drawingId, message}` → `text/event-stream`. 이벤트(모두 `data` 는 JSON 한 줄): `text` `{"t":"글자 조각"}` · `tool` `{"name":"move_object","label":"Main Station 1 이동 제안"}` · `proposal` `{"id":"<묶음 uuid>","items":[{"seq","kind","target","targetKey","before","after","label"}]}` (이번 요청에서 묶음이 바뀐 때만, 비면 items 0개) · `done` `{"inputTokens","outputTokens","cacheReadTokens","cacheWriteTokens","costUsd"}` · `error` `{"message":"…"}` (error 뒤에는 done 없음). 입력 검사(도면 없음·1~2000자)는 SSE 전에 400.
  - `POST /api/ai/chat/reset` (운전원) `{drawingId}` → 204 (대화·제안 비움).
- Produces (Java): `ChatSink` (`text`·`tool`·`proposal(Changeset.View)`·`done(ChatService.Done)`·`error`), `ChatService.chat(String user, long drawingId, String message, ChatSink sink)` (동기 — 컨트롤러가 aiExecutor 에서 부름), 레코드 `ChatService.Done(long inputTokens, long outputTokens, long cacheReadTokens, long cacheWriteTokens, BigDecimal costUsd)`.
- 규칙: 막혀 있으면(status) `error(reasonText)`. 첫 메시지 앞에 `[도면: <이름> · 지금: yyyy-MM-dd HH:mm]` 줄, 적용·취소 뒤 첫 메시지 앞에 `[직전 제안 묶음: …]` 줄. 대화가 40턴이면 비우고 새로 시작. 한 대화에 요청은 하나씩(잠금 — 겹치면 `이전 요청을 처리하는 중입니다. 잠시 뒤 다시 보내세요.`). 턴마다 사용량 기록(purpose chat). 거절이면 이번 요청의 제안을 요청 전으로 되돌리고 `요청을 처리할 수 없습니다 (사유: …)`. 도구 호출 20회 초과면 남은 호출에 오류 결과를 주고 `작업이 길어 중간에 멈췄습니다.` 를 text 로 보낸 뒤 마무리. 도구 실행 예외는 오류 결과로 바꿔(대화 기록이 깨지지 않게) 계속.

- [ ] **Step 1: 실패 테스트 작성**

`server/src/test/java/com/kopens/factory3d/ai/ChatApiTest.java`:
```java
package com.kopens.factory3d.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

class ChatApiTest extends AiTestBase {
    static final RequestPostProcessor VIEWER = user("viewer").roles("VIEWER");
    static final RequestPostProcessor OPERATOR = user("kim").roles("OPERATOR");
    static final String MOVE = "Main Station 1 을 오른쪽으로 2m 옮겨줘";

    @Autowired ChatService chat;
    @Autowired ProposalStore store;

    static final class Rec implements ChatSink {
        final List<String> events = new ArrayList<>();
        final StringBuilder text = new StringBuilder();
        final List<String> tools = new ArrayList<>();
        Changeset.View proposal;
        ChatService.Done done;
        String error;

        public void text(String chunk) {
            events.add("text");
            text.append(chunk);
        }

        public void tool(String name, String label) {
            events.add("tool:" + name);
            tools.add(label);
        }

        public void proposal(Changeset.View p) {
            events.add("proposal");
            proposal = p;
        }

        public void done(ChatService.Done d) {
            events.add("done");
            done = d;
        }

        public void error(String message) {
            events.add("error");
            error = message;
        }
    }

    Rec ask(String message) {
        Rec r = new Rec();
        chat.chat("kim", drawing, message, r);
        return r;
    }

    @Test
    void 이동_요청은_제안만_만들고_DB_는_그대로() {
        enableAi();
        Rec r = ask(MOVE);
        assertThat(r.error).isNull();
        assertThat(r.events).containsSubsequence("text", "tool:get_scene", "tool:move_object", "text", "proposal", "done");
        assertThat(r.events.getLast()).isEqualTo("done");
        assertThat(r.tools).containsExactly("장면 확인 중…", "Main Station 1 이동 제안");
        assertThat(r.text.toString()).startsWith("장면을 확인하겠습니다.").contains("제안을 만들었습니다");
        assertThat(r.proposal.items()).hasSize(1);
        assertThat(r.proposal.items().get(0).kind()).isEqualTo("placement.move");
        assertThat(r.proposal.items().get(0).after().path("x").asDouble()).isEqualTo(12);
        assertThat(placementX(ms1)).isEqualTo(10);
        assertThat(jdbc.queryForObject("select count(*) from ai_usage where purpose = 'chat' and username = 'kim' and drawing_id = ?",
                Integer.class, drawing)).isEqualTo(3);
        assertThat(r.done.inputTokens()).isEqualTo(3600);
        assertThat(r.done.outputTokens()).isEqualTo(240);
        assertThat(r.done.costUsd()).isEqualByComparingTo("0.019200"); // 3600×4 + 240×20 = 19200 / 1M
        var first = ((FakeGateway.FakeTranscript) store.get("kim", drawing, FakeGateway.FakeTranscript::new).transcript).entries.get(0);
        assertThat(first.userText()).startsWith("[도면: 나셀 공장 · 지금: ").endsWith("]\n" + MOVE);
    }

    @Test
    void 같은_객체를_두_번_옮기면_한_항목() {
        enableAi();
        Rec a = ask(MOVE);
        Rec b = ask(MOVE);
        assertThat(b.proposal.id()).isEqualTo(a.proposal.id());
        assertThat(b.proposal.items()).hasSize(1);
        assertThat(b.proposal.items().get(0).after().path("x").asDouble()).isEqualTo(14);
    }

    @Test
    void 거절이면_그_요청의_제안만_버림() {
        enableAi();
        ask(MOVE);
        Rec r = ask("거절해 봐");
        assertThat(r.error).isEqualTo("요청을 처리할 수 없습니다 (사유: 시험용 거절)");
        assertThat(r.events).doesNotContain("proposal", "done");
        assertThat(store.get("kim", drawing, FakeGateway.FakeTranscript::new).changeset.items()).hasSize(1); // 앞 요청 것은 남음
    }

    @Test
    void 도구_호출은_한_요청에_20번까지() {
        enableAi();
        Rec r = ask("반복");
        assertThat(r.events.stream().filter(e -> e.startsWith("tool:")).count()).isEqualTo(20);
        assertThat(r.text.toString()).contains("작업이 길어 중간에 멈췄습니다.");
        assertThat(r.events.getLast()).isEqualTo("done");
        assertThat(r.events).doesNotContain("proposal");
    }

    @Test
    void 호출_오류와_꺼짐은_한국어로() {
        assertThat(ask("안녕").error).isEqualTo("Claude API 키가 등록되지 않았습니다 (관리자 › Claude API 관리)");
        enableAi();
        Rec r = ask("오류 내 봐");
        assertThat(r.error).isEqualTo("잠시 뒤 다시 시도하세요 (요청이 많습니다)");
        assertThat(jdbc.queryForObject("select count(*) from ai_usage", Integer.class)).isZero();
    }

    @Test
    void SSE_로_흘려보냄_권한과_입력_검사() throws Exception {
        enableAi();
        MvcResult res = mvc.perform(post("/api/ai/chat").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"drawingId\":" + drawing + ",\"message\":\"" + MOVE + "\"}").with(OPERATOR).with(csrf()))
                .andExpect(request().asyncStarted()).andReturn();
        res.getAsyncResult(10_000);
        String body = res.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(body).contains("event:text", "event:tool", "\"label\":\"Main Station 1 이동 제안\"", "event:proposal",
                "\"kind\":\"placement.move\"", "\"targetKey\":\"placement:" + ms1 + "\"", "event:done", "\"costUsd\"");
        assertThat(body.indexOf("event:proposal")).isLessThan(body.indexOf("event:done"));

        mvc.perform(post("/api/ai/chat").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"drawingId\":" + drawing + ",\"message\":\"안녕\"}").with(VIEWER).with(csrf()))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/ai/chat").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"drawingId\":" + drawing + ",\"message\":\"  \"}").with(OPERATOR).with(csrf()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("요청은 1~2000자로 입력하세요."));
        mvc.perform(post("/api/ai/chat").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"drawingId\":" + drawing + ",\"message\":\"" + "가".repeat(2001) + "\"}").with(OPERATOR).with(csrf()))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/ai/chat").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"message\":\"안녕\"}").with(OPERATOR).with(csrf()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("도면을 고르세요."));

        ProposalStore.Conversation before = store.get("kim", drawing, FakeGateway.FakeTranscript::new);
        mvc.perform(post("/api/ai/chat/reset").contentType(MediaType.APPLICATION_JSON).content("{\"drawingId\":" + drawing + "}")
                .with(OPERATOR).with(csrf())).andExpect(status().isNoContent());
        assertThat(store.get("kim", drawing, FakeGateway.FakeTranscript::new)).isNotSameAs(before);
    }
}
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd server && ./gradlew test --tests 'com.kopens.factory3d.ai.ChatApiTest'`
Expected: 컴파일 실패 (`ChatService`·`ChatSink` 없음)

- [ ] **Step 3: 받는 쪽 · 대화 루프**

`server/src/main/java/com/kopens/factory3d/ai/ChatSink.java`:
```java
package com.kopens.factory3d.ai;

/** 챗봇 응답을 받는 쪽 (SSE · 테스트 기록) */
public interface ChatSink {
    void text(String chunk);

    void tool(String name, String label);

    void proposal(Changeset.View proposal);

    void done(ChatService.Done done);

    void error(String message);
}
```

`server/src/main/java/com/kopens/factory3d/ai/ChatService.java`:
```java
package com.kopens.factory3d.ai;

import com.kopens.factory3d.ai.ClaudeGateway.Call;
import com.kopens.factory3d.ai.ClaudeGateway.Stop;
import com.kopens.factory3d.ai.ClaudeGateway.ToolCall;
import com.kopens.factory3d.ai.ClaudeGateway.ToolResult;
import com.kopens.factory3d.ai.ClaudeGateway.Turn;
import com.kopens.factory3d.common.BadRequestException;
import com.kopens.factory3d.drawing.DrawingDetail;
import com.kopens.factory3d.drawing.DrawingMapper;
import java.math.BigDecimal;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/** AI 챗봇 한 요청: 사용자 글 → (Claude ↔ 도구)* → 제안 묶음. 쓰기 도구는 제안만 쌓음 */
@Service
public class ChatService {
    private static final Logger log = LoggerFactory.getLogger(ChatService.class);
    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    public record Done(long inputTokens, long outputTokens, long cacheReadTokens, long cacheWriteTokens, BigDecimal costUsd) {}

    private final AiSettingService settings;
    private final AiUsageService usage;
    private final ClaudeGateway gateway;
    private final SceneTools tools;
    private final ProposalStore store;
    private final DrawingMapper drawings;
    private final ZoneId zone;

    public ChatService(AiSettingService settings, AiUsageService usage, ClaudeGateway gateway, SceneTools tools, ProposalStore store,
            DrawingMapper drawings, @Value("${factory3d.time-zone:Asia/Seoul}") String zone) {
        this.settings = settings;
        this.usage = usage;
        this.gateway = gateway;
        this.tools = tools;
        this.store = store;
        this.drawings = drawings;
        this.zone = ZoneId.of(zone);
    }

    public void chat(String user, long drawingId, String message, ChatSink sink) {
        try {
            AiSettingService.Status st = settings.status();
            if (!st.enabled()) {
                sink.error(AiSettingService.reasonText(st.reason()));
                return;
            }
            AiSettingService.Active key = settings.requireKey();
            DrawingDetail d = drawings.findById(drawingId);
            if (d == null) {
                sink.error("도면을 찾을 수 없습니다.");
                return;
            }
            ProposalStore.Conversation c = store.get(user, drawingId, gateway::newTranscript);
            if (c.turns >= ProposalStore.MAX_TURNS && !c.lock.isLocked()) {
                store.reset(user, drawingId);
                c = store.get(user, drawingId, gateway::newTranscript);
                sink.text("(대화가 길어 새 대화로 시작합니다)\n\n");
            }
            if (!c.lock.tryLock()) {
                sink.error("이전 요청을 처리하는 중입니다. 잠시 뒤 다시 보내세요.");
                return;
            }
            try {
                run(user, key, d, c, message, sink);
            } finally {
                c.lock.unlock();
            }
        } catch (AiCallException | BadRequestException e) {
            sink.error(e.getMessage());
        } catch (RuntimeException e) {
            log.error("AI 챗봇 처리 중 오류", e);
            sink.error("AI 챗봇 처리 중 오류가 났습니다.");
        }
    }

    private void run(String user, AiSettingService.Active key, DrawingDetail d, ProposalStore.Conversation c, String message, ChatSink sink) {
        String head = c.turns == 0 ? "[도면: " + d.name() + " · 지금: " + ZonedDateTime.now(zone).format(WHEN) + "]\n" : "";
        String note = c.takeNote();
        c.transcript.addUserText(head + (note == null ? "" : note + "\n") + message);
        c.turns++;
        Changeset cs = c.changeset;
        Changeset.Snapshot snap = cs.snapshot();
        int v0 = cs.version();
        Call call = new Call(key.apiKey(), key.model(), Prompts.SYSTEM, tools.specs(), Prompts.MAX_TOKENS);
        long in = 0, out = 0, cr = 0, cw = 0;
        BigDecimal cost = BigDecimal.ZERO;
        int calls = 0;
        try {
            while (true) {
                Turn t = gateway.next(call, c.transcript, sink::text);
                var u = t.usage();
                cost = cost.add(usage.record(user, d.id(), u.model(), u.input(), u.output(), u.cacheRead(), u.cacheWrite(), "chat"));
                in += u.input();
                out += u.output();
                cr += u.cacheRead();
                cw += u.cacheWrite();
                if (t.stop() == Stop.REFUSAL) {
                    cs.restore(snap);
                    sink.error("요청을 처리할 수 없습니다 (사유: " + t.refusal() + ")");
                    return;
                }
                if (t.stop() != Stop.TOOL_USE || t.toolCalls().isEmpty()) {
                    if (t.stop() == Stop.MAX_TOKENS) sink.text("\n\n(답이 길어 중간에 끊겼습니다)");
                    break;
                }
                List<ToolResult> results = new ArrayList<>();
                boolean over = false;
                for (ToolCall tc : t.toolCalls()) {
                    if (++calls > Prompts.MAX_TOOL_CALLS) {
                        results.add(new ToolResult(tc.id(), "{\"error\":\"도구 호출 한도를 넘었습니다\"}", true));
                        over = true;
                        continue;
                    }
                    SceneTools.Result r;
                    try {
                        r = tools.execute(d.id(), cs, tc);
                    } catch (RuntimeException e) {
                        log.warn("도구 {} 실행 오류", tc.name(), e);
                        r = new SceneTools.Result("{\"error\":\"도구 실행 중 오류가 났습니다\"}", true, "확인 필요: 도구 실행 오류");
                    }
                    sink.tool(tc.name(), r.label());
                    results.add(new ToolResult(tc.id(), r.content(), r.isError()));
                }
                c.transcript.addToolResults(results);
                if (over) {
                    sink.text("\n\n작업이 길어 중간에 멈췄습니다.");
                    break;
                }
            }
        } catch (AiCallException e) {
            if (cs.version() != v0) sink.proposal(cs.view()); // 앞 턴에서 만든 제안은 보여 줌
            throw e;
        }
        if (cs.version() != v0) sink.proposal(cs.view());
        sink.done(new Done(in, out, cr, cw, cost));
    }
}
```

- [ ] **Step 4: SSE · 컨트롤러**

`server/src/main/java/com/kopens/factory3d/ai/SseChatSink.java`:
```java
package com.kopens.factory3d.ai;

import java.io.IOException;
import java.util.Map;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import tools.jackson.databind.ObjectMapper;

/** ChatSink → SSE (data 는 JSON 한 줄). 브라우저가 끊으면 이후 이벤트는 버림 */
final class SseChatSink implements ChatSink {
    private final SseEmitter emitter;
    private final ObjectMapper json;
    private volatile boolean closed;

    SseChatSink(SseEmitter emitter, ObjectMapper json) {
        this.emitter = emitter;
        this.json = json;
        emitter.onCompletion(() -> closed = true);
        emitter.onTimeout(() -> closed = true);
        emitter.onError(e -> closed = true);
    }

    public void text(String chunk) {
        send("text", Map.of("t", chunk));
    }

    public void tool(String name, String label) {
        send("tool", Map.of("name", name, "label", label));
    }

    public void proposal(Changeset.View proposal) {
        send("proposal", proposal);
    }

    public void done(ChatService.Done done) {
        send("done", done);
        complete();
    }

    public void error(String message) {
        send("error", Map.of("message", message));
        complete();
    }

    private void send(String name, Object data) {
        if (closed) return;
        try {
            emitter.send(SseEmitter.event().name(name).data(json.writeValueAsString(data)));
        } catch (IOException | IllegalStateException e) {
            closed = true;
        }
    }

    private void complete() {
        if (closed) return;
        closed = true;
        emitter.complete();
    }
}
```

`server/src/main/java/com/kopens/factory3d/ai/ChatController.java`:
```java
package com.kopens.factory3d.ai;

import com.kopens.factory3d.common.BadRequestException;
import java.time.Duration;
import java.util.concurrent.ExecutorService;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import tools.jackson.databind.ObjectMapper;

/** AI 챗봇 (운전원 이상 — SecurityConfig 기본 규칙). 응답은 SSE */
@RestController
public class ChatController {
    public record ChatBody(Long drawingId, String message) {}

    public record ResetBody(Long drawingId) {}

    private final ChatService chat;
    private final ProposalStore store;
    private final ExecutorService executor;
    private final ObjectMapper json;

    public ChatController(ChatService chat, ProposalStore store, @Qualifier("aiExecutor") ExecutorService executor, ObjectMapper json) {
        this.chat = chat;
        this.store = store;
        this.executor = executor;
        this.json = json;
    }

    @PostMapping("/api/ai/chat")
    public SseEmitter chat(@RequestBody ChatBody body, Authentication auth) {
        if (body == null || body.drawingId() == null) throw new BadRequestException("도면을 고르세요.");
        String message = body.message() == null ? "" : body.message().strip();
        if (message.isEmpty() || message.length() > 2000) throw new BadRequestException("요청은 1~2000자로 입력하세요.");
        SseEmitter emitter = new SseEmitter(Duration.ofMinutes(10).toMillis());
        SseChatSink sink = new SseChatSink(emitter, json);
        String user = auth.getName();
        long drawingId = body.drawingId();
        executor.execute(() -> chat.chat(user, drawingId, message, sink));
        return emitter;
    }

    @PostMapping("/api/ai/chat/reset")
    public ResponseEntity<Void> reset(@RequestBody ResetBody body, Authentication auth) {
        if (body != null && body.drawingId() != null) store.reset(auth.getName(), body.drawingId());
        return ResponseEntity.noContent().build();
    }
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd server && ./gradlew test --tests 'com.kopens.factory3d.ai.*'`
Expected: PASS (ChatApiTest 6 · 앞 Task 테스트 그대로). SSE 테스트가 `getAsyncResult` 에서 멈추면 `SseChatSink.complete()` 가 불리는지(done·error 뒤) 확인.

- [ ] **Step 6: Commit**

```bash
cd /c/kopens/project/Factory3D && git add server/src/main/java/com/kopens/factory3d/ai server/src/test/java/com/kopens/factory3d/ai/ChatApiTest.java
git commit -m "feat(server): AI 챗봇 대화 루프 — SSE(글자·도구 진행·제안·끝/오류) · 거절이면 그 요청 제안 버림 · 도구 20회 상한 · 턴마다 사용량

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 서버 — 제안 적용·취소 · 묶음 되돌리기 · 사용량 보고 · 연결 테스트

**Files:**
- Create: `server/src/main/java/com/kopens/factory3d/ai/{ApplyService,AiChangeController}.java`, `server/src/main/java/com/kopens/factory3d/change/{RevertService,PlanEdits}.java`
- Modify: `server/src/main/java/com/kopens/factory3d/change/ChangeController.java` (되돌리기), `server/src/main/java/com/kopens/factory3d/ai/AiUsageService.java` (보고), `server/src/main/java/com/kopens/factory3d/ai/AiAdminController.java` (사용량·연결 테스트)
- Test: `server/src/test/java/com/kopens/factory3d/ai/{ApplyRevertApiTest,AiUsageApiTest}.java`

**Interfaces:**
- Consumes: `ProposalStore.byChangeset/Conversation.finish` · `Changeset` (Task 4), `ChatService.chat` (테스트에서 제안 만들기, Task 5), `ChangeLogService.record/batch/mapper()` · `Snapshots` (Task 2), `PlacementMapper`·`StationMapper`·`DrawingMapper.updatePlan`·`ModelMapper.findById`, `StationsChanged` 이벤트, `AuditService.logAs`.
- Produces (REST):
  - `POST /api/ai/changes/{batchId}/apply` (운전원) → `{batchId, drawingId, applied, skipped:[{seq, reason}]}`. 항목마다 DB 의 지금 값이 제안의 before 와 같을 때만 적용 (아니면 skipped `제안 뒤에 다른 곳에서 바뀌었습니다`). 공정 항목은 관리자가 아니면 skipped `공정 기준정보는 관리자만 바꿀 수 있습니다`. 한 트랜잭션 · 적용한 항목마다 change_log(source AI, batch_id = 묶음 id) · 감사 `AI_APPLY`. 없는(이미 적용·취소한) 묶음 404 `제안을 찾을 수 없습니다. (이미 적용·취소했거나 대화가 비워졌습니다)`, AI 가 답하는 중이면 409.
  - `POST /api/ai/changes/{batchId}/discard` (운전원) → 204.
  - `POST /api/changes/{batchId}/revert` (운전원 = 자기 묶음만, 관리자 = 모두) → `{batchId, reverted}`. 그 뒤에 같은 대상을 바꾼(되돌리지 않은) 다른 묶음이 있거나 대상이 사라졌으면 409 `이후에 바뀐 객체가 있어 되돌릴 수 없습니다`. 이미 되돌렸으면 409 `이미 되돌린 묶음입니다.`, 남의 묶음 403 `자기가 한 변경만 되돌릴 수 있습니다.`, 공정 항목이 든 묶음을 운전원이 되돌리면 403 `공정 기준정보 변경은 관리자만 되돌릴 수 있습니다.`. 감사 `CHANGE_REVERT`.
  - `GET /api/admin/ai/usage?from&to&group=day|user` (관리자) → `{month: UsageRow, limitUsd, rows:[UsageRow], from, to, group}` (기본 이번 달 1일~오늘, group 기본 day).
  - `POST /api/admin/ai/test` (관리자) → `{ok:true, model, latencyMs}` 또는 `{ok:false, message}` (사용량 purpose test 기록).
- Produces (Java): `ApplyService.apply(String user, boolean admin, String batchId): Result`, `ApplyService.discard(String user, String batchId)`, 레코드 `ApplyService.Result(String batchId, long drawingId, int applied, List<Skip> skipped)`, `Skip(int seq, String reason)`. `RevertService.revert(String user, boolean admin, String batchId): Result(String batchId, int reverted)`. `PlanEdits` (plan JSON 의 가벽·구역 고치기 — 적용·되돌리기 공용): `static ArrayNode partitions(ObjectNode plan)`, `static int indexOf(ArrayNode, String id)`, `static ObjectNode zone(ObjectNode plan, String id)`. `AiUsageService.report(LocalDate from, LocalDate to, String group, BigDecimal limitUsd): Report`.

- [ ] **Step 1: 실패 테스트 작성**

`server/src/test/java/com/kopens/factory3d/ai/ApplyRevertApiTest.java`:
```java
package com.kopens.factory3d.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

class ApplyRevertApiTest extends AiTestBase {
    static final RequestPostProcessor VIEWER = user("viewer").roles("VIEWER");
    static final RequestPostProcessor KIM = user("kim").roles("OPERATOR");
    static final RequestPostProcessor LEE = user("lee").roles("OPERATOR");
    static final RequestPostProcessor ADMIN = user("admin").roles("ADMIN");

    @Autowired ChatService chat;

    @BeforeEach
    void on() {
        enableAi();
    }

    /** who 의 대화에서 요청들을 보내고 마지막 제안 묶음 id */
    String propose(String who, String... messages) {
        List<Changeset.View> got = new ArrayList<>();
        for (String m : messages)
            chat.chat(who, drawing, m, new ChatSink() {
                public void text(String c) {}

                public void tool(String n, String l) {}

                public void proposal(Changeset.View p) {
                    got.add(p);
                }

                public void done(ChatService.Done d) {}

                public void error(String e) {
                    throw new AssertionError(e);
                }
            });
        return got.getLast().id();
    }

    ResultActions apply(String batch, RequestPostProcessor who) throws Exception {
        return mvc.perform(post("/api/ai/changes/" + batch + "/apply").with(who).with(csrf()));
    }

    ResultActions revert(String batch, RequestPostProcessor who) throws Exception {
        return mvc.perform(post("/api/changes/" + batch + "/revert").with(who).with(csrf()));
    }

    @Test
    void 적용하면_한_트랜잭션으로_저장하고_AI_이력() throws Exception {
        String b = propose("kim", "Main Station 1 을 오른쪽으로 2m 옮겨줘", "Main Station 을 (30, 12)에 추가해줘", "Main Station 2 를 지워줘",
                "가벽 (2, 10)-(8, 10) 추가해줘");
        apply(b, KIM).andExpect(status().isOk())
                .andExpect(jsonPath("$.batchId").value(b))
                .andExpect(jsonPath("$.applied").value(4))
                .andExpect(jsonPath("$.skipped.length()").value(0));
        assertThat(placementX(ms1)).isEqualTo(12);
        assertThat(jdbc.queryForObject("select count(*) from placement where id = ?", Integer.class, ms2)).isZero();
        assertThat(jdbc.queryForObject("select x from placement where name = 'Main Station 3'", Double.class)).isEqualTo(30);
        assertThat(jdbc.queryForObject("select jsonb_array_length(plan->'partitions') from drawing where id = ?", Integer.class, drawing)).isEqualTo(2);
        assertThat(jdbc.queryForList("select kind from change_log where source = 'AI' and batch_id = cast(? as uuid) order by id", String.class, b))
                .containsExactly("placement.move", "placement.add", "placement.delete", "plan.partition.add");
        assertThat(jdbc.queryForObject("select target_key from change_log where kind = 'placement.add'", String.class)).startsWith("placement:");
        assertThat(jdbc.queryForObject("select count(*) from audit_log where action = 'AI_APPLY' and username = 'kim'", Integer.class)).isEqualTo(1);
        apply(b, KIM).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("제안을 찾을 수 없습니다. (이미 적용·취소했거나 대화가 비워졌습니다)"));
    }

    @Test
    void 남의_묶음은_적용_못함_조회_권한도_못함() throws Exception {
        String b = propose("kim", "Main Station 1 을 오른쪽으로 2m 옮겨줘");
        apply(b, LEE).andExpect(status().isNotFound());
        apply(b, VIEWER).andExpect(status().isForbidden());
        assertThat(placementX(ms1)).isEqualTo(10);
    }

    @Test
    void 공정_항목은_운전원이면_건너뜀_관리자면_적용() throws Exception {
        String b = propose("kim", "공정 조립 택타임 25분으로", "Main Station 1 을 오른쪽으로 2m 옮겨줘");
        apply(b, KIM).andExpect(status().isOk())
                .andExpect(jsonPath("$.applied").value(1))
                .andExpect(jsonPath("$.skipped[0].seq").value(1))
                .andExpect(jsonPath("$.skipped[0].reason").value("공정 기준정보는 관리자만 바꿀 수 있습니다"));
        assertThat(jdbc.queryForObject("select takt_sec from station where id = ?", Integer.class, station)).isEqualTo(1200);

        String a = propose("admin", "공정 조립 택타임 25분으로");
        apply(a, ADMIN).andExpect(jsonPath("$.applied").value(1));
        assertThat(jdbc.queryForObject("select takt_sec from station where id = ?", Integer.class, station)).isEqualTo(1500);
    }

    @Test
    void 제안_뒤에_바뀐_객체는_건너뜀() throws Exception {
        String b = propose("kim", "Main Station 1 을 오른쪽으로 2m 옮겨줘");
        mvc.perform(patch("/api/placements/" + ms1).contentType(MediaType.APPLICATION_JSON).content("{\"y\":7}").with(LEE).with(csrf()))
                .andExpect(status().isOk());
        apply(b, KIM).andExpect(jsonPath("$.applied").value(0))
                .andExpect(jsonPath("$.skipped[0].reason").value("제안 뒤에 다른 곳에서 바뀌었습니다"));
        assertThat(placementX(ms1)).isEqualTo(10);
    }

    @Test
    void 취소하면_묶음이_사라짐() throws Exception {
        String b = propose("kim", "Main Station 1 을 오른쪽으로 2m 옮겨줘");
        mvc.perform(post("/api/ai/changes/" + b + "/discard").with(KIM).with(csrf())).andExpect(status().isNoContent());
        apply(b, KIM).andExpect(status().isNotFound());
        assertThat(jdbc.queryForObject("select count(*) from change_log", Integer.class)).isZero();
    }

    @Test
    void 되돌리기는_묶음을_통째로_역적용() throws Exception {
        String b = propose("kim", "Main Station 1 을 오른쪽으로 2m 옮겨줘", "Main Station 을 (30, 12)에 추가해줘", "Main Station 2 를 지워줘",
                "가벽 (2, 10)-(8, 10) 추가해줘");
        apply(b, KIM).andExpect(status().isOk());
        revert(b, LEE).andExpect(status().isForbidden()).andExpect(jsonPath("$.detail").value("자기가 한 변경만 되돌릴 수 있습니다."));
        revert(b, KIM).andExpect(status().isOk()).andExpect(jsonPath("$.reverted").value(4));
        assertThat(placementX(ms1)).isEqualTo(10);
        assertThat(jdbc.queryForObject("select count(*) from placement where name = 'Main Station 2'", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from placement where name = 'Main Station 3'", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select jsonb_array_length(plan->'partitions') from drawing where id = ?", Integer.class, drawing)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select bool_and(reverted) from change_log where batch_id = cast(? as uuid)", Boolean.class, b)).isTrue();
        assertThat(jdbc.queryForObject("select count(*) from audit_log where action = 'CHANGE_REVERT'", Integer.class)).isEqualTo(1);
        revert(b, KIM).andExpect(status().isConflict()).andExpect(jsonPath("$.detail").value("이미 되돌린 묶음입니다."));
    }

    @Test
    void 뒤에_같은_대상을_바꿨으면_409_그_뒤것을_먼저_되돌리면_됨() throws Exception {
        String b = propose("kim", "Main Station 1 을 오른쪽으로 2m 옮겨줘");
        apply(b, KIM).andExpect(status().isOk());
        mvc.perform(patch("/api/placements/" + ms1).contentType(MediaType.APPLICATION_JSON).content("{\"y\":7}").with(KIM).with(csrf()))
                .andExpect(status().isOk());
        revert(b, KIM).andExpect(status().isConflict()).andExpect(jsonPath("$.detail").value("이후에 바뀐 객체가 있어 되돌릴 수 없습니다"));
        String userBatch = jdbc.queryForObject("select batch_id::text from change_log where source = 'USER' order by id desc limit 1", String.class);
        revert(userBatch, KIM).andExpect(status().isOk()); // 사람 편집도 묶음 되돌리기
        revert(b, ADMIN).andExpect(status().isOk());
        assertThat(placementX(ms1)).isEqualTo(10);
        assertThat(jdbc.queryForObject("select y from placement where id = ?", Double.class, ms1)).isEqualTo(5);
    }

    @Test
    void 공정_묶음_되돌리기는_관리자만() throws Exception {
        String a = propose("admin", "공정 조립 택타임 25분으로");
        apply(a, ADMIN).andExpect(status().isOk());
        jdbc.update("update change_log set username = 'kim' where batch_id = cast(? as uuid)", a); // 운전원 묶음인 척
        revert(a, KIM).andExpect(status().isForbidden()).andExpect(jsonPath("$.detail").value("공정 기준정보 변경은 관리자만 되돌릴 수 있습니다."));
        revert(a, ADMIN).andExpect(status().isOk());
        assertThat(jdbc.queryForObject("select takt_sec from station where id = ?", Integer.class, station)).isEqualTo(1200);
        revert("not-a-uuid", ADMIN).andExpect(status().isNotFound()).andExpect(jsonPath("$.detail").value("변경 묶음을 찾을 수 없습니다."));
    }
}
```

`server/src/test/java/com/kopens/factory3d/ai/AiUsageApiTest.java`:
```java
package com.kopens.factory3d.ai;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.time.LocalDate;
import java.time.ZoneId;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

class AiUsageApiTest extends AiTestBase {
    static final RequestPostProcessor KIM = user("kim").roles("OPERATOR");
    static final RequestPostProcessor ADMIN = user("admin").roles("ADMIN");

    void usageAt(String user, LocalDate day, long input, String cost) {
        jdbc.update("insert into ai_usage (at, username, model, input_tokens, output_tokens, cost_usd, purpose) "
                + "values ((cast(? as date) + time '12:00') at time zone 'Asia/Seoul', ?, 'claude-opus-5-5', ?, 10, cast(? as numeric), 'chat')",
                day.toString(), user, input, cost);
    }

    @Test
    void 일별_사용자별_이번_달_합계() throws Exception {
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Seoul"));
        LocalDate first = today.withDayOfMonth(1);
        usageAt("kim", first, 1000, "0.5");
        usageAt("lee", first, 2000, "1.0");
        usageAt("kim", today, 3000, "1.5");
        usageAt("kim", first.minusDays(1), 9999, "9"); // 지난달
        String d0 = first.toString(), d1 = today.toString();
        mvc.perform(get("/api/admin/ai/usage").with(ADMIN)).andExpect(status().isOk())
                .andExpect(jsonPath("$.group").value("day"))
                .andExpect(jsonPath("$.from").value(d0))
                .andExpect(jsonPath("$.month.calls").value(3))
                .andExpect(jsonPath("$.month.costUsd").value(3.0))
                .andExpect(jsonPath("$.limitUsd").value(50.0))
                .andExpect(jsonPath("$.rows[0].key").value(d1)) // 최근 날짜 먼저
                .andExpect(jsonPath("$.rows[-1].key").value(d0));
        mvc.perform(get("/api/admin/ai/usage?group=user&from=" + d0 + "&to=" + d1).with(ADMIN))
                .andExpect(jsonPath("$.rows.length()").value(2))
                .andExpect(jsonPath("$.rows[0].key").value("kim"))
                .andExpect(jsonPath("$.rows[0].inputTokens").value(4000)) // 비용 큰 사용자 먼저
                .andExpect(jsonPath("$.rows[0].calls").value(2));
        mvc.perform(get("/api/admin/ai/usage?group=model").with(ADMIN)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("group 은 day 또는 user 입니다."));
        mvc.perform(get("/api/admin/ai/usage?from=2026-11-10&to=2026-11-01").with(ADMIN)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("기간이 올바르지 않습니다."));
        mvc.perform(get("/api/admin/ai/usage").with(KIM)).andExpect(status().isForbidden());
    }

    @Test
    void 연결_테스트() throws Exception {
        mvc.perform(post("/api/admin/ai/test").with(ADMIN).with(csrf())).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Claude API 키가 등록되지 않았습니다."));
        enableAi();
        mvc.perform(post("/api/admin/ai/test").with(ADMIN).with(csrf())).andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true))
                .andExpect(jsonPath("$.model").value("claude-opus-5-5"))
                .andExpect(jsonPath("$.latencyMs").isNumber());
        mvc.perform(put("/api/admin/ai/key").contentType(MediaType.APPLICATION_JSON)
                .content("{\"apiKey\":\"sk-ant-invalid-key-000000000000\"}").with(ADMIN).with(csrf())).andExpect(status().isOk());
        mvc.perform(post("/api/admin/ai/test").with(ADMIN).with(csrf())).andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(false))
                .andExpect(jsonPath("$.message").value("API 키가 올바르지 않습니다"));
        mvc.perform(get("/api/admin/ai/usage").with(ADMIN)).andExpect(jsonPath("$.month.calls").value(1)); // 성공한 테스트 1번만
    }
}
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd server && ./gradlew test --tests 'com.kopens.factory3d.ai.ApplyRevertApiTest' --tests 'com.kopens.factory3d.ai.AiUsageApiTest'`
Expected: FAIL — 적용·되돌리기·사용량 주소 없음 (404)

- [ ] **Step 3: plan JSON 도우미**

`server/src/main/java/com/kopens/factory3d/change/PlanEdits.java`:
```java
package com.kopens.factory3d.change;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/** plan JSON 의 가벽·구역 고치기 (AI 적용·되돌리기 공용) */
public final class PlanEdits {
    private PlanEdits() {}

    public static ArrayNode partitions(ObjectNode plan) {
        return plan.get("partitions") instanceof ArrayNode a ? a : plan.putArray("partitions");
    }

    public static int indexOf(ArrayNode parts, String id) {
        for (int i = 0; i < parts.size(); i++) if (id.equals(parts.get(i).path("id").asText())) return i;
        return -1;
    }

    public static ObjectNode zone(ObjectNode plan, String id) {
        for (JsonNode z : plan.path("zones")) if (id.equals(z.path("id").asText()) && z instanceof ObjectNode o) return o;
        return null;
    }
}
```

- [ ] **Step 4: 적용 · 취소**

`server/src/main/java/com/kopens/factory3d/ai/ApplyService.java`:
```java
package com.kopens.factory3d.ai;

import static com.kopens.factory3d.change.Snapshots.text;

import com.kopens.factory3d.audit.AuditService;
import com.kopens.factory3d.change.ChangeLogService;
import com.kopens.factory3d.change.PlanEdits;
import com.kopens.factory3d.change.Snapshots;
import com.kopens.factory3d.common.ConflictException;
import com.kopens.factory3d.common.NotFoundException;
import com.kopens.factory3d.drawing.DrawingDetail;
import com.kopens.factory3d.drawing.DrawingMapper;
import com.kopens.factory3d.model.ModelMapper;
import com.kopens.factory3d.placement.PlacementMapper;
import com.kopens.factory3d.placement.PlacementView;
import com.kopens.factory3d.station.StationMapper;
import com.kopens.factory3d.station.StationView;
import com.kopens.factory3d.station.StationsChanged;
import java.util.ArrayList;
import java.util.List;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * AI 제안 묶음 적용: 한 트랜잭션 · 항목마다 DB 의 지금 값이 제안의 before 와 같을 때만 · 적용한 항목은 change_log(AI).
 * 다른 서비스를 부르지 않고 mapper 로 직접 (서비스 예외가 트랜잭션을 rollback-only 로 만들지 않게 — 검사는 여기서)
 */
@Service
public class ApplyService {
    static final String NO_PROPOSAL = "제안을 찾을 수 없습니다. (이미 적용·취소했거나 대화가 비워졌습니다)";
    static final String CHANGED = "제안 뒤에 다른 곳에서 바뀌었습니다";

    public record Skip(int seq, String reason) {}

    public record Result(String batchId, long drawingId, int applied, List<Skip> skipped) {}

    private record Applied(Changeset.Item item, String targetKey, Object before, Object after) {}

    private final ProposalStore store;
    private final PlacementMapper placements;
    private final StationMapper stations;
    private final DrawingMapper drawings;
    private final ModelMapper models;
    private final ChangeLogService changes;
    private final AuditService audit;
    private final ApplicationEventPublisher events;
    private final ObjectMapper json;

    public ApplyService(ProposalStore store, PlacementMapper placements, StationMapper stations, DrawingMapper drawings, ModelMapper models,
            ChangeLogService changes, AuditService audit, ApplicationEventPublisher events, ObjectMapper json) {
        this.store = store;
        this.placements = placements;
        this.stations = stations;
        this.drawings = drawings;
        this.models = models;
        this.changes = changes;
        this.audit = audit;
        this.events = events;
        this.json = json;
    }

    @Transactional
    public Result apply(String user, boolean admin, String batchId) {
        ProposalStore.Conversation c = store.byChangeset(user, batchId).orElseThrow(() -> new NotFoundException(NO_PROPOSAL));
        if (!c.lock.tryLock()) throw new ConflictException("AI 가 아직 답하는 중입니다. 끝난 뒤 다시 누르세요.");
        try {
            Changeset cs = c.changeset;
            if (!cs.id().equals(batchId)) throw new NotFoundException(NO_PROPOSAL);
            long drawingId = c.drawingId;
            DrawingDetail d = drawings.findById(drawingId);
            if (d == null) throw new NotFoundException("도면을 찾을 수 없습니다.");
            ObjectNode plan = (ObjectNode) json.readTree(d.plan());
            boolean planChanged = false, stationsChanged = false;
            List<Applied> done = new ArrayList<>();
            List<Skip> skipped = new ArrayList<>();
            for (Changeset.Item it : cs.items()) {
                String why;
                if (it.kind().startsWith("placement.")) why = placement(it, drawingId, done);
                else if (it.kind().equals("station.update")) {
                    why = admin ? station(it, done) : "공정 기준정보는 관리자만 바꿀 수 있습니다";
                    stationsChanged |= why == null;
                } else {
                    why = plan(it, plan, done);
                    planChanged |= why == null;
                }
                if (why != null) skipped.add(new Skip(it.seq(), why));
            }
            if (planChanged && drawings.updatePlan(drawingId, d.version(), plan.toString(), d.layerRules()) == 0)
                throw new ConflictException("도면이 그 사이 바뀌었습니다. 새 대화로 다시 요청하세요.");
            for (Applied a : done)
                changes.record(user, "AI", drawingId, cs.id(), a.item().kind(), a.item().target(), a.targetKey(), a.before(), a.after());
            if (stationsChanged) events.publishEvent(new StationsChanged(drawingId));
            audit.logAs(user, "AI_APPLY", "drawing=" + drawingId, done.size() + "건 적용, " + skipped.size() + "건 건너뜀");
            c.finish("[직전 제안 묶음: " + done.size() + "건 적용" + (skipped.isEmpty() ? "" : ", " + skipped.size() + "건 건너뜀") + "]");
            return new Result(cs.id(), drawingId, done.size(), skipped);
        } finally {
            c.lock.unlock();
        }
    }

    public void discard(String user, String batchId) {
        ProposalStore.Conversation c = store.byChangeset(user, batchId).orElseThrow(() -> new NotFoundException(NO_PROPOSAL));
        if (!c.lock.tryLock()) throw new ConflictException("AI 가 아직 답하는 중입니다. 끝난 뒤 다시 누르세요.");
        try {
            c.finish("[직전 제안 묶음: 사용자가 취소함]");
        } finally {
            c.lock.unlock();
        }
    }

    private String placement(Changeset.Item it, long drawingId, List<Applied> done) {
        JsonNode a = it.after();
        if (it.kind().equals("placement.add")) {
            String name = text(a, "name");
            if (placements.countNames(drawingId, List.of(name), null) > 0) return "같은 이름의 객체가 이미 있습니다: " + name;
            Long modelId = Snapshots.longOrNull(a, "modelId");
            if (modelId != null && models.findById(modelId) == null) return "모델이 지워졌습니다";
            var row = new PlacementMapper.NewRow();
            row.modelId = modelId;
            row.name = name;
            row.x = a.path("x").asDouble();
            row.y = a.path("y").asDouble();
            row.rot = a.path("rot").asDouble();
            placements.insert(drawingId, row);
            PlacementView v = placements.findById(row.id);
            done.add(new Applied(it, "placement:" + row.id, null, Snapshots.placement(json, v)));
            return null;
        }
        long id = Snapshots.idOf(it.targetKey());
        PlacementView cur = placements.findById(id);
        if (cur == null) return "객체가 이미 지워졌습니다";
        if (!Snapshots.samePlacement(cur, it.before())) return CHANGED;
        if (it.kind().equals("placement.delete")) {
            placements.delete(id);
            done.add(new Applied(it, it.targetKey(), Snapshots.placement(json, cur), null));
            return null;
        }
        String name = text(a, "name");
        if (!name.equals(cur.name()) && placements.countNames(drawingId, List.of(name), id) > 0) return "같은 이름의 객체가 이미 있습니다: " + name;
        placements.update(id, cur.modelId(), name, a.path("x").asDouble(), a.path("y").asDouble(), a.path("rot").asDouble());
        done.add(new Applied(it, it.targetKey(), Snapshots.placement(json, cur), Snapshots.placement(json, placements.findById(id))));
        return null;
    }

    private String station(Changeset.Item it, List<Applied> done) {
        long id = Snapshots.idOf(it.targetKey());
        StationView cur = stations.findById(id);
        if (cur == null) return "공정이 이미 지워졌습니다";
        if (!Snapshots.sameStation(cur, it.before())) return CHANGED;
        JsonNode a = it.after();
        StationMapper.Row r = Snapshots.stationRow(cur);
        r.placementName = text(a, "placementName");
        r.taktSec = a.path("taktSec").asInt();
        r.warnPp = a.path("warnPp").asInt();
        r.delayPp = a.path("delayPp").asInt();
        stations.update(id, r);
        done.add(new Applied(it, it.targetKey(), Snapshots.station(json, cur), Snapshots.station(json, stations.findById(id))));
        return null;
    }

    private String plan(Changeset.Item it, ObjectNode plan, List<Applied> done) {
        ArrayNode parts = PlanEdits.partitions(plan);
        switch (it.kind()) {
            case "plan.partition.add" -> {
                if (PlanEdits.indexOf(parts, text(it.after(), "id")) >= 0) return "같은 id 의 가벽이 이미 있습니다";
                parts.add(it.after().deepCopy());
            }
            case "plan.partition.delete" -> {
                int i = PlanEdits.indexOf(parts, text(it.before(), "id"));
                if (i < 0) return "가벽이 이미 없습니다";
                if (!parts.get(i).equals(it.before())) return CHANGED;
                parts.remove(i);
            }
            case "plan.zone.rename" -> {
                ObjectNode z = PlanEdits.zone(plan, text(it.after(), "id"));
                if (z == null) return "구역이 이미 없습니다";
                if (!z.path("name").asText().equals(text(it.before(), "name"))) return CHANGED;
                z.put("name", text(it.after(), "name"));
            }
            default -> {
                return "모르는 종류입니다: " + it.kind();
            }
        }
        done.add(new Applied(it, it.targetKey(), it.before(), it.after()));
        return null;
    }
}
```

`server/src/main/java/com/kopens/factory3d/ai/AiChangeController.java`:
```java
package com.kopens.factory3d.ai;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

/** AI 제안 묶음 적용·취소 (운전원 이상 — SecurityConfig 기본 규칙. 공정 항목은 서비스가 관리자만 적용) */
@RestController
public class AiChangeController {
    private final ApplyService apply;

    public AiChangeController(ApplyService apply) {
        this.apply = apply;
    }

    @PostMapping("/api/ai/changes/{batchId}/apply")
    public ApplyService.Result apply(@PathVariable String batchId, Authentication auth) {
        return apply.apply(auth.getName(), isAdmin(auth), batchId);
    }

    @PostMapping("/api/ai/changes/{batchId}/discard")
    public ResponseEntity<Void> discard(@PathVariable String batchId, Authentication auth) {
        apply.discard(auth.getName(), batchId);
        return ResponseEntity.noContent().build();
    }

    static boolean isAdmin(Authentication auth) {
        return auth != null && auth.getAuthorities().stream().anyMatch(a -> "ROLE_ADMIN".equals(a.getAuthority()));
    }
}
```

- [ ] **Step 5: 묶음 되돌리기**

`server/src/main/java/com/kopens/factory3d/change/RevertService.java`:
```java
package com.kopens.factory3d.change;

import static com.kopens.factory3d.change.Snapshots.text;

import com.kopens.factory3d.audit.AuditService;
import com.kopens.factory3d.common.ConflictException;
import com.kopens.factory3d.common.ForbiddenException;
import com.kopens.factory3d.common.NotFoundException;
import com.kopens.factory3d.drawing.DrawingDetail;
import com.kopens.factory3d.drawing.DrawingMapper;
import com.kopens.factory3d.model.ModelMapper;
import com.kopens.factory3d.placement.PlacementMapper;
import com.kopens.factory3d.placement.PlacementView;
import com.kopens.factory3d.station.StationMapper;
import com.kopens.factory3d.station.StationView;
import com.kopens.factory3d.station.StationsChanged;
import java.util.List;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/** 변경 묶음 되돌리기 (사람·AI 공통): 뒤에서부터 before 로 역적용, 한 트랜잭션. 하나라도 못 하면 409 로 전부 취소 */
@Service
public class RevertService {
    static final String LATER = "이후에 바뀐 객체가 있어 되돌릴 수 없습니다";

    public record Result(String batchId, int reverted) {}

    private final ChangeLogService changes;
    private final PlacementMapper placements;
    private final StationMapper stations;
    private final DrawingMapper drawings;
    private final ModelMapper models;
    private final AuditService audit;
    private final ApplicationEventPublisher events;
    private final ObjectMapper json;

    public RevertService(ChangeLogService changes, PlacementMapper placements, StationMapper stations, DrawingMapper drawings,
            ModelMapper models, AuditService audit, ApplicationEventPublisher events, ObjectMapper json) {
        this.changes = changes;
        this.placements = placements;
        this.stations = stations;
        this.drawings = drawings;
        this.models = models;
        this.audit = audit;
        this.events = events;
        this.json = json;
    }

    @Transactional
    public Result revert(String user, boolean admin, String batchId) {
        List<ChangeEntry> rows = changes.batch(batchId);
        if (rows.isEmpty()) throw new NotFoundException("변경 묶음을 찾을 수 없습니다.");
        if (rows.stream().allMatch(ChangeEntry::reverted)) throw new ConflictException("이미 되돌린 묶음입니다.");
        if (!admin && rows.stream().anyMatch(r -> !user.equals(r.username()))) throw new ForbiddenException("자기가 한 변경만 되돌릴 수 있습니다.");
        if (!admin && rows.stream().anyMatch(r -> r.kind().startsWith("station.")))
            throw new ForbiddenException("공정 기준정보 변경은 관리자만 되돌릴 수 있습니다.");
        long drawingId = rows.get(0).drawingId();
        long maxId = rows.stream().mapToLong(ChangeEntry::id).max().orElseThrow();
        List<String> keys = rows.stream().map(ChangeEntry::targetKey).distinct().toList();
        if (changes.mapper().countLater(drawingId, keys, maxId, batchId) > 0) throw new ConflictException(LATER);

        DrawingDetail d = drawings.findById(drawingId);
        ObjectNode plan = (ObjectNode) json.readTree(d.plan());
        boolean planChanged = false, stationsChanged = false;
        for (ChangeEntry r : rows.reversed()) {
            JsonNode before = r.before() == null ? null : json.readTree(r.before());
            JsonNode after = r.after() == null ? null : json.readTree(r.after());
            if (r.kind().startsWith("placement.")) placement(r, drawingId, before, after);
            else if (r.kind().equals("station.update")) {
                station(r, before, after);
                stationsChanged = true;
            } else {
                plan(r, plan, before, after);
                planChanged = true;
            }
        }
        if (planChanged && drawings.updatePlan(drawingId, d.version(), plan.toString(), d.layerRules()) == 0) throw new ConflictException(LATER);
        changes.mapper().markReverted(batchId, user);
        if (stationsChanged) events.publishEvent(new StationsChanged(drawingId));
        audit.logAs(user, "CHANGE_REVERT", "drawing=" + drawingId, batchId + " (" + rows.size() + "건)");
        return new Result(batchId, rows.size());
    }

    private void placement(ChangeEntry r, long drawingId, JsonNode before, JsonNode after) {
        long id = Snapshots.idOf(r.targetKey());
        PlacementView cur = placements.findById(id);
        switch (r.kind()) {
            case "placement.add" -> {
                if (cur == null || !Snapshots.samePlacement(cur, after)) throw new ConflictException(LATER);
                placements.delete(id);
            }
            case "placement.delete" -> {
                String name = text(before, "name");
                if (placements.countNames(drawingId, List.of(name), null) > 0) throw new ConflictException("같은 이름의 객체가 있어 되돌릴 수 없습니다");
                Long modelId = Snapshots.longOrNull(before, "modelId");
                var row = new PlacementMapper.NewRow();
                row.modelId = modelId != null && models.findById(modelId) != null ? modelId : null;
                row.name = name;
                row.x = before.path("x").asDouble();
                row.y = before.path("y").asDouble();
                row.rot = before.path("rot").asDouble();
                row.hintLabel = text(before, "hintLabel");
                placements.insert(drawingId, row);
            }
            default -> {
                if (cur == null || !Snapshots.samePlacement(cur, after)) throw new ConflictException(LATER);
                String name = text(before, "name");
                if (!name.equals(cur.name()) && placements.countNames(drawingId, List.of(name), id) > 0)
                    throw new ConflictException("같은 이름의 객체가 있어 되돌릴 수 없습니다");
                Long modelId = Snapshots.longOrNull(before, "modelId");
                placements.update(id, modelId != null && models.findById(modelId) == null ? null : modelId, name,
                        before.path("x").asDouble(), before.path("y").asDouble(), before.path("rot").asDouble());
            }
        }
    }

    private void station(ChangeEntry r, JsonNode before, JsonNode after) {
        StationView cur = stations.findById(Snapshots.idOf(r.targetKey()));
        if (cur == null || !Snapshots.sameStation(cur, after)) throw new ConflictException(LATER);
        StationMapper.Row row = Snapshots.stationRow(cur);
        row.placementName = text(before, "placementName");
        row.taktSec = before.path("taktSec").asInt();
        row.warnPp = before.path("warnPp").asInt();
        row.delayPp = before.path("delayPp").asInt();
        stations.update(cur.id(), row);
    }

    private void plan(ChangeEntry r, ObjectNode plan, JsonNode before, JsonNode after) {
        ArrayNode parts = PlanEdits.partitions(plan);
        switch (r.kind()) {
            case "plan.partition.add" -> {
                int i = PlanEdits.indexOf(parts, text(after, "id"));
                if (i < 0 || !parts.get(i).equals(after)) throw new ConflictException(LATER);
                parts.remove(i);
            }
            case "plan.partition.delete" -> {
                if (PlanEdits.indexOf(parts, text(before, "id")) >= 0) throw new ConflictException(LATER);
                parts.add(before.deepCopy());
            }
            case "plan.zone.rename" -> {
                ObjectNode z = PlanEdits.zone(plan, text(after, "id"));
                if (z == null || !z.path("name").asText().equals(text(after, "name"))) throw new ConflictException(LATER);
                z.put("name", text(before, "name"));
            }
            default -> throw new ConflictException("되돌릴 수 없는 종류입니다: " + r.kind());
        }
    }
}
```

`server/src/main/java/com/kopens/factory3d/change/ChangeController.java` — 필드·생성자에 `RevertService revert` 를 더하고 메서드 추가:
```java
    private final RevertService revert;

    public ChangeController(ChangeLogService changes, RevertService revert) {
        this.changes = changes;
        this.revert = revert;
    }

    @PostMapping("/api/changes/{batchId}/revert")
    public RevertService.Result revert(@PathVariable String batchId, org.springframework.security.core.Authentication auth) {
        boolean admin = auth.getAuthorities().stream().anyMatch(a -> "ROLE_ADMIN".equals(a.getAuthority()));
        return revert.revert(auth.getName(), admin, batchId);
    }
```
(기존 생성자 `ChangeController(ChangeLogService changes)` 는 위 생성자로 바꾼다.)

- [ ] **Step 6: 사용량 보고 · 연결 테스트**

`server/src/main/java/com/kopens/factory3d/ai/AiUsageService.java` 에 추가 (import `com.kopens.factory3d.common.BadRequestException`, `java.util.List`):
```java
    public record Report(UsageRow month, BigDecimal limitUsd, List<UsageRow> rows, LocalDate from, LocalDate to, String group) {}

    /** 기간 [from, to] (날짜 포함) 일별·사용자별 + 이번 달 합계. 기본 = 이번 달 1일 ~ 오늘, day */
    public Report report(LocalDate from, LocalDate to, String group, BigDecimal limitUsd) {
        String g = group == null || group.isBlank() ? "day" : group;
        if (!g.equals("day") && !g.equals("user")) throw new BadRequestException("group 은 day 또는 user 입니다.");
        LocalDate today = LocalDate.now(zone);
        LocalDate f = from == null ? today.withDayOfMonth(1) : from;
        LocalDate t = to == null ? today : to;
        if (t.isBefore(f) || f.plusDays(366).isBefore(t)) throw new BadRequestException("기간이 올바르지 않습니다.");
        OffsetDateTime[] m = monthRange();
        UsageRow month = mapper.group("month", m[0], m[1], zone.getId()).getFirst();
        List<UsageRow> rows = mapper.group(g, f.atStartOfDay(zone).toOffsetDateTime(), t.plusDays(1).atStartOfDay(zone).toOffsetDateTime(),
                zone.getId());
        return new Report(month, limitUsd, rows, f, t, g);
    }
```

`server/src/main/java/com/kopens/factory3d/ai/AiAdminController.java` — 생성자에 `AiUsageService usage`, `ClaudeGateway gateway` 를 더하고 메서드 추가 (import `java.time.LocalDate`, `org.springframework.format.annotation.DateTimeFormat`):
```java
    public record TestResult(boolean ok, String model, Long latencyMs, String message) {}

    private final AiUsageService usage;
    private final ClaudeGateway gateway;

    public AiAdminController(AiSettingService settings, AiUsageService usage, ClaudeGateway gateway) {
        this.settings = settings;
        this.usage = usage;
        this.gateway = gateway;
    }

    @GetMapping("/usage")
    public AiUsageService.Report usage(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String group) {
        return usage.report(from, to, group, settings.view().monthlyLimitUsd());
    }

    /** 짧은 호출로 연결 확인 (사용량 purpose test). 실패도 200 + ok:false (원인 문구) */
    @PostMapping("/test")
    public TestResult test(Authentication auth) {
        AiSettingService.Active a = settings.requireKey();
        try {
            ClaudeGateway.Ping p = gateway.ping(a.apiKey(), a.model());
            var u = p.usage();
            usage.record(auth.getName(), null, u.model(), u.input(), u.output(), u.cacheRead(), u.cacheWrite(), "test");
            return new TestResult(true, p.model(), p.latencyMs(), null);
        } catch (AiCallException e) {
            return new TestResult(false, a.model(), null, e.getMessage());
        }
    }
```
(기존 생성자 `AiAdminController(AiSettingService settings)` 는 위 생성자로 바꾼다.)

- [ ] **Step 7: 테스트 통과 확인**

Run: `cd server && ./gradlew test --tests 'com.kopens.factory3d.ai.*' --tests 'com.kopens.factory3d.change.*'`
Expected: PASS (ApplyRevertApiTest 8 · AiUsageApiTest 2 · 앞 테스트 그대로)

Run: `cd server && ./gradlew test`
Expected: 전체 PASS

- [ ] **Step 8: Commit**

```bash
cd /c/kopens/project/Factory3D && git add server/src/main/java/com/kopens/factory3d/ai server/src/main/java/com/kopens/factory3d/change \
  server/src/test/java/com/kopens/factory3d/ai
git commit -m "feat(server): AI 제안 적용(한 트랜잭션·AI 이력·공정은 관리자만)·취소 · 묶음 되돌리기(뒤 변경 있으면 409) · 사용량 보고 · 연결 테스트

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 화면 — AI 순수 모듈(형식·SSE·API·대화 상태·미리보기 계산) · 3D 미리보기 레이어

**Files:**
- Create: `web/src/ai/{types,sse,api,chat,useChat,preview}.ts`, `web/src/scene/previewLayer.ts`
- Modify: `web/src/scene/FactoryScene.ts` (PreviewHost)
- Test: `web/src/ai/{sse,chat,preview}.test.ts`, `web/src/scene/previewLayer.test.ts`

**Interfaces:**
- Consumes: 서버 이벤트·응답 모양 (Task 5·6), `ApiError`·`apiErrorOf`·`apiJson`·`apiSend`·`csrfToken` (`web/src/api/client.ts`), `planToLocal` (`web/src/scene/coords.ts`).
- Produces (TS):
  - `ai/types.ts`: `AiReason`, `AiStatus`, `REASON_TEXT`, `ChangeKind`, `PlacementSnap`, `PartitionSnap`, `ProposalItem`, `Proposal`, `Skip`, `ApplyResult`, `ChatUsage`, `ChatEvent`, `AiModel`, `AI_MODELS`, `AiSettings`, `AiTestResult`, `UsageRow`, `UsageReport`, `ChangeEntry`, `ChangePage`.
  - `ai/sse.ts`: `sseParser(onMessage: (m: SseMessage) => void): { push(chunk: string): void; end(): void }`, `toChatEvent(m: SseMessage): ChatEvent | null`.
  - `ai/api.ts`: `getAiStatus()`, `streamChat(drawingId, message, onEvent, signal?)`, `resetChat(drawingId)`, `applyProposal(id)`, `discardProposal(id)`, `revertBatch(batchId)`, `getAiSettings()`, `saveAiSettings(patch)`, `setAiKey(apiKey)`, `deleteAiKey()`, `testAi()`, `getUsage(group, from?, to?)`, `getChanges(q: ChangeQuery)`, 형식 `ChangeQuery { drawingId?: number; source?: 'USER' | 'AI'; from?: string; to?: string; page?: number }`.
  - `ai/chat.ts`: `ChatState`, `Msg`(`UserMsg | AiMsg`), `ProposalState`, `ChatAction`, `initialChat()`, `chatReducer(s, a)`, `previewItems(s): ProposalItem[]` (제안 카드가 `open`·`applying` 일 때만 항목, 아니면 []).
  - `ai/useChat.ts`: `useChat(drawingId: number | null, onApplied: () => void): Chat` — `Chat { state; send(text); apply(); discard(); revert(); newChat() }`. 도면이 바뀌거나 화면을 떠나면 진행 중 요청을 끊고 상태를 비우며 서버 대화도 비움.
  - `ai/preview.ts`: `Size`, `Pose`, `GhostObject { seq; kind: 'move'|'add'|'delete'; at: Pose; from: Pose | null; size: Size }`, `GhostWall { seq; kind: 'add'|'delete'; a: Pt; b: Pt; h; t }`, `Preview { objects; walls }`, `previewOf(items, sizeOf): Preview`, `focusOf(item): {x, y} | null`.
  - `scene/previewLayer.ts`: `PreviewLayer` (`setBounds(b)`, `set(p: Preview | null)`, `highlight(seq: number | null)`, `dispose()`), `PREVIEW_COLOR`. 메시 `userData = { seq, kind, base }`.
  - `FactoryScene` 가 `PreviewHost { setPreview(p: Preview | null); highlightPreview(seq: number | null); focusPoint(x: number, y: number) }` 를 구현, `SceneHost` 에 포함.

- [ ] **Step 1: 실패 테스트 작성**

`web/src/ai/sse.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { sseParser, toChatEvent, type SseMessage } from './sse'

function parse(chunks: string[]): SseMessage[] {
  const got: SseMessage[] = []
  const p = sseParser((m) => got.push(m))
  for (const c of chunks) p.push(c)
  p.end()
  return got
}

describe('SSE 파서', () => {
  it('Spring 형식(콜론 뒤 공백 없음)과 조각난 줄', () => {
    const got = parse(['event:te', 'xt\ndata:{"t":"안', '녕"}\n', '\nevent:done\nda', 'ta:{"costUsd":0.1}\n\n'])
    expect(got).toEqual([
      { event: 'text', data: '{"t":"안녕"}' },
      { event: 'done', data: '{"costUsd":0.1}' },
    ])
  })

  it('CRLF · \\r\\n 이 조각 사이에서 갈림 · 여러 data 줄 · 주석 · 이름 없는 이벤트', () => {
    const got = parse([': ping\r\n', 'data: a\r', '\ndata: b\r\n\r\n', 'data:x'])
    expect(got).toEqual([
      { event: 'message', data: 'a\nb' },
      { event: 'message', data: 'x' }, // 끝(end)에서 마저 내보냄
    ])
  })

  it('채팅 이벤트로 바꿈 (모르는 이름·깨진 JSON 은 버림)', () => {
    expect(toChatEvent({ event: 'text', data: '{"t":"가"}' })).toEqual({ type: 'text', t: '가' })
    expect(toChatEvent({ event: 'tool', data: '{"name":"get_scene","label":"장면 확인 중…"}' })).toEqual({ type: 'tool', name: 'get_scene', label: '장면 확인 중…' })
    expect(toChatEvent({ event: 'proposal', data: '{"id":"b1","items":[]}' })).toEqual({ type: 'proposal', proposal: { id: 'b1', items: [] } })
    expect(toChatEvent({ event: 'done', data: '{"inputTokens":1,"outputTokens":2,"cacheReadTokens":0,"cacheWriteTokens":0,"costUsd":0.5}' }))
      .toEqual({ type: 'done', usage: { inputTokens: 1, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.5 } })
    expect(toChatEvent({ event: 'error', data: '{"message":"한도"}' })).toEqual({ type: 'error', message: '한도' })
    expect(toChatEvent({ event: 'ping', data: '{}' })).toBeNull()
    expect(toChatEvent({ event: 'text', data: '{깨짐' })).toBeNull()
  })
})
```

`web/src/ai/chat.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { chatReducer, initialChat, previewItems, type AiMsg, type ChatAction, type ChatState } from './chat'
import type { Proposal } from './types'

const P: Proposal = {
  id: 'b1',
  items: [{ seq: 1, kind: 'placement.move', target: 'MS1', targetKey: 'placement:1', before: { name: 'MS1', x: 1, y: 1, rot: 0 }, after: { name: 'MS1', x: 3, y: 1, rot: 0 }, label: 'MS1 이동' }],
}
const run = (actions: ChatAction[], s: ChatState = initialChat()) => actions.reduce(chatReducer, s)
const lastAi = (s: ChatState) => s.msgs[s.msgs.length - 1] as AiMsg

describe('챗 상태', () => {
  it('보내기 → 글자 조각·도구 줄·제안·끝', () => {
    const s = run([
      { type: 'send', text: '옮겨줘' },
      { type: 'event', ev: { type: 'text', t: '장면을 ' } },
      { type: 'event', ev: { type: 'tool', name: 'get_scene', label: '장면 확인 중…' } },
      { type: 'event', ev: { type: 'text', t: '확인했습니다.' } },
      { type: 'event', ev: { type: 'proposal', proposal: P } },
      { type: 'event', ev: { type: 'done', usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.01 } } },
    ])
    expect(s.msgs.map((m) => m.role)).toEqual(['user', 'ai'])
    expect(s.msgs[0]).toMatchObject({ role: 'user', text: '옮겨줘' })
    expect(lastAi(s)).toMatchObject({ text: '장면을 확인했습니다.', tools: [{ name: 'get_scene', label: '장면 확인 중…' }], done: true, error: null })
    expect(s.sending).toBe(false)
    expect(s.proposal).toMatchObject({ status: 'open', proposal: P })
    expect(previewItems(s)).toHaveLength(1)
  })

  it('오류 · 끊김 · 실패', () => {
    const e = run([{ type: 'send', text: 'a' }, { type: 'event', ev: { type: 'error', message: '한도를 넘었습니다' } }])
    expect(lastAi(e)).toMatchObject({ error: '한도를 넘었습니다', done: true })
    expect(e.sending).toBe(false)
    const cut = run([{ type: 'send', text: 'a' }, { type: 'event', ev: { type: 'text', t: '반' } }, { type: 'end' }])
    expect(lastAi(cut)).toMatchObject({ text: '반', error: '응답이 중간에 끊겼습니다', done: true })
    const ok = run([{ type: 'send', text: 'a' }, { type: 'event', ev: { type: 'done', usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0 } } }, { type: 'end' }])
    expect(lastAi(ok).error).toBeNull()
    const fail = run([{ type: 'send', text: 'a' }, { type: 'fail', message: '서버에 연결할 수 없습니다.' }])
    expect(lastAi(fail)).toMatchObject({ error: '서버에 연결할 수 없습니다.', done: true })
  })

  it('적용 → 적용됨(미리보기 끝) → 되돌리기, 실패하면 그 앞 상태 + 안내', () => {
    let s = run([{ type: 'send', text: 'a' }, { type: 'event', ev: { type: 'proposal', proposal: P } }])
    s = chatReducer(s, { type: 'applying' })
    expect(s.proposal?.status).toBe('applying')
    expect(previewItems(s)).toHaveLength(1)
    s = chatReducer(s, { type: 'proposalError', message: '충돌' })
    expect(s.proposal).toMatchObject({ status: 'open', error: '충돌' })
    s = chatReducer(s, { type: 'applying' })
    s = chatReducer(s, { type: 'applied', result: { batchId: 'b1', drawingId: 1, applied: 1, skipped: [] } })
    expect(s.proposal).toMatchObject({ status: 'applied', error: null, result: { applied: 1 } })
    expect(previewItems(s)).toEqual([])
    s = chatReducer(s, { type: 'reverting' })
    s = chatReducer(s, { type: 'proposalError', message: '이후에 바뀐 객체가 있어 되돌릴 수 없습니다' })
    expect(s.proposal?.status).toBe('applied')
    s = chatReducer(chatReducer(s, { type: 'reverting' }), { type: 'reverted' })
    expect(s.proposal?.status).toBe('reverted')
  })

  it('빈 제안은 카드를 닫고, 취소·새 대화는 비움', () => {
    let s = run([{ type: 'send', text: 'a' }, { type: 'event', ev: { type: 'proposal', proposal: P } }])
    s = chatReducer(s, { type: 'event', ev: { type: 'proposal', proposal: { id: 'b1', items: [] } } })
    expect(s.proposal).toBeNull()
    s = chatReducer(chatReducer(s, { type: 'event', ev: { type: 'proposal', proposal: P } }), { type: 'discarded' })
    expect(s.proposal).toBeNull()
    expect(chatReducer(s, { type: 'reset' })).toEqual(initialChat())
  })
})
```

`web/src/ai/preview.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { focusOf, previewOf } from './preview'
import type { ProposalItem } from './types'

const box = { sizeX: 2, sizeY: 2, sizeZ: 2 }
const sizeOf = (id: number | null | undefined) => (id === 7 ? { sizeX: 4, sizeY: 3, sizeZ: 2.5 } : box)
const snap = (x: number, y: number, rot = 0, name = 'A') => ({ id: 1, name, modelId: 7, x, y, rot })
const item = (seq: number, kind: ProposalItem['kind'], before: unknown, after: unknown): ProposalItem =>
  ({ seq, kind, target: 'A', targetKey: `k${seq}`, before, after, label: '' })

describe('미리보기 계산', () => {
  it('옮김·회전·변경 = 파란 유령 + 원래 자리, 추가 = 초록, 삭제 = 빨강, 이름만 바꿈·공정·구역 = 유령 없음', () => {
    const p = previewOf([
      item(1, 'placement.move', snap(1, 1), snap(3, 1)),
      item(2, 'placement.rotate', snap(5, 5), snap(5, 5, 90)),
      item(3, 'placement.add', null, { name: 'B', modelId: null, x: 8, y: 2, rot: 0 }),
      item(4, 'placement.delete', snap(9, 9), null),
      item(5, 'placement.rename', snap(1, 1), snap(1, 1, 0, 'Z')),
      item(6, 'station.update', { name: 'S' }, { name: 'S' }),
      item(7, 'plan.zone.rename', { id: 'z1', name: 'a' }, { id: 'z1', name: 'b' }),
    ], sizeOf)
    expect(p.objects).toEqual([
      { seq: 1, kind: 'move', at: { x: 3, y: 1, rot: 0 }, from: { x: 1, y: 1, rot: 0 }, size: { sizeX: 4, sizeY: 3, sizeZ: 2.5 } },
      { seq: 2, kind: 'move', at: { x: 5, y: 5, rot: 90 }, from: { x: 5, y: 5, rot: 0 }, size: { sizeX: 4, sizeY: 3, sizeZ: 2.5 } },
      { seq: 3, kind: 'add', at: { x: 8, y: 2, rot: 0 }, from: null, size: box },
      { seq: 4, kind: 'delete', at: { x: 9, y: 9, rot: 0 }, from: null, size: { sizeX: 4, sizeY: 3, sizeZ: 2.5 } },
    ])
    expect(p.walls).toEqual([])
  })

  it('가벽 추가·삭제는 첫·끝 점', () => {
    const p = previewOf([
      item(1, 'plan.partition.add', null, { id: 'p2', pts: [[0, 0], [4, 0]], h: 1.2, t: 0.5 }),
      item(2, 'plan.partition.delete', { id: 'p1', pts: [[1, 1], [1, 3], [1, 6]], h: 2, t: 0.3 }, null),
    ], sizeOf)
    expect(p.walls).toEqual([
      { seq: 1, kind: 'add', a: [0, 0], b: [4, 0], h: 1.2, t: 0.5 },
      { seq: 2, kind: 'delete', a: [1, 1], b: [1, 6], h: 2, t: 0.3 },
    ])
  })

  it('항목의 카메라 자리', () => {
    expect(focusOf(item(1, 'placement.move', snap(1, 1), snap(3, 1)))).toEqual({ x: 3, y: 1 })
    expect(focusOf(item(2, 'placement.delete', snap(9, 9), null))).toEqual({ x: 9, y: 9 })
    expect(focusOf(item(3, 'plan.partition.add', null, { id: 'p2', pts: [[0, 0], [4, 2]], h: 1, t: 1 }))).toEqual({ x: 2, y: 1 })
    expect(focusOf(item(4, 'station.update', {}, {}))).toBeNull()
  })
})
```

`web/src/scene/previewLayer.test.ts`:
```ts
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { PREVIEW_COLOR, PreviewLayer } from './previewLayer'

type BoxMesh = THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>
const meshes = (g: THREE.Group) => g.children.filter((o): o is BoxMesh => (o as THREE.Mesh).isMesh)

describe('PreviewLayer', () => {
  it('유령 상자 자리·크기·색, 옮김은 원래 자리 점선, 가벽은 두 점 사이', () => {
    const g = new THREE.Group()
    const layer = new PreviewLayer(g)
    layer.setBounds({ w: 10, h: 10 })
    layer.set({
      objects: [
        { seq: 1, kind: 'move', at: { x: 7, y: 5, rot: 90 }, from: { x: 5, y: 5, rot: 0 }, size: { sizeX: 4, sizeY: 2, sizeZ: 3 } },
        { seq: 2, kind: 'delete', at: { x: 1, y: 1, rot: 0 }, from: null, size: { sizeX: 2, sizeY: 2, sizeZ: 2 } },
      ],
      walls: [{ seq: 3, kind: 'add', a: [0, 9], b: [4, 9], h: 1.2, t: 0.5 }],
    })
    const [move, del, wall] = meshes(g)
    expect(move.position.x).toBeCloseTo(2)
    expect(move.position.z).toBeCloseTo(0)
    expect(move.position.y).toBeCloseTo(1.5)
    expect(move.rotation.y).toBeCloseTo(Math.PI / 2)
    expect(move.geometry.parameters).toMatchObject({ width: 4, height: 3, depth: 2 })
    expect(move.material.color.getHex()).toBe(PREVIEW_COLOR.move)
    expect(move.material.transparent).toBe(true)
    expect(del.material.color.getHex()).toBe(PREVIEW_COLOR.delete)
    expect(del.geometry.parameters.width).toBeCloseTo(2.12) // 삭제는 조금 크게 덮음
    expect(wall.material.color.getHex()).toBe(PREVIEW_COLOR.wallAdd)
    expect(wall.geometry.parameters).toMatchObject({ width: 4, height: 1.2, depth: 0.5 })
    expect(wall.position.x).toBeCloseTo(-3)
    expect(wall.position.z).toBeCloseTo(-4)
    const outline = g.children.find((o) => (o as THREE.Line).isLine) as THREE.Line
    expect(outline).toBeDefined()
    expect(outline.position.x).toBeCloseTo(0)
    expect((outline.material as THREE.LineDashedMaterial).isLineDashedMaterial).toBe(true)
  })

  it('강조하면 그 항목만 진하게, 비우면 모두 사라짐', () => {
    const g = new THREE.Group()
    const layer = new PreviewLayer(g)
    layer.setBounds({ w: 10, h: 10 })
    layer.set({
      objects: [
        { seq: 1, kind: 'add', at: { x: 1, y: 1, rot: 0 }, from: null, size: { sizeX: 1, sizeY: 1, sizeZ: 1 } },
        { seq: 2, kind: 'add', at: { x: 2, y: 2, rot: 0 }, from: null, size: { sizeX: 1, sizeY: 1, sizeZ: 1 } },
      ],
      walls: [],
    })
    layer.highlight(2)
    const [a, b] = meshes(g)
    expect(b.material.opacity).toBeGreaterThan(a.material.opacity)
    layer.highlight(null)
    expect(b.material.opacity).toBeCloseTo(a.material.opacity)
    layer.set(null)
    expect(g.children).toHaveLength(0)
    layer.set({ objects: [{ seq: 1, kind: 'add', at: { x: 1, y: 1, rot: 0 }, from: null, size: { sizeX: 1, sizeY: 1, sizeZ: 1 } }], walls: [] })
    layer.dispose()
    expect(g.children).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd web && npx vitest run src/ai src/scene/previewLayer.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 형식 · SSE · API**

`web/src/ai/types.ts`:
```ts
/** AI 챗봇 · 변경 이력 · Claude API 관리 (서버 응답 모양) */
export type AiReason = 'no-master-key' | 'no-key' | 'disabled' | 'over-limit'
export interface AiStatus { enabled: boolean; reason: AiReason | null }
export const REASON_TEXT: Record<AiReason, string> = {
  'no-master-key': '서버에 F3D_AI_MASTER_KEY 가 설정되지 않았습니다',
  'no-key': 'Claude API 키가 등록되지 않았습니다 (관리자 › Claude API 관리)',
  disabled: 'AI 챗봇이 사용 중지되어 있습니다 (관리자 › Claude API 관리)',
  'over-limit': '이번 달 AI 사용 한도를 넘었습니다',
}

export type ChangeKind =
  | 'placement.move' | 'placement.rotate' | 'placement.rename' | 'placement.update' | 'placement.add' | 'placement.delete'
  | 'station.update' | 'plan.partition.add' | 'plan.partition.delete' | 'plan.zone.rename'
export interface PlacementSnap { id?: number; name: string; modelId?: number | null; x: number; y: number; rot: number; hintLabel?: string }
export interface PartitionSnap { id: string; pts: [number, number][]; h: number; t: number }
export interface ProposalItem { seq: number; kind: ChangeKind; target: string; targetKey: string; before: unknown; after: unknown; label: string }
export interface Proposal { id: string; items: ProposalItem[] }
export interface Skip { seq: number; reason: string }
export interface ApplyResult { batchId: string; drawingId: number; applied: number; skipped: Skip[] }
export interface ChatUsage { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; costUsd: number }
export type ChatEvent =
  | { type: 'text'; t: string }
  | { type: 'tool'; name: string; label: string }
  | { type: 'proposal'; proposal: Proposal }
  | { type: 'done'; usage: ChatUsage }
  | { type: 'error'; message: string }

export type AiModel = 'claude-opus-5-5' | 'claude-sonnet-5-5' | 'claude-haiku-5-5'
/** 관리자 모델 고르기 (가격 USD / 1M 토큰: 입력 · 출력) */
export const AI_MODELS: { id: AiModel; label: string; price: string }[] = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', price: '입력 $4 · 출력 $20 / 1M 토큰' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', price: '입력 $2 · 출력 $10 / 1M 토큰' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', price: '입력 $0.10 · 출력 $0.50 / 1M 토큰' },
]
export interface AiSettings { hasKey: boolean; keyHint: string | null; model: AiModel; monthlyLimitUsd: number; enabled: boolean; masterKey: boolean; updatedBy: string | null; updatedAt: string }
export interface AiTestResult { ok: boolean; model: string | null; latencyMs: number | null; message: string | null }
export interface UsageRow { key: string; calls: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; costUsd: number }
export interface UsageReport { month: UsageRow; limitUsd: number; rows: UsageRow[]; from: string; to: string; group: 'day' | 'user' }
export interface ChangeEntry {
  id: number; at: string; username: string | null; source: 'USER' | 'AI'; drawingId: number; drawingName: string; batchId: string
  kind: ChangeKind; target: string | null; before: unknown; after: unknown; reverted: boolean; revertedBy: string | null; revertedAt: string | null
}
export interface ChangePage { items: ChangeEntry[]; total: number; page: number; size: number }
```

`web/src/ai/sse.ts`:
```ts
import type { ChatEvent } from './types'

export interface SseMessage { event: string; data: string }

/** text/event-stream 조각 → 완성된 메시지. 줄 끝 \n · \r\n · \r, 여러 data 줄은 \n 으로 이음, ':' 주석 무시 */
export function sseParser(onMessage: (m: SseMessage) => void): { push(chunk: string): void; end(): void } {
  let buf = ''
  let event = ''
  let data: string[] = []
  const line = (l: string) => {
    if (l === '') {
      if (data.length) onMessage({ event: event || 'message', data: data.join('\n') })
      event = ''
      data = []
      return
    }
    if (l.startsWith(':')) return
    const i = l.indexOf(':')
    const field = i < 0 ? l : l.slice(0, i)
    let value = i < 0 ? '' : l.slice(i + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') event = value
    else if (field === 'data') data.push(value)
  }
  return {
    push(chunk) {
      buf += chunk
      for (;;) {
        const n = buf.search(/[\r\n]/)
        if (n < 0) return
        if (buf[n] === '\r' && n === buf.length - 1) return // \r\n 이 조각 사이에서 갈릴 수 있음
        const len = buf[n] === '\r' && buf[n + 1] === '\n' ? 2 : 1
        line(buf.slice(0, n))
        buf = buf.slice(n + len)
      }
    },
    end() {
      if (buf) line(buf.replace(/\r$/, ''))
      buf = ''
      line('')
    },
  }
}

/** 서버 이벤트 → 채팅 이벤트 (모르는 이름·깨진 JSON 은 null) */
export function toChatEvent(m: SseMessage): ChatEvent | null {
  let d: Record<string, unknown>
  try {
    d = JSON.parse(m.data) as Record<string, unknown>
  } catch {
    return null
  }
  switch (m.event) {
    case 'text': return { type: 'text', t: String(d.t ?? '') }
    case 'tool': return { type: 'tool', name: String(d.name ?? ''), label: String(d.label ?? '') }
    case 'proposal': return { type: 'proposal', proposal: d as unknown as Extract<ChatEvent, { type: 'proposal' }>['proposal'] }
    case 'done': return { type: 'done', usage: d as unknown as Extract<ChatEvent, { type: 'done' }>['usage'] }
    case 'error': return { type: 'error', message: String(d.message ?? 'AI 챗봇 오류') }
    default: return null
  }
}
```

`web/src/ai/api.ts`:
```ts
import { ApiError, apiErrorOf, apiJson, apiSend, csrfToken } from '../api/client'
import { sseParser, toChatEvent } from './sse'
import type { AiSettings, AiStatus, AiTestResult, ApplyResult, ChangePage, ChatEvent, UsageReport } from './types'

export const getAiStatus = () => apiJson<AiStatus>('/api/ai/status')

/** 챗봇 요청 → SSE 를 읽어 이벤트마다 onEvent. 400·403 등은 ApiError, 끊으면(signal) AbortError */
export async function streamChat(drawingId: number, message: string, onEvent: (e: ChatEvent) => void, signal?: AbortSignal): Promise<void> {
  let r: Response
  try {
    r = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': csrfToken() },
      body: JSON.stringify({ drawingId, message }),
      signal,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ApiError('network', null, '서버에 연결할 수 없습니다.')
  }
  if (!r.ok || !r.body) {
    const body = (await r.json().catch(() => null)) as { detail?: string } | null
    throw apiErrorOf(r.status, body?.detail)
  }
  const reader = r.body.getReader()
  const dec = new TextDecoder()
  const p = sseParser((m) => {
    const ev = toChatEvent(m)
    if (ev) onEvent(ev)
  })
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    p.push(dec.decode(value, { stream: true }))
  }
  p.push(dec.decode())
  p.end()
}

export const resetChat = (drawingId: number) => apiSend<void>('POST', '/api/ai/chat/reset', { drawingId })
export const applyProposal = (id: string) => apiSend<ApplyResult>('POST', `/api/ai/changes/${id}/apply`)
export const discardProposal = (id: string) => apiSend<void>('POST', `/api/ai/changes/${id}/discard`)
export const revertBatch = (batchId: string) => apiSend<{ batchId: string; reverted: number }>('POST', `/api/changes/${batchId}/revert`)

// 관리자
export const getAiSettings = () => apiJson<AiSettings>('/api/admin/ai')
export const saveAiSettings = (patch: Partial<Pick<AiSettings, 'model' | 'monthlyLimitUsd' | 'enabled'>>) => apiSend<AiSettings>('PUT', '/api/admin/ai', patch)
export const setAiKey = (apiKey: string) => apiSend<AiSettings>('PUT', '/api/admin/ai/key', { apiKey })
export const deleteAiKey = () => apiSend<AiSettings>('DELETE', '/api/admin/ai/key')
export const testAi = () => apiSend<AiTestResult>('POST', '/api/admin/ai/test')

export function getUsage(group: 'day' | 'user', from?: string, to?: string): Promise<UsageReport> {
  const q = new URLSearchParams({ group })
  if (from) q.set('from', from)
  if (to) q.set('to', to)
  return apiJson<UsageReport>(`/api/admin/ai/usage?${q}`)
}

export interface ChangeQuery { drawingId?: number; source?: 'USER' | 'AI'; from?: string; to?: string; page?: number }
export function getChanges(c: ChangeQuery): Promise<ChangePage> {
  const q = new URLSearchParams()
  if (c.drawingId != null) q.set('drawingId', String(c.drawingId))
  if (c.source) q.set('source', c.source)
  if (c.from) q.set('from', c.from)
  if (c.to) q.set('to', c.to)
  q.set('page', String(c.page ?? 0))
  return apiJson<ChangePage>(`/api/changes?${q}`)
}
```

- [ ] **Step 4: 대화 상태 · 훅 · 미리보기 계산**

`web/src/ai/chat.ts`:
```ts
import type { ApplyResult, ChatEvent, ChatUsage, Proposal, ProposalItem } from './types'

export interface ToolLine { name: string; label: string }
export interface UserMsg { id: number; role: 'user'; text: string }
export interface AiMsg { id: number; role: 'ai'; text: string; tools: ToolLine[]; error: string | null; done: boolean; usage: ChatUsage | null }
export type Msg = UserMsg | AiMsg
export type ProposalStatus = 'open' | 'applying' | 'applied' | 'reverting' | 'reverted'
export interface ProposalState { proposal: Proposal; status: ProposalStatus; result: ApplyResult | null; error: string | null }
export interface ChatState { msgs: Msg[]; sending: boolean; proposal: ProposalState | null; nextId: number }
export type ChatAction =
  | { type: 'send'; text: string }
  | { type: 'event'; ev: ChatEvent }
  | { type: 'end' }
  | { type: 'fail'; message: string }
  | { type: 'applying' }
  | { type: 'applied'; result: ApplyResult }
  | { type: 'discarded' }
  | { type: 'reverting' }
  | { type: 'reverted' }
  | { type: 'proposalError'; message: string }
  | { type: 'reset' }

export const initialChat = (): ChatState => ({ msgs: [], sending: false, proposal: null, nextId: 1 })

/** 마지막 AI 말풍선 고치기 */
function onAi(s: ChatState, f: (m: AiMsg) => AiMsg): ChatState {
  const i = s.msgs.length - 1
  const m = s.msgs[i]
  if (!m || m.role !== 'ai') return s
  const msgs = s.msgs.slice()
  msgs[i] = f(m)
  return { ...s, msgs }
}

export function chatReducer(s: ChatState, a: ChatAction): ChatState {
  switch (a.type) {
    case 'send':
      return {
        ...s,
        sending: true,
        nextId: s.nextId + 2,
        msgs: [...s.msgs, { id: s.nextId, role: 'user', text: a.text }, { id: s.nextId + 1, role: 'ai', text: '', tools: [], error: null, done: false, usage: null }],
      }
    case 'event': {
      const ev = a.ev
      if (ev.type === 'text') return onAi(s, (m) => ({ ...m, text: m.text + ev.t }))
      if (ev.type === 'tool') return onAi(s, (m) => ({ ...m, tools: [...m.tools, { name: ev.name, label: ev.label }] }))
      if (ev.type === 'proposal')
        return { ...s, proposal: ev.proposal.items.length === 0 ? null : { proposal: ev.proposal, status: 'open', result: null, error: null } }
      if (ev.type === 'done') return { ...onAi(s, (m) => ({ ...m, done: true, usage: ev.usage })), sending: false }
      return { ...onAi(s, (m) => ({ ...m, done: true, error: ev.message })), sending: false }
    }
    case 'end':
      if (!s.sending) return s
      return { ...onAi(s, (m) => ({ ...m, done: true, error: m.error ?? '응답이 중간에 끊겼습니다' })), sending: false }
    case 'fail':
      return { ...onAi(s, (m) => ({ ...m, done: true, error: a.message })), sending: false }
    case 'applying':
      return s.proposal ? { ...s, proposal: { ...s.proposal, status: 'applying', error: null } } : s
    case 'applied':
      return s.proposal ? { ...s, proposal: { ...s.proposal, status: 'applied', result: a.result, error: null } } : s
    case 'discarded':
      return { ...s, proposal: null }
    case 'reverting':
      return s.proposal ? { ...s, proposal: { ...s.proposal, status: 'reverting', error: null } } : s
    case 'reverted':
      return s.proposal ? { ...s, proposal: { ...s.proposal, status: 'reverted', error: null } } : s
    case 'proposalError': {
      if (!s.proposal) return s
      const back = s.proposal.status === 'reverting' ? 'applied' : s.proposal.status === 'applying' ? 'open' : s.proposal.status
      return { ...s, proposal: { ...s.proposal, status: back, error: a.message } }
    }
    case 'reset':
      return initialChat()
  }
}

const NONE: ProposalItem[] = [] // 같은 빈 목록 (미리보기 효과가 매번 다시 돌지 않게)

/** 3D 미리보기를 보일 항목 (제안 카드가 열려 있거나 적용 중일 때만) */
export function previewItems(s: ChatState): ProposalItem[] {
  const p = s.proposal
  return p && (p.status === 'open' || p.status === 'applying') ? p.proposal.items : NONE
}
```

`web/src/ai/useChat.ts`:
```ts
import { useCallback, useEffect, useReducer, useRef } from 'react'
import { applyProposal, discardProposal, resetChat, revertBatch, streamChat } from './api'
import { chatReducer, initialChat, type ChatState } from './chat'

export interface Chat {
  state: ChatState
  send(text: string): void
  apply(): void
  discard(): void
  revert(): void
  newChat(): void
}

/** 도면 하나의 AI 대화. 도면이 바뀌거나 화면을 떠나면 진행 중 요청을 끊고 비움 (서버 대화도) */
export function useChat(drawingId: number | null, onApplied: () => void): Chat {
  const [state, dispatch] = useReducer(chatReducer, undefined, initialChat)
  const stateRef = useRef(state)
  const busy = useRef(false)
  const abort = useRef<AbortController | null>(null)
  const appliedCb = useRef(onApplied)
  useEffect(() => {
    stateRef.current = state
    appliedCb.current = onApplied
  })
  useEffect(
    () => () => {
      abort.current?.abort()
      abort.current = null
      busy.current = false
      dispatch({ type: 'reset' })
      if (drawingId != null) void resetChat(drawingId).catch(() => {})
    },
    [drawingId],
  )

  const send = useCallback(
    (text: string) => {
      const t = text.trim()
      if (drawingId == null || !t || busy.current) return
      busy.current = true
      dispatch({ type: 'send', text: t })
      const ac = new AbortController()
      abort.current = ac
      streamChat(drawingId, t, (ev) => !ac.signal.aborted && dispatch({ type: 'event', ev }), ac.signal)
        .then(() => !ac.signal.aborted && dispatch({ type: 'end' }))
        .catch((e: Error) => !ac.signal.aborted && dispatch({ type: 'fail', message: e.message }))
        .finally(() => {
          if (abort.current === ac) busy.current = false
        })
    },
    [drawingId],
  )

  const apply = useCallback(() => {
    const p = stateRef.current.proposal
    if (!p || p.status !== 'open') return
    dispatch({ type: 'applying' })
    applyProposal(p.proposal.id)
      .then((result) => {
        dispatch({ type: 'applied', result })
        appliedCb.current()
      })
      .catch((e: Error) => dispatch({ type: 'proposalError', message: e.message }))
  }, [])

  const discard = useCallback(() => {
    const p = stateRef.current.proposal
    if (!p || p.status !== 'open') return
    discardProposal(p.proposal.id)
      .then(() => dispatch({ type: 'discarded' }))
      .catch((e: Error) => dispatch({ type: 'proposalError', message: e.message }))
  }, [])

  const revert = useCallback(() => {
    const p = stateRef.current.proposal
    if (!p || p.status !== 'applied' || !p.result) return
    dispatch({ type: 'reverting' })
    revertBatch(p.result.batchId)
      .then(() => {
        dispatch({ type: 'reverted' })
        appliedCb.current()
      })
      .catch((e: Error) => dispatch({ type: 'proposalError', message: e.message }))
  }, [])

  const newChat = useCallback(() => {
    abort.current?.abort()
    abort.current = null
    busy.current = false
    dispatch({ type: 'reset' })
    if (drawingId != null) void resetChat(drawingId).catch(() => {})
  }, [drawingId])

  return { state, send, apply, discard, revert, newChat }
}
```

`web/src/ai/preview.ts`:
```ts
import type { Pt } from '../drawing/plan/types'
import type { PartitionSnap, PlacementSnap, ProposalItem } from './types'

export interface Size { sizeX: number; sizeY: number; sizeZ: number }
export interface Pose { x: number; y: number; rot: number }
/** 객체 유령: move(옮김·회전·변경 — 파랑, 원래 자리 점선) · add(초록) · delete(빨강) */
export interface GhostObject { seq: number; kind: 'move' | 'add' | 'delete'; at: Pose; from: Pose | null; size: Size }
export interface GhostWall { seq: number; kind: 'add' | 'delete'; a: Pt; b: Pt; h: number; t: number }
export interface Preview { objects: GhostObject[]; walls: GhostWall[] }

const pose = (p: PlacementSnap): Pose => ({ x: p.x, y: p.y, rot: p.rot })

/** 제안 항목 → 3D 유령 (이름만 바꿈·공정·구역 이름은 유령 없음) */
export function previewOf(items: ProposalItem[], sizeOf: (modelId: number | null | undefined) => Size): Preview {
  const objects: GhostObject[] = []
  const walls: GhostWall[] = []
  for (const it of items) {
    const b = it.before as PlacementSnap | null, a = it.after as PlacementSnap | null
    switch (it.kind) {
      case 'placement.move':
      case 'placement.rotate':
      case 'placement.update':
        if (a && b) objects.push({ seq: it.seq, kind: 'move', at: pose(a), from: pose(b), size: sizeOf(a.modelId) })
        break
      case 'placement.add':
        if (a) objects.push({ seq: it.seq, kind: 'add', at: pose(a), from: null, size: sizeOf(a.modelId) })
        break
      case 'placement.delete':
        if (b) objects.push({ seq: it.seq, kind: 'delete', at: pose(b), from: null, size: sizeOf(b.modelId) })
        break
      case 'plan.partition.add':
      case 'plan.partition.delete': {
        const w = (it.kind === 'plan.partition.add' ? it.after : it.before) as PartitionSnap | null
        if (w && w.pts.length >= 2)
          walls.push({ seq: it.seq, kind: it.kind === 'plan.partition.add' ? 'add' : 'delete', a: w.pts[0], b: w.pts[w.pts.length - 1], h: w.h, t: w.t })
        break
      }
    }
  }
  return { objects, walls }
}

/** 항목을 눌렀을 때 카메라가 갈 자리 (없으면 null) */
export function focusOf(it: ProposalItem): { x: number; y: number } | null {
  if (it.kind.startsWith('placement.')) {
    const p = (it.after ?? it.before) as PlacementSnap | null
    return p ? { x: p.x, y: p.y } : null
  }
  if (it.kind === 'plan.partition.add' || it.kind === 'plan.partition.delete') {
    const w = (it.after ?? it.before) as PartitionSnap | null
    if (!w || w.pts.length < 2) return null
    const a = w.pts[0], b = w.pts[w.pts.length - 1]
    return { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 }
  }
  return null
}
```

- [ ] **Step 5: 3D 미리보기 레이어**

`web/src/scene/previewLayer.ts`:
```ts
import * as THREE from 'three'
import type { GhostObject, GhostWall, Preview } from '../ai/preview'
import { planToLocal } from './coords'

export const PREVIEW_COLOR = { move: 0x3b82f6, add: 0x22c55e, delete: 0xef4444, wallAdd: 0xf97316, wallDelete: 0xef4444 }
const OPACITY = 0.35
const OPACITY_HI = 0.65
const DELETE_PAD = 1.06 // 삭제 덮개는 원래보다 조금 크게
const noRaycast = () => {}
const rad = (deg: number) => (deg * Math.PI) / 180

/** AI 제안 3D 미리보기 (반투명 유령 · 원래 자리 점선 · 가벽). 고르기(raycast) 대상 아님 */
export class PreviewLayer {
  private parent: THREE.Group
  private bounds = { w: 0, h: 0 }
  private preview: Preview | null = null
  private hi: number | null = null
  private parts: THREE.Object3D[] = []

  constructor(parent: THREE.Group) {
    this.parent = parent
  }

  setBounds(b: { w: number; h: number }): void {
    this.bounds = { w: b.w, h: b.h }
    this.build()
  }

  set(p: Preview | null): void {
    this.preview = p
    this.build()
  }

  highlight(seq: number | null): void {
    this.hi = seq
    for (const o of this.parts) {
      const m = o as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
      if (m.isMesh) m.material.opacity = o.userData.seq === seq ? OPACITY_HI : o.userData.base
    }
  }

  dispose(): void {
    this.clear()
  }

  private build() {
    this.clear()
    if (!this.preview) return
    for (const g of this.preview.objects) this.object(g)
    for (const w of this.preview.walls) this.wall(w)
    this.highlight(this.hi)
  }

  private mesh(geo: THREE.BufferGeometry, color: number, seq: number, kind: string) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: OPACITY, depthWrite: false, toneMapped: false })
    const m = new THREE.Mesh(geo, mat)
    m.userData = { seq, kind, base: OPACITY }
    m.renderOrder = 8
    m.raycast = noRaycast
    this.add(m)
    return m
  }

  private object(g: GhostObject) {
    const k = g.kind === 'delete' ? DELETE_PAD : 1
    const { sizeX, sizeY, sizeZ } = g.size
    const m = this.mesh(new THREE.BoxGeometry(sizeX * k, sizeZ * k, sizeY * k), PREVIEW_COLOR[g.kind], g.seq, g.kind)
    const [x, z] = planToLocal(g.at.x, g.at.y, this.bounds)
    m.position.set(x, (sizeZ * k) / 2, z)
    m.rotation.y = rad(g.at.rot)
    if (g.from) {
      // 원래 자리: 바닥 위 점선 사각형
      const hx = sizeX / 2, hz = sizeY / 2, y = 0.05
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-hx, y, -hz), new THREE.Vector3(hx, y, -hz), new THREE.Vector3(hx, y, hz), new THREE.Vector3(-hx, y, hz), new THREE.Vector3(-hx, y, -hz),
      ])
      const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: PREVIEW_COLOR.move, dashSize: 0.4, gapSize: 0.25, depthTest: false, toneMapped: false }))
      line.computeLineDistances()
      const [fx, fz] = planToLocal(g.from.x, g.from.y, this.bounds)
      line.position.set(fx, 0, fz)
      line.rotation.y = rad(g.from.rot)
      line.userData = { seq: g.seq, kind: 'from' }
      line.renderOrder = 8
      line.raycast = noRaycast
      this.add(line)
    }
  }

  private wall(w: GhostWall) {
    const [ax, ay] = w.a, [bx, by] = w.b
    const len = Math.hypot(bx - ax, by - ay)
    const m = this.mesh(new THREE.BoxGeometry(len, w.h, w.t), w.kind === 'add' ? PREVIEW_COLOR.wallAdd : PREVIEW_COLOR.wallDelete, w.seq, `wall-${w.kind}`)
    const [x, z] = planToLocal((ax + bx) / 2, (ay + by) / 2, this.bounds)
    m.position.set(x, w.h / 2, z)
    m.rotation.y = Math.atan2(by - ay, bx - ax)
  }

  private add(o: THREE.Object3D) {
    this.parts.push(o)
    this.parent.add(o)
  }

  private clear() {
    for (const o of this.parts) {
      this.parent.remove(o)
      const m = o as THREE.Mesh
      m.geometry?.dispose()
      ;(m.material as THREE.Material | undefined)?.dispose()
    }
    this.parts = []
  }
}
```

- [ ] **Step 6: FactoryScene 에 미리보기 연결**

`web/src/scene/FactoryScene.ts`:
1. import 추가: `import type { Preview } from '../ai/preview'`, `import { PreviewLayer } from './previewLayer'`
2. `WalkHost` 인터페이스 아래에:
```ts
/** AI 제안 3D 미리보기 (챗봇 패널이 부름) */
export interface PreviewHost {
  setPreview(p: Preview | null): void
  highlightPreview(seq: number | null): void
  focusPoint(x: number, y: number): void
}
```
3. `export type SceneHost = PickSource & ObjectHost & DashHost & WalkHost` → `export type SceneHost = PickSource & ObjectHost & DashHost & WalkHost & PreviewHost`, 클래스 선언에 `PreviewHost` 추가 (`implements PickSource, ObjectHost, DashHost, WalkHost, PreviewHost`).
4. 필드: `private ringGroup …` 아래에
```ts
  private previewGroup = new THREE.Group() // AI 제안 미리보기 (root 아래)
  private preview: PreviewLayer
```
5. 생성자: `this.root.add(this.overlay, this.objects, this.ringGroup)` → `this.root.add(this.overlay, this.objects, this.ringGroup, this.previewGroup)`, 그리고 `this.rings = new RingLayer(this.ringGroup)` 다음 줄에 `this.preview = new PreviewLayer(this.previewGroup)`.
6. `setPlan`: `if (!plan) { … this.rings.setRings([]) … }` 블록 안 `this.rings.setRings([])` 다음에 `this.preview.set(null)`, 그리고 `this.rings.setBounds(plan.bounds)` 다음에 `this.preview.setBounds(plan.bounds)`.
7. `setRings` 메서드 아래에:
```ts
  setPreview(p: Preview | null): void {
    this.preview.set(p)
  }

  highlightPreview(seq: number | null): void {
    this.preview.highlight(seq)
  }

  /** plan 좌표 한 점으로 카메라 이동 (제안 항목 클릭) */
  focusPoint(x: number, y: number): void {
    if (this.plan) this.nav.focusOn(this.worldOfPlan(x, y, 0), 12)
  }
```
8. `dispose()`: `this.rings.dispose()` 다음에 `this.preview.dispose()`.

- [ ] **Step 7: 테스트 통과 · 빌드 확인**

Run: `cd web && npx vitest run src/ai src/scene/previewLayer.test.ts`
Expected: PASS (sse 3 · chat 4 · preview 3 · previewLayer 2), 경고 없음

Run: `cd web && npm run build && ./node_modules/.bin/oxlint`
Expected: 빌드 성공, lint 0 경고 (기존 테스트의 가짜 SceneHost 는 `Partial`/캐스팅이라 타입 오류 없음 — 오류가 나면 그 가짜에 `setPreview: vi.fn(), highlightPreview: vi.fn(), focusPoint: vi.fn()` 를 더한다)

- [ ] **Step 8: Commit**

```bash
cd /c/kopens/project/Factory3D && git add web/src/ai web/src/scene/previewLayer.ts web/src/scene/previewLayer.test.ts web/src/scene/FactoryScene.ts
git commit -m "feat(web): AI 순수 모듈 — SSE 파서 · 챗 상태 · 제안 미리보기 계산 · 3D 유령 레이어(옮김 파랑·추가 초록·삭제 빨강·가벽 주황)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 화면 — AI 챗봇 패널 · 제안 카드 · 레일 버튼 · 3D 공장 화면 연결

**Files:**
- Create: `web/src/ai/{useAiStatus.ts,ChatPanel.tsx,ProposalCard.tsx}`
- Modify: `web/src/layout/IconRail.tsx`, `web/src/pages/FactoryPage.tsx`, `web/src/styles/app.css`
- Test: `web/src/ai/ChatPanel.test.tsx`, `web/src/pages/chatPage.test.tsx`

**Interfaces:**
- Consumes: Task 7 의 `useChat`·`Chat`·`previewItems`·`previewOf`·`focusOf`·`getAiStatus`·`REASON_TEXT`·`AiStatus`, `SceneHost`(`PreviewHost` 포함), `useDrawing(...).reload`, `usePlacements(...).reload`.
- Produces:
  - `useAiStatus(): AiState` (`{kind:'loading'} | {kind:'ok', status} | {kind:'error'}`) — 같은 순간 여러 곳이 불러도 요청은 하나.
  - `ChatPanel({ open, chat, onHover(seq|null), onFocus(item) })` — `<aside aria-label="AI 챗봇">`, 입력칸 `aria-label="AI 에게 보낼 요청"` (Enter 보내기, Shift+Enter 줄바꿈, 한글 조합 중 Enter 무시, 보내는 중 잠금, 2000자), 버튼 `보내기`·`새 대화`.
  - `ProposalCard` — `<section aria-label="변경 제안">`: `변경 n건`, 항목(아이콘 + label, 마우스 올리면 강조, 누르면 카메라 이동), `적용`·`취소` → `적용됨 · n건` + `되돌리기` → `되돌렸습니다`, 건너뜀 이유.
  - `RailPanel` 에 `chatOpen?: boolean`, `onChat?(): void`. 레일 `AI 챗봇` 버튼은 운전원 이상 + 상태 enabled 일 때만 켜짐, 아니면 disabled + title `AI 챗봇 — <이유>`. 다른 화면에서 누르면 localStorage `f3d:open-chat`=`1` 을 남기고 `/` 로 가서 챗봇 패널을 엶.
  - 3D 공장 화면: 옆 패널은 `objects` · `chat` · 없음 중 하나. 챗봇 패널이 열려 있고 제안이 `open`·`applying` 일 때만 3D 미리보기. 적용·되돌리기 뒤 배치·도면을 다시 불러옴.

- [ ] **Step 1: 실패 테스트 작성**

`web/src/ai/ChatPanel.test.tsx`:
```tsx
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatPanel } from './ChatPanel'
import { useChat } from './useChat'

const LABEL = 'Main Station 1 이동 (10.0, 5.0) → (12.0, 5.0)'
const ITEM = {
  seq: 1, kind: 'placement.move', target: 'Main Station 1', targetKey: 'placement:5',
  before: { id: 5, name: 'Main Station 1', modelId: null, x: 10, y: 5, rot: 0 },
  after: { id: 5, name: 'Main Station 1', modelId: null, x: 12, y: 5, rot: 0 }, label: LABEL,
}
const sse = (events: [string, unknown][]) => events.map(([e, d]) => `event:${e}\ndata:${JSON.stringify(d)}\n\n`).join('')
const STREAM = sse([
  ['text', { t: '장면을 확인하겠습니다.' }],
  ['tool', { name: 'get_scene', label: '장면 확인 중…' }],
  ['tool', { name: 'move_object', label: 'Main Station 1 이동 제안' }],
  ['text', { t: ' 제안을 만들었습니다.' }],
  ['proposal', { id: 'b1', items: [ITEM] }],
  ['done', { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.01 }],
])
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
type Call = { url: string; method: string; body: unknown }

function setup(chatResponse: () => Response = () => new Response(STREAM, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })) {
  const calls: Call[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null })
    if (url === '/api/ai/chat') return chatResponse()
    if (url.endsWith('/apply')) return json(200, { batchId: 'b1', drawingId: 1, applied: 1, skipped: [] })
    if (url.endsWith('/revert')) return json(200, { batchId: 'b1', reverted: 1 })
    return new Response(null, { status: 204 })
  }))
  const applied = vi.fn(), hover = vi.fn(), focus = vi.fn()
  function H() {
    const chat = useChat(1, applied)
    return <ChatPanel open chat={chat} onHover={hover} onFocus={focus} />
  }
  render(<H />)
  return { calls, applied, hover, focus }
}

function type(text: string, opts: { shiftKey?: boolean } = {}) {
  const box = screen.getByLabelText('AI 에게 보낼 요청')
  fireEvent.change(box, { target: { value: text } })
  fireEvent.keyDown(box, { key: 'Enter', ...opts })
  return box
}

describe('AI 챗봇 패널', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('보내기 → 글자·도구 줄·제안 카드 → 항목 강조·카메라 → 적용 → 되돌리기', async () => {
    const { calls, applied, hover, focus } = setup()
    expect(screen.getByText('3D 공장을 어떻게 바꿀지 말해 주세요.')).toBeInTheDocument()
    type('Main Station 1 을 오른쪽으로 2m 옮겨줘')
    expect(await screen.findByText('장면을 확인하겠습니다. 제안을 만들었습니다.')).toBeInTheDocument()
    expect(screen.getByText('Main Station 1 을 오른쪽으로 2m 옮겨줘')).toHaveClass('chat-msg', 'user')
    expect(screen.getByText('장면 확인 중…')).toBeInTheDocument()
    expect(screen.getByText('Main Station 1 이동 제안')).toBeInTheDocument()
    expect(calls.find((c) => c.url === '/api/ai/chat')?.body).toEqual({ drawingId: 1, message: 'Main Station 1 을 오른쪽으로 2m 옮겨줘' })
    expect((screen.getByLabelText('AI 에게 보낼 요청') as HTMLTextAreaElement).value).toBe('')

    const card = screen.getByRole('region', { name: '변경 제안' })
    expect(within(card).getByText('변경 1건')).toBeInTheDocument()
    const row = within(card).getByRole('button', { name: LABEL })
    fireEvent.mouseEnter(row.closest('li')!)
    expect(hover).toHaveBeenLastCalledWith(1)
    fireEvent.mouseLeave(row.closest('li')!)
    expect(hover).toHaveBeenLastCalledWith(null)
    fireEvent.click(row)
    expect(focus).toHaveBeenCalledWith(expect.objectContaining({ seq: 1 }))

    fireEvent.click(within(card).getByRole('button', { name: '적용' }))
    expect(await within(card).findByText('적용됨 · 1건')).toBeInTheDocument()
    expect(applied).toHaveBeenCalledTimes(1)
    expect(calls.some((c) => c.url === '/api/ai/changes/b1/apply' && c.method === 'POST')).toBe(true)
    fireEvent.click(within(card).getByRole('button', { name: '되돌리기' }))
    expect(await within(card).findByText('되돌렸습니다')).toBeInTheDocument()
    expect(calls.some((c) => c.url === '/api/changes/b1/revert' && c.method === 'POST')).toBe(true)
    expect(applied).toHaveBeenCalledTimes(2)
  })

  it('보내는 중 잠금 · Shift+Enter 는 줄바꿈 · 서버 오류 안내', async () => {
    let ctrl!: ReadableStreamDefaultController<Uint8Array>
    const stream = new ReadableStream<Uint8Array>({ start: (c) => { ctrl = c } })
    const { calls } = setup(() => new Response(stream, { status: 200 }))
    type('줄바꿈만', { shiftKey: true })
    expect(calls.filter((c) => c.url === '/api/ai/chat')).toHaveLength(0)
    const box = type('한도 확인')
    expect(await screen.findByText('답을 쓰는 중…')).toBeInTheDocument()
    expect(box).toBeDisabled()
    expect(screen.getByRole('button', { name: '보내기' })).toBeDisabled()
    ctrl.enqueue(new TextEncoder().encode(sse([['error', { message: '이번 달 AI 사용 한도를 넘었습니다' }]])))
    ctrl.close()
    expect(await screen.findByRole('alert')).toHaveTextContent('이번 달 AI 사용 한도를 넘었습니다')
    expect(box).not.toBeDisabled()
  })

  it('입력 오류(400)는 말풍선에 안내', async () => {
    setup(() => json(400, { detail: '요청은 1~2000자로 입력하세요.' }))
    type('가')
    expect(await screen.findByRole('alert')).toHaveTextContent('요청은 1~2000자로 입력하세요.')
  })

  it('취소는 묶음을 버리고 카드를 닫음, 새 대화는 모두 비움', async () => {
    const { calls } = setup()
    type('옮겨줘')
    const card = await screen.findByRole('region', { name: '변경 제안' })
    fireEvent.click(within(card).getByRole('button', { name: '취소' }))
    await screen.findByText('장면을 확인하겠습니다. 제안을 만들었습니다.')
    expect(await screen.findByText('옮겨줘')).toBeInTheDocument()
    expect(calls.some((c) => c.url === '/api/ai/changes/b1/discard')).toBe(true)
    await vi.waitFor(() => expect(screen.queryByRole('region', { name: '변경 제안' })).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: '새 대화' }))
    expect(screen.queryByText('옮겨줘')).toBeNull()
    expect(calls.some((c) => c.url === '/api/ai/chat/reset' && (c.body as { drawingId: number }).drawingId === 1)).toBe(true)
  })
})
```

`web/src/pages/chatPage.test.tsx`:
```tsx
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useEffect } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../api/types'
import { StaticAuth } from '../auth/auth'
import { routes } from '../routes'

const fake = vi.hoisted(() => ({
  setObjects: vi.fn(), setSelected: vi.fn(), setEditing: vi.fn(), setPlacing: vi.fn(), setObjectEvents: vi.fn(), focusObject: vi.fn(),
  setGroundClick: vi.fn(), setMarkers: vi.fn(), setPreview: vi.fn(), highlightPreview: vi.fn(), focusPoint: vi.fn(),
}))
function FakeView(p: { plan: unknown; onScene?: (s: unknown) => void }) {
  const { onScene } = p
  useEffect(() => {
    onScene?.(fake)
    return () => onScene?.(null)
  }, [onScene])
  return <div data-testid="factory-view">{p.plan ? 'plan' : 'no plan'}</div>
}
vi.mock('../scene/FactoryView', () => ({ FactoryView: FakeView }))

const OPERATOR: User = { id: 1, username: 'kim', displayName: '김운전', role: 'OPERATOR', enabled: true, mustChangePassword: false, locked: false, createdAt: '' }
const VIEWER: User = { ...OPERATOR, id: 2, username: 'lee', role: 'VIEWER' }
const PLAN = { format: 1, unit: 'm', scale: 1, rotQ: 0, flip: 1, bounds: { w: 40, h: 20 }, layers: [], lines: [], texts: [], walls: [], partitions: [], columns: [], zones: [], objectHints: [], warnings: { unsupported: {}, unitGuessed: false } }
const DRAWING = { id: 1, name: '나셀 공장', sourceType: 'dxf', version: 1, createdBy: 'system', updatedAt: '', width: 40, height: 20, placements: 1 }
const MODELS = [{ id: 7, name: 'Main Station', category: 'equip', sourceExt: 'glb', sizeX: 4, sizeY: 3, sizeZ: 2.5, aliases: [], version: 1, usedDrawings: 1, updatedAt: '' }]
const PLACEMENTS = [{ id: 5, modelId: 7, name: 'Main Station 1', x: 10, y: 5, rot: 0 }]
const ITEM = {
  seq: 1, kind: 'placement.move', target: 'Main Station 1', targetKey: 'placement:5',
  before: { id: 5, name: 'Main Station 1', modelId: 7, x: 10, y: 5, rot: 0 }, after: { id: 5, name: 'Main Station 1', modelId: 7, x: 12, y: 5, rot: 0 },
  label: 'Main Station 1 이동 (10.0, 5.0) → (12.0, 5.0)',
}
const STREAM = `event:proposal\ndata:${JSON.stringify({ id: 'b1', items: [ITEM] })}\n\nevent:done\ndata:{"inputTokens":0,"outputTokens":0,"cacheReadTokens":0,"cacheWriteTokens":0,"costUsd":0}\n\n`
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function show(user: User, status: unknown = { enabled: true, reason: null }) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/ai/status') return json(200, status)
    if (url === '/api/drawings') return json(200, [DRAWING])
    if (url === '/api/drawings/1') return json(200, { ...DRAWING, createdAt: '', plan: PLAN, layerRules: {} })
    if (url === '/api/models') return json(200, MODELS)
    if (url === '/api/drawings/1/placements') return json(200, PLACEMENTS)
    if (url === '/api/ai/chat') return new Response(STREAM, { status: 200 })
    return new Response(null, { status: 204 })
  }))
  render(
    <StaticAuth user={user}>
      <RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/'] })} />
    </StaticAuth>,
  )
}

describe('3D 공장 화면 · AI 챗봇', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('레일 AI 챗봇 → 챗봇 패널(객체 패널은 접힘), 다시 누르면 닫힘', async () => {
    show(OPERATOR)
    await screen.findByText('plan')
    const btn = screen.getByRole('button', { name: 'AI 챗봇' })
    await waitFor(() => expect(btn).toBeEnabled())
    expect(screen.getByRole('complementary', { name: '객체 패널' })).toHaveAttribute('aria-hidden', 'false')
    fireEvent.click(btn)
    expect(screen.getByRole('complementary', { name: 'AI 챗봇' })).toHaveAttribute('aria-hidden', 'false')
    expect(screen.getByRole('complementary', { name: '객체 패널', hidden: true })).toHaveAttribute('aria-hidden', 'true')
    expect(btn).toHaveAttribute('aria-current', 'page')
    fireEvent.click(btn)
    expect(screen.getByRole('complementary', { name: 'AI 챗봇', hidden: true })).toHaveAttribute('aria-hidden', 'true')
  })

  it('키가 없으면 버튼 꺼짐 + 이유', async () => {
    show(OPERATOR, { enabled: false, reason: 'no-key' })
    const btn = screen.getByRole('button', { name: 'AI 챗봇' })
    await waitFor(() => expect(btn).toHaveAttribute('title', 'AI 챗봇 — Claude API 키가 등록되지 않았습니다 (관리자 › Claude API 관리)'))
    expect(btn).toBeDisabled()
  })

  it('조회 권한은 꺼짐', async () => {
    show(VIEWER)
    const btn = screen.getByRole('button', { name: 'AI 챗봇' })
    await waitFor(() => expect(btn).toHaveAttribute('title', 'AI 챗봇 — 운전원 이상만 쓸 수 있습니다'))
    expect(btn).toBeDisabled()
  })

  it('제안이 오면 3D 유령 미리보기, 항목 클릭은 카메라 이동, 취소하면 미리보기 끝', async () => {
    localStorage.setItem('f3d:open-chat', '1') // 다른 화면에서 레일을 누르고 온 것
    show(OPERATOR)
    const panel = await screen.findByRole('complementary', { name: 'AI 챗봇' })
    await waitFor(() => expect(panel).toHaveAttribute('aria-hidden', 'false'))
    expect(localStorage.getItem('f3d:open-chat')).toBeNull()
    fireEvent.change(within(panel).getByLabelText('AI 에게 보낼 요청'), { target: { value: '옮겨줘' } })
    fireEvent.click(within(panel).getByRole('button', { name: '보내기' }))
    const card = await within(panel).findByRole('region', { name: '변경 제안' })
    await waitFor(() => expect(fake.setPreview).toHaveBeenLastCalledWith(expect.objectContaining({
      objects: [expect.objectContaining({ kind: 'move', at: { x: 12, y: 5, rot: 0 }, size: expect.objectContaining({ sizeX: 4 }) })],
    })))
    fireEvent.click(within(card).getByRole('button', { name: ITEM.label }))
    expect(fake.focusPoint).toHaveBeenCalledWith(12, 5)
    fireEvent.click(within(card).getByRole('button', { name: '취소' }))
    await waitFor(() => expect(fake.setPreview).toHaveBeenLastCalledWith(null))
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd web && npx vitest run src/ai/ChatPanel.test.tsx src/pages/chatPage.test.tsx`
Expected: FAIL — `ChatPanel` 없음, 레일 버튼이 '준비 중'

- [ ] **Step 3: 상태 훅 · 제안 카드 · 챗봇 패널**

`web/src/ai/useAiStatus.ts`:
```ts
import { useEffect, useState } from 'react'
import { getAiStatus } from './api'
import type { AiStatus } from './types'

export type AiState = { kind: 'loading' } | { kind: 'ok'; status: AiStatus } | { kind: 'error' }

let pending: Promise<AiStatus> | null = null

/** 같은 순간(레일·화면이 함께 그려질 때)의 요청은 하나로 */
function load(): Promise<AiStatus> {
  if (!pending) pending = getAiStatus().finally(() => (pending = null))
  return pending
}

/** 챗봇 사용 가능 여부 (레일 버튼·3D 공장 화면) */
export function useAiStatus(): AiState {
  const [state, setState] = useState<AiState>({ kind: 'loading' })
  useEffect(() => {
    let cancel = false
    load()
      .then((s) => !cancel && setState(typeof s?.enabled === 'boolean' ? { kind: 'ok', status: s } : { kind: 'error' }))
      .catch(() => !cancel && setState({ kind: 'error' }))
    return () => {
      cancel = true
    }
  }, [])
  return state
}
```

`web/src/ai/ProposalCard.tsx`:
```tsx
import { BrickWall, Check, LoaderCircle, MapPin, MoveRight, Pencil, RotateCw, SlidersHorizontal, SquarePlus, Trash2, Type, Undo2, type LucideIcon } from 'lucide-react'
import type { ProposalState } from './chat'
import type { ChangeKind, ProposalItem } from './types'

const ICON: Record<ChangeKind, LucideIcon> = {
  'placement.move': MoveRight,
  'placement.rotate': RotateCw,
  'placement.rename': Type,
  'placement.update': Pencil,
  'placement.add': SquarePlus,
  'placement.delete': Trash2,
  'station.update': SlidersHorizontal,
  'plan.partition.add': BrickWall,
  'plan.partition.delete': BrickWall,
  'plan.zone.rename': MapPin,
}

interface Props {
  state: ProposalState
  onApply(): void
  onDiscard(): void
  onRevert(): void
  onHover(seq: number | null): void
  onFocus(item: ProposalItem): void
}

/** 변경 제안 카드: 항목(마우스 = 3D 강조, 클릭 = 카메라 이동) · 적용/취소 · 적용됨/되돌리기 */
export function ProposalCard({ state, onApply, onDiscard, onRevert, onHover, onFocus }: Props) {
  const { proposal, status, result, error } = state
  const skipped = new Map((result?.skipped ?? []).map((s) => [s.seq, s.reason]))
  return (
    <section className={`proposal-card ${status}`} aria-label="변경 제안">
      <header>
        <strong>변경 {proposal.items.length}건</strong>
        {(status === 'open' || status === 'applying') && <span>3D 에 미리 보는 중 · 아직 저장 안 됨</span>}
      </header>
      <ul>
        {proposal.items.map((it) => {
          const Icon = ICON[it.kind] ?? Pencil
          const why = skipped.get(it.seq)
          return (
            <li key={it.seq} className={why ? 'skipped' : undefined} onMouseEnter={() => onHover(it.seq)} onMouseLeave={() => onHover(null)}>
              <button className="proposal-item" onClick={() => onFocus(it)} title="3D 에서 보기">
                <Icon size={14} aria-hidden />
                <span>{it.label}</span>
              </button>
              {why && <p className="proposal-skip">건너뜀: {why}</p>}
            </li>
          )
        })}
      </ul>
      {error && <p className="chat-error" role="alert">{error}</p>}
      <footer>
        {status === 'open' && (
          <>
            <button className="chat-btn primary" onClick={onApply}>
              <Check size={14} aria-hidden /> 적용
            </button>
            <button className="chat-btn" onClick={onDiscard}>
              취소
            </button>
          </>
        )}
        {status === 'applying' && (
          <span className="proposal-state">
            <LoaderCircle size={14} className="spin" aria-hidden /> 적용 중…
          </span>
        )}
        {(status === 'applied' || status === 'reverting') && (
          <>
            <span className="proposal-state ok">
              적용됨 · {result?.applied ?? 0}건{result && result.skipped.length > 0 ? ` (건너뜀 ${result.skipped.length}건)` : ''}
            </span>
            <button className="chat-btn" onClick={onRevert} disabled={status === 'reverting' || !result?.applied}>
              <Undo2 size={14} aria-hidden /> 되돌리기
            </button>
          </>
        )}
        {status === 'reverted' && <span className="proposal-state">되돌렸습니다</span>}
      </footer>
    </section>
  )
}
```

`web/src/ai/ChatPanel.tsx`:
```tsx
import { Bot, LoaderCircle, MessageSquarePlus, SendHorizontal, Wrench } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ProposalCard } from './ProposalCard'
import type { ProposalItem } from './types'
import type { Chat } from './useChat'

const EXAMPLES = ['Main Station 1 을 오른쪽으로 2m 옮겨줘', 'Hub 조립장 택타임을 25분으로 바꿔줘', '조립 구역 가운데에 가벽을 세워줘']

interface Props {
  open: boolean
  chat: Chat
  onHover(seq: number | null): void
  onFocus(item: ProposalItem): void
}

/** 레일 옆 AI 챗봇 패널 (객체 패널 자리): 말풍선 · 도구 진행 줄 · 제안 카드 · 입력칸 */
export function ChatPanel({ open, chat, onHover, onFocus }: Props) {
  const { state } = chat
  const [text, setText] = useState('')
  const body = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = body.current
    if (el) el.scrollTop = el.scrollHeight
  }, [state.msgs, state.proposal])
  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (state.sending || !text.trim()) return
    chat.send(text)
    setText('')
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }
  return (
    <aside className={open ? 'side-panel chat-panel' : 'side-panel chat-panel closed'} aria-label="AI 챗봇" aria-hidden={!open}>
      <div className="side-panel-inner" inert={!open}>
        <header className="side-panel-head chat-head">
          <div>
            <strong>AI 챗봇</strong>
            <span>요청하면 변경 제안을 3D 로 미리 보여 줍니다</span>
          </div>
          <button className="chat-new" onClick={chat.newChat} title="대화와 제안을 비웁니다">
            <MessageSquarePlus size={14} aria-hidden /> 새 대화
          </button>
        </header>
        <div className="chat-body" ref={body}>
          {state.msgs.length === 0 && (
            <div className="chat-empty">
              <Bot size={28} aria-hidden />
              <p>3D 공장을 어떻게 바꿀지 말해 주세요.</p>
              <ul>
                {EXAMPLES.map((x) => (
                  <li key={x}>
                    <button className="chat-example" onClick={() => setText(x)}>
                      {x}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {state.msgs.map((m) =>
            m.role === 'user' ? (
              <p key={m.id} className="chat-msg user">
                {m.text}
              </p>
            ) : (
              <div key={m.id} className="chat-msg ai" aria-live="polite">
                {m.tools.map((t, i) => (
                  <p key={i} className="chat-tool">
                    <Wrench size={12} aria-hidden /> {t.label}
                  </p>
                ))}
                {m.text && <p className="chat-text">{m.text}</p>}
                {!m.done && !m.text && (
                  <p className="chat-wait">
                    <LoaderCircle size={14} className="spin" aria-hidden /> 답을 쓰는 중…
                  </p>
                )}
                {m.error && (
                  <p className="chat-error" role="alert">
                    {m.error}
                  </p>
                )}
              </div>
            ),
          )}
          {state.proposal && (
            <ProposalCard state={state.proposal} onApply={chat.apply} onDiscard={chat.discard} onRevert={chat.revert} onHover={onHover} onFocus={onFocus} />
          )}
        </div>
        <form className="chat-input" onSubmit={submit}>
          <textarea
            aria-label="AI 에게 보낼 요청"
            placeholder="예: Main Station 1 을 오른쪽으로 2m 옮겨줘 (Enter 보내기 · Shift+Enter 줄바꿈)"
            value={text}
            maxLength={2000}
            rows={3}
            disabled={state.sending}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
          />
          <button type="submit" aria-label="보내기" disabled={state.sending || !text.trim()}>
            {state.sending ? <LoaderCircle size={16} className="spin" aria-hidden /> : <SendHorizontal size={16} aria-hidden />}
          </button>
        </form>
      </div>
    </aside>
  )
}
```

- [ ] **Step 4: 레일 버튼**

`web/src/layout/IconRail.tsx`:
1. import 추가: `import { REASON_TEXT } from '../ai/types'`, `import { useAiStatus } from '../ai/useAiStatus'`
2. `RailPanel` 을:
```ts
/** 3D 공장 화면의 옆 패널 (객체 · AI 챗봇 — 한 번에 하나). 다른 화면에서 누르면 공장 화면으로 가서 그 패널을 엶 */
export interface RailPanel {
  objectsOpen: boolean
  onObjects(): void
  chatOpen?: boolean
  onChat?(): void
}
```
3. `MENU` 의 chat 줄을 `{ key: 'chat', label: 'AI 챗봇', icon: Bot, to: '/' },` 로, `OBJECTS_PANEL_KEY` 아래에 `export const OPEN_CHAT_KEY = 'f3d:open-chat'`.
4. 컴포넌트 본문:
```tsx
export function IconRail({ active, panel }: { active: RailKey; panel?: RailPanel }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const ai = useAiStatus()
  const current = active === 'factory' && panel?.chatOpen ? 'chat' : panel?.objectsOpen && active === 'factory' ? 'objects' : active
  // AI 챗봇: 운전원 이상 + 서버 상태 enabled 일 때만
  const chatBlock = !hasRole(user, 'OPERATOR') ? '운전원 이상만 쓸 수 있습니다'
    : ai.kind === 'loading' ? '상태 확인 중'
    : ai.kind === 'error' ? '상태를 확인하지 못했습니다'
    : !ai.status.enabled ? (ai.status.reason ? REASON_TEXT[ai.status.reason] : '쓸 수 없습니다')
    : null
  const go = ({ key, to }: Item) => {
    if (key === 'objects') {
      if (panel) return panel.onObjects()
      try {
        localStorage.setItem(OBJECTS_PANEL_KEY, '1')
      } catch {
        /* 저장 못 해도 이동 */
      }
    } else if (key === 'chat') {
      if (panel?.onChat) return panel.onChat()
      try {
        localStorage.setItem(OPEN_CHAT_KEY, '1')
      } catch {
        /* 저장 못 해도 이동 */
      }
    } else if (key === 'factory' && panel?.chatOpen) return panel.onChat?.() // 공장 화면에서 '3D 공장' = 패널 접기
    else if (key === 'factory' && panel?.objectsOpen) return panel.onObjects()
    if (to) navigate(to)
  }
  const button = (item: Item, extra = '') => {
    const { key, label, icon: Icon, to } = item
    const why = key === 'chat' ? chatBlock : !to ? '준비 중' : null
    const on = key === current
    const cls = [on ? 'active' : '', extra].filter(Boolean).join(' ') || undefined
    return (
      <button
        key={key}
        className={cls}
        aria-current={on ? 'page' : undefined}
        aria-expanded={panel && (key === 'objects' || key === 'chat') ? (key === 'objects' ? panel.objectsOpen : !!panel.chatOpen) : undefined}
        aria-label={!to ? `${label} (준비 중)` : label}
        title={why ? `${label} — ${why}` : label}
        disabled={!!why}
        onClick={() => go(item)}
      >
        <Icon size={20} strokeWidth={1.8} aria-hidden />
        <span aria-hidden>{label}</span>
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
(맨 위 주석의 "실행·AI 챗봇은 다음 단계에서 열림" 은 "실행은 다음 단계에서 열림, AI 챗봇은 운전원 이상 + Claude API 사용 가능일 때" 로 고친다.)

- [ ] **Step 5: 3D 공장 화면 연결**

`web/src/pages/FactoryPage.tsx`:
1. import 추가:
```ts
import { previewItems } from '../ai/chat'
import { ChatPanel } from '../ai/ChatPanel'
import { focusOf, previewOf, type Preview } from '../ai/preview'
import type { ProposalItem } from '../ai/types'
import { useAiStatus } from '../ai/useAiStatus'
import { useChat } from '../ai/useChat'
```
`import { OBJECTS_PANEL_KEY } from '../layout/IconRail'` → `import { OBJECTS_PANEL_KEY, OPEN_CHAT_KEY } from '../layout/IconRail'`, `import type { ObjectHost, PickSource, Quality, ViewMode } from '../scene/FactoryScene'` → `import type { ObjectHost, PickSource, PreviewHost, Quality, ViewMode } from '../scene/FactoryScene'`.
2. 파일 위 상수 옆에 `type Side = 'objects' | 'chat' | null`.
3. `const [scene, setScene] = useState<(PickSource & ObjectHost) | null>(null)` → `useState<(PickSource & ObjectHost & PreviewHost) | null>(null)`, `const { state, save } = useDrawing(drawingId)` → `const { state, save, reload: reloadDrawing } = useDrawing(drawingId)`.
4. `panelOpen` 상태와 `setPanel` 함수를 아래로 바꾼다:
```ts
  // 옆 패널: 객체 · AI 챗봇 · 없음 (하나만). 다른 화면에서 레일 'AI 챗봇' 을 누르고 왔으면 챗봇
  const [side, setSideState] = useState<Side>(() => {
    try {
      if (localStorage.getItem(OPEN_CHAT_KEY) === '1') return 'chat'
      return localStorage.getItem(OBJECTS_PANEL_KEY) !== '0' ? 'objects' : null
    } catch {
      return 'objects'
    }
  })
  useEffect(() => {
    try {
      localStorage.removeItem(OPEN_CHAT_KEY)
    } catch {
      /* 없어도 동작 */
    }
  }, [])
  const setSide = (next: Side) => {
    if (next === 'objects' || side === 'objects') {
      try {
        localStorage.setItem(OBJECTS_PANEL_KEY, next === 'objects' ? '1' : '0')
      } catch {
        /* 저장 못 해도 동작 */
      }
    }
    setSideState(next)
  }
```
5. `const placements = usePlacements(detail?.id ?? null)` 아래에:
```ts
  // AI 챗봇 (운전원 이상 + Claude API 사용 가능)
  const ai = useAiStatus()
  const canChat = canEdit && ai.kind === 'ok' && ai.status.enabled
  const chat = useChat(canChat ? (detail?.id ?? null) : null, () => {
    placements.reload()
    reloadDrawing()
  })
```
6. `const byId = useMemo(...)` 아래에 (미리보기 · 강조 · 카메라):
```ts
  const chatOn = side === 'chat' && canChat
  const previewList = chatOn ? previewItems(chat.state) : null
  const preview = useMemo<Preview | null>(
    () => (previewList && previewList.length > 0 ? previewOf(previewList, (id) => (id != null ? (byId.get(id) ?? BOX_SIZE) : BOX_SIZE)) : null),
    [previewList, byId],
  )
  const focusItem = (it: ProposalItem) => {
    const f = focusOf(it)
    if (f) scene?.focusPoint(f.x, f.y)
  }
```
7. "3D 와 맞추기" 효과들 옆에: `useEffect(() => scene?.setPreview(preview), [scene, preview])`
8. `const side = detail && …ObjectPanel…` 블록과 `const objectsOpen = …` 를 아래로 바꾸고 AppShell 에 넘긴다:
```tsx
  const objectPanel = detail && drawings.kind === 'ok' && list.length > 0 && (
    <ObjectPanel
      open={side === 'objects'}
      models={modelList}
      placements={rows}
      canEdit={canEdit}
      selectedId={selected?.id ?? null}
      placingModelId={placing?.id ?? null}
      onPickModel={pickModel}
      onSelect={selectFromList}
      onAddModel={() => setAddingModel(true)}
    />
  )
  const chatPanel = canChat && detail && (
    <ChatPanel open={chatOn} chat={chat} onHover={(seq) => scene?.highlightPreview(seq)} onFocus={focusItem} />
  )
  const objectsOpen = side === 'objects' && !!objectPanel
  const rail = {
    objectsOpen,
    onObjects: () => setSide(objectsOpen ? null : 'objects'),
    chatOpen: chatOn,
    onChat: () => setSide(chatOn ? null : 'chat'),
  }
  return (
    <AppShell active="factory" head={head} side={<>{objectPanel}{chatPanel}</>} panel={rail}>
```
(`AppShell` 의 나머지 children 은 그대로.)

- [ ] **Step 6: 스타일**

`web/src/styles/app.css` 맨 끝에 추가:
```css
/* ---------- AI 챗봇 패널 (객체 패널 자리, 어두운 바탕) ---------- */
.chat-panel, .chat-panel .side-panel-inner { width: 340px; }
.chat-panel.closed { width: 0; }
.chat-head { flex-direction: row; align-items: center; justify-content: space-between; gap: 8px; }
.chat-head > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.chat-new { flex: none; display: inline-flex; align-items: center; gap: 4px; height: 28px; padding: 0 10px; border: 1px solid var(--line-strong); border-radius: var(--kp-radius-sm); background: none; color: var(--text); font-size: var(--kp-text-13); }
.chat-new:hover { background: #ffffff0f; }
.chat-body { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; padding: 12px; }
.chat-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; margin: 24px 0; color: var(--muted); text-align: center; font-size: var(--kp-text-14); }
.chat-empty p { margin: 0; color: var(--text); }
.chat-empty ul { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; width: 100%; }
.chat-example { width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: #ffffff06; color: var(--muted); font-size: var(--kp-text-13); text-align: left; }
.chat-example:hover { color: var(--text); border-color: var(--line-strong); }
.chat-msg { margin: 0; max-width: 92%; padding: 9px 12px; border-radius: 12px; font-size: var(--kp-text-14); line-height: 1.55; white-space: pre-wrap; word-break: break-word; }
.chat-msg.user { align-self: flex-end; background: color-mix(in srgb, var(--primary) 30%, transparent); color: #fff; border-bottom-right-radius: 4px; }
.chat-msg.ai { align-self: flex-start; display: flex; flex-direction: column; gap: 6px; background: #ffffff0a; border: 1px solid var(--line); border-bottom-left-radius: 4px; }
.chat-msg.ai p { margin: 0; }
.chat-tool { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: var(--kp-text-13); }
.chat-wait { display: flex; align-items: center; gap: 6px; color: var(--muted); }
.chat-error { margin: 0; color: #fca5a5; font-size: var(--kp-text-13); }
.chat-input { flex: none; display: flex; align-items: flex-end; gap: 8px; padding: 10px 12px 12px; border-top: 1px solid var(--line); }
.chat-input textarea { flex: 1; min-height: 64px; max-height: 160px; resize: vertical; padding: 8px 10px; border: 1px solid var(--line-strong); border-radius: 8px; background: #ffffff08; color: var(--text); font: inherit; font-size: var(--kp-text-14); line-height: 1.5; }
.chat-input textarea:focus { outline: 2px solid color-mix(in srgb, var(--primary) 60%, transparent); outline-offset: 0; }
.chat-input button { flex: none; display: grid; place-items: center; width: 38px; height: 38px; border: 0; border-radius: 8px; background: var(--primary); color: #fff; }
.chat-input button:disabled, .chat-input textarea:disabled { opacity: 0.5; }
.spin { animation: f3d-spin 1s linear infinite; }
@keyframes f3d-spin { to { transform: rotate(360deg); } }

.proposal-card { display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px solid color-mix(in srgb, #3b82f6 55%, transparent); border-radius: 10px; background: color-mix(in srgb, #3b82f6 10%, transparent); }
.proposal-card.applied, .proposal-card.reverting { border-color: color-mix(in srgb, #22c55e 55%, transparent); background: color-mix(in srgb, #22c55e 8%, transparent); }
.proposal-card.reverted { border-color: var(--line-strong); background: #ffffff06; }
.proposal-card header { display: flex; flex-direction: column; gap: 2px; }
.proposal-card header strong { font-size: var(--kp-text-14); color: var(--text); }
.proposal-card header span { font-size: var(--kp-text-12); color: var(--muted); }
.proposal-card ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.proposal-item { width: 100%; display: flex; align-items: flex-start; gap: 8px; padding: 6px 8px; border: 0; border-radius: 6px; background: none; color: var(--text); font-size: var(--kp-text-13); text-align: left; }
.proposal-item:hover { background: #ffffff12; }
.proposal-item svg { flex: none; margin-top: 2px; color: #93c5fd; }
.proposal-card li.skipped .proposal-item { color: var(--muted); text-decoration: line-through; }
.proposal-skip { margin: 0 0 4px 30px; color: #fcd34d; font-size: var(--kp-text-12); }
.proposal-card footer { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.proposal-state { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: var(--kp-text-13); }
.proposal-state.ok { color: #86efac; }
.chat-btn { display: inline-flex; align-items: center; gap: 4px; height: 30px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: var(--kp-radius-sm); background: none; color: var(--text); font-size: var(--kp-text-13); }
.chat-btn:hover:not(:disabled) { background: #ffffff12; }
.chat-btn.primary { border-color: transparent; background: var(--primary); color: #fff; }
.chat-btn:disabled { opacity: 0.5; }
```

- [ ] **Step 7: 테스트 통과 확인**

Run: `cd web && npx vitest run`
Expected: 전체 PASS, 경고 없음. (기존 `layout.test.tsx`·`dashboard.test.tsx`·`walk.test.tsx` 의 fetch 가짜는 `/api/ai/status` 에 목록·404 를 돌려줌 → `useAiStatus` 가 `error` 로 처리해 버튼만 꺼짐. 이 테스트들이 `AI 챗봇 (준비 중)` 이름을 찾고 있었다면 `AI 챗봇` 으로 고친다.) jsdom 에 `Response`·`ReadableStream`·`TextEncoder` 가 없다는 오류가 나면 `test-setup.ts` 맨 위에 `import { ReadableStream } from 'node:stream/web'` 등으로 넣지 말고, 먼저 `npx vitest run src/ai/ChatPanel.test.tsx --environment jsdom` 출력으로 어떤 것이 없는지 확인한 뒤 그 하나만 `globalThis` 에 채운다.

Run: `cd web && npm run build && ./node_modules/.bin/oxlint`
Expected: 빌드 성공 · lint 0 경고

- [ ] **Step 8: Commit**

```bash
cd /c/kopens/project/Factory3D && git add web/src/ai web/src/layout/IconRail.tsx web/src/pages/FactoryPage.tsx web/src/pages/chatPage.test.tsx web/src/styles/app.css
git commit -m "feat(web): AI 챗봇 패널 — 흘러나오는 답 · 도구 진행 줄 · 제안 카드(적용·취소·되돌리기) · 3D 유령 미리보기 · 레일 버튼(권한·키 상태 안내)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 화면 — 관리자 › Claude API 관리 · 변경 이력 · AI 사용량

**Files:**
- Create: `web/src/pages/admin/{AiSettingsPage.tsx,ChangesPage.tsx,changeSummary.ts,AiUsagePage.tsx}`
- Modify: `web/src/pages/admin/AdminLayout.tsx`, `web/src/routes.tsx`, `web/src/styles/kp.css`
- Test: `web/src/pages/admin/ai-admin.test.tsx`

**Interfaces:**
- Consumes: Task 7 `ai/api.ts` (`getAiSettings`·`saveAiSettings`·`setAiKey`·`deleteAiKey`·`testAi`·`getUsage`·`getChanges`·`revertBatch`), `AI_MODELS`·`ChangeEntry`·`ChangeKind`·`UsageReport`, `Modal`, `when()` (`pages/admin/format.ts`), `apiJson('/api/drawings')`.
- Produces: 주소 `/admin/ai` · `/admin/changes` · `/admin/ai-usage`, 탭 `Claude API 관리` · `변경 이력` · `AI 사용량`. `changeSummary.ts`: `KIND_LABEL: Record<ChangeKind, string>`, `summary(kind, before, after): string`.

- [ ] **Step 1: 실패 테스트 작성**

`web/src/pages/admin/ai-admin.test.tsx`:
```tsx
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../../api/types'
import { StaticAuth } from '../../auth/auth'
import { routes } from '../../routes'
import { summary } from './changeSummary'

const ADMIN: User = { id: 1, username: 'admin', displayName: '관리자', role: 'ADMIN', enabled: true, mustChangePassword: false, locked: false, createdAt: '' }
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
type Call = { url: string; method: string; body: unknown }
const SETTINGS = { hasKey: false, keyHint: null, model: 'claude-opus-5-5', monthlyLimitUsd: 50, enabled: false, masterKey: true, updatedBy: null, updatedAt: '2026-11-13T00:00:00Z' }

function show(path: string, handler: (url: string, method: string, body: unknown) => Response | null) {
  const calls: Call[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : null
    calls.push({ url, method, body })
    return handler(url, method, body) ?? (url === '/api/ai/status' ? json(200, { enabled: false, reason: 'no-key' }) : json(200, []))
  }))
  render(
    <StaticAuth user={ADMIN}>
      <RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />
    </StaticAuth>,
  )
  return calls
}

describe('관리자 › AI', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('Claude API 관리: 키 등록 → 연결 테스트 → 모델·한도·사용 저장', async () => {
    let cur: Record<string, unknown> = { ...SETTINGS }
    const calls = show('/admin/ai', (url, method, body) => {
      if (url === '/api/admin/ai' && method === 'GET') return json(200, cur)
      if (url === '/api/admin/ai/key' && method === 'PUT') return json(200, (cur = { ...cur, hasKey: true, keyHint: 'sk-ant-…abcd' }))
      if (url === '/api/admin/ai/test') return json(200, { ok: true, model: 'claude-opus-5-5', latencyMs: 812, message: null })
      if (url === '/api/admin/ai' && method === 'PUT') return json(200, (cur = { ...cur, ...(body as object) }))
      return null
    })
    expect(await screen.findByText('미등록')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '연결 테스트' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('API 키'), { target: { value: 'sk-ant-api03-xyz-abcd' } })
    fireEvent.click(screen.getByRole('button', { name: '등록' }))
    expect(await screen.findByText('등록됨 sk-ant-…abcd')).toBeInTheDocument()
    expect(calls.find((c) => c.url === '/api/admin/ai/key')?.body).toEqual({ apiKey: 'sk-ant-api03-xyz-abcd' })
    expect((screen.getByLabelText('API 키') as HTMLInputElement).value).toBe('') // 키는 화면에 남기지 않음
    fireEvent.click(screen.getByRole('button', { name: '연결 테스트' }))
    expect(await screen.findByText('연결됨 · claude-opus-5-5 · 812 ms')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('모델'), { target: { value: 'claude-sonnet-5-5' } })
    expect(screen.getByText('입력 $2 · 출력 $10 / 1M 토큰')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('월 한도 (USD)'), { target: { value: '12.5' } })
    fireEvent.click(screen.getByLabelText('AI 챗봇 사용'))
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(await screen.findByText('저장했습니다.')).toBeInTheDocument()
    expect(calls.find((c) => c.url === '/api/admin/ai' && c.method === 'PUT')?.body).toEqual({ model: 'claude-sonnet-5-5', monthlyLimitUsd: 12.5, enabled: true })
  })

  it('Claude API 관리: 마스터 키가 없으면 경고 · 키 삭제는 확인 창', async () => {
    const calls = show('/admin/ai', (url, method) => {
      if (url === '/api/admin/ai' && method === 'GET') return json(200, { ...SETTINGS, masterKey: false, hasKey: true, keyHint: 'sk-ant-…abcd' })
      if (url === '/api/admin/ai/key' && method === 'DELETE') return json(200, { ...SETTINGS, masterKey: false })
      return null
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('F3D_AI_MASTER_KEY 가 설정되지 않아 키를 저장할 수 없습니다')
    expect(screen.getByRole('button', { name: '등록' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '키 삭제' }))
    const dialog = screen.getByRole('dialog', { name: 'Claude API 키 삭제' })
    fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }))
    expect(await screen.findByText('미등록')).toBeInTheDocument()
    expect(calls.some((c) => c.url === '/api/admin/ai/key' && c.method === 'DELETE')).toBe(true)
  })

  it('변경 이력: 출처 배지·요약·펼치기·필터·묶음 되돌리기', async () => {
    const entry = {
      id: 9, at: '2026-11-13T03:00:00Z', username: 'kim', source: 'AI', drawingId: 1, drawingName: '나셀 공장', batchId: 'b-1',
      kind: 'placement.move', target: 'Main Station 1', before: { name: 'Main Station 1', x: 10, y: 5, rot: 0 }, after: { name: 'Main Station 1', x: 12, y: 5, rot: 0 },
      reverted: false, revertedBy: null, revertedAt: null,
    }
    let reverted = false
    const calls = show('/admin/changes', (url, method) => {
      if (url === '/api/drawings') return json(200, [{ id: 1, name: '나셀 공장', sourceType: 'dxf', version: 1, createdBy: 'system', updatedAt: '', width: 40, height: 20, placements: 1 }])
      if (url.startsWith('/api/changes?')) return json(200, { items: [{ ...entry, reverted }], total: 1, page: 0, size: 50 })
      if (url === '/api/changes/b-1/revert' && method === 'POST') {
        reverted = true
        return json(200, { batchId: 'b-1', reverted: 1 })
      }
      return null
    })
    const row = (await screen.findByText('Main Station 1')).closest('tr')!
    expect(within(row).getByText('AI')).toBeInTheDocument()
    expect(within(row).getByText('이동')).toBeInTheDocument()
    expect(within(row).getByText('(10.0, 5.0) → (12.0, 5.0)')).toBeInTheDocument()
    fireEvent.click(within(row).getByRole('button', { name: '자세히' }))
    expect(screen.getByText(/"x": 12/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('출처'), { target: { value: 'AI' } })
    fireEvent.click(screen.getByRole('button', { name: '찾기' }))
    await waitFor(() => expect(calls.some((c) => c.url.includes('source=AI'))).toBe(true))

    fireEvent.click(within((await screen.findByText('Main Station 1')).closest('tr')!).getByRole('button', { name: '되돌리기' }))
    const dialog = screen.getByRole('dialog', { name: '변경 되돌리기' })
    expect(dialog).toHaveTextContent('이 묶음의 변경 1건을 모두 되돌립니다')
    fireEvent.click(within(dialog).getByRole('button', { name: '되돌리기' }))
    expect(await screen.findByText('되돌림')).toBeInTheDocument()
    expect(calls.some((c) => c.url === '/api/changes/b-1/revert')).toBe(true)
  })

  it('변경 이력: 되돌리기 실패는 창 안에 이유', async () => {
    const entry = {
      id: 9, at: '2026-11-13T03:00:00Z', username: 'kim', source: 'USER', drawingId: 1, drawingName: '나셀 공장', batchId: 'b-2',
      kind: 'placement.delete', target: 'A', before: { name: 'A', x: 1, y: 1, rot: 0 }, after: null, reverted: false, revertedBy: null, revertedAt: null,
    }
    show('/admin/changes', (url) => {
      if (url.startsWith('/api/changes?')) return json(200, { items: [entry], total: 1, page: 0, size: 50 })
      if (url === '/api/changes/b-2/revert') return json(409, { detail: '이후에 바뀐 객체가 있어 되돌릴 수 없습니다' })
      return null
    })
    const table = await screen.findByRole('table', { name: '변경 이력 표' })
    const row = within(table).getByText('사람').closest('tr')! // 출처 select 의 '사람' 과 겹치지 않게 표 안에서
    fireEvent.click(within(row).getByRole('button', { name: '되돌리기' }))
    const dialog = screen.getByRole('dialog', { name: '변경 되돌리기' })
    fireEvent.click(within(dialog).getByRole('button', { name: '되돌리기' }))
    expect(await within(dialog).findByText('이후에 바뀐 객체가 있어 되돌릴 수 없습니다')).toBeInTheDocument()
  })

  it('AI 사용량: 이번 달 합계·한도 막대·일별·사용자별', async () => {
    const month = { key: 'month', calls: 3, inputTokens: 6000, outputTokens: 30, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 3 }
    show('/admin/ai-usage', (url) => {
      if (url.startsWith('/api/admin/ai/usage?group=day'))
        return json(200, { month, limitUsd: 50, from: '2026-11-01', to: '2026-11-13', group: 'day', rows: [{ ...month, key: '2026-11-13', calls: 1, costUsd: 1.5 }, { ...month, key: '2026-11-01', calls: 2, costUsd: 1.5 }] })
      if (url.startsWith('/api/admin/ai/usage?group=user'))
        return json(200, { month, limitUsd: 50, from: '2026-11-01', to: '2026-11-13', group: 'user', rows: [{ ...month, key: 'kim', calls: 2, costUsd: 2 }, { ...month, key: 'lee', calls: 1, costUsd: 1 }] })
      return null
    })
    expect(await screen.findByText('$3.00 / $50.00')).toBeInTheDocument()
    expect(screen.getByRole('meter', { name: '이번 달 비용 / 한도' })).toHaveAttribute('aria-valuenow', '6')
    const day = screen.getByRole('table', { name: '일별 사용량' })
    expect(within(day).getByText('2026-11-13')).toBeInTheDocument()
    const users = screen.getByRole('table', { name: '사용자별 사용량' })
    expect(within(users).getByText('kim')).toBeInTheDocument()
  })

  it('변경 요약', () => {
    expect(summary('placement.rotate', { x: 1, y: 1, rot: 0 }, { x: 1, y: 1, rot: 90 })).toBe('0° → 90°')
    expect(summary('placement.rename', { name: 'A' }, { name: 'B' })).toBe('A → B')
    expect(summary('placement.add', null, { x: 3, y: 4 })).toBe('(3.0, 4.0)')
    expect(summary('station.update', { taktSec: 1200, warnPp: 10, delayPp: 20, placementName: 'A' }, { taktSec: 1500, warnPp: 10, delayPp: 25, placementName: 'A' }))
      .toBe('택타임 20분 → 25분 · 지연 20% → 25%')
    expect(summary('plan.partition.add', null, { id: 'p2', pts: [[2, 10], [8, 10]], h: 1.2, t: 0.5 })).toBe('(2.0, 10.0) → (8.0, 10.0)')
    expect(summary('plan.zone.rename', { name: 'a' }, { name: 'b' })).toBe('a → b')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd web && npx vitest run src/pages/admin/ai-admin.test.tsx`
Expected: FAIL — 주소·모듈 없음

- [ ] **Step 3: 변경 요약**

`web/src/pages/admin/changeSummary.ts`:
```ts
import type { ChangeKind } from '../../ai/types'

export const KIND_LABEL: Record<ChangeKind, string> = {
  'placement.move': '이동',
  'placement.rotate': '회전',
  'placement.rename': '이름 변경',
  'placement.update': '변경',
  'placement.add': '추가',
  'placement.delete': '삭제',
  'station.update': '공정 변경',
  'plan.partition.add': '가벽 추가',
  'plan.partition.delete': '가벽 삭제',
  'plan.zone.rename': '구역 이름',
}

type Snap = Record<string, unknown> | null | undefined
const n = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0))
const f1 = (v: unknown) => n(v).toFixed(1)
const xy = (s: Snap) => `(${f1(s?.x)}, ${f1(s?.y)})`
const min = (sec: unknown) => `${Math.round((n(sec) / 60) * 100) / 100}분`

/** 변경 이력 한 줄 요약 (before → after) */
export function summary(kind: ChangeKind, before: unknown, after: unknown): string {
  const b = before as Snap, a = after as Snap
  switch (kind) {
    case 'placement.move': return `${xy(b)} → ${xy(a)}`
    case 'placement.rotate': return `${n(b?.rot)}° → ${n(a?.rot)}°`
    case 'placement.rename': return `${String(b?.name)} → ${String(a?.name)}`
    case 'placement.update': return `(${f1(b?.x)}, ${f1(b?.y)}, ${n(b?.rot)}°) → (${f1(a?.x)}, ${f1(a?.y)}, ${n(a?.rot)}°)`
    case 'placement.add': return xy(a)
    case 'placement.delete': return xy(b)
    case 'station.update': {
      const parts: string[] = []
      if (n(b?.taktSec) !== n(a?.taktSec)) parts.push(`택타임 ${min(b?.taktSec)} → ${min(a?.taktSec)}`)
      if (n(b?.warnPp) !== n(a?.warnPp)) parts.push(`주의 ${n(b?.warnPp)}% → ${n(a?.warnPp)}%`)
      if (n(b?.delayPp) !== n(a?.delayPp)) parts.push(`지연 ${n(b?.delayPp)}% → ${n(a?.delayPp)}%`)
      if ((b?.placementName ?? null) !== (a?.placementName ?? null)) parts.push(`연결 설비 ${String(b?.placementName ?? '없음')} → ${String(a?.placementName ?? '없음')}`)
      return parts.join(' · ')
    }
    case 'plan.partition.add':
    case 'plan.partition.delete': {
      const pts = ((kind === 'plan.partition.add' ? a : b)?.pts ?? []) as [number, number][]
      if (pts.length < 2) return ''
      const p = pts[0], q = pts[pts.length - 1]
      return `(${f1(p[0])}, ${f1(p[1])}) → (${f1(q[0])}, ${f1(q[1])})`
    }
    case 'plan.zone.rename': return `${String(b?.name)} → ${String(a?.name)}`
  }
}
```

- [ ] **Step 4: Claude API 관리**

`web/src/pages/admin/AiSettingsPage.tsx`:
```tsx
import { KeyRound, PlugZap, Trash2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { deleteAiKey, getAiSettings, saveAiSettings, setAiKey, testAi } from '../../ai/api'
import { AI_MODELS, type AiModel, type AiSettings, type AiTestResult } from '../../ai/types'
import { Modal } from '../../components/Modal'
import { when } from './format'

/** 관리자 › Claude API 관리: 키(암호화 저장 · 힌트만 보임) · 연결 테스트 · 모델 · 월 한도 · 사용 여부 */
export function AiSettingsPage() {
  const [s, setS] = useState<AiSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [key, setKey] = useState('')
  const [keyError, setKeyError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [test, setTest] = useState<AiTestResult | 'running' | null>(null)
  const [form, setForm] = useState<{ model: AiModel; limit: string; enabled: boolean }>({ model: 'claude-opus-5-5', limit: '50', enabled: false })
  const [saved, setSaved] = useState<string | null>(null)
  const take = (v: AiSettings) => {
    setS(v)
    setForm({ model: v.model, limit: String(v.monthlyLimitUsd), enabled: v.enabled })
  }
  useEffect(() => {
    getAiSettings().then(take).catch((e: Error) => setError(e.message))
  }, [])

  const register = (e: FormEvent) => {
    e.preventDefault()
    setKeyError(null)
    setAiKey(key.trim())
      .then((v) => {
        take(v)
        setKey('')
        setTest(null)
      })
      .catch((err: Error) => setKeyError(err.message))
  }
  const remove = () =>
    deleteAiKey()
      .then((v) => {
        take(v)
        setDeleting(false)
        setTest(null)
      })
      .catch((err: Error) => setKeyError(err.message))
  const runTest = () => {
    setTest('running')
    testAi().then(setTest).catch((err: Error) => setTest({ ok: false, model: null, latencyMs: null, message: err.message }))
  }
  const save = (e: FormEvent) => {
    e.preventDefault()
    setSaved(null)
    const limit = Number(form.limit)
    if (!form.limit.trim() || !Number.isFinite(limit) || limit < 0) return setError('월 한도는 0 이상 USD 로 입력하세요.')
    setError(null)
    saveAiSettings({ model: form.model, monthlyLimitUsd: limit, enabled: form.enabled })
      .then((v) => {
        take(v)
        setSaved('저장했습니다.')
      })
      .catch((err: Error) => setError(err.message))
  }

  if (!s) return <section className="kp-card kp-section" aria-label="Claude API 관리">{error ? <p className="kp-error-text">{error}</p> : <p className="kp-desc">불러오는 중…</p>}</section>
  const price = AI_MODELS.find((m) => m.id === form.model)?.price
  return (
    <section className="kp-card kp-section" aria-label="Claude API 관리">
      <div className="kp-section-head">
        <div>
          <h2>Claude API 관리</h2>
          <p className="kp-desc">AI 챗봇이 쓰는 Claude API 키와 모델·월 한도입니다. 키는 서버에 암호화해 저장하고 화면에는 끝 4자리만 보입니다.</p>
        </div>
      </div>
      {!s.masterKey && (
        <p className="kp-error-text ai-warn" role="alert">
          F3D_AI_MASTER_KEY 가 설정되지 않아 키를 저장할 수 없습니다
        </p>
      )}

      <h3 className="ai-sub">API 키</h3>
      <p className="ai-key-state">
        <KeyRound size={14} aria-hidden /> <span className={s.hasKey ? 'kp-state ok' : 'kp-state off'}>{s.hasKey ? `등록됨 ${s.keyHint ?? ''}` : '미등록'}</span>
      </p>
      <form className="kp-filter" onSubmit={register}>
        <label className="kp-field">
          <span>API 키</span>
          <input className="kp-input ai-key" type="password" autoComplete="off" placeholder="sk-ant-…" value={key} onChange={(e) => setKey(e.target.value)} />
        </label>
        <button className="kp-btn kp-btn-primary kp-btn-sm" type="submit" disabled={!s.masterKey || !key.trim()}>
          등록
        </button>
        {s.hasKey && (
          <button className="kp-btn kp-btn-text kp-btn-sm" type="button" onClick={() => setDeleting(true)}>
            <Trash2 size={14} aria-hidden /> 키 삭제
          </button>
        )}
        <button className="kp-btn kp-btn-stroke kp-btn-sm" type="button" disabled={!s.hasKey || test === 'running'} onClick={runTest}>
          <PlugZap size={14} aria-hidden /> 연결 테스트
        </button>
      </form>
      {keyError && <p className="kp-error-text">{keyError}</p>}
      {test === 'running' && <p className="kp-desc">연결 확인 중…</p>}
      {test && test !== 'running' && (
        <p className={test.ok ? 'kp-state ok' : 'kp-state bad'}>{test.ok ? `연결됨 · ${test.model} · ${test.latencyMs} ms` : `연결 실패: ${test.message}`}</p>
      )}

      <h3 className="ai-sub">사용 설정</h3>
      <form className="kp-form ai-settings" onSubmit={save}>
        <label className="kp-field">
          <span>모델</span>
          <select className="kp-input" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value as AiModel })}>
            {AI_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <span className="kp-help">{price}</span>
        </label>
        <label className="kp-field">
          <span>월 한도 (USD)</span>
          <input className="kp-input" type="number" min={0} step="0.01" value={form.limit} onChange={(e) => setForm({ ...form, limit: e.target.value })} />
        </label>
        <label className="ai-check">
          <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
          AI 챗봇 사용
        </label>
        {error && <p className="kp-error-text">{error}</p>}
        {saved && <p className="kp-state ok">{saved}</p>}
        <div>
          <button className="kp-btn kp-btn-primary kp-btn-sm" type="submit">
            저장
          </button>
        </div>
        <p className="kp-help">마지막 변경: {s.updatedBy ?? '—'} · {when(s.updatedAt)}</p>
      </form>

      {deleting && (
        <Modal title="Claude API 키 삭제" onClose={() => setDeleting(false)}>
          <p className="kp-desc">키를 지우면 AI 챗봇을 쓸 수 없습니다. 지울까요?</p>
          <div className="kp-modal-actions">
            <button className="kp-btn kp-btn-text kp-btn-sm" onClick={() => setDeleting(false)}>
              닫기
            </button>
            <button className="kp-btn kp-btn-primary kp-btn-sm" onClick={() => void remove()}>
              삭제
            </button>
          </div>
        </Modal>
      )}
    </section>
  )
}
```

- [ ] **Step 5: 변경 이력**

`web/src/pages/admin/ChangesPage.tsx`:
```tsx
import { ChevronDown, ChevronRight, Undo2 } from 'lucide-react'
import { Fragment, useCallback, useEffect, useState, type FormEvent } from 'react'
import { getChanges, revertBatch, type ChangeQuery } from '../../ai/api'
import type { ChangeEntry, ChangePage } from '../../ai/types'
import { apiJson } from '../../api/client'
import { Modal } from '../../components/Modal'
import type { DrawingSummary } from '../../api/types'
import { KIND_LABEL, summary } from './changeSummary'
import { when } from './format'

interface Filter { drawingId: string; source: '' | 'USER' | 'AI'; from: string; to: string }
const EMPTY: Filter = { drawingId: '', source: '', from: '', to: '' }
const toQuery = (f: Filter, page: number): ChangeQuery => ({
  drawingId: f.drawingId ? Number(f.drawingId) : undefined, source: f.source || undefined, from: f.from || undefined, to: f.to || undefined, page,
})
const pretty = (v: unknown) => (v == null ? '없음' : JSON.stringify(v, null, 2))

/** 관리자 › 변경 이력: 사람·AI 가 바꾼 기록 (도면·출처·기간), 펼치면 before/after, 묶음 되돌리기 */
export function ChangesPage() {
  const [drawings, setDrawings] = useState<DrawingSummary[]>([])
  const [filter, setFilter] = useState<Filter>(EMPTY)
  const [query, setQuery] = useState<{ f: Filter; page: number }>({ f: EMPTY, page: 0 })
  const [data, setData] = useState<ChangePage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Set<number>>(new Set())
  const [confirm, setConfirm] = useState<{ batchId: string; count: number } | null>(null)
  const [revertError, setRevertError] = useState<string | null>(null)
  const load = useCallback(() => {
    getChanges(toQuery(query.f, query.page))
      .then((d) => {
        setError(null)
        setData(d)
      })
      .catch((e: Error) => setError(e.message))
  }, [query])
  useEffect(() => load(), [load])
  useEffect(() => {
    apiJson<DrawingSummary[]>('/api/drawings').then(setDrawings).catch(() => setDrawings([]))
  }, [])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setQuery({ f: filter, page: 0 })
  }
  const set = (patch: Partial<Filter>) => setFilter((f) => ({ ...f, ...patch }))
  const toggle = (id: number) =>
    setOpen((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const doRevert = () => {
    if (!confirm) return
    revertBatch(confirm.batchId)
      .then(() => {
        setConfirm(null)
        load()
      })
      .catch((e: Error) => setRevertError(e.message))
  }
  const rows = data?.items ?? []
  const pages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1
  return (
    <section className="kp-card kp-section" aria-label="변경 이력">
      <div className="kp-section-head">
        <div>
          <h2>변경 이력</h2>
          <p className="kp-desc">사람과 AI 가 3D 공장을 바꾼 기록입니다. 한 번에 바뀐 묶음 단위로 되돌릴 수 있습니다.</p>
        </div>
      </div>
      <form className="kp-filter" onSubmit={submit}>
        <label className="kp-field">
          <span>도면</span>
          <select className="kp-input" value={filter.drawingId} onChange={(e) => set({ drawingId: e.target.value })}>
            <option value="">전체</option>
            {drawings.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="kp-field">
          <span>출처</span>
          <select className="kp-input" value={filter.source} onChange={(e) => set({ source: e.target.value as Filter['source'] })}>
            <option value="">전체</option>
            <option value="USER">사람</option>
            <option value="AI">AI</option>
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
        <button className="kp-btn kp-btn-primary kp-btn-sm" type="submit">
          찾기
        </button>
      </form>
      {error && <p className="kp-error-text">{error}</p>}
      {data === null ? (
        <p className="kp-desc">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="kp-desc">기록이 없습니다.</p>
      ) : (
        <table className="kp-table" aria-label="변경 이력 표">
          <thead>
            <tr>
              <th aria-label="펼치기" />
              <th>시각</th>
              <th>사용자</th>
              <th>출처</th>
              <th>도면</th>
              <th>종류</th>
              <th>대상</th>
              <th>요약</th>
              <th>묶음</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: ChangeEntry) => (
              <Fragment key={r.id}>
                <tr className={r.reverted ? 'off' : undefined}>
                  <td>
                    <button className="kp-btn kp-btn-text kp-btn-xs" aria-label="자세히" aria-expanded={open.has(r.id)} onClick={() => toggle(r.id)}>
                      {open.has(r.id) ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
                    </button>
                  </td>
                  <td>{when(r.at)}</td>
                  <td className="mono">{r.username ?? '—'}</td>
                  <td>
                    <span className={r.source === 'AI' ? 'kp-badge source-ai' : 'kp-badge source-user'}>{r.source === 'AI' ? 'AI' : '사람'}</span>
                  </td>
                  <td>{r.drawingName}</td>
                  <td>{KIND_LABEL[r.kind] ?? r.kind}</td>
                  <td>{r.target ?? ''}</td>
                  <td className="mono">{summary(r.kind, r.before, r.after)}</td>
                  <td>
                    {r.reverted ? (
                      <span className="kp-state off">되돌림</span>
                    ) : (
                      <button
                        className="kp-btn kp-btn-stroke kp-btn-xs"
                        onClick={() => {
                          setRevertError(null)
                          setConfirm({ batchId: r.batchId, count: rows.filter((x) => x.batchId === r.batchId).length })
                        }}
                      >
                        <Undo2 size={12} aria-hidden /> 되돌리기
                      </button>
                    )}
                  </td>
                </tr>
                {open.has(r.id) && (
                  <tr className="change-detail">
                    <td />
                    <td colSpan={8}>
                      <div className="change-json">
                        <div>
                          <strong>이전</strong>
                          <pre>{pretty(r.before)}</pre>
                        </div>
                        <div>
                          <strong>이후</strong>
                          <pre>{pretty(r.after)}</pre>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
      {data && data.total > data.size && (
        <div className="kp-pager">
          <button className="kp-btn kp-btn-text kp-btn-sm" disabled={query.page === 0} onClick={() => setQuery({ ...query, page: query.page - 1 })}>
            이전
          </button>
          <span>
            {query.page + 1} / {pages}
          </span>
          <button className="kp-btn kp-btn-text kp-btn-sm" disabled={query.page + 1 >= pages} onClick={() => setQuery({ ...query, page: query.page + 1 })}>
            다음
          </button>
        </div>
      )}
      {confirm && (
        <Modal title="변경 되돌리기" onClose={() => setConfirm(null)}>
          <p className="kp-desc">이 묶음의 변경 {confirm.count}건을 모두 되돌립니다. 그 뒤에 같은 객체를 바꾼 기록이 있으면 되돌릴 수 없습니다.</p>
          {revertError && <p className="kp-error-text">{revertError}</p>}
          <div className="kp-modal-actions">
            <button className="kp-btn kp-btn-text kp-btn-sm" onClick={() => setConfirm(null)}>
              닫기
            </button>
            <button className="kp-btn kp-btn-primary kp-btn-sm" onClick={doRevert}>
              되돌리기
            </button>
          </div>
        </Modal>
      )}
    </section>
  )
}
```

- [ ] **Step 6: AI 사용량**

`web/src/pages/admin/AiUsagePage.tsx`:
```tsx
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { getUsage } from '../../ai/api'
import type { UsageReport, UsageRow } from '../../ai/types'

const tok = (v: number) => v.toLocaleString('ko-KR')
const usd = (v: number) => (v < 1 && v > 0 ? v.toFixed(4) : v.toFixed(2))

function UsageTable({ label, head, rows }: { label: string; head: string; rows: UsageRow[] }) {
  return (
    <table className="kp-table" aria-label={label}>
      <thead>
        <tr>
          <th>{head}</th>
          <th>호출</th>
          <th>입력 토큰</th>
          <th>출력 토큰</th>
          <th>캐시 읽기</th>
          <th>캐시 쓰기</th>
          <th>비용 (USD)</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td colSpan={7} className="muted">
              기록이 없습니다.
            </td>
          </tr>
        )}
        {rows.map((r) => (
          <tr key={r.key}>
            <td className="mono">{r.key}</td>
            <td className="mono">{tok(r.calls)}</td>
            <td className="mono">{tok(r.inputTokens)}</td>
            <td className="mono">{tok(r.outputTokens)}</td>
            <td className="mono">{tok(r.cacheReadTokens)}</td>
            <td className="mono">{tok(r.cacheWriteTokens)}</td>
            <td className="mono">${usd(r.costUsd)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** 관리자 › AI 사용량: 이번 달 합계(비용/한도 막대) · 일별 · 사용자별 */
export function AiUsagePage() {
  const [range, setRange] = useState({ from: '', to: '' })
  const [applied, setApplied] = useState({ from: '', to: '' })
  const [day, setDay] = useState<UsageReport | null>(null)
  const [user, setUser] = useState<UsageReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => {
    Promise.all([getUsage('day', applied.from, applied.to), getUsage('user', applied.from, applied.to)])
      .then(([d, u]) => {
        setError(null)
        setDay(d)
        setUser(u)
      })
      .catch((e: Error) => setError(e.message))
  }, [applied])
  useEffect(() => load(), [load])
  const submit = (e: FormEvent) => {
    e.preventDefault()
    setApplied(range)
  }
  const m = day?.month
  const pct = day && m ? (day.limitUsd > 0 ? Math.round((m.costUsd / day.limitUsd) * 100) : 100) : 0
  const tone = pct >= 100 ? 'bad' : pct >= 80 ? 'warn' : 'ok'
  return (
    <section className="kp-card kp-section" aria-label="AI 사용량">
      <div className="kp-section-head">
        <div>
          <h2>AI 사용량</h2>
          <p className="kp-desc">Claude 호출 수·토큰·추정 비용입니다. 이번 달 비용이 한도에 닿으면 AI 챗봇이 멈춥니다.</p>
        </div>
      </div>
      {error && <p className="kp-error-text">{error}</p>}
      {day && m && (
        <div className="usage-month">
          <div>
            <span>이번 달 호출</span>
            <strong>{tok(m.calls)}</strong>
          </div>
          <div>
            <span>입력 · 출력 토큰</span>
            <strong>
              {tok(m.inputTokens)} · {tok(m.outputTokens)}
            </strong>
          </div>
          <div className="usage-cost">
            <span>비용 / 한도</span>
            <strong>
              ${usd(m.costUsd)} / ${day.limitUsd.toFixed(2)}
            </strong>
            <div className={`usage-bar ${tone}`} role="meter" aria-label="이번 달 비용 / 한도" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(pct, 100)}>
              <span style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
          </div>
        </div>
      )}
      <form className="kp-filter" onSubmit={submit}>
        <label className="kp-field">
          <span>시작일</span>
          <input className="kp-input" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        </label>
        <label className="kp-field">
          <span>종료일</span>
          <input className="kp-input" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </label>
        <button className="kp-btn kp-btn-primary kp-btn-sm" type="submit">
          찾기
        </button>
        {day && <span className="kp-help">{day.from} ~ {day.to}</span>}
      </form>
      <h3 className="ai-sub">일별</h3>
      {day ? <UsageTable label="일별 사용량" head="날짜" rows={day.rows} /> : <p className="kp-desc">불러오는 중…</p>}
      <h3 className="ai-sub">사용자별</h3>
      {user ? <UsageTable label="사용자별 사용량" head="사용자" rows={user.rows} /> : <p className="kp-desc">불러오는 중…</p>}
    </section>
  )
}
```
(`$3.00 / $50.00` 은 `usd(3)` = `3.00` · `limitUsd.toFixed(2)` 로 맞춘다 — 테스트 기대값.)

- [ ] **Step 7: 탭 · 주소 · 스타일**

`web/src/pages/admin/AdminLayout.tsx` 의 탭 끝(`공정·생산 기준정보` 다음)에:
```tsx
          <NavLink to="/admin/ai">Claude API 관리</NavLink>
          <NavLink to="/admin/changes">변경 이력</NavLink>
          <NavLink to="/admin/ai-usage">AI 사용량</NavLink>
```
`web/src/routes.tsx`: import `AiSettingsPage`·`ChangesPage`·`AiUsagePage`, `children` 끝에:
```tsx
      { path: 'ai', element: <AiSettingsPage /> },
      { path: 'changes', element: <ChangesPage /> },
      { path: 'ai-usage', element: <AiUsagePage /> },
```
`web/src/styles/kp.css` 맨 끝에:
```css
/* ---------- 관리자 › AI ---------- */
.ai-sub { margin: var(--kp-sp-24) 0 var(--kp-sp-8); font-size: var(--kp-text-14); font-weight: 600; }
.ai-warn { margin-bottom: var(--kp-sp-16); padding: var(--kp-sp-10) var(--kp-sp-12); border: 1px solid var(--kp-red); border-radius: var(--kp-radius-sm); background: #fff5f5; }
.ai-key-state { display: flex; align-items: center; gap: var(--kp-sp-6); margin: 0 0 var(--kp-sp-8); }
.ai-key { min-width: 320px; }
.ai-settings { max-width: 420px; }
.ai-check { display: flex; align-items: center; gap: var(--kp-sp-8); font-size: var(--kp-text-14); }
.kp-badge.source-ai { background: #eef2ff; color: #4338ca; }
.kp-badge.source-user { background: var(--kp-disabled-fill); color: var(--kp-text-sub-2); }
.change-json { display: grid; grid-template-columns: 1fr 1fr; gap: var(--kp-sp-12); }
.change-json pre { margin: var(--kp-sp-4) 0 0; padding: var(--kp-sp-8); max-height: 260px; overflow: auto; background: var(--kp-bg); border-radius: var(--kp-radius-sm); font-size: var(--kp-text-12); }
.kp-pager { display: flex; align-items: center; justify-content: center; gap: var(--kp-sp-12); margin-top: var(--kp-sp-16); font-size: var(--kp-text-13); }
.usage-month { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--kp-sp-12); margin-bottom: var(--kp-sp-16); }
.usage-month > div { display: flex; flex-direction: column; gap: var(--kp-sp-4); padding: var(--kp-sp-12) var(--kp-sp-16); border: 1px solid var(--kp-border); border-radius: var(--kp-radius-sm); }
.usage-month span { font-size: var(--kp-text-13); color: var(--kp-text-sub-2); }
.usage-month strong { font-size: var(--kp-text-16); font-variant-numeric: tabular-nums; }
.usage-bar { height: 6px; border-radius: 3px; background: var(--kp-disabled-fill); overflow: hidden; }
.usage-bar span { display: block; height: 100%; background: var(--kp-green); }
.usage-bar.warn span { background: #cd8d0b; }
.usage-bar.bad span { background: var(--kp-red); }
```

- [ ] **Step 8: 테스트 통과 확인**

Run: `cd web && npx vitest run`
Expected: 전체 PASS, 경고 없음 (`admin.test.tsx` 가 탭 개수를 세면 3개 늘어난 값으로 고친다)

Run: `cd web && npm run build && ./node_modules/.bin/oxlint`
Expected: 빌드 성공 · lint 0 경고

- [ ] **Step 9: Commit**

```bash
cd /c/kopens/project/Factory3D && git add web/src/pages/admin web/src/routes.tsx web/src/styles/kp.css
git commit -m "feat(web): 관리자 › Claude API 관리(키·연결 테스트·모델·한도·사용) · 변경 이력(사람/AI·펼치기·묶음 되돌리기) · AI 사용량(한도 막대·일별·사용자별)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 실제 화면 확인 (Edge · 가짜 게이트웨이) · README · 전체 회귀

**Files:**
- Create: `web/e2e/p6-smoke.mjs`
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 1~9 전부. 서버는 **8081 · DB `factory3d_test` · 임시 데이터 폴더 · `F3D_AI_FAKE=true` · 테스트 마스터 키** 로만 띄운다 (8080·`factory3d`·`data/` 는 사용자 것 — 건드리지 않음).
- Produces: 스크린샷 `web/e2e/shots/p6-*.png` (커밋하지 않음), README 의 AI 챗봇 안내·환경 변수.

- [ ] **Step 1: 확인 스크립트**

`web/e2e/p6-smoke.mjs`:
```js
// P6 실제 화면 확인 (Edge): 키 없을 때 AI 챗봇 꺼짐 → 관리자 키 등록·사용·연결 테스트 → 챗봇 'Main Station 1 을 오른쪽으로 2m 옮겨줘'
// → 3D 유령 미리보기 → 적용 → 위치 +2m → 변경 이력 AI 1건 → 되돌리기 → 원래 자리 → AI 사용량.
// 서버는 F3D_AI_FAKE=true · F3D_AI_MASTER_KEY(테스트 값) 로 띄울 것 (실제 Claude 를 부르지 않음). 스크린샷 e2e/shots/p6-*
// 사용: node e2e/p6-smoke.mjs <주소> <아이디> <비밀번호>   (walk smoke 다음에)
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const [base = 'http://localhost:8081', id = 'admin', pw = 'Factory3d1!'] = process.argv.slice(2)
const TARGET = 'Main Station 1'
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
const api = (url) => page.evaluate(async (u) => (await fetch(u)).json(), url)

/** 나셀 공장 도면 id 와 TARGET 배치 */
async function target() {
  const drawings = await api('/api/drawings')
  const d = drawings.find((x) => x.name === '나셀 공장')
  if (!d) throw new Error('나셀 공장 도면이 없습니다')
  const list = await api(`/api/drawings/${d.id}/placements`)
  const p = list.find((x) => x.name === TARGET)
  if (!p) throw new Error(`${TARGET} 배치가 없습니다`)
  return { drawingId: d.id, p }
}

async function factoryWithNacelle() {
  await page.goto(base + '/')
  const select = page.getByRole('combobox', { name: '도면 선택' })
  await select.waitFor()
  if ((await select.locator('option:checked').textContent()) !== '나셀 공장') await select.selectOption({ label: '나셀 공장' })
}

try {
  await page.goto(base + '/login')
  await page.getByLabel('아이디').fill(id)
  await page.getByLabel('비밀번호').fill(pw)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL((u) => u.pathname === '/')

  // 1. 키가 없으면 레일 AI 챗봇 꺼짐 + 이유
  await factoryWithNacelle()
  const rail = page.getByRole('button', { name: 'AI 챗봇' })
  await page.waitForFunction(() => document.querySelector('button[aria-label="AI 챗봇"]')?.getAttribute('title')?.includes('—'))
  const title = (await rail.getAttribute('title')) ?? ''
  if (!(await rail.isDisabled()) || !title.includes('Claude API 키가 등록되지 않았습니다')) fail(`키 없을 때 버튼: disabled=${await rail.isDisabled()} title=${title}`)
  await shot('p6-1-disabled')

  // 2. 관리자 › Claude API 관리: 키 등록 · 사용 켬 · 연결 테스트
  await page.goto(base + '/admin/ai')
  await page.getByRole('heading', { name: 'Claude API 관리' }).waitFor()
  await page.getByLabel('API 키').fill('sk-ant-api03-smoke-test-0000000abcd')
  await page.getByRole('button', { name: '등록' }).click()
  await page.getByText('등록됨 sk-ant-…abcd').waitFor()
  await page.getByLabel('AI 챗봇 사용').check()
  await page.getByRole('button', { name: '저장' }).click()
  await page.getByText('저장했습니다.').waitFor()
  await page.getByRole('button', { name: '연결 테스트' }).click()
  await page.getByText(/^연결됨 · claude-opus-5-5 · \d+ ms$/).waitFor()
  await shot('p6-2-admin')

  // 3. 챗봇: 이동 요청 → 도구 진행 줄 · 제안 카드 · 3D 유령
  const before = await target()
  await factoryWithNacelle()
  await page.getByRole('button', { name: 'AI 챗봇' }).click()
  const panel = page.getByRole('complementary', { name: 'AI 챗봇' })
  await panel.getByLabel('AI 에게 보낼 요청').fill(`${TARGET} 을 오른쪽으로 2m 옮겨줘`)
  await panel.getByLabel('AI 에게 보낼 요청').press('Enter')
  const card = panel.getByRole('region', { name: '변경 제안' })
  await card.waitFor({ timeout: 15000 })
  if (!(await panel.getByText(`${TARGET} 이동 제안`).isVisible())) fail('도구 진행 줄이 없습니다')
  const head = (await card.locator('header strong').textContent()) ?? ''
  if (head !== '변경 1건') fail(`제안 카드: ${head}`)
  await card.getByRole('button', { name: new RegExp(`^${TARGET} 이동`) }).click() // 카메라 이동
  await page.waitForTimeout(6000) // 모델 내려받기·카메라 이동 (headless 는 소프트웨어 WebGL)
  await shot('p6-3-preview')
  const mid = await target()
  if (Math.abs(mid.p.x - before.p.x) > 1e-6) fail('제안만 했는데 위치가 바뀌었습니다')

  // 4. 적용 → 위치 +2m
  await card.getByRole('button', { name: '적용' }).click()
  await card.getByText('적용됨 · 1건').waitFor()
  const after = await target()
  if (Math.abs(after.p.x - (before.p.x + 2)) > 1e-6) fail(`적용 뒤 x=${after.p.x} (기대 ${before.p.x + 2})`)
  await page.waitForTimeout(1500)
  await shot('p6-4-applied')

  // 5. 변경 이력: AI 1건 → 되돌리기 → 원래 자리
  await page.goto(base + '/admin/changes')
  await page.getByRole('heading', { name: '변경 이력' }).waitFor()
  await page.getByLabel('출처').selectOption('AI')
  await page.getByRole('button', { name: '찾기' }).click()
  const row = page.locator('table.kp-table tbody tr', { hasText: TARGET }).first()
  await row.waitFor()
  const aiRows = await page.locator('table.kp-table tbody tr', { hasText: 'AI' }).count()
  if (aiRows !== 1) fail(`AI 변경 이력 ${aiRows}건 (기대 1)`)
  await shot('p6-5-changes')
  await row.getByRole('button', { name: '되돌리기' }).click()
  const dialog = page.getByRole('dialog', { name: '변경 되돌리기' })
  await dialog.getByRole('button', { name: '되돌리기' }).click()
  await dialog.waitFor({ state: 'detached' })
  await row.getByText('되돌림').waitFor()
  const back = await target()
  if (Math.abs(back.p.x - before.p.x) > 1e-6) fail(`되돌린 뒤 x=${back.p.x} (기대 ${before.p.x})`)

  // 6. AI 사용량
  await page.goto(base + '/admin/ai-usage')
  await page.getByRole('heading', { name: 'AI 사용량' }).waitFor()
  await page.getByRole('table', { name: '사용자별 사용량' }).getByText(id).waitFor()
  await shot('p6-6-usage')

  if (pageErrors.length) fail(`화면 오류: ${pageErrors.join(' | ')}`)
  if (!process.exitCode) console.log('P6 smoke 통과')
} catch (e) {
  fail(e.stack ?? String(e))
  await shot('p6-error').catch(() => {})
} finally {
  await browser.close()
}
```

- [ ] **Step 2: README**

`README.md`:
1. `### 체험 공간` 절 다음에 추가:
```markdown
### AI 챗봇
- 레일 `AI 챗봇`(운전원 이상): 3D 공장 화면 옆에 챗봇 패널이 열립니다 (객체 패널 자리, 한 번에 하나). 한국어로 요청하면(예: `Main Station 1 을 오른쪽으로 2m 옮겨줘`) Claude 가 장면을 확인하고 **변경 제안**만 만듭니다 — 3D 에 반투명 유령(옮김 파랑 · 추가 초록 · 삭제 빨강 · 가벽 주황)으로 미리 보고 `적용` 을 눌러야 저장됩니다. 적용한 묶음은 카드의 `되돌리기` 나 관리자 › 변경 이력에서 되돌릴 수 있습니다.
- 할 수 있는 일: 객체 이동·회전·추가·삭제·이름 바꾸기, 가벽 추가·삭제, 구역 이름 바꾸기, 공정 택타임·주의/지연 기준(적용은 관리자만).
- 관리자 › `Claude API 관리`: API 키 등록(서버에 AES-GCM 암호화 저장, 화면엔 끝 4자리만) · 연결 테스트 · 모델(Opus 5.5 기본 · Sonnet 5.5 · Haiku 5.5) · 월 한도(USD, 넘으면 챗봇 멈춤) · 사용 여부. `변경 이력`: 사람·AI 가 바꾼 기록과 묶음 되돌리기. `AI 사용량`: 이번 달 합계·일별·사용자별.
- 키를 저장하려면 서버에 마스터 키 `F3D_AI_MASTER_KEY`(base64 32바이트)가 있어야 합니다. 만들기: `openssl rand -base64 32` (또는 PowerShell `[Convert]::ToBase64String((1..32 | % { Get-Random -Max 256 }))`). 마스터 키를 바꾸면 저장된 API 키를 다시 등록해야 합니다.
```
2. 환경 변수 표 끝에 두 줄:
```markdown
| `F3D_AI_MASTER_KEY` | 없음 (Claude API 키 암호화용 base64 32바이트. 없으면 키 등록 불가) |
| `F3D_AI_FAKE` | `false` (`true` = 실제 Claude 대신 정해 둔 대본 — 테스트·화면 확인용) |
```
3. 테스트 절의 smoke 목록 끝에:
```markdown
cd web && node e2e/p6-smoke.mjs http://localhost:8080 admin <비밀번호>   # walk smoke 다음에, 서버는 F3D_AI_FAKE=true · F3D_AI_MASTER_KEY 로: AI 챗봇 제안·미리보기·적용·변경 이력 되돌리기·사용량
```

- [ ] **Step 3: 전체 자동 테스트**

Run: `cd server && ./gradlew test`
Expected: 전체 PASS

Run: `cd web && npx vitest run && npm run build && ./node_modules/.bin/oxlint`
Expected: 전체 PASS · 경고 없음 · 빌드 성공 · lint 0

- [ ] **Step 4: 화면 확인 서버 띄우기 (8081 · 테스트 DB)**

```bash
cd /c/kopens/project/Factory3D/server && ./gradlew bootJar
PGPASSWORD=factory3d_test psql -h localhost -p 5433 -U factory3d_test -d factory3d_test -c "drop schema public cascade; create schema public;"
DATA=$(mktemp -d) && F3D_PORT=8081 F3D_DB_URL=jdbc:postgresql://localhost:5433/factory3d_test F3D_DB_USER=factory3d_test \
  F3D_DB_PASSWORD=factory3d_test F3D_DATA_DIR=$DATA F3D_ADMIN_PASSWORD=Start1234 F3D_LIVE_TIME_SCALE=30 \
  F3D_AI_FAKE=true F3D_AI_MASTER_KEY=MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY= \
  java -Xmx768m -jar build/libs/factory3d.jar
```
(백그라운드로 띄우고 `curl -s http://localhost:8081/api/health` 가 응답할 때까지 기다린다. `psql` 이 없으면 `cd server && ./gradlew test --tests 'com.kopens.factory3d.common.DataDirTest'` 처럼 IntegrationTest 하나를 돌리면 schema 가 비워진다. 서버 로그에 `AI 챗봇이 가짜 게이트웨이로 동작합니다` 가 보여야 한다.)

- [ ] **Step 5: 화면 확인 (이전 smoke 회귀 + P6)**

```bash
cd /c/kopens/project/Factory3D/web && node e2e/p1-smoke.mjs http://localhost:8081 Start1234 'Factory3d1!' \
  && node e2e/p2-smoke.mjs http://localhost:8081 admin 'Factory3d1!' \
  && node e2e/p3-smoke.mjs http://localhost:8081 admin 'Factory3d1!' \
  && node e2e/p4-smoke.mjs http://localhost:8081 admin 'Factory3d1!' \
  && node e2e/walk-smoke.mjs http://localhost:8081 admin 'Factory3d1!' \
  && node e2e/p6-smoke.mjs http://localhost:8081 admin 'Factory3d1!'
```
Expected: 각 스크립트 `… 통과`, `P6 smoke 통과`. 스크린샷 `web/e2e/shots/p6-1-disabled` ~ `p6-6-usage` 를 열어 직접 본다: p6-1 레일 버튼 꺼짐 · p6-2 키 등록됨·연결됨 · p6-3 챗봇 패널 말풍선·도구 줄·제안 카드 + 3D 에 파란 유령과 원래 자리 점선 · p6-4 적용됨 · p6-5 AI 배지 행 · p6-6 사용량 카드·표. 이상하면 고치고 다시. 확인이 끝나면 8081 서버를 끈다.

- [ ] **Step 6: Commit**

```bash
cd /c/kopens/project/Factory3D && git add web/e2e/p6-smoke.mjs README.md
git commit -m "chore: P6 AI 챗봇 실제 화면 확인 스크립트 · README 안내(마스터 키·가짜 게이트웨이)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## 자체 점검 (설계 대비)

| 설계 | Task |
|---|---|
| §1 SDK·모델·생각·effort·fallback·도구 strict·스트리밍·캐시 | 3 |
| §1 대화 상태(서버 메모리·30분·40턴·content 그대로·도면 바꾸면 비움) | 3 · 4 · 5 · 7(useChat) |
| §1 쓰기 도구 = 제안만 · 적용 한 트랜잭션 · change_log · 되돌리기 | 4 · 6 |
| §1 키 보관(AES-GCM·마스터 키·힌트만) · 비용·한도 · 꺼짐 안내 · 권한 | 1 · 6 · 8 |
| §1 테스트는 가짜 게이트웨이 | 3(FakeGateway) · 모든 서버 테스트 |
| §2 V6 표 · 가격표 · 사용자 편집도 change_log | 1 · 2 |
| §3.1 도구 9종 · 겹친 제안 · 오류 결과 · 20회 상한 | 4 · 5 |
| §3.2 시스템 프롬프트 | 4(Prompts) |
| §3.3 API 전부 · 감사 · 오류 문구 | 1 · 5 · 6 |
| §4.1 챗봇 패널 · 제안 카드 · 3D 미리보기 · 꺼짐 · 도면 바꾸면 비움 | 7 · 8 |
| §4.2 관리자 3화면 | 9 |
| §6 테스트 · 실제 화면 확인 | 각 Task · 10 |
