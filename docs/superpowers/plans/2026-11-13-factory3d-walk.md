# Factory3D 체험 공간 (1인칭 걷기) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 레일 `체험`(`/walk`)에서 고른 도면의 3D 공간(P2 벽·가벽·기둥·구역 + P3 배치 객체)을 참고 파일 '공장 3D 체험 공간' 그대로 1인칭으로 걷는다 — 시작 화면, W A S D·드래그·Shift·M 조감 뷰·클릭/E 상세정보·Esc, 충돌, 시작 자리, 구역 배지, 미니맵, 이름표, 상세 패널(P4 실시간 상태), 터치 조이스틱.

**Architecture:** 걷기 계산(충돌·시작 자리·이동·구역·미니맵)은 모두 **plan 좌표**의 순수 모듈 `web/src/walk/` 에 두고 vitest 로 검증한다. `WalkController` 가 입력을 받아 매 프레임 plan 좌표의 카메라 자세(`CameraPose`: 눈·바라보는 점)를 돌려주고, `FactoryScene` 은 `WalkHost.setCameraDriver` 로 받은 드라이버가 있으면 OrbitControls·Navigator 를 멈추고 그 자세를 root 회전·반전을 거친 월드 좌표로 바꿔 카메라에만 적용한다(드라이버를 비우면 걷기 전 궤도 시점으로 돌아가고 OrbitControls·Navigator 가 다시 움직임). 화면은 `DashboardPage` 와 같은 틀(AppShell + DrawingBar + FactoryView + 덮개)이다. 서버 변경 없음.

**Tech Stack:** React 19 · TS · three@0.186.1 · lucide-react · vitest · Playwright(Edge) / (서버는 그대로: Spring Boot 4.1.1 · PostgreSQL 17)

**Spec:** `docs/superpowers/specs/2026-11-13-factory3d-walk-design.md` (참고 파일: `C:\Users\kopens\OneDrive - kopens\바탕 화면\개인파일\개인 미니 작업물\2.3D 아파트+공장\index.html` — HTML/CSS 1~145행, JS 855~1215행)

## Global Constraints

- 프로젝트 루트 `C:\kopens\project\Factory3D`. 참고 파일(`...\2.3D 아파트+공장\index.html`), `C:\kopens\project\demo`, `C:\kopens\project\3D_WEB` 는 **수정 금지** (읽고 옮겨 적기만). 참고 파일의 이모지 링크(`🏠 아파트 뷰로 이동`)는 옮기지 않는다.
- **웹만 바꾼다.** 서버·DB 변경 없음 (필요한 데이터 — 도면 plan, 배치, 모델, `/ws/live` — 가 이미 있음).
- 걷기 계산은 plan 좌표(m, 원점 = 도면 왼쪽 아래, y 위쪽)에서 하고, 카메라만 월드로 바꾼다 (root: `scale.x = plan.flip`, `rotation.y = plan.rotQ × 90°`). 회전·반전된 도면에서도 같은 코드.
- 카메라 드라이버를 비우면(`setCameraDriver(null)`) OrbitControls·Navigator 가 다시 동작하고 걷기 전 궤도 시점으로 돌아간다.
- 수치(참고 파일 그대로): 눈높이 1.7 m, 걷기 5.2 m/s, 달리기 8.5 m/s, 몸 반지름 0.45 m, 시야각 70°, 피치 ±1.35 rad, 드래그 0.0045 rad/px(터치 0.005), 조감 드래그 0.005(터치 0.008), 걸음 흔들림 ±0.045 m (걷기 9 · 달리기 13 rad/s), dt 최대 0.05 s, 클릭 판정 이동 6 px 미만, 이름표 거리 18 m, 조감 벽 투명도 0.13, 걷는 동안 안개 60~160 m.
- 권한: `/walk` = 조회 이상(로그인한 모든 사용자). 3D 는 보기 전용(`setInteractive(false)`).
- 모든 사용자 문구는 한국어. 이모지 금지, `border-left` 강조선 금지, 아이콘 lucide-react(`Footprints`·`X`·`Gauge`), 라벨 약 12~15px. 색감은 참고 파일(어두운 반투명 카드·흰 글자)을 기존 토큰(`--text`·`--muted`·`--ok`·`--warn`·`--bad`) 과 함께.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. `.superpowers/` 는 커밋하지 않음.
- 웹: `cd web && npx vitest run` (출력에 경고 없이), `npm run build`, `./node_modules/.bin/oxlint`.
- TS 설정: verbatimModuleSyntax(`import type`), noUnusedLocals·noUnusedParameters, erasableSyntaxOnly(매개변수 속성 금지). 세미콜론 없음, 작은따옴표.
- 실제 화면 확인은 **포트 8081 · DB `factory3d_test`(사용자 `factory3d_test` / 비밀번호 `factory3d_test`, 시작 전 schema 지우고 다시 만듦) · 임시 데이터 폴더 · `F3D_ADMIN_PASSWORD=Start1234`** 로만 한다. 포트 8080, DB `factory3d`, 저장소 `data/` 폴더는 사용자의 서버가 쓰므로 **절대 건드리지 않는다**.

## 파일 구조

```
web/src/walk/
  colliders.ts · collide.ts · spawn.ts            (+ collide.test.ts)        충돌 도형 · 밀어내기 · 시작 자리
  player.ts                                       (+ player.test.ts)         입력 → 이동·시점·흔들림
  zoneAt.ts · minimap.ts                          (+ minimap.test.ts)        구역 판정 · 미니맵 그리기
  controller.ts · touch.ts                        (+ controller.test.ts)     WalkController(CameraDriver) · 터치 두 손가락
  WalkOverlay.tsx · WalkHud.tsx · Minimap.tsx · WalkDetail.tsx · TouchJoystick.tsx (+ components.test.tsx)
  useWalkInput.ts                                                           마우스 끌기·클릭 · 터치
web/src/scene/coords.ts (planToWorld · worldToPlan, + coords.test.ts)
web/src/scene/walkLook.ts (CameraPose · CameraDriver · applyPose · ghostWalls · walkFog, + walkLook.test.ts)
web/src/scene/FactoryScene.ts (WalkHost) · navigation.ts (typing 내보내기) · qualityPref.ts (새 파일)
web/src/pages/WalkPage.tsx (+ walk.test.tsx) · DashboardPage.tsx (qualityPref 사용) · routes.tsx · layout/IconRail.tsx
web/src/styles/app.css · web/e2e/walk-smoke.mjs · README.md
```

---

### Task 1: 웹 — 충돌 도형 · 밀어내기 · 시작 자리 (순수 모듈)

**Files:**
- Create: `web/src/walk/colliders.ts`, `web/src/walk/collide.ts`, `web/src/walk/spawn.ts`
- Test: `web/src/walk/collide.test.ts`

**Interfaces:**
- Consumes: `Plan`·`Pt` (`web/src/drawing/plan/types.ts`, `Pt = [number, number]`), `Category` (`web/src/objects/types.ts`).
- Produces:
```ts
// colliders.ts
export interface Seg { a: Pt; b: Pt; r: number }                                  // 선분 + 반두께(m)
export interface Rect { cx: number; cy: number; hw: number; hh: number; rot: number } // 중심 · 반폭(로컬 x)·반높이(로컬 y) · 반시계 rad
export interface Colliders { segs: Seg[]; rects: Rect[] }
export interface Solid { x: number; y: number; rot: number; sizeX: number; sizeY: number; category: Category | null } // rot 도, null = 모델 없는 임시 상자
export function buildColliders(plan: Pick<Plan, 'walls' | 'partitions' | 'columns'>, solids: Solid[]): Colliders
// collide.ts
export function collide(p: { x: number; y: number }, radius: number, c: Colliders, b: { w: number; h: number }): { x: number; y: number }
export function clearance(x: number, y: number, c: Colliders): number   // 가장 가까운 장애물 표면까지(m), 안이면 0 이하
// spawn.ts
export function findSpawn(c: Colliders, b: { w: number; h: number }, room?: number): { x: number; y: number }   // room 기본 1 m
```

- [ ] **Step 1: 실패 테스트**

`web/src/walk/collide.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import type { Pt } from '../drawing/plan/types'
import { buildColliders, type Colliders } from './colliders'
import { clearance, collide } from './collide'
import { findSpawn } from './spawn'

const R = 0.45
const B = { w: 10, h: 10 }
const wallAt5: Colliders = { segs: [{ a: [0, 5], b: [10, 5], r: 0.1 }], rects: [] }

describe('충돌 도형', () => {
  it('외벽·가벽 선분(짧은 조각 제외) · 기둥 사각형 · 설비·자재·임시 상자 회전 사각형, 운반은 제외', () => {
    const c = buildColliders(
      {
        walls: [{ id: 'w', pts: [[0, 0], [10, 0], [10, 5]] as Pt[], h: 8, t: 0.4 }],
        partitions: [{ id: 'p', pts: [[2, 2], [2.01, 2], [2, 4]] as Pt[], h: 1.2, t: 0.1 }],
        columns: [{ id: 'c', x: 5, y: 5, w: 0.4, d: 0.6, h: 8 }],
      },
      [
        { x: 3, y: 3, rot: 90, sizeX: 4, sizeY: 2, category: 'equip' },
        { x: 6, y: 3, rot: 0, sizeX: 1, sizeY: 1, category: 'mat' },
        { x: 8, y: 3, rot: 0, sizeX: 3, sizeY: 1, category: 'mover' },
        { x: 8, y: 8, rot: 0, sizeX: 2, sizeY: 2, category: null },
      ],
    )
    expect(c.segs).toEqual([
      { a: [0, 0], b: [10, 0], r: 0.2 },
      { a: [10, 0], b: [10, 5], r: 0.2 },
      { a: [2.01, 2], b: [2, 4], r: 0.05 },
    ])
    expect(c.rects).toHaveLength(4)
    expect(c.rects[0]).toEqual({ cx: 5, cy: 5, hw: 0.2, hh: 0.3, rot: 0 })
    expect(c.rects[1]).toMatchObject({ cx: 3, cy: 3, hw: 2, hh: 1 })
    expect(c.rects[1].rot).toBeCloseTo(Math.PI / 2)
    expect(c.rects[2]).toMatchObject({ cx: 6, cy: 3, hw: 0.5, hh: 0.5 })
    expect(c.rects[3]).toMatchObject({ cx: 8, cy: 8, hw: 1, hh: 1 })
  })
})

describe('밀어내기', () => {
  it('벽을 향해 계속 걸어도 관통하지 않음 (반두께 + 몸 반지름에서 멈춤)', () => {
    let p = { x: 5, y: 3 }
    for (let i = 0; i < 20; i++) {
      p = collide({ x: p.x, y: p.y + 0.4 }, R, wallAt5, B)
      expect(p.y).toBeLessThanOrEqual(5 - 0.55 + 1e-9)
    }
    expect(p.y).toBeCloseTo(4.45)
  })

  it('벽에 비스듬히 닿으면 벽을 따라 미끄러짐', () => {
    const p = collide({ x: 5.3, y: 4.75 }, R, wallAt5, B)
    expect(p.x).toBeCloseTo(5.3)
    expect(p.y).toBeCloseTo(4.45)
  })

  it('벽 끝은 둥글게 밀어냄', () => {
    const p = collide({ x: 10.3, y: 5 }, R, wallAt5, { w: 20, h: 10 })
    expect(p.x).toBeCloseTo(10.55)
    expect(p.y).toBeCloseTo(5)
  })

  it('두 벽이 만나는 모서리에서도 둘 다에서 떨어짐 (2회 반복)', () => {
    const c: Colliders = { segs: [{ a: [0, 5], b: [10, 5], r: 0.1 }, { a: [5, 0], b: [5, 10], r: 0.1 }], rects: [] }
    const p = collide({ x: 4.7, y: 4.7 }, R, c, B)
    expect(p.x).toBeCloseTo(4.45)
    expect(p.y).toBeCloseTo(4.45)
  })

  it('회전된 사각형 바깥에서 닿으면 표면 밖으로', () => {
    const c: Colliders = { segs: [], rects: [{ cx: 5, cy: 5, hw: 2, hh: 1, rot: Math.PI / 2 }] } // 90° → x 로 ±1, y 로 ±2
    const p = collide({ x: 6.2, y: 5 }, R, c, B)
    expect(p.x).toBeCloseTo(6.45)
    expect(p.y).toBeCloseTo(5)
  })

  it('사각형 안에 들어가 있으면 가장 가까운 면 밖으로', () => {
    const c: Colliders = { segs: [], rects: [{ cx: 5, cy: 5, hw: 2, hh: 1, rot: 0 }] }
    const p = collide({ x: 6.8, y: 5.2 }, R, c, B)
    expect(p.x).toBeCloseTo(7.45)
    expect(p.y).toBeCloseTo(5.2)
  })

  it('도면 경계 밖으로 못 나감', () => {
    const p = collide({ x: -3, y: 20 }, R, { segs: [], rects: [] }, B)
    expect(p.x).toBeCloseTo(0.45)
    expect(p.y).toBeCloseTo(9.55)
  })

  it('여유 거리: 선분은 거리 − 반두께, 사각형 안은 0', () => {
    expect(clearance(5, 3, wallAt5)).toBeCloseTo(1.9)
    expect(clearance(5, 5, { segs: [], rects: [{ cx: 5, cy: 5, hw: 1, hh: 1, rot: 0 }] })).toBe(0)
    expect(clearance(1, 1, { segs: [], rects: [] })).toBe(Infinity)
  })
})

describe('시작 자리', () => {
  it('빈 도면은 가운데 칸', () => {
    expect(findSpawn({ segs: [], rects: [] }, { w: 20, h: 20 })).toEqual({ x: 9.5, y: 9.5 })
  })

  it('가운데가 막혀 있으면 주변 1 m 가 빈 가장 가까운 칸', () => {
    const c: Colliders = { segs: [], rects: [{ cx: 10, cy: 10, hw: 3, hh: 3, rot: 0 }] }
    const s = findSpawn(c, { w: 20, h: 20 })
    expect(s).toEqual({ x: 5.5, y: 9.5 })
    expect(clearance(s.x, s.y, c)).toBeGreaterThanOrEqual(1)
  })

  it('빈 칸이 없으면 도면 가운데', () => {
    const c: Colliders = { segs: [], rects: [{ cx: 5, cy: 5, hw: 10, hh: 10, rot: 0 }] }
    expect(findSpawn(c, { w: 10, h: 10 })).toEqual({ x: 5, y: 5 })
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd /c/kopens/project/Factory3D/web && npx vitest run src/walk/collide.test.ts`
Expected: FAIL — `Failed to resolve import "./colliders"`

- [ ] **Step 3: 구현**

`web/src/walk/colliders.ts`:
```ts
import type { Plan, Pt } from '../drawing/plan/types'
import type { Category } from '../objects/types'

/** 선분 장애물 (외벽·가벽): 양 끝 + 반두께 r (m) */
export interface Seg { a: Pt; b: Pt; r: number }
/** 회전 사각형 장애물 (기둥·설비·자재): 중심 · 반폭(로컬 x) · 반높이(로컬 y) · 반시계 rad */
export interface Rect { cx: number; cy: number; hw: number; hh: number; rot: number }
export interface Colliders { segs: Seg[]; rects: Rect[] }
/** 배치 하나 (rot 도·반시계, size 는 모델 또는 임시 상자 크기, category null = 모델 없는 임시 상자) */
export interface Solid { x: number; y: number; rot: number; sizeX: number; sizeY: number; category: Category | null }

const MIN_SEG = 0.05 // planToMeshes 와 같음 — 이보다 짧은 조각은 벽을 만들지 않음

/** plan + 배치 → 충돌 도형 (plan 좌표). 운반(mover)은 지나갈 수 있음 */
export function buildColliders(plan: Pick<Plan, 'walls' | 'partitions' | 'columns'>, solids: Solid[]): Colliders {
  const segs: Seg[] = []
  for (const w of [...plan.walls, ...plan.partitions])
    for (let j = 0; j + 1 < w.pts.length; j++) {
      const a = w.pts[j], b = w.pts[j + 1]
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) >= MIN_SEG) segs.push({ a, b, r: w.t / 2 })
    }
  // 기둥: H빔 몸통 (w = plan x 방향, d = plan y 방향 — planToMeshes 와 같음)
  const rects: Rect[] = plan.columns.map((c) => ({ cx: c.x, cy: c.y, hw: c.w / 2, hh: c.d / 2, rot: 0 }))
  for (const s of solids)
    if (s.category !== 'mover') rects.push({ cx: s.x, cy: s.y, hw: s.sizeX / 2, hh: s.sizeY / 2, rot: (s.rot * Math.PI) / 180 })
  return { segs, rects }
}
```

