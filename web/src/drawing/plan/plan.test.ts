import { describe, expect, it } from 'vitest'
import { dxfText, line, rect, text } from '../dxf/testDxf'
import { interpretDxf, reinterpretDxf } from './interpret'
import { defaultRule, ruleFor } from './rules'

describe('레이어 규칙', () => {
  it('기본 규칙: 가벽을 벽보다 먼저 봄', () => {
    expect(defaultRule('PARTITION')).toEqual({ role: 'partition', height: 1.2, thickness: 0.5 })
    expect(defaultRule('벽체_칸막이')).toEqual({ role: 'partition', height: 1.2, thickness: 0.5 })
    expect(defaultRule('A-WALL')).toEqual({ role: 'wall', height: 8, thickness: 0.2 })
    expect(defaultRule('COLUMN')).toEqual({ role: 'column', height: 9.5, thickness: 0 })
    expect(defaultRule('STATION')).toEqual({ role: 'zone', height: 0, thickness: 0 })
    expect(defaultRule('EQUIP')).toEqual({ role: 'object', height: 0, thickness: 0 })
    expect(defaultRule('FORK_PATH')).toEqual({ role: 'line', height: 0, thickness: 0 })
  })
  it('덮어쓰기는 빠진 칸을 그 역할의 기본값으로 채움', () => {
    expect(ruleFor('외곽선', { 외곽선: { role: 'wall' } })).toEqual({ role: 'wall', height: 8, thickness: 0.2 })
    expect(ruleFor('외곽선', { 외곽선: { role: 'wall', height: 5 } })).toEqual({ role: 'wall', height: 5, thickness: 0.2 })
  })
})

const factory = dxfText({
  insunits: 4,
  layers: { WALL: 7, PARTITION: 254, COLUMN: 8, STATION: 1, EQUIP: 3 },
  ents: [
    line('WALL', 0, 0, 20000, 0),
    rect('PARTITION', 2000, 2000, 3000, 1000),
    rect('COLUMN', 10000, 0, 600, 600),
    rect('STATION', 1000, 3000, 4000, 3000),
    text('STATION', 2000, 4000, 800, 'Hub 조립장'),
    text('STATION', 2000, 5000, 300, '작은글자'),
    rect('STATION', 15000, 3000, 500, 500), // 0.25㎡ → 구역 아님
    text('EQUIP', 3000, 4500, 300, 'HUB'),
    line('FORK_PATH', 0, 8000, 20000, 8000),
  ],
})

describe('buildPlan', () => {
  const p = interpretDxf(factory)

  it('단위·원점·크기 (mm → m, 원점 = bbox 최소점)', () => {
    expect(p.format).toBe(1)
    expect(p.unit).toBe('mm')
    expect(p.scale).toBe(0.001)
    expect(p.warnings.unitGuessed).toBe(false)
    expect(p.bounds).toEqual({ w: 20, h: 8 })
    expect(p.rotQ).toBe(0)
    expect(p.flip).toBe(1)
  })

  it('레이어 목록과 역할', () => {
    const byName = Object.fromEntries(p.layers.map((l) => [l.name, l]))
    expect(byName.PARTITION).toMatchObject({ role: 'partition', height: 1.2, thickness: 0.5, visible: true })
    expect(byName.WALL.color).toBe('#ffffff')
    expect(byName.FORK_PATH.role).toBe('line')
    expect(byName.STATION.count).toBe(4)
  })

  it('외벽·가벽(닫힌 사각형은 첫 점 반복)·기둥', () => {
    expect(p.walls).toEqual([{ id: 'w1', pts: [[0, 0], [20, 0]], h: 8, t: 0.2 }])
    expect(p.partitions[0]).toMatchObject({ id: 'p1', h: 1.2, t: 0.5 })
    expect(p.partitions[0].pts).toEqual([[2, 2], [5, 2], [5, 3], [2, 3], [2, 2]])
    expect(p.columns).toEqual([{ id: 'c1', x: 10.3, y: 0.3, w: 0.6, d: 0.6, h: 9.5 }])
  })

  it('구역: 안의 가장 큰 글자를 이름으로, 1㎡ 미만 무시', () => {
    expect(p.zones).toHaveLength(1)
    expect(p.zones[0]).toMatchObject({ id: 'z1', name: 'Hub 조립장', color: '#ff0000', stationId: null })
    expect(p.zones[0].poly).toHaveLength(4)
  })

  it('객체 표기 · 모든 선과 글자는 바닥 그림으로', () => {
    expect(p.objectHints).toEqual([{ id: 'h1', label: 'HUB', x: 3, y: 4.5, rot: 0 }])
    expect(p.lines).toHaveLength(6)
    expect(p.texts.map((t) => t.str)).toContain('Hub 조립장')
    expect(p.texts.find((t) => t.str === 'Hub 조립장')!.h).toBeCloseTo(0.8)
  })

  it('단위가 없으면 크기로 추정하고 표시, 직접 지정 가능', () => {
    const noUnit = dxfText({ ents: [line('WALL', 0, 0, 5000, 0)] })
    const g = interpretDxf(noUnit)
    expect(g.unit).toBe('mm')
    expect(g.warnings.unitGuessed).toBe(true)
    expect(g.bounds.w).toBeCloseTo(5)
    const m = interpretDxf(noUnit, { unit: 'cm' })
    expect(m.unit).toBe('cm')
    expect(m.bounds.w).toBeCloseTo(50)
    expect(interpretDxf(dxfText({ ents: [line('WALL', 0, 0, 50, 0)] })).unit).toBe('m')
  })

  it('규칙 덮어쓰기로 다시 해석해도 보정 배율·회전·반전 유지', () => {
    const old = { ...p, scale: 0.002, bounds: { w: 40, h: 16 }, rotQ: 1 as const, flip: -1 as const }
    const r = reinterpretDxf(factory, { WALL: { role: 'partition' } }, old)
    expect(r.walls).toHaveLength(0)
    expect(r.partitions).toHaveLength(2)
    expect(r.scale).toBeCloseTo(0.002)
    expect(r.bounds.w).toBeCloseTo(40)
    expect(r.rotQ).toBe(1)
    expect(r.flip).toBe(-1)
  })
})
