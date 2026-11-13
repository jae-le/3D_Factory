import { describe, expect, it } from 'vitest'
import { collide } from './collide'
import type { Colliders } from './colliders'
import { moveInput, step, turn, WALK, type Player } from './player'

const P0: Player = { x: 10, y: 10, yaw: 0, pitch: 0, bobT: 0 }
const free = (x: number, y: number) => ({ x, y })
const keys = (...k: string[]) => moveInput(new Set(k), { x: 0, y: 0 })

describe('걷기 입력', () => {
  it('W·방향키 위 = 앞(+y), S = 뒤, D = 오른쪽(+x), A = 왼쪽, Shift = 달리기', () => {
    expect(keys('KeyW')).toEqual({ fx: 0, fz: -1, run: false })
    expect(keys('ArrowUp', 'ArrowRight', 'ShiftLeft')).toEqual({ fx: 1, fz: -1, run: true })
    expect(keys('KeyS', 'KeyA', 'ShiftRight')).toEqual({ fx: -1, fz: 1, run: true })
    expect(moveInput(new Set(), { x: 0.5, y: -0.25 })).toEqual({ fx: 0.5, fz: -0.25, run: false })
  })

  it('전진: 걷기 5.2 m/s, 걸음 흔들림 9 rad/s', () => {
    const p = step(P0, keys('KeyW'), 0.05, free)
    expect(p.x).toBeCloseTo(10)
    expect(p.y).toBeCloseTo(10 + 5.2 * 0.05)
    expect(p.bobT).toBeCloseTo(0.05 * 9)
  })

  it('옆걸음 · 대각선은 같은 속도 · 달리기 8.5 m/s · 흔들림 13 rad/s', () => {
    expect(step(P0, keys('KeyD'), 0.05, free).x).toBeCloseTo(10 + 0.26)
    const d = step(P0, keys('KeyW', 'KeyD'), 0.05, free)
    expect(Math.hypot(d.x - 10, d.y - 10)).toBeCloseTo(0.26)
    const r = step(P0, keys('KeyW', 'ShiftLeft'), 0.05, free)
    expect(r.y).toBeCloseTo(10 + 8.5 * 0.05)
    expect(r.bobT).toBeCloseTo(0.05 * 13)
  })

  it('조이스틱 반만 밀면 반 속도', () => {
    const p = step(P0, moveInput(new Set(), { x: 0, y: -0.5 }), 0.05, free)
    expect(p.y).toBeCloseTo(10 + 5.2 * 0.5 * 0.05)
  })

  it('왼쪽으로 90° 돈 뒤 전진 = −x', () => {
    const p = step({ ...P0, yaw: Math.PI / 2 }, keys('KeyW'), 0.05, free)
    expect(p.x).toBeCloseTo(10 - 0.26)
    expect(p.y).toBeCloseTo(10)
  })

  it('dt 는 0.05 초까지만 (탭 전환 뒤 순간 이동 방지), 안 누르면 그대로', () => {
    expect(step(P0, keys('KeyW'), 0.5, free).y).toBeCloseTo(10 + 0.26)
    expect(step(P0, keys(), 0.05, free)).toBe(P0)
  })

  it('이동한 자리는 solve(충돌)가 정함', () => {
    const p = step(P0, keys('KeyW'), 0.05, () => ({ x: 1, y: 2 }))
    expect(p).toMatchObject({ x: 1, y: 2 })
  })

  it('드래그: 오른쪽으로 끌면 오른쪽으로 돎(yaw 감소), 피치 ±1.35 rad', () => {
    expect(turn(P0, 100, 0, WALK.drag).yaw).toBeCloseTo(-0.45)
    expect(turn(P0, 0, -1000, WALK.drag).pitch).toBe(1.35)
    expect(turn(P0, 0, 1000, WALK.drag).pitch).toBe(-1.35)
  })
})

describe('얇은 벽', () => {
  it('달리며 얇은 가벽(r 0.05)에 계속 부딪혀도 반대편으로 넘어가지 않음', () => {
    const c: Colliders = { segs: [{ a: [0, 5], b: [20, 5], r: 0.05 }], rects: [] }
    const b = { w: 20, h: 20 }
    const solve = (x: number, y: number) => collide({ x, y }, WALK.radius, c, b)
    let p: Player = { ...P0, x: 10, y: 3 }
    for (let i = 0; i < 200; i++) {
      p = step(p, keys('KeyW', 'ShiftLeft'), 0.05, solve)
      expect(p.y).toBeLessThan(5)
    }
    expect(p.y).toBeGreaterThan(5 - WALK.radius - 0.06)
  })

  it('한 프레임 이동은 0.2m 이하 조각으로 나뉘어 solve 에 전달', () => {
    const seen: number[] = []
    let last = 10
    step(P0, keys('KeyW', 'ShiftLeft'), 0.05, (x, y) => (seen.push(y - last), (last = y), { x, y }))
    expect(seen.length).toBe(3)
    for (const s of seen) expect(s).toBeLessThanOrEqual(0.2)
  })
})