`web/src/walk/collide.ts`:
```ts
import type { Colliders, Rect, Seg } from './colliders'

type P = { x: number; y: number }
const EPS2 = 1e-12
const clamp = (v: number, lo: number, hi: number) => (hi < lo ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v)))

function nearestOnSeg(x: number, y: number, s: Seg): [number, number] {
  const [ax, ay] = s.a, [bx, by] = s.b
  const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy
  const t = l2 ? clamp(((x - ax) * vx + (y - ay) * vy) / l2, 0, 1) : 0
  return [ax + vx * t, ay + vy * t]
}

function toLocal(x: number, y: number, r: Rect): [number, number] {
  const c = Math.cos(r.rot), s = Math.sin(r.rot), ox = x - r.cx, oy = y - r.cy
  return [ox * c + oy * s, -ox * s + oy * c]
}

function fromLocal(lx: number, ly: number, r: Rect): P {
  const c = Math.cos(r.rot), s = Math.sin(r.rot)
  return { x: r.cx + lx * c - ly * s, y: r.cy + lx * s + ly * c }
}

/** 원(반지름 radius)과 두꺼운 선분: 겹치면 가장 가까운 점에서 바깥으로 */
function pushSeg(p: P, radius: number, s: Seg): P {
  const [qx, qy] = nearestOnSeg(p.x, p.y, s)
  const dx = p.x - qx, dy = p.y - qy, d2 = dx * dx + dy * dy, R = s.r + radius
  if (d2 >= R * R) return p
  if (d2 > EPS2) {
    const d = Math.sqrt(d2)
    return { x: qx + (dx / d) * R, y: qy + (dy / d) * R }
  }
  // 선 위에 정확히 있음: 선분의 왼쪽 법선으로
  const vx = s.b[0] - s.a[0], vy = s.b[1] - s.a[1], l = Math.hypot(vx, vy) || 1
  return { x: qx - (vy / l) * R, y: qy + (vx / l) * R }
}

/** 원과 회전 사각형 (참고 파일 collide 의 상자 분기를 회전 사각형으로) */
function pushRect(p: P, radius: number, r: Rect): P {
  const [lx, ly] = toLocal(p.x, p.y, r)
  const nx = clamp(lx, -r.hw, r.hw), ny = clamp(ly, -r.hh, r.hh)
  const dx = lx - nx, dy = ly - ny, d2 = dx * dx + dy * dy
  if (d2 >= radius * radius) return p
  if (d2 > EPS2) {
    const d = Math.sqrt(d2)
    return fromLocal(nx + (dx / d) * radius, ny + (dy / d) * radius, r)
  }
  // 사각형 안: 가장 가까운 면 밖으로
  const pen = [lx + r.hw, r.hw - lx, ly + r.hh, r.hh - ly]
  const i = pen.indexOf(Math.min(...pen))
  if (i === 0) return fromLocal(-r.hw - radius, ly, r)
  if (i === 1) return fromLocal(r.hw + radius, ly, r)
  if (i === 2) return fromLocal(lx, -r.hh - radius, r)
  return fromLocal(lx, r.hh + radius, r)
}

/** 몸(원)을 도면 경계 안으로, 선분·사각형 밖으로 (2회 반복 — 모서리에서 두 벽 모두) */
export function collide(p: P, radius: number, c: Colliders, b: { w: number; h: number }): P {
  const inside = (q: P): P => ({ x: clamp(q.x, radius, b.w - radius), y: clamp(q.y, radius, b.h - radius) })
  let q = inside(p)
  for (let it = 0; it < 2; it++) {
    for (const s of c.segs) q = pushSeg(q, radius, s)
    for (const r of c.rects) q = pushRect(q, radius, r)
  }
  return inside(q)
}

/** 점에서 가장 가까운 장애물 표면까지 거리 (m). 사각형 안이면 0, 장애물이 없으면 Infinity */
export function clearance(x: number, y: number, c: Colliders): number {
  let best = Infinity
  for (const s of c.segs) {
    const [qx, qy] = nearestOnSeg(x, y, s)
    best = Math.min(best, Math.hypot(x - qx, y - qy) - s.r)
  }
  for (const r of c.rects) {
    const [lx, ly] = toLocal(x, y, r)
    const dx = Math.max(Math.abs(lx) - r.hw, 0), dy = Math.max(Math.abs(ly) - r.hh, 0)
    best = Math.min(best, Math.hypot(dx, dy))
  }
  return best
}
```

`web/src/walk/spawn.ts`:
```ts
import type { Colliders } from './colliders'
import { clearance } from './collide'

const MAX_CELLS = 200000 // 아주 큰 도면은 격자를 성기게

/**
 * 시작 자리: 도면 경계 안 1 m 격자 칸 가운데 중, 장애물·경계에서 room(1 m) 이상 떨어진 칸 가운데
 * 도면 가운데에 가장 가까운 칸 (같은 거리면 x 가 작은 칸, 그다음 y 가 작은 칸). 없으면 도면 가운데.
 */
export function findSpawn(c: Colliders, b: { w: number; h: number }, room = 1): { x: number; y: number } {
  const cx = b.w / 2, cy = b.h / 2
  const step = Math.max(1, Math.ceil(Math.sqrt((b.w * b.h) / MAX_CELLS)))
  const cells: { x: number; y: number; d: number }[] = []
  for (let i = 0; (i + 1) * step <= b.w; i++)
    for (let j = 0; (j + 1) * step <= b.h; j++) {
      const x = i * step + step / 2, y = j * step + step / 2
      cells.push({ x, y, d: (x - cx) ** 2 + (y - cy) ** 2 })
    }
  cells.sort((p, q) => p.d - q.d) // 안정 정렬 — 같은 거리는 넣은 순서
  for (const p of cells) {
    if (p.x < room || p.x > b.w - room || p.y < room || p.y > b.h - room) continue
    if (clearance(p.x, p.y, c) >= room) return { x: p.x, y: p.y }
  }
  return { x: cx, y: cy }
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd /c/kopens/project/Factory3D/web && npx vitest run src/walk/collide.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
cd /c/kopens/project/Factory3D && git add web/src/walk/colliders.ts web/src/walk/collide.ts web/src/walk/spawn.ts web/src/walk/collide.test.ts
git commit -m "feat(web): 체험 공간 충돌 도형·밀어내기·시작 자리

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 웹 — 걷기 입력 · 구역 · 미니맵 · plan↔월드 좌표 (순수 모듈)

**Files:**
- Create: `web/src/walk/player.ts`, `web/src/walk/zoneAt.ts`, `web/src/walk/minimap.ts`
- Modify: `web/src/scene/coords.ts` (planToWorld · worldToPlan)
- Test: `web/src/walk/player.test.ts`, `web/src/walk/minimap.test.ts`, `web/src/scene/coords.test.ts` (추가)

**Interfaces:**
- Consumes: `Zone`·`Plan`·`Pt` (plan/types), `rectOf` (`web/src/objects/grid.ts`: `rectOf(p:{x,y,rot}, size:{sizeX,sizeY}) → {x,y,ux,uy,hl,hw}`), `planToLocal`·`localToPlan` (coords).
- Produces:
```ts
// player.ts
export const WALK: { eye: 1.7; speed: 5.2; run: 8.5; radius: 0.45; fov: 70; pitchMax: 1.35; drag: 0.0045; touchLook: 0.005;
  ovDrag: 0.005; ovTouch: 0.008; bob: 0.045; bobWalk: 9; bobRun: 13; dtMax: 0.05; pickFar: 18; clickPx: 6 }
export interface Player { x: number; y: number; yaw: number; pitch: number; bobT: number } // plan m · yaw 0 = +y, 양수 = 왼쪽(반시계)으로 돎
export interface MoveInput { fx: number; fz: number; run: boolean }  // fx +1 = 오른쪽, fz −1 = 앞 (참고 파일 그대로)
export function moveInput(keys: ReadonlySet<string>, joy: { x: number; y: number }): MoveInput   // keys = KeyboardEvent.code
export function turn(p: Player, dx: number, dy: number, k: number): Player
export function step(p: Player, input: MoveInput, dt: number, solve: (x: number, y: number) => { x: number; y: number }): Player
// zoneAt.ts
export function inPoly(x: number, y: number, poly: Pt[]): boolean
export function zoneAt(zones: Zone[], x: number, y: number): Zone | null
// coords.ts
export interface PlanFrame { bounds: { w: number; h: number }; rotQ: 0 | 1 | 2 | 3; flip: 1 | -1 }   // Plan 이 그대로 맞음
export function planToWorld(x: number, y: number, f: PlanFrame): [number, number]   // 월드 [x, z]
export function worldToPlan(wx: number, wz: number, f: PlanFrame): Pt
// minimap.ts
export interface MiniFrame { width: number; height: number; at(x: number, y: number): [number, number]; dir(dx: number, dy: number): [number, number] }
export function miniFrame(f: PlanFrame, maxW?: number, maxH?: number, pad?: number): MiniFrame   // 280 · 200 · 8
export type Mini2D = Pick<CanvasRenderingContext2D, 'clearRect' | 'beginPath' | 'moveTo' | 'lineTo' | 'closePath' | 'stroke' | 'fill' | 'strokeStyle' | 'fillStyle' | 'lineWidth'>
export interface MiniObject { x: number; y: number; rot: number; sizeX: number; sizeY: number }
export interface MiniMe { x: number; y: number; yaw: number }
export function drawMinimap(ctx: Mini2D, fr: MiniFrame, plan: Pick<Plan, 'walls' | 'partitions' | 'zones'>, objects: MiniObject[], me: MiniMe): void
```

- [ ] **Step 1: 실패 테스트**

`web/src/walk/player.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { moveInput, step, turn, WALK, type Player } from './player'

const P0: Player = { x: 10, y: 10, yaw: 0, pitch: 0, bobT: 0 }
const free = (x: number, y: number) => ({ x, y })
const keys = (...k: string[]) => moveInput(new Set(k), { x: 0, y: 0 })

describe('걷기 입력', () => {
  it('W·방향키 위 = 앞(+y), S = 뒤, D = 오른쪽(+x), A = 왼쪽, Shift = 달리기', () => {
    expect(keys('KeyW')).toEqual({ fx: 0, fz: -1, run: false })
    expect(keys('ArrowUp', 'ArrowRight', 'ShiftLeft')).toEqual({ fx: 1, fz: -1, run: true })
    expect(keys('KeyS', 'KeyA', 'ShiftRight')).toEqual({ fx: -1, fz: 1, run: true })
    expect(moveInput(new Set(), { x: 0.5, y: -0.25 })).toEqual({ fx: 0.5, fz: -0.25, run: false })
  })

  it('전진: 걷기 5.2 m/s, 걸음 흔들림 9 rad/s', () => {
    const p = step(P0, keys('KeyW'), 0.05, free)
    expect(p.x).toBeCloseTo(10)
    expect(p.y).toBeCloseTo(10 + 5.2 * 0.05)
    expect(p.bobT).toBeCloseTo(0.05 * 9)
  })

  it('옆걸음 · 대각선은 같은 속도 · 달리기 8.5 m/s · 흔들림 13 rad/s', () => {
    expect(step(P0, keys('KeyD'), 0.05, free).x).toBeCloseTo(10 + 0.26)
    const d = step(P0, keys('KeyW', 'KeyD'), 0.05, free)
    expect(Math.hypot(d.x - 10, d.y - 10)).toBeCloseTo(0.26)
    const r = step(P0, keys('KeyW', 'ShiftLeft'), 0.05, free)
    expect(r.y).toBeCloseTo(10 + 8.5 * 0.05)
    expect(r.bobT).toBeCloseTo(0.05 * 13)
  })

  it('조이스틱 반만 밀면 반 속도', () => {
    const p = step(P0, moveInput(new Set(), { x: 0, y: -0.5 }), 0.05, free)
    expect(p.y).toBeCloseTo(10 + 5.2 * 0.5 * 0.05)
  })

  it('왼쪽으로 90° 돈 뒤 전진 = −x', () => {
    const p = step({ ...P0, yaw: Math.PI / 2 }, keys('KeyW'), 0.05, free)
    expect(p.x).toBeCloseTo(10 - 0.26)
    expect(p.y).toBeCloseTo(10)
  })

  it('dt 는 0.05 초까지만 (탭 전환 뒤 순간 이동 방지), 안 누르면 그대로', () => {
    expect(step(P0, keys('KeyW'), 0.5, free).y).toBeCloseTo(10 + 0.26)
    expect(step(P0, keys(), 0.05, free)).toBe(P0)
  })

  it('이동한 자리는 solve(충돌)가 정함', () => {
    const p = step(P0, keys('KeyW'), 0.05, () => ({ x: 1, y: 2 }))
    expect(p).toMatchObject({ x: 1, y: 2 })
  })

  it('드래그: 오른쪽으로 끌면 오른쪽으로 돎(yaw 감소), 피치 ±1.35 rad', () => {
    expect(turn(P0, 100, 0, WALK.drag).yaw).toBeCloseTo(-0.45)
    expect(turn(P0, 0, -1000, WALK.drag).pitch).toBe(1.35)
    expect(turn(P0, 0, 1000, WALK.drag).pitch).toBe(-1.35)
  })
})
```

`web/src/walk/minimap.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import type { Pt, Zone } from '../drawing/plan/types'
import { drawMinimap, miniFrame, type Mini2D } from './minimap'
import { inPoly, zoneAt } from './zoneAt'

const Z = (id: string, name: string, poly: Pt[]): Zone => ({ id, name, poly, color: '#ffffff', stationId: null })

describe('구역', () => {
  it('오목 다각형 안·밖', () => {
    const L: Pt[] = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]]
    expect(inPoly(2, 8, L)).toBe(true)
    expect(inPoly(8, 2, L)).toBe(true)
    expect(inPoly(8, 8, L)).toBe(false)
  })
  it('먼저 맞는 구역, 없으면 null', () => {
    const zones = [Z('a', 'Hub 조립장', [[0, 0], [5, 0], [5, 5], [0, 5]]), Z('b', '자재 창고', [[5, 0], [10, 0], [10, 5], [5, 5]])]
    expect(zoneAt(zones, 7, 2)?.name).toBe('자재 창고')
    expect(zoneAt(zones, 7, 8)).toBeNull()
    expect(zoneAt([Z('c', '선', [[0, 0], [1, 1]])], 0.5, 0.5)).toBeNull()
  })
})

/** 그리기 호출 기록 (좌표 소수 1자리) */
function recorder() {
  const calls: string[] = []
  const f = (v: number) => v.toFixed(1)
  const ctx = {
    strokeStyle: '', fillStyle: '', lineWidth: 1,
    clearRect: () => calls.push('clear'),
    beginPath: () => calls.push('begin'),
    moveTo: (x: number, y: number) => calls.push(`M ${f(x)} ${f(y)}`),
    lineTo: (x: number, y: number) => calls.push(`L ${f(x)} ${f(y)}`),
    closePath: () => calls.push('close'),
    stroke: () => calls.push(`stroke ${String(ctx.strokeStyle)} ${ctx.lineWidth}`),
    fill: () => calls.push(`fill ${String(ctx.fillStyle)}`),
  }
  return { ctx: ctx as unknown as Mini2D, calls }
}

