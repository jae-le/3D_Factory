# Factory3D P4 — 실시간 상황판 설계

작성 2026-11-13. 전체 설계(`2026-11-12-factory3d-platform-design.md`) §4.3·§5.3·§5.5·§5.8 의 P4 상세. 서버 가상 MES 생성기(ProductionSource) → WebSocket → demo 상황판 이식(KPI 줄·스테이션 칩·바닥 링·이벤트 줄·제작/자재 서랍) + 게이지 애니메이션, 관리자 › 공정·생산 기준정보, 나셀 공장 기본 공정 6개·PJT 4개.

## 1. 결정 사항

| 항목 | 결정 |
|---|---|
| 화면 위치 | 레일 `상황판` → `/dashboard`. 3D 공장 화면과 같은 도면 select(같은 저장값 `f3d:drawing:<user>`)·같은 3D 장면을 쓰되 객체 패널·도면 도구·편집은 없음(보기 전용) |
| 데이터 원천 | 서버 `ProductionSource` 인터페이스, 첫 구현 `VirtualMes`(메모리). 서버가 켜져 있는 동안 공정이 있는 모든 도면을 1초마다 진행 → 모든 사용자가 같은 숫자 |
| 시간 | 1초 tick. 진행 속도 배율 `factory3d.live.time-scale`(환경 변수 `F3D_LIVE_TIME_SCALE`, 기본 1). 화면 확인 때는 크게 |
| 영속 | 기준정보(공정·PJT)는 DB. 진행 상태(실적·목표·이벤트)는 메모리 — 서버 재시작 시 처음 값으로. 단 PJT 제작 수(`project.done`)와 오늘 완료 수는 DB 에 반영 |
| 스테이션 ↔ 3D | `station.placement_name` = 같은 도면 배치 이름 (P3 에서 도면 안 이름 유일). 없거나 못 찾으면 칩만 빠지고 KPI·서랍에는 포함 |
| 전송 | Spring WebSocket(raw, JSON 텍스트). `/ws/live?drawing={id}`. 로그인 세션 필요 |
| 권한 | 상황판 보기 = 조회 이상. 기준정보 편집 = 관리자 |
| 범위 밖 | `move` 이벤트의 3D 운반·조립 애니메이션(P5). P4 는 이벤트를 만들어 보내기만 하고 화면은 이벤트 줄에만 씀 |

## 2. 데이터

### 2.1 DB (Flyway V5)

`project` (PJT, 제작 현황)
| 칸 | 형식 | 설명 |
|---|---|---|
| id | bigserial | |
| drawing_id | bigint not null references drawing on delete cascade | |
| name | varchar(100) not null | `야월해상`, unique (drawing_id, name) |
| done, total | int not null | 0 ≤ done ≤ total, total ≥ 1 |
| period | varchar(40) | `'25.09~'27.03` (자유 글) |
| state | varchar(8) check in ('run','wait','done') | 화면 진행/대기/완료 |
| sort_order | int not null default 0 | |

`station` (공정 기준정보)
| 칸 | 형식 | 설명 |
|---|---|---|
| id | bigserial | |
| drawing_id | bigint not null references drawing on delete cascade | |
| sort_order | int not null | 칩 번호 = 순서 1..n |
| name | varchar(100) not null | unique (drawing_id, name) |
| placement_name | varchar(100) | 칩을 붙일 배치 이름 |
| steps | text[] not null | 공정 step 이름 1~40개 |
| takt_sec | int not null default 1200 | 한 대 계획 공정 시간(초, 60~604800) |
| warn_pp, delay_pp | int not null default 10 / 20 | 0 ≤ warn < delay ≤ 100 |
| project_id | bigint references project on delete set null | |
| counts_project | boolean not null default false | 한 대 완료 시 PJT 제작 수 +1 (메인 스테이션) |
| materials | text[] not null default '{}' | 입고 자재 이름 (자재 입고 이벤트 글, P5 운반 대상) |

