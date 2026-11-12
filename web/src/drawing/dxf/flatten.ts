import { aci, decodeText, grp, stripMText } from './parse'
import type { DxfDoc, DxfRecord, Flattened, Prim, Pt } from './types'

/* 엔티티 → 기본 도형(primitive)으로 평탄화. 2D 아핀행렬 [a,b,c,d,e,f]
 *   x' = a x + c y + e,  y' = b x + d y + f */
type M2 = [number, number, number, number, number, number]

const I2: M2 = [1, 0, 0, 1, 0, 0]
const mul = (m: M2, n: M2): M2 => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
]
const ap = (m: M2, x: number, y: number): Pt => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

function arcPts(cx: number, cy: number, r: number, a0: number, a1: number): Pt[] {
  const sweep = a1 - a0
  const n = Math.max(8, Math.ceil(Math.abs(sweep) / (Math.PI / 24)))
  const pts: Pt[] = []
  for (let k = 0; k <= n; k++) { const a = a0 + sweep * k / n; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]) }
  return pts
}

function bulgePts(x1: number, y1: number, x2: number, y2: number, b: number): Pt[] {
  const dx = x2 - x1
  const dy = y2 - y1
  const s = (1 - b * b) / (4 * b)
  const cx = (x1 + x2) / 2 - s * dy
  const cy = (y1 + y2) / 2 + s * dx
  const a0 = Math.atan2(y1 - cy, x1 - cx)
  return arcPts(cx, cy, Math.hypot(x1 - cx, y1 - cy), a0, a0 + 4 * Math.atan(b)).slice(1)
}

interface Vtx { x: number; y: number; b: number }

function vertexPts(v: Vtx[], closed: boolean): Pt[] {
  const pts: Pt[] = []
  v.forEach((p, idx) => {
    pts.push([p.x, p.y])
    const q = v[idx + 1] || (closed ? v[0] : null)
    if (q && p.b) pts.push(...bulgePts(p.x, p.y, q.x, q.y, p.b).slice(0, -1))
  })
  return pts
}

