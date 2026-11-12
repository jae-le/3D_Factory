import { describe, expect, it } from 'vitest'
import { History } from './history'

const p = (id: number) => ({ id, name: `a${id}`, x: 0, y: 0, rot: 0 })

describe('되돌리기 기록', () => {
  it('되돌리기·다시 하기, 새 변경은 다시 하기 기록을 비움', () => {
    const h = new History()
    expect(h.canUndo).toBe(false)
    h.push({ kind: 'add', placement: p(1) })
    h.push({ kind: 'update', id: 1, before: { x: 0 }, after: { x: 5 } })
    expect(h.undo()).toMatchObject({ kind: 'update', before: { x: 0 } })
    expect(h.canRedo).toBe(true)
    expect(h.redo()).toMatchObject({ kind: 'update', after: { x: 5 } })
    h.undo()
    h.push({ kind: 'delete', placement: p(1) })
    expect(h.canRedo).toBe(false)
  })
  it('최대 개수를 넘으면 오래된 것부터 버림', () => {
    const h = new History(2)
    h.push({ kind: 'add', placement: p(1) })
    h.push({ kind: 'add', placement: p(2) })
    h.push({ kind: 'add', placement: p(3) })
    expect(h.undo()).toMatchObject({ placement: { id: 3 } })
    expect(h.undo()).toMatchObject({ placement: { id: 2 } })
    expect(h.undo()).toBeNull()
  })
  it('삭제를 되돌려 id 가 바뀌면 기록 안의 id 도 바꿈', () => {
    const h = new History()
    h.push({ kind: 'update', id: 7, before: { x: 0 }, after: { x: 1 } })
    h.push({ kind: 'delete', placement: p(7) })
    h.undo() // 호출자가 다시 만들고 새 id 99
    h.remap(7, 99)
    expect(h.undo()).toMatchObject({ kind: 'update', id: 99 })
    expect(h.redo()).toMatchObject({ kind: 'update', id: 99 })
    expect(h.redo()).toMatchObject({ kind: 'delete', placement: { id: 99 } })
  })
})
