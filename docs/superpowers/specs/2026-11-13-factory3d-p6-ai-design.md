# Factory3D P6 — AI 챗봇 설계

작성 2026-11-13. 전체 설계 §4.3·§5.6·§5.8 의 P6 상세. 순서 변경: P6 → P7 → P5(실행은 마지막). 3D 공장 화면 옆 AI 챗봇 패널에서 한국어로 요청하면 Claude 가 서버 도구로 장면을 읽고 **변경 제안**만 만든다 → 3D 미리보기 → `적용 / 취소` → 적용 시 저장 + 변경 이력(사람/AI) + 되돌리기. 관리자 › Claude API 관리 · 변경 이력 · AI 사용량.

## 1. 결정 사항

| 항목 | 결정 |
|---|---|
| 호출 | 서버(Spring)에서 공식 Anthropic Java SDK(`com.anthropic:anthropic-java`, 최신 안정판 — 계획 단계에서 Maven Central 로 확인) 로만. 브라우저는 Claude 를 직접 부르지 않음 |
| 모델 | 기본 `claude-opus-5-5`, 관리자가 `claude-sonnet-5-5` / `claude-haiku-5-5` 로 바꿀 수 있음. 날짜 접미사 없는 정확한 ID |
| 생각·노력 | 적응형 생각(Opus 5.5 는 생략 = 적응형), `output_config.effort = medium` 을 명시. `budget_tokens`·생각 끄기·온도 안 씀(400) |
| 거절 대비 | 서버측 fallback: beta `server-side-fallback-2026-07-01` + `fallbacks: "default"` (beta 메시지 엔드포인트). `stop_reason == refusal` 이면 그 턴의 제안은 버리고 `요청을 처리할 수 없습니다 (사유: …)` |
| 도구 호출 방식 | 직접 도는 도구 루프(서버가 매 턴 도구 실행). `tool_choice` 는 `auto` 만(Opus/Sonnet 5.5 는 강제 400). 각 도구 `strict: true` + `additionalProperties: false` |
| 스트리밍 | 서버 → Claude 는 스트리밍(`createStreaming`), 서버 → 브라우저는 SSE(`text/event-stream`): 글자 조각 · 도구 진행 · 제안 묶음 · 끝/오류 |
| 대화 상태 | 서버 메모리, 사용자·도면별 대화 1개(최근 30분 안 쓰면 비움, 최대 40턴). 응답의 content 블록을 **그대로**(생각 블록 포함) 다음 요청에 붙임. 도면을 바꾸거나 `새 대화` 면 비움 |
| 캐시 | 시스템 프롬프트(고정 문구) + 도구 목록 고정 → 시스템 블록에 `cache_control` (5분). 시각·도면 이름 같은 바뀌는 값은 시스템에 넣지 않고 첫 사용자 메시지 앞에 |
| 쓰기 도구 | 실제 저장 안 함 → 대화의 `제안 묶음`(changeset)에 쌓고 도구 결과로 `제안 #n 기록됨 (아직 적용 안 됨)` |
| 적용 | 사용자가 `적용` → 서버가 한 트랜잭션으로 기존 서비스(배치·공정·plan) 호출 + `change_log`(source AI, 묶음 id) → 화면 다시 불러옴. `되돌리기` = 그 묶음의 before 로 역적용(change_log 에 reverted) |
| 키 보관 | 관리자가 등록, AES-GCM 암호화로 `ai_setting.api_key_enc`. 마스터 키는 환경 변수 `F3D_AI_MASTER_KEY`(base64 32바이트). 없으면 키 등록 불가 안내. 키는 브라우저로 안 감(마스킹 `sk-ant-…abcd` 만) |
| 비용·한도 | 호출마다 `ai_usage`(입력·출력·캐시 읽기/쓰기 토큰, 추정 비용). 이번 달 합계가 `monthly_limit_usd` 이상이면 호출 막음 `이번 달 AI 사용 한도를 넘었습니다` |
| 꺼짐 | 키 없음·사용 중지·마스터 키 없음 → 레일 `AI 챗봇` 버튼 비활성 + 안내(title) |
| 권한 | 챗봇 = 운전원 이상(쓰기 제안·적용). 조회는 버튼 비활성. 관리자 메뉴 = 관리자 |
| 테스트 | Claude 호출은 `ClaudeGateway` 인터페이스 뒤. 테스트·화면 확인은 가짜(`factory3d.ai.fake=true`) — 정해 둔 응답 대본으로 도구 호출·글자 조각을 흉내. 실제 키로는 관리자 `연결 테스트` 만 |

