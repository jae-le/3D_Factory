# Factory3D P2 — 도면 불러오기 설계

작성 2026-11-12. 전체 설계(`2026-11-12-factory3d-platform-design.md`) §5.1·§4.1 의 P2 상세. DXF 도면을 올리면 3D 공장(외벽·낮은 가벽·기둥·구역·바닥 선)으로 보여 주고, 보정·회전·측정 도구와 관리자 도면 관리를 제공한다. 이미지 도면은 P7.

## 1. 결정 사항

| 항목 | 결정 |
|---|---|
| 3D 구조 | three.js 엔진 클래스(`scene/FactoryScene.ts`) + React 는 명령만 보냄 (3D_WEB `twin/engine.ts` 방식). react-three-fiber 안 씀 |
| three.js | npm `three@0.186.1` (3D_WEB 과 같은 버전), CDN 안 씀 |
| DXF 해석 위치 | 브라우저. demo `parseDxf`·`flatten`(순수 함수, 약 250줄) 이식 |
| 기본 도면 | 서버 첫 실행 때 도면이 0개면 demo `main_factory.dxf` 를 "나셀 공장" 으로 자동 등록 |
| 보정·회전·반전 | 도면(서버)에 저장 → 모든 사용자 동일. 운전원 이상 |
| 제외 | demo 의 랙·문·창 모드, 경로망·물류 시뮬레이션, 도크·트럭, 이미지 도면(P7) |

## 2. `plan` 형식 (전체 설계 §4.1 확장)

DXF 원본과 분리한 해석 결과. 3D 는 `plan` 만 보고 그린다. 좌표 단위 m, 원점 = 도면 bbox 최소점(x 오른쪽, y 위쪽).

```json
{
  "format": 1,
  "unit": "mm",
  "scale": 0.001,
  "rotQ": 0,
  "flip": 1,
  "bounds": {"w": 160.0, "h": 65.8},
  "layers": [{"name": "WALL", "color": "#ffffff", "count": 120, "role": "wall", "height": 8, "thickness": 0.2}],
  "lines":  [{"layer": "STATION", "pts": [[1.2, 3.4], [5.6, 3.4]], "closed": false}],
  "texts":  [{"layer": "STATION", "x": 10.1, "y": 20.2, "h": 0.8, "rot": 0, "str": "Hub 조립장", "ha": 1, "va": 2}],
  "walls":       [{"id": "w1", "pts": [[0, 0], [160, 0]], "h": 8, "t": 0.2}],
  "partitions":  [{"id": "p1", "pts": [[40, 10], [40, 30]], "h": 1.2, "t": 0.5}],
  "columns":     [{"id": "c1", "x": 12, "y": 6, "w": 0.6, "d": 0.6, "h": 9.5}],
  "zones":       [{"id": "z1", "name": "Hub 조립장", "poly": [[..], [..]], "color": "#ff0000", "stationId": null}],
  "objectHints": [{"id": "h1", "label": "HUB", "x": 52, "y": 18, "rot": 0}],
  "warnings":    {"unsupported": {"HATCH": 12}, "unitGuessed": false}
}
```

- `scale` = 도면 단위 → m. `lines`·`texts`·`walls` 등 모든 좌표는 이미 `scale` 을 곱한 m 값이다. 보정하면 새 비율 `k = 실제거리 / 측정거리` 로 모든 좌표·크기(글자 높이 포함, 높이·두께 제외)를 `k` 배 하고 `scale *= k`.
- `rotQ`(0~3, 90° 단위)·`flip`(1 또는 -1) 은 **보기 변환**이다. 좌표는 바꾸지 않고 3D 의 도면 묶음(root) 에 적용한다. P3 객체도 같은 root 아래 두므로 함께 돈다.
- `layers[].role`: `wall` · `partition` · `column` · `zone` · `object` · `line`.
- `id` 는 해석 순서대로 `w1, w2…`, `p1…`, `c1…`, `z1…`, `h1…`.

