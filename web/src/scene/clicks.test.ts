import { describe, expect, it } from 'vitest'
import { isPickClick } from './clicks'

const down = { x: 100, y: 100 }
const ev = (o: Partial<{ button: number; detail: number; clientX: number; clientY: number }> = {}) => ({ button: 0, detail: 1, clientX: 100, clientY: 100, ...o })

describe('isPickClick', () => {
  it('왼쪽 단일 클릭은 선택', () => expect(isPickClick(down, ev())).toBe(true))
  it('더블클릭(detail 2) 제외', () => expect(isPickClick(down, ev({ detail: 2 }))).toBe(false))
  it('오른쪽 버튼 제외', () => expect(isPickClick(down, ev({ button: 2 }))).toBe(false))
  it('6px 이동은 드래그', () => expect(isPickClick(down, ev({ clientX: 106 }))).toBe(false))
  it('누른 기록이 없으면 제외', () => expect(isPickClick(null, ev())).toBe(false))
})
