import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../api/types'
import { StaticAuth } from '../auth/auth'
import type { Live } from '../dashboard/useLive'
import { routes } from '../routes'
import type { CameraDriver } from '../scene/walkLook'

const live = vi.hoisted(() => ({ value: { conn: 'connecting', data: null } as unknown }))
vi.mock('../dashboard/useLive', () => ({ useLive: () => live.value }))
// 가짜 SceneHost — 페이지가 3D 에 무엇을 부르는지 확인
const fake = vi.hoisted(() => ({
  setInteractive: vi.fn(), setObjects: vi.fn(), setSelected: vi.fn(), frameOverview: vi.fn(), onFrame: vi.fn(),
  setCameraDriver: vi.fn(), setGhostWalls: vi.fn(), pickPlacement: vi.fn((): number | null => null),
  setRings: vi.fn(), objectTop: vi.fn(() => null), focusObject: vi.fn(), setEditing: vi.fn(), setPlacing: vi.fn(),
  setObjectEvents: vi.fn(), setGroundClick: vi.fn(), setMarkers: vi.fn(), worldOfPlan: vi.fn(), planOfWorld: vi.fn(),
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

const VIEWER: User = { id: 2, username: 'lee', displayName: '이', role: 'VIEWER', enabled: true, mustChangePassword: false, locked: false, createdAt: '' }
const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body })
const DRAWING = { id: 1, name: '나셀 공장', sourceType: 'dxf', version: 1, createdBy: 'system', updatedAt: '', width: 160, height: 65.8, placements: 2 }
const PLAN = { format: 1, unit: 'mm', scale: 0.001, rotQ: 0, flip: 1, bounds: { w: 160, h: 65.8 }, layers: [], lines: [], texts: [], walls: [], partitions: [], columns: [], zones: [], objectHints: [], warnings: { unsupported: {}, unitGuessed: false } }
const PLACEMENTS = [
  { id: 10, modelId: null, name: 'Main Station 1', x: 5, y: 5, rot: 0 },
  { id: 11, modelId: null, name: 'Box A', x: 150, y: 60, rot: 0 },
]
const KPI = { running: 1, ok: 1, warn: 0, bad: 0, doneToday: 0, planRate: 91, at: '2026-11-13T03:04:05Z' }
const STATION = { id: 3, no: 1, name: 'Main Station 1', placementName: 'Main Station 1', steps: ['a', 'b'], step: 1, actual: 20, target: 22, status: 'ok', projectId: null, unitNo: null }
const liveOf = (stations: unknown[]): Live =>
  ({ conn: 'live', data: { drawingId: 1, kpi: KPI, stations, projects: [], events: [], materials: [] } }) as unknown as Live

function show() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/drawings') return json(200, [DRAWING])
    if (url === '/api/drawings/1') return json(200, { ...DRAWING, createdAt: '', plan: PLAN, layerRules: {} })
    if (url === '/api/models') return json(200, [])
    if (url === '/api/drawings/1/placements') return json(200, PLACEMENTS)
    return json(404, { detail: '없음' })
  }))
  return render(
    <StaticAuth user={VIEWER}>
      <RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/walk'] })} />
    </StaticAuth>,
  )
}

/** 입장하기를 누르고 장면에 넘긴 카메라 드라이버를 돌려줌 */
async function enter(): Promise<CameraDriver> {
  const btn = await screen.findByRole('button', { name: '입장하기' })
  await waitFor(() => expect(btn).toBeEnabled())
  fireEvent.click(btn)
  await waitFor(() => expect(fake.setCameraDriver).toHaveBeenCalled())
  return fake.setCameraDriver.mock.calls.at(-1)![0] as CameraDriver
}

