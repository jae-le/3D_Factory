import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { localToPlan, planToLocal, planToWorld, worldToPlan } from './coords'

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