## 2. 데이터 (Flyway V6)

`ai_setting` (한 줄, id=1)
| 칸 | 형식 |
|---|---|
| api_key_enc | bytea (null = 미등록) |
| key_hint | varchar(16) (`…abcd`) |
| model | varchar(40) not null default 'claude-opus-5-5' check in (opus-5-5, sonnet-5-5, haiku-5-5) |
| monthly_limit_usd | numeric(10,2) not null default 50 |
| enabled | boolean not null default false |
| updated_by, updated_at | |

`ai_usage`: id, at, username, drawing_id, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd numeric(12,6), purpose varchar(16) ('chat','test','vision').

`change_log`: id, at, username, source varchar(4) check in ('USER','AI'), drawing_id references drawing on delete cascade, batch_id uuid (AI 묶음 · 사용자 1건이면 새 uuid), kind varchar(32) (`placement.move` · `placement.rotate` · `placement.add` · `placement.delete` · `placement.rename` · `station.update` · `plan.partition.add` · `plan.partition.delete` · `plan.zone.rename`), target varchar(100), before jsonb, after jsonb, reverted boolean not null default false, reverted_by, reverted_at.
- 사용자 편집도 기록: PlacementService 의 추가·수정·삭제가 change_log(USER) 를 남김(같은 트랜잭션).

가격표(USD / 1M 토큰, 코드 상수): opus-5-5 입력 4 · 출력 20 · 캐시 읽기 0.20 · 캐시 쓰기 5(1.25배), sonnet-5-5 2 · 10 · 0.10 · 2.5, haiku-5-5 0.10 · 0.50 · 0.01 · 0.125.

## 3. 서버 (`ai` 패키지)

### 3.1 도구 (Claude 에게 주는 것)
| 이름 | 종류 | 입력 | 하는 일 |
|---|---|---|---|
| `get_scene` | 읽기 | `{}` | 도면 이름·크기(m), 구역(id·이름·꼭짓점 요약), 가벽 목록(id·두 점), 배치(id·이름·모델·분류·x·y·rot·크기), 공정(이름·연결 설비·step 수·택타임·PJT), 모델 목록(이름·분류·크기) — 600개 넘으면 앞 600 + `생략 n` |
| `move_object` | 쓰기 | `{name, x, y}` 또는 `{name, dx, dy}` | 배치 이동 제안 (도면 경계 안 검사) |
| `rotate_object` | 쓰기 | `{name, rot}` (도) | 회전 제안 |
| `add_object` | 쓰기 | `{model, name?, x, y, rot?}` | 추가 제안 (모델 이름·별칭으로 찾음, 이름 없으면 `<모델> n`) |
| `delete_object` | 쓰기 | `{name}` | 삭제 제안 |
| `rename_object` | 쓰기 | `{name, newName}` | 이름 바꾸기 제안 (중복 검사) |
| `set_station` | 쓰기 | `{name, taktMin?, warnPp?, delayPp?, placementName?}` | 공정 기준정보 변경 제안 (관리자만 적용 가능 — 운전원이 적용하려 하면 그 항목은 403 안내) |
| `edit_partition` | 쓰기 | `{op: add, a:[x,y], b:[x,y]}` / `{op: delete, id}` | 가벽 추가·삭제 제안 (plan 수정) |
| `rename_zone` | 쓰기 | `{id, name}` | 구역 이름 바꾸기 제안 |
- 쓰기 도구는 입력을 검사하고(없는 이름 → `is_error` 결과로 이유), 같은 대상의 앞선 제안 위에 겹쳐 계산(제안 2개가 같은 객체를 옮기면 마지막 값).
- 도구 실행 결과는 짧은 한국어 JSON 문자열.
- 루프 상한: 한 요청에 도구 호출 20회. 넘으면 멈추고 `작업이 길어 중간에 멈췄습니다`.

