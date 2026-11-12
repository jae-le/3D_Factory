# Factory3D P3 — 객체 설계

작성 2026-11-12. 전체 설계(`2026-11-12-factory3d-platform-design.md`) §4.2·§4.3·§5.2 의 P3 상세. 공용 3D 모델 라이브러리 + 도면별 배치, 객체 추가(3D 파일 업로드), demo 편집 기능(격자·회전·겹침) 이식, 도면 표기 자동 배치, 관리자 객체관리, 나셀 공장 기본 배치 79개.

## 1. 결정 사항

| 항목 | 결정 |
|---|---|
| 모델 저장 형식 | 항상 glb (m 단위, 바닥 중심 원점, 앞쪽 +X). 업로드는 glb·gltf·fbx·obj·stl → 브라우저에서 glb 로 변환 |
| 기본 모델 | demo `makeEquipMesh` 의 설비 5종 + 자재 6종을 브라우저에서 한 번 glb·썸네일로 구워 저장소에 포함, 서버 첫 실행 때 라이브러리에 등록 |
| 기본 배치 | demo `mainScenario` 79개(운반 객체 제외)를 나셀 공장에 그대로 |
| 운반 객체(지게차·작업자·AMR) | P5(실행) |
| 편집 저장 | 놓기·이동 끝·회전·이름·모델 지정·삭제마다 즉시 서버 저장. 화면 안에서 Ctrl+Z / Ctrl+Y (되돌린 것도 저장) |
| 권한 | 조회 = 보기·선택, 운전원 = 모델 업로드·배치·편집, 관리자 = 모델 수정·교체·삭제 |

## 2. 데이터

### 2.1 DB (Flyway V4)

`model`
| 칸 | 형식 | 설명 |
|---|---|---|
| id | bigserial | |
| name | varchar(100) not null unique | `허브` |
| category | varchar(8) check in ('equip','mat','mover') | 화면 표기 설비/자재/운반 |
| file | varchar(300) | data-dir 기준 `models/<id>/model.glb` |
| source_ext | varchar(8) | glb/gltf/fbx/obj/stl |
| size_x, size_y, size_z | double | 가로(+X)·세로·높이 m |
| thumbnail | varchar(300) | `models/<id>/thumb.png` |
| aliases | text[] not null default '{}' | 도면 표기 매칭용 |
| version | int not null default 1 | 파일 교체 시 +1 (캐시 무효화) |
| created_by, created_at, updated_at | | |

`placement`
| 칸 | 형식 | 설명 |
|---|---|---|
| id | bigserial | |
| drawing_id | bigint not null references drawing on delete cascade | |
| model_id | bigint references model on delete set null | null = 임시 상자 |
| name | varchar(100) not null | unique (drawing_id, name) — P4 상황판 연결 키 |
| x, y | double not null | plan 좌표(m, 원점 = 도면 bbox 최소점) |
| rot | double not null default 0 | 도(°), 반시계, 0 = 모델 +X 가 도면 +x |
| hint_label | varchar(100) | 도면 표기에서 생겼으면 그 글자 |
| created_at, updated_at | | |

### 2.2 좌표

- 배치 좌표는 plan 좌표(P2 와 같음). 3D 위치 = `planToLocal(x, y, bounds)`, 회전 `rotation.y = rot·π/180` (plan y 위쪽 = −z 이므로 반시계 rot 은 three 의 +Y 회전과 같다).
- 객체는 FactoryScene 의 root(회전·반전) 아래에 둔다 → 도면 회전·반전 시 함께 돈다.
- 도면 보정(스케일) 시 배치 좌표도 같은 k 배 (DrawingTools 보정 저장 후 서버가 `placement.x,y *= k` 를 한 트랜잭션으로 — `PUT /plan` 에 `scaleFactor` 를 함께 보내면 서버가 적용).

## 3. 화면

### 3.1 3D 객체
- 도면 선택 → `GET /api/drawings/{id}/placements` → 모델별 glb 를 한 번만 받아(`/api/models/{id}/file?v=<version>`) 복제해 배치.
- model_id 가 null 이면 회색 반투명 상자(2×2×2m) + 위에 표기 글자.
- 선택: 바닥 사각 테두리(크기 = 모델 size_x·size_y + 0.8m, demo 와 같음) 파란색.

