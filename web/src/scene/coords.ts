import type { Pt } from '../drawing/plan/types'

/** plan(m, 원점 = 왼쪽 아래) → three 로컬 (x, z). 도면 가운데가 원점, plan y 위쪽 = -z */
export function planToLocal(x: number, y: number, b: { w: number; h: number }): [number, number] {
  return [x - b.w / 2, -(y - b.h / 2)]
}

export function localToPlan(lx: number, lz: number, b: { w: number; h: number }): Pt {
  return [lx + b.w / 2, -lz + b.h / 2]
}
