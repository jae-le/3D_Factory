import type { Placement, PlacementPatch } from './types'

export type Change =
  | { kind: 'add'; placement: Placement }
  | { kind: 'delete'; placement: Placement }
  | { kind: 'update'; id: number; before: PlacementPatch; after: PlacementPatch }
  | { kind: 'batch'; items: { id: number; before: PlacementPatch; after: PlacementPatch }[] } // 여러 개 정렬 등: 되돌리기 한 번

/** 이 화면 세션의 편집 기록 (되돌리기·다시 하기). 실제 요청은 호출자가 보냄 */
export class History {
  private done: Change[] = []
  private undone: Change[] = []
  private limit: number

  constructor(limit = 50) {
    this.limit = limit
  }

  push(c: Change): void {
    this.done.push(c)
    if (this.done.length > this.limit) this.done.shift()
    this.undone = []
  }

  undo(): Change | null {
    const c = this.done.pop() ?? null
    if (c) this.undone.push(c)
    return c
  }

  redo(): Change | null {
    const c = this.undone.pop() ?? null
    if (c) this.done.push(c)
    return c
  }

  remap(oldId: number, newId: number): void {
    const fix = (c: Change): Change =>
      c.kind === 'batch'
        ? { ...c, items: c.items.map((i) => (i.id === oldId ? { ...i, id: newId } : i)) }
        : c.kind === 'update'
          ? c.id === oldId
            ? { ...c, id: newId }
            : c
          : c.placement.id === oldId
            ? { ...c, placement: { ...c.placement, id: newId } }
            : c
    this.done = this.done.map(fix)
    this.undone = this.undone.map(fix)
  }

  clear(): void {
    this.done = []
    this.undone = []
  }

  get canUndo(): boolean {
    return this.done.length > 0
  }

  get canRedo(): boolean {
    return this.undone.length > 0
  }
}