### 3.2 시스템 프롬프트 (고정)
- 역할: 공장 도면 3D 편집 보조. 좌표계(plan m, 왼쪽 아래 원점, y 위쪽, rot 도 반시계). 먼저 `get_scene` 으로 확인하고, 바꿀 때는 쓰기 도구로 **제안만** 한다는 것, 제안 뒤에 한국어로 무엇을 바꾸는지 짧게 정리. 모르는 이름은 묻기. 답은 한국어, 3~6문장.

### 3.3 API
| 메서드 | 주소 | 권한 | 내용 |
|---|---|---|---|
| GET | `/api/ai/status` | 조회 | `{enabled, reason?}` — reason: `no-key`·`disabled`·`no-master-key`·`over-limit` |
| POST | `/api/ai/chat` | 운전원 | `{drawingId, message}` → SSE: `text`(글자 조각) · `tool`(`{name, label}` 진행 표시) · `proposal`(묶음 전체 `{id, items:[{seq, kind, target, before, after, label}]}`) · `done`(`{usage}`) · `error`(`{message}`) |
| POST | `/api/ai/chat/reset` | 운전원 | `{drawingId}` 대화·제안 비움 |
| POST | `/api/ai/changes/{batchId}/apply` | 운전원 | 제안 묶음 적용 → `{applied, skipped:[{seq, reason}]}` (공정 항목은 관리자 아니면 skipped) |
| POST | `/api/ai/changes/{batchId}/discard` | 운전원 | 버림 |
| POST | `/api/changes/{batchId}/revert` | 운전원(자기 도면 묶음) · 관리자 | 묶음 되돌리기 (그 뒤에 같은 대상을 바꾼 이력이 있으면 409 `이후에 바뀐 객체가 있어 되돌릴 수 없습니다`) |
| GET | `/api/changes?drawingId&source&from&to&page` | 관리자 | 변경 이력 |
| GET/PUT | `/api/admin/ai` | 관리자 | 설정 보기(키는 hint 만) / 모델·한도·사용 여부 |
| PUT/DELETE | `/api/admin/ai/key` | 관리자 | 키 등록(`{apiKey}`) / 삭제 |
| POST | `/api/admin/ai/test` | 관리자 | 짧은 호출로 연결 확인 → `{ok, model, latencyMs}` 또는 원인별 오류(키 오류·한도·네트워크) |
| GET | `/api/admin/ai/usage?from&to&group=day|user` | 관리자 | 호출 수·토큰·비용 |
- 감사: AI_KEY_SET · AI_KEY_DELETE · AI_SETTING · AI_APPLY · CHANGE_REVERT.
- 오류 문구(한국어): 키 오류(401) `API 키가 올바르지 않습니다`, 429 `잠시 뒤 다시 시도하세요 (요청이 많습니다)`, 5xx/연결 `Claude 서버에 연결하지 못했습니다`, 한도, 거절. SDK 의 타입별 예외로 구분(문자열 비교 금지).

## 4. 화면

