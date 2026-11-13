import { describe, expect, it } from 'vitest'
import type { Pt, Zone } from '../drawing/plan/types'
import { drawMinimap, MINI, miniFrame, pushTrail, type Mini2D } from './minimap'
import { inPoly, zoneAt } from './zoneAt'

const Z = (id: string, name: string, poly: Pt[]): Zone => ({ id, name, poly, color: '#ffffff', stationId: null })

describe('구역', () => {
  it('오목 다각형 안·밖', () => {
    const L: Pt[] = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]]
    expect(inPoly(2, 8, L)).toBe(true)
    expect(inPoly(8, 2, L)).toBe(true)
    expect(inPoly(8, 8, L)).toBe(false)
  })
  it('먼저 맞는 구역, 없으면 null', () => {
    const zones = [Z('a', 'Hub 조립장', [[0, 0], [5, 0], [5, 5], [0, 5]]), Z('b', '자재 창고', [[5, 0], [10, 0], [10, 5], [5, 5]])]
    expect(zoneAt(zones, 7, 2)?.name).toBe('자재 창고')
    expect(zoneAt(zones, 7, 8)).toBeNull()
    expect(zoneAt([Z('c', '선', [[0, 0], [1, 1]])], 0.5, 0.5)).toBeNull()
  })
})

/** 그리기 호출 기록 (좌표 소수 1자리) */
function recorder() {
  const calls: string[] = []
  const f = (v: number) => v.toFixed(1)
  const ctx = {
    strokeStyle: '', fillStyle: '', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter', shadowBlur: 0, shadowColor: '', globalAlpha: 1,
    clearRect: () => calls.push('clear'),
    fillRect: () => {},
    arc: (x: number, y: number, r: number) => calls.push(`A ${f(x)} ${f(y)} ${f(r)}`),
    save: () => {},
    restore: () => {},
    clip: () => {},
    beginPath: () => calls.push('begin'),
    moveTo: (x: number, y: number) => calls.push(`M ${f(x)} ${f(y)}`),
    lineTo: (x: number, y: number) => calls.push(`L ${f(x)} ${f(y)}`),
    closePath: () => calls.push('close'),
    stroke: () => calls.push(`stroke ${String(ctx.strokeStyle)} ${ctx.lineWidth}`),
    fill: () => calls.push(`fill ${String(ctx.fillStyle)}`),
  }
  return { ctx: ctx as unknown as Mini2D, calls }
}

describe('미니맵', () => {
  it('폭 280, 높이는 도면 비율 (회전한 도면은 돌린 비율, 높이 200 넘으면 폭을 줄임)', () => {
    const a = miniFrame({ bounds: { w: 100, h: 50 }, rotQ: 0, flip: 1 })
    expect([a.width, a.height]).toEqual([280, 150])
    const b = miniFrame({ bounds: { w: 100, h: 50 }, rotQ: 1, flip: 1 })
    expect([b.width, b.height]).toEqual([110, 200])
  })

  it('3D 와 같은 방향, 분류 색 블록 · 벽 · 지나온 길(빛) · 내 위치(점 + 바라보는 쪽 화살촉)', () => {
    const fr = miniFrame({ bounds: { w: 100, h: 50 }, rotQ: 0, flip: 1 })
    expect(fr.at(50, 25).map((v) => +v.toFixed(1))).toEqual([140, 75])
    const [ux, uy] = fr.dir(0, 1)
    expect(ux).toBeCloseTo(0)
    expect(uy).toBeCloseTo(-1)
    const { ctx, calls } = recorder()
    drawMinimap(
      ctx, fr,
      {
        walls: [{ id: 'w', pts: [[0, 0], [100, 0]], h: 8, t: 0.3 }],
        partitions: [{ id: 'p', pts: [[50, 0], [50, 20]], h: 1.2, t: 0.1 }],
        zones: [Z('z', 'Hub', [[10, 10], [20, 10], [20, 20], [10, 20]])],
      },
      [{ x: 30, y: 30, rot: 0, sizeX: 4, sizeY: 2, category: 'mat' }],
      { x: 50, y: 25, yaw: 0 },
      [[40, 25]],
    )
    expect(calls[0]).toBe('clear')
    expect(calls).toContain(`stroke ${MINI.wall} 2`)
    expect(calls).toContain(`stroke ${MINI.partition} 1.2`)
    expect(calls).toContain(`fill ${MINI.block.mat}`)
    expect(calls).toContain(`stroke ${MINI.trail} 3`)
    expect(calls).toContain('A 140.0 75.0 4.5')
    expect(calls.slice(-6)).toEqual(['begin', 'M 140.0 64.0', 'L 143.0 69.0', 'L 137.0 69.0', 'close', 'fill #ffffff'])
  })

  it('왼쪽으로 90° 돌면 화살촉도 왼쪽을 가리킴', () => {
    const fr = miniFrame({ bounds: { w: 100, h: 50 }, rotQ: 0, flip: 1 })
    const { ctx, calls } = recorder()
    drawMinimap(ctx, fr, { walls: [], partitions: [], zones: [] }, [], { x: 50, y: 25, yaw: Math.PI / 2 })
    expect(calls).toContain('M 129.0 75.0')
  })

  it('지나온 길: 0.5 m 넘게 움직였을 때만 더하고 최대 개수 유지', () => {
    let t: [number, number][] = []
    t = pushTrail(t, 0, 0)
    t = pushTrail(t, 0.2, 0)
    expect(t).toEqual([[0, 0]])
    t = pushTrail(t, 1, 0)
    expect(t).toHaveLength(2)
    for (let i = 2; i < 10; i++) t = pushTrail(t, i, 0, 0.5, 5)
    expect(t).toHaveLength(5)
    expect(t[4]).toEqual([9, 0])
  })
})