## 3. 해석 규칙

### 3.1 레이어 → 역할 기본 규칙 (이름을 대문자로 바꿔 정규식 검사, 위에서부터 첫 일치)

| 정규식 | 역할 | 높이 | 두께 |
|---|---|---|---|
| `PARTITION\|칸막이\|가벽` | partition | 1.2 | 0.5 |
| `WALL\|벽` | wall | 8 | 0.2 |
| `^COL\|COLUMN\|기둥` | column | 9.5 | — |
| `STATION\|ZONE\|구역\|공정` | zone | — | — |
| `EQUIP\|설비\|OBJECT` | object | — | — |
| 그 밖 | line | — | — |

도면마다 `layer_rules`(`{"레이어이름": {"role": "...", "height": n, "thickness": n}}`) 로 덮어쓴다. 관리자가 바꾸면 원본을 다시 해석한다.

### 3.2 역할별 변환

- **모든 레이어**: 선(poly) 은 `lines` 에, 글자(text) 는 `texts` 에 들어간다 (바닥 선 그림). 꺼진 레이어(DXF off) 도 넣고 `visible:false` 표시.
- **wall / partition**: 각 poly 의 선분 연속을 `pts` 로 (닫힌 poly 는 첫 점 반복). 높이·두께는 레이어 규칙.
- **column**: 닫힌 poly 의 bbox → `{x,y(중심), w, d}`. 열린 선은 무시.
- **zone**: 닫힌 poly 하나 = 구역 하나. 이름 = 같은 레이어(없으면 아무 레이어) 의 글자 중 중심이 다각형 안에 있는 것(여러 개면 가장 큰 글자). 없으면 `구역 n`. 색 = 레이어 색. 면적 1㎡ 미만은 무시.
- **object**: 글자 하나 = 표기 하나(`label` = 글자, 위치 = 글자 위치). 블록 INSERT 는 블록 이름을 `label` 로, 삽입점·회전을 위치로 (P3 매칭용).
- **단위**: `$INSUNITS` 1=inch, 2=feet, 4=mm, 5=cm, 6=m. 없거나 0 이면 도면 크기 > 2000 → mm, 아니면 m 로 추정하고 `warnings.unitGuessed = true`.

## 4. 화면

### 4.1 메인 화면 (`/`)
- 머리글: `도면 [select] [＋ 도면 추가]` · 오른쪽 `[3D | 도면]` 보기 전환 · `[고품질 | 저사양]` · 사용자 메뉴. 보기·품질은 localStorage `f3d:view`.
- 3D (demo 그대로): 콘크리트 바닥, 외벽(높이 > 4m 이면 골강판 0.2m + 걸레받이 1.2m), 낮은 가벽(두께 0.5m, 밝은 회색), H빔 기둥, 구역 바닥 색(반투명) + 이름 글자, 바닥 선 그림(레이어 색, 3D 에서는 어둡고 옅게), 그림자, 고품질이면 GTAO.
- 도면 보기: 위에서 내려다봄, 어두운 바탕 + 흰 선, 격자.
- 조작: 좌드래그 회전 · 우드래그 이동 · 휠 확대 · 더블클릭 다가가기(0.6초) · WASD/방향키 이동 · Q/E 회전 · R/F 높이 · Shift 3배.
- 왼쪽 아래 정보 카드: 도면 이름 · 크기 `160.0 × 65.8 m` · 단위(`mm`, 보정했으면 `보정됨`).
- 도면이 없으면 P1 의 빈 안내 유지.

### 4.2 도면 도구 (3D 오른쪽 위 도구줄)
- `거리 측정` (모두): 두 점 클릭(선 끝점에 12px 안이면 붙음) → 거리 `12.35 m` 표시, Esc 로 종료.
- `스케일 보정` (운전원 이상): 두 점 → 실제 거리(m) 입력 → 저장.
- `90° 회전` · `좌우 반전` (운전원 이상): 누르면 바로 저장.
- 저장 = `PUT /api/drawings/{id}/plan`. 버전 충돌(409) 이면 "다른 사람이 먼저 수정했습니다. 다시 불러옵니다." 후 다시 불러옴.

