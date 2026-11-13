import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../api/types'
import { StaticAuth } from '../auth/auth'
import type { Live } from '../dashboard/useLive'
import { routes } from '../routes'

const live = vi.hoisted(() => ({ value: { conn: 'connecting', data: null } as unknown }))
vi.mock('../dashboard/useLive', () => ({ useLive: () => live.value }))
// 가짜 SceneHost — 페이지가 3D 에 무엇을 부르는지 확인
const fake = vi.hoisted(() => ({
  setInteractive: vi.fn(), setObjects: vi.fn(), setRings: vi.fn(), onFrame: vi.fn(), frameOverview: vi.fn(),
  objectTop: vi.fn(() => null), focusObject: vi.fn(), setSelected: vi.fn(), setEditing: vi.fn(), setPlacing: vi.fn(),
  setObjectEvents: vi.fn(), setGroundClick: vi.fn(), setMarkers: vi.fn(),
}))
function FakeView(p: { view: string; plan: unknown; onScene?: (s: unknown) => void }) {
  const { onScene } = p
  useEffect(() => {
    onScene?.(fake)
    return () => onScene?.(null)
  }, [onScene])
  return <div data-testid="factory-view" data-view={p.view}>{p.plan ? 'plan' : 'no plan'}</div>
}
vi.mock('../scene/FactoryView', () => ({ FactoryView: FakeView }))

const ADMIN: User = { id: 1, username: 'admin', displayName: '관리자', role: 'ADMIN', enabled: true, mustChangePassword: false, locked: false, createdAt: '' }
const VIEWER: User = { ...ADMIN, id: 2, username: 'lee', role: 'VIEWER' }
const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body })
const DRAWINGS = [
  { id: 1, name: '나셀 공장', sourceType: 'dxf', version: 1, createdBy: 'system', updatedAt: '', width: 160, height: 65.8, placements: 1 },
  { id: 2, name: '허브 공장', sourceType: 'dxf', version: 1, createdBy: 'system', updatedAt: '', width: 160, height: 65.8, placements: 0 },
]
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
    if (url === '/api/drawings/2') return json(200, { ...DRAWINGS[1], createdAt: '', plan: PLAN, layerRules: {} })
    if (url === '/api/drawings/2/placements') return json(200, [])
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
    vi.clearAllMocks()
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

  it('3D 는 보기 전용, 칩으로 초점·전체 보기, 도면을 바꾸면 링을 비움', async () => {
    live.value = liveOf([STATION])
    show(VIEWER, [{ id: 10, modelId: null, name: 'Main Station 1', x: 5, y: 5, rot: 0 }])
    const chip = await screen.findByRole('button', { name: /Main Station 1/ })
    expect(fake.setInteractive).toHaveBeenCalledWith(false)
    await waitFor(() => expect(fake.setRings).toHaveBeenLastCalledWith([expect.objectContaining({ id: 3, x: 5, y: 5, r: 2 * 0.62, strong: false })]))
    fireEvent.click(chip)
    expect(fake.focusObject).toHaveBeenCalledWith(10)
    expect(fake.setRings).toHaveBeenLastCalledWith([expect.objectContaining({ id: 3, strong: true })])
    fake.frameOverview.mockClear()
    fireEvent.click(chip)
    expect(fake.frameOverview).toHaveBeenCalledTimes(1)
    fireEvent.change(screen.getByRole('combobox', { name: '도면 선택' }), { target: { value: '2' } })
    await waitFor(() => expect(fake.setRings).toHaveBeenLastCalledWith([]))
    expect(screen.queryByRole('button', { name: /Main Station 1/ })).toBeNull()
  })

  it('도면이 없다고 닫히면 안내는 한 번, 다른 도면 고르기 안내', async () => {
    live.value = { conn: 'closed', data: null }
    show(VIEWER)
    expect(await screen.findByRole('alert')).toHaveTextContent('도면을 찾을 수 없습니다. 다른 도면을 고르세요.')
    expect(screen.getAllByText(/도면을 찾을 수 없습니다/)).toHaveLength(2) // 연결 표시 + 가운데 안내 (같은 문구 두 번 아님)
    expect(screen.getByText('도면을 찾을 수 없습니다', { exact: true })).toHaveAttribute('role', 'status')
  })

  it('연결 전에는 연결 중 표시', async () => {
    show(VIEWER)
    expect(await screen.findByText('연결 중…')).toBeInTheDocument()
  })
})
