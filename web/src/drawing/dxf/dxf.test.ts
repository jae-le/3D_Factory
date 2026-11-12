import { describe, expect, it } from 'vitest'
import { flatten } from './flatten'
import { aci, parseDxf } from './parse'
import { dxfText, line, rect, text } from './testDxf'
import type { InsertPrim, PolyPrim, TextPrim } from './types'

const polys = (t: string) => flatten(parseDxf(t)).prims.filter((p): p is PolyPrim => p.kind === 'poly')

describe('parseDxf', () => {
  it('헤더 단위, 레이어 색·꺼짐, 엔티티', () => {
    const doc = parseDxf(dxfText({ insunits: 4, layers: { WALL: 7, HIDE: -1, RED: 1 }, ents: [line('WALL', 0, 0, 10, 0)] }))
    expect(doc.header.$INSUNITS).toBe('4')
    expect(doc.layers.WALL).toEqual({ color: 0xffffff, off: false })
    expect(doc.layers.HIDE.off).toBe(true)
    expect(doc.layers.RED.color).toBe(0xff0000)
    expect(doc.entities).toHaveLength(1)
    expect(aci(8)).toBe(0x808080)
  })
})

describe('flatten', () => {
  it('LINE 은 2점 열린 선, LWPOLYLINE 닫힘', () => {
    const p = polys(dxfText({ ents: [line('WALL', 0, 0, 10, 0), rect('ZONE', 0, 0, 4, 2)] }))
    expect(p[0]).toMatchObject({ layer: 'WALL', pts: [[0, 0], [10, 0]], closed: false, color: null })
    expect(p[1].closed).toBe(true)
    expect(p[1].pts).toHaveLength(4)
  })

  it('LWPOLYLINE bulge 는 호로 펼침 (반원: 시작·끝 사이에 점이 더 생김)', () => {
    const t = dxfText({ ents: [{ type: 'LWPOLYLINE', g: [[8, 'A'], [90, 2], [70, 0], [10, 0], [20, 0], [42, 1], [10, 10], [20, 0]] }] })
    const p = polys(t)[0]
    expect(p.pts.length).toBeGreaterThan(4)
    expect(p.pts[0]).toEqual([0, 0])
    const last = p.pts[p.pts.length - 1]
    expect(last[0]).toBeCloseTo(10)
    expect(last[1]).toBeCloseTo(0)
    expect(Math.min(...p.pts.map((q) => q[1]))).toBeCloseTo(-5, 0) // 반지름 5 반원 (b=1 → 시계 반대, 아래쪽)
  })

  it('ARC·CIRCLE 은 점 목록', () => {
    const p = polys(dxfText({ ents: [
      { type: 'CIRCLE', g: [[8, 'C'], [10, 0], [20, 0], [40, 2]] },
      { type: 'ARC', g: [[8, 'C'], [10, 0], [20, 0], [40, 2], [50, 0], [51, 90]] },
    ] }))
    expect(p[0].closed).toBe(true)
    expect(Math.hypot(...p[0].pts[5])).toBeCloseTo(2)
    expect(p[1].pts[0][0]).toBeCloseTo(2)
    expect(p[1].pts[p[1].pts.length - 1][1]).toBeCloseTo(2)
  })

  it('INSERT 중첩: 위치·회전·배율 적용, 레이어 0 은 INSERT 레이어 상속, insert 기본도형도 남김', () => {
    const t = dxfText({
      blocks: [
        { name: 'INNER', ents: [line('0', 0, 0, 1, 0)] },
        { name: 'OUTER', ents: [{ type: 'INSERT', g: [[8, '0'], [2, 'INNER'], [10, 1], [20, 0]] }] },
      ],
      ents: [{ type: 'INSERT', g: [[8, 'EQUIP'], [2, 'OUTER'], [10, 100], [20, 50], [41, 2], [42, 2], [50, 90]] }],
    })
    const f = flatten(parseDxf(t))
    const p = f.prims.filter((x): x is PolyPrim => x.kind === 'poly')[0]
    expect(p.layer).toBe('EQUIP')
    expect(p.pts[0][0]).toBeCloseTo(100)
    expect(p.pts[0][1]).toBeCloseTo(52) // (1,0)*2 회전 90° → (0,2)
    expect(p.pts[1][1]).toBeCloseTo(54)
    const ins = f.prims.filter((x): x is InsertPrim => x.kind === 'insert')
    expect(ins[0]).toMatchObject({ block: 'OUTER', layer: 'EQUIP', x: 100, y: 50 })
    expect(ins[0].rot).toBeCloseTo(Math.PI / 2)
  })

  it('TEXT·MTEXT 글자와 정렬, 빈 글자 무시, 지원 안 되는 엔티티 집계', () => {
    const f = flatten(parseDxf(dxfText({ ents: [
      text('STATION', 5, 6, 0.8, 'Hub 조립장'),
      { type: 'MTEXT', g: [[8, 'T'], [10, 1], [20, 2], [40, 1], [71, 5], [1, '{\\fArial;첫줄\\P둘째}']] },
      text('T', 0, 0, 1, '   '),
      { type: 'HATCH', g: [[8, 'H']] },
    ] })))
    const ts = f.prims.filter((x): x is TextPrim => x.kind === 'text')
    expect(ts).toHaveLength(2)
    expect(ts[0]).toMatchObject({ str: 'Hub 조립장', x: 5, y: 6, h: 0.8, ha: 0, va: 0 })
    expect(ts[1]).toMatchObject({ str: '첫줄\n둘째', ha: 1, va: 2 })
    expect(f.unsupported).toEqual({ HATCH: 1 })
    expect(f.stats.TEXT).toBe(2)
  })

  it('도면공간(67=1) 엔티티는 건너뜀', () => {
    expect(polys(dxfText({ ents: [{ type: 'LINE', g: [[8, 'A'], [67, 1], [10, 0], [20, 0], [11, 1], [21, 1]] }] }))).toHaveLength(0)
  })
})