### 3.2 객체 패널 (메인 화면 왼쪽, 접기 가능, 폭 300px)
- 위: 분류 탭 `설비 · 자재 · 운반` + 모델 카드(썸네일·이름), `＋ 객체 추가`(운전원 이상).
- 아래: 이 도면의 객체 목록(이름 · 모델 이름), 검색 입력, 미매칭 표기는 `모델 없음` 표시. 행 클릭 → 선택 + 카메라 0.6초 이동.

### 3.3 배치 모드 (운전원 이상)
- 카드 클릭 → 배치 모드: 반투명 미리보기가 마우스를 따라감(격자 붙기, Shift 자유), 우클릭 90° 회전, 클릭 → 놓기(저장), Esc 취소. 연속으로 놓을 수 있고 Esc 로 끝.
- 이름 자동: `<모델 이름> n` (그 도면 안에서 비어 있는 가장 작은 n).

### 3.4 선택·편집 (demo 이식)
- 클릭 = 선택만. 오른쪽 아래 정보 카드: 이름(운전원 이상 수정), 모델, 위치 `x, y m`, 회전 `°`, 버튼 `편집` `90° 회전` `모델 지정`(임시 상자일 때) `삭제`.
- 편집: 끌어서 이동(격자 = 도면 큰 변 < 40m 이면 0.5m, 아니면 1m; Shift 자유), 차지한 칸 파랑 `#3b82f6`, 다른 객체와 겹친 칸 빨강 `#ef4444`, 격자선 `#60a5fa`, 태그 `가로 n × 세로 m칸 · 총 k칸 · x.x㎡ · 겹침 j칸`(90° 방향일 때만 가로×세로). 끝: Esc · `편집 완료` · 다른 객체 선택.
- 격자 붙이기·칸 계산은 demo `snapToCells`·`cellHits`·`rectsHit` 와 같은 알고리즘(모서리 기준 붙기, SAT 겹침, 1e-3 여유).
- 되돌리기: 이 화면 세션의 기록(최대 50). Ctrl+Z 는 직전 변경의 반대 요청을 서버에 보냄(추가↔삭제, 이동·회전·이름은 이전 값으로). 도면을 바꾸면 기록 비움.

### 3.5 객체 추가 창
1. 파일 선택: glb · gltf(+bin·텍스처 함께 선택 가능) · fbx · obj · stl. 100MB 초과·지원 안 되는 확장자 거부.
2. 브라우저에서 로드 → 미리보기(회전하는 작은 3D) · 크기 `x × y × z` 표시. 단위 추정: 가장 긴 변 > 100 → mm, > 10 이고 ≤ 100 → cm 후보 안내, 그 외 m. m/cm/mm 선택으로 고침.
3. `90° 돌리기`(앞방향 맞추기), 이름, 분류(설비/자재/운반), 별칭(쉼표 구분).
4. `등록` → 변환: 배율 적용 · 바닥 중심으로 옮김(bbox 아래면 y=0, xz 중심 0) · 회전 적용 → GLTFExporter(binary) → 썸네일 240×180 png 캡처 → `POST /api/models`. 성공하면 창 닫고 그 모델로 배치 모드.
- 변환 실패·WebGL 없음 → 한국어 오류.

### 3.6 도면 표기 자동 배치
- 도면 추가(P2 창) 등록 성공 후 `plan.objectHints` 가 있으면: 별칭(대소문자·공백 무시, 모델 이름도 별칭으로 취급) 으로 모델을 찾아 `POST /api/drawings/{id}/placements`(여러 개) — 이름 = 모델 이름 n (미매칭은 `표기 <글자>`), hint_label = 글자, rot = 표기 회전(도).
- 결과 안내: `객체 n개 배치 (모델 없음 m개)`.

### 3.7 관리자 › 객체관리 (`/admin/models`)
- 표: 썸네일 · 이름 · 분류 · 크기 · 별칭 · 사용 도면 수 · 수정일 · [수정] [파일 교체] [삭제].
- 수정: 이름·분류·별칭. 파일 교체: 객체 추가 창과 같은 변환 과정(이름·분류는 유지) → 버전 +1. 삭제: 사용 중이면 "n개 도면의 배치 m개가 임시 상자로 바뀝니다" 확인.
- 도면 관리의 삭제 확인 문구에 "배치된 객체 n개도 함께 삭제됩니다" 추가.

