import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useEffect } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../api/types'
import { StaticAuth } from '../auth/auth'
import { routes } from '../routes'

const fake = vi.hoisted(() => ({
  setObjects: vi.fn(), setSelected: vi.fn(), setEditing: vi.fn(), setPlacing: vi.fn(), setObjectEvents: vi.fn(), focusObject: vi.fn(),
  setGroundClick: vi.fn(), setMarkers: vi.fn(), setPreview: vi.fn(), highlightPreview: vi.fn(), focusPoint: vi.fn(),
}))
function FakeView(p: { plan: unknown; onScene?: (s: unknown) => void }) {
  const { onScene } = p
  useEffect(() => {
    onScene?.(fake)
    return () => onScene?.(null)
  }, [onScene])
  return <div data-testid="factory-view">{p.plan ? 'plan' : 'no plan'}</div>
}
vi.mock('../scene/FactoryView', () => ({ FactoryView: FakeView }))

const OPERATOR: User = { id: 1, username: 'kim', displayName: '김운전', role: 'OPERATOR', enabled: true, mustChangePassword: false, locked: false, createdAt: '' }
const VIEWER: User = { ...OPERATOR, id: 2, username: 'lee', role: 'VIEWER' }
const PLAN = { format: 1, unit: 'm', scale: 1, rotQ: 0, flip: 1, bounds: { w: 40, h: 20 }, layers: [], lines: [], texts: [], walls: [], partitions: [], columns: [], zones: [], objectHints: [], warnings: { unsupported: {}, unitGuessed: false } }
const DRAWING = { id: 1, name: '나셀 공장', sourceType: 'dxf', version: 1, createdBy: 'system', updatedAt: '', width: 40, height: 20, placements: 1 }
const MODELS = [{ id: 7, name: 'Main Station', category: 'equip', sourceExt: 'glb', sizeX: 4, sizeY: 3, sizeZ: 2.5, aliases: [], version: 1, usedDrawings: 1, updatedAt: '' }]
const PLACEMENTS = [{ id: 5, modelId: 7, name: 'Main Station 1', x: 10, y: 5, rot: 0 }]
const ITEM = {
  seq: 1, kind: 'placement.move', target: 'Main Station 1', targetKey: 'placement:5',
  before: { id: 5, name: 'Main Station 1', modelId: 7, x: 10, y: 5, rot: 0 }, after: { id: 5, name: 'Main Station 1', modelId: 7, x: 12, y: 5, rot: 0 },
  label: 'Main Station 1 이동 (10.0, 5.0) → (12.0, 5.0)',
}
const STREAM = `event:proposal\ndata:${JSON.stringify({ id: 'b1', items: [ITEM] })}\n\nevent:done\ndata:{"inputTokens":0,"outputTokens":0,"cacheReadTokens":0,"cacheWriteTokens":0,"costUsd":0}\n\n`
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function show(user: User, status: unknown = { enabled: true, reason: null }) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/ai/status') return json(200, status)
    if (url === '/api/drawings') return json(200, [DRAWING])
    if (url === '/api/drawings/1') return json(200, { ...DRAWING, createdAt: '', plan: PLAN, layerRules: {} })
    if (url === '/api/models') return json(200, MODELS)
    if (url === '/api/drawings/1/placements') return json(200, PLACEMENTS)
    if (url === '/api/ai/chat') return new Response(STREAM, { status: 200 })
    if (url.startsWith('/api/ai/chat/history')) return json(200, [])
    return new Response(null, { status: 204 })
  }))
  render(
    <StaticAuth user={user}>
      <RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/'] })} />
    </StaticAuth>,
  )
}

describe('3D 공장 화면 · AI 챗봇', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('레일 AI 챗봇 → 챗봇 패널(객체 패널은 접힘), 다시 누르면 닫힘', async () => {
    show(OPERATOR)
    await screen.findByText('plan')
    const btn = screen.getByRole('button', { name: 'AI 챗봇' })
    await waitFor(() => expect(btn).toBeEnabled())
    expect(screen.getByRole('complementary', { name: '객체 패널' })).toHaveAttribute('aria-hidden', 'false')
    fireEvent.click(btn)
    expect(screen.getByRole('complementary', { name: 'AI 챗봇' })).toHaveAttribute('aria-hidden', 'false')
    expect(screen.getByLabelText('객체 패널', { selector: 'aside' })).toHaveAttribute('aria-hidden', 'true')
    expect(btn).toHaveAttribute('aria-current', 'page')
    fireEvent.click(btn)
    expect(screen.getByLabelText('AI 챗봇', { selector: 'aside' })).toHaveAttribute('aria-hidden', 'true')
  })

  it('키가 없으면 버튼 꺼짐 + 이유', async () => {
    show(OPERATOR, { enabled: false, reason: 'no-key' })
    const btn = screen.getByRole('button', { name: 'AI 챗봇' })
    await waitFor(() => expect(btn).toHaveAttribute('title', 'AI 챗봇 — AI API 키가 등록되지 않았습니다 (관리자 › AI API 관리)'))
    expect(btn).toBeDisabled()
  })

  it('조회 권한은 꺼짐', async () => {
    show(VIEWER)
    const btn = screen.getByRole('button', { name: 'AI 챗봇' })
    await waitFor(() => expect(btn).toHaveAttribute('title', 'AI 챗봇 — 운전원 이상만 쓸 수 있습니다'))
    expect(btn).toBeDisabled()
  })

  it('제안이 오면 3D 유령 미리보기, 항목 클릭은 카메라 이동, 취소하면 미리보기 끝', async () => {
    localStorage.setItem('f3d:open-chat', '1') // 다른 화면에서 레일을 누르고 온 것
    show(OPERATOR)
    const panel = await screen.findByRole('complementary', { name: 'AI 챗봇' })
    await waitFor(() => expect(panel).toHaveAttribute('aria-hidden', 'false'))
    expect(localStorage.getItem('f3d:open-chat')).toBeNull()
    fireEvent.change(within(panel).getByLabelText('AI 에게 보낼 요청'), { target: { value: '옮겨줘' } })
    fireEvent.click(within(panel).getByRole('button', { name: '보내기' }))
    const card = await within(panel).findByRole('region', { name: '변경 제안' })
    await waitFor(() => expect(fake.setPreview).toHaveBeenLastCalledWith(expect.objectContaining({
      objects: [expect.objectContaining({ kind: 'move', at: { x: 12, y: 5, rot: 0 }, size: expect.objectContaining({ sizeX: 4 }) })],
    })))
    fireEvent.click(within(card).getByRole('button', { name: ITEM.label }))
    expect(fake.focusPoint).toHaveBeenCalledWith(12, 5)
    fireEvent.click(within(card).getByRole('button', { name: '취소' }))
    await waitFor(() => expect(fake.setPreview).toHaveBeenLastCalledWith(null))
  })
})
