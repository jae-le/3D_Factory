import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { interpretDxf } from './plan/interpret'
import { readDxfFile } from './readDxfFile'

const SEED = resolve(process.cwd(), '../server/src/main/resources/seed')
const DXF = resolve(SEED, 'main_factory.dxf')
const JSON_PATH = resolve(SEED, 'main_factory.plan.json')

/** 서버에 넣은 기본 도면 plan 이 지금 해석기 결과와 같은지. 해석기를 바꿨으면 `npm run seed:plan` 으로 다시 만든다 */
describe('기본 도면(나셀 공장) plan', () => {
  const buf = readFileSync(DXF)
  const plan = interpretDxf(readDxfFile(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)))

  it('해석 결과가 공장 모양 (가벽·구역이 있음)', () => {
    expect(plan.unit).toBe('mm')
    expect(plan.bounds.w).toBeGreaterThan(150)
    expect(plan.bounds.w).toBeLessThan(200)
    expect(plan.walls.length).toBeGreaterThan(0)
    expect(plan.partitions.length).toBeGreaterThan(0)
    expect(plan.partitions.every((p) => p.h === 1.2 && p.t === 0.5)).toBe(true)
    expect(plan.zones.length).toBeGreaterThan(0)
    expect(plan.columns.length).toBeGreaterThan(0)
  })

  it('저장소의 main_factory.plan.json 과 같음', () => {
    const text = JSON.stringify(plan)
    if (process.env.UPDATE_SEED === '1' || !existsSync(JSON_PATH)) writeFileSync(JSON_PATH, text)
    expect(JSON.parse(readFileSync(JSON_PATH, 'utf8'))).toEqual(plan)
  })
})
