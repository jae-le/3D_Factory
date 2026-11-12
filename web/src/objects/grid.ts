/** 편집 격자 계산 (demo snapToCells·cellHits·rectsHit 이식, plan 좌표 m, 격자 원점 = plan 원점) */
export interface Rect { x: number; y: number; ux: number; uy: number; hl: number; hw: number }
export interface Cell { x: number; y: number; hit: boolean }

const EPS = 1e-3

export function cellSize(bounds: { w: number; h: number }): number {
  return Math.max(bounds.w, bounds.h) < 40 ? 0.5 : 1
}

export function rectOf(p: { x: number; y: number; rot: number }, size: { sizeX: number; sizeY: number }): Rect {
  const a = (p.rot * Math.PI) / 180
  return { x: p.x, y: p.y, ux: Math.cos(a), uy: Math.sin(a), hl: size.sizeX / 2, hw: size.sizeY / 2 }
}

/** 회전 사각형 바깥 상자 반폭 */
function extent(r: Rect): { ex: number; ey: number } {
  return { ex: Math.abs(r.ux) * r.hl + Math.abs(r.uy) * r.hw, ey: Math.abs(r.uy) * r.hl + Math.abs(r.ux) * r.hw }
}

/** 축 n 에 대한 사각형의 투영 반폭 */
function proj(r: Rect, nx: number, ny: number): number {
  return Math.abs(r.ux * nx + r.uy * ny) * r.hl + Math.abs(-r.uy * nx + r.ux * ny) * r.hw
}

export function rectsHit(a: Rect, b: Rect): boolean {
  const dx = b.x - a.x, dy = b.y - a.y
  for (const [nx, ny] of [[a.ux, a.uy], [-a.uy, a.ux], [b.ux, b.uy], [-b.uy, b.ux]]) {
    if (Math.abs(dx * nx + dy * ny) >= proj(a, nx, ny) + proj(b, nx, ny) - EPS) return false
  }
  return true
}

/** 칸 [x0, x0+c] × [y0, y0+c] 과 회전 사각형이 겹치는가 */
export function cellHits(r: Rect, x0: number, y0: number, c: number): boolean {
  const cell: Rect = { x: x0 + c / 2, y: y0 + c / 2, ux: 1, uy: 0, hl: c / 2, hw: c / 2 }
  return rectsHit(r, cell)
}

/** 바깥 상자 서쪽·남쪽 모서리를 격자선에 맞춘 중심 */
export function snapToCells(r: Rect, x: number, y: number, c: number): { x: number; y: number } {
  const { ex, ey } = extent(r)
  const s = (v: number, e: number) => Math.round(((v - e) / c) * 1e9) / 1e9
  return { x: Math.round(s(x, ex)) * c + ex, y: Math.round(s(y, ey)) * c + ey }
}

export function editCells(r: Rect, others: Rect[], c: number): Cell[] {
  const { ex, ey } = extent(r)
  const hitters = others.filter((o) => rectsHit(r, o))
  const out: Cell[] = []
  const i0 = Math.floor((r.x - ex) / c + EPS), i1 = Math.ceil((r.x + ex) / c - EPS)
  const j0 = Math.floor((r.y - ey) / c + EPS), j1 = Math.ceil((r.y + ey) / c - EPS)
  for (let i = i0; i < i1; i++)
    for (let j = j0; j < j1; j++) {
      const x0 = i * c, y0 = j * c
      if (!cellHits(r, x0, y0, c)) continue
      out.push({ x: x0, y: y0, hit: hitters.some((o) => cellHits(o, x0, y0, c)) })
    }
  return out
}

export function editTag(r: Rect, cells: Cell[], c: number): string {
  const parts: string[] = []
  const aligned = Math.abs(r.ux) < 1e-6 || Math.abs(r.uy) < 1e-6
  if (aligned && cells.length) {
    const xs = new Set(cells.map((k) => k.x)), ys = new Set(cells.map((k) => k.y))
    parts.push(`가로 ${xs.size} × 세로 ${ys.size}칸`)
  }
  parts.push(`총 ${cells.length}칸`)
  parts.push(`${(cells.length * c * c).toFixed(1)}㎡`)
  const hits = cells.filter((k) => k.hit).length
  if (hits) parts.push(`겹침 ${hits}칸`)
  return parts.join(' · ')
}
