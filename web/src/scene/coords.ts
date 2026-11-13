import type { Pt } from '../drawing/plan/types'

/** plan(m, 원점 = 왼쪽 아래) → three 로컬 (x, z). 도면 가운데가 원점, plan y 위쪽 = -z */
export function planToLocal(x: number, y: number, b: { w: number; h: number }): [number, number] {
  return [x - b.w / 2, -(y - b.h / 2)]
}

export function localToPlan(lx: number, lz: number, b: { w: number; h: number }): Pt {
  return [lx + b.w / 2, -lz + b.h / 2]
}

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