## 4. 서버

### 4.1 API
| 메서드 | 주소 | 권한 | 내용 |
|---|---|---|---|
| GET | `/api/models` | 조회 | `[{id,name,category,sourceExt,sizeX,sizeY,sizeZ,aliases,version,usedDrawings,updatedAt}]` 이름순 |
| GET | `/api/models/{id}/file` | 조회 | glb (`model/gltf-binary`), `Cache-Control: max-age=31536000, immutable` (주소에 `?v=` 가 붙으므로) |
| GET | `/api/models/{id}/thumbnail` | 조회 | png, 같은 캐시 |
| POST | `/api/models` | 운전원 | multipart `file`(glb), `thumbnail`(png), `name`, `category`, `sourceExt`, `sizeX`,`sizeY`,`sizeZ`, `aliases`(쉼표) → 201 |
| PATCH | `/api/models/{id}` | 관리자 | `{name?, category?, aliases?}` |
| PUT | `/api/models/{id}/file` | 관리자 | multipart `file`, `thumbnail`, `sourceExt`, `sizeX..Z` → version+1 |
| DELETE | `/api/models/{id}` | 관리자 | 204 (배치는 model_id null) |
| GET | `/api/drawings/{id}/placements` | 조회 | `[{id,modelId,name,x,y,rot,hintLabel}]` |
| POST | `/api/drawings/{id}/placements` | 운전원 | `[{modelId?,name,x,y,rot?,hintLabel?}]` (1~2000개) → 만든 목록 201 |
| PATCH | `/api/placements/{id}` | 운전원 | `{name?, x?, y?, rot?, modelId?}` (modelId 를 비우려면 `clearModel:true`) |
| DELETE | `/api/placements/{id}` | 운전원 | 204 |

- glb 검사: 앞 4바이트 `glTF`, 버전 2, ≤ 100MB(`factory3d.model.max-bytes`), 썸네일 png 시그니처·≤ 2MB, 크기 > 0, 이름 1~100자·중복 409 "같은 이름의 모델이 있습니다.", 분류 값 검사.
- 배치: 도면 존재 404, 모델 존재 400 "모델을 찾을 수 없습니다.", 이름 1~100자·같은 도면 중복 409 "같은 이름의 객체가 이 도면에 있습니다.", 좌표 유한수.
- 권한: SecurityConfig 에 `PATCH·PUT·DELETE /api/models/**` → ADMIN (GET 은 조회, POST 는 운전원 — 기존 규칙).
- 감사: MODEL_CREATE · MODEL_UPDATE · MODEL_FILE · MODEL_DELETE · PLACEMENT_CREATE(개수) · PLACEMENT_UPDATE · PLACEMENT_DELETE.
- 도면 보정: `PUT /api/drawings/{id}/plan` 이 선택 칸 `scaleFactor`(>0) 를 받으면 같은 트랜잭션에서 그 도면 배치 x·y 에 곱한다.

### 4.2 기본 데이터
- `server/src/main/resources/seed/models/<key>/model.glb · thumb.png` 11종 + `seed/models.json`(`[{key,name,category,aliases,sizeX,sizeY,sizeZ}]`).
- `seed/main_factory.placements.json` (`[{model:<key>,name,x,y,rot}]`, plan 좌표 m).
- 시작 순서: ① 모델 0개면 11종 등록(created_by 'system', 감사 MODEL_SEED) ② 도면 0개면 나셀 공장 + 배치 79개 ③ 이미 설치됨: 이름 '나셀 공장', created_by 'system' 인 도면의 배치가 0개면 79개를 한 번 넣음(감사 PLACEMENT_SEED).
- 기본 모델 키·이름·분류·별칭:

