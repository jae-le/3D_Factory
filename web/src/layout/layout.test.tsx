import { fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../api/types'
import { StaticAuth } from '../auth/auth'
import { routes } from '../routes'

vi.mock('../scene/FactoryView', () => ({
  FactoryView: (p: { plan: { bounds: { w: number } } | null; view: string }) => (
    <div data-testid="factory-view" data-view={p.view}>{p.plan ? `plan ${p.plan.bounds.w}` : 'no plan'}</div>
  ),
}))

const base: User = {
  id: 1, username: 'kim', displayName: '김운전', role: 'OPERATOR', enabled: true,
  mustChangePassword: false, locked: false, createdAt: '2026-11-12T00:00:00Z',
}
const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body })
const drawings = [
  { id: 1, name: '나셀 공장', sourceType: 'dxf', version: 1, createdBy: 'system', updatedAt: '2026-11-12T00:00:00Z', width: 160, height: 65.8 },
  { id: 2, name: '2공장', sourceType: 'dxf', version: 3, createdBy: 'kim', updatedAt: '2026-11-12T00:00:00Z', width: 40, height: 20 },
]
const plan = (w: number) => ({ format: 1, unit: 'mm', scale: 0.001, rotQ: 0, flip: 1, bounds: { w, h: 10 }, layers: [], lines: [], texts: [], walls: [], partitions: [], columns: [], zones: [], objectHints: [], warnings: { unsupported: {}, unitGuessed: false } })

function show(user: User, list: unknown[] = drawings) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const m = /^\/api\/drawings\/(\d+)$/.exec(url)
    if (m) {
      const d = drawings.find((x) => x.id === Number(m[1]))!
      return json(200, { ...d, createdAt: d.updatedAt, plan: plan(d.width), layerRules: {} })
    }
    return json(200, list)
  }))
  render(
    <StaticAuth user={user}>
      <RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/'] })} />
    </StaticAuth>,
  )
}

describe('메인 레이아웃', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('도면 select: 기억한 도면을 3D 로 그리고, 바꾸면 기억', async () => {
    localStorage.setItem('f3d:drawing:kim', '2')
    show(base)
    const select = (await screen.findByRole('combobox', { name: '도면 선택' })) as HTMLSelectElement
    expect(await screen.findByText('plan 40')).toBeInTheDocument()
    expect(select.value).toBe('2')
    fireEvent.change(select, { target: { value: '1' } })
    expect(await screen.findByText('plan 160')).toBeInTheDocument()
    expect(localStorage.getItem('f3d:drawing:kim')).toBe('1')
    expect(screen.getByText('160.0 × 10.0 m')).toBeInTheDocument()
  })

  it('보기 전환은 기억됨', async () => {
    show(base)
    await screen.findByText('plan 160')
    fireEvent.click(screen.getByRole('button', { name: '도면 보기' }))
    expect(screen.getByTestId('factory-view')).toHaveAttribute('data-view', 'plan')
    expect(JSON.parse(localStorage.getItem('f3d:view')!)).toMatchObject({ mode: 'plan' })
  })

  it('도면이 없으면 안내', async () => {
    show(base, [])
    expect(await screen.findByText('등록된 도면이 없습니다')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '도면 선택' })).toBeDisabled()
  })

  it('도면 추가 버튼은 운전원 이상(켜짐), 관리자 메뉴는 관리자만', async () => {
    show(base)
    expect(await screen.findByRole('button', { name: /도면 추가/ })).toBeEnabled()
    expect(screen.queryByRole('button', { name: '관리자' })).toBeNull()
    expect(screen.getByRole('button', { name: /상황판/ })).toBeDisabled()
  })

  it('조회 권한은 도면 추가 버튼 없음', async () => {
    show({ ...base, role: 'VIEWER' })
    await screen.findByRole('combobox', { name: '도면 선택' })
    expect(screen.queryByRole('button', { name: /도면 추가/ })).toBeNull()
  })

  it('관리자는 관리자 메뉴가 보임', async () => {
    show({ ...base, role: 'ADMIN' })
    expect(await screen.findByRole('button', { name: '관리자' })).toBeInTheDocument()
  })
})