`live_daily` (오늘 완료 수)
| 칸 | 형식 |
|---|---|
| drawing_id | bigint references drawing on delete cascade |
| day | date (Asia/Seoul) |
| done | int not null default 0 |
| primary key (drawing_id, day) | |

### 2.2 기본 데이터 (나셀 공장)
demo `DASH_INIT` 과 같음. 공정 6개(순서·이름 = 배치 이름·step 목록 demo `STEPS`·PJT·counts):

| no | name(=placement_name) | steps | PJT | counts | 시작 실적/목표 |
|---|---|---|---|---|---|
| 1 | Hub 조립장 | hub | 야월해상 | 아니오 | 60/68 |
| 2 | Main Station 3 | main | 야월해상 | 예 | 60/66 |
| 3 | Main Station 2 | main | 서남해상 | 예 | 60/88 |
| 4 | Main Station 1 | main | 신안해상 | 예 | 35/52 |
| 5 | Sub_Main Frame 조립장 | frame | 야월해상 | 아니오 | 70/74 |
| 6 | Sub_Yaw Bearing | yaw | 야월해상 | 아니오 | 70/74 |

PJT 4개: 야월해상 3/13 `'25.09~'27.03` 진행 · 서남해상 7/13 `'25.11~'26.06` 진행 · 신안해상 2/13 `'26.01~'26.09` 진행 · 다대포 0/8 `'26.05~'26.12` 대기.
자재: Hub 조립장 `Hub Casting, Pitch Bearing` · Main Station n `Main Frame, Nacelle Frame, Gearbox` · Sub_Main Frame 조립장 `Main Frame` · Sub_Yaw Bearing `Yaw Bearing`.
시드 위치 `server/src/main/resources/seed/main_factory.stations.json`. 시작 순서: 모델 → 도면 → 배치 → 공정. 새 설치: 나셀 공장과 함께 넣음. 기존 설치: system 이 만든 '나셀 공장' 에 공정·PJT 가 0개이고 감사 기록에 그 도면의 `STATION_SEED` 가 없으면 한 번 넣음(감사 `STATION_SEED`).
시작 실적/목표는 시드 json 에만 있는 값(`startActual`,`startTarget`)으로 VirtualMes 가 그 도면을 처음 올릴 때 씀. 다른 공정의 시작값은 `Random(station.id)` 로 실적 30~70, 목표 = 실적 + 0~25.

## 3. 서버

### 3.1 VirtualMes (`live` 패키지)
- `ProductionSource`: `snapshot(drawingId)`, `subscribe(drawingId, listener)`/`unsubscribe`, `reload(drawingId)`.
- 상태(스테이션): `actual`, `target`(%, 실수), `rate`, `step`(1..n), `status`(ok/warn/bad).
- `advance(dtSec)` (테스트에서 직접 부름): 각 스테이션 `target += dt·scale/takt·100`, `actual += dt·scale/takt·100·rate`.
  - step 경계를 넘으면 `step_done`(이전 step) → `step_start`(새 step).
  - `actual ≥ 100` → `unit_done`(PJT·호기) · `actual -= 100`, `target = max(0, target − 100)`, step 1 부터 `step_start`. counts_project 면 PJT done+1 (≤ total, DB 저장), 오늘 완료 +1(DB `live_daily` upsert).
  - 상태 = 목표 − 실적 ≤ warn_pp → ok, ≤ delay_pp → warn, 초과 → bad. 바뀌면 `status_change`.
  - rate: `Random(station.id)` 로 0.70~1.05 시작, 한 대 완료마다 ±0.08 안에서 다시 뽑고 [0.6, 1.1] 로 자름.
  - 자재: 공정마다 다음 입고 시각(60~180초 × 1/scale 무작위) 이 되면 `material_in`(자재 이름 하나) 직후 `move`(from `자재 랙` → to 공정 이름, 자재).
