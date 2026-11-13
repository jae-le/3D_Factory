import type { Colliders, Rect, Seg } from './colliders'

type P = { x: number; y: number }
const EPS2 = 1e-12
const clamp = (v: number, lo: number, hi: number) => (hi < lo ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v)))

function nearestOnSeg(x: number, y: number, s: Seg): [number, number] {
  const [ax, ay] = s.a, [bx, by] = s.b
  const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy
  const t = l2 ? clamp(((x - ax) * vx + (y - ay) * vy) / l2, 0, 1) : 0
  return [ax + vx * t, ay + vy * t]
}

function toLocal(x: number, y: number, r: Rect): [number, number] {
  const c = Math.cos(r.rot), s = Math.sin(r.rot), ox = x - r.cx, oy = y - r.cy
  return [ox * c + oy * s, -ox * s + oy * c]
}

function fromLocal(lx: number, ly: number, r: Rect): P {
  const c = Math.cos(r.rot), s = Math.sin(r.rot)
  return { x: r.cx + lx * c - ly * s, y: r.cy + lx * s + ly * c }
}

/** 원(반지름 radius)과 두꺼운 선분: 겹치면 가장 가까운 점에서 바깥으로 */
function pushSeg(p: P, radius: number, s: Seg): P {
  const [qx, qy] = nearestOnSeg(p.x, p.y, s)
  const dx = p.x - qx, dy = p.y - qy, d2 = dx * dx + dy * dy, R = s.r + radius
  if (d2 >= R * R) return p
  if (d2 > EPS2) {
    const d = Math.sqrt(d2)
    return { x: qx + (dx / d) * R, y: qy + (dy / d) * R }
  }
  // 선 위에 정확히 있음: 선분의 왼쪽 법선으로
  const vx = s.b[0] - s.a[0], vy = s.b[1] - s.a[1], l = Math.hypot(vx, vy) || 1
  return { x: qx - (vy / l) * R, y: qy + (vx / l) * R }
}

/** 원과 회전 사각형 (참고 파일 collide 의 상자 분기를 회전 사각형으로) */
function pushRect(p: P, radius: number, r: Rect): P {
  const [lx, ly] = toLocal(p.x, p.y, r)
  const nx = clamp(lx, -r.hw, r.hw), ny = clamp(ly, -r.hh, r.hh)
  const dx = lx - nx, dy = ly - ny, d2 = dx * dx + dy * dy
  if (d2 >= radius * radius) return p
  if (d2 > EPS2) {
    const d = Math.sqrt(d2)
    return fromLocal(nx + (dx / d) * radius, ny + (dy / d) * radius, r)
  }
  // 사각형 안: 가장 가까운 면 밖으로
  const pen = [lx + r.hw, r.hw - lx, ly + r.hh, r.hh - ly]
  const i = pen.indexOf(Math.min(...pen))
  if (i === 0) return fromLocal(-r.hw - radius, ly, r)
  if (i === 1) return fromLocal(r.hw + radius, ly, r)
  if (i === 2) return fromLocal(lx, -r.hh - radius, r)
  return fromLocal(lx, r.hh + radius, r)
}

/** 몸(원)을 도면 경계 안으로, 선분·사각형 밖으로 (2회 반복 — 모서리에서 두 벽 모두) */
export function collide(p: P, radius: number, c: Colliders, b: { w: number; h: number }): P {
  const inside = (q: P): P => ({ x: clamp(q.x, radius, b.w - radius), y: clamp(q.y, radius, b.h - radius) })
  let q = inside(p)
  for (let it = 0; it < 2; it++) {
    for (const s of c.segs) q = pushSeg(q, radius, s)
    for (const r of c.rects) q = pushRect(q, radius, r)
  }
  return inside(q)
}

/** 점에서 가장 가까운 장애물 표면까지 거리 (m). 사각형 안이면 0, 장애물이 없으면 Infinity */
export function clearance(x: number, y: number, c: Colliders): number {
  let best = Infinity
  for (const s of c.segs) {
    const [qx, qy] = nearestOnSeg(x, y, s)
    best = Math.min(best, Math.hypot(x - qx, y - qy) - s.r)
  }
  for (const r of c.rects) {
    const [lx, ly] = toLocal(x, y, r)
    const dx = Math.max(Math.abs(lx) - r.hw, 0), dy = Math.max(Math.abs(ly) - r.hh, 0)
    best = Math.min(best, Math.hypot(dx, dy))
  }
  return best
}
