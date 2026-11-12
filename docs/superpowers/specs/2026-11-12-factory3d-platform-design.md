# Factory3D 플랫폼 — 전체 설계

작성 2026-11-12. 2D 도면을 3D 공장으로 불러오고, 도면별 객체 배치·실시간 상황판·생산 동작·AI 챗봇·관리자 기능을 갖춘 웹 플랫폼을 만든다.

- 경로: `C:\kopens\project\Factory3D` (새 폴더 · 새 Git 저장소)
- 출발점: `C:\kopens\project\demo\index.html`(나셀 공장 데모, 단일 HTML)의 코드를 **전부 옮겨** 기능별 모듈로 나눈다. `C:\kopens\project\3D_WEB`(React + Spring Boot 플랫폼)에서 로그인·권한·감사·업로드 코드를 **복사**해 재사용한다. 두 원본은 수정하지 않는다.
- 이 문서는 전체 구조와 단계 분해다. 단계(P1~P7)마다 별도 구현 계획을 쓴다.

## 1. 결정 사항

| 항목 | 결정 |
|---|---|
| 구조 | 풀스택: `web/`(React + Vite + TS + three.js) + `server/`(Spring Boot + MyBatis + PostgreSQL + Flyway) |
| 이식 방식 | demo `index.html` 코드를 TS 모듈로 이식 (iframe 사용 안 함) |
| 배포 | **Docker 없음.** 로컬 PostgreSQL 17 + `java -jar factory3d.jar` (web 빌드 결과를 jar 안에 포함) |
| 도면 형식 | DXF + 이미지(PNG/JPG/PDF). 둘 다 같은 내부 형식 `plan` 으로 변환 |
| 객체 매핑 | 공용 모델 라이브러리 + 도면별 배치. 도면 A 선택 → A 배치만 표시 |
| 3D 모델 형식 | glb · gltf · fbx · obj · stl 업로드 → 브라우저에서 glb 로 변환해 저장 |
| 실시간 데이터 | 서버 가상 MES 생성기 → WebSocket. 나중에 실제 MES 어댑터로 교체 |
| 실행(생산 동작) | 상황판과 **같은 스트림** 이벤트를 3D 애니메이션으로 재생 |
| AI 챗봇 | Claude API(서버 호출, tool use). 변경은 미리보기 → 적용/취소. API 키 등록 시에만 활성 |
| 범위 제외 | demo 의 물류센터 시뮬레이션(경로망·AMR 교통 통제·도크·트럭·컨베이어), 아파트 도면, 데이터 연동 설정 화면 |

## 2. 폴더 구조

```
Factory3D/
├─ web/                    React + Vite + TS + three.js (web/index.html = 진입점)
│  └─ src/
│     ├─ auth/             로그인·비밀번호 변경 (3D_WEB 이식)
│     ├─ layout/           왼쪽 아이콘 레일 · 상단 도면 select + [＋도면 추가]
│     ├─ scene/            렌더러·조명·카메라·재질·후처리 (demo §2)
│     ├─ drawing/          DXF 파서·flatten (demo §1), plan → 3D 벽·가벽·구역
│     ├─ objects/          모델 로더·변환, 배치·편집(격자 스냅·회전·겹침 표시) (demo §4·§6)
│     ├─ dashboard/        상황판 KPI·칩·게이지 애니메이션·서랍 (demo DASH)
│     ├─ production/       실행: 이벤트 → 운반·조립·반출 애니메이션
│     ├─ chat/             AI 챗봇 패널, 변경 미리보기·적용/취소
│     ├─ admin/            관리자 메뉴 화면
│     └─ api/              REST 클라이언트 · WebSocket 클라이언트
├─ server/
│  └─ 패키지: auth · drawing · model · placement · station · live · ai · admin · audit
├─ data/                   업로드 파일 (drawings/ · models/ · thumbnails/)
└─ docs/superpowers/       specs · plans
```