export function flatten(dxf: DxfDoc): Flattened {
  const prims: Prim[] = []
  const stats: Record<string, number> = {}
  const unsupported: Record<string, number> = {}
  const walk = (recs: DxfRecord[], M: M2, inhLayer: string | null, inhColor: number | null, depth: number) => {
    for (let k = 0; k < recs.length; k++) {
      const r = recs[k]
      const g = grp(r)
      if (g.get(67) === '1') continue // 도면공간(paper space) 엔티티 제외
      let layer = g.get(8, '0')
      if (layer === '0' && inhLayer) layer = inhLayer
      const ci = g.get(62)
      const tc = g.get(420)
      const color = tc != null ? +tc : ci == null || +ci === 256 ? null : +ci === 0 ? inhColor : aci(+ci)
      const ocs = g.get(230) === '-1' ? -1 : 1 // 압출방향 -Z 이면 X 반전
      const T = (pts: Pt[]): Pt[] => pts.map(([x, y]) => ap(M, x * ocs, y))
      const poly = (pts: Pt[], closed: boolean) => prims.push({ kind: 'poly', layer, color, pts: T(pts), closed })
      if (depth === 0) stats[r.type] = (stats[r.type] || 0) + 1
      switch (r.type) {
        case 'LINE': poly([[+g.get(10)!, +g.get(20)!], [+g.get(11)!, +g.get(21)!]], false); break
        case 'LWPOLYLINE': {
          const v: Vtx[] = []
          for (const [c, val] of r.g) {
            if (c === 10) v.push({ x: +val, y: 0, b: 0 })
            else if (c === 20 && v.length) v[v.length - 1].y = +val
            else if (c === 42 && v.length) v[v.length - 1].b = +val
          }
          const closed = (+g.get(70, 0) & 1) === 1
          poly(vertexPts(v, closed), closed)
          break
        }
        case 'POLYLINE': {
          const closed = (+g.get(70, 0) & 1) === 1
          const v: Vtx[] = []
          while (recs[k + 1] && recs[k + 1].type === 'VERTEX') {
            const vg = grp(recs[++k])
            v.push({ x: +vg.get(10)!, y: +vg.get(20)!, b: +vg.get(42, 0) })
          }
          if (recs[k + 1] && recs[k + 1].type === 'SEQEND') k++
          poly(vertexPts(v, closed), closed)
          break
        }
        case 'CIRCLE': poly(arcPts(+g.get(10)!, +g.get(20)!, +g.get(40)!, 0, Math.PI * 2), true); break
        case 'ARC': {
          const a0 = +g.get(50)! * Math.PI / 180
          let a1 = +g.get(51)! * Math.PI / 180
          if (a1 <= a0) a1 += Math.PI * 2
          poly(arcPts(+g.get(10)!, +g.get(20)!, +g.get(40)!, a0, a1), false)
          break
        }
        case 'ELLIPSE': {
          const cx = +g.get(10)!, cy = +g.get(20)!, mx = +g.get(11)!, my = +g.get(21)!, ratio = +g.get(40, 1)
          const t0 = +g.get(41, 0)
          let t1 = +g.get(42, Math.PI * 2)
          if (t1 <= t0) t1 += Math.PI * 2
          const n = 64
          const pts: Pt[] = []
          for (let s = 0; s <= n; s++) {
            const t = t0 + (t1 - t0) * s / n
            pts.push([cx + mx * Math.cos(t) - my * ratio * Math.sin(t), cy + my * Math.cos(t) + mx * ratio * Math.sin(t)])
          }
          poly(pts, false)
          break
        }
        case 'SPLINE': {
          const fx = g.all(11), fy = g.all(21), cx = g.all(10), cy = g.all(20)
          const xs = fx.length > 1 ? fx : cx
          const ys = fx.length > 1 ? fy : cy // 맞춤점 우선, 없으면 제어점 근사
          poly(xs.map((x, j): Pt => [+x, +ys[j]]), false)
          break
        }
        case 'SOLID': case 'TRACE': {
          const q = ([[10, 20], [11, 21], [13, 23], [12, 22]] as const).map(([a, b]): Pt => [+g.get(a, 0), +g.get(b, 0)])
          poly(q, true)
          break
        }
        case 'TEXT': case 'MTEXT': case 'ATTRIB': {
          let str: string
          let x = +g.get(10)!, y = +g.get(20)!, ha = 0, va = 0, rot = +g.get(50, 0) * Math.PI / 180
          if (r.type === 'MTEXT') {
            str = stripMText(g.all(3).join('') + (g.get(1) || ''))
            const at = +g.get(71, 1)
            ha = (at - 1) % 3
            va = 3 - Math.floor((at - 1) / 3) // 위/중간/아래 → va 3/2/1
            if (g.get(11) != null) rot = Math.atan2(+g.get(21)!, +g.get(11)!)
          } else {
            str = decodeText(g.get(1) || '')
            const h72 = +g.get(72, 0), v73 = +g.get(73, 0)
            if ((h72 || v73) && g.get(11) != null) { x = +g.get(11)!; y = +g.get(21)! }
            ha = h72 === 1 || h72 === 4 ? 1 : h72 === 2 ? 2 : 0
            va = h72 === 4 ? 2 : v73
          }
          if (!str.trim()) break
          const [px, py] = ap(M, x * ocs, y)
          const sc = Math.hypot(M[0], M[1])
          const mrot = Math.atan2(M[1], M[0])
          prims.push({ kind: 'text', layer, color, x: px, y: py, h: +g.get(40, 1) * sc, rot: rot + mrot, str, ha: ha as 0 | 1 | 2, va: va as 0 | 1 | 2 | 3 })
          break
        }
        case 'INSERT': case 'DIMENSION': {
          if (r.type === 'INSERT') {
            const [ix, iy] = ap(M, +g.get(10, 0) * ocs, +g.get(20, 0))
            prims.push({ kind: 'insert', layer, color, block: g.get(2) ?? '', x: ix, y: iy, rot: +g.get(50, 0) * Math.PI / 180 + Math.atan2(M[1], M[0]) })
          }
          const blk = dxf.blocks[g.get(2) ?? '']
          if (!blk || depth > 8) break
          let BM: M2
          if (r.type === 'DIMENSION') BM = [1, 0, 0, 1, 0, 0] // 치수 익명블록은 WCS 좌표 그대로
          else {
            const sx = +g.get(41, 1), sy = +g.get(42, 1), rot = +g.get(50, 0) * Math.PI / 180
            const c = Math.cos(rot), s = Math.sin(rot)
            // 삽입점 이동 · 회전 · 배율 · 블록 기준점 보정 (OCS -Z 이면 마지막에 X 반전)
            BM = mul(mul([1, 0, 0, 1, +g.get(10, 0), +g.get(20, 0)], [c * sx, s * sx, -s * sy, c * sy, 0, 0]), [1, 0, 0, 1, -blk.bx, -blk.by])
            if (ocs < 0) BM = mul([-1, 0, 0, 1, 0, 0], BM)
          }
          walk(blk.recs, mul(M, BM), layer, color, depth + 1)
          break
        }
        case 'POINT': case 'VIEWPORT': case 'ATTDEF': case 'SEQEND': case 'VERTEX': break
        default: if (depth === 0) unsupported[r.type] = (unsupported[r.type] || 0) + 1
      }
    }
  }
  walk(dxf.entities, I2, null, null, 0)
  return { prims, stats, unsupported }
}
