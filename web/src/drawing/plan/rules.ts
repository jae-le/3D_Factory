import type { LayerRule, LayerRules, Role } from './types'

const DEFAULTS: Record<Role, { height: number; thickness: number }> = {
  wall: { height: 8, thickness: 0.2 },
  partition: { height: 1.2, thickness: 0.5 },
  column: { height: 9.5, thickness: 0 },
  zone: { height: 0, thickness: 0 },
  object: { height: 0, thickness: 0 },
  line: { height: 0, thickness: 0 },
}

// 위에서부터 첫 일치 (가벽을 벽보다 먼저)
const PATTERNS: [RegExp, Role][] = [
  [/PARTITION|칸막이|가벽/, 'partition'],
  [/WALL|벽/, 'wall'],
  [/^COL|COLUMN|기둥/, 'column'],
  [/STATION|ZONE|구역|공정/, 'zone'],
  [/EQUIP|설비|OBJECT/, 'object'],
]

export function defaultRule(layerName: string): Required<LayerRule> {
  const n = layerName.toUpperCase()
  const role = PATTERNS.find(([re]) => re.test(n))?.[1] ?? 'line'
  return { role, ...DEFAULTS[role] }
}

/** 도면별 덮어쓰기 → 없으면 기본 규칙. 빠진 높이·두께는 그 역할의 기본값 */
export function ruleFor(layerName: string, rules: LayerRules): Required<LayerRule> {
  const r = rules[layerName]
  if (!r) return defaultRule(layerName)
  return { role: r.role, height: r.height ?? DEFAULTS[r.role].height, thickness: r.thickness ?? DEFAULTS[r.role].thickness }
}
