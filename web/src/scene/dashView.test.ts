import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { overviewPose, toScreen } from './dashView'

describe('상황판 시점', () => {
  it('정규화 좌표 → 화면 px, 카메라 뒤·화면 밖은 안 보임', () => {
    expect(toScreen(new THREE.Vector3(0, 0, 0.5), 800, 600)).toEqual({ sx: 400, sy: 300, visible: true })
    expect(toScreen(new THREE.Vector3(1, 1, 0.5), 800, 600)).toEqual({ sx: 800, sy: 0, visible: true })
    expect(toScreen(new THREE.Vector3(0, 0, 1.5), 800, 600).visible).toBe(false)
    expect(toScreen(new THREE.Vector3(1.3, 0, 0.5), 800, 600).visible).toBe(false)
  })
  it('전체 보기: 벽 범위가 꽉 차게, 남쪽에서 약 70° 내려다봄(북쪽 위)', () => {
    const box = new THREE.Box3(new THREE.Vector3(-80, 0, -33), new THREE.Vector3(80, 8, 33))
    const { target, position } = overviewPose(box, 45, 16 / 9)
    expect(target.x).toBeCloseTo(0)
    expect(target.y).toBe(0)
    expect(target.z).toBeCloseTo(-66 * 0.06)
    const off = position.clone().sub(target)
    expect(off.x).toBeCloseTo(0)
    expect(off.z).toBeGreaterThan(0)
    expect(Math.atan2(off.y, off.z)).toBeCloseTo(1.22)
    const f = Math.tan((22.5 * Math.PI) / 180)
    expect(off.length()).toBeCloseTo(Math.max(((66 * 0.8) / 2 / f) * 1.4, (160 / 2 / f / (16 / 9)) * 1.06))
  })
})