실행:
- 개발: `server/` 는 `gradlew bootRun`(8080), `web/` 는 `npm run dev`(Vite, `/api`·`/ws` 는 8080 으로 프록시)
- 배포: `web` 빌드 → `server` 정적 리소스로 복사 → `java -jar factory3d.jar` + 로컬 PostgreSQL
- DB: 로컬 PostgreSQL 17(`C:\Program Files\PostgreSQL\17`)에 DB `factory3d`, 계정 `factory3d` 생성. 접속 정보는 환경 변수.

## 3. 데이터 흐름

```
[브라우저] ──REST──▶ [Spring Boot] ──▶ PostgreSQL / data/
    ▲                    │
    └──WebSocket─────────┤ ProductionSource (가상 MES 생성기 → 나중에 실제 MES 어댑터)
                         └──▶ Claude API (키는 서버에만 암호화 저장)
```

## 4. 데이터 모델

### 4.1 도면 해석 결과 `plan`

원본(DXF/이미지)과 해석 결과를 분리한다. 3D 는 `plan` 만 보고 그린다. 챗봇의 "도면 인식 오류 수정"도 `plan` 을 고친다. 단위 m, 도면 왼쪽 아래 원점.

```json
{
  "bounds": {"w": 160, "h": 65.8},
  "walls":       [{"id": "w1", "pts": [[0,0],[160,0]], "h": 6, "t": 0.3}],
  "partitions":  [{"id": "p1", "pts": [[40,10],[40,30]], "h": 1.2, "t": 0.5}],
  "zones":       [{"id": "z1", "name": "Hub 조립장", "poly": [[..],[..]], "stationId": "ST-HUB"}],
  "objectHints": [{"id": "h1", "label": "HUB", "x": 52, "y": 18, "rot": 0}]
}
```

- **DXF:** 레이어 인식 규칙으로 분류. 기본 규칙: `WALL`→walls, `PARTITION`→partitions(낮은 가벽, 기본 높이 1.2m·두께 0.5m — 현재 나셀 공장 메인 화면과 동일), `STATION`/`ZONE`→zones, 블록 INSERT · `EQUIP` 레이어 텍스트→objectHints, 나머지→무시. 규칙은 도면마다 관리자 화면에서 편집.
- **이미지(P7):** Claude Vision 이 같은 형식으로 추출, 사용자가 확인·수정 후 확정.
- `objectHints` 는 도면을 처음 불러올 때 **배치로 한 번 변환**되고, 이후엔 배치가 기준이다.

### 4.2 객체 매칭

도면 표기(`label`)를 모델의 별칭 목록(`model.aliases`, 예: `HUB`, `허브`)과 대소문자·공백 무시로 대조한다. 맞으면 그 모델로 배치, 없으면 상자 모양 임시 객체로 배치하고 "미매칭 표기 n개"를 표시한다(나중에 모델을 지정하면 교체).

### 4.3 DB 테이블

| 테이블 | 주요 칸 |
|---|---|
| `app_user` | id, username, display_name, password_hash, role(ADMIN/OPERATOR/VIEWER), enabled, must_change_password, failed_count, locked_until, last_login_at (3D_WEB 동일) |
| `login_history` | id, at, username, result(OK/FAIL/LOCKED/LOGOUT), ip, user_agent |
| `drawing` | id, name, source_type(dxf/image), source_file, plan(jsonb), layer_rules(jsonb), version, created_by, created_at, updated_at |
| `model` | id, name, category(설비/자재/운반), file(glb), source_ext, unit_scale, size(jsonb: w·d·h), thumbnail, aliases(text[]), created_at |
| `placement` | id, drawing_id, model_id(null = 임시 상자), name, x, y, rot, scale, station_id, hint_label |
| `station` | id, drawing_id, name, step_count, target_units, takt_sec, warn_pp(기본 10), delay_pp(기본 20), materials(jsonb) |
| `material_type` | id, name, model_id |
| `change_log` | id, at, username, source(USER/AI), drawing_id, kind, before(jsonb), after(jsonb), reverted |
| `audit_log` | 관리 행위 기록 (3D_WEB 동일) |
| `ai_setting` | api_key_enc, model, monthly_limit_usd, enabled |
| `ai_usage` | id, at, username, model, input_tokens, output_tokens, cost_usd, purpose(chat/vision) |
| `spring_session*` | 세션 (3D_WEB 동일) |

