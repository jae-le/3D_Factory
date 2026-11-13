import { fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../api/types'
import { StaticAuth } from '../auth/auth'
import type { Live } from '../dashboard/useLive'
import { routes } from '../routes'

const live = vi.hoisted(() => ({ value: { conn: 'connecting', data: null } as unknown }))
vi.mock('../dashboard/useLive', () => ({ useLive: () => live.value }))
vi.mock('../scene/FactoryView', () => ({
  FactoryView: (p: { view: string; plan: unknown }) => <div data-testid="factory-view" data-view={p.view}>{p.plan ? 'plan' : 'no plan'}</div>,
}))

const ADMIN: User = { id: 1, username: 'admin', displayName: '관리자', role: 'ADMIN', enabled: true, mustChangePassword: false, locked: false, createdAt: '' }
const VIEWER: User = { ...ADMIN, id: 2, username: 'lee', role: 'VIEWER' }
const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body })
const DRAWINGS = [{ id: 1, name: '나셀 공장', sourceType: 'dxf', version: 1, createdBy: 'system', updatedAt: '', width: 160, height: 65.8, placements: 1 }]
const PLAN = { format: 1, unit: 'mm', scale: 0.001, rotQ: 0, flip: 1, bounds: { w: 160, h: 65.8 }, layers: [], lines: [], texts: [], walls: [], partitions: [], columns: [], zones: [], objectHints: [], warnings: { unsupported: {}, unitGuessed: false } }
const KPI = { running: 1, ok: 1, warn: 0, bad: 0, doneToday: 2, planRate: 91, at: '2026-11-13T03:04:05Z' }
const STATION = { id: 3, no: 1, name: 'Main Station 1', placementName: 'Main Station 1', steps: ['a', 'b'], step: 1, actual: 20, target: 22, status: 'ok', projectId: null, unitNo: null }
const liveOf = (stations: unknown[]): Live => ({
  conn: 'live',
  data: { drawingId: 1, kpi: KPI, stations, projects: [], events: [{ id: 9, at: KPI.at, kind: 'unit_done', station: 'Main Station 1', text: 'Main Station 1 1대 조립 완료', data: {} }], materials: [] },
} as unknown as Live)

function show(user: User, placements: unknown[] = []) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/drawings') return json(200, DRAWINGS)
    if (url === '/api/drawings/1') return json(200, { ...DRAWINGS[0], createdAt: '', plan: PLAN, layerRules: {} })
    if (url === '/api/models') return json(200, [])
    if (url === '/api/drawings/1/placements') return json(200, placements)
    return json(404, { detail: '없음' })
  }))
  render(
    <StaticAuth user={user}>
      <RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/dashboard'] })} />
    </StaticAuth>,
  )
}

describe('상황판 화면', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
    live.value = { conn: 'connecting', data: null }
  })

  it('공정이 없는 도면은 안내, 관리자에게만 기준정보 설정 링크', async () => {
    live.value = liveOf([])
    show(ADMIN)
    expect(await screen.findByText('이 도면에는 공정 기준정보가 없습니다')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '기준정보 설정' })).toHaveAttribute('href', '/admin/stations?drawing=1')
    expect(screen.queryByRole('group', { name: '공정 KPI' })).toBeNull()
    expect(screen.getByTestId('factory-view')).toHaveAttribute('data-view', '3d')
    expect(screen.getByRole('button', { name: '상황판' })).toHaveAttribute('aria-current', 'page')
  })

  it('조회 권한은 링크 없이 안내만', async () => {
    live.value = liveOf([])
    show(VIEWER)
    expect(await screen.findByText('이 도면에는 공정 기준정보가 없습니다')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '기준정보 설정' })).toBeNull()
  })

  it('공정이 있으면 KPI·칩·이벤트 줄·연결 표시, 서랍 열고 닫기', async () => {
    live.value = liveOf([STATION])
    show(VIEWER, [{ id: 10, modelId: null, name: 'Main Station 1', x: 5, y: 5, rot: 0 }])
    expect(await screen.findByRole('button', { name: /Main Station 1/ })).toHaveClass('dlabel', 'ok')
    expect(screen.getByRole('group', { name: '공정 KPI' })).toHaveTextContent('1가동')
    expect(screen.getByText('LIVE · 가상 데이터')).toBeInTheDocument()
    expect(screen.getByText('Main Station 1 1대 조립 완료')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /추가/ })).toBeNull() // 도면 추가 버튼 없음
    fireEvent.click(screen.getByRole('button', { name: /제작·자재 현황/ }))
    expect(screen.getByRole('complementary', { name: '제작·자재 현황' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '서랍 닫기' }))
    expect(screen.queryByRole('complementary', { name: '제작·자재 현황' })).toBeNull()
  })

  it('연결 전에는 연결 중 표시', async () => {
    show(VIEWER)
    expect(await screen.findByText('연결 중…')).toBeInTheDocument()
  })
})
