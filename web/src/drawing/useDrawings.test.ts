import { afterEach, describe, expect, it } from 'vitest'
import type { DrawingSummary } from '../api/types'
import { loadStored, pickDrawing, saveStored } from './useDrawings'

const d = (id: number): DrawingSummary => ({ id, name: `도면 ${id}`, sourceType: 'dxf', version: 1, createdBy: null, updatedAt: '2026-11-12T00:00:00Z', width: null, height: null, placements: 0 })

describe('도면 선택', () => {
  afterEach(() => localStorage.clear())

  it('기억한 도면이 목록에 있으면 그것, 없으면 첫 도면, 목록이 비면 null', () => {
    expect(pickDrawing([d(1), d(2)], 2)).toBe(2)
    expect(pickDrawing([d(1), d(2)], 9)).toBe(1)
    expect(pickDrawing([d(1), d(2)], null)).toBe(1)
    expect(pickDrawing([], 1)).toBeNull()
  })

  it('사용자별로 기억', () => {
    saveStored('kim', 2)
    expect(loadStored('kim')).toBe(2)
    expect(loadStored('lee')).toBeNull()
    expect(localStorage.getItem('f3d:drawing:kim')).toBe('2')
  })
})