| key | 이름 | 분류 | 별칭 |
|---|---|---|---|
| jigMain | 메인 조립 지그 | equip | JIG_MAIN, MAIN JIG |
| jigSub | 서브 조립 지그 | equip | JIG_SUB, SUB JIG |
| jigHub | 허브 조립 지그 | equip | JIG_HUB, HUB JIG |
| tensioner | 요 베어링 텐셔너 | equip | TENSIONER |
| frameTable | 메인 프레임 조립대 | equip | FRAME_TABLE |
| hub | 허브 | mat | HUB |
| ring | 베어링 링 | mat | RING, BEARING |
| mainframe | 메인 프레임 | mat | MAINFRAME, MAIN FRAME |
| longmat | 긴 자재 랙 | mat | LONG_RACK |
| fixture | 치구 프레임 | mat | FIXTURE |
| pallet | 부품 팔레트 | mat | PALLET |

### 4.3 기본 모델 굽기
- demo `index.html` 1597~1601(`mat`,`box`,`rbox`,`cyl`), 1708~1967(`mergeByMaterial`, `makeEquipMesh` 의 설비·자재 분기, 가구 분기 제외), 706~736 중 `TEX.box`(자재 짐 박스) 를 `web/src/objects/builtin/` 로 이식.
- `web/scripts/bake-models.mjs`: Vite 개발 서버의 굽기 전용 페이지(`/bake.html`, 빌드 결과에는 포함 안 함)를 Playwright(Edge) 로 열어 11종 각각 glb(GLTFExporter binary) + 240×180 썸네일 png 를 받아 `server/src/main/resources/seed/models/` 에 쓰고, size 를 계산해 `models.json` 작성. 선택 테두리 LineLoop 은 내보내지 않음.
- 배치 79개: demo `mainScenario`(3431~3469) 의 `put(type, px, py, ang, name)` 목록을 `X=(px-57)*107.8`, `Y=(912-py)*107.8` (mm) → plan 좌표 `x=(X-x0)*0.001`, `y=(Y-y0)*0.001` (x0,y0 = main_factory.dxf bbox 최소점, buildPlan 과 같은 계산) 로 바꿔 json 생성 (`web/scripts/make-seed-placements.mjs` 또는 vitest 갱신 테스트, 시드 plan 과 같은 방식). 이름은 demo 와 같게(이름 없는 것은 `<모델 이름> n`).

## 5. 화면 코드 구조

```
web/src/objects/
  types.ts · api.ts · useModels.ts · usePlacements.ts · history.ts(되돌리기)
  grid.ts            cellSize·snapToCells·footprint·cellHits·rectsHit·editCells (순수)
  match.ts           별칭 매칭·자동 이름
  convert/load.ts    glb·gltf·fbx·obj·stl → Object3D (three 로더)
  convert/normalize.ts  배율·바닥 중심·회전, 단위 추정
  convert/exportGlb.ts · thumbnail.ts
  builtin/           demo 모델 코드 (굽기 전용)
  ObjectPanel.tsx · ModelCard.tsx · PlacementList.tsx · ObjectInfo.tsx · AddModelDialog.tsx · EditTag.tsx
web/src/scene/objectLayer.ts   모델 캐시·배치 메쉬·선택 테두리·미리보기·편집 격자·드래그
web/src/pages/admin/ModelsPage.tsx
web/bake.html · web/src/objects/builtin/bakePage.ts · web/scripts/bake-models.mjs
```

## 6. 테스트
- 웹(vitest): grid(demo 와 같은 결과 — 회전 사각형 겹침·모서리 붙기·칸 수), 단위 추정, 별칭 매칭·자동 이름, 되돌리기 기록(추가↔삭제·이동), 시드 배치 json 일치, 패널·카드·정보 카드·추가 창(로더는 가짜), 관리자 객체관리.
- 서버(JUnit): 모델 업로드 검사(glb 머리·크기·png·이름 중복)·권한(PATCH/PUT/DELETE 관리자), 배치 CRUD·이름 중복 409·도면 삭제 cascade·모델 삭제 시 null, scaleFactor 적용, 시드(새 설치·기존 설치·재실행 시 중복 없음).
- 실제 화면(Edge): 나셀 공장 79개 표시, 배치·이동(격자)·회전·되돌리기, obj/stl 업로드 → 카드 → 배치, 도면 전환 시 객체 교체, 관리자 객체관리 — 스크린샷 확인.
