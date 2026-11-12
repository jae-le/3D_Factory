import type { Plan, Pt } from './types'

const r4 = (v: number) => Math.round(v * 1e4) / 1e4

/** 두 점 보정: 측정 거리(m) 가 실제 거리(m) 가 되도록 모든 좌표·크기를 k 배 (벽 높이·두께는 그대로) */
export function calibrate(plan: Plan, measured: number, actual: number): Plan {
  if (!(measured > 0) || !(actual > 0)) throw new Error('거리는 0보다 커야 합니다.')
  const k = actual / measured
  const P = ([x, y]: Pt): Pt => [r4(x * k), r4(y * k)]
  return {
    ...plan,
    scale: plan.scale * k,
    bounds: { w: r4(plan.bounds.w * k), h: r4(plan.bounds.h * k) },
    lines: plan.lines.map((l) => ({ ...l, pts: l.pts.map(P) })),
    texts: plan.texts.map((t) => ({ ...t, x: r4(t.x * k), y: r4(t.y * k), h: r4(t.h * k) })),
    walls: plan.walls.map((w) => ({ ...w, pts: w.pts.map(P) })),
    partitions: plan.partitions.map((w) => ({ ...w, pts: w.pts.map(P) })),
    columns: plan.columns.map((c) => ({ ...c, x: r4(c.x * k), y: r4(c.y * k), w: r4(c.w * k), d: r4(c.d * k) })),
    zones: plan.zones.map((z) => ({ ...z, poly: z.poly.map(P) })),
    objectHints: plan.objectHints.map((h) => ({ ...h, x: r4(h.x * k), y: r4(h.y * k) })),
  }
}

export function rotate(plan: Plan): Plan {
  return { ...plan, rotQ: ((plan.rotQ + 1) % 4) as Plan['rotQ'] }
}

export function flipPlan(plan: Plan): Plan {
  return { ...plan, flip: plan.flip === 1 ? -1 : 1 }
}
