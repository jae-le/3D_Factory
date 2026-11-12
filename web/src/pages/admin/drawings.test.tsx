import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../../api/types'
import { StaticAuth } from '../../auth/auth'
import { dxfText, line } from '../../drawing/dxf/testDxf'
import { interpretDxf } from '../../drawing/plan/interpret'
import { routes } from '../../routes'

const ADMIN: User = { id: 1, username: 'admin', displayName: '관리자', role: 'ADMIN', enabled: true, mustChangePassword: false, locked: false, createdAt: '2026-11-12T00:00:00Z' }
const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body, arrayBuffer: async () => new ArrayBuffer(0) })
const SRC = dxfText({ insunits: 4, ents: [line('WALL', 0, 0, 10000, 0), line('외곽', 0, 0, 0, 5000)] })
const PLAN = interpretDxf(SRC)
const LIST = [{ id: 1, name: '나셀 공장', sourceType: 'dxf', version: 2, createdBy: 'system', updatedAt: '2026-11-12T00:00:00Z', width: 10, height: 5 }]

function show(handler: (url: string, init?: RequestInit) => unknown) {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const r = handler(url, init)
    if (r) return r
    if (url === '/api/drawings') return json(200, LIST)
    if (url === '/api/drawings/1') return json(200, { ...LIST[0], createdAt: '', plan: PLAN, layerRules: {} })
    if (url === '/api/drawings/1/source') return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode(SRC).buffer }
    return json(200, [])
  })
  vi.stubGlobal('fetch', fetch)
  render(
    <StaticAuth user={ADMIN}>
      <RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/admin/drawings'] })} />
    </StaticAuth>,
  )
  return fetch
}

describe('관리자 › 도면 관리', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('목록 (크기·버전·등록자)', async () => {
    show(() => null)
    const row = (await screen.findByText('나셀 공장', { selector: 'td' })).closest('tr')!
    expect(within(row).getByText('10.0 × 5.0 m')).toBeInTheDocument()
    expect(within(row).getByText('2')).toBeInTheDocument()
    expect(within(row).getByText('system')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '도면 관리' })).toHaveAttribute('aria-current', 'page')
  })

  it('레이어 규칙: 역할을 바꾸면 원본을 다시 해석해 버전과 함께 저장', async () => {
    const fetch = show(() => null)
    fireEvent.click(await screen.findByRole('button', { name: '나셀 공장 레이어 규칙' }))
    const role = await screen.findByLabelText('외곽 역할')
    expect(role).toHaveValue('line')
    fireEvent.change(role, { target: { value: 'wall' } })
    expect(screen.getByLabelText('외곽 높이')).toHaveValue(8)
    fireEvent.click(screen.getByRole('button', { name: '저장 후 다시 해석' }))
    await waitFor(() => expect(fetch.mock.calls.some(([, i]) => (i as RequestInit | undefined)?.method === 'PUT')).toBe(true))
    const put = fetch.mock.calls.find(([, i]) => (i as RequestInit | undefined)?.method === 'PUT')!
    expect(put[0]).toBe('/api/drawings/1/plan')
    const body = JSON.parse(String((put[1] as RequestInit).body))
    expect(body.version).toBe(2)
    expect(body.layerRules['외곽']).toMatchObject({ role: 'wall' })
    expect(body.plan.walls).toHaveLength(2)
  })

  it('이름 바꾸기·삭제 (확인 후)', async () => {
    const fetch = show((_url, init) => {
      if (init?.method === 'PATCH') return json(200, { ...LIST[0], name: '1공장' })
      if (init?.method === 'DELETE') return { ok: true, status: 204, json: async () => undefined }
      return null
    })
    fireEvent.click(await screen.findByRole('button', { name: '나셀 공장 이름 바꾸기' }))
    fireEvent.change(screen.getByLabelText('새 이름'), { target: { value: '1공장' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/drawings/1', expect.objectContaining({ method: 'PATCH' })))
    fireEvent.click(await screen.findByRole('button', { name: '나셀 공장 삭제' }))
    expect(screen.getByText(/원본 파일까지 삭제됩니다/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '삭제' }))
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/drawings/1', expect.objectContaining({ method: 'DELETE' })))
  })

  it('이름 바꾸기 실패: 창을 열어 둔 채 창 안에 오류, 입력한 이름 유지', async () => {
    show((_url, init) => (init?.method === 'PATCH' ? json(409, { detail: '같은 이름의 도면이 있습니다.' }) : null))
    fireEvent.click(await screen.findByRole('button', { name: '나셀 공장 이름 바꾸기' }))
    fireEvent.change(screen.getByLabelText('새 이름'), { target: { value: '2공장' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    const dialog = screen.getByRole('dialog', { name: '이름 바꾸기' })
    expect(await within(dialog).findByText('같은 이름의 도면이 있습니다.')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('새 이름')).toHaveValue('2공장')
  })

  it('레이어 규칙: 외벽 높이가 0 이면 저장 못 함', async () => {
    show(() => null)
    fireEvent.click(await screen.findByRole('button', { name: '나셀 공장 레이어 규칙' }))
    const role = await screen.findByLabelText('외곽 역할')
    fireEvent.change(role, { target: { value: 'wall' } })
    const save = screen.getByRole('button', { name: '저장 후 다시 해석' })
    expect(save).toBeEnabled()
    fireEvent.change(screen.getByLabelText('외곽 높이'), { target: { value: '0' } })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText('외곽 높이'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('외곽 두께'), { target: { value: '' } })
    expect(save).toBeDisabled()
  })
})