describe('미니맵', () => {
  it('폭 280, 높이는 도면 비율 (회전한 도면은 돌린 비율, 높이 200 넘으면 폭을 줄임)', () => {
    const a = miniFrame({ bounds: { w: 100, h: 50 }, rotQ: 0, flip: 1 })
    expect([a.width, a.height]).toEqual([280, 148])
    const b = miniFrame({ bounds: { w: 100, h: 50 }, rotQ: 1, flip: 1 })
    expect([b.width, b.height]).toEqual([108, 200])
  })

  it('3D 와 같은 방향: plan 위쪽 = 캔버스 위쪽(rotQ 0), 내 위치 = 바라보는 쪽 빨간 삼각형', () => {
    const fr = miniFrame({ bounds: { w: 100, h: 50 }, rotQ: 0, flip: 1 })
    expect(fr.at(50, 25).map((v) => +v.toFixed(1))).toEqual([140, 74])
    const [ux, uy] = fr.dir(0, 1)
    expect(ux).toBeCloseTo(0)
    expect(uy).toBeCloseTo(-1)
    const { ctx, calls } = recorder()
    drawMinimap(
      ctx, fr,
      {
        walls: [{ id: 'w', pts: [[0, 0], [100, 0]], h: 8, t: 0.3 }],
        partitions: [{ id: 'p', pts: [[50, 0], [50, 20]], h: 1.2, t: 0.1 }],
        zones: [Z('z', 'Hub', [[10, 10], [20, 10], [20, 20], [10, 20]])],
      },
      [{ x: 30, y: 30, rot: 0, sizeX: 4, sizeY: 2 }],
      { x: 50, y: 25, yaw: 0 },
    )
    expect(calls[0]).toBe('clear')
    expect(calls).toContain('stroke rgba(255,255,255,.6) 1.5')
    expect(calls).toContain('stroke rgba(255,255,255,.35) 1')
    expect(calls).toContain('stroke rgba(76,217,123,.7) 1')
    expect(calls).toContain('fill rgba(180,195,205,.5)')
    expect(calls.slice(-6)).toEqual(['begin', 'M 140.0 68.0', 'L 144.0 78.0', 'L 136.0 78.0', 'close', 'fill #ff5544'])
  })

  it('왼쪽으로 90° 돌면 삼각형도 왼쪽을 가리킴', () => {
    const fr = miniFrame({ bounds: { w: 100, h: 50 }, rotQ: 0, flip: 1 })
    const { ctx, calls } = recorder()
    drawMinimap(ctx, fr, { walls: [], partitions: [], zones: [] }, [], { x: 50, y: 25, yaw: Math.PI / 2 })
    expect(calls).toContain('M 134.0 74.0')
  })
})
```

`web/src/scene/coords.test.ts` 맨 위 import 를 아래로 바꾸고, 파일 끝에 describe 하나 추가:
```ts
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { localToPlan, planToLocal, planToWorld, worldToPlan } from './coords'
```
```ts
describe('plan ↔ 월드 좌표 (root 회전·반전 포함)', () => {
  it('8가지 회전·반전 모두 FactoryScene root 와 같은 자리, 되돌리면 원래 plan', () => {
    const bounds = { w: 30, h: 10 }
    for (const rotQ of [0, 1, 2, 3] as const)
      for (const flip of [1, -1] as const) {
        const root = new THREE.Group()
        root.scale.set(flip, 1, 1)
        root.rotation.y = (rotQ * Math.PI) / 2
        root.updateMatrixWorld(true)
        const [lx, lz] = planToLocal(7, 3, bounds)
        const want = root.localToWorld(new THREE.Vector3(lx, 0, lz))
        const [x, z] = planToWorld(7, 3, { bounds, rotQ, flip })
        expect(x).toBeCloseTo(want.x)
        expect(z).toBeCloseTo(want.z)
        const [px, py] = worldToPlan(x, z, { bounds, rotQ, flip })
        expect(px).toBeCloseTo(7)
        expect(py).toBeCloseTo(3)
      }
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd /c/kopens/project/Factory3D/web && npx vitest run src/walk/player.test.ts src/walk/minimap.test.ts src/scene/coords.test.ts`
Expected: FAIL — `Failed to resolve import "./player"`, `"./minimap"`, coords 는 `planToWorld is not a function`

- [ ] **Step 3: 구현**

`web/src/walk/player.ts`:
```ts
/** 참고 파일 player · animate(walk 분기)의 수치 */
export const WALK = {
  eye: 1.7, speed: 5.2, run: 8.5, radius: 0.45, fov: 70, pitchMax: 1.35,
  drag: 0.0045, touchLook: 0.005, ovDrag: 0.005, ovTouch: 0.008,
  bob: 0.045, bobWalk: 9, bobRun: 13, dtMax: 0.05, pickFar: 18, clickPx: 6,
} as const

/** plan 좌표(m). yaw 0 = plan +y(도면 위쪽)를 봄, 양수 = 왼쪽(반시계)으로 돎. bobT = 걸음 흔들림 위상 */
export interface Player { x: number; y: number; yaw: number; pitch: number; bobT: number }
/** fx +1 = 오른쪽, fz −1 = 앞 (참고 파일 그대로 — 조이스틱 아래로 당기면 +) */
export interface MoveInput { fx: number; fz: number; run: boolean }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** 누른 키(KeyboardEvent.code) + 조이스틱(−1..1) → 이동 입력 */
export function moveInput(keys: ReadonlySet<string>, joy: { x: number; y: number }): MoveInput {
  let fx = 0, fz = 0
  if (keys.has('KeyW') || keys.has('ArrowUp')) fz -= 1
  if (keys.has('KeyS') || keys.has('ArrowDown')) fz += 1
  if (keys.has('KeyA') || keys.has('ArrowLeft')) fx -= 1
  if (keys.has('KeyD') || keys.has('ArrowRight')) fx += 1
  return { fx: fx + joy.x, fz: fz + joy.y, run: keys.has('ShiftLeft') || keys.has('ShiftRight') }
}

/** 드래그(px) → 시점. k = rad/px (마우스 0.0045, 터치 0.005) */
export function turn(p: Player, dx: number, dy: number, k: number): Player {
  return { ...p, yaw: p.yaw - dx * k, pitch: clamp(p.pitch - dy * k, -WALK.pitchMax, WALK.pitchMax) }
}

/** 한 프레임 이동 (dt 최대 0.05초). 새 자리는 solve(충돌 처리)가 정함 */
export function step(p: Player, input: MoveInput, dt: number, solve: (x: number, y: number) => { x: number; y: number }): Player {
  const d = Math.min(Math.max(dt, 0), WALK.dtMax)
  const len = Math.hypot(input.fx, input.fz)
  if (len <= 0.01) return p
  const sp = (input.run ? WALK.run : WALK.speed) * Math.min(len, 1)
  const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw)
  const fx = input.fx / len, fz = input.fz / len
  // 참고 파일: 월드 (x, z) 이동 = (fx·cos + fz·sin, −fx·sin + fz·cos). plan y = −z
  const mx = fx * cos + fz * sin, my = fx * sin - fz * cos
  const at = solve(p.x + mx * sp * d, p.y + my * sp * d)
  return { ...p, x: at.x, y: at.y, bobT: p.bobT + d * (input.run ? WALK.bobRun : WALK.bobWalk) }
}
```

`web/src/walk/zoneAt.ts`:
```ts
import type { Pt, Zone } from '../drawing/plan/types'

/** 점이 다각형 안인가 (짝홀 규칙, 오목 다각형도) */
export function inPoly(x: number, y: number, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** 지금 서 있는 구역 (먼저 맞는 것). 꼭짓점 3개 미만은 건너뜀 */
export function zoneAt(zones: Zone[], x: number, y: number): Zone | null {
  return zones.find((z) => z.poly.length >= 3 && inPoly(x, y, z.poly)) ?? null
}
```

`web/src/scene/coords.ts` 끝에 추가:
```ts
/** 도면 회전·반전 (Plan 이 그대로 맞음) */
export interface PlanFrame { bounds: { w: number; h: number }; rotQ: 0 | 1 | 2 | 3; flip: 1 | -1 }

const COS = [1, 0, -1, 0]
const SIN = [0, 1, 0, -1]

/** plan(m) → 월드 [x, z]: FactoryScene root (scale.x = flip, rotation.y = rotQ·90°) 를 거친 자리 */
export function planToWorld(x: number, y: number, f: PlanFrame): [number, number] {
  const [lx, lz] = planToLocal(x, y, f.bounds), fx = lx * f.flip, c = COS[f.rotQ], s = SIN[f.rotQ]
  return [c * fx + s * lz, -s * fx + c * lz]
}

/** 월드 [x, z] → plan(m) */
export function worldToPlan(wx: number, wz: number, f: PlanFrame): Pt {
  const c = COS[f.rotQ], s = SIN[f.rotQ], fx = c * wx - s * wz, lz = s * wx + c * wz
  return localToPlan(fx * f.flip, lz, f.bounds)
}
```

`web/src/walk/minimap.ts`:
```ts
import type { Plan } from '../drawing/plan/types'
import { rectOf } from '../objects/grid'
import { planToWorld, type PlanFrame } from '../scene/coords'

/** 미니맵 캔버스 크기와 plan → 캔버스 변환 (3D 를 위에서 본 방향: 오른쪽 = 월드 +x, 위 = 월드 −z) */
export interface MiniFrame {
  width: number
  height: number
  at(x: number, y: number): [number, number]
  dir(dx: number, dy: number): [number, number] // plan 방향 → 캔버스 단위 방향
}
export type Mini2D = Pick<CanvasRenderingContext2D, 'clearRect' | 'beginPath' | 'moveTo' | 'lineTo' | 'closePath' | 'stroke' | 'fill' | 'strokeStyle' | 'fillStyle' | 'lineWidth'>
export interface MiniObject { x: number; y: number; rot: number; sizeX: number; sizeY: number }
export interface MiniMe { x: number; y: number; yaw: number }

const WALL = 'rgba(255,255,255,.6)'
const PARTITION = 'rgba(255,255,255,.35)'
const ZONE = 'rgba(76,217,123,.7)'
const OBJECT = 'rgba(180,195,205,.5)'
const ME = '#ff5544'

/** 폭 maxW(280) · 높이 = 도면(돌린) 비율. 높이가 maxH(200) 를 넘으면 높이 200 에 맞추고 폭을 줄임 */
export function miniFrame(f: PlanFrame, maxW = 280, maxH = 200, pad = 8): MiniFrame {
  const { w, h } = f.bounds
  const xs: number[] = [], zs: number[] = []
  for (const [x, y] of [[0, 0], [w, 0], [w, h], [0, h]]) {
    const [X, Z] = planToWorld(x, y, f)
    xs.push(X)
    zs.push(Z)
  }
  const x0 = Math.min(...xs), z0 = Math.min(...zs)
  const W = Math.max(...xs) - x0 || 1, D = Math.max(...zs) - z0 || 1
  let k = (maxW - pad * 2) / W, width = maxW, height = Math.round(D * k + pad * 2)
  if (height > maxH) {
    k = (maxH - pad * 2) / D
    height = maxH
    width = Math.round(W * k + pad * 2)
  }
  const at = (x: number, y: number): [number, number] => {
    const [X, Z] = planToWorld(x, y, f)
    return [pad + (X - x0) * k, pad + (Z - z0) * k]
  }
  const [ox, oy] = at(0, 0)
  const dir = (dx: number, dy: number): [number, number] => {
    const [ax, ay] = at(dx, dy), vx = ax - ox, vy = ay - oy, l = Math.hypot(vx, vy) || 1
    return [vx / l, vy / l]
  }
  return { width, height, at, dir }
}

/** 참고 파일 drawMinimap: 외벽·가벽 선, 구역 테두리, 객체 사각형, 내 위치 빨간 삼각형 */
export function drawMinimap(ctx: Mini2D, fr: MiniFrame, plan: Pick<Plan, 'walls' | 'partitions' | 'zones'>, objects: MiniObject[], me: MiniMe): void {
  ctx.clearRect(0, 0, fr.width, fr.height)
  const poly = (pts: [number, number][], closed: boolean) => {
    pts.forEach(([x, y], i) => {
      const [u, v] = fr.at(x, y)
      if (i === 0) ctx.moveTo(u, v)
      else ctx.lineTo(u, v)
    })
    if (closed) ctx.closePath()
  }
  const lines = (list: { pts: [number, number][] }[], color: string, width: number) => {
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.beginPath()
    for (const l of list) poly(l.pts, false)
    ctx.stroke()
  }
  lines(plan.walls, WALL, 1.5)
  lines(plan.partitions, PARTITION, 1)
  ctx.strokeStyle = ZONE
  ctx.lineWidth = 1
  ctx.beginPath()
  for (const z of plan.zones) poly(z.poly, true)
  ctx.stroke()
  ctx.fillStyle = OBJECT
  ctx.beginPath()
  for (const o of objects) {
    const r = rectOf(o, o)
    poly(
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]): [number, number] => [r.x + r.ux * a * r.hl - r.uy * b * r.hw, r.y + r.uy * a * r.hl + r.ux * b * r.hw]),
      true,
    )
  }
  ctx.fill()
  // 내 위치: 앞 6px · 뒤 양옆 4px (참고 파일)
  const [px, py] = fr.at(me.x, me.y)
  const [ux, uy] = fr.dir(-Math.sin(me.yaw), Math.cos(me.yaw))
  const nx = -uy, ny = ux
  ctx.fillStyle = ME
  ctx.beginPath()
  ctx.moveTo(px + ux * 6, py + uy * 6)
  ctx.lineTo(px - ux * 4 + nx * 4, py - uy * 4 + ny * 4)
  ctx.lineTo(px - ux * 4 - nx * 4, py - uy * 4 - ny * 4)
  ctx.closePath()
  ctx.fill()
}
```
(삼각형 검산: yaw 0 → 방향 (0, −1) · 법선 (1, 0) → 앞 (140, 68), 뒤 (144, 78)·(136, 78). 테스트의 `L 144.0 78.0` 이 먼저.)

- [ ] **Step 4: 통과 확인**

Run: `cd /c/kopens/project/Factory3D/web && npx vitest run src/walk/player.test.ts src/walk/minimap.test.ts src/scene/coords.test.ts`
Expected: PASS (player 8 · minimap 5 · coords 3)

- [ ] **Step 5: Commit**

```bash
cd /c/kopens/project/Factory3D && git add web/src/walk/player.ts web/src/walk/zoneAt.ts web/src/walk/minimap.ts web/src/scene/coords.ts web/src/walk/player.test.ts web/src/walk/minimap.test.ts web/src/scene/coords.test.ts
git commit -m "feat(web): 체험 공간 걷기 입력·구역·미니맵, plan↔월드 좌표

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 3D — 카메라 드라이버 · 조감 벽 반투명 · 배치 고르기 (WalkHost)

**Files:**
- Create: `web/src/scene/walkLook.ts`
- Modify: `web/src/scene/FactoryScene.ts`
- Test: `web/src/scene/walkLook.test.ts`

**Interfaces:**
- Consumes: `planToWorld`·`worldToPlan`·`PlanFrame` (Task 2), `Materials` (`panel`·`drywall`·`plinth`), `planToMeshes` 의 `userData.kind` (`'wall' | 'partition' | 'plinth' | 'column'`), `ObjectLayer.pick(ray)`.
- Produces:
```ts
// walkLook.ts
export interface PlanPoint { x: number; y: number; h: number }          // plan m + 높이 m
export interface CameraPose { eye: PlanPoint; look: PlanPoint }          // 눈 · 바라보는 점
export interface CameraDriver { update(dt: number): CameraPose }          // 매 프레임 (dt 초, 장면이 0.1 로 자름)
export const WALK_FOV = 70, WALK_NEAR = 0.05, GHOST_OPACITY = 0.13
export function worldOf(p: PlanPoint, f: PlanFrame, out?: THREE.Vector3): THREE.Vector3
export function applyPose(cam: THREE.PerspectiveCamera, pose: CameraPose, f: PlanFrame): void
export function ghostWalls(mats: Materials, group: THREE.Object3D | null, on: boolean): void
export function walkFog(span: number, overview: boolean): { near: number; far: number }   // 걷기 60~160, 조감 max(250, span·2.2)~max(800, span·6)
// FactoryScene.ts
export interface WalkHost {
  setCameraDriver(d: CameraDriver | null): void   // 있으면 OrbitControls·Navigator 멈춤, 시야각 70° · 가까운 면 5 cm. null = 걷기 전 궤도 시점으로
  setGhostWalls(on: boolean): void                // 외벽·가벽·걸레받이 재질 투명도 0.13 · 깊이 쓰기·그림자 끔
  pickPlacement(sx: number, sy: number, far: number): number | null   // clientX/Y → 배치 id (far m 안)
  worldOfPlan(x: number, y: number, h: number): THREE.Vector3
  planOfWorld(v: THREE.Vector3): { x: number; y: number }
}
export type SceneHost = PickSource & ObjectHost & DashHost & WalkHost
```

- [ ] **Step 1: 실패 테스트**

`web/src/scene/walkLook.test.ts`:
```ts
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import type { Plan } from '../drawing/plan/types'
import { planToLocal } from './coords'
import { createMaterials } from './materials'
import { planToMeshes } from './planToMeshes'
import { applyPose, ghostWalls, walkFog, worldOf } from './walkLook'

const PLAN: Plan = {
  format: 1, unit: 'm', scale: 1, rotQ: 0, flip: 1, bounds: { w: 20, h: 10 },
  layers: [], lines: [], texts: [],
  walls: [{ id: 'w1', pts: [[0, 0], [20, 0]], h: 8, t: 0.3 }],
  partitions: [{ id: 'p1', pts: [[5, 0], [5, 5]], h: 1.2, t: 0.1 }],
  columns: [{ id: 'c1', x: 10, y: 5, w: 0.4, d: 0.4, h: 8 }],
  zones: [], objectHints: [],
  warnings: { unsupported: {}, unitGuessed: false },
}

describe('걷기 카메라', () => {
  it('plan 좌표 자세 → 월드 카메라: 회전·반전 도면도 root 와 같은 자리·방향', () => {
    const f = { bounds: { w: 40, h: 20 }, rotQ: 1 as const, flip: -1 as const }
    const root = new THREE.Group()
    root.scale.set(-1, 1, 1)
    root.rotation.y = Math.PI / 2
    root.updateMatrixWorld(true)
    const at = (x: number, y: number, h: number) => {
      const [lx, lz] = planToLocal(x, y, f.bounds)
      return root.localToWorld(new THREE.Vector3(lx, h, lz))
    }
    expect(worldOf({ x: 3, y: 4, h: 2 }, f).distanceTo(at(3, 4, 2))).toBeLessThan(1e-9)
    const cam = new THREE.PerspectiveCamera(70, 1, 0.05, 1000)
    applyPose(cam, { eye: { x: 10, y: 5, h: 1.7 }, look: { x: 10, y: 6, h: 1.7 } }, f)
    expect(cam.position.distanceTo(at(10, 5, 1.7))).toBeLessThan(1e-9)
    cam.updateMatrixWorld()
    const dir = cam.getWorldDirection(new THREE.Vector3())
    expect(dir.distanceTo(at(10, 6, 1.7).sub(at(10, 5, 1.7)).normalize())).toBeLessThan(1e-9)
  })

  it('조감 뷰: 외벽·가벽·걸레받이 재질 반투명 0.13 · 그림자 끔, 기둥 강재는 그대로, 끄면 원래대로', () => {
    const mats = createMaterials()
    const { group } = planToMeshes(PLAN, mats, { labels: false })
    const shadows = (kinds: string[]) => {
      const out: boolean[] = []
      group.traverse((o) => {
        if (kinds.includes(o.userData.kind as string)) out.push(o.castShadow)
      })
      return out
    }
    ghostWalls(mats, group, true)
    for (const m of [mats.panel, mats.drywall, mats.plinth]) {
      expect(m.opacity).toBeCloseTo(0.13)
      expect(m.transparent).toBe(true)
      expect(m.depthWrite).toBe(false)
    }
    expect(mats.steel.opacity).toBe(1)
    expect(shadows(['wall', 'partition', 'plinth'])).toEqual([false, false, false])
    ghostWalls(mats, group, false)
    expect(mats.panel.opacity).toBe(1)
    expect(mats.panel.transparent).toBe(false)
    expect(mats.panel.depthWrite).toBe(true)
    expect(shadows(['wall', 'partition', 'plinth'])).toEqual([true, true, true])
  })

  it('안개: 걷기 60~160 m, 조감 뷰는 멀리 (큰 도면은 더 멀리)', () => {
    expect(walkFog(160, false)).toEqual({ near: 60, far: 160 })
    expect(walkFog(100, true)).toEqual({ near: 250, far: 800 })
    const big = walkFog(400, true)
    expect(big.near).toBeCloseTo(880)
    expect(big.far).toBeCloseTo(2400)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd /c/kopens/project/Factory3D/web && npx vitest run src/scene/walkLook.test.ts`
Expected: FAIL — `Failed to resolve import "./walkLook"`

- [ ] **Step 3: walkLook 구현**

`web/src/scene/walkLook.ts`:
```ts
import * as THREE from 'three'
import { planToWorld, type PlanFrame } from './coords'
import type { Materials } from './materials'

/** plan 좌표(m) + 높이(m) */
export interface PlanPoint { x: number; y: number; h: number }
/** 걷기 카메라 자세: 눈 · 바라보는 점 (plan 좌표 — 회전·반전은 장면이 바꿈) */
export interface CameraPose { eye: PlanPoint; look: PlanPoint }
/** 체험 공간: 매 프레임 카메라 자세를 정함 */
export interface CameraDriver { update(dt: number): CameraPose }

export const WALK_FOV = 70
export const WALK_NEAR = 0.05 // 벽에서 0.45 m 떨어져도 화면이 잘리지 않게
export const GHOST_OPACITY = 0.13
const GHOST_KINDS = new Set(['wall', 'partition', 'plinth'])
const tmp = new THREE.Vector3()

export function worldOf(p: PlanPoint, f: PlanFrame, out = new THREE.Vector3()): THREE.Vector3 {
  const [x, z] = planToWorld(p.x, p.y, f)
  return out.set(x, p.h, z)
}

/** 자세 → 카메라 위치·방향 (위쪽 = +y, 피치 ±1.35 rad 라 lookAt 이 뒤집히지 않음) */
export function applyPose(cam: THREE.PerspectiveCamera, pose: CameraPose, f: PlanFrame): void {
  worldOf(pose.eye, f, cam.position)
  cam.lookAt(worldOf(pose.look, f, tmp))
}

/** 참고 파일 setViewMode: 조감 뷰 = 벽 재질 반투명 0.13 · 깊이 쓰기 끔 · 벽 그림자 끔 */
export function ghostWalls(mats: Materials, group: THREE.Object3D | null, on: boolean): void {
  for (const m of [mats.panel, mats.drywall, mats.plinth]) {
    m.transparent = on
    m.opacity = on ? GHOST_OPACITY : 1
    m.depthWrite = !on
    m.needsUpdate = true
  }
  group?.traverse((o) => {
    if (GHOST_KINDS.has(o.userData.kind as string)) o.castShadow = !on
  })
}

/** 걷는 동안 안개 60~160 m (참고 파일), 조감 뷰 250~800 m — 큰 도면은 도면 크기에 맞춰 더 멀리 */
export function walkFog(span: number, overview: boolean): { near: number; far: number } {
  return overview ? { near: Math.max(250, span * 2.2), far: Math.max(800, span * 6) } : { near: 60, far: 160 }
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd /c/kopens/project/Factory3D/web && npx vitest run src/scene/walkLook.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: FactoryScene 에 WalkHost**

`web/src/scene/FactoryScene.ts` 를 아래처럼 고친다.

(a) import — `import { localToPlan, planToLocal } from './coords'` 를
```ts
import { localToPlan, planToLocal, worldToPlan } from './coords'
```
로 바꾸고, `import { createTextures, type Textures } from './textures'` 아래에 추가:
```ts
import { applyPose, ghostWalls, walkFog, WALK_FOV, WALK_NEAR, worldOf, type CameraDriver } from './walkLook'
```

(b) 인터페이스 — `export type SceneHost = PickSource & ObjectHost & DashHost` 를 아래로 바꿈:
```ts
/** 체험 공간: 드라이버가 카메라를 직접 움직임 (plan 좌표 자세 → 월드는 장면이 바꿈) */
export interface WalkHost {
  setCameraDriver(d: CameraDriver | null): void
  setGhostWalls(on: boolean): void
  pickPlacement(sx: number, sy: number, far: number): number | null
  worldOfPlan(x: number, y: number, h: number): THREE.Vector3
  planOfWorld(v: THREE.Vector3): { x: number; y: number }
}
export type SceneHost = PickSource & ObjectHost & DashHost & WalkHost
```

(c) 클래스 선언 — `export class FactoryScene implements PickSource, ObjectHost, DashHost {` 를
```ts
export class FactoryScene implements PickSource, ObjectHost, DashHost, WalkHost {
```
로, 필드 `private interactive = true ...` 줄 아래에 추가:
```ts
  private driver: CameraDriver | null = null // 체험 공간 걷기·조감 (있으면 OrbitControls·Navigator 멈춤)
  private ghost = false // 조감 뷰: 벽 반투명
  private orbit: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null // 걷기 전 궤도 시점
```

(d) `setPlan` — `this.root.add(this.meshes.group)` 바로 아래에 추가:
```ts
    if (this.ghost) ghostWalls(this.mats, this.meshes.group, true)
```

(e) `setInteractive` 메서드 다음에 추가:
```ts
  setCameraDriver(d: CameraDriver | null): void {
    const was = this.driver
    this.driver = d
    if (d && !was) {
      this.orbit = { pos: this.camera.position.clone(), target: this.controls.target.clone() }
      this.controls.enabled = false
      this.nav.cancel()
      this.endDrag()
    } else if (!d && was) {
      if (this.orbit) {
        this.camera.position.copy(this.orbit.pos)
        this.controls.target.copy(this.orbit.target)
      }
      this.orbit = null
      this.controls.enabled = true
      this.controls.update()
    }
    this.fitCamera()
    this.applyLook()
  }

  setGhostWalls(on: boolean): void {
    this.ghost = on
    ghostWalls(this.mats, this.meshes?.group ?? null, on)
    this.applyLook()
  }

  /** 화면 좌표(clientX/Y)의 배치 id — far(m) 안, 없으면 null (벽 뒤도 고름 — 참고 파일과 같음) */
  pickPlacement(sx: number, sy: number, far: number): number | null {
    if (!this.plan || !this.rayAt({ clientX: sx, clientY: sy })) return null
    this.root.updateMatrixWorld(true)
    this.ray.far = far
    const id = this.objectLayer.pick(this.ray)
    this.ray.far = Infinity
    return id
  }

  worldOfPlan(x: number, y: number, h: number): THREE.Vector3 {
    return this.plan ? worldOf({ x, y, h }, this.plan) : new THREE.Vector3()
  }

  planOfWorld(v: THREE.Vector3): { x: number; y: number } {
    if (!this.plan) return { x: 0, y: 0 }
    const [x, y] = worldToPlan(v.x, v.z, this.plan)
    return { x, y }
  }
```

(f) `dispose` — `this.frameCb = null` 아래에 `this.driver = null` 추가.

(g) `tick` 전체를 아래로 바꿈:
```ts
  private tick = () => {
    this.timer.update()
    const dt = Math.min(this.timer.getDelta(), 0.1)
    const drv = this.driver
    if (drv && this.plan) applyPose(this.camera, drv.update(dt), this.plan)
    else if (!drv) {
      this.nav.update(dt)
      this.controls.update()
    }
    this.rings.update()
    if (this.mode === '3d' && this.quality === 'high') this.composer.render()
    else this.renderer.render(this.scene, this.camera)
    this.frameCb?.(this.screenOf)
  }
```

(h) `resetCamera` 전체를 아래로 바꾸고 바로 뒤에 `fitCamera` 추가:
```ts
  /** 새 도면: 범위에 맞춰 near/far 와 비스듬한 시점 (demo 910~911) */
  private resetCamera() {
    const cs = this.camSpan()
    this.fitCamera()
    this.controls.target.set(0, 0, 0)
    this.camera.position.set(-cs * 0.25, cs * 0.55, cs * 0.75)
    this.controls.update()
    this.nav.cancel()
    this.camMode = '3d'
    // 걷는 중에 도면이 바뀌면, 걷기를 끝낼 때 새 도면의 처음 시점으로
    if (this.driver) this.orbit = { pos: this.camera.position.clone(), target: this.controls.target.clone() }
  }

  /** 걷기 = 시야각 70° · 가까운 면 5 cm · 먼 면 1 km(큰 도면은 더), 궤도 = 45° · 도면 크기 기준 (원래 값) */
  private fitCamera() {
    const cam = this.camera, span = this.span
    if (this.driver) {
      cam.fov = WALK_FOV
      cam.near = WALK_NEAR
      cam.far = Math.max(1000, span * 4)
    } else {
      cam.fov = 45
      cam.near = Math.max(0.1, span / 400)
      cam.far = Math.max(span, this.camSpan()) * 50
    }
    cam.updateProjectionMatrix()
  }
```

(i) `applyLook` — 아래 두 줄
```ts
    this.fog.near = span * 2.2
    this.fog.far = span * 6
```
을 바꿈:
```ts
    const fog = this.driver ? walkFog(span, this.ghost) : { near: span * 2.2, far: span * 6 }
    this.fog.near = fog.near
    this.fog.far = fog.far
```

(j) `rayAt` 의 매개변수 `ev: MouseEvent` 를 `ev: { clientX: number; clientY: number }` 로 (본문 그대로).

(k) `endDrag` 의 `this.controls.enabled = true` 를 `this.controls.enabled = !this.driver` 로.

(l) `onDblClick` 첫 줄 `if (!this.plan) return` 을 `if (!this.plan || this.driver) return` 으로.

- [ ] **Step 6: 전체 확인**

Run: `cd /c/kopens/project/Factory3D/web && npx vitest run && npm run build && ./node_modules/.bin/oxlint`
Expected: 모든 테스트 PASS(경고 없음), 빌드 성공, oxlint `Found 0 warnings and 0 errors`.

- [ ] **Step 7: Commit**

```bash
cd /c/kopens/project/Factory3D && git add web/src/scene/walkLook.ts web/src/scene/walkLook.test.ts web/src/scene/FactoryScene.ts
git commit -m "feat(web): 3D 카메라 드라이버·조감 벽 반투명·배치 고르기 (WalkHost)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 웹 — WalkController (걷기·조감 드라이버) · 터치 두 손가락

**Files:**
- Create: `web/src/walk/controller.ts`, `web/src/walk/touch.ts`
- Test: `web/src/walk/controller.test.ts`

**Interfaces:**
- Consumes: `CameraDriver`·`CameraPose` (Task 3 `scene/walkLook.ts`), `Colliders` (Task 1), `collide` (Task 1), `WALK`·`Player`·`moveInput`·`step`·`turn` (Task 2).
- Produces:
```ts
// controller.ts
export type WalkMode = 'walk' | 'overview'
export function walkPose(p: Player): CameraPose        // 눈 1.7 m + 흔들림, yaw·pitch 방향 1 m 앞
export class WalkController implements CameraDriver {
  player: Player
  mode: WalkMode
  constructor(colliders: Colliders, bounds: { w: number; h: number }, start: { x: number; y: number })   // yaw 0 = 도면 위쪽(+y)
  setColliders(c: Colliders, b: { w: number; h: number }): void
  keyDown(code: string): void
  keyUp(code: string): void
  clearKeys(): void                   // 키 + 조이스틱
  setJoy(x: number, y: number): void  // −1..1 (y + = 뒤)
  drag(dx: number, dy: number, touch?: boolean): void   // 걷기 = 시점, 조감 = 궤도 각도
  setMode(m: WalkMode): void
  toggleMode(): WalkMode
  update(dt: number): CameraPose
}
// touch.ts
export const JOY_R = 55, JOY_MAX = 48
export interface JoyView { cx: number; cy: number; kx: number; ky: number }   // 원 중심(무대 기준 px) · 손잡이 이동(px)
export class TouchSticks {
  start(id: number, x: number, y: number, width: number): void   // 무대 기준 px. 왼쪽 반 = 조이스틱, 그 밖 = 시점
  move(id: number, x: number, y: number): { dx: number; dy: number } | null   // 시점 손가락이면 이동량
  end(id: number): void
  vec(): { x: number; y: number }     // 조이스틱 −1..1
  view(): JoyView | null
}
```

- [ ] **Step 1: 실패 테스트**

`web/src/walk/controller.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import type { Colliders } from './colliders'
import { WalkController } from './controller'
import { JOY_MAX, TouchSticks } from './touch'

const NONE: Colliders = { segs: [], rects: [] }
const B = { w: 20, h: 20 }

describe('WalkController', () => {
  it('시작: 눈높이 1.7 m, 도면 위쪽(+y)을 봄', () => {
    const c = new WalkController(NONE, B, { x: 10, y: 10 })
    expect(c.update(0.016)).toEqual({ eye: { x: 10, y: 10, h: 1.7 }, look: { x: 10, y: 11, h: 1.7 } })
  })

  it('W 를 누르는 동안 앞으로, 걸음 흔들림 ±0.045 m, 떼면 멈춤', () => {
    const c = new WalkController(NONE, B, { x: 10, y: 10 })
    c.keyDown('KeyW')
    let p = c.update(0.05)
    for (let i = 1; i < 10; i++) p = c.update(0.05)
    expect(p.eye.y).toBeCloseTo(10 + 5.2 * 0.5)
    expect(p.eye.h).toBeCloseTo(1.7 + Math.sin(4.5) * 0.045)
    c.keyUp('KeyW')
    expect(c.update(0.05).eye.y).toBeCloseTo(p.eye.y)
  })

  it('dt 는 0.05 초까지만', () => {
    const c = new WalkController(NONE, B, { x: 10, y: 10 })
    c.keyDown('KeyW')
    expect(c.update(1).eye.y).toBeCloseTo(10 + 0.26)
  })

  it('끌기: 마우스 0.0045 · 터치 0.005 rad/px, 돈 쪽으로 걸음', () => {
    const c = new WalkController(NONE, B, { x: 10, y: 10 })
    c.drag(100, 0)
    expect(c.player.yaw).toBeCloseTo(-0.45)
    c.drag(100, 0, true)
    expect(c.player.yaw).toBeCloseTo(-0.95)
    c.keyDown('KeyW')
    const p = c.update(0.05)
    expect(p.eye.x).toBeGreaterThan(10)
    expect(p.look.x - p.eye.x).toBeCloseTo(Math.sin(0.95))
  })

  it('벽을 뚫지 않음 (충돌 도형을 나중에 바꿔도)', () => {
    const c = new WalkController(NONE, B, { x: 10, y: 10 })
    c.setColliders({ segs: [{ a: [0, 12], b: [20, 12], r: 0.1 }], rects: [] }, B)
    c.keyDown('KeyW')
    c.keyDown('ShiftLeft')
    for (let i = 0; i < 100; i++) expect(c.update(0.05).eye.y).toBeLessThanOrEqual(12 - 0.55 + 1e-9)
  })

  it('조이스틱 + clearKeys', () => {
    const c = new WalkController(NONE, B, { x: 10, y: 10 })
    c.setJoy(0, -1)
    expect(c.update(0.05).eye.y).toBeCloseTo(10.26)
    c.keyDown('KeyW')
    c.clearKeys()
    expect(c.update(0.05).eye.y).toBeCloseTo(10.26)
  })

  it('M 조감 뷰: 걷지 않고 도면 가운데를 높이서 봄, 끌기는 궤도만, 다시 M 이면 걷던 자리', () => {
    const c = new WalkController(NONE, B, { x: 10, y: 10 })
    expect(c.toggleMode()).toBe('overview')
    c.keyDown('KeyW')
    let p = c.update(0.05)
    for (let i = 0; i < 200; i++) p = c.update(0.05)
    expect(c.player).toMatchObject({ x: 10, y: 10 })
    expect(p.eye.h).toBeCloseTo(20 * 0.45, 1)
    expect(p.look).toEqual({ x: 10, y: 10, h: 0 })
    c.drag(300, 0)
    expect(c.player.yaw).toBe(0)
    expect(c.toggleMode()).toBe('walk')
    c.keyUp('KeyW')
    expect(c.update(0.016).eye).toEqual({ x: 10, y: 10, h: 1.7 })
  })
})

describe('터치 두 손가락', () => {
  it('왼쪽 반 = 조이스틱(48 px 까지), 오른쪽 반 = 시점 이동량', () => {
    const t = new TouchSticks()
    t.start(1, 100, 300, 800)
    t.start(2, 600, 300, 800)
    expect(t.move(1, 100, 200)).toBeNull()
    expect(t.vec()).toEqual({ x: 0, y: -1 })
    expect(t.view()).toEqual({ cx: 100, cy: 300, kx: 0, ky: -JOY_MAX })
    t.move(1, 112, 300)
    expect(t.vec()).toEqual({ x: 0.25, y: 0 })
    expect(t.move(2, 630, 290)).toEqual({ dx: 30, dy: -10 })
    expect(t.move(2, 640, 290)).toEqual({ dx: 10, dy: 0 })
    t.end(1)
    expect(t.vec()).toEqual({ x: 0, y: 0 })
    expect(t.view()).toBeNull()
    t.end(2)
    expect(t.move(2, 0, 0)).toBeNull()
  })

  it('조이스틱 손가락이 이미 있으면 왼쪽 반 두 번째 손가락은 시점', () => {
    const t = new TouchSticks()
    t.start(1, 100, 300, 800)
    t.start(2, 150, 300, 800)
    expect(t.move(2, 160, 300)).toEqual({ dx: 10, dy: 0 })
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd /c/kopens/project/Factory3D/web && npx vitest run src/walk/controller.test.ts`
Expected: FAIL — `Failed to resolve import "./controller"`

- [ ] **Step 3: 구현**

`web/src/walk/controller.ts`:
```ts
import type { CameraDriver, CameraPose } from '../scene/walkLook'
import type { Colliders } from './colliders'
import { collide } from './collide'
import { moveInput, step, turn, WALK, type Player } from './player'

export type WalkMode = 'walk' | 'overview'
type Bounds = { w: number; h: number }

const OV_SPIN = 0.05 // 조감 뷰 자동 회전 (rad/s, 한 바퀴 약 2분)
const OV_LERP = 0.06 // 참고 파일: 60fps 한 프레임에 6% 씩 다가감

/** 걷기 자세: 눈 1.7 m + 흔들림, yaw·pitch 방향 1 m 앞을 봄 */
export function walkPose(p: Player): CameraPose {
  const h = WALK.eye + Math.sin(p.bobT) * WALK.bob, cp = Math.cos(p.pitch)
  return {
    eye: { x: p.x, y: p.y, h },
    look: { x: p.x - Math.sin(p.yaw) * cp, y: p.y + Math.cos(p.yaw) * cp, h: h + Math.sin(p.pitch) },
  }
}

/** 체험 공간 카메라 드라이버: 입력(키·조이스틱·끌기) + dt → plan 좌표 카메라 자세 */
export class WalkController implements CameraDriver {
  player: Player
  mode: WalkMode = 'walk'
  private keys = new Set<string>()
  private joy = { x: 0, y: 0 }
  private colliders: Colliders
  private bounds: Bounds
  private ovAngle = 0
  private ovEye: CameraPose['eye'] | null = null

  constructor(colliders: Colliders, bounds: Bounds, start: { x: number; y: number }) {
    this.colliders = colliders
    this.bounds = bounds
    this.player = { x: start.x, y: start.y, yaw: 0, pitch: 0, bobT: 0 }
  }

  setColliders(c: Colliders, b: Bounds): void {
    this.colliders = c
    this.bounds = b
  }

  keyDown(code: string): void {
    this.keys.add(code)
  }

  keyUp(code: string): void {
    this.keys.delete(code)
  }

  clearKeys(): void {
    this.keys.clear()
    this.joy = { x: 0, y: 0 }
  }

  setJoy(x: number, y: number): void {
    this.joy = { x, y }
  }

  /** 걷기 = 시점 회전, 조감 = 궤도 각도 (참고 파일 mousemove·touchmove) */
  drag(dx: number, dy: number, touch = false): void {
    if (this.mode === 'walk') this.player = turn(this.player, dx, dy, touch ? WALK.touchLook : WALK.drag)
    else this.ovAngle -= dx * (touch ? WALK.ovTouch : WALK.ovDrag)
  }

  setMode(m: WalkMode): void {
    this.mode = m
    this.ovEye = null
  }

  toggleMode(): WalkMode {
    this.setMode(this.mode === 'walk' ? 'overview' : 'walk')
    return this.mode
  }

  update(dt: number): CameraPose {
    const d = Math.min(Math.max(dt, 0), WALK.dtMax)
    if (this.mode === 'walk') {
      const { colliders, bounds } = this
      this.player = step(this.player, moveInput(this.keys, this.joy), d, (x, y) => collide({ x, y }, WALK.radius, colliders, bounds))
      return walkPose(this.player)
    }
    // 조감 뷰: 도면 가운데를 도는 궤도 (참고 파일 r 75 · 높이 55 · 앞뒤 0.6 — 124 m 건물 기준을 도면 크기 비율로)
    const { w, h } = this.bounds, span = Math.max(w, h), r = span * 0.6
    this.ovAngle += d * OV_SPIN
    const goal = { x: w / 2 + Math.sin(this.ovAngle) * r, y: h / 2 - Math.cos(this.ovAngle) * r * 0.6, h: span * 0.45 }
    const from = this.ovEye ?? walkPose(this.player).eye
    const k = 1 - Math.pow(1 - OV_LERP, d * 60)
    this.ovEye = { x: from.x + (goal.x - from.x) * k, y: from.y + (goal.y - from.y) * k, h: from.h + (goal.h - from.h) * k }
    return { eye: this.ovEye, look: { x: w / 2, y: h / 2, h: 0 } }
  }
}
```

`web/src/walk/touch.ts`:
```ts
export const JOY_R = 55 // 조이스틱 원 반지름 px (참고 파일 110 px 원)
export const JOY_MAX = 48 // 손잡이가 움직이는 최대 거리 px

/** 조이스틱 그림: 원 중심(무대 기준 px) · 손잡이 이동(px) */
export interface JoyView { cx: number; cy: number; kx: number; ky: number }

/** 참고 파일 터치: 왼쪽 반 첫 손가락 = 조이스틱, 그 밖 첫 손가락 = 시점 */
export class TouchSticks {
  private joy: { id: number; cx: number; cy: number; dx: number; dy: number } | null = null
  private look: { id: number; x: number; y: number } | null = null

  start(id: number, x: number, y: number, width: number): void {
    if (x < width / 2 && !this.joy) this.joy = { id, cx: x, cy: y, dx: 0, dy: 0 }
    else if (!this.look) this.look = { id, x, y }
  }

  move(id: number, x: number, y: number): { dx: number; dy: number } | null {
    const j = this.joy
    if (j?.id === id) {
      const dx = x - j.cx, dy = y - j.cy, len = Math.hypot(dx, dy), cl = Math.min(len, JOY_MAX) / (len || 1)
      j.dx = dx * cl
      j.dy = dy * cl
      return null
    }
    const l = this.look
    if (l?.id === id) {
      const d = { dx: x - l.x, dy: y - l.y }
      l.x = x
      l.y = y
      return d
    }
    return null
  }

  end(id: number): void {
    if (this.joy?.id === id) this.joy = null
    if (this.look?.id === id) this.look = null
  }

  vec(): { x: number; y: number } {
    const j = this.joy
    return j ? { x: j.dx / JOY_MAX, y: j.dy / JOY_MAX } : { x: 0, y: 0 }
  }

  view(): JoyView | null {
    const j = this.joy
    return j ? { cx: j.cx, cy: j.cy, kx: j.dx, ky: j.dy } : null
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd /c/kopens/project/Factory3D/web && npx vitest run src/walk/controller.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
cd /c/kopens/project/Factory3D && git add web/src/walk/controller.ts web/src/walk/touch.ts web/src/walk/controller.test.ts
git commit -m "feat(web): 체험 공간 카메라 드라이버(걷기·조감)·터치 두 손가락

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 웹 — 체험 공간 덮개 컴포넌트 (시작 화면 · HUD · 미니맵 · 상세 · 조이스틱)

**Files:**
- Create: `web/src/walk/WalkOverlay.tsx`, `web/src/walk/WalkHud.tsx`, `web/src/walk/Minimap.tsx`, `web/src/walk/WalkDetail.tsx`, `web/src/walk/TouchJoystick.tsx`
- Modify: `web/src/styles/app.css` (끝에 체험 공간 스타일)
- Test: `web/src/walk/components.test.tsx`

**Interfaces:**
- Consumes: `miniFrame`·`drawMinimap`·`MiniObject`·`MiniMe` (Task 2), `JOY_R`·`JoyView` (Task 4), `WalkMode` (Task 4), `gaugeCells` (`dashboard/gauge.ts`), `STATUS_LABEL` (`dashboard/status.ts`), `StationLive`·`ProjectLive` (`dashboard/types.ts`), `Placement`·`ModelInfo`·`CATEGORY_LABEL`·`BOX_SIZE` (`objects/types.ts`), 기존 CSS `.pill`·`.gauge`.
- Produces:
```ts
export function WalkOverlay(p: { drawingName: string; ready: boolean; onEnter(): void }): JSX.Element  // section aria-labelledby → h2 '체험 공간', 버튼 '입장하기'
export interface TipView { name: string; x: number; y: number }   // 무대 기준 px
export function WalkHud(p: { mode: WalkMode; zone: string; tip: TipView | null; onTip(): void }): JSX.Element  // .walk-zone · .walk-tip(button) · .walk-help
export function Minimap(p: { plan: Plan; objects: MiniObject[]; me: () => MiniMe }): JSX.Element     // canvas.walk-mini role=img '미니맵', data-pos="x,y" (소수 2자리)
export function WalkDetail(p: { placement: Placement; model: ModelInfo | null; station: StationLive | null; project: ProjectLive | null; onClose(): void }): JSX.Element  // aside '상세정보'
export function TouchJoystick(p: { joy: JoyView }): JSX.Element
```

- [ ] **Step 1: 실패 테스트**

`web/src/walk/components.test.tsx`:
```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ProjectLive, StationLive } from '../dashboard/types'
import type { Plan } from '../drawing/plan/types'
import type { ModelInfo, Placement } from '../objects/types'
import { Minimap } from './Minimap'
import { TouchJoystick } from './TouchJoystick'
import { WalkDetail } from './WalkDetail'
import { WalkHud } from './WalkHud'
import { WalkOverlay } from './WalkOverlay'

const PLAN: Plan = {
  format: 1, unit: 'm', scale: 1, rotQ: 0, flip: 1, bounds: { w: 100, h: 50 },
  layers: [], lines: [], texts: [], walls: [], partitions: [], columns: [], zones: [], objectHints: [],
  warnings: { unsupported: {}, unitGuessed: false },
}
const MODEL: ModelInfo = { id: 1, name: '나셀 조립대', category: 'equip', sourceExt: 'glb', sizeX: 4, sizeY: 2.5, sizeZ: 3, aliases: [], version: 1, usedDrawings: 1, updatedAt: '' }
const PLACEMENT: Placement = { id: 10, modelId: 1, name: 'Main Station 1', x: 12.34, y: 5, rot: 90 }
const STATION: StationLive = { id: 3, no: 2, name: 'Main Station 1', placementName: 'Main Station 1', steps: ['허브 체결', '배선'], step: 2, actual: 64, target: 70, status: 'warn', projectId: 7, unitNo: 3 }
const PROJECT: ProjectLive = { id: 7, name: 'N-2000', done: 2, total: 10, period: null, state: 'run' }

describe('체험 공간 덮개', () => {
  it('시작 화면: 제목·도면 이름·조작 키, 준비 전에는 입장 못 함', () => {
    const onEnter = vi.fn()
    const { rerender } = render(<WalkOverlay drawingName="나셀 공장" ready={false} onEnter={onEnter} />)
    expect(screen.getByRole('heading', { name: '체험 공간' })).toBeInTheDocument()
    expect(screen.getByText('나셀 공장')).toBeInTheDocument()
    expect(screen.getByText('W A S D')).toBeInTheDocument()
    expect(screen.getByText('조감 뷰 ↔ 걷기')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '입장하기' })).toBeDisabled()
    rerender(<WalkOverlay drawingName="나셀 공장" ready onEnter={onEnter} />)
    fireEvent.click(screen.getByRole('button', { name: '입장하기' }))
    expect(onEnter).toHaveBeenCalledTimes(1)
  })

  it('HUD: 구역 배지 · 이름표(누르면 상세) · 걷기 도움말, 조감 뷰는 조준점 없이 다른 도움말', () => {
    const onTip = vi.fn()
    const { container, rerender } = render(<WalkHud mode="walk" zone="Hub 조립장" tip={{ name: 'Main Station 1', x: 300, y: 222 }} onTip={onTip} />)
    expect(screen.getByText('Hub 조립장')).toHaveClass('walk-zone')
    const tip = screen.getByRole('button', { name: /Main Station 1/ })
    expect(tip).toHaveTextContent('클릭 또는 E — 상세정보')
    expect(tip).toHaveStyle({ left: '300px', top: '222px' })
    fireEvent.click(tip)
    expect(onTip).toHaveBeenCalledTimes(1)
    expect(container.querySelector('.walk-cross')).not.toBeNull()
    expect(screen.getByText(/^WASD 이동/)).toBeInTheDocument()
    rerender(<WalkHud mode="overview" zone="통로" tip={null} onTip={onTip} />)
    expect(container.querySelector('.walk-cross')).toBeNull()
    expect(screen.getByText(/^조감 뷰 —/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('상세: 모델·분류·크기·위치 + 실시간 상태(상태·PJT 호기·step·게이지·실적/목표)', () => {
    const onClose = vi.fn()
    render(<WalkDetail placement={PLACEMENT} model={MODEL} station={STATION} project={PROJECT} onClose={onClose} />)
    const panel = screen.getByRole('complementary', { name: '상세정보' })
    expect(screen.getByRole('heading', { name: 'Main Station 1', level: 2 })).toBeInTheDocument()
    expect(panel).toHaveTextContent('설비 · 나셀 조립대')
    expect(panel).toHaveTextContent('4 × 2.5 × 3 m')
    expect(panel).toHaveTextContent('x 12.3 · y 5.0 m · 90°')
    expect(panel).toHaveTextContent('주의')
    expect(panel).toHaveTextContent('N-2000 #3')
    expect(panel).toHaveTextContent('2/2 배선')
    expect(panel).toHaveTextContent('실적 64% · 목표 70%')
    expect(panel.querySelectorAll('.gauge i')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: '상세정보 닫기' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('상세: 모델 없는 임시 상자, 공정이 없으면 실시간 상태 없음', () => {
    render(<WalkDetail placement={{ ...PLACEMENT, modelId: null }} model={null} station={null} project={null} onClose={() => {}} />)
    const panel = screen.getByRole('complementary', { name: '상세정보' })
    expect(panel).toHaveTextContent('임시 상자')
    expect(panel).toHaveTextContent('2 × 2 × 2 m')
    expect(panel).toHaveTextContent('실시간 상태 없음')
    expect(panel.querySelector('.gauge')).toBeNull()
  })

  it('미니맵: 폭 280 · 도면 비율 높이, 내 위치를 data-pos 로', () => {
    render(<Minimap plan={PLAN} objects={[]} me={() => ({ x: 1.234, y: 5, yaw: 0 })} />)
    const cv = screen.getByRole('img', { name: '미니맵' })
    expect(cv).toHaveStyle({ width: '280px', height: '148px' })
    expect(cv).toHaveAttribute('data-pos', '1.23,5.00')
  })

  it('조이스틱: 누른 자리에 원, 손잡이는 끈 만큼', () => {
    const { container } = render(<TouchJoystick joy={{ cx: 100, cy: 200, kx: 10, ky: -5 }} />)
    const ring = container.querySelector('.walk-joy') as HTMLElement
    expect(ring).toHaveStyle({ left: '45px', top: '145px' })
    expect(ring.querySelector('i')).toHaveStyle({ transform: 'translate(10px, -5px)' })
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd /c/kopens/project/Factory3D/web && npx vitest run src/walk/components.test.tsx`
Expected: FAIL — `Failed to resolve import "./Minimap"`

- [ ] **Step 3: 구현**

`web/src/walk/WalkOverlay.tsx`:
```tsx
const KEYS: [string, string][] = [
  ['W A S D', '이동 (방향키도)'],
  ['드래그', '시점 회전'],
  ['Shift', '달리기'],
  ['M', '조감 뷰 ↔ 걷기'],
  ['클릭 / E', '설비 상세정보'],
  ['Esc', '패널 닫기 · 나가기'],
  ['터치', '왼쪽 이동 · 오른쪽 시점'],
]

interface Props { drawingName: string; ready: boolean; onEnter(): void }

/** 시작 화면 (참고 파일 #overlay): 3D 위 어두운 카드 — 제목 · 도면 이름 · 조작 키 · 입장하기 */
export function WalkOverlay({ drawingName, ready, onEnter }: Props) {
  return (
    <section className="walk-overlay" aria-labelledby="walk-title">
      <div className="walk-card">
        <h2 id="walk-title">체험 공간</h2>
        <p className="sub">{drawingName || '도면 불러오는 중…'}</p>
        <ul className="walk-keys">
          {KEYS.map(([k, v]) => (
            <li key={k}>
              <kbd>{k}</kbd>
              {v}
            </li>
          ))}
        </ul>
        <button type="button" className="walk-enter" disabled={!ready} onClick={onEnter}>
          입장하기
        </button>
        <p className="hint">{ready ? '설비에 마우스를 올리면 이름이, 클릭하면 상세정보가 표시됩니다' : '도면·객체 불러오는 중…'}</p>
      </div>
    </section>
  )
}
```

`web/src/walk/WalkHud.tsx`:
```tsx
import type { WalkMode } from './controller'

/** 커서가 가리키는 배치 이름표 (무대 기준 px) */
export interface TipView { name: string; x: number; y: number }

interface Props { mode: WalkMode; zone: string; tip: TipView | null; onTip(): void }

const HELP_WALK = 'WASD 이동 · 드래그 시점 회전 · Shift 달리기 · M 조감 뷰 · 클릭/E 상세정보 · Esc 나가기'
const HELP_OVERVIEW = '조감 뷰 — 드래그로 돌려 보기 · M 걷기로 돌아가기 · Esc 나가기'

/** 걷는 동안 덮개 (참고 파일 #hud): 조준점 · 구역 배지 · 이름표 · 도움말 줄. 이름표만 누를 수 있음 */
export function WalkHud({ mode, zone, tip, onTip }: Props) {
  return (
    <div className="walk-hud">
      {mode === 'walk' && <span className="walk-cross" aria-hidden />}
      <p className="walk-zone">{zone}</p>
      {tip && (
        <button type="button" className="walk-tip" style={{ left: tip.x, top: tip.y }} onClick={onTip}>
          {tip.name}
          <small>클릭 또는 E — 상세정보</small>
        </button>
      )}
      <p className="walk-help">{mode === 'walk' ? HELP_WALK : HELP_OVERVIEW}</p>
    </div>
  )
}
```

`web/src/walk/Minimap.tsx`:
```tsx
import { useEffect, useMemo, useRef } from 'react'
import type { Plan } from '../drawing/plan/types'
import { drawMinimap, miniFrame, type MiniMe, type MiniObject } from './minimap'

interface Props { plan: Plan; objects: MiniObject[]; me: () => MiniMe }

/** 오른쪽 아래 미니맵: 0.1초마다 다시 그림. data-pos = 내 위치(plan m, 실제 화면 확인용) */
export function Minimap({ plan, objects, me }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const meRef = useRef(me)
  useEffect(() => {
    meRef.current = me
  })
  const frame = useMemo(() => miniFrame(plan), [plan])
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ctx = el.getContext('2d') // jsdom 은 null — data-pos 만
    const draw = () => {
      const p = meRef.current()
      el.dataset.pos = `${p.x.toFixed(2)},${p.y.toFixed(2)}`
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      drawMinimap(ctx, frame, plan, objects, p)
    }
    draw()
    const t = setInterval(draw, 100)
    return () => clearInterval(t)
  }, [frame, plan, objects, dpr])
  return (
    <canvas
      ref={ref}
      className="walk-mini"
      role="img"
      aria-label="미니맵"
      width={Math.round(frame.width * dpr)}
      height={Math.round(frame.height * dpr)}
      style={{ width: frame.width, height: frame.height }}
    />
  )
}
```

`web/src/walk/WalkDetail.tsx`:
```tsx
import { X } from 'lucide-react'
import { gaugeCells } from '../dashboard/gauge'
import { STATUS_LABEL } from '../dashboard/status'
import type { ProjectLive, StationLive } from '../dashboard/types'
import { BOX_SIZE, CATEGORY_LABEL, type ModelInfo, type Placement } from '../objects/types'

interface Props { placement: Placement; model: ModelInfo | null; station: StationLive | null; project: ProjectLive | null; onClose(): void }

const m1 = (v: number) => String(Math.round(v * 10) / 10)

/** 오른쪽 상세 패널 (참고 파일 #detail): 사양 + 같은 이름의 공정이 있으면 상황판 실시간 상태 */
export function WalkDetail({ placement: p, model, station, project, onClose }: Props) {
  const size = model ?? BOX_SIZE
  return (
    <aside className="walk-detail" aria-label="상세정보">
      <div className="wd-head">
        <h2>{p.name}</h2>
        <button type="button" aria-label="상세정보 닫기" onClick={onClose}>
          <X size={16} aria-hidden />
        </button>
      </div>
      <p className="wd-type">{model ? `${CATEGORY_LABEL[model.category]} · ${model.name}` : '임시 상자'}</p>
      <h3 className="wd-sec">사양</h3>
      <table className="wd-specs">
        <tbody>
          <tr><th scope="row">모델</th><td>{model?.name ?? '임시 상자 (모델 없음)'}</td></tr>
          <tr><th scope="row">분류</th><td>{model ? CATEGORY_LABEL[model.category] : '—'}</td></tr>
          <tr><th scope="row">크기</th><td>{`${m1(size.sizeX)} × ${m1(size.sizeY)} × ${m1(size.sizeZ)} m`}</td></tr>
          <tr><th scope="row">위치</th><td>{`x ${p.x.toFixed(1)} · y ${p.y.toFixed(1)} m · ${p.rot}°`}</td></tr>
        </tbody>
      </table>
      <h3 className="wd-sec">실시간 상태</h3>
      {station ? <LiveBlock s={station} project={project} /> : <p className="wd-none">실시간 상태 없음</p>}
    </aside>
  )
}

function LiveBlock({ s, project }: { s: StationLive; project: ProjectLive | null }) {
  const n = s.steps.length
  const a = Math.round(s.actual)
  const t = Math.min(100, Math.round(s.target))
  return (
    <div className="wd-live">
      <p className="wd-row">
        <span className={`pill ${s.status}`}>{STATUS_LABEL[s.status]}</span>
        <b>{`${s.no}. ${s.name}`}</b>
      </p>
      {project && (
        <p className="wd-pjt">
          {`${project.name} #${s.unitNo ?? Math.min(project.total, project.done + 1)}`} <span>{`· 제작 ${project.done}/${project.total}`}</span>
        </p>
      )}
      <p className="wd-job">
        <span>{`${s.step}/${n}`}</span> {s.steps[s.step - 1] ?? ''}
      </p>
      <div className="wd-gauge">
        <span className={`gauge ${s.status}`} aria-hidden>
          {gaugeCells(n, s.actual, s.target).map((c, i) => (
            <i key={i} className={[c.on ? 'on' : '', c.target ? 'tg' : '', c.current ? 'cur' : ''].filter(Boolean).join(' ') || undefined} />
          ))}
        </span>
        <b>{`${a}%`}</b>
      </div>
      <p className="wd-nums">{`실적 ${a}% · 목표 ${t}%`}</p>
    </div>
  )
}
```

`web/src/walk/TouchJoystick.tsx`:
```tsx
import { JOY_R, type JoyView } from './touch'

/** 터치 조이스틱 (참고 파일 #joy): 왼쪽 반을 누른 자리에 원, 손잡이는 끈 만큼 */
export function TouchJoystick({ joy }: { joy: JoyView }) {
  return (
    <div className="walk-joy" style={{ left: joy.cx - JOY_R, top: joy.cy - JOY_R }} aria-hidden>
      <i style={{ transform: `translate(${joy.kx}px, ${joy.ky}px)` }} />
    </div>
  )
}
```

`web/src/styles/app.css` 끝에 추가:
```css
/* 체험 공간 (참고 파일 색감: 어두운 반투명 카드 · 흰 글자) */
.walk-stage { position: absolute; inset: 0; }
.walk-stage.on { touch-action: none; }
.walk-stage.on canvas { cursor: grab; }
.walk-stage.on.dragging canvas { cursor: grabbing; }
.walk-overlay { position: absolute; inset: 0; z-index: 6; display: grid; place-items: center; overflow-y: auto; background: radial-gradient(ellipse at center, #141e28eb, #05080cf7); color: var(--text); }
.walk-card { display: grid; justify-items: center; max-width: min(520px, calc(100% - 32px)); padding: 24px 0; text-align: center; }
.walk-card h2 { margin: 0 0 6px; font-size: 26px; font-weight: 700; letter-spacing: 1px; }
.walk-card .sub { margin: 0 0 24px; color: #9fb2bf; font-size: var(--kp-text-14); }
.walk-keys { display: grid; grid-template-columns: auto auto; gap: 8px 22px; margin: 0 0 28px; padding: 0; list-style: none; color: #c7d3dc; font-size: var(--kp-text-14); text-align: left; }
.walk-keys kbd { display: inline-block; min-width: 72px; margin-right: 8px; padding: 2px 9px; border: 1px solid #3d4c5a; border-radius: 5px; background: #222d38; color: #7fd9a2; font: inherit; font-size: var(--kp-text-12); text-align: center; }
.walk-enter { height: 46px; padding: 0 44px; border: 0; border-radius: 8px; background: linear-gradient(180deg, #2ea35c, #1d7a41); color: #fff; font-size: var(--kp-text-16); font-weight: 600; letter-spacing: 1px; box-shadow: 0 4px 24px #2ea35c59; }
.walk-enter:disabled { opacity: 0.5; cursor: default; }
.walk-card .hint { margin: 16px 0 0; color: #6b7c88; font-size: var(--kp-text-12); }
.walk-hud { position: absolute; inset: 0; z-index: 4; pointer-events: none; }
.walk-cross { position: absolute; left: 50%; top: 50%; width: 4px; height: 4px; margin: -2px 0 0 -2px; border-radius: 50%; background: #ffffff8c; }
.walk-zone { position: absolute; top: 18px; left: 50%; transform: translateX(-50%); margin: 0; padding: 6px 18px; border: 1px solid #ffffff1f; border-radius: 20px; background: #0a1219b3; color: #cfe0ea; font-size: var(--kp-text-13); letter-spacing: 1px; white-space: nowrap; }
.walk-tip { position: absolute; transform: translateX(-50%); display: grid; justify-items: center; gap: 2px; padding: 6px 14px; border: 1px solid #4cd97b80; border-radius: 6px; background: #0a1219d1; color: #d9f4e4; font-size: var(--kp-text-13); letter-spacing: 0.5px; white-space: nowrap; pointer-events: auto; }
.walk-tip small { color: #7f95a3; font-size: var(--kp-text-12); }
.walk-help { position: absolute; bottom: 14px; left: 50%; transform: translateX(-50%); max-width: calc(100% - 32px); margin: 0; padding: 5px 16px; overflow: hidden; border-radius: 14px; background: #080e148c; color: #ffffffa6; font-size: var(--kp-text-12); text-overflow: ellipsis; white-space: nowrap; }
.walk-mini { position: absolute; right: 16px; bottom: 16px; z-index: 4; border: 1px solid #ffffff26; border-radius: 8px; background: #080e14c7; pointer-events: none; }
.walk-detail { position: absolute; top: 16px; right: 16px; z-index: 5; width: 302px; max-height: calc(100% - 250px); min-height: 120px; overflow-y: auto; padding: 14px 16px; border: 1px solid #4cd97b59; border-radius: 10px; background: #080e14b3; color: #dbe7ee; backdrop-filter: blur(16px); }
.walk-detail .wd-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.walk-detail h2 { margin: 0; color: #eaf6ef; font-size: 15px; font-weight: 600; }
.walk-detail .wd-head button { display: grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 6px; background: none; color: #8ea3b0; }
.walk-detail .wd-head button:hover { background: #ffffff14; color: #fff; }
.walk-detail .wd-type { margin: 2px 0 6px; color: #7f95a3; font-size: var(--kp-text-12); }
.walk-detail .wd-sec { margin: 13px 0 6px; padding-bottom: 3px; border-bottom: 1px solid #ffffff14; color: #4cd97b; font-size: var(--kp-text-12); font-weight: 600; letter-spacing: 1px; }
.walk-detail .wd-specs { width: 100%; border-collapse: collapse; font-size: var(--kp-text-13); }
.walk-detail .wd-specs th { width: 34%; padding: 3px 0; color: #8fa4b1; font-weight: 400; text-align: left; }
.walk-detail .wd-specs td { padding: 3px 0; color: #c6d4dd; font-variant-numeric: tabular-nums; }
.walk-detail .wd-none { margin: 0; color: #7f95a3; font-size: var(--kp-text-13); }
.walk-detail .wd-live p { margin: 0 0 6px; font-size: var(--kp-text-13); }
.walk-detail .wd-row { display: flex; align-items: center; gap: 8px; }
.walk-detail .wd-pjt { color: #93c5fd; font-weight: 600; }
.walk-detail .wd-pjt span { color: var(--muted); font-weight: 400; }
.walk-detail .wd-job span { color: var(--muted); font-variant-numeric: tabular-nums; }
.walk-detail .wd-gauge { display: flex; align-items: flex-end; gap: 10px; margin: 8px 0 4px; }
.walk-detail .wd-gauge b { margin-left: auto; font-size: 17px; line-height: 1; font-variant-numeric: tabular-nums; }
.walk-detail .wd-nums { color: var(--muted); font-variant-numeric: tabular-nums; }
.walk-joy { position: absolute; z-index: 4; width: 110px; height: 110px; border: 2px solid #ffffff40; border-radius: 50%; background: #ffffff0f; pointer-events: none; }
.walk-joy i { position: absolute; left: 30px; top: 30px; width: 46px; height: 46px; border-radius: 50%; background: #ffffff59; }
```

- [ ] **Step 4: 통과 확인**

Run: `cd /c/kopens/project/Factory3D/web && npx vitest run src/walk/components.test.tsx`
Expected: PASS (6 tests, 경고 없음)

- [ ] **Step 5: Commit**

```bash
cd /c/kopens/project/Factory3D && git add web/src/walk/WalkOverlay.tsx web/src/walk/WalkHud.tsx web/src/walk/Minimap.tsx web/src/walk/WalkDetail.tsx web/src/walk/TouchJoystick.tsx web/src/walk/components.test.tsx web/src/styles/app.css
git commit -m "feat(web): 체험 공간 시작 화면·HUD·미니맵·상세 패널·조이스틱

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 웹 — 체험 공간 화면 `/walk` + 입력 + 레일

**Files:**
- Create: `web/src/pages/WalkPage.tsx`, `web/src/walk/useWalkInput.ts`, `web/src/scene/qualityPref.ts`
- Modify: `web/src/pages/DashboardPage.tsx` (품질 저장값을 qualityPref 로), `web/src/scene/navigation.ts` (`typing` 내보내기), `web/src/routes.tsx`, `web/src/layout/IconRail.tsx`
- Test: `web/src/pages/walk.test.tsx`

**Interfaces:**
- Consumes: Task 1~5 전부, `WalkHost`·`SceneHost` (Task 3), `useLive` (`dashboard/useLive.ts`), `useDrawings`·`pickDrawing`·`loadStored`·`saveStored`, `useDrawing`, `useModels`, `usePlacements` (`{ list, loading }`), `modelFileUrl`, `AppShell`, `DrawingBar`, `FactoryView`, `ErrorPage`.
- Produces:
```ts
// qualityPref.ts — 3D 공장 화면과 같은 저장값 f3d:view 의 quality
export function loadQuality(): Quality
export function saveQuality(q: Quality): void
// navigation.ts
export const typing: () => boolean   // 글자 입력 중이거나 대화 상자 안에 포커스
// useWalkInput.ts
export interface WalkInput { cursor: RefObject<{ x: number; y: number }>; dragging: RefObject<boolean>; joy: JoyView | null }
export function useWalkInput(stage: RefObject<HTMLDivElement | null>, ctl: WalkController | null, onClickAt: (x: number, y: number) => void): WalkInput
// IconRail.tsx
export type RailKey = 'factory' | 'objects' | 'walk' | 'dashboard' | 'run' | 'chat' | 'admin'
// routes: '/walk' → <RequireAuth><WalkPage /></RequireAuth>
```

- [ ] **Step 1: 실패 테스트**

`web/src/pages/walk.test.tsx`:
```tsx
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../api/types'
import { StaticAuth } from '../auth/auth'
import type { Live } from '../dashboard/useLive'
import { routes } from '../routes'
import type { CameraDriver } from '../scene/walkLook'

const live = vi.hoisted(() => ({ value: { conn: 'connecting', data: null } as unknown }))
vi.mock('../dashboard/useLive', () => ({ useLive: () => live.value }))
// 가짜 SceneHost — 페이지가 3D 에 무엇을 부르는지 확인
const fake = vi.hoisted(() => ({
  setInteractive: vi.fn(), setObjects: vi.fn(), setSelected: vi.fn(), frameOverview: vi.fn(), onFrame: vi.fn(),
  setCameraDriver: vi.fn(), setGhostWalls: vi.fn(), pickPlacement: vi.fn((): number | null => null),
  setRings: vi.fn(), objectTop: vi.fn(() => null), focusObject: vi.fn(), setEditing: vi.fn(), setPlacing: vi.fn(),
  setObjectEvents: vi.fn(), setGroundClick: vi.fn(), setMarkers: vi.fn(), worldOfPlan: vi.fn(), planOfWorld: vi.fn(),
}))
function FakeView(p: { view: string; plan: unknown; onScene?: (s: unknown) => void }) {
  const { onScene } = p
  useEffect(() => {
    onScene?.(fake)
    return () => onScene?.(null)
  }, [onScene])
  return <div data-testid="factory-view" data-view={p.view}>{p.plan ? 'plan' : 'no plan'}</div>
}
vi.mock('../scene/FactoryView', () => ({ FactoryView: FakeView }))

const VIEWER: User = { id: 2, username: 'lee', displayName: '이', role: 'VIEWER', enabled: true, mustChangePassword: false, locked: false, createdAt: '' }
const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body })
const DRAWING = { id: 1, name: '나셀 공장', sourceType: 'dxf', version: 1, createdBy: 'system', updatedAt: '', width: 160, height: 65.8, placements: 2 }
const PLAN = { format: 1, unit: 'mm', scale: 0.001, rotQ: 0, flip: 1, bounds: { w: 160, h: 65.8 }, layers: [], lines: [], texts: [], walls: [], partitions: [], columns: [], zones: [], objectHints: [], warnings: { unsupported: {}, unitGuessed: false } }
const PLACEMENTS = [
  { id: 10, modelId: null, name: 'Main Station 1', x: 5, y: 5, rot: 0 },
  { id: 11, modelId: null, name: 'Box A', x: 150, y: 60, rot: 0 },
]
const KPI = { running: 1, ok: 1, warn: 0, bad: 0, doneToday: 0, planRate: 91, at: '2026-11-13T03:04:05Z' }
const STATION = { id: 3, no: 1, name: 'Main Station 1', placementName: 'Main Station 1', steps: ['a', 'b'], step: 1, actual: 20, target: 22, status: 'ok', projectId: null, unitNo: null }
const liveOf = (stations: unknown[]): Live =>
  ({ conn: 'live', data: { drawingId: 1, kpi: KPI, stations, projects: [], events: [], materials: [] } }) as unknown as Live

function show() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/drawings') return json(200, [DRAWING])
    if (url === '/api/drawings/1') return json(200, { ...DRAWING, createdAt: '', plan: PLAN, layerRules: {} })
    if (url === '/api/models') return json(200, [])
    if (url === '/api/drawings/1/placements') return json(200, PLACEMENTS)
    return json(404, { detail: '없음' })
  }))
  render(
    <StaticAuth user={VIEWER}>
      <RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/walk'] })} />
    </StaticAuth>,
  )
}

/** 입장하기를 누르고 장면에 넘긴 카메라 드라이버를 돌려줌 */
async function enter(): Promise<CameraDriver> {
  const btn = await screen.findByRole('button', { name: '입장하기' })
  await waitFor(() => expect(btn).toBeEnabled())
  fireEvent.click(btn)
  await waitFor(() => expect(fake.setCameraDriver).toHaveBeenCalled())
  return fake.setCameraDriver.mock.calls.at(-1)![0] as CameraDriver
}

describe('체험 공간 화면', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
    live.value = { conn: 'connecting', data: null }
    vi.clearAllMocks()
    fake.pickPlacement.mockImplementation(() => null)
  })

  it('시작 화면 → 입장 → W 를 누르면 카메라 드라이버가 앞(+y)으로 옮김', async () => {
    show()
    expect(await screen.findByRole('heading', { name: '체험 공간' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '체험' })).toHaveAttribute('aria-current', 'page')
    expect(await screen.findByText('나셀 공장', { selector: '.sub' })).toBeInTheDocument()
    expect(screen.getByTestId('factory-view')).toHaveAttribute('data-view', '3d')
    expect(fake.setInteractive).toHaveBeenCalledWith(false)
    fireEvent.keyDown(window, { code: 'KeyM' }) // 입장 전에는 무시
    expect(fake.setGhostWalls).not.toHaveBeenCalledWith(true)
    const drv = await enter()
    expect(screen.queryByRole('heading', { name: '체험 공간' })).toBeNull()
    expect(screen.getByText('통로')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '미니맵' })).toBeInTheDocument()
    const a = drv.update(0.05).eye
    expect(a).toEqual({ x: 79.5, y: 32.5, h: 1.7 }) // 가운데에 가장 가까운 빈 칸
    fireEvent.keyDown(window, { code: 'KeyW' })
    let b = a
    for (let i = 0; i < 10; i++) b = drv.update(0.05).eye
    expect(b.x).toBeCloseTo(79.5)
    expect(b.y).toBeCloseTo(32.5 + 5.2 * 0.5)
    fireEvent.keyUp(window, { code: 'KeyW' })
    expect(drv.update(0.05).eye.y).toBeCloseTo(b.y)
  })

  it('M 조감 뷰 ↔ 걷기 (벽 반투명), 패널이 없을 때 Esc 는 시작 화면으로 (드라이버 해제)', async () => {
    show()
    await enter()
    fireEvent.keyDown(window, { code: 'KeyM' })
    expect(fake.setGhostWalls).toHaveBeenLastCalledWith(true)
    expect(screen.getByText(/^조감 뷰 —/)).toBeInTheDocument()
    fireEvent.keyDown(window, { code: 'KeyM' })
    expect(fake.setGhostWalls).toHaveBeenLastCalledWith(false)
    expect(screen.getByText(/^WASD 이동/)).toBeInTheDocument()
    fireEvent.keyDown(window, { code: 'Escape' })
    expect(await screen.findByRole('button', { name: '입장하기' })).toBeInTheDocument()
    expect(fake.setCameraDriver).toHaveBeenLastCalledWith(null)
  })

  it('짧은 클릭 → 상세 패널(같은 이름의 공정이면 실시간 상태), Esc 는 패널만 닫음', async () => {
    live.value = liveOf([STATION])
    fake.pickPlacement.mockImplementation(() => 10)
    show()
    await enter()
    const stage = document.querySelector('.walk-stage')!
    fireEvent.mouseDown(stage, { button: 0, clientX: 100, clientY: 100 })
    fireEvent.mouseUp(window, { button: 0, clientX: 102, clientY: 101 })
    expect(fake.pickPlacement).toHaveBeenCalledWith(102, 101, 18)
    const panel = screen.getByRole('complementary', { name: '상세정보' })
    expect(panel).toHaveTextContent('Main Station 1')
    expect(panel).toHaveTextContent('임시 상자')
    expect(panel).toHaveTextContent('진행중')
    expect(panel).toHaveTextContent('실적 20% · 목표 22%')
    expect(fake.setSelected).toHaveBeenLastCalledWith(10)
    fireEvent.keyDown(window, { code: 'Escape' })
    expect(screen.queryByRole('complementary', { name: '상세정보' })).toBeNull()
    expect(screen.queryByRole('button', { name: '입장하기' })).toBeNull()
    expect(fake.setSelected).toHaveBeenLastCalledWith(null)
  })

  it('가리키는 객체 이름표 → E 로 상세(공정 없으면 실시간 상태 없음), 다시 E 로 닫기, 끌기는 시점만 돌림', async () => {
    fake.pickPlacement.mockImplementation(() => 11)
    show()
    const drv = await enter()
    const frame = fake.onFrame.mock.calls.at(-1)![0] as () => void
    act(() => {
      for (let i = 0; i < 6; i++) frame()
    })
    expect(screen.getByRole('button', { name: /Box A/ })).toHaveTextContent('클릭 또는 E — 상세정보')
    fireEvent.keyDown(window, { code: 'KeyE' })
    expect(screen.getByRole('complementary', { name: '상세정보' })).toHaveTextContent('실시간 상태 없음')
    fireEvent.keyDown(window, { code: 'KeyE' })
    expect(screen.queryByRole('complementary', { name: '상세정보' })).toBeNull()
    fake.pickPlacement.mockClear()
    const stage = document.querySelector('.walk-stage')!
    fireEvent.mouseDown(stage, { button: 0, clientX: 100, clientY: 100 })
    fireEvent.mouseMove(window, { clientX: 200, clientY: 100 })
    fireEvent.mouseUp(window, { clientX: 200, clientY: 100 })
    expect(fake.pickPlacement).not.toHaveBeenCalled()
    const p = drv.update(0.05)
    expect(p.look.x - p.eye.x).toBeCloseTo(Math.sin(0.45))
  })

  it('입력칸(도면 선택)에 포커스가 있으면 키를 무시', async () => {
    show()
    await enter()
    const sel = screen.getByRole('combobox', { name: '도면 선택' })
    sel.focus()
    fireEvent.keyDown(sel, { code: 'KeyM' })
    expect(fake.setGhostWalls).not.toHaveBeenCalledWith(true)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd /c/kopens/project/Factory3D/web && npx vitest run src/pages/walk.test.tsx`
Expected: FAIL — `/walk` 는 404 화면이라 `heading '체험 공간'` 을 찾지 못함

- [ ] **Step 3: 품질 저장값 공유 · typing 내보내기**

`web/src/scene/qualityPref.ts`:
```ts
import type { Quality } from './FactoryScene'

/** 3D 공장 화면과 같은 저장값 f3d:view 의 quality (상황판·체험 공간이 함께 씀) */
export function loadQuality(): Quality {
  try {
    return JSON.parse(localStorage.getItem('f3d:view') ?? '{}').quality === 'low' ? 'low' : 'high'
  } catch {
    return 'high'
  }
}

export function saveQuality(q: Quality): void {
  try {
    const v = JSON.parse(localStorage.getItem('f3d:view') ?? '{}') as object
    localStorage.setItem('f3d:view', JSON.stringify({ ...v, quality: q }))
  } catch {
    /* 저장 못 해도 동작 */
  }
}
```

`web/src/pages/DashboardPage.tsx`: `/** 3D 공장 화면과 같은 저장값 f3d:view 의 quality */` 부터 `saveQuality` 함수 끝(`}`)까지 두 함수를 지우고, import 에 추가:
```ts
import { loadQuality, saveQuality } from '../scene/qualityPref'
```

`web/src/scene/navigation.ts`: `const typing = () => {` 를 아래로 (본문 그대로):
```ts
export const typing = (): boolean => {
```

- [ ] **Step 4: 입력 훅**

`web/src/walk/useWalkInput.ts`:
```ts
import { useEffect, useRef, useState, type RefObject } from 'react'
import type { WalkController } from './controller'
import { WALK } from './player'
import { TouchSticks, type JoyView } from './touch'

export interface WalkInput {
  cursor: RefObject<{ x: number; y: number }> // 마지막 마우스 자리 (clientX/Y)
  dragging: RefObject<boolean>
  joy: JoyView | null // 터치 조이스틱 그림 (없으면 null)
}

/**
 * 걷는 동안(ctl 있음) 무대의 마우스·터치 (참고 파일): 왼쪽 끌기 = 시점, 6 px 안 움직인 클릭 = onClickAt(걷기 때만),
 * 터치 왼쪽 반 = 조이스틱 · 오른쪽 반 = 시점 (짧게 톡 = 브라우저가 만든 마우스 클릭으로 선택)
 */
export function useWalkInput(stage: RefObject<HTMLDivElement | null>, ctl: WalkController | null, onClickAt: (x: number, y: number) => void): WalkInput {
  const cursor = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
  const dragging = useRef(false)
  const [joy, setJoy] = useState<JoyView | null>(null)
  const click = useRef(onClickAt)
  useEffect(() => {
    click.current = onClickAt
  })
  useEffect(() => {
    const el = stage.current
    if (!el || !ctl) return
    let drag: { x: number; y: number; moved: number } | null = null
    const sticks = new TouchSticks()
    const down = (e: MouseEvent) => {
      if (e.button !== 0) return
      drag = { x: e.clientX, y: e.clientY, moved: 0 }
      dragging.current = true
      el.classList.add('dragging')
    }
    const move = (e: MouseEvent) => {
      cursor.current = { x: e.clientX, y: e.clientY }
      if (!drag) return
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y
      drag.moved += Math.abs(dx) + Math.abs(dy)
      drag.x = e.clientX
      drag.y = e.clientY
      ctl.drag(dx, dy)
    }
    const up = (e: MouseEvent) => {
      if (!drag) return
      const d = drag
      drag = null
      dragging.current = false
      el.classList.remove('dragging')
      cursor.current = { x: e.clientX, y: e.clientY }
      if (d.moved < WALK.clickPx && ctl.mode === 'walk') click.current(e.clientX, e.clientY)
    }
    const touches = (e: TouchEvent, fn: (id: number, x: number, y: number, width: number) => void) => {
      const r = el.getBoundingClientRect()
      for (const t of Array.from(e.changedTouches)) fn(t.identifier, t.clientX - r.left, t.clientY - r.top, r.width)
      const v = sticks.vec()
      ctl.setJoy(v.x, v.y)
      setJoy(sticks.view())
    }
    const tStart = (e: TouchEvent) => touches(e, (id, x, y, w) => sticks.start(id, x, y, w))
    const tMove = (e: TouchEvent) =>
      touches(e, (id, x, y) => {
        const look = sticks.move(id, x, y)
        if (look) ctl.drag(look.dx, look.dy, true)
      })
    const tEnd = (e: TouchEvent) => touches(e, (id) => sticks.end(id))
    el.addEventListener('mousedown', down)
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    el.addEventListener('touchstart', tStart, { passive: true })
    el.addEventListener('touchmove', tMove, { passive: true })
    el.addEventListener('touchend', tEnd)
    el.addEventListener('touchcancel', tEnd)
    return () => {
      el.removeEventListener('mousedown', down)
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      el.removeEventListener('touchstart', tStart)
      el.removeEventListener('touchmove', tMove)
      el.removeEventListener('touchend', tEnd)
      el.removeEventListener('touchcancel', tEnd)
      dragging.current = false
      el.classList.remove('dragging')
      ctl.setJoy(0, 0)
      setJoy(null)
    }
  }, [stage, ctl])
  return { cursor, dragging, joy }
}
```

- [ ] **Step 5: 화면**

`web/src/pages/WalkPage.tsx`:
```tsx
import { Gauge } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/context'
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
import { typing } from '../scene/navigation'
import type { SceneObject } from '../scene/objectLayer'
import { loadQuality, saveQuality } from '../scene/qualityPref'
import { buildColliders, type Solid } from '../walk/colliders'
import { WalkController, type WalkMode } from '../walk/controller'
import { Minimap } from '../walk/Minimap'
import { WALK } from '../walk/player'
import { findSpawn } from '../walk/spawn'
import { TouchJoystick } from '../walk/TouchJoystick'
import { useWalkInput } from '../walk/useWalkInput'
import { WalkDetail } from '../walk/WalkDetail'
import { WalkHud } from '../walk/WalkHud'
import { WalkOverlay } from '../walk/WalkOverlay'
import { zoneAt } from '../walk/zoneAt'
import { ErrorPage } from './ErrorPage'

const NO_MODELS: ModelInfo[] = []
const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'])
const AISLE = '통로' // 어느 구역에도 없을 때
const FRAME_EVERY = 6 // 이름표·구역은 6프레임마다 (참고 파일)

interface Tip { id: number; x: number; y: number }

/** /walk — 체험 공간: 고른 도면의 3D 를 1인칭으로 걷기 (참고 파일 '공장 3D 체험 공간') */
export function WalkPage() {
  const { user } = useAuth()
  const [drawings, retry] = useDrawings()
  const [chosen, setChosen] = useState<number | null>(() => (user ? loadStored(user.username) : null))
  const [quality, setQuality] = useState<Quality>(loadQuality)
  const [scene, setScene] = useState<SceneHost | null>(null)
  const list = drawings.kind === 'ok' ? drawings.list : []
  const drawingId = pickDrawing(list, chosen)
  const { state } = useDrawing(drawingId)
  const detail = state.kind === 'ok' && state.detail.id === drawingId ? state.detail : null
  const plan = detail?.plan ?? null
  const models = useModels()
  const modelList = models.state.kind === 'ok' ? models.state.list : NO_MODELS
  const placements = usePlacements(detail?.id ?? null)
  const live = useLive(drawingId)
  const data = live.data && live.data.drawingId === drawingId ? live.data : null

  const [ctl, setCtl] = useState<WalkController | null>(null) // 있으면 입장한 상태
  const [mode, setMode] = useState<WalkMode>('walk')
  const [zone, setZone] = useState(AISLE)
  const [tip, setTip] = useState<Tip | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)
  const stage = useRef<HTMLDivElement>(null)
  const kept = useRef<{ drawingId: number; ctl: WalkController } | null>(null) // 같은 도면에 다시 입장하면 걷던 자리부터
  const openRef = useRef(openId)
  const aimRef = useRef<number | null>(null)
  // 도면이 바뀌면 시작 화면으로 (렌더 중 조정)
  const [seen, setSeen] = useState(drawingId)
  if (seen !== drawingId) {
    setSeen(drawingId)
    setCtl(null)
    setMode('walk')
    setOpenId(null)
    setTip(null)
    setZone(AISLE)
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
  const colliders = useMemo(() => {
    if (!plan) return null
    const solids = placements.list.map((p): Solid => {
      const m = p.modelId != null ? (byId.get(p.modelId) ?? null) : null
      const size = m ?? BOX_SIZE
      return { x: p.x, y: p.y, rot: p.rot, sizeX: size.sizeX, sizeY: size.sizeY, category: m?.category ?? null }
    })
    return buildColliders(plan, solids)
  }, [plan, placements.list, byId])
  const ready = colliders !== null && !placements.loading && models.state.kind !== 'loading'
  const zones = plan?.zones ?? null

  const openAt = useCallback(
    (x: number, y: number) => {
      const id = scene?.pickPlacement(x, y, WALK.pickFar) ?? null
      if (id !== null) setOpenId(id)
    },
    [scene],
  )
  const input = useWalkInput(stage, ctl, openAt)

  useEffect(() => {
    openRef.current = openId
    aimRef.current = tip?.id ?? null
  })
  useEffect(() => scene?.setInteractive(false), [scene])
  useEffect(() => scene?.setObjects(sceneObjects), [scene, sceneObjects])
  useEffect(() => scene?.setSelected(openId), [scene, openId])
  const detailId = detail?.id ?? null
  useEffect(() => {
    if (scene && detailId !== null) scene.frameOverview() // 시작 화면 뒤 3D 는 전체 보기
  }, [scene, detailId])
  useEffect(() => {
    if (ctl && colliders && plan) ctl.setColliders(colliders, plan.bounds)
  }, [ctl, colliders, plan])
  // 입장 = 카메라 드라이버, 나가거나 화면을 떠나면 해제 (궤도 시점·OrbitControls 로 돌아감)
  useEffect(() => {
    if (!scene || !ctl) return
    scene.setCameraDriver(ctl)
    return () => scene.setCameraDriver(null)
  }, [scene, ctl])
  useEffect(() => scene?.setGhostWalls(ctl !== null && mode === 'overview'), [scene, ctl, mode])

  // 6프레임마다: 구역 배지 · 커서가 가리키는 배치 이름표 (참고 파일 updateTooltip·updateZoneBadge)
  useEffect(() => {
    if (!scene || !ctl || !zones) return
    let n = 0
    scene.onFrame(() => {
      n = (n + 1) % FRAME_EVERY
      if (n !== 0) return
      const p = ctl.player
      setZone(zoneAt(zones, p.x, p.y)?.name ?? AISLE)
      const c = input.cursor.current
      const id = ctl.mode === 'walk' && !input.dragging.current ? scene.pickPlacement(c.x, c.y, WALK.pickFar) : null
      const r = stage.current?.getBoundingClientRect()
      const x = c.x - (r?.left ?? 0), y = c.y - (r?.top ?? 0) + 22
      const next = id === null ? null : { id, x, y: r?.height ? Math.min(y, r.height - 60) : y }
      setTip((t) => (t?.id === next?.id && t?.x === next?.x && t?.y === next?.y ? t : next))
    })
    return () => scene.onFrame(null)
  }, [scene, ctl, zones, input.cursor, input.dragging])

  // 키: 입장한 뒤에만, 입력칸에 쓰는 중이면 무시
  useEffect(() => {
    if (!ctl) return
    const leave = () => {
      ctl.setMode('walk')
      setMode('walk')
      setTip(null)
      setCtl(null)
    }
    const down = (e: KeyboardEvent) => {
      if (typing() || e.ctrlKey || e.metaKey || e.altKey) return
      if (MOVE_KEYS.has(e.code)) {
        ctl.keyDown(e.code)
        if (e.code.startsWith('Arrow')) e.preventDefault()
        return
      }
      if (e.repeat) return
      if (e.code === 'KeyM') {
        const m = ctl.toggleMode()
        setMode(m)
        if (m === 'overview') setTip(null)
      } else if (e.code === 'KeyE') {
        if (openRef.current !== null) setOpenId(null)
        else if (aimRef.current !== null) setOpenId(aimRef.current)
      } else if (e.code === 'Escape') {
        if (openRef.current !== null) setOpenId(null)
        else leave()
      }
    }
    const up = (e: KeyboardEvent) => ctl.keyUp(e.code)
    const blur = () => ctl.clearKeys()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
      ctl.clearKeys()
    }
  }, [ctl])

  if (drawings.kind === 'error')
    return <ErrorPage code={drawings.error.kind === 'network' ? 'offline' : '500'} detail={drawings.error.message} onRetry={retry} />
  const select = (id: number) => {
    setChosen(id)
    if (user) saveStored(user.username, id)
  }
  const enter = () => {
    if (!plan || !colliders || drawingId === null) return
    let c = kept.current?.drawingId === drawingId ? kept.current.ctl : null
    if (!c) {
      c = new WalkController(colliders, plan.bounds, findSpawn(colliders, plan.bounds))
      kept.current = { drawingId, ctl: c }
    }
    c.setMode('walk')
    setMode('walk')
    setCtl(c)
  }
  const byPlacement = new Map(placements.list.map((p) => [p.id, p]))
  const opened = openId !== null ? (byPlacement.get(openId) ?? null) : null
  const openedModel = opened?.modelId != null ? (byId.get(opened.modelId) ?? null) : null
  const station = opened && data ? (data.stations.find((s) => s.placementName === opened.name) ?? null) : null
  const project = station?.projectId != null && data ? (data.projects.find((p) => p.id === station.projectId) ?? null) : null
  const tipName = tip ? byPlacement.get(tip.id)?.name : undefined
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
    <AppShell active="walk" head={head}>
      {drawings.kind === 'loading' ? (
        <p className="empty-state" role="status">도면 목록 불러오는 중…</p>
      ) : list.length === 0 ? (
        <div className="empty-state">
          <strong>등록된 도면이 없습니다</strong>
          <span>도면을 추가하면 체험 공간이 여기에 표시됩니다.</span>
        </div>
      ) : (
        <>
          <div ref={stage} className={ctl ? 'walk-stage on' : 'walk-stage'}>
            <FactoryView plan={plan} planKey={detail?.id} view="3d" quality={quality} onScene={setScene} />
          </div>
          {state.kind === 'error' && (
            <div className="dash-notice">
              <p className="dash-note" role="alert">{state.error.message}</p>
            </div>
          )}
          {ctl && plan ? (
            <>
              <WalkHud mode={mode} zone={zone} tip={tip && tipName ? { name: tipName, x: tip.x, y: tip.y } : null} onTip={() => tip && setOpenId(tip.id)} />
              <Minimap plan={plan} objects={sceneObjects} me={() => ctl.player} />
              {opened && <WalkDetail placement={opened} model={openedModel} station={station} project={project} onClose={() => setOpenId(null)} />}
              {input.joy && <TouchJoystick joy={input.joy} />}
            </>
          ) : (
            <WalkOverlay drawingName={detail?.name ?? ''} ready={ready} onEnter={enter} />
          )}
        </>
      )}
    </AppShell>
  )
}
```

(`leave()` 는 상세 패널이 이미 닫힌 상태에서만 불리므로 `openId` 를 따로 비우지 않는다. 나갈 때 `ctl` 이 null 이 되어 드라이버 해제 · 벽 원래대로 · 키·마우스·프레임 처리 해제가 effect 정리로 함께 일어난다.)

- [ ] **Step 6: 경로 · 레일**

`web/src/routes.tsx`: import 에 `import { WalkPage } from './pages/WalkPage'` 를 넣고(`UsersPage` 다음), `/dashboard` 줄 아래에 추가:
```tsx
  { path: '/walk', element: <RequireAuth><WalkPage /></RequireAuth>, errorElement: <ErrorPage code="500" /> },
```

`web/src/layout/IconRail.tsx`:
- import 를 `import { Bot, Box, Boxes, Footprints, LayoutDashboard, Play, Settings, type LucideIcon } from 'lucide-react'` 로.
- `export type RailKey = 'factory' | 'objects' | 'dashboard' | 'run' | 'chat' | 'admin'` 을 `export type RailKey = 'factory' | 'objects' | 'walk' | 'dashboard' | 'run' | 'chat' | 'admin'` 로.
- `MENU` 의 `objects` 줄 아래에 추가 (순서: 3D 공장 · 객체 · 체험 · 상황판 · 실행 · AI 챗봇):
```ts
  { key: 'walk', label: '체험', icon: Footprints, to: '/walk' },
```

- [ ] **Step 7: 통과 확인**

Run: `cd /c/kopens/project/Factory3D/web && npx vitest run src/pages/walk.test.tsx`
Expected: PASS (5 tests)

Run: `cd /c/kopens/project/Factory3D/web && npx vitest run && npm run build && ./node_modules/.bin/oxlint`
Expected: 모든 테스트 PASS(경고 없음 — 상황판 테스트도 그대로), 빌드 성공, oxlint `Found 0 warnings and 0 errors`.

- [ ] **Step 8: Commit**

```bash
cd /c/kopens/project/Factory3D && git add web/src/pages/WalkPage.tsx web/src/pages/walk.test.tsx web/src/walk/useWalkInput.ts web/src/scene/qualityPref.ts web/src/pages/DashboardPage.tsx web/src/scene/navigation.ts web/src/routes.tsx web/src/layout/IconRail.tsx
git commit -m "feat(web): 체험 공간 화면 /walk — 입장·걷기·조감·상세, 레일 체험

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 실제 화면 확인 (jar · Edge · 포트 8081 · 테스트 DB) + README

**Files:**
- Create: `web/e2e/walk-smoke.mjs`
- Modify: `README.md`, (필요 시) 이전 smoke 스크립트 선택자

**Interfaces:**
- Consumes: 전부. P1~P4 smoke 실행 방식(깨끗한 DB → jar → `p1` → `p2` → `p3` → `p4`), 그 다음 `walk-smoke.mjs`. 화면 쪽 약속: 레일 버튼 `체험`, `heading '체험 공간'`, `button '입장하기'`(`.walk-enter`), `canvas.walk-mini[data-pos="x,y"]`, `.walk-stage`, `.walk-zone`, `.walk-help`, `complementary '상세정보'`.

- [ ] **Step 1: 확인 스크립트 `web/e2e/walk-smoke.mjs`**

```js
// 체험 공간 실제 화면 확인 (Edge): 레일 체험 → 시작 화면 → 입장 → W 2초 이동 · 달려도 벽 안 → 설비 클릭 상세 → M 조감 → Esc 시작 화면 → 상황판 회귀.
// 스크린샷 e2e/shots/walk-*
// 사용: node e2e/walk-smoke.mjs <주소> <아이디> <비밀번호>   (P4 smoke 다음에)
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const [base = 'http://localhost:8081', id = 'admin', pw = 'Factory3d1!'] = process.argv.slice(2)
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
const RADIUS = 0.45

/** 미니맵 data-pos = 내 위치 (plan m) */
async function pos() {
  const s = (await page.locator('canvas.walk-mini').getAttribute('data-pos')) ?? ''
  const [x, y] = s.split(',').map(Number)
  return { x, y }
}

function segDist(p, a, b) {
  const vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a[0]) * vx + (p.y - a[1]) * vy) / l2)) : 0
  return Math.hypot(p.x - (a[0] + vx * t), p.y - (a[1] + vy * t))
}

/** 도면 경계 안 · 외벽·가벽 두께 + 몸 반지름 밖인지 */
function checkInside(plan, p, label) {
  const { w, h } = plan.bounds
  if (!(p.x >= RADIUS - 0.02 && p.x <= w - RADIUS + 0.02 && p.y >= RADIUS - 0.02 && p.y <= h - RADIUS + 0.02)) fail(`${label}: 도면 밖 (${p.x}, ${p.y})`)
  for (const wl of [...plan.walls, ...plan.partitions])
    for (let j = 0; j + 1 < wl.pts.length; j++) {
      const a = wl.pts[j], b = wl.pts[j + 1]
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.05) continue
      const d = segDist(p, a, b)
      if (d < wl.t / 2 + RADIUS - 0.02) fail(`${label}: 벽 ${wl.id} 안으로 들어감 (중심선까지 ${d.toFixed(2)} m)`)
    }
}

async function hold(keys, ms) {
  for (const k of keys) await page.keyboard.down(k)
  await page.waitForTimeout(ms)
  for (const k of [...keys].reverse()) await page.keyboard.up(k)
  await page.waitForTimeout(400)
}

try {
  await page.goto(base + '/login')
  await page.getByLabel('아이디').fill(id)
  await page.getByLabel('비밀번호').fill(pw)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL((u) => u.pathname === '/')

  // 1. 레일 › 체험 → 시작 화면 (나셀 공장)
  await page.getByRole('button', { name: '체험' }).click()
  await page.waitForURL((u) => u.pathname === '/walk')
  const select = page.getByRole('combobox', { name: '도면 선택' })
  await select.waitFor()
  if ((await select.locator('option:checked').textContent()) !== '나셀 공장') await select.selectOption({ label: '나셀 공장' })
  await page.getByRole('heading', { name: '체험 공간' }).waitFor()
  await page.waitForFunction(() => {
    const b = document.querySelector('.walk-enter')
    return b instanceof HTMLButtonElement && !b.disabled
  }, null, { timeout: 20000 })
  const drawingId = Number(await select.inputValue())
  const plan = (await (await page.request.get(`${base}/api/drawings/${drawingId}`)).json()).plan
  await page.waitForTimeout(6000) // 모델 내려받기 (headless 는 소프트웨어 WebGL)
  await shot('walk-1-start')

  // 2. 입장 → W 2초: 위치가 바뀌고 벽 안으로 들어가지 않음
  await page.getByRole('button', { name: '입장하기' }).click()
  await page.locator('canvas.walk-mini').waitFor()
  const stage = await page.locator('.walk-stage').boundingBox()
  const cx = stage.x + stage.width / 2, cy = stage.y + stage.height / 2
  await page.mouse.move(cx, cy)
  await page.waitForTimeout(1500)
  const p0 = await pos()
  checkInside(plan, p0, '시작 자리')
  await hold(['w'], 2000)
  const p1 = await pos()
  const moved = Math.hypot(p1.x - p0.x, p1.y - p0.y)
  console.log(`W 2초: (${p0.x}, ${p0.y}) → (${p1.x}, ${p1.y}) ${moved.toFixed(1)} m`)
  if (!(moved >= 0.5)) fail(`W 2초에 ${moved} m 만 움직임`)
  checkInside(plan, p1, 'W 2초 뒤')
  const zone = ((await page.locator('.walk-zone').textContent()) ?? '').trim()
  if (!zone) fail('구역 배지가 비어 있음')
  console.log(`구역: ${zone}`)
  await shot('walk-2-walk')

  // 3. Shift 달리기 6초 → 벽에 닿아도 뚫지 않음
  await hold(['Shift', 'w'], 6000)
  const p2 = await pos()
  console.log(`달리기 6초 뒤: (${p2.x}, ${p2.y})`)
  checkInside(plan, p2, '달리기 6초 뒤')
  await shot('walk-3-wall')

  // 4. 설비 클릭 → 상세 패널 (8방향 × 화면 가운데 줄을 눌러 봄)
  const detail = page.getByRole('complementary', { name: '상세정보' })
  let found = false
  for (let turn = 0; turn < 8 && !found; turn++) {
    for (const fy of [0.55, 0.65]) {
      for (let fx = 0.15; fx < 0.9 && !found; fx += 0.1) {
        await page.mouse.click(stage.x + stage.width * fx, stage.y + stage.height * fy)
        await page.waitForTimeout(80)
        found = await detail.isVisible()
      }
      if (found) break
    }
    if (!found) {
      // 왼쪽으로 약 45° (175 px × 0.0045 rad)
      await page.mouse.move(cx, cy)
      await page.mouse.down()
      await page.mouse.move(cx - 175, cy, { steps: 5 })
      await page.mouse.up()
      await page.waitForTimeout(400)
    }
  }
  if (!found) fail('8방향 어디를 눌러도 상세정보가 열리지 않음')
  else {
    const name = await detail.getByRole('heading', { level: 2 }).textContent()
    const text = (await detail.textContent()) ?? ''
    if (!text.includes('사양') || !text.includes('실시간 상태')) fail(`상세정보 내용: ${text}`)
    console.log(`상세정보: ${name}`)
    await page.waitForTimeout(500)
    await shot('walk-4-detail')
    await page.keyboard.press('Escape')
    await detail.waitFor({ state: 'detached' })
    if (!(await page.locator('.walk-help').isVisible())) fail('Esc 한 번에 시작 화면으로 나감 (패널만 닫혀야 함)')
  }

  // 5. M 조감 뷰 → 다시 M 이면 걷던 자리
  const before = await pos()
  await page.keyboard.press('m')
  await page.waitForTimeout(3500)
  if (!((await page.locator('.walk-help').textContent()) ?? '').includes('조감 뷰')) fail('M 을 눌러도 조감 뷰 도움말이 아님')
  await shot('walk-5-overview')
  await page.keyboard.press('m')
  await page.waitForTimeout(800)
  const after = await pos()
  if (Math.hypot(after.x - before.x, after.y - before.y) > 0.01) fail(`조감 뷰를 다녀오니 자리가 바뀜 (${before.x},${before.y} → ${after.x},${after.y})`)

  // 6. Esc → 시작 화면
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '입장하기' }).waitFor()
  await page.waitForTimeout(1000)
  await shot('walk-6-exit')

  // 7. 상황판 회귀 (체험에서 나와도 정상)
  await page.getByRole('button', { name: '상황판' }).click()
  await page.waitForURL((u) => u.pathname === '/dashboard')
  await page.locator('.live-badge', { hasText: 'LIVE' }).waitFor({ timeout: 15000 })
  await page.waitForTimeout(4000)
  await shot('walk-7-dashboard-regression')
} catch (e) {
  fail(e.message)
} finally {
  await browser.close()
}
if (pageErrors.length) console.log('브라우저 오류:\n  ' + pageErrors.join('\n  '))
console.log(process.exitCode ? '체험 공간 화면 확인 실패' : '체험 공간 화면 확인 통과')
```

- [ ] **Step 2: 실행 (포트 8081 · DB factory3d_test · 임시 데이터 폴더)**

8080 · DB `factory3d` · 저장소 `data/` 는 사용자의 서버가 쓰므로 건드리지 않는다. 먼저 8081 이 비어 있는지 확인(`netstat -ano | grep ':8081 .*LISTENING'` 이 비어야 함), 그다음:
```bash
cd /c/kopens/project/Factory3D
export PGPASSWORD=factory3d_test
"/c/Program Files/PostgreSQL/17/bin/psql.exe" -h localhost -p 5433 -U factory3d_test -d factory3d_test -c "drop schema public cascade" -c "create schema public"
SMOKE_DATA="$TEMP/f3d-walk-smoke"
rm -rf "$SMOKE_DATA" && mkdir -p "$SMOKE_DATA"
cd server && ./gradlew bootJar
JAVA21="$(ls -d ~/.gradle/jdks/*21*/ | head -1)bin/java"
F3D_PORT=8081 \
F3D_DB_URL=jdbc:postgresql://localhost:5433/factory3d_test F3D_DB_USER=factory3d_test F3D_DB_PASSWORD=factory3d_test \
F3D_ADMIN_PASSWORD=Start1234 F3D_DATA_DIR="$(cygpath -w "$SMOKE_DATA")" F3D_LIVE_TIME_SCALE=30 \
"$JAVA21" -jar build/libs/factory3d.jar > "$TEMP/f3d-walk-server.log" 2>&1 &
until curl -sf http://localhost:8081/api/health > /dev/null; do sleep 1; done
cd ../web
node e2e/p1-smoke.mjs http://localhost:8081 Start1234 Factory3d1!
node e2e/p2-smoke.mjs http://localhost:8081 admin Factory3d1!
node e2e/p3-smoke.mjs http://localhost:8081 admin Factory3d1!
node e2e/p4-smoke.mjs http://localhost:8081 admin Factory3d1!
node e2e/walk-smoke.mjs http://localhost:8081 admin Factory3d1!
```
Expected: 다섯 스크립트 모두 `… 화면 확인 통과`. walk-smoke 출력에 `W 2초: (…) → (…) N m`(N ≥ 0.5), `구역: …`, `상세정보: <배치 이름>`. 서버 로그 `$TEMP/f3d-walk-server.log` 에 오류 없음.
(`until … sleep 1` 이 막히면 Monitor 로 `http://localhost:8081/api/health` 를 기다림. 이전 smoke 가 레일 버튼 개수·순서에 기대는 선택자가 있어 깨지면 그 선택자만 고친다.)

- [ ] **Step 3: 스크린샷 눈으로 확인**

`web/e2e/shots/walk-1` ~ `walk-7` 을 Read 로 열어 보고서에 적는다: 시작 화면 카드(제목·도면 이름·조작 키 표·초록 `입장하기`)가 3D 위에 어둡게 겹치는지, 걷기 화면이 눈높이 1.7 m 시점인지(바닥·벽·설비가 사람 키 기준), 위 가운데 구역 배지, 오른쪽 아래 미니맵(벽 선·구역 테두리·객체·빨간 삼각형이 바라보는 쪽), 아래 도움말 줄, 벽 앞에서 화면이 벽 속으로 잘리지 않는지(walk-3), 상세 패널(이름·사양 표·실시간 상태), 조감 뷰에서 벽이 반투명이고 도면 전체가 보이는지(walk-5), 나간 뒤 시작 화면, 상황판이 P4 와 같은지. 깨져 보이면(카메라가 바닥 아래·천장 위, 도면이 거울처럼 뒤집힌 방향으로 걸음, 미니맵 삼각형 방향이 걷는 방향과 다름, 벽이 반투명이 안 됨) 원인을 찾아 해당 Task 파일을 고치고 테스트·smoke 를 다시 돌린다. 판단 문제(조금 어둡다 등)는 코드 그대로 두고 적는다. 끝나면 서버를 반드시 종료한다 (`netstat -ano | grep ':8081 .*LISTENING'` 의 PID → `taskkill //PID <pid> //F`). 8080 의 프로세스는 건드리지 않는다.

- [ ] **Step 4: README**

`README.md` 의 `### 상황판` 단락 아래(`## 배포` 위)에:
```
### 체험 공간
- 레일 `체험`: 고른 도면의 3D 공간(벽·가벽·기둥·구역·배치 객체)을 1인칭으로 걷습니다. `입장하기` 후 W A S D·방향키 이동, 마우스 드래그 시점 회전, Shift 달리기, M 조감 뷰 ↔ 걷기, 설비 클릭 또는 E 상세정보, Esc 패널 닫기(패널이 없으면 시작 화면). 터치는 왼쪽 반 조이스틱 이동 · 오른쪽 반 시점.
- 외벽·가벽·기둥·설비·자재(운반 제외)에 부딪히면 미끄러지듯 막힙니다. 시작 자리는 도면 가운데에 가장 가까운, 주변 1 m 가 빈 곳입니다.
- 위 가운데에 지금 구역(없으면 `통로`), 오른쪽 아래 미니맵. 상세정보에는 모델·크기·위치와, 같은 이름의 공정이 있으면 상황판 실시간 상태(상태·PJT 호기·step·실적/목표)가 나옵니다.
```
`## 테스트` 블록 끝에:
```
cd web && node e2e/walk-smoke.mjs http://localhost:8080 admin <비밀번호>   # P4 smoke 다음에: 체험 공간 입장·걷기·벽·상세·조감
```

- [ ] **Step 5: Commit**

```bash
cd /c/kopens/project/Factory3D && git add README.md web/e2e/walk-smoke.mjs
git commit -m "chore: 체험 공간 실제 화면 확인 스크립트 · README 안내

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
(Step 3 에서 고친 코드가 있으면 함께 커밋하고 메시지에 적는다. `web/e2e/shots/` 는 커밋하지 않는다 — 이전 단계와 같음.)

---

## 참고: spec 에서 채우거나 정한 부분

- **서버 변경 없음.** 도면 plan·배치·모델·`/ws/live` 가 이미 있어 웹만 바꾼다.
- `CameraDriver.update(dt)` 는 카메라를 받지 않고 **plan 좌표 자세(`CameraPose`: 눈·바라보는 점)를 돌려준다**. 장면이 root 회전·반전을 거쳐 카메라에 적용(`applyPose`) — 걷기 계산을 plan 좌표에만 두고 three 없이 테스트하려고 (spec §2.1 `d.update(dt, camera)` 에서 바꿈).
- 걷는 동안 카메라 시야각 70°·가까운 면 0.05 m·먼 면 max(1000 m, 도면 크기 × 4). 원래 가까운 면은 도면 크기/400(160 m 도면 = 0.4 m)이라 벽에서 0.45 m 에 서면 벽이 잘려 보임. 드라이버를 비우면 45°·원래 값·걷기 전 궤도 시점으로.
- 조감 뷰 궤도: 반지름 도면 큰 변 × 0.6, 높이 × 0.45, 앞뒤 0.6 배 타원(참고 파일 124 m 건물의 75·55 를 비율로), 60fps 기준 한 프레임 6% 씩 다가감(프레임 속도와 무관하게 환산), spec 의 '천천히 도는' 을 자동 회전 0.05 rad/s + 드래그로. 조감 안개는 max(250, 도면 × 2.2) ~ max(800, 도면 × 6) (참고 파일 250~800).
- 조감 반투명 재질 = 외벽 패널·석고(가벽)·걸레받이 (걸레받이 재질을 쓰는 기둥 바닥판도 함께 반투명). 벽·걸레받이 그림자는 끔. 지붕은 이 프로젝트에 없음.
- 충돌: 모델 없는 임시 상자(`modelId` 없음)도 막힘으로 침(화면에 단단한 상자로 보이므로). 0.05 m 보다 짧은 벽 조각은 메쉬처럼 건너뜀. 기둥은 H빔 몸통 w × d (바닥판 1.5 배는 제외). 벽 선분 위에 정확히 서면 왼쪽 법선으로 밀어냄.
- 시작 자리 '주변 1 m 가 빈 칸' = 칸 가운데에서 모든 장애물 표면·도면 경계까지 1 m 이상. 같은 거리면 x 가 작은 칸부터. 아주 큰 도면(칸 20만 개 초과)은 격자를 성기게. 빈 칸이 없으면 도면 가운데. 같은 도면에 다시 입장하면 걷던 자리부터, 도면을 바꾸면 시작 화면으로.
- 미니맵은 3D 를 위에서 본 방향(rotQ·flip 반영, 오른쪽 = 월드 +x, 위 = 월드 −z — 상황판 전체 보기와 같은 북쪽 위)으로 그림. 폭 280 · 높이 = 돌린 도면 비율, 200 넘으면 높이 200 에 맞추고 폭을 줄임. 가벽은 외벽보다 옅게. 0.1초마다 그림, 화면 확인용으로 `data-pos` 에 내 위치.
- 이름표는 참고 파일처럼 화면 가운데가 아니라 **커서** 자리로 고르고(18 m 안, 6프레임마다), 벽 뒤 객체도 고름(참고 파일과 같음). 그래도 spec 의 '조준점' 은 걷기 때 화면 가운데 작은 점으로 표시.
- 클릭 = 누른 뒤 움직인 거리 합(|dx|+|dy|) 6 px 미만, 걷기 때만. 터치 톡은 브라우저가 만드는 마우스 클릭으로 같은 경로를 탐(별도 탭 처리 없음). 이름표 자체를 눌러도 상세.
- Esc: 상세 패널이 있으면 닫기만, 없으면 시작 화면(드라이버 해제 → 궤도 시점). E 는 참고 파일처럼 열려 있으면 닫기·없으면 가리키는 객체 열기.
- 상세의 공정 연결 = 상황판과 같은 규칙(공정 `placementName` = 배치 이름). `useLive` 는 `/walk` 에서 도면을 고르면 늘 연결(패널을 열 때마다 다시 붙지 않게).
- 상황판·체험 공간이 같은 품질 저장값을 쓰도록 `loadQuality`·`saveQuality` 를 `scene/qualityPref.ts` 로 옮김. 입력칸 판정 `typing` 은 `navigation.ts` 에서 내보내 함께 씀.
- 실제 화면 확인은 사용자 서버(8080 · DB `factory3d` · `data/`)와 겹치지 않게 8081 · `factory3d_test` · 임시 데이터 폴더로 (P1~P4 smoke 를 같은 서버에 먼저 돌림).
