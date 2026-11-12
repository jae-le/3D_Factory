import { fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../api/types'
import { StaticAuth } from '../auth/auth'
import { routes } from '../routes'

const base: User = {
  id: 1, username: 'kim', displayName: '김운전', role: 'OPERATOR', enabled: true,
  mustChangePassword: false, locked: false, createdAt: '2026-11-12T00:00:00Z',
}
const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body })
const drawings = [
  { id: 1, name: '나셀 공장', sourceType: 'dxf', updatedAt: '2026-11-12T00:00:00Z' },
  { id: 2, name: '2공장', sourceType: 'image', updatedAt: '2026-11-12T00:00:00Z' },
]

function show(user: User, list: unknown[] = drawings) {
  vi.stubGlobal('fetch', vi.fn(async () => json(200, list)))
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

  it('도면 select: 기억한 도면을 고르고, 바꾸면 기억', async () => {
    localStorage.setItem('f3d:drawing:kim', '2')
    show(base)
    const select = (await screen.findByRole('combobox', { name: '도면 선택' })) as HTMLSelectElement
    expect(await screen.findByRole('option', { name: '2공장' })).toBeInTheDocument()
    expect(select.value).toBe('2')
    fireEvent.change(select, { target: { value: '1' } })
    expect(select.value).toBe('1')
    expect(localStorage.getItem('f3d:drawing:kim')).toBe('1')
    expect(screen.getByText('나셀 공장', { selector: 'strong' })).toBeInTheDocument()
  })

  it('도면이 없으면 안내', async () => {
    show(base, [])
    expect(await screen.findByText('등록된 도면이 없습니다')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '도면 선택' })).toBeDisabled()
  })

  it('도면 추가 버튼은 운전원 이상, 관리자 메뉴는 관리자만', async () => {
    show(base)
    expect(await screen.findByRole('button', { name: /도면 추가/ })).toBeInTheDocument()
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
