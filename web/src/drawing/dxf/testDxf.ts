/** 테스트용 ASCII DXF 문자열 만들기 (그룹코드/값 줄 쌍) */
export type Ent = { type: string; g: [number, string | number][] }

function rec(type: string, g: [number, string | number][]): string[] {
  return ['0', type, ...g.flatMap(([c, v]) => [String(c), String(v)])]
}

export function dxfText(opts: {
  insunits?: number
  layers?: Record<string, number>
  blocks?: { name: string; bx?: number; by?: number; ents: Ent[] }[]
  ents: Ent[]
}): string {
  const out: string[] = []
  if (opts.insunits !== undefined) out.push('0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', String(opts.insunits), '0', 'ENDSEC')
  out.push('0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER')
  for (const [name, color] of Object.entries(opts.layers ?? {})) out.push(...rec('LAYER', [[2, name], [62, color]]))
  out.push('0', 'ENDTAB', '0', 'ENDSEC')
  out.push('0', 'SECTION', '2', 'BLOCKS')
  for (const b of opts.blocks ?? []) {
    out.push(...rec('BLOCK', [[2, b.name], [10, b.bx ?? 0], [20, b.by ?? 0]]))
    for (const e of b.ents) out.push(...rec(e.type, e.g))
    out.push('0', 'ENDBLK')
  }
  out.push('0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES')
  for (const e of opts.ents) out.push(...rec(e.type, e.g))
  out.push('0', 'ENDSEC', '0', 'EOF')
  return out.join('\n')
}

export const line = (layer: string, x1: number, y1: number, x2: number, y2: number): Ent => ({
  type: 'LINE', g: [[8, layer], [10, x1], [20, y1], [11, x2], [21, y2]],
})
export const rect = (layer: string, x: number, y: number, w: number, h: number): Ent => ({
  type: 'LWPOLYLINE', g: [[8, layer], [90, 4], [70, 1], [10, x], [20, y], [10, x + w], [20, y], [10, x + w], [20, y + h], [10, x], [20, y + h]],
})
export const text = (layer: string, x: number, y: number, h: number, str: string): Ent => ({
  type: 'TEXT', g: [[8, layer], [10, x], [20, y], [40, h], [1, str]],
})
