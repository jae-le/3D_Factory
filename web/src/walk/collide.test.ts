import { describe, expect, it } from 'vitest'
import type { Pt } from '../drawing/plan/types'
import { buildColliders, type Colliders } from './colliders'
import { clearance, collide } from './collide'
import { findSpawn } from './spawn'

const R = 0.45
const B = { w: 10, h: 10 }
const wallAt5: Colliders = { segs: [{ a: [0, 5], b: [10, 5], r: 0.1 }], rects: [] }

describe('충돌 도형', () => {
  it('외벽·가벽 선분(짧은 조각 제외) · 기둥 사각형 · 설비·자재·임시 상자 회전 사각형, 운반은 제외', () => {
    const c = buildColliders(
      {
        walls: [{ id: 'w', pts: [[0, 0], [10, 0], [10, 5]] as Pt[], h: 8, t: 0.4 }],
        partitions: [{ id: 'p', pts: [[2, 2], [2.01, 2], [2, 4]] as Pt[], h: 1.2, t: 0.1 }],
        columns: [{ id: 'c', x: 5, y: 5, w: 0.4, d: 0.6, h: 8 }],
      },
      [
        { x: 3, y: 3, rot: 90, sizeX: 4, sizeY: 2, category: 'equip' },
        { x: 6, y: 3, rot: 0, sizeX: 1, sizeY: 1, category: 'mat' },
        { x: 8, y: 3, rot: 0, sizeX: 3, sizeY: 1, category: 'mover' },
        { x: 8, y: 8, rot: 0, sizeX: 2, sizeY: 2, category: null },
      ],
    )
    expect(c.segs).toEqual([
      { a: [0, 0], b: [10, 0], r: 0.2 },
      { a: [10, 0], b: [10, 5], r: 0.2 },
      { a: [2.01, 2], b: [2, 4], r: 0.05 },
    ])
    expect(c.rects).toHaveLength(4)
    expect(c.rects[0]).toEqual({ cx: 5, cy: 5, hw: 0.2, hh: 0.3, rot: 0 })
    expect(c.rects[1]).toMatchObject({ cx: 3, cy: 3, hw: 2, hh: 1 })
    expect(c.rects[1].rot).toBeCloseTo(Math.PI / 2)
    expect(c.rects[2]).toMatchObject({ cx: 6, cy: 3, hw: 0.5, hh: 0.5 })
    expect(c.rects[3]).toMatchObject({ cx: 8, cy: 8, hw: 1, hh: 1 })
  })
})