## 5. 기능 상세

### 5.1 도면 불러오기 (P2, 이미지는 P7)

- 상단에 도면 **select box** + **[＋도면 추가]** 버튼. 화면에는 한 번에 도면 1장만 표시.
- 추가: 파일 선택(DXF/이미지) → 업로드 → 서버가 원본 저장 → DXF 는 브라우저 파서로 `plan` 생성 후 저장 → select 에 항목 추가·선택.
- 3D: 외벽은 `walls`, 영역 구분은 `partitions` 로 낮은 가벽, 구역은 바닥 색 + 이름 라벨. demo 의 두 점 스케일 보정·거리 측정·회전/반전 도구를 이식.
- 마지막 선택 도면은 사용자별로 기억.

### 5.2 객체 (P3)

- 도면 불러올 때 `objectHints` → 배치 자동 생성 (4.2 매칭).
- **[객체 추가]**: 3D 파일 선택 → 미리보기(단위 추정·m/cm/mm 수정, 치수 표시, 썸네일 캡처) → glb 로 변환 → 라이브러리 등록 → 현재 도면에 배치. 라이브러리의 기존 모델을 카드로 골라 배치할 수도 있음.
- **도면별 표시**: 도면 A 선택 시 `placement where drawing_id = A` 만 로드. B 로 바꾸면 A 객체는 모두 내리고 B 것만 올림.
- 편집은 demo 기능 그대로: 클릭 = 선택, 정보 패널 **편집** → 드래그 이동(격자 스냅, Shift = 자유), 90° 회전, 격자·차지한 칸(파랑)·겹친 칸(빨강)·칸 수 태그, Esc 로 종료, Ctrl+Z/Y.
- 기본 모델(허브 조립 지그·메인/서브 조립 지그·요 베어링 텐셔너·메인 프레임 조립대·허브·베어링 링·메인 프레임·자재 랙·팔레트·지게차·작업자)은 demo 절차적 모델을 glb 로 내보내 라이브러리 초기 데이터로 넣는다.

### 5.3 상황판 (P4)

- demo 상황판 그대로 이식: KPI 줄(가동·진행중·주의·지연·오늘 완료·계획 달성률·시각), 스테이션 칩(이름·상태 배지·PJT·step·눈금 게이지·실적/목표/계획 대비), 바닥 상태 링, 이벤트 줄, 제작·자재 서랍, 칩 클릭 카메라 이동, 칩 겹침 회피.
- 데이터는 WebSocket 으로 받음 (5.5).
- **게이지 애니메이션**: tick 수신 시 막대가 이전 값→새 값으로 0.6초 보간, 진행 중 step 막대는 맥동, 상태 변경 시 칩·링 색 전환 + 1회 반짝, KPI 숫자 카운트업.
- 구석에 `● LIVE · 가상 데이터` 표시, 연결 끊기면 `재연결 중`.

### 5.4 실행 — 생산 동작 (P5)

같은 스트림의 이벤트를 3D 로 재생한다. 실행 OFF 여도 상황판 숫자는 갱신, ON 이면 동작이 함께 보인다.

| 이벤트 | 3D 동작 |
|---|---|
| `material_in` | 자재 랙에 허브·베어링 링 등이 나타나 쌓임 |
| `move` | 지게차/AGV 가 자재를 들고 통로를 따라 스테이션으로 운반 |
| `step_start` | 지그 회전, 체결 공구 왕복, 용접 불꽃 파티클, 작업자 동작 |
| `step_done` | 조립 중 제품에 부품이 날아와 붙음 (공정률만큼 형상 완성) |
| `unit_done` | 완성품이 출하 구역으로 이동, 칩 +1 |

