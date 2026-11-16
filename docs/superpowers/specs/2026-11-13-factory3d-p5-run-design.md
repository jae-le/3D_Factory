# Factory3D P5 — 실행(생산 동작) 설계

> **상태: 보류(2026-11-16).** 기록만 해 두고 구현하지 않기로 함. 다시 시작하면 Flyway 번호는 V6 → V7(P6가 V6 사용), 구현 계획부터 작성.

작성 2026-11-13. 전체 설계 §5.4 의 P5 상세. P4 실시간 스트림의 이벤트(`material_in`·`move`·`step_start`·`step_done`·`unit_done`)를 3D 동작으로 재생한다. 실행을 꺼도 상황판 숫자는 그대로 갱신되고, 켜면 동작이 함께 보인다.

## 1. 결정 사항

| 항목 | 결정 |
|---|---|
| 화면 | 상황판 화면에 `실행` 켜기/끄기. 레일 `실행` = `/run` (상황판 + 실행 켬), `상황판` = `/dashboard` (실행 끔). 머리글 `실행` 버튼으로 두 주소를 오감. 레일 강조도 주소를 따름 |
| 이벤트 받기 | `useLive` 에 이벤트 구독(`onEvent`) 추가 — reducer 가 버리는 `step_*` 도 여기로 옴. 상태(data)는 P4 그대로 |
| 시간 | 서버 snapshot 에 `timeScale` 추가. 화면 동작 속도 배율 = `min(timeScale, 8)` (실제 속도 × 배율). 배율 1 이면 지게차 2.5 m/s |
| 운반 객체 | demo `makeMoverMesh` 의 지게차·작업자·AMR 을 glb 로 구워 기본 모델(분류 `운반`)에 추가 → 14종. 화면은 모델 이름(`지게차`·`작업자`)으로 찾고, 없으면 단순 상자 |
| 운반 경로 | plan 의 외벽·가벽 + 설비(분류 설비) 바닥 사각형을 막힌 칸으로 한 1 m 격자 A*(8방향, 대각선은 양옆이 비었을 때만) → 시선 검사로 꺾임 줄이기. 출발·도착 칸 주변은 엶. 경로 없으면 직선 |
| 자재 출발지 | 같은 도면에서 이름에 `랙` 이 들어가거나 모델이 `긴 자재 랙` 인 배치 중 도착 공정에 가장 가까운 것. 없으면 도면 아래쪽 가운데 바깥 |
| 제품 형상 | 공정마다 `제품 모델`(기준정보 새 칸, 기본: Hub 조립장 = 허브, Main Station n·Sub_Main Frame 조립장 = 메인 프레임, Sub_Yaw Bearing = 베어링 링). 설비 가운데에 놓고 실적%만큼 아래부터 보이게(클리핑) |
| 출하 | `unit_done` → 완성품이 이름에 `출하` 가 든 구역(없으면 도면 아래쪽 가운데 바깥)으로 미끄러져 가며 사라짐 |
| 성능 | 지게차 최대 3대(대기 줄 6, 넘치면 버림), 동시 불꽃 6곳, 탭이 숨으면 동작을 쌓지 않고 버림. 실행 끄면 모두 정리 |
| 범위 밖 | 교통 통제·충돌 회피(겹쳐도 허용), 실제 MES |

## 2. 서버

### 2.1 timeScale
- `LiveMessages.Snapshot` 에 `timeScale`(double, `factory3d.live.time-scale`) 추가. 화면 `types.ts` 도.

### 2.2 기본 모델 3종 추가
- `seed/models/{forklift,worker,amr}/model.glb·thumb.png`, `models.json` 에 `{key, name: 지게차|작업자|AMR, category: mover, aliases: FORKLIFT|WORKER|AMR}`.
- `ModelSeeder`: 모델이 0개면 전부(14종). 이미 있으면 기본 키 중 같은 이름 모델이 없고 감사 기록에 그 키의 `MODEL_SEED` 가 없는 것만 넣음(감사 `MODEL_SEED`, target `key=<key>`). 기존 설치에 3종이 한 번 추가되고, 관리자가 지우면 다시 안 생김.

### 2.3 공정 제품 모델 (Flyway V6)
- `station.product_model_id bigint references model on delete set null`.
- API: StationView·입력에 `productModelId` (+ `clearProduct`). 같은 모델 존재 검사 400 `모델을 찾을 수 없습니다.`
- 시드: 위 기본값(모델 이름으로 찾음). 기존 설치: system 나셀 공장의 공정 중 product 가 null 이고 감사 `STATION_PRODUCT_SEED` 가 없으면 한 번 채움.
- 관리자 공정 대화 창에 `제품 모델` select(모델 목록, `없음`).

### 2.4 정리 (P4 최종 리뷰 남은 일)
- VirtualMes 의 DB 쓰기(`persistDone`·`persistDaily`)를 잠금 밖으로: 잠금 안에서는 쓸 값만 모으고, 잠금 풀린 뒤 씀.

## 3. 화면

### 3.1 실행 켜기
- DashboardPage `run` (주소 `/run`). 머리글에 `실행` 버튼(Play/Pause 아이콘, aria-pressed). 켜면 `MotionLayer` 를 장면에 붙이고 `onEvent` 를 연결, 끄면 떼고 정리.
- 실행 중 오른쪽 위 연결 표시 옆에 `실행 중 ×배율` 작은 표시.

