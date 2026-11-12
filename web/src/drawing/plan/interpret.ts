import { flatten } from '../dxf/flatten'
import { parseDxf } from '../dxf/parse'
import { buildPlan } from './buildPlan'
import { calibrate } from './transform'
import type { LayerRules, Plan, UnitName } from './types'

/** DXF 글자 → plan */
export function interpretDxf(text: string, opts: { rules?: LayerRules; unit?: UnitName } = {}): Plan {
  const doc = parseDxf(text)
  return buildPlan(doc, flatten(doc), opts)
}

/** 규칙을 바꿔 다시 해석: 예전 plan 의 단위·보정 배율·회전·반전 유지 */
export function reinterpretDxf(text: string, rules: LayerRules, old: Plan): Plan {
  const fresh = interpretDxf(text, { rules, unit: old.unit })
  const k = old.scale / fresh.scale
  const scaled = Math.abs(k - 1) > 1e-9 ? calibrate(fresh, 1, k) : fresh
  return { ...scaled, rotQ: old.rotQ, flip: old.flip }
}