- 이벤트 형식 `{id, at(ISO), kind, station, text, data}` — kind: `step_start`·`step_done`·`unit_done`·`status_change`·`material_in`·`move`. 텍스트 예: `Main Station 2 제작 지연`, `Main Station 2 공정 정상화`, `Main Station 3 · 야월해상 4호기 완료`, `Hub 조립장 1대 조립 완료`, `Main Frame 입고 → Main Station 1`. 최근 50개 보관(도면별).
- KPI: `running`(공정 수) · `ok`/`warn`/`bad` 수 · `doneToday` · `planRate`(= 평균 min(1, 실적/max(1,목표)) ×100, 반올림) · `at`(서버 시각).
- 스케줄: `@Scheduled(fixedRate = 1000)` 이 dt = 실제 경과 초로 `advance`, 그 뒤 구독자에게 `tick`. 도면은 기동 시 공정 있는 것 전부 올림, 기준정보 저장/삭제 시 `reload`(그 도면 상태 처음부터, 구독자에게 새 `snapshot`), 도면 삭제 시 내림.
- 날짜가 바뀌면(Asia/Seoul) 오늘 완료 0 부터.

### 3.2 WebSocket
- `spring-boot-starter-websocket`, `TextWebSocketHandler` at `/ws/live`. 쿼리 `drawing` 숫자 아님/도면 없음 → close 4404. 로그인 안 함 → 핸드셰이크 401 (SecurityConfig 에서 `/ws/**` authenticated).
- 허용 Origin: 같은 출처 + `http://localhost:5200`(개발).
- 메시지:
  - `{"type":"snapshot","drawingId",kpi,stations:[StationLive],projects:[ProjectLive],events:[최근 50, 새 것 먼저],materials:[최근 material_in 20]}`
  - `{"type":"tick",kpi,stations:[StationLive]}` 1초마다
  - `{"type":"event",event}` 발생 즉시 (tick 보다 먼저 보냄), PJT 가 바뀌면 `{"type":"projects",projects}`
- `StationLive = {id,no,name,placementName,steps(이름 목록),step,actual,target,status,projectId,unitNo}` (actual/target 소수 1자리). `ProjectLive = {id,name,done,total,period,state}`.
- 공정 없는 도면 → snapshot 은 빈 목록(연결 유지).
- 보내기 실패·느린 연결: 세션마다 `ConcurrentWebSocketSessionDecorator`(시간 5초·버퍼 512KB).

### 3.3 기준정보 API
| 메서드 | 주소 | 권한 | 내용 |
|---|---|---|---|
| GET | `/api/drawings/{id}/stations` | 조회 | 순서대로 `[{id,no,name,placementName,steps,taktSec,warnPp,delayPp,projectId,countsProject,materials}]` |
| POST | `/api/drawings/{id}/stations` | 관리자 | 한 개 → 201 (맨 뒤 순서) |
| PATCH | `/api/stations/{id}` | 관리자 | 부분 수정 |
| DELETE | `/api/stations/{id}` | 관리자 | 204, 순서 다시 매김 |
| PUT | `/api/drawings/{id}/stations/order` | 관리자 | `[id…]` 전체 순서 |
| GET | `/api/drawings/{id}/projects` | 조회 | |
| POST · PATCH · DELETE | `/api/drawings/{id}/projects`, `/api/projects/{id}` | 관리자 | |
- 검사: 이름 1~100자·중복 409 `같은 이름의 공정이 있습니다.`/`같은 이름의 PJT 가 있습니다.`, steps 1~40개·각 1~100자, takt 60~604800, 0 ≤ warn < delay ≤ 100, project 는 같은 도면, done ≤ total.
- 저장마다 `ProductionSource.reload(drawingId)`. 감사: STATION_CREATE/UPDATE/DELETE/ORDER, PROJECT_CREATE/UPDATE/DELETE.

## 4. 화면

