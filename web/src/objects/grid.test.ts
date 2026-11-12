import { describe, expect, it } from 'vitest'
import { cellHits, cellSize, editCells, editTag, rectOf, rectsHit, snapToCells } from './grid'

describe('격자 계산 (demo snapToCells·cellHits·rectsHit 와 같음)', () => {
  it('격자 크기: 큰 변 40m 미만 0.5m, 아니면 1m', () => {
    expect(cellSize({ w: 39, h: 10 })).toBe(0.5)
    expect(cellSize({ w: 160, h: 65 })).toBe(1)
  })

  it('회전 사각형: 0° 는 x 축, 90° 는 y 축으로 길이', () => {
    const r0 = rectOf({ x: 5, y: 5, rot: 0 }, { sizeX: 4, sizeY: 2 })
    expect(r0).toMatchObject({ x: 5, y: 5, hl: 2, hw: 1 })
    expect(r0.ux).toBeCloseTo(1)
    const r90 = rectOf({ x: 5, y: 5, rot: 90 }, { sizeX: 4, sizeY: 2 })
    expect(r90.ux).toBeCloseTo(0)
    expect(r90.uy).toBeCloseTo(1)
  })

  it('모서리 기준 붙기: 4×2 는 바깥 상자 서쪽·남쪽 모서리가 격자선에', () => {
    const r = rectOf({ x: 0, y: 0, rot: 0 }, { sizeX: 4, sizeY: 2 })
    expect(snapToCells(r, 5.3, 5.6, 1)).toEqual({ x: 5, y: 6 })
    expect(snapToCells(r, 5.6, 5.4, 1)).toEqual({ x: 6, y: 5 })
    const odd = rectOf({ x: 0, y: 0, rot: 0 }, { sizeX: 3, sizeY: 1 })
    expect(snapToCells(odd, 5.2, 5.2, 1)).toEqual({ x: 5.5, y: 5.5 })
    const r90 = rectOf({ x: 0, y: 0, rot: 90 }, { sizeX: 3, sizeY: 1 })
    expect(snapToCells(r90, 5.2, 5.2, 1)).toEqual({ x: 5.5, y: 5.5 })
  })

  it('겹침: 축 정렬·회전 사각형 SAT, 모서리만 닿으면 겹침 아님', () => {
    const a = rectOf({ x: 0, y: 0, rot: 0 }, { sizeX: 2, sizeY: 2 })
    expect(rectsHit(a, rectOf({ x: 1.5, y: 0, rot: 0 }, { sizeX: 2, sizeY: 2 }))).toBe(true)
    expect(rectsHit(a, rectOf({ x: 2, y: 0, rot: 0 }, { sizeX: 2, sizeY: 2 }))).toBe(false)
    expect(rectsHit(a, rectOf({ x: 2.3, y: 0, rot: 45 }, { sizeX: 2, sizeY: 2 }))).toBe(true)
    expect(rectsHit(a, rectOf({ x: 2.5, y: 0, rot: 45 }, { sizeX: 2, sizeY: 2 }))).toBe(false)
    expect(cellHits(a, 0, 0, 1)).toBe(true)
    expect(cellHits(a, 1, 0, 1)).toBe(false) // 모서리만 닿음
  })

  it('차지한 칸·겹친 칸·태그', () => {
    const me = rectOf({ x: 2, y: 1, rot: 0 }, { sizeX: 4, sizeY: 2 }) // [0,4]×[0,2]
    const other = rectOf({ x: 4, y: 1, rot: 0 }, { sizeX: 2, sizeY: 2 }) // [3,5]×[0,2]
    const cells = editCells(me, [other], 1)
    expect(cells).toHaveLength(8)
    expect(cells.filter((c) => c.hit)).toHaveLength(2)
    expect(cells.find((c) => c.x === 3 && c.y === 0)!.hit).toBe(true)
    expect(editTag(me, cells, 1)).toBe('가로 4 × 세로 2칸 · 총 8칸 · 8.0㎡ · 겹침 2칸')
    const alone = editCells(me, [], 0.5)
    expect(editTag(me, alone, 0.5)).toBe('가로 8 × 세로 4칸 · 총 32칸 · 8.0㎡')
    const tilted = rectOf({ x: 2, y: 2, rot: 30 }, { sizeX: 2, sizeY: 1 })
    expect(editTag(tilted, editCells(tilted, [], 1), 1)).toMatch(/^총 \d+칸 · \d+\.\d㎡$/)
  })
})