- 운반 경로: `plan` 의 벽·가벽을 장애물로 한 격자(1m) A* 길찾기. 교통 통제 없음(겹쳐도 허용).
- 동작은 모델 분류(설비/자재/운반)별 기본 동작 → 새로 올린 모델도 자동으로 움직임.

### 5.5 실시간 스트림 (P4)

- 서버 `ProductionSource` 인터페이스. 첫 구현 = 가상 MES 생성기: 도면별로 `station` 기준정보(step 수·택타임·목표)에 따라 생산 진행, 스테이션별 속도 편차(랜덤)로 진행중/주의/지연이 섞임. 서버가 켜져 있는 동안 계속 돌아 모든 사용자가 같은 숫자를 봄.
- 상태 판정: 목표% − 실적% ≤ warn_pp → 진행중, ≤ delay_pp → 주의, 초과 → 지연 (demo 동일).
- WebSocket `/ws/live?drawing={id}`:
  - `snapshot` — 접속 직후 1회: 전체 스테이션 상태·KPI·최근 이벤트 50개
  - `tick` — 1초마다: 스테이션별 실적%·목표%·현재 step·상태, KPI
  - `event` — 발생 즉시: `step_start` · `step_done` · `material_in` · `move` · `unit_done` · `status_change`
- 도면 전환 시 구독 전환. 끊기면 지수 백오프 재접속 후 snapshot 재수신.

### 5.6 AI 챗봇 (P6)

- 서버에서 공식 Anthropic Java SDK 로 호출. 기본 모델 `claude-opus-5-5`, 관리자 화면에서 `claude-sonnet-5-5` / `claude-haiku-5-5` 선택 가능. 거절 대비 서버측 fallback 사용.
- API 키는 관리자가 등록, DB 에 암호화(AES-GCM, 마스터 키는 환경 변수) 저장, 브라우저로 내려가지 않음. **키 미등록 또는 사용 중지 시 챗봇 버튼 비활성** + 안내 문구.
- 도구(서버 정의, tool use): `get_scene`, `move_object`, `rotate_object`, `add_object`, `delete_object`, `rename_object`, `edit_partition`, `edit_zone`, `fix_plan`, `set_station`. 쓰기 도구는 실제로 저장하지 않고 **변경 제안(diff)** 만 쌓는다.
- 흐름: 입력 → 서버 도구 루프(스트리밍) → 답변 글자 단위 표시 + 변경 묶음 전달 → 3D 미리보기(바뀔 객체 반투명·강조, 삭제 대상 빨강) → `변경 n건: 적용 / 취소` → 적용 시 저장 + `change_log`(source=AI) + Ctrl+Z 가능.
- 월 한도 초과 시 호출 차단. 호출마다 `ai_usage` 기록.

### 5.7 이미지 도면 (P7)

- PNG/JPG/PDF 업로드 → 서버가 Claude Vision 에 이미지와 스케일 힌트를 보내 구조화 출력으로 `plan` 수신.
- "인식 결과 확인" 화면: 원본 이미지 위에 벽·가벽·구역·객체를 겹쳐 표시, 손 편집 + 챗봇(`fix_plan`)으로 수정 → 확정 → 5.1 과 같은 경로로 3D.
- API 키가 없으면 이미지 도면 추가 불가(안내).

### 5.8 관리자 메뉴 (`/admin`, ADMIN 전용)

| 메뉴 | 내용 |
|---|---|
| 권한관리 | 사용자 추가·역할·사용 중지·비밀번호 초기화(임시 비밀번호 1회 표시). 마지막 관리자 보호 |
| 로그인 이력 | 성공·실패·잠김·로그아웃, IP·시각, 기간·사용자 필터 |
| 객체관리 | 모델 라이브러리: 업로드·썸네일·분류·별칭·사용 중인 도면·삭제(사용 중이면 경고) |
| 도면 관리 | 도면 목록·이름 변경·삭제, 레이어 인식 규칙 편집 후 다시 해석 |
| 공정·생산 기준정보 | 스테이션별 step 수·목표·택타임·주의/지연 기준, 자재 종류 |
| Claude API 관리 | 키 등록(마스킹 표시)·연결 테스트·모델 선택·월 한도·사용 중지 |
| 변경 이력·AI 사용량 | 변경 목록(사람/AI 구분, before/after, 되돌리기) / 호출 수·토큰·추정 비용(사용자별·일별) |

