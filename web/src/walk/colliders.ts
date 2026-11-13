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
