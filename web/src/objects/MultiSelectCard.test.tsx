import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MultiSelectCard } from './MultiSelectCard'

describe('여러 객체 선택 카드', () => {
  it('개수 · 정렬 버튼 · 간격은 3개부터', () => {
    const onAlign = vi.fn()
    const { rerender } = render(<MultiSelectCard names={['허브 1', '허브 2']} canEdit onAlign={onAlign} onClose={() => {}} />)
    expect(screen.getByText('2개 선택')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '왼쪽 맞춤' }))
    expect(onAlign).toHaveBeenCalledWith('left')
    expect(screen.getByRole('button', { name: '가로 간격 고르게' })).toBeDisabled()
    rerender(<MultiSelectCard names={['허브 1', '허브 2', '허브 3']} canEdit onAlign={onAlign} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '세로 간격 고르게' }))
    expect(onAlign).toHaveBeenLastCalledWith('vdist')
  })
  it('조회 권한은 정렬 버튼 없음', () => {
    render(<MultiSelectCard names={['a', 'b']} canEdit={false} onAlign={() => {}} onClose={() => {}} />)
    expect(screen.queryByRole('toolbar', { name: '정렬' })).toBeNull()
  })
})
