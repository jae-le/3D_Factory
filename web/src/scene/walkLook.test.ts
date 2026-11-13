import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import type { Plan } from '../drawing/plan/types'
import { planToLocal } from './coords'
import { createMaterials } from './materials'
import { planToMeshes } from './planToMeshes'
import { WALK } from '../walk/player'
import { applyPose, ghostWalls, walkFog, WALK_FOV, WALK_NEAR, worldOf } from './walkLook'

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
    const cam = new THREE.PerspectiveCamera(WALK_FOV, 1, WALK_NEAR, 1000)
    applyPose(cam, { eye: { x: 10, y: 5, h: 1.7 }, look: { x: 10, y: 6, h: 1.7 } }, f)
    expect(cam.position.distanceTo(at(10, 5, 1.7))).toBeLessThan(1e-9)
    cam.updateMatrixWorld()
    const dir = cam.getWorldDirection(new THREE.Vector3())
    expect(dir.distanceTo(at(10, 6, 1.7).sub(at(10, 5, 1.7)).normalize())).toBeLessThan(1e-9)
  })

  it('가까운 면 0.1 m: 넓은 화면(21:9)에서도 모서리까지 몸 반지름 0.45 m 안 (벽에 붙어도 안 잘림)', () => {
    expect(WALK_NEAR).toBe(0.1)
    const hh = WALK_NEAR * Math.tan((WALK_FOV * Math.PI) / 360), hw = hh * (21 / 9)
    expect(Math.hypot(WALK_NEAR, hh, hw)).toBeLessThan(WALK.radius)
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
