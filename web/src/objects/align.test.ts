import { describe, expect, it } from 'vitest'
import { alignMoves, boxOf, canAlign } from './align'

// 폭 2(ex 1) · 높이 2(ey 1) 상자 셋
const A = { id: 1, x: 1, y: 5, ex: 1, ey: 1 }
const B = { id: 2, x: 6, y: 2, ex: 1, ey: 1 }
const C = { id: 3, x: 20, y: 9, ex: 2, ey: 2 }

describe('정렬', () => {
  it('왼쪽·오른쪽·가로 가운데는 바깥 상자 기준', () => {
    expect(alignMoves([A, B, C], 'left')).toEqual([{ id: 2, x: 1, y: 2 }, { id: 3, x: 2, y: 9 }])
    expect(alignMoves([A, B, C], 'right')).toEqual([{ id: 1, x: 21, y: 5 }, { id: 2, x: 21, y: 2 }])
    expect(alignMoves([A, B], 'hcenter')).toEqual([{ id: 1, x: 3.5, y: 5 }, { id: 2, x: 3.5, y: 2 }])
  })
  it('위(+y)·아래·세로 가운데', () => {
    expect(alignMoves([A, B, C], 'top')).toEqual([{ id: 1, x: 1, y: 10 }, { id: 2, x: 6, y: 10 }])
    expect(alignMoves([A, B, C], 'bottom')).toEqual([{ id: 1, x: 1, y: 2 }, { id: 3, x: 20, y: 3 }])
    expect(alignMoves([A, B], 'vmiddle')).toEqual([{ id: 1, x: 1, y: 3.5 }, { id: 2, x: 6, y: 3.5 }])
  })
  it('간격 고르게: 양 끝은 그대로, 사이 빈 칸이 같음', () => {
    // 가로: 0..22 안에 폭 2·2·4 → 빈 칸 (22 - 8) / 2 = 7 → B 왼쪽 끝 9 → 가운데 10
    expect(alignMoves([C, A, B], 'hdist')).toEqual([{ id: 2, x: 10, y: 2 }])
    // 세로: 1..11 안에 높이 2·2·4 → 빈 칸 1 → 아래부터 B(1~3) A(4~6) C(7~11)
    expect(alignMoves([A, B, C], 'vdist')).toEqual([])
    // 0.5..11 안에 높이 2·2·4 → 빈 칸 1.25 → A 아래 끝 2.5 + 1.25 = 3.75 → 가운데 4.75 (B·C 는 그대로)
    expect(alignMoves([A, { ...B, y: 1.5 }, C], 'vdist')).toEqual([{ id: 1, x: 1, y: 4.75 }])
  })
  it('개수가 모자라면 안 함 · 회전한 객체는 바깥 상자', () => {
    expect(canAlign('left', 2)).toBe(true)
    expect(canAlign('hdist', 2)).toBe(false)
    expect(alignMoves([A, B], 'hdist')).toEqual([])
    expect(boxOf(9, { x: 0, y: 0, rot: 90 }, { sizeX: 4, sizeY: 2 })).toMatchObject({ ex: expect.closeTo(1, 6), ey: expect.closeTo(2, 6) })
  })
})