### 4.3 도면 추가 (`＋ 도면 추가`, 운전원 이상)
1. 창(Modal): DXF 선택 또는 끌어다 놓기 + 이름(기본 = 파일 이름, 확장자 뺌).
2. 브라우저가 해석 → 창 안 미리보기(위에서 본 선 그림 canvas, 가벽·구역 강조) + 요약 `벽 n · 가벽 n · 기둥 n · 구역 n · 객체 표기 n` + 지원 안 됨 목록.
3. 단위 추정이면 "단위를 mm 로 추정했습니다" + `mm / cm / m` 선택(바꾸면 다시 해석).
4. `등록` → 서버 저장 → select 에 추가·선택 → 3D 표시.
- 거부: DWG(`AC10` 시작), 바이너리 DXF(`AutoCAD Binary DXF` 시작) → "DXF(ASCII) 로 변환해 주세요 (ODA File Converter)". 글자는 UTF-8 로 읽고 깨지면(`�`) EUC-KR 로 다시 읽음.
- 해석 결과에 선이 하나도 없으면 등록 불가 "도면에서 그릴 선을 찾지 못했습니다".

### 4.4 관리자 › 도면 관리 (`/admin/drawings`, 탭 추가)
- 표: 이름 · 형식 · 크기(m) · 버전 · 등록자 · 수정일 · [이름 바꾸기] [레이어 규칙] [삭제].
- 레이어 규칙 창: 레이어마다 이름 · 색 · 선 수 · 역할 select · 높이 · 두께 → `저장 후 다시 해석` (원본 받아 브라우저에서 재해석, 기존 `scale`(보정)·`rotQ`·`flip` 유지 → PUT).
- 삭제: 확인 창 → 원본 파일까지 삭제.

## 5. 서버

### 5.1 API
| 메서드 | 주소 | 권한 | 내용 |
|---|---|---|---|
| GET | `/api/drawings` | 조회 | 목록 `[{id,name,sourceType,updatedAt}]` (P1) |
| GET | `/api/drawings/{id}` | 조회 | `{id,name,sourceType,version,createdBy,createdAt,updatedAt,plan,layerRules}` |
| GET | `/api/drawings/{id}/source` | 조회 | 원본 파일 (`application/dxf`) |
| POST | `/api/drawings` | 운전원 | multipart `file`, `name`, `plan`(JSON 문자열), `layerRules`(JSON 문자열) → 상세 |
| PUT | `/api/drawings/{id}/plan` | 운전원 | `{version, plan, layerRules}` → 상세(version+1). version 불일치 409 |
| PATCH | `/api/drawings/{id}` | 관리자 | `{name}` |
| DELETE | `/api/drawings/{id}` | 관리자 | 204, 원본 파일 폴더 삭제 |

- 권한은 P1 SecurityConfig 규칙(GET 조회 이상, 쓰기 운전원 이상)에 `PATCH`·`DELETE /api/drawings/**` → ADMIN 규칙을 `/api/**` 규칙보다 앞에 추가.
- 검사: 파일 이름 `.dxf`(대소문자 무시), 크기 ≤ 50MB(`F3D_MAX_UPLOAD` 와 별개로 코드에서 확인), plan JSON ≤ 20MB 이고 `format`·`bounds`·`lines` 존재, 이름 1~100자·앞뒤 공백 제거·중복 시 409 "같은 이름의 도면이 있습니다".
- 오류는 한국어 ProblemDetail: 400 잘못된 요청, 404 "도면을 찾을 수 없습니다", 409, 413.
- 감사 기록: `DRAWING_CREATE` · `DRAWING_UPDATE` · `DRAWING_RENAME` · `DRAWING_DELETE`.