### 4.1 `/dashboard` (DashboardPage)
- 머리글: 도면 select(추가 버튼 없음) · 품질 버튼. 본문 = `FactoryView`(3D 보기 고정) + 배치 객체(보기 전용, 선택 없음) + 덮개.
- 들어오면 카메라 `frameOverview()`: 벽 bbox 가 화면에 꽉 차게, 북쪽 위, 약 70° 내려다봄(demo `frameDash`). 칩 클릭 → 그 설비로 0.6초 이동(`focusObject`), 같은 칩 다시 → 전체 보기.
- **KPI 줄**(왼쪽 위): `공정 상황판 | n 가동 · n 진행중(초록) · n 주의(주황) · n 지연(빨강) · n 오늘 완료 · n% 계획 달성률 | HH:MM:SS`. 숫자는 바뀔 때 0.6초 카운트업.
- **스테이션 칩**(설비 위): demo `chipHtml` 그대로 — 번호·이름·상태 배지 / `PJT #호기 · 제작 d/t` / `k/n step 이름` / 눈금 게이지(막대 1개 = step 1개, 실적만큼 상태 색, 목표 step 막대 길게) + 실적% / `목표 t%` · `계획 대비 ±g%p`. 겹침 회피 = demo `dashFrame` 알고리즘(아래 칩부터, 위 0~2칸 × 좌우 5 후보, 최소 이동), 매 프레임.
- **바닥 링**(3D): 설비 중심, 반지름 = max(sizeX,sizeY)·0.62, 두께 10%, 상태 색(ok `#22c55e` · warn `#f59e0b` · bad `#ef4444`), 투명도 0.6(선택 0.95).
- **이벤트 줄**(아래): 최근 3개(첫 개만 진하게) 아이콘·글·시각 + 오른쪽 `제작·자재 현황` 버튼(서랍 열고 닫기).
- **서랍**(오른쪽, 폭 300): 제작 현황 표(PJT·제작·기간·상태) · 자재 입고 목록 · 이벤트 목록(최근 20).
- **연결 표시**(오른쪽 위): `● LIVE · 가상 데이터`(초록 점) / `재연결 중…`(주황, 깜빡임) / 처음 연결 전 `연결 중…`.
- 공정이 없는 도면: 가운데 안내 `이 도면에는 공정 기준정보가 없습니다` + 관리자에게만 `기준정보 설정` 링크(`/admin/stations?drawing=<id>`).
- 이벤트 아이콘(lucide): unit_done `CircleCheck`(초록) · status_change 지연 `TriangleAlert`(빨강) · 주의 `Bell`(주황) · 정상화 `Info`(회색) · material_in `PackageOpen`(파랑) · move `Truck`(회색) · step_start/step_done 은 이벤트 줄·서랍에 넣지 않음(너무 잦음).

### 4.2 애니메이션
- 게이지: tick 마다 실적·목표를 이전 값 → 새 값으로 0.6초 보간(ease-out cubic), 보간 값으로 막대 채움. 진행 중 step 막대(실적이 걸친 막대)는 맥동(불투명도 1↔0.45, 1.2초 무한, `prefers-reduced-motion` 이면 끔).
- 상태 바뀜: 칩 테두리·배지·링 색이 0.6초 동안 바뀌고 칩이 한 번 반짝(0.8초 box-shadow 펄스).
- 한 대 완료: 실적이 100 → 작은 값으로 내려갈 때는 보간하지 않고 바로(거꾸로 차오르는 모습 방지).
- KPI 숫자 카운트업 0.6초.

### 4.3 WebSocket 클라이언트 (`useLive`)
- `useLive(drawingId)` → `{conn:'connecting'|'live'|'retrying', data: LiveState|null}`. reducer: snapshot 은 통째로, tick 은 kpi·stations 교체, event 는 앞에 붙이고 50개 자름(material_in 은 materials 에도), projects 교체.
- 끊기면 1·2·4·8·16·30초(최대) 지수 백오프 재접속, 접속되면 snapshot 다시 받음. 도면 바뀌면 닫고 새로. 4404 면 재접속 안 함.
- 개발 서버: Vite `/ws` 프록시(이미 있음). 주소 `ws(s)://<host>/ws/live?drawing=<id>`.

