import type { Plan } from '../drawing/plan/types'
import { rectOf } from '../objects/grid'
import type { Category } from '../objects/types'
import { planToWorld, type PlanFrame } from '../scene/coords'

/** 미니맵 캔버스 크기와 plan → 캔버스 변환 (3D 를 위에서 본 방향: 오른쪽 = 월드 +x, 위 = 월드 −z) */
export interface MiniFrame {
  width: number
  height: number
  at(x: number, y: number): [number, number]
  dir(dx: number, dy: number): [number, number] // plan 방향 → 캔버스 단위 방향
}
export type Mini2D = Pick<
  CanvasRenderingContext2D,
  | 'clearRect' | 'fillRect' | 'beginPath' | 'moveTo' | 'lineTo' | 'closePath' | 'arc' | 'stroke' | 'fill' | 'save' | 'restore' | 'clip'
  | 'strokeStyle' | 'fillStyle' | 'lineWidth' | 'lineCap' | 'lineJoin' | 'shadowBlur' | 'shadowColor' | 'globalAlpha'
>
export interface MiniObject { x: number; y: number; rot: number; sizeX: number; sizeY: number; category?: Category | null }
export interface MiniMe { x: number; y: number; yaw: number }

/** 어두운 관제 화면 느낌: 남색 바탕 · 옅은 점 격자 · 둥근 벽선 · 분류별 줄무늬 블록 · 빛나는 청록 이동 경로 */
export const MINI = {
  bg: '#0b1016',
  dot: 'rgba(120,140,160,.16)',
  zoneFill: 'rgba(255,255,255,.025)',
  zoneLine: 'rgba(150,170,190,.22)',
  wall: '#6f7b88',
  partition: '#4a5561',
  block: { equip: '#cfe0f5', mat: '#3fe0b2', mover: '#9b8cff', none: '#7c8794' } as Record<Category | 'none', string>,
  stripe: 'rgba(11,16,22,.55)',
  trail: '#3ee8e0',
  trailCore: '#d6fffd',
  me: '#3ee8e0',
}
const DOT_STEP = 14 // 점 격자 간격(px)

/** 폭 maxW(280) · 높이 = 도면(돌린) 비율. 높이가 maxH(200) 를 넘으면 높이 200 에 맞추고 폭을 줄임 */
export function miniFrame(f: PlanFrame, maxW = 280, maxH = 200, pad = 10): MiniFrame {
  const { w, h } = f.bounds
  const xs: number[] = [], zs: number[] = []
  for (const [x, y] of [[0, 0], [w, 0], [w, h], [0, h]]) {
    const [X, Z] = planToWorld(x, y, f)
    xs.push(X)
    zs.push(Z)
  }
  const x0 = Math.min(...xs), z0 = Math.min(...zs)
  const W = Math.max(...xs) - x0 || 1, D = Math.max(...zs) - z0 || 1
  let k = (maxW - pad * 2) / W, width = maxW, height = Math.round(D * k + pad * 2)
  if (height > maxH) {
    k = (maxH - pad * 2) / D
    height = maxH
    width = Math.round(W * k + pad * 2)
  }
  const at = (x: number, y: number): [number, number] => {
    const [X, Z] = planToWorld(x, y, f)
    return [pad + (X - x0) * k, pad + (Z - z0) * k]
  }
  const [ox, oy] = at(0, 0)
  const dir = (dx: number, dy: number): [number, number] => {
    const [ax, ay] = at(dx, dy), vx = ax - ox, vy = ay - oy, l = Math.hypot(vx, vy) || 1
    return [vx / l, vy / l]
  }
  return { width, height, at, dir }
}

/** 지나온 자리 기록: 마지막 점에서 min m 이상 움직였을 때만 더하고 max 개까지 */
export function pushTrail(trail: [number, number][], x: number, y: number, min = 0.5, max = 400): [number, number][] {
  const last = trail[trail.length - 1]
  if (last && Math.hypot(x - last[0], y - last[1]) < min) return trail
  const next = [...trail, [x, y] as [number, number]]
  return next.length > max ? next.slice(next.length - max) : next
}

