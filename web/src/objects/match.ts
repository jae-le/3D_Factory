import type { ObjectHint } from '../drawing/plan/types'
import type { ModelInfo, NewPlacement } from './types'

export const norm = (s: string) => s.toUpperCase().replace(/\s+/g, '')

/** 도면 표기 글자 ↔ 모델 이름·별칭 (대소문자·공백 무시) */
export function matchModel(label: string, models: ModelInfo[]): ModelInfo | null {
  const k = norm(label)
  if (!k) return null
  return models.find((m) => norm(m.name) === k || m.aliases.some((a) => norm(a) === k)) ?? null
}

/** `<base> n` 중 비어 있는 가장 작은 n */
export function nextName(base: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  for (let n = 1; ; n++) if (!used.has(`${base} ${n}`)) return `${base} ${n}`
}

export function hintsToPlacements(hints: ObjectHint[], models: ModelInfo[], taken: Iterable<string>): { items: NewPlacement[]; unmatched: number } {
  const names = new Set(taken)
  const items: NewPlacement[] = []
  let unmatched = 0
  for (const h of hints) {
    const m = matchModel(h.label, models)
    let name: string
    if (m) name = nextName(m.name, names)
    else {
      unmatched++
      name = `표기 ${h.label}`
      for (let n = 2; names.has(name); n++) name = `표기 ${h.label} ${n}`
    }
    names.add(name)
    items.push({ modelId: m?.id ?? null, name, x: h.x, y: h.y, rot: Math.round(((h.rot * 180) / Math.PI) * 1e6) / 1e6, hintLabel: h.label })
  }
  return { items, unmatched }
}