### 4.4 관리자 › 공정·생산 기준정보 (`/admin/stations`)
- 탭 이름 `공정·생산 기준정보`. 위에 도면 select(`?drawing=` 쿼리 우선).
- **PJT 표**: 이름·제작(done/total)·기간·상태·[수정][삭제], `＋ PJT 추가`. 수정은 같은 줄 대화 창.
- **공정 표**: 번호·이름·연결 설비·step 수·택타임(분)·주의/지연(%p)·PJT·[위][아래][수정][삭제], `＋ 공정 추가`.
- 공정 대화 창: 이름 · 연결 설비(그 도면 배치 이름 select + `없음`) · PJT select · `완료 시 PJT 제작 수에 셈` 체크 · step(한 줄에 하나, textarea) · 택타임(분, 1~10080) · 주의/지연 기준(%p) · 입고 자재(쉼표). 오류는 창 안 한국어.
- 저장하면 상황판이 그 도면을 처음부터 다시 진행한다는 안내 문구를 창 아래에 작게.

## 5. 3D 장면 추가 (FactoryScene)
- `setRings(rings: {id,x,y,r,color,strong}[])` — 도면 root 아래 바닥 링(색은 0.6초 보간).
- `onFrame(cb: ((project: (x,y,h)=>{sx,sy,visible}) => void) | null)` — 매 렌더 후 부름, plan 좌표 → 화면 px.
- `frameOverview()` — demo frameDash.
- `objectTop(id)` — 배치 메쉬의 bbox 최고 높이(칩 기준점).
- `setInteractive(false)` — 선택·끌기 끔(상황판은 보기 전용).

## 6. 화면 코드 구조
```
web/src/dashboard/
  types.ts           LiveState · StationLive · ProjectLive · LiveEvent · Kpi
  liveReducer.ts     메시지 → 상태 (순수, 테스트)
  useLive.ts         WebSocket · 백오프 (가짜 WebSocket 테스트)
  status.ts          상태 색·이름·이벤트 아이콘 표
  gauge.ts           gaugeCells(n, actual, target) · stepOf (순수)
  tween.ts           ease · useTweened(value, ms, {snapDown}) · useCountUp
  chipLayout.ts      demo dashFrame 겹침 회피 (순수)
  KpiBar.tsx · StationChip.tsx · ChipLayer.tsx · EventTicker.tsx · LiveDrawer.tsx · LiveBadge.tsx
web/src/pages/DashboardPage.tsx · pages/admin/StationsPage.tsx (+ api: web/src/dashboard/api.ts)
web/src/scene/ringLayer.ts (+ FactoryScene 추가)
server/.../live/ ProductionSource · VirtualMes · LiveState 클래스들 · LiveSocketHandler · WebSocketConfig
server/.../station/ Station·Project 매퍼·서비스·컨트롤러 · StationSeeder
```

## 7. 테스트
- 서버(JUnit): 상태 판정 경계(10/20), advance — step 경계 이벤트 순서(step_done→step_start), 100% → unit_done·PJT +1·오늘 완료 +1·actual 넘침 이어짐, status_change 한 번만, time-scale 반영, reload 초기화. API 권한(조회 GET, 관리자만 쓰기)·검사·409·순서. 시드(새·기존 설치·재실행 중복 없음). WebSocket: 로그인 안 하면 거부, 접속 → snapshot 먼저 → tick.
- 웹(vitest): liveReducer, useLive 백오프(가짜 타이머·가짜 WebSocket)·4404, gaugeCells, tween(snapDown), chipLayout(겹침 없음·최소 이동), KpiBar·StationChip·EventTicker·LiveDrawer 렌더, DashboardPage(가짜 useLive) 빈 공정 안내, 관리자 공정 화면(추가·검사 오류·순서).
- 실제 화면(Edge, `F3D_LIVE_TIME_SCALE=30`): 상황판 6칩·KPI `6 가동`, 몇 초 뒤 실적 값 바뀜, 칩 클릭 이동, 서랍, 관리자에서 공정 택타임 수정 → 상황판 반영, 3D 공장 화면 회귀 — 스크린샷.
