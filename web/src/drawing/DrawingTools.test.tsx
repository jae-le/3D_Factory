import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { GroundPick, PickSource } from '../scene/FactoryScene'
import { DrawingTools } from './DrawingTools'
import type { Plan } from './plan/types'

const plan: Plan = {
  format: 1, unit: 'mm', scale: 0.001, rotQ: 0, flip: 1, bounds: { w: 20, h: 10 },
  layers: [], lines: [{ layer: 'A', pts: [[0, 0], [20, 0]], closed: false, color: null }], texts: [],
  walls: [], partitions: [], columns: [], zones: [], objectHints: [], warnings: { unsupported: {}, unitGuessed: false },
}

function fakeScene() {
  let cb: ((p: GroundPick) => void) | null = null
  const s: PickSource & { click(x: number, y: number): void; markers: unknown[] } = {
    markers: [],
    setGroundClick: (f) => { cb = f },
    setMarkers: (pts) => { s.markers = pts },
    click: (x, y) => act(() => cb?.({ x, y })),
  }
  return s
}

describe('도면 도구', () => {
  it('도구가 켜지고 꺼지면 onToolChange 로 알림', () => {
    const onToolChange = vi.fn()
    render(<DrawingTools scene={fakeScene()} plan={plan} canEdit={false} onSave={vi.fn()} onToolChange={onToolChange} />)
    onToolChange.mockClear()
    fireEvent.click(screen.getByRole('button', { name: /거리 측정/ }))
    expect(onToolChange).toHaveBeenLastCalledWith(true)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onToolChange).toHaveBeenLastCalledWith(false)
  })

  it('거리 측정: 두 점 → 거리 표시, Esc 로 끝', () => {
    const s = fakeScene()
    render(<DrawingTools scene={s} plan={plan} canEdit={false} onSave={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /스케일 보정/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /거리 측정/ }))
    s.click(0, 0)
    s.click(3, 4)
    expect(screen.getByText('거리 5.00 m')).toBeInTheDocument()
    expect(s.markers).toEqual([[0, 0], [3, 4]])
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(s.markers).toEqual([])
    expect(screen.queryByText('거리 5.00 m')).toBeNull()
  })

  it('스케일 보정: 두 점(5m) 에 실제 10m → 2배로 저장', async () => {
    const s = fakeScene()
    const onSave = vi.fn(async () => {})
    render(<DrawingTools scene={s} plan={plan} canEdit onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: /스케일 보정/ }))
    s.click(0, 0)
    s.click(3, 4)
    fireEvent.change(await screen.findByLabelText('실제 거리 (m)'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: '적용' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const saved = (onSave.mock.calls[0] as unknown as [Plan])[0]
    expect(saved.bounds.w).toBeCloseTo(40)
    expect(saved.scale).toBeCloseTo(0.002)
  })

  it('보정 거리가 0 이하면 저장 안 함', async () => {
    const s = fakeScene()
    const onSave = vi.fn(async () => {})
    render(<DrawingTools scene={s} plan={plan} canEdit onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: /스케일 보정/ }))
    s.click(0, 0)
    s.click(3, 4)
    fireEvent.change(await screen.findByLabelText('실제 거리 (m)'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: '적용' }))
    expect(await screen.findByText('거리는 0보다 커야 합니다.')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('회전·반전은 바로 저장', async () => {
    const onSave = vi.fn(async () => {})
    render(<DrawingTools scene={fakeScene()} plan={plan} canEdit onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: /90° 회전/ }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect((onSave.mock.calls[0] as unknown as [Plan])[0].rotQ).toBe(1)
    await waitFor(() => expect(screen.getByRole('button', { name: /좌우 반전/ })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /좌우 반전/ }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2))
    expect((onSave.mock.calls[1] as unknown as [Plan])[0].flip).toBe(-1)
  })

  it('저장 중에는 회전·반전 막음 (연타해도 한 번만 저장)', async () => {
    let done = () => {}
    const onSave = vi.fn(() => new Promise<void>((r) => { done = r }))
    render(<DrawingTools scene={fakeScene()} plan={plan} canEdit onSave={onSave} />)
    const rot = screen.getByRole('button', { name: /90° 회전/ })
    fireEvent.click(rot)
    fireEvent.click(rot)
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(rot).toBeDisabled()
    expect(screen.getByRole('button', { name: /좌우 반전/ })).toBeDisabled()
    await act(async () => done())
    expect(rot).toBeEnabled()
  })
})
