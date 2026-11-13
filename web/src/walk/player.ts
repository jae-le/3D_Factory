/** 참고 파일 player · animate(walk 분기)의 수치 */
export const WALK = {
  eye: 1.7, speed: 5.2, run: 8.5, radius: 0.45, fov: 70, pitchMax: 1.35,
  drag: 0.0045, touchLook: 0.005, ovDrag: 0.005, ovTouch: 0.008,
  bob: 0.045, bobWalk: 9, bobRun: 13, dtMax: 0.05, pickFar: 18, clickPx: 6, subStep: 0.2,
} as const

/** plan 좌표(m). yaw 0 = plan +y(도면 위쪽)를 봄, 양수 = 왼쪽(반시계)으로 돎. bobT = 걸음 흔들림 위상 */
export interface Player { x: number; y: number; yaw: number; pitch: number; bobT: number }
/** fx +1 = 오른쪽, fz −1 = 앞 (참고 파일 그대로 — 조이스틱 아래로 당기면 +) */
export interface MoveInput { fx: number; fz: number; run: boolean }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** 누른 키(KeyboardEvent.code) + 조이스틱(−1..1) → 이동 입력 */
export function moveInput(keys: ReadonlySet<string>, joy: { x: number; y: number }): MoveInput {
  let fx = 0, fz = 0
  if (keys.has('KeyW') || keys.has('ArrowUp')) fz -= 1
  if (keys.has('KeyS') || keys.has('ArrowDown')) fz += 1
  if (keys.has('KeyA') || keys.has('ArrowLeft')) fx -= 1
  if (keys.has('KeyD') || keys.has('ArrowRight')) fx += 1
  return { fx: fx + joy.x, fz: fz + joy.y, run: keys.has('ShiftLeft') || keys.has('ShiftRight') }
}

/** 드래그(px) → 시점. k = rad/px (마우스 0.0045, 터치 0.005) */
export function turn(p: Player, dx: number, dy: number, k: number): Player {
  return { ...p, yaw: p.yaw - dx * k, pitch: clamp(p.pitch - dy * k, -WALK.pitchMax, WALK.pitchMax) }
}

/** 한 프레임 이동 (dt 최대 0.05초). 새 자리는 solve(충돌 처리)가 정함 */
export function step(p: Player, input: MoveInput, dt: number, solve: (x: number, y: number) => { x: number; y: number }): Player {
  const d = Math.min(Math.max(dt, 0), WALK.dtMax)
  const len = Math.hypot(input.fx, input.fz)
  if (len <= 0.01) return p
  const sp = (input.run ? WALK.run : WALK.speed) * Math.min(len, 1)
  const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw)
  const fx = input.fx / len, fz = input.fz / len
  // 참고 파일: 월드 (x, z) 이동 = (fx·cos + fz·sin, −fx·sin + fz·cos). plan y = −z
  const mx = fx * cos + fz * sin, my = fx * sin - fz * cos
  // 한 번에 0.2m 넘게 움직이지 않도록 나눠서 충돌 처리 (얇은 벽 통과 방지)
  const dist = sp * d, n = Math.max(1, Math.ceil(dist / WALK.subStep))
  let at = { x: p.x, y: p.y }
  for (let i = 0; i < n; i++) at = solve(at.x + (mx * dist) / n, at.y + (my * dist) / n)
  return { ...p, x: at.x, y: at.y, bobT: p.bobT + d * (input.run ? WALK.bobRun : WALK.bobWalk) }
}
