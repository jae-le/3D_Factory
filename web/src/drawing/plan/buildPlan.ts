import { INSUNITS } from '../dxf/parse'
import type { DxfDoc, Flattened, PolyPrim, Pt, TextPrim } from '../dxf/types'
import { pointInPolygon, polygonArea } from './geometry'
import { ruleFor } from './rules'
import type { LayerRules, Plan, PlanLayer, UnitName } from './types'

const UNIT_SCALE: Record<UnitName, number> = { inch: 0.0254, feet: 0.3048, mm: 0.001, cm: 0.01, m: 1 }
const CODE_UNIT: Record<number, UnitName> = { 1: 'inch', 2: 'feet', 4: 'mm', 5: 'cm', 6: 'm' }
const r4 = (v: number) => Math.round(v * 1e4) / 1e4
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0')

/** DXF 해석 결과 + 레이어 규칙 → plan (좌표 m, 원점 = bbox 최소점) */
export function buildPlan(doc: DxfDoc, flat: Flattened, opts: { rules?: LayerRules; unit?: UnitName } = {}): Plan {
  const rules = opts.rules ?? {}
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const p of flat.prims)
    for (const [x, y] of p.kind === 'poly' ? p.pts : [[p.x, p.y] as Pt]) {
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  if (!Number.isFinite(x0)) { x0 = y0 = x1 = y1 = 0 }

  const code = Number(doc.header.$INSUNITS ?? 0)
  const known = CODE_UNIT[code] && INSUNITS[code]?.[1] != null ? CODE_UNIT[code] : null
  const unit: UnitName = opts.unit ?? known ?? (Math.max(x1 - x0, y1 - y0) > 2000 ? 'mm' : 'm')
  const s = UNIT_SCALE[unit]
  const P = ([x, y]: Pt): Pt => [r4((x - x0) * s), r4((y - y0) * s)]

  const byLayer = new Map<string, number>()
  for (const p of flat.prims) byLayer.set(p.layer, (byLayer.get(p.layer) ?? 0) + 1)
  const layers: PlanLayer[] = [...byLayer].map(([name, count]) => {
    const r = ruleFor(name, rules)
    return { name, color: hex(doc.layers[name]?.color ?? 0xffffff), count, role: r.role, height: r.height, thickness: r.thickness, visible: !doc.layers[name]?.off }
  })
  const L = new Map(layers.map((l) => [l.name, l]))
  const colorOf = (c: number | null) => (c == null ? null : hex(c))

  const polys = flat.prims.filter((p): p is PolyPrim => p.kind === 'poly')
  const texts = flat.prims.filter((p): p is TextPrim => p.kind === 'text')
  const plan: Plan = {
    format: 1, unit, scale: s, rotQ: 0, flip: 1,
    bounds: { w: r4((x1 - x0) * s), h: r4((y1 - y0) * s) },
    layers,
    lines: polys.map((p) => ({ layer: p.layer, pts: p.pts.map(P), closed: p.closed, color: colorOf(p.color) })),
    texts: texts.map((t) => {
      const [x, y] = P([t.x, t.y])
      return { layer: t.layer, x, y, h: r4(t.h * s), rot: t.rot, str: t.str, ha: t.ha, va: t.va, color: colorOf(t.color) }
    }),
    walls: [], partitions: [], columns: [], zones: [], objectHints: [],
    warnings: { unsupported: { ...flat.unsupported }, unitGuessed: !opts.unit && !known },
  }

  for (const p of polys) {
    const l = L.get(p.layer)!
    const pts = p.pts.map(P)
    if (l.role === 'wall' || l.role === 'partition') {
      const seq = p.closed ? [...pts, pts[0]] : pts
      if (seq.length < 2) continue
      const list = l.role === 'wall' ? plan.walls : plan.partitions
      list.push({ id: `${l.role === 'wall' ? 'w' : 'p'}${list.length + 1}`, pts: seq, h: l.height, t: l.thickness })
    } else if (l.role === 'column' && p.closed && pts.length >= 3) {
      const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1])
      const [ax, bx, ay, by] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
      plan.columns.push({ id: `c${plan.columns.length + 1}`, x: r4((ax + bx) / 2), y: r4((ay + by) / 2), w: r4(bx - ax), d: r4(by - ay), h: l.height })
    } else if (l.role === 'zone' && p.closed && pts.length >= 3 && polygonArea(pts) >= 1) {
      const inside = plan.texts.filter((t) => t.str.trim() && pointInPolygon([t.x, t.y], pts))
      const same = inside.filter((t) => t.layer === p.layer)
      const pick = (same.length ? same : inside).sort((a, b) => b.h - a.h)[0]
      plan.zones.push({ id: `z${plan.zones.length + 1}`, name: pick?.str.trim() ?? `구역 ${plan.zones.length + 1}`, poly: pts, color: colorOf(p.color) ?? l.color, stationId: null })
    }
  }
  for (const pr of flat.prims) {
    const l = L.get(pr.layer)!
    if (l.role !== 'object' || pr.kind === 'poly') continue
    const [x, y] = P([pr.x, pr.y])
    const label = pr.kind === 'text' ? pr.str.trim() : pr.block
    if (label) plan.objectHints.push({ id: `h${plan.objectHints.length + 1}`, label, x, y, rot: pr.rot })
  }
  return plan
}
