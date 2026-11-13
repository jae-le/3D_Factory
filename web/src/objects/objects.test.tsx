import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ObjectInfo } from './ObjectInfo'
import { ObjectPanel } from './ObjectPanel'
import type { ModelInfo, Placement } from './types'

const m = (id: number, name: string, category: ModelInfo['category']): ModelInfo => ({
  id, name, category, sourceExt: 'glb', sizeX: 4, sizeY: 4, sizeZ: 3, aliases: [], version: 1, usedDrawings: 1, updatedAt: '',
})
const models = [m(1, '허브', 'mat'), m(2, '메인 조립 지그', 'equip')]
const placements: Placement[] = [
  { id: 10, modelId: 1, name: '허브 1', x: 1, y: 2, rot: 0 },
  { id: 11, modelId: 2, name: 'Main Station 1', x: 3, y: 4, rot: 90 },
  { id: 12, modelId: null, name: '표기 PUMP', x: 5, y: 6, rot: 0, hintLabel: 'PUMP' },
]

function panel(over: Partial<Parameters<typeof ObjectPanel>[0]> = {}) {
  const props = { open: true, models, placements, canEdit: true, selectedId: null, placingModelId: null, onPickModel: vi.fn(), onSelect: vi.fn(), onAddModel: vi.fn(), ...over }
  render(<ObjectPanel {...props} />)
  return props
}

describe('객체 패널', () => {
  it('분류 탭별 카드, 카드를 누르면 배치 모드 요청', () => {
    const p = panel()
    expect(screen.getByRole('tab', { name: '설비' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: '메인 조립 지그' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '허브' })).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: '자재' }))
    fireEvent.click(screen.getByRole('button', { name: '허브' }))
    expect(p.onPickModel).toHaveBeenCalledWith(models[0])
  })
  it('목록 검색·선택·모델 없음 표시', () => {
    const p = panel()
    const list = screen.getByRole('list', { name: '이 도면의 객체' })
    expect(within(list).getAllByRole('button')).toHaveLength(3)
    expect(within(list).getByText('모델 없음')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('객체 검색'), { target: { value: 'main' } })
    expect(within(list).getAllByRole('button')).toHaveLength(1)
    fireEvent.click(within(list).getByRole('button', { name: /Main Station 1/ }))
    expect(p.onSelect).toHaveBeenCalledWith(11)
  })
  it('조회 권한은 객체 추가 버튼 없음', () => {
    panel({ canEdit: false })
    expect(screen.queryByRole('button', { name: /객체 추가/ })).toBeNull()
  })
})

describe('객체 정보 카드', () => {
  const base = { model: models[0], models, canEdit: true, editing: false, onRename: vi.fn(), onEdit: vi.fn(), onRotate: vi.fn(), onDelete: vi.fn(), onAssign: vi.fn(), onClose: vi.fn() }
  it('이름 바꾸기(Enter)·편집·회전·삭제', () => {
    const p = { ...base, onRename: vi.fn(), onEdit: vi.fn(), onRotate: vi.fn(), onDelete: vi.fn() }
    render(<ObjectInfo {...p} placement={placements[0]} />)
    expect(screen.getByText('1.00, 2.00 m')).toBeInTheDocument()
    const name = screen.getByLabelText('객체 이름')
    fireEvent.change(name, { target: { value: '허브 A' } })
    fireEvent.keyDown(name, { key: 'Enter' })
    expect(p.onRename).toHaveBeenCalledWith('허브 A')
    fireEvent.click(screen.getByRole('button', { name: '편집' }))
    fireEvent.click(screen.getByRole('button', { name: /90° 회전/ }))
    fireEvent.click(screen.getByRole('button', { name: /삭제/ }))
    expect(p.onEdit).toHaveBeenCalled()
    expect(p.onRotate).toHaveBeenCalled()
    expect(p.onDelete).toHaveBeenCalled()
  })
  it('모델 없는 배치는 모델 지정, 조회 권한은 읽기만', () => {
    const p = { ...base, model: null, onAssign: vi.fn() }
    const { unmount } = render(<ObjectInfo {...p} placement={placements[2]} />)
    fireEvent.change(screen.getByLabelText('모델 지정'), { target: { value: '1' } })
    expect(p.onAssign).toHaveBeenCalledWith(1)
    unmount()
    render(<ObjectInfo {...base} canEdit={false} placement={placements[0]} />)
    expect(screen.queryByRole('button', { name: '편집' })).toBeNull()
    expect(screen.getByLabelText('객체 이름')).toHaveAttribute('readonly')
  })
})
