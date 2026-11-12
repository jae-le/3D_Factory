import { describe, expect, it } from 'vitest'
import { hintsToPlacements, matchModel, nextName, norm } from './match'
import type { ModelInfo } from './types'

const m = (id: number, name: string, aliases: string[] = []): ModelInfo => ({
  id, name, category: 'mat', sourceExt: 'glb', sizeX: 1, sizeY: 1, sizeZ: 1, aliases, version: 1, usedDrawings: 0, updatedAt: '',
})
const models = [m(1, '허브', ['HUB']), m(2, '베어링 링', ['RING', 'BEARING']), m(3, '메인 프레임', ['MAIN FRAME'])]

describe('별칭 매칭 · 이름', () => {
  it('대소문자·공백 무시, 모델 이름도 별칭', () => {
    expect(norm(' Main  Frame ')).toBe('MAINFRAME')
    expect(matchModel('hub', models)?.id).toBe(1)
    expect(matchModel('베어링링', models)?.id).toBe(2)
    expect(matchModel('mainframe', models)?.id).toBe(3)
    expect(matchModel('PUMP', models)).toBeNull()
  })
  it('다음 이름: 비어 있는 가장 작은 번호', () => {
    expect(nextName('허브', [])).toBe('허브 1')
    expect(nextName('허브', ['허브 1', '허브 3'])).toBe('허브 2')
  })
  it('도면 표기 → 배치 (회전은 라디안→도, 미매칭은 임시 상자)', () => {
    const r = hintsToPlacements(
      [
        { id: 'h1', label: 'HUB', x: 1, y: 2, rot: Math.PI / 2 },
        { id: 'h2', label: 'hub', x: 3, y: 4, rot: 0 },
        { id: 'h3', label: 'PUMP', x: 5, y: 6, rot: 0 },
      ],
      models,
      ['허브 1'],
    )
    expect(r.unmatched).toBe(1)
    expect(r.items).toEqual([
      { modelId: 1, name: '허브 2', x: 1, y: 2, rot: 90, hintLabel: 'HUB' },
      { modelId: 1, name: '허브 3', x: 3, y: 4, rot: 0, hintLabel: 'hub' },
      { modelId: null, name: '표기 PUMP', x: 5, y: 6, rot: 0, hintLabel: 'PUMP' },
    ])
  })
})