describe('체험 공간 화면', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
    live.value = { conn: 'connecting', data: null }
    vi.clearAllMocks()
    vi.restoreAllMocks()
    fake.pickPlacement.mockImplementation(() => null)
  })

  it('시작 화면 → 입장 → W 를 누르면 카메라 드라이버가 앞(+y)으로 옮김', async () => {
    show()
    expect(await screen.findByRole('heading', { name: '체험 공간' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '체험' })).toHaveAttribute('aria-current', 'page')
    expect(await screen.findByText('나셀 공장', { selector: '.sub' })).toBeInTheDocument()
    expect(screen.getByTestId('factory-view')).toHaveAttribute('data-view', '3d')
    await waitFor(() => expect(fake.setInteractive).toHaveBeenCalledWith(false))
    fireEvent.keyDown(window, { code: 'KeyM' }) // 입장 전에는 무시
    expect(fake.setGhostWalls).not.toHaveBeenCalledWith(true)
    const drv = await enter()
    expect(screen.queryByRole('heading', { name: '체험 공간' })).toBeNull()
    expect(screen.getByText('통로')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '미니맵' })).toBeInTheDocument()
    const a = drv.update(0.05).eye
    expect(a).toEqual({ x: 79.5, y: 32.5, h: 1.7 }) // 가운데에 가장 가까운 빈 칸
    fireEvent.keyDown(window, { code: 'KeyW' })
    let b = a
    for (let i = 0; i < 10; i++) b = drv.update(0.05).eye
    expect(b.x).toBeCloseTo(79.5)
    expect(b.y).toBeCloseTo(32.5 + 5.2 * 0.5)
    fireEvent.keyUp(window, { code: 'KeyW' })
    expect(drv.update(0.05).eye.y).toBeCloseTo(b.y)
  })

  it('M 조감 뷰 ↔ 걷기 (벽 반투명), 패널이 없을 때 Esc 는 시작 화면으로 (드라이버 해제)', async () => {
    show()
    await enter()
    fireEvent.keyDown(window, { code: 'KeyM' })
    expect(fake.setGhostWalls).toHaveBeenLastCalledWith(true)
    expect(screen.getByText(/^조감 뷰 —/)).toBeInTheDocument()
    fireEvent.keyDown(window, { code: 'KeyM' })
    expect(fake.setGhostWalls).toHaveBeenLastCalledWith(false)
    expect(screen.getByText(/^WASD 이동/)).toBeInTheDocument()
    fireEvent.keyDown(window, { code: 'Escape' })
    expect(await screen.findByRole('button', { name: '입장하기' })).toBeInTheDocument()
    expect(fake.setCameraDriver).toHaveBeenLastCalledWith(null)
  })

  it('짧은 클릭 → 상세 패널(같은 이름의 공정이면 실시간 상태), Esc 는 패널만 닫음', async () => {
    live.value = liveOf([STATION])
    fake.pickPlacement.mockImplementation(() => 10)
    show()
    await enter()
    const stage = document.querySelector('.walk-stage')!
    fireEvent.mouseDown(stage, { button: 0, clientX: 100, clientY: 100 })
    fireEvent.mouseUp(window, { button: 0, clientX: 102, clientY: 101 })
    expect(fake.pickPlacement).toHaveBeenCalledWith(102, 101, 18)
    const panel = screen.getByRole('complementary', { name: '상세정보' })
    expect(panel).toHaveTextContent('Main Station 1')
    expect(panel).toHaveTextContent('임시 상자')
    expect(panel).toHaveTextContent('진행중')
    expect(panel).toHaveTextContent('실적 20% · 목표 22%')
    expect(fake.setSelected).toHaveBeenLastCalledWith(10)
    fireEvent.keyDown(window, { code: 'Escape' })
    expect(screen.queryByRole('complementary', { name: '상세정보' })).toBeNull()
    expect(screen.queryByRole('button', { name: '입장하기' })).toBeNull()
    expect(fake.setSelected).toHaveBeenLastCalledWith(null)
  })

  it('가리키는 객체 이름표 → E 로 상세(공정 없으면 실시간 상태 없음), 다시 E 로 닫기, 끌기는 시점만 돌림', async () => {
    fake.pickPlacement.mockImplementation(() => 11)
    show()
    const drv = await enter()
    const stage = document.querySelector('.walk-stage')!
    vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({ x: 0, y: 40, width: 1024, height: 700 }))
    const frame = fake.onFrame.mock.calls.at(-1)![0] as () => void
    const frames = () =>
      act(() => {
        for (let i = 0; i < 6; i++) frame()
      })
    // 커서가 무대 밖(위쪽 막대)이면 고르지 않고 이름표 없음
    fireEvent.mouseMove(window, { clientX: 300, clientY: 20 })
    frames()
    expect(fake.pickPlacement).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /Box A/ })).toBeNull()
    fireEvent.mouseMove(window, { clientX: 300, clientY: 200 })
    frames()
    expect(fake.pickPlacement).toHaveBeenLastCalledWith(300, 200, 18)
    expect(screen.getByRole('button', { name: /Box A/ })).toHaveTextContent('클릭 또는 E — 상세정보')
    fireEvent.mouseMove(window, { clientX: 1100, clientY: 200 }) // 오른쪽 밖으로 나가면 지움
    frames()
    expect(screen.queryByRole('button', { name: /Box A/ })).toBeNull()
    fireEvent.mouseMove(window, { clientX: 300, clientY: 200 })
    frames()
    fireEvent.keyDown(window, { code: 'KeyE' })
    expect(screen.getByRole('complementary', { name: '상세정보' })).toHaveTextContent('실시간 상태 없음')
    fireEvent.keyDown(window, { code: 'KeyE' })
    expect(screen.queryByRole('complementary', { name: '상세정보' })).toBeNull()
    fake.pickPlacement.mockClear()
    fireEvent.mouseDown(stage, { button: 0, clientX: 100, clientY: 100 })
    fireEvent.mouseMove(window, { clientX: 200, clientY: 100 })
    fireEvent.mouseUp(window, { clientX: 200, clientY: 100 })
    expect(fake.pickPlacement).not.toHaveBeenCalled()
    const p = drv.update(0.05)
    expect(p.look.x - p.eye.x).toBeCloseTo(Math.sin(0.45))
  })

  it('입력칸(도면 선택)에 포커스가 있으면 키를 무시', async () => {
    show()
    await enter()
    const sel = screen.getByRole('combobox', { name: '도면 선택' })
    sel.focus()
    fireEvent.keyDown(sel, { code: 'KeyM' })
    expect(fake.setGhostWalls).not.toHaveBeenCalledWith(true)
  })

  it('창을 떠나거나 탭이 숨으면 누른 키를 비우고, 화면을 떠나면 드라이버 해제·벽 원래대로', async () => {
    const { unmount } = show()
    const drv = await enter()
    const y0 = drv.update(0.05).eye.y
    fireEvent.keyDown(window, { code: 'KeyW' })
    fireEvent.blur(window)
    expect(drv.update(0.05).eye.y).toBeCloseTo(y0)
    fireEvent.keyDown(window, { code: 'KeyW' })
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    fireEvent(document, new Event('visibilitychange'))
    expect(drv.update(0.05).eye.y).toBeCloseTo(y0)
    fireEvent.keyDown(window, { code: 'KeyM' })
    expect(fake.setGhostWalls).toHaveBeenLastCalledWith(true)
    unmount()
    expect(fake.setCameraDriver).toHaveBeenLastCalledWith(null)
    expect(fake.setGhostWalls).toHaveBeenLastCalledWith(false)
  })
})
