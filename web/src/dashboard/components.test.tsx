import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EventTicker } from './EventTicker'
import { KpiBar } from './KpiBar'
import { LiveBadge } from './LiveBadge'
import { LiveDrawer } from './LiveDrawer'
import { StationChip } from './StationChip'
import type { LiveEvent, ProjectLive, StationLive } from './types'

const KPI = { running: 6, ok: 4, warn: 1, bad: 1, doneToday: 3, planRate: 87, at: '2026-11-13T03:04:05Z' }
const ev = (id: number, kind: LiveEvent['kind'], text: string, data: Record<string, unknown> = {}): LiveEvent => ({ id, at: '2026-11-13T03:04:05Z', kind, station: 'Main Station 2', text, data })
const STEPS = Array.from({ length: 12 }, (_, i) => `step ${i + 1}`)
const S: StationLive = { id: 3, no: 3, name: 'Main Station 2', placementName: 'Main Station 2', steps: STEPS, step: 8, actual: 60.4, target: 88, status: 'bad', projectId: 2, unitNo: 8 }
const P: ProjectLive = { id: 2, name: '서남해상', done: 7, total: 13, period: "'25.11~'26.06", state: 'run' }
const EVENTS = [
  ev(5, 'status_change', 'Main Station 2 제작 지연', { from: 'warn', to: 'bad' }),
  ev(4, 'step_start', 'Main Station 2 Cable 포설 시작'),
  ev(3, 'unit_done', 'Hub 조립장 1대 조립 완료'),
  ev(2, 'material_in', 'Main Frame 입고 → Main Station 1'),
  ev(1, 'move', 'Main Frame 운반 · 자재 랙 → Main Station 1'),
]

describe('KPI 줄', () => {
  it('가동·진행중·주의·지연·오늘 완료·달성률·시각', () => {
    render(<KpiBar kpi={KPI} />)
    const bar = screen.getByRole('group', { name: '공정 KPI' })
    for (const t of ['공정 상황판', '6가동', '4진행중', '1주의', '1지연', '3오늘 완료', '87%계획 달성률']) expect(bar).toHaveTextContent(t)
    expect(bar).toHaveTextContent(/\d{2}:04:05/)
  })
})

describe('스테이션 칩', () => {
  it('demo chipHtml 내용: 번호·이름·상태 / PJT #호기·제작 / step / 게이지·실적 / 목표·계획 대비', () => {
    render(<StationChip s={S} project={P} selected={false} onClick={vi.fn()} />)
    const chip = screen.getByRole('button', { name: /Main Station 2/ })
    expect(chip).toHaveClass('dlabel', 'bad')
    for (const t of ['3', '지연', '서남해상 #8', '· 제작 7/13', '8/12', 'step 8', '60%', '목표 88%', '계획 대비 -28%p'])
      expect(within(chip).getByText(t)).toBeInTheDocument()
    const bars = chip.querySelectorAll('.gauge i')
    expect(bars).toHaveLength(12)
    expect(chip.querySelectorAll('.gauge i.on')).toHaveLength(7)
    expect(bars[10]).toHaveClass('tg')
    expect(bars[7]).toHaveClass('cur')
  })
  it('누르면 onClick, 상태가 바뀔 때마다 한 번 반짝', () => {
    const onClick = vi.fn()
    const { rerender } = render(<StationChip s={S} project={P} selected={false} onClick={onClick} />)
    const chip = screen.getByRole('button', { name: /Main Station 2/ })
    fireEvent.click(chip)
    expect(onClick).toHaveBeenCalled()
    expect(chip.className).not.toMatch(/flash/)
    rerender(<StationChip s={{ ...S, status: 'warn' }} project={P} selected onClick={onClick} />)
    expect(chip).toHaveClass('warn', 'sel', 'flash-a')
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    rerender(<StationChip s={{ ...S, status: 'ok' }} project={P} selected onClick={onClick} />)
    expect(chip).toHaveClass('ok', 'flash-b')
  })
  it('PJT 가 없으면 PJT 줄 없음', () => {
    render(<StationChip s={{ ...S, projectId: null, unitNo: null }} selected={false} onClick={vi.fn()} />)
    expect(screen.queryByText(/제작 7\/13/)).toBeNull()
  })
})

describe('이벤트 줄', () => {
  it('최근 3개(step 제외), 첫 개만 진하게, 서랍 버튼', () => {
    const onToggle = vi.fn()
    render(<EventTicker events={EVENTS} drawerOpen={false} onToggle={onToggle} />)
    const items = within(screen.getByRole('list', { name: '최근 이벤트' })).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('Main Station 2 제작 지연')
    expect(items[0]).not.toHaveClass('old')
    expect(items[1]).toHaveClass('old')
    expect(items[2]).toHaveTextContent('Main Frame 입고 → Main Station 1')
    const btn = screen.getByRole('button', { name: /제작·자재 현황/ })
    expect(btn).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(btn)
    expect(onToggle).toHaveBeenCalled()
  })
  it('이벤트가 없으면 안내', () => {
    render(<EventTicker events={[]} drawerOpen={false} onToggle={vi.fn()} />)
    expect(screen.getByText('이벤트 없음')).toBeInTheDocument()
  })
})

describe('제작·자재 서랍', () => {
  it('제작 현황 표·자재 입고·이벤트(step 제외)·닫기', () => {
    const onClose = vi.fn()
    const projects: ProjectLive[] = [P, { id: 4, name: '다대포', done: 0, total: 8, period: "'26.05~'26.12", state: 'wait' }]
    render(<LiveDrawer projects={projects} materials={[EVENTS[3]]} events={EVENTS} onClose={onClose} />)
    const drawer = screen.getByRole('complementary', { name: '제작·자재 현황' })
    expect(drawer.querySelectorAll('tbody tr')).toHaveLength(2)
    for (const t of ['서남해상', '7/13', "'25.11~'26.06", '진행', '다대포', '대기']) expect(within(drawer).getByText(t)).toBeInTheDocument()
    expect(within(drawer).getAllByText('Main Frame 입고 → Main Station 1')).toHaveLength(2) // 자재 입고 + 이벤트
    expect(within(drawer).queryByText('Main Station 2 Cable 포설 시작')).toBeNull()
    fireEvent.click(within(drawer).getByRole('button', { name: '서랍 닫기' }))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('연결 표시', () => {
  it('연결 상태별 문구', () => {
    const { rerender } = render(<LiveBadge conn="connecting" />)
    expect(screen.getByRole('status')).toHaveTextContent('연결 중…')
    rerender(<LiveBadge conn="live" />)
    expect(screen.getByRole('status')).toHaveTextContent('LIVE · 가상 데이터')
    rerender(<LiveBadge conn="retrying" />)
    expect(screen.getByRole('status')).toHaveTextContent('재연결 중…')
    expect(screen.getByRole('status')).toHaveClass('retrying')
    rerender(<LiveBadge conn="closed" />)
    expect(screen.getByRole('status')).toHaveTextContent('도면을 찾을 수 없습니다')
    expect(screen.getByRole('status')).toHaveClass('closed')
  })
})