/** 미니맵: 바탕·점 격자 → 구역 → 객체 블록(분류 색 + 가로 줄무늬) → 벽 → 이동 경로(빛) → 내 위치(빛나는 점 + 시야 부채꼴) */
export function drawMinimap(ctx: Mini2D, fr: MiniFrame, plan: Pick<Plan, 'walls' | 'partitions' | 'zones'>, objects: MiniObject[], me: MiniMe, trail: [number, number][] = []): void {
  const { width: W, height: H } = fr
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = MINI.bg
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = MINI.dot
  for (let y = DOT_STEP / 2; y < H; y += DOT_STEP) for (let x = DOT_STEP / 2; x < W; x += DOT_STEP) ctx.fillRect(x, y, 1, 1)

  const path = (pts: [number, number][], closed: boolean) => {
    pts.forEach(([x, y], i) => {
      const [u, v] = fr.at(x, y)
      if (i === 0) ctx.moveTo(u, v)
      else ctx.lineTo(u, v)
    })
    if (closed) ctx.closePath()
  }
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // 구역: 아주 옅은 면 + 가는 테두리
  ctx.beginPath()
  for (const z of plan.zones) path(z.poly, true)
  ctx.fillStyle = MINI.zoneFill
  ctx.fill()
  ctx.strokeStyle = MINI.zoneLine
  ctx.lineWidth = 1
  ctx.stroke()

  // 객체: 분류 색 블록 + 가로 줄무늬(랙 느낌)
  for (const o of objects) {
    const r = rectOf(o, o)
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]): [number, number] => [r.x + r.ux * a * r.hl - r.uy * b * r.hw, r.y + r.uy * a * r.hl + r.ux * b * r.hw])
    ctx.save()
    ctx.beginPath()
    path(corners, true)
    ctx.fillStyle = MINI.block[o.category ?? 'none']
    ctx.globalAlpha = 0.9
    ctx.fill()
    ctx.clip()
    ctx.globalAlpha = 1
    const us = corners.map((c) => fr.at(c[0], c[1]))
    const y0 = Math.min(...us.map((u) => u[1])), y1 = Math.max(...us.map((u) => u[1]))
    const x0 = Math.min(...us.map((u) => u[0])), x1 = Math.max(...us.map((u) => u[0]))
    ctx.fillStyle = MINI.stripe
    for (let y = y0 + 1.5; y < y1; y += 3) ctx.fillRect(x0, y, x1 - x0, 1)
    ctx.restore()
  }

  // 벽·가벽: 둥근 끝
  const lines = (list: { pts: [number, number][] }[], color: string, width: number) => {
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.beginPath()
    for (const l of list) path(l.pts, false)
    ctx.stroke()
  }
  lines(plan.walls, MINI.wall, 2)
  lines(plan.partitions, MINI.partition, 1.2)

  // 지나온 길: 빛나는 청록 굵은 선 + 밝은 심
  const [px, py] = fr.at(me.x, me.y)
  if (trail.length) {
    const pts: [number, number][] = [...trail, [me.x, me.y]]
    ctx.save()
    ctx.shadowColor = MINI.trail
    ctx.shadowBlur = 8
    ctx.strokeStyle = MINI.trail
    ctx.lineWidth = 3
    ctx.globalAlpha = 0.85
    ctx.beginPath()
    path(pts, false)
    ctx.stroke()
    ctx.restore()
    ctx.strokeStyle = MINI.trailCore
    ctx.lineWidth = 1
    ctx.beginPath()
    path(pts, false)
    ctx.stroke()
  }

  // 내 위치: 시야 부채꼴(±35°, 26px) + 빛나는 점 + 흰 테두리
  const [ux, uy] = fr.dir(-Math.sin(me.yaw), Math.cos(me.yaw))
  const a = Math.atan2(uy, ux), half = (35 * Math.PI) / 180
  ctx.save()
  ctx.globalAlpha = 0.22
  ctx.fillStyle = MINI.me
  ctx.beginPath()
  ctx.moveTo(px, py)
  ctx.arc(px, py, 26, a - half, a + half)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
  ctx.save()
  ctx.shadowColor = MINI.me
  ctx.shadowBlur = 10
  ctx.fillStyle = MINI.me
  ctx.beginPath()
  ctx.arc(px, py, 4.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(px, py, 4.5, 0, Math.PI * 2)
  ctx.stroke()
  // 바라보는 쪽 작은 화살촉
  const nx = -uy, ny = ux
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.moveTo(px + ux * 11, py + uy * 11)
  ctx.lineTo(px + ux * 6 + nx * 3, py + uy * 6 + ny * 3)
  ctx.lineTo(px + ux * 6 - nx * 3, py + uy * 6 - ny * 3)
  ctx.closePath()
  ctx.fill()
}
