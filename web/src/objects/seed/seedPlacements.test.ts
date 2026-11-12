import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { flatten } from '../../drawing/dxf/flatten'
import { parseDxf } from '../../drawing/dxf/parse'
import { bboxMin } from '../../drawing/plan/buildPlan'
import { readDxfFile } from '../../drawing/readDxfFile'
import { BUILTIN } from '../builtin/catalog'
import { nextName } from '../match'
import { PUTS, pxToMm } from './mainScenario'

const SEED = resolve(process.cwd(), '../server/src/main/resources/seed')
const OUT = resolve(SEED, 'main_factory.placements.json')
const r4 = (v: number) => Math.round(v * 1e4) / 1e4

function build() {
  const buf = readFileSync(resolve(SEED, 'main_factory.dxf'))
  const [x0, y0] = bboxMin(flatten(parseDxf(readDxfFile(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)))))
  const names = new Set<string>()
  return PUTS.map(([key, px, py, ang = 0, name]) => {
    const model = BUILTIN.find((b) => b.key === key)
    if (!model) throw new Error(`모르는 모델 ${key}`)
    const n = name ?? nextName(model.name, names)
    names.add(n)
    const [X, Y] = pxToMm(px, py)
    return { model: key, name: n, x: r4((X - x0) * 0.001), y: r4((Y - y0) * 0.001), rot: ang }
  })
}

/** 나셀 공장 기본 배치 79개. demo 표를 바꾸면 `npm run seed:placements` 로 다시 만든다 */
describe('나셀 공장 기본 배치', () => {
  const list = build()
  it('79개, 타입별 수, 이름 붙은 설비, 이름 중복 없음', () => {
    expect(list).toHaveLength(79)
    const count = (k: string) => list.filter((p) => p.model === k).length
    expect([count('pallet'), count('hub'), count('fixture'), count('longmat'), count('frameTable')]).toEqual([28, 13, 10, 7, 5])
    expect([count('jigMain'), count('jigSub'), count('ring'), count('tensioner'), count('jigHub'), count('mainframe')]).toEqual([4, 4, 4, 2, 1, 1])
    for (const n of ['Hub 조립장', 'Main Station 1', 'Main Station 2', 'Main Station 3', 'Sub_Main Frame 조립장', 'Sub_Yaw Bearing'])
      expect(list.map((p) => p.name)).toContain(n)
    expect(new Set(list.map((p) => p.name)).size).toBe(79)
  })
  it('모두 도면 안 (plan 0~167 × 0~88.5 m)', () => {
    for (const p of list) {
      expect(p.x).toBeGreaterThan(0)
      expect(p.x).toBeLessThan(167)
      expect(p.y).toBeGreaterThan(0)
      expect(p.y).toBeLessThan(88.5)
    }
  })
  it('저장소의 main_factory.placements.json 과 같음', () => {
    if (process.env.UPDATE_SEED === '1' || !existsSync(OUT)) writeFileSync(OUT, JSON.stringify(list, null, 1) + '\n')
    expect(JSON.parse(readFileSync(OUT, 'utf8'))).toEqual(list)
  })
})
