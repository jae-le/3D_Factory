import { describe, expect, it } from 'vitest'
import { localToPlan, planToLocal } from './coords'

describe('plan ↔ 3D 로컬 좌표', () => {
  const b = { w: 10, h: 4 }
  it('가운데가 원점, plan y 는 -z', () => {
    expect(planToLocal(0, 0, b)).toEqual([-5, 2])
    expect(planToLocal(10, 4, b)).toEqual([5, -2])
    expect(planToLocal(5, 2, b)).toEqual([0, -0])
  })
  it('되돌리기', () => {
    expect(localToPlan(-5, 2, b)).toEqual([0, 0])
    expect(localToPlan(1.5, -0.5, b)).toEqual([6.5, 2.5])
  })
})
