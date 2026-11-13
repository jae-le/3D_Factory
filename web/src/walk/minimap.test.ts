import { describe, expect, it } from 'vitest'
import type { Pt, Zone } from '../drawing/plan/types'
import { drawMinimap, miniFrame, type Mini2D } from './minimap'
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
    strokeStyle: '', fillStyle: '', lineWidth: 1,
    clearRect: () => calls.push('clear'),
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
    expect([a.width, a.height]).toEqual([280, 148])
    const b = miniFrame({ bounds: { w: 100, h: 50 }, rotQ: 1, flip: 1 })
    expect([b.width, b.height]).toEqual([108, 200])
  })

  it('3D 와 같은 방향: plan 위쪽 = 캔버스 위쪽(rotQ 0), 내 위치 = 바라보는 쪽 빨간 삼각형', () => {
    const fr = miniFrame({ bounds: { w: 100, h: 50 }, rotQ: 0, flip: 1 })
    expect(fr.at(50, 25).map((v) => +v.toFixed(1))).toEqual([140, 74])
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
      [{ x: 30, y: 30, rot: 0, sizeX: 4, sizeY: 2 }],
      { x: 50, y: 25, yaw: 0 },
    )
    expect(calls[0]).toBe('clear')
    expect(calls).toContain('stroke rgba(255,255,255,.6) 1.5')
    expect(calls).toContain('stroke rgba(255,255,255,.35) 1')
    expect(calls).toContain('stroke rgba(76,217,123,.7) 1')
    expect(calls).toContain('fill rgba(180,195,205,.5)')
    expect(calls.slice(-6)).toEqual(['begin', 'M 140.0 68.0', 'L 144.0 78.0', 'L 136.0 78.0', 'close', 'fill #ff5544'])
  })

  it('왼쪽으로 90° 돌면 삼각형도 왼쪽을 가리킴', () => {
    const fr = miniFrame({ bounds: { w: 100, h: 50 }, rotQ: 0, flip: 1 })
    const { ctx, calls } = recorder()
    drawMinimap(ctx, fr, { walls: [], partitions: [], zones: [] }, [], { x: 50, y: 25, yaw: Math.PI / 2 })
    expect(calls).toContain('M 134.0 74.0')
  })
})
