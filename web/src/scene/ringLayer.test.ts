import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { RingLayer } from './ringLayer'

type RingMesh = THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>

describe('RingLayer', () => {
  it('설비 중심·반지름·두께 10%·선택 투명도, 차이만 반영', () => {
    const g = new THREE.Group()
    const layer = new RingLayer(g, () => 0)
    layer.setBounds({ w: 10, h: 10 })
    layer.setRings([
      { id: 1, x: 1, y: 9, r: 5, color: '#22c55e', strong: false },
      { id: 2, x: 5, y: 5, r: 2, color: '#ef4444', strong: true },
    ])
    expect(g.children).toHaveLength(2)
    const a = g.children[0] as RingMesh
    expect(a.position.x).toBeCloseTo(-4)
    expect(a.position.z).toBeCloseTo(-4)
    expect(a.position.y).toBeCloseTo(0.04)
    expect(a.geometry.parameters.innerRadius).toBeCloseTo(4.5)
    expect(a.geometry.parameters.outerRadius).toBeCloseTo(5)
    expect(a.material.opacity).toBeCloseTo(0.6)
    expect((g.children[1] as RingMesh).material.opacity).toBeCloseTo(0.95)
    const b = g.children[1]
    layer.setRings([{ id: 2, x: 5, y: 5, r: 2, color: '#ef4444', strong: false }])
    expect(g.children).toEqual([b])
    expect((b as RingMesh).material.opacity).toBeCloseTo(0.6)
    layer.dispose()
    expect(g.children).toHaveLength(0)
  })

  it('색은 0.6초 동안 바뀜', () => {
    let t = 0
    const g = new THREE.Group()
    const layer = new RingLayer(g, () => t)
    layer.setBounds({ w: 10, h: 10 })
    layer.setRings([{ id: 1, x: 5, y: 5, r: 2, color: '#22c55e', strong: false }])
    const m = (g.children[0] as RingMesh).material
    const green = new THREE.Color('#22c55e'), red = new THREE.Color('#ef4444')
    t = 1000
    layer.setRings([{ id: 1, x: 5, y: 5, r: 2, color: '#ef4444', strong: false }])
    layer.update()
    expect(m.color.equals(green)).toBe(true)
    t = 1300
    layer.update()
    expect(m.color.r).toBeGreaterThan(green.r)
    expect(m.color.r).toBeLessThan(red.r)
    t = 1600
    layer.update()
    expect(m.color.getHexString()).toBe('ef4444')
  })
})
