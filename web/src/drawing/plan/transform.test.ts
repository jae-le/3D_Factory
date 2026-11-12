import { describe, expect, it } from 'vitest'
import { dxfText, line, rect, text } from '../dxf/testDxf'
import { interpretDxf } from './interpret'
import { calibrate, flipPlan, rotate } from './transform'

const base = interpretDxf(dxfText({ insunits: 4, ents: [
  line('WALL', 0, 0, 10000, 0), rect('PARTITION', 0, 0, 2000, 1000), rect('COLUMN', 5000, 0, 600, 600),
  rect('STATION', 0, 2000, 4000, 2000), text('STATION', 1000, 3000, 500, 'A'), text('EQUIP', 1000, 1000, 300, 'HUB'),
] }))

describe('보정·회전·반전', () => {
  it('보정: 좌표·크기·글자 높이를 k 배, 벽 높이·두께는 그대로, scale *= k', () => {
    const c = calibrate(base, 5, 10)
    expect(c.scale).toBeCloseTo(0.002)
    expect(c.bounds.w).toBeCloseTo(base.bounds.w * 2)
    expect(c.walls[0].pts[1][0]).toBeCloseTo(20)
    expect(c.walls[0].h).toBe(8)
    expect(c.partitions[0].t).toBe(0.5)
    expect(c.columns[0]).toMatchObject({ w: 1.2, d: 1.2, h: 9.5 })
    expect(c.columns[0].x).toBeCloseTo(base.columns[0].x * 2)
    expect(c.zones[0].poly[2][1]).toBeCloseTo(base.zones[0].poly[2][1] * 2)
    expect(c.texts[0].h).toBeCloseTo(base.texts[0].h * 2)
    expect(c.objectHints[0].x).toBeCloseTo(base.objectHints[0].x * 2)
    expect(c.lines[0].pts[1][0]).toBeCloseTo(20)
    expect(base.scale).toBe(0.001) // 원본은 그대로
  })
  it('보정 입력이 0 이하면 오류', () => {
    expect(() => calibrate(base, 0, 10)).toThrow('거리는 0보다 커야 합니다.')
    expect(() => calibrate(base, 5, -1)).toThrow('거리는 0보다 커야 합니다.')
  })
  it('회전은 90° 단위로 돌고, 반전은 1 ↔ -1', () => {
    expect(rotate(base).rotQ).toBe(1)
    expect(rotate(rotate(rotate(rotate(base)))).rotQ).toBe(0)
    expect(flipPlan(base).flip).toBe(-1)
    expect(flipPlan(flipPlan(base)).flip).toBe(1)
  })
})
