import { describe, expect, it } from 'vitest'
import type { Colliders } from './colliders'
import { WalkController } from './controller'
import { JOY_MAX, TouchSticks } from './touch'

const NONE: Colliders = { segs: [], rects: [] }
const B = { w: 20, h: 20 }

describe('WalkController', () => {
  it('시작: 눈높이 1.7 m, 도면 위쪽(+y)을 봄', () => {
    const c = new WalkController(NONE, B, { x: 10, y: 10 })
    expect(c.update(0.016)).toEqual({ eye: { x: 10, y: 10, h: 1.7 }, look: { x: 10, y: 11, h: 1.7 } })
  })

  it('W 를 누르는 동안 앞으로, 걸음 흔들림 ±0.045 m, 떼면 멈춤', () => {
    const c = new WalkController(NONE, B, { x: 10, y: 10 })
    c.keyDown('KeyW')
    let p = c.update(0.05)
    for (let i = 1; i < 10; i++) p = c.update(0.05)
    expect(p.eye.y).toBeCloseTo(10 + 5.2 * 0.5)
    expect(p.eye.h).toBeCloseTo(1.7 + Math.sin(4.5) * 0.045)
    c.keyUp('KeyW')
    expect(c.update(0.05).eye.y).toBeCloseTo(p.eye.y)
  })

  it('dt 는 0.05 초까지만', () => {
    const c = new WalkController(NONE, B, { x: 10, y: 10 })
    c.keyDown('KeyW')
    expect(c.update(1).eye.y).toBeCloseTo(10 + 0.26)
  })

  it('끌기: 마우스 0.0045 · 터치 0.005 rad/px, 돈 쪽으로 걸음', () => {
    const c = new WalkController(NONE, B, { x: 10, y: 10 })
    c.drag(100, 0)
    expect(c.player.yaw).toBeCloseTo(-0.45)
    c.drag(100, 0, true)
    expect(c.player.yaw).toBeCloseTo(-0.95)
    c.keyDown('KeyW')
    const p = c.update(0.05)
    expect(p.eye.x).toBeGreaterThan(10)
    expect(p.look.x - p.eye.x).toBeCloseTo(Math.sin(0.95))
  })

  it('벽을 뚫지 않음 (충돌 도형을 나중에 바꿔도)', () => {
    const c = new WalkController(NONE, B, { x: 10, y: 10 })
    c.setColliders({ segs: [{ a: [0, 12], b: [20, 12], r: 0.1 }], rects: [] }, B)
    c.keyDown('KeyW')
    c.keyDown('ShiftLeft')
    for (let i = 0; i < 100; i++) expect(c.update(0.05).eye.y).toBeLessThanOrEqual(12 - 0.55 + 1e-9)
  })

  it('조이스틱 + clearKeys', () => {
    const c = new WalkController(NONE, B, { x: 10, y: 10 })
    c.setJoy(0, -1)
    expect(c.update(0.05).eye.y).toBeCloseTo(10.26)
    c.keyDown('KeyW')
    c.clearKeys()
    expect(c.update(0.05).eye.y).toBeCloseTo(10.26)
  })

  it('M 조감 뷰: 걷지 않고 도면 가운데를 높이서 봄, 끌기는 궤도만, 다시 M 이면 걷던 자리', () => {
    const c = new WalkController(NONE, B, { x: 10, y: 10 })
    expect(c.toggleMode()).toBe('overview')
    c.keyDown('KeyW')
    let p = c.update(0.05)
    for (let i = 0; i < 200; i++) p = c.update(0.05)
    expect(c.player).toMatchObject({ x: 10, y: 10 })
    expect(p.eye.h).toBeCloseTo(20 * 0.45, 1)
    expect(p.look).toEqual({ x: 10, y: 10, h: 0 })
    c.drag(300, 0)
    expect(c.player.yaw).toBe(0)
    expect(c.toggleMode()).toBe('walk')
    c.keyUp('KeyW')
    expect(c.update(0.016).eye).toEqual({ x: 10, y: 10, h: 1.7 })
  })
})

describe('터치 두 손가락', () => {
  it('왼쪽 반 = 조이스틱(48 px 까지), 오른쪽 반 = 시점 이동량', () => {
    const t = new TouchSticks()
    t.start(1, 100, 300, 800)
    t.start(2, 600, 300, 800)
    expect(t.move(1, 100, 200)).toBeNull()
    expect(t.vec()).toEqual({ x: 0, y: -1 })
    expect(t.view()).toEqual({ cx: 100, cy: 300, kx: 0, ky: -JOY_MAX })
    t.move(1, 112, 300)
    expect(t.vec()).toEqual({ x: 0.25, y: 0 })
    expect(t.move(2, 630, 290)).toEqual({ dx: 30, dy: -10 })
    expect(t.move(2, 640, 290)).toEqual({ dx: 10, dy: 0 })
    t.end(1)
    expect(t.vec()).toEqual({ x: 0, y: 0 })
    expect(t.view()).toBeNull()
    t.end(2)
    expect(t.move(2, 0, 0)).toBeNull()
  })

  it('조이스틱 손가락이 이미 있으면 왼쪽 반 두 번째 손가락은 시점', () => {
    const t = new TouchSticks()
    t.start(1, 100, 300, 800)
    t.start(2, 150, 300, 800)
    expect(t.move(2, 160, 300)).toEqual({ dx: 10, dy: 0 })
  })
})