describe('밀어내기', () => {
  it('벽을 향해 계속 걸어도 관통하지 않음 (반두께 + 몸 반지름에서 멈춤)', () => {
    let p = { x: 5, y: 3 }
    for (let i = 0; i < 20; i++) {
      p = collide({ x: p.x, y: p.y + 0.4 }, R, wallAt5, B)
      expect(p.y).toBeLessThanOrEqual(5 - 0.55 + 1e-9)
    }
    expect(p.y).toBeCloseTo(4.45)
  })

  it('벽에 비스듬히 닿으면 벽을 따라 미끄러짐', () => {
    const p = collide({ x: 5.3, y: 4.75 }, R, wallAt5, B)
    expect(p.x).toBeCloseTo(5.3)
    expect(p.y).toBeCloseTo(4.45)
  })

  it('벽 끝은 둥글게 밀어냄', () => {
    const p = collide({ x: 10.3, y: 5 }, R, wallAt5, { w: 20, h: 10 })
    expect(p.x).toBeCloseTo(10.55)
    expect(p.y).toBeCloseTo(5)
  })

  it('두 벽이 만나는 모서리에서도 둘 다에서 떨어짐 (2회 반복)', () => {
    const c: Colliders = { segs: [{ a: [0, 5], b: [10, 5], r: 0.1 }, { a: [5, 0], b: [5, 10], r: 0.1 }], rects: [] }
    const p = collide({ x: 4.7, y: 4.7 }, R, c, B)
    expect(p.x).toBeCloseTo(4.45)
    expect(p.y).toBeCloseTo(4.45)
  })

  it('회전된 사각형 바깥에서 닿으면 표면 밖으로', () => {
    const c: Colliders = { segs: [], rects: [{ cx: 5, cy: 5, hw: 2, hh: 1, rot: Math.PI / 2 }] } // 90° → x 로 ±1, y 로 ±2
    const p = collide({ x: 6.2, y: 5 }, R, c, B)
    expect(p.x).toBeCloseTo(6.45)
    expect(p.y).toBeCloseTo(5)
  })

  it('30° 회전된 사각형: 회전 방향이 틀리면 잡히는 비대칭 각도', () => {
    const a = Math.PI / 6, c: Colliders = { segs: [], rects: [{ cx: 5, cy: 5, hw: 2, hh: 0.5, rot: a }] }
    const ux = [Math.cos(a), Math.sin(a)], uy = [-Math.sin(a), Math.cos(a)] // 사각형의 긴 축 · 짧은 축 (반시계 30°)
    // 긴 축 위 1.5 m · 짧은 축 바깥 0.6 m (면에서 0.1 m) → 짧은 축으로 0.95 m 까지 밀려남
    const p = collide({ x: 5 + ux[0] * 1.5 + uy[0] * 0.6, y: 5 + ux[1] * 1.5 + uy[1] * 0.6 }, R, c, B)
    expect(p.x).toBeCloseTo(5 + ux[0] * 1.5 + uy[0] * 0.95)
    expect(p.y).toBeCloseTo(5 + ux[1] * 1.5 + uy[1] * 0.95)
    // 반대로 돌린(−30°) 자리에서는 사각형에 닿지 않아 그대로
    const q = { x: 5 + Math.cos(-a) * 1.5 - Math.sin(-a) * 0.6, y: 5 + Math.sin(-a) * 1.5 + Math.cos(-a) * 0.6 }
    expect(collide(q, R, c, B)).toEqual(q)
    expect(clearance(q.x, q.y, c)).toBeGreaterThan(R)
  })

  it('사각형 안에 들어가 있으면 가장 가까운 면 밖으로', () => {
    const c: Colliders = { segs: [], rects: [{ cx: 5, cy: 5, hw: 2, hh: 1, rot: 0 }] }
    const p = collide({ x: 6.8, y: 5.2 }, R, c, B)
    expect(p.x).toBeCloseTo(7.45)
    expect(p.y).toBeCloseTo(5.2)
  })

  it('도면 경계 밖으로 못 나감', () => {
    const p = collide({ x: -3, y: 20 }, R, { segs: [], rects: [] }, B)
    expect(p.x).toBeCloseTo(0.45)
    expect(p.y).toBeCloseTo(9.55)
  })

  it('여유 거리: 선분은 거리 − 반두께, 사각형 안은 0', () => {
    expect(clearance(5, 3, wallAt5)).toBeCloseTo(1.9)
    expect(clearance(5, 5, { segs: [], rects: [{ cx: 5, cy: 5, hw: 1, hh: 1, rot: 0 }] })).toBe(0)
    expect(clearance(1, 1, { segs: [], rects: [] })).toBe(Infinity)
  })
})

describe('시작 자리', () => {
  it('빈 도면은 가운데 칸', () => {
    expect(findSpawn({ segs: [], rects: [] }, { w: 20, h: 20 })).toEqual({ x: 9.5, y: 9.5 })
  })

  it('가운데가 막혀 있으면 주변 1 m 가 빈 가장 가까운 칸', () => {
    const c: Colliders = { segs: [], rects: [{ cx: 10, cy: 10, hw: 3, hh: 3, rot: 0 }] }
    const s = findSpawn(c, { w: 20, h: 20 })
    expect(s).toEqual({ x: 5.5, y: 9.5 })
    expect(clearance(s.x, s.y, c)).toBeGreaterThanOrEqual(1)
  })

  it('빈 칸이 없으면 도면 가운데', () => {
    const c: Colliders = { segs: [], rects: [{ cx: 5, cy: 5, hw: 10, hh: 10, rot: 0 }] }
    expect(findSpawn(c, { w: 10, h: 10 })).toEqual({ x: 5, y: 5 })
  })
})