### 3.2 MotionLayer (scene, three)
FactoryScene 에 `MotionHost`: `setMotion(m: MotionLayer | null)`, 매 프레임 `motion.update(dt)`. MotionLayer 는 root 아래 그룹 하나를 갖고 plan 좌표로 일한다.

| 이벤트 | 동작 |
|---|---|
| `material_in` (station, 자재) | 출발지 랙 앞에 팔레트 상자가 0.4초 동안 커지며 나타나 쌓임(랙마다 최대 6개 보이기) |
| `move` (자재, 랙 → 공정) | 쉬는 지게차(없으면 랙 옆에서 생겨남)가 랙으로 가서 상자를 싣고(0.6초) A* 경로로 공정 앞까지, 상자를 내려놓고(공정 옆 바닥, 0.6초 후 사라짐) 랙 옆 대기 자리로 돌아감. 진행 방향으로 회전(0.25초 보간) |
| `step_start` | 그 공정에 작업자 1명(없으면 생성, 설비 옆에 섬)이 작업 동작(몸 앞뒤 흔들기·팔 위아래, 1.2초 주기). step 이 진행되는 동안 설비 가운데 높이에서 용접 불꽃(작은 노란·주황 점 20개, 1초 수명, 0.15초마다 몇 개) |
| `step_done` | 공정 옆에서 작은 부품(상자 0.4 m)이 포물선으로 제품 쪽으로 날아가 붙고(0.7초) 사라짐. 제품 형상 높이가 새 실적%로 올라감 |
| `unit_done` | 완성 제품이 위로 0.3 m 들리고 출하 쪽으로 미끄러지며(속도 4 m/s × 배율) 흐려져 사라짐. 그 자리에는 빈 제품(0%)부터 다시 |

- 제품 형상: 실행 켤 때 각 공정 설비 가운데에 제품 모델을 놓고, tick 의 `actual` 을 0.6초 보간해 클리핑 높이(바닥 0 → 모델 높이)로. 재질은 복제해 `clippingPlanes` 사용(renderer.localClippingEnabled = true).
- 경로 격자는 도면·배치가 바뀔 때만 다시 만듦(웹 워커 없이, 1 m 격자 기준 167×89 ≈ 1.5만 칸이면 충분히 빠름).
- 모든 시간은 `dt × 배율`. 탭이 숨겨진 동안(`document.hidden`) 들어온 이벤트는 버리고, 진행 중인 동작은 끝 상태로 건너뜀.

### 3.3 코드 구조
```
web/src/run/
  grid.ts          plan + 배치 → 막힌 칸 격자 (순수, 테스트)
  astar.ts         A* 8방향 + 시선 단순화 (순수, 테스트)
  anchors.ts       랙·출하 자리·공정 앞 자리·작업자 자리 찾기 (순수, 테스트)
  tasks.ts         이벤트 → 동작 작업 큐 (지게차 배정·대기 줄·버림 규칙, 순수, 테스트)
  tracks.ts        경로 따라가기·보간·포물선 (순수, 테스트)
  motionLayer.ts   three 객체(지게차·작업자·상자·불꽃·제품)와 update(dt)
web/src/dashboard/useLive.ts (onEvent) · types.ts (timeScale)
web/src/pages/DashboardPage.tsx (run) · routes.tsx (/run) · layout/IconRail.tsx (실행 열기)
web/src/pages/admin/StationsPage.tsx · stationForm.ts (제품 모델)
web/src/objects/builtin/ (moverMesh.ts — demo makeMoverMesh 이식, 굽기 전용) · scripts/bake-models.mjs (3종 추가)
server: LiveMessages(timeScale) · VirtualMes(DB 쓰기 잠금 밖) · ModelSeeder(빠진 기본 모델) · V6 · Station*(productModelId) · StationSeeder(제품 기본값)
```

## 4. 테스트
- 웹(vitest): grid(벽·가벽 선분이 막는 칸, 설비 사각형, 출발·도착 열기), astar(우회·대각선 모서리 금지·경로 없음 → null·단순화가 벽을 넘지 않음), anchors(랙 고르기·출하 구역·없을 때 대체), tasks(지게차 3대·대기 6·넘치면 버림·숨은 탭 버림), tracks(일정 속도 진행·회전 보간·포물선 끝점), useLive onEvent(step 이벤트 포함), DashboardPage 실행 켜기/끄기(가짜 장면에 setMotion), 관리자 제품 모델 선택.
- 서버(JUnit): snapshot timeScale, ModelSeeder(새 설치 14 · 기존 설치 3 추가 · 지운 뒤 재실행 시 안 생김), V6·productModelId API(검사·clear), 제품 시드(새·기존·재실행), VirtualMes 의 DB 쓰기가 잠금 밖(쓰기 중 snapshot 이 막히지 않음).
- 실제 화면(Edge, 배율 30): `/run` 에서 몇 초 안에 지게차가 움직이고, 작업자·불꽃·제품 형상이 보이며, 실행을 끄면 사라짐 — 스크린샷. P1~P4 smoke 회귀.
