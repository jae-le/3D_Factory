import { describe, expect, it } from 'vitest'
import { focusOf, previewOf } from './preview'
import type { ProposalItem } from './types'

const box = { sizeX: 2, sizeY: 2, sizeZ: 2 }
const sizeOf = (id: number | null | undefined) => (id === 7 ? { sizeX: 4, sizeY: 3, sizeZ: 2.5 } : box)
const snap = (x: number, y: number, rot = 0, name = 'A') => ({ id: 1, name, modelId: 7, x, y, rot })
const item = (seq: number, kind: ProposalItem['kind'], before: unknown, after: unknown): ProposalItem =>
  ({ seq, kind, target: 'A', targetKey: `k${seq}`, before, after, label: '' })

describe('미리보기 계산', () => {
  it('옮김·회전·변경 = 파란 유령 + 원래 자리, 추가 = 초록, 삭제 = 빨강, 이름만 바꿈·공정·구역 = 유령 없음', () => {
    const p = previewOf([
      item(1, 'placement.move', snap(1, 1), snap(3, 1)),
      item(2, 'placement.rotate', snap(5, 5), snap(5, 5, 90)),
      item(3, 'placement.add', null, { name: 'B', modelId: null, x: 8, y: 2, rot: 0 }),
      item(4, 'placement.delete', snap(9, 9), null),
      item(5, 'placement.rename', snap(1, 1), snap(1, 1, 0, 'Z')),
      item(6, 'station.update', { name: 'S' }, { name: 'S' }),
      item(7, 'plan.zone.rename', { id: 'z1', name: 'a' }, { id: 'z1', name: 'b' }),
    ], sizeOf)
    expect(p.objects).toEqual([
      { seq: 1, kind: 'move', at: { x: 3, y: 1, rot: 0 }, from: { x: 1, y: 1, rot: 0 }, size: { sizeX: 4, sizeY: 3, sizeZ: 2.5 } },
      { seq: 2, kind: 'move', at: { x: 5, y: 5, rot: 90 }, from: { x: 5, y: 5, rot: 0 }, size: { sizeX: 4, sizeY: 3, sizeZ: 2.5 } },
      { seq: 3, kind: 'add', at: { x: 8, y: 2, rot: 0 }, from: null, size: box },
      { seq: 4, kind: 'delete', at: { x: 9, y: 9, rot: 0 }, from: null, size: { sizeX: 4, sizeY: 3, sizeZ: 2.5 } },
    ])
    expect(p.walls).toEqual([])
  })

  it('가벽 추가·삭제는 첫·끝 점', () => {
    const p = previewOf([
      item(1, 'plan.partition.add', null, { id: 'p2', pts: [[0, 0], [4, 0]], h: 1.2, t: 0.5 }),
      item(2, 'plan.partition.delete', { id: 'p1', pts: [[1, 1], [1, 3], [1, 6]], h: 2, t: 0.3 }, null),
    ], sizeOf)
    expect(p.walls).toEqual([
      { seq: 1, kind: 'add', a: [0, 0], b: [4, 0], h: 1.2, t: 0.5 },
      { seq: 2, kind: 'delete', a: [1, 1], b: [1, 6], h: 2, t: 0.3 },
    ])
  })

  it('항목의 카메라 자리', () => {
    expect(focusOf(item(1, 'placement.move', snap(1, 1), snap(3, 1)))).toEqual({ x: 3, y: 1 })
    expect(focusOf(item(2, 'placement.delete', snap(9, 9), null))).toEqual({ x: 9, y: 9 })
    expect(focusOf(item(3, 'plan.partition.add', null, { id: 'p2', pts: [[0, 0], [4, 2]], h: 1, t: 1 }))).toEqual({ x: 2, y: 1 })
    expect(focusOf(item(4, 'station.update', {}, {}))).toBeNull()
  })
})