### 5.9 권한

| 기능 | 조회 | 운전원 | 관리자 |
|---|:-:|:-:|:-:|
| 3D·상황판·실행 보기 | ✔ | ✔ | ✔ |
| 도면 추가·객체 추가/편집·챗봇 | | ✔ | ✔ |
| 관리자 메뉴 | | | ✔ |

로그인 방식은 3D_WEB P2 와 동일: 서버 세션(PostgreSQL), HttpOnly 쿠키, CSRF 토큰, BCrypt, 5회 실패 10분 잠김, 첫 관리자 자동 생성 + 첫 로그인 비밀번호 변경.

## 6. 오류 처리

- API 오류는 한국어 ProblemDetail (401 로그인 필요 / 403 권한 없음 / 409 충돌 / 413 파일 너무 큼 / 422 해석 실패).
- DXF 해석 실패·지원 안 되는 엔터티는 건너뛰고 경고 목록 표시 (DWG·바이너리 DXF 는 거부 + 변환 안내).
- 모델 변환 실패 시 업로드 거부, 원인 표시.
- WebSocket 끊김 → 상단 표시 + 자동 재접속.
- Claude 오류(키 오류·한도·거절·네트워크) → 챗봇 창에 원인별 문구, 변경 제안은 버림.

## 7. 테스트

- 서버: JUnit — DXF→plan 은 브라우저에서 하므로 서버는 plan 검증·저장, 권한, 가상 MES 상태 판정·이벤트 순서, 챗봇 도구가 diff 만 만드는지(Claude 는 가짜 응답).
- 화면: vitest — DXF 파서·flatten, 레이어 규칙 분류, 격자 스냅·겹침, 게이지 보간, 매칭 규칙.
- 실제 화면: Playwright(Edge) 스크린샷 — 도면 전환 시 객체 교체, 가벽 높이, 상황판 애니메이션, 실행 동작 (demo 방식 유지).

## 8. 단계

각 단계는 별도 구현 계획 → 구현 → 사용자 확인.

| 단계 | 내용 | 기능 |
|---|---|---|
| P1 기반 | 폴더·빌드·서버·DB(Flyway), 로그인·권한·로그인 이력(3D_WEB 이식), 레이아웃(레일·도면 select), 권한관리·로그인 이력 화면 | 6 |
| P2 도면 | DXF 업로드 → plan → 3D(벽·가벽·구역), 도면 select·추가, 도면 관리(레이어 규칙), 보정·측정 도구 | 1 |
| P3 객체 | 모델 라이브러리(5개 형식 → glb), 기본 모델 초기 데이터, 도면별 배치, objectHints 자동 배치, 편집 이식, 객체관리 화면 | 2, 6 |
| P4 실시간 | ProductionSource·가상 MES·WebSocket, 상황판 이식 + 게이지 애니메이션, 공정·생산 기준정보 화면 | 3, 6 |
| P5 실행 | 이벤트 → 운반·조립·반출 애니메이션, 격자 길찾기 | 4 |
| P6 AI | Claude API 관리, 챗봇(tool use)·미리보기·적용/취소, change_log·되돌리기, 변경 이력·AI 사용량 화면 | 5, 6 |
| P7 이미지 도면 | Claude Vision → plan, 인식 결과 확인·수정 화면 | 1 |

## 9. 작업 규칙 (사용자 선호, demo HANDOFF §10)

- 한국어로 짧게 소통.
- UI 에 `border-left` 강조선 금지, 이모지 대신 선 SVG 아이콘(lucide).
- 라벨은 화면 기준 약 15px.
- 결과는 스크린샷과 자동 테스트로 확인, 버그는 원인까지 보고.
