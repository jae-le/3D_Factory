import type { DxfBlock, DxfDoc, DxfRecord } from './types'

/** ASCII DXF 해석 (그룹코드/값 쌍). demo/index.html 의 파서를 TypeScript 로 이식 */
export const INSUNITS: Record<number, [string, number | null]> = {
  0: ['단위 없음', null], 1: ['inch', 0.0254], 2: ['feet', 0.3048], 4: ['mm', 0.001], 5: ['cm', 0.01], 6: ['m', 1],
}

export function parseDxf(text: string): DxfDoc {
  const raw = text.split(/\r?\n/)
  const P: [number, string][] = []
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const c = parseInt(raw[i].trim(), 10)
    if (!Number.isNaN(c)) P.push([c, raw[i + 1]])
  }
  const out: DxfDoc = { header: {}, layers: {}, blocks: {}, entities: [] }
  let i = 0
  // 코드 0 단위로 레코드를 끊는다
  const readRecords = (endNames: string[]): DxfRecord[] => {
    const recs: DxfRecord[] = []
    while (i < P.length) {
      if (P[i][0] === 0 && endNames.includes(P[i][1].trim())) break
      if (P[i][0] === 0) {
        const rec: DxfRecord = { type: P[i][1].trim(), g: [] }
        i++
        while (i < P.length && P[i][0] !== 0) { rec.g.push(P[i]); i++ }
        recs.push(rec)
      } else i++
    }
    return recs
  }
  while (i < P.length) {
    if (P[i][0] === 0 && P[i][1].trim() === 'SECTION') {
      const name = P[i + 1][1].trim()
      i += 2
      if (name === 'HEADER') {
        let v: string | null = null
        while (i < P.length && !(P[i][0] === 0 && P[i][1].trim() === 'ENDSEC')) {
          if (P[i][0] === 9) v = P[i][1].trim()
          else if (v && !(v in out.header)) out.header[v] = P[i][1].trim()
          i++
        }
      } else if (name === 'TABLES') {
        for (const r of readRecords(['ENDSEC'])) {
          if (r.type === 'LAYER') {
            const g = grp(r)
            const c = +g.get(62, 7)
            const tc = g.get(420)
            out.layers[g.get(2) ?? ''] = { color: tc != null ? +tc : aci(Math.abs(c)), off: c < 0 }
          }
        }
      } else if (name === 'BLOCKS') {
        let cur: DxfBlock | null = null
        for (const r of readRecords(['ENDSEC'])) {
          if (r.type === 'BLOCK') {
            const g = grp(r)
            cur = { name: g.get(2) ?? '', bx: +g.get(10, 0), by: +g.get(20, 0), recs: [] }
            out.blocks[cur.name] = cur
          } else if (r.type === 'ENDBLK') cur = null
          else if (cur) cur.recs.push(r)
        }
      } else if (name === 'ENTITIES') {
        out.entities = readRecords(['ENDSEC'])
      } else readRecords(['ENDSEC'])
    } else i++
  }
  return out
}

export interface Grp {
  get(code: number): string | undefined
  get(code: number, def: string | number): string
  all(code: number): string[]
}

export function grp(rec: DxfRecord): Grp {
  function get(code: number, def?: string | number): string | undefined {
    for (const [c, v] of rec.g) if (c === code) return code === 1 || code === 3 ? v : v.trim()
    return def === undefined ? undefined : String(def)
  }
  return {
    get: get as Grp['get'],
    all(code: number) { return rec.g.filter((p) => p[0] === code).map((p) => p[1]) },
  }
}

// AutoCAD Color Index → RGB (1~9 표준색 + 10~249 근사 + 회색조)
export function aci(n: number): number {
  const std: Record<number, number> = { 1: 0xff0000, 2: 0xffff00, 3: 0x00ff00, 4: 0x00ffff, 5: 0x0000ff, 6: 0xff00ff, 7: 0xffffff, 8: 0x808080, 9: 0xc0c0c0 }
  if (std[n] != null) return std[n]
  if (n >= 250) return [0x333333, 0x505050, 0x696969, 0x828282, 0xbebebe, 0xffffff][n - 250]
  if (n >= 10) {
    const h = Math.floor((n - 10) / 10) * 15 / 360
    const k = n % 10
    const v = [1, 1, .8, .8, .6, .6, .5, .5, .3, .3][k]
    const s = k % 2 ? .5 : 1
    return hsv(h, s, v)
  }
  return 0xffffff
}

function hsv(h: number, s: number, v: number): number {
  const f = (n: number) => { const k = (n + h * 6) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)) }
  return (Math.round(f(5) * 255) << 16) | (Math.round(f(3) * 255) << 8) | Math.round(f(1) * 255)
}

export function decodeText(s: string): string {
  return s.replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±')
}

export function stripMText(s: string): string {
  return decodeText(s).replace(/\\P/g, '\n').replace(/\\[ACFHQTWfhcp][^;]*;/g, '')
    .replace(/\\S([^;]*);/g, '$1').replace(/\\[LlOoKk]/g, '').replace(/\\~/g, ' ').replace(/[{}]/g, '')
}
