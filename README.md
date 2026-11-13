# Factory3D

2D 도면을 3D 공장으로 불러오고, 도면별 객체 배치 · 실시간 상황판 · 생산 동작 · AI 챗봇 · 관리자 기능을 갖춘 웹 플랫폼.
설계: `docs/superpowers/specs/2026-11-12-factory3d-platform-design.md`

## 준비 (한 번)
- Node 20+, Java 17+ (빌드는 17 이상이면 되고 Gradle 이 JDK 21 을 받아 줌), PostgreSQL 17 (localhost:5433)
- jar 를 **실행**하려면 Java 21 이 필요합니다 (예: `~/.gradle/jdks` 아래 JDK)
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

### 도면
- 처음 실행하면 기본 도면 '나셀 공장'(demo 의 main_factory.dxf)이 들어갑니다.
- DXF(ASCII)만 올릴 수 있습니다. DWG 는 ODA File Converter 로 변환하세요.
- 레이어 이름으로 역할을 정합니다: PARTITION/칸막이/가벽 → 낮은 가벽(1.2m), WALL/벽 → 외벽(8m), COLUMN/기둥 → H빔, STATION/ZONE/구역 → 구역, EQUIP/설비 → 객체 표기. 관리자 › 도면 관리에서 도면마다 바꿀 수 있습니다.
- 해석기(web/src/drawing)를 바꾸면 `cd web && npm run seed:plan` 으로 기본 도면 plan 을 다시 만드세요.

### 객체
- 처음 실행하면 기본 모델 11종(설비 5 · 자재 6)과 나셀 공장 배치 79개가 들어갑니다.
- 운전원 이상: 왼쪽 객체 패널에서 카드를 눌러 배치(우클릭 90° 회전, Esc 끝), 객체를 골라 `편집`(끌기, Shift 자유)·회전·삭제, Ctrl+Z / Ctrl+Y.
- `＋ 객체 추가`: glb · gltf · fbx · obj · stl (최대 100MB) → 브라우저에서 glb 로 변환해 등록.
- 도면에 EQUIP/설비 레이어 글자·블록이 있으면 모델 이름·별칭과 맞춰 자동 배치합니다 (없으면 임시 상자).
- 기본 모델을 다시 구우려면 `cd web && npm run bake:models` (Edge 필요), 기본 배치는 `npm run seed:placements`.

### 상황판
- 레일 `상황판`: 도면별 공정 현황 — 위 KPI 줄(가동·진행중·주의·지연·오늘 완료·계획 달성률), 설비 위 스테이션 칩(PJT·step·눈금 게이지·실적/목표), 바닥 상태 링, 아래 이벤트 줄, `제작·자재 현황` 서랍. 칩을 누르면 그 설비로 이동, 다시 누르면 전체 보기.
- 데이터는 서버의 가상 MES 가 1초마다 만듭니다 (모든 사용자가 같은 숫자, WebSocket `/ws/live`). 진행 상태는 메모리라 서버를 다시 켜면 처음 값부터, PJT 제작 수·오늘 완료 수는 DB 에 남습니다.
- 처음 실행하면 나셀 공장에 기본 공정 6개 · PJT 4개가 들어갑니다. 관리자 › 공정·생산 기준정보에서 고치면 상황판이 그 도면을 처음부터 다시 진행합니다.
- 진행 속도는 `F3D_LIVE_TIME_SCALE` (기본 1 = 실제 시간, 화면 확인은 30).

## 배포 (jar 하나 + PostgreSQL)
```
cd server && ./gradlew bootJar      # build/libs/factory3d.jar (화면 포함)
java -jar build/libs/factory3d.jar  # Java 21 필요
```
| 환경 변수 | 기본값 |
|---|---|
| `F3D_DB_URL` | `jdbc:postgresql://localhost:5433/factory3d` |
| `F3D_DB_USER` / `F3D_DB_PASSWORD` | `factory3d` / `factory3d` |
| `F3D_PORT` | `8080` |
| `F3D_DATA_DIR` | `../data` (업로드 파일, 작업 폴더에 따라 달라지므로 jar 배포에서는 절대 경로 권장) |
| `F3D_TIME_ZONE` | `Asia/Seoul` |
| `F3D_ADMIN_PASSWORD` | 비면 임의 생성 |
| `F3D_LIVE_TIME_SCALE` | `1` (상황판 진행 배율) |
| `F3D_LIVE_ORIGINS` | `http://localhost:5200` (WebSocket 허용 출처, 같은 출처는 항상 허용) |

## 테스트
```
cd server && ./gradlew test         # 테스트 DB factory3d_test 를 매번 비우고 씀
cd web && npm test
cd web && node e2e/p1-smoke.mjs http://localhost:8080 <처음 비밀번호> <새 비밀번호>   # 깨끗한 DB 의 실행 중인 서버로 (Microsoft Edge 필요)
cd web && node e2e/p2-smoke.mjs http://localhost:8080 admin <비밀번호>   # 비밀번호 변경을 마친 계정으로: 3D·도면 보기·측정·도면 추가·도면 관리
cd web && node e2e/p3-smoke.mjs http://localhost:8080 admin <비밀번호>   # P2 smoke 다음에: 객체 배치·편집·추가·관리
cd web && node e2e/p4-smoke.mjs http://localhost:8080 admin <비밀번호>   # P3 smoke 다음에, 서버는 F3D_LIVE_TIME_SCALE=30 으로: 상황판·기준정보
```
