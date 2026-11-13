import type { Plan } from '../drawing/plan/types'
import { rectOf } from '../objects/grid'
import { planToWorld, type PlanFrame } from '../scene/coords'

/** 미니맵 캔버스 크기와 plan → 캔버스 변환 (3D 를 위에서 본 방향: 오른쪽 = 월드 +x, 위 = 월드 −z) */
export interface MiniFrame {
  width: number
  height: number
  at(x: number, y: number): [number, number]
  dir(dx: number, dy: number): [number, number] // plan 방향 → 캔버스 단위 방향
}
export type Mini2D = Pick<CanvasRenderingContext2D, 'clearRect' | 'beginPath' | 'moveTo' | 'lineTo' | 'closePath' | 'stroke' | 'fill' | 'strokeStyle' | 'fillStyle' | 'lineWidth'>
export interface MiniObject { x: number; y: number; rot: number; sizeX: number; sizeY: number }
export interface MiniMe { x: number; y: number; yaw: number }

const WALL = 'rgba(255,255,255,.6)'
const PARTITION = 'rgba(255,255,255,.35)'
const ZONE = 'rgba(76,217,123,.7)'
const OBJECT = 'rgba(180,195,205,.5)'
const ME = '#ff5544'

/** 폭 maxW(280) · 높이 = 도면(돌린) 비율. 높이가 maxH(200) 를 넘으면 높이 200 에 맞추고 폭을 줄임 */
export function miniFrame(f: PlanFrame, maxW = 280, maxH = 200, pad = 8): MiniFrame {
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

/** 참고 파일 drawMinimap: 외벽·가벽 선, 구역 테두리, 객체 사각형, 내 위치 빨간 삼각형 */
export function drawMinimap(ctx: Mini2D, fr: MiniFrame, plan: Pick<Plan, 'walls' | 'partitions' | 'zones'>, objects: MiniObject[], me: MiniMe): void {
  ctx.clearRect(0, 0, fr.width, fr.height)
  const poly = (pts: [number, number][], closed: boolean) => {
    pts.forEach(([x, y], i) => {
      const [u, v] = fr.at(x, y)
      if (i === 0) ctx.moveTo(u, v)
      else ctx.lineTo(u, v)
    })
    if (closed) ctx.closePath()
  }
  const lines = (list: { pts: [number, number][] }[], color: string, width: number) => {
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.beginPath()
    for (const l of list) poly(l.pts, false)
    ctx.stroke()
  }
  lines(plan.walls, WALL, 1.5)
  lines(plan.partitions, PARTITION, 1)
  ctx.strokeStyle = ZONE
  ctx.lineWidth = 1
  ctx.beginPath()
  for (const z of plan.zones) poly(z.poly, true)
  ctx.stroke()
  ctx.fillStyle = OBJECT
  ctx.beginPath()
  for (const o of objects) {
    const r = rectOf(o, o)
    poly(
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]): [number, number] => [r.x + r.ux * a * r.hl - r.uy * b * r.hw, r.y + r.uy * a * r.hl + r.ux * b * r.hw]),
      true,
    )
  }
  ctx.fill()
  // 내 위치: 앞 6px · 뒤 양옆 4px (참고 파일)
  const [px, py] = fr.at(me.x, me.y)
  const [ux, uy] = fr.dir(-Math.sin(me.yaw), Math.cos(me.yaw))
  const nx = -uy, ny = ux
  ctx.fillStyle = ME
  ctx.beginPath()
  ctx.moveTo(px + ux * 6, py + uy * 6)
  ctx.lineTo(px - ux * 4 + nx * 4, py - uy * 4 + ny * 4)
  ctx.lineTo(px - ux * 4 - nx * 4, py - uy * 4 - ny * 4)
  ctx.closePath()
  ctx.fill()
}
