import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../../api/types'
import { StaticAuth } from '../../auth/auth'
import { routes } from '../../routes'

const ADMIN: User = { id: 1, username: 'admin', displayName: '관리자', role: 'ADMIN', enabled: true, mustChangePassword: false, locked: false, createdAt: '' }
const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body })
const LIST = [
  { id: 1, name: '허브', category: 'mat', sourceExt: 'glb', sizeX: 4, sizeY: 4, sizeZ: 3.2, aliases: ['HUB'], version: 1, usedDrawings: 2, updatedAt: '2026-11-12T00:00:00Z' },
  { id: 2, name: '펌프', category: 'equip', sourceExt: 'obj', sizeX: 1, sizeY: 1, sizeZ: 1, aliases: [], version: 3, usedDrawings: 0, updatedAt: '2026-11-12T00:00:00Z' },
]

function show(handler: (url: string, init?: RequestInit) => unknown = () => null) {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => handler(url, init) ?? (url === '/api/models' ? json(200, LIST) : json(200, [])))
  vi.stubGlobal('fetch', fetch)
  render(
    <StaticAuth user={ADMIN}>
      <RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/admin/models'] })} />
    </StaticAuth>,
  )
  return fetch
}

describe('관리자 › 객체관리', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('목록 (분류·크기·별칭·사용 도면)', async () => {
    show()
    const row = (await screen.findByText('허브', { selector: 'td' })).closest('tr')!
    expect(within(row).getByText('자재')).toBeInTheDocument()
    expect(within(row).getByText('4.0 × 4.0 × 3.2 m')).toBeInTheDocument()
    expect(within(row).getByText('HUB')).toBeInTheDocument()
    expect(within(row).getByText('2')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '객체관리' })).toHaveAttribute('aria-current', 'page')
  })

  it('수정 → PATCH (별칭 쉼표 분리)', async () => {
    const fetch = show((_url, init) => (init?.method === 'PATCH' ? json(200, { ...LIST[0], name: '허브 A' }) : null))
    fireEvent.click(await screen.findByRole('button', { name: '허브 수정' }))
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '허브 A' } })
    fireEvent.change(screen.getByLabelText('별칭'), { target: { value: 'HUB, 허브' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(fetch.mock.calls.some(([, i]) => (i as RequestInit | undefined)?.method === 'PATCH')).toBe(true))
    const body = JSON.parse(String((fetch.mock.calls.find(([, i]) => (i as RequestInit | undefined)?.method === 'PATCH')![1] as RequestInit).body))
    expect(body).toEqual({ name: '허브 A', category: 'mat', aliases: ['HUB', '허브'] })
  })

  it('사용 중인 모델 삭제는 임시 상자 안내', async () => {
    const fetch = show((_url, init) => (init?.method === 'DELETE' ? { ok: true, status: 204, json: async () => undefined } : null))
    fireEvent.click(await screen.findByRole('button', { name: '허브 삭제' }))
    expect(screen.getByText("'허브' 모델을 삭제합니다. 2개 도면에 배치된 객체는 임시 상자로 바뀝니다.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '삭제' }))
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/models/1', expect.objectContaining({ method: 'DELETE' })))
  })

  it('삭제 실패는 창 안에 오류, 창 유지', async () => {
    show((_url, init) => (init?.method === 'DELETE' ? json(500, { message: '삭제하지 못했습니다' }) : null))
    fireEvent.click(await screen.findByRole('button', { name: '펌프 삭제' }))
    expect(screen.getByText("'펌프' 모델을 삭제합니다.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '삭제' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument()
  })

  it('파일 교체 창은 이름·분류·별칭 입력 없이 열린다', async () => {
    show()
    fireEvent.click(await screen.findByRole('button', { name: '허브 파일 교체' }))
    expect(screen.getByText('3D 파일')).toBeInTheDocument()
    expect(screen.queryByLabelText('별칭')).toBeNull()
  })
})