### 5.2 저장
- 원본: `<data-dir>/drawings/<id>/source.dxf`. DB `drawing.source_file` = `drawings/<id>/source.dxf`(data-dir 기준 상대).
- `data-dir` (P1 에서 미룬 것): 시작 때 절대경로로 바꿔 로그 `데이터 폴더: <경로>` 1회 출력, 없으면 만들고, 쓰기 불가면 시작 실패.
- 생성은 DB 행 먼저 만들고 파일 저장, 파일 저장 실패 시 트랜잭션 롤백. 삭제는 DB 행 삭제 후 폴더 삭제(실패해도 로그만).

### 5.3 기본 도면
- `server/src/main/resources/seed/main_factory.dxf` (demo 복사) + `main_factory.plan.json` (웹 해석기로 만든 결과, 저장소에 포함).
- 서버 시작 때 `drawing` 이 0행이면 이름 "나셀 공장", `created_by = 'system'` 으로 등록. 감사 기록 `DRAWING_SEED`.
- 웹 테스트가 `main_factory.dxf` 를 해석한 결과와 `main_factory.plan.json` 이 같은지 비교 (해석기 바꾸면 json 다시 생성: `npm run seed:plan`).

## 6. 화면 코드 구조

```
web/src/drawing/
  dxf/parse.ts · dxf/flatten.ts · dxf/types.ts   demo 해석기 이식 (순수 함수)
  plan/rules.ts                                  기본 규칙 + layer_rules 적용
  plan/buildPlan.ts                              prims + 규칙 + 단위 → plan
  plan/transform.ts                              보정(k배) · 회전 · 반전
  readDxfFile.ts                                 UTF-8/EUC-KR, DWG·바이너리 거부
  api.ts                                         도면 API 호출
  useDrawing.ts                                  상세 불러오기·저장(버전 충돌 처리)
  AddDrawingDialog.tsx · PlanPreview.tsx · DrawingTools.tsx · InfoCard.tsx
web/src/scene/
  FactoryScene.ts      렌더러·카메라·OrbitControls·조명·GTAO·applyLook·루프·dispose
  planToMeshes.ts      plan → 바닥 선·글자·외벽·가벽·기둥·구역
  textures.ts · materials.ts
  navigation.ts        더블클릭 다가가기·키보드 이동·카메라 애니메이션
  picking.ts           바닥 클릭 좌표·끝점 붙기
  FactoryView.tsx      React 껍데기 (scene 생성·plan 전달·도구 이벤트)
web/src/pages/admin/DrawingsPage.tsx · LayerRulesDialog.tsx
web/scripts/make-seed-plan.mjs                   main_factory.plan.json 생성
```

## 7. 테스트

- 웹(vitest): DXF 해석(LINE · LWPOLYLINE bulge · ARC · CIRCLE · INSERT 중첩 · TEXT/MTEXT · 레이어 0 상속), EUC-KR 읽기·DWG 거부, 규칙 분류(기본·덮어쓰기), buildPlan(가벽 높이·두께, 구역 이름 = 안의 글자, 기둥 bbox, 단위 추정), 보정·회전 계산, 시드 plan 일치, 도면 추가 창(해석 요약·등록 호출), 관리자 도면 관리 표.
- 서버(JUnit): 업로드·상세·원본 받기·PUT 버전 증가와 409·권한(조회 쓰기 불가, 운전원 삭제 불가)·확장자/크기/이름 검사·삭제 시 파일 삭제·시드 등록(0개일 때만).
- 실제 화면(Playwright Edge): 나셀 공장 3D 스크린샷(가벽·구역 확인), 도면 보기 전환, DXF 추가 → select 에 나타남, 측정 도구로 거리 표시.
- three.js 렌더링 자체는 jsdom 에서 테스트하지 않음(WebGL 없음). `planToMeshes` 는 메쉬 개수·위치만 단위 테스트.
