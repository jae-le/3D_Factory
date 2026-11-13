import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import type { Plan } from '../drawing/plan/types'
import { createMaterials } from './materials'
import { centroid, planToMeshes } from './planToMeshes'

const plan: Plan = {
  format: 1, unit: 'm', scale: 1, rotQ: 0, flip: 1, bounds: { w: 10, h: 4 },
  layers: [
    { name: 'WALL', color: '#ffffff', count: 1, role: 'wall', height: 8, thickness: 0.2, visible: true },
    { name: 'FORK', color: '#ff00ff', count: 1, role: 'line', height: 0, thickness: 0, visible: true },
    { name: 'OFF', color: '#00ff00', count: 1, role: 'line', height: 0, thickness: 0, visible: false },
  ],
  lines: [
    { layer: 'WALL', pts: [[0, 0], [10, 0], [10, 4]], closed: false, color: null },
    { layer: 'FORK', pts: [[0, 2], [10, 2]], closed: false, color: null },
    { layer: 'OFF', pts: [[0, 3], [10, 3]], closed: false, color: null },
  ],
  texts: [{ layer: 'FORK', x: 1, y: 1, h: 0.5, rot: 0, str: 'A', ha: 0, va: 0, color: null }],
  walls: [{ id: 'w1', pts: [[0, 0], [10, 0], [10, 4]], h: 8, t: 0.2 }],
  partitions: [{ id: 'p1', pts: [[2, 1], [2, 3]], h: 1.2, t: 0.5 }],
  columns: [{ id: 'c1', x: 5, y: 2, w: 0.6, d: 0.6, h: 9.5 }],
  zones: [{ id: 'z1', name: 'Hub', poly: [[1, 1], [3, 1], [3, 3], [1, 3]], color: '#ff0000', stationId: null }],
  objectHints: [],
  warnings: { unsupported: {}, unitGuessed: false },
}

const child = (g: THREE.Group, name: string) => g.getObjectByName(name) as THREE.Group

describe('planToMeshes', () => {
  const m = planToMeshes(plan, createMaterials(), { labels: false })

  it('외벽: 선분마다 패널 + 걸레받이 (높이 > 4m)', () => {
    const walls = child(m.group, 'solids').children.filter((o) => o.userData.kind === 'wall')
    expect(walls).toHaveLength(2)
    const plinths = child(m.group, 'solids').children.filter((o) => o.userData.kind === 'plinth')
    expect(plinths).toHaveLength(2)
    const first = walls[0] as THREE.Mesh<THREE.BoxGeometry>
    expect(first.geometry.parameters).toMatchObject({ width: 10, height: 8, depth: 0.2 })
    expect(first.position.x).toBeCloseTo(0)
    expect(first.position.y).toBeCloseTo(4)
    expect(first.position.z).toBeCloseTo(2) // plan y=0 → z = +h/2
  })

  it('가벽: 두께 0.5 · 높이 1.2, 걸레받이 없음', () => {
    const parts = child(m.group, 'solids').children.filter((o) => o.userData.kind === 'partition') as THREE.Mesh<THREE.BoxGeometry>[]
    expect(parts).toHaveLength(1)
    expect(parts[0].geometry.parameters).toMatchObject({ width: 2, height: 1.2, depth: 0.5 })
    expect(parts[0].position.y).toBeCloseTo(0.6)
  })

  it('기둥은 H빔 묶음, 구역은 바닥 테두리만 (면 색 없음)', () => {
    const cols = child(m.group, 'solids').children.filter((o) => o.userData.kind === 'column')
    expect(cols).toHaveLength(1)
    expect((cols[0] as THREE.Group).children).toHaveLength(4)
    const zones = child(m.group, 'zones').children
    expect(zones.filter((o) => o.userData.kind === 'zone')).toHaveLength(0)
    const edges = zones.filter((o) => o.userData.kind === 'zoneEdge') as THREE.LineLoop[]
    expect(edges).toHaveLength(1)
    expect(edges[0].geometry.attributes.position.count).toBe(4)
    expect(edges[0].position.y + edges[0].geometry.attributes.position.getY(0)).toBeGreaterThan(0)
  })

  it('구역 이름 표 자리: 다각형 무게중심', () => {
    expect(centroid([[1, 1], [3, 1], [3, 3], [1, 3]])).toEqual([2, 2])
    expect(centroid([[0, 0], [4, 0], [0, 4]])[0]).toBeCloseTo(4 / 3)
    expect(centroid([[0, 0], [2, 0]])).toEqual([1, 0]) // 넓이 0 → 평균
    expect(m.zoneLabels).toHaveLength(0) // labels:false
  })

  it('바닥 선: 레이어마다 LineSegments, 꺼진 레이어는 숨김, 끝점 목록', () => {
    const lines = child(m.group, 'lines').children as THREE.LineSegments[]
    expect(lines).toHaveLength(3)
    expect(lines.find((l) => l.name === 'OFF')!.visible).toBe(false)
    expect(m.lineMats).toHaveLength(3)
    expect(m.verts).toContainEqual([10, 4])
    expect(m.verts).toContainEqual([0, 2])
  })

  it('labels:false 면 글자 메쉬 없음', () => {
    expect(child(m.group, 'labels').children).toHaveLength(0)
  })
})
