import type { CameraDriver, CameraPose } from '../scene/walkLook'
import type { Colliders } from './colliders'
import { collide } from './collide'
import { moveInput, step, turn, WALK, type Player } from './player'

export type WalkMode = 'walk' | 'overview'
type Bounds = { w: number; h: number }
type Flip = 1 | -1

const OV_SPIN = 0.05 // 조감 뷰 자동 회전 (rad/s, 한 바퀴 약 2분)
const OV_LERP = 0.06 // 참고 파일: 60fps 한 프레임에 6% 씩 다가감

/** 걷기 자세: 눈 1.7 m + 흔들림, yaw·pitch 방향 1 m 앞을 봄 */
export function walkPose(p: Player): CameraPose {
  const h = WALK.eye + Math.sin(p.bobT) * WALK.bob, cp = Math.cos(p.pitch)
  return {
    eye: { x: p.x, y: p.y, h },
    look: { x: p.x - Math.sin(p.yaw) * cp, y: p.y + Math.cos(p.yaw) * cp, h: h + Math.sin(p.pitch) },
  }
}

/** 체험 공간 카메라 드라이버: 입력(키·조이스틱·끌기) + dt → plan 좌표 카메라 자세 */
export class WalkController implements CameraDriver {
  player: Player
  mode: WalkMode = 'walk'
  private keys = new Set<string>()
  private joy = { x: 0, y: 0 }
  private colliders: Colliders
  private bounds: Bounds
  /** 도면 좌우 반전(plan.flip): 반전되면 화면 오른쪽 = plan 왼쪽이라 옆걸음·좌우 끌기를 뒤집음 */
  private flip: Flip
  private ovAngle = 0
  private ovEye: CameraPose['eye'] | null = null

  constructor(colliders: Colliders, bounds: Bounds, start: { x: number; y: number }, flip: Flip = 1) {
    this.colliders = colliders
    this.bounds = bounds
    this.flip = flip
    this.player = { x: start.x, y: start.y, yaw: 0, pitch: 0, bobT: 0 }
  }

  setColliders(c: Colliders, b: Bounds, flip: Flip = this.flip): void {
    this.colliders = c
    this.bounds = b
    this.flip = flip
  }

  keyDown(code: string): void {
    this.keys.add(code)
  }

  keyUp(code: string): void {
    this.keys.delete(code)
  }

  clearKeys(): void {
    this.keys.clear()
    this.joy = { x: 0, y: 0 }
  }

  setJoy(x: number, y: number): void {
    this.joy = { x, y }
  }

  /** 걷기 = 시점 회전, 조감 = 궤도 각도 (참고 파일 mousemove·touchmove) */
  drag(dx: number, dy: number, touch = false): void {
    const sx = dx * this.flip // 화면 오른쪽 끌기 = 화면 오른쪽으로 돎 (반전 도면에서도)
    if (this.mode === 'walk') this.player = turn(this.player, sx, dy, touch ? WALK.touchLook : WALK.drag)
    else this.ovAngle -= sx * (touch ? WALK.ovTouch : WALK.ovDrag)
  }

  setMode(m: WalkMode): void {
    this.mode = m
    this.ovEye = null
  }

  toggleMode(): WalkMode {
    this.setMode(this.mode === 'walk' ? 'overview' : 'walk')
    return this.mode
  }

  update(dt: number): CameraPose {
    const d = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), WALK.dtMax) : 0 // NaN 이 들어와도 멈춰 버리지 않게
    if (this.mode === 'walk') {
      const { colliders, bounds } = this
      const m = moveInput(this.keys, this.joy)
      this.player = step(this.player, { ...m, fx: m.fx * this.flip }, d, (x, y) => collide({ x, y }, WALK.radius, colliders, bounds))
      return walkPose(this.player)
    }
    // 조감 뷰: 도면 가운데를 도는 궤도 (참고 파일 r 75 · 높이 55 · 앞뒤 0.6 — 124 m 건물 기준을 도면 크기 비율로)
    const { w, h } = this.bounds, span = Math.max(w, h), r = span * 0.6
    this.ovAngle += d * OV_SPIN
    const goal = { x: w / 2 + Math.sin(this.ovAngle) * r, y: h / 2 - Math.cos(this.ovAngle) * r * 0.6, h: span * 0.45 }
    const from = this.ovEye ?? walkPose(this.player).eye
    const k = 1 - Math.pow(1 - OV_LERP, d * 60)
    this.ovEye = { x: from.x + (goal.x - from.x) * k, y: from.y + (goal.y - from.y) * k, h: from.h + (goal.h - from.h) * k }
    return { eye: this.ovEye, look: { x: w / 2, y: h / 2, h: 0 } }
  }
}