### 4.1 챗봇 패널 (3D 공장 화면)
- 레일 `AI 챗봇` → 3D 공장 화면(`/`)에서 객체 패널과 같은 자리(레일 옆 전체 높이, 접기)에 **AI 챗봇 패널**. 객체 패널과 동시에는 하나만(레일에서 고른 것).
- 머리: `AI 챗봇` · `새 대화`. 본문: 말풍선(사용자 오른쪽 · AI 왼쪽), AI 글자는 흘러나오듯(SSE), 도구 진행 줄(`장면 확인 중…`, `Main Station 1 이동 제안`). 아래 입력칸(Enter 보내기, Shift+Enter 줄바꿈, 보내는 중 잠금, 2000자).
- 제안 카드: `변경 n건` + 항목 목록(아이콘 · `Main Station 1 이동 (85.2, 41.0) → (87.2, 41.0)`), 버튼 `적용` `취소`. 적용 뒤 `적용됨 · 되돌리기`, 일부 건너뜀은 이유 표시.
- 3D 미리보기(제안 카드가 열려 있는 동안): 옮김·회전 = 새 자리에 반투명 파란 유령 + 원래 자리 점선 테두리, 추가 = 반투명 초록 유령, 삭제 = 빨간 반투명 덮개, 이름 바꿈 = 이름표만. 가벽 추가 = 반투명 주황 벽, 삭제 = 빨간 벽. 항목에 마우스 → 그 대상 강조 + 카메라 이동(클릭).
- 꺼짐: 레일 버튼 비활성, title `AI 챗봇 — Claude API 키가 등록되지 않았습니다 (관리자 › Claude API 관리)` 등 reason 별.
- 대화·제안은 도면을 바꾸면 비움(서버도 reset).

### 4.2 관리자
- `Claude API 관리`: 키 상태(`등록됨 …abcd` / `미등록`), 키 입력(비밀번호 칸) `등록` · `삭제`, `연결 테스트`(결과·지연), 모델 select(Opus 5.5 · Sonnet 5.5 · Haiku 5.5, 가격 한 줄), 월 한도(USD), 사용 on/off. 마스터 키 없으면 위에 경고 `F3D_AI_MASTER_KEY 가 설정되지 않아 키를 저장할 수 없습니다`.
- `변경 이력`: 표(시각 · 사용자 · 출처 배지 사람/AI · 도면 · 종류 · 대상 · 요약), 필터(도면·출처·기간), 행 펼치면 before/after JSON, 묶음 `되돌리기`(확인 창).
- `AI 사용량`: 이번 달 합계 카드(호출·토큰·비용/한도 막대), 일별 표 · 사용자별 표.

## 5. 코드 구조
```
server/.../ai/ AiSetting(Mapper·Service·Controller) · KeyCrypto(AES-GCM) · ClaudeGateway(인터페이스) · AnthropicGateway(SDK) · FakeGateway(대본)
              ChatService(대화·루프·SSE) · SceneTools(도구 정의·실행) · ProposalStore · ApplyService · Pricing · AiUsage(Mapper·Service)
server/.../change/ ChangeLog(Mapper·Service·Controller) · PlacementService 에 USER 기록
web/src/ai/ api.ts · useAiStatus.ts · useChat.ts(SSE fetch 읽기) · ChatPanel.tsx · ProposalCard.tsx · previewLayer(3D 유령) · types.ts
web/src/pages/admin/ AiSettingsPage.tsx · ChangesPage.tsx · AiUsagePage.tsx
```

## 6. 테스트
- 서버(JUnit, 가짜 게이트웨이): 키 암호화 왕복·마스터 키 없음, 상태 reason, 도구 실행(검사 오류·겹치는 제안·경계), 루프 상한, 쓰기 도구가 DB 를 안 바꿈, 적용 트랜잭션(배치·공정·plan) + change_log(AI 묶음), 공정 항목 운전원 skipped, 되돌리기(409 조건), 사용자 편집 change_log(USER), 사용량·월 한도 차단, 거절 응답 처리, SSE 이벤트 순서, 권한.
- 웹(vitest): SSE 파서(조각 나뉜 줄), useChat 상태, ChatPanel(보내기·잠금·제안 카드·적용/취소·되돌리기), 미리보기 레이어(유령 종류별), 관리자 3화면, 레일 비활성 안내.
- 실제 화면(Edge, 8081·테스트 DB, `F3D_AI_FAKE=true`, 마스터 키 테스트 값): 키 없을 때 비활성 → 관리자 키 등록 → 챗봇에서 `Main Station 1 을 오른쪽으로 2m 옮겨줘` → 유령 미리보기 → 적용 → 위치 바뀜 → 변경 이력 AI 1건 → 되돌리기 — 스크린샷. 이전 smoke 회귀.
