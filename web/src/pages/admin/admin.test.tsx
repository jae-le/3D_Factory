import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../../api/types'
import { AuthProvider, StaticAuth } from '../../auth/auth'
import { routes } from '../../routes'

const ADMIN: User = {
  id: 1, username: 'admin', displayName: '관리자', role: 'ADMIN', enabled: true,
  mustChangePassword: false, locked: false, createdAt: '2026-11-12T00:00:00Z',
}
const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body })

describe('로그인 화면', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('틀리면 서버의 한국어 안내, 맞으면 원래 주소로 (CSRF 머리 포함)', async () => {
    let tries = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === '/api/auth/me') return json(401, { detail: '로그인이 필요합니다.' })
        if (url === '/api/auth/login') {
          expect(new Headers(init?.headers).has('X-XSRF-TOKEN')).toBe(true)
          return tries++ === 0 ? json(401, { detail: '아이디 또는 비밀번호가 틀렸습니다.' }) : json(200, ADMIN)
        }
        if (url === '/api/users') return json(200, [ADMIN])
        return json(200, [])
      }),
    )
    const router = createMemoryRouter(routes, { initialEntries: ['/login?next=%2Fadmin%2Fusers'] })
    render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    )
    fireEvent.change(await screen.findByLabelText('아이디'), { target: { value: 'admin' } })
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: '로그인' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('아이디 또는 비밀번호가 틀렸습니다.')
    fireEvent.click(screen.getByRole('button', { name: '로그인' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/users'))
  })
})

describe('관리자 › 권한관리', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('목록, 추가하면 임시 비밀번호를 한 번 보여 줌', async () => {
    const lee: User = { ...ADMIN, id: 2, username: 'lee', displayName: '이운전', role: 'OPERATOR', mustChangePassword: true }
    const users = [ADMIN]
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === '/api/users' && init?.method === 'POST') {
          users.push(lee)
          return json(200, { user: lee, tempPassword: 'Tmp4aBcdEf9z' })
        }
        if (url === '/api/users') return json(200, [...users])
        return json(200, [])
      }),
    )
    render(
      <StaticAuth user={ADMIN}>
        <RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/admin'] })} />
      </StaticAuth>,
    )
    expect(await screen.findByText('관리자', { selector: 'td' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '사용자 추가' }))
    fireEvent.change(screen.getByLabelText('아이디'), { target: { value: 'lee' } })
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '이운전' } })
    fireEvent.click(screen.getByRole('radio', { name: /운전원/ }))
    fireEvent.click(screen.getByRole('button', { name: '추가' }))
    expect(await screen.findByText('Tmp4aBcdEf9z')).toBeInTheDocument()
    expect(await screen.findByText('이운전', { selector: 'td' })).toBeInTheDocument()
  })
})

describe('관리자 › 로그인 이력', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('목록을 보여 주고, 조건을 넣고 조회하면 그 주소로 다시 요청', async () => {
    const fetch = vi.fn(async (url: string) =>
      url.startsWith('/api/admin/login-history')
        ? json(200, [
            { id: 2, at: '2026-11-12T01:00:00Z', username: 'kim', result: 'FAIL', detail: '1번째 실패', ip: '10.0.0.2', userAgent: 'Edge' },
            { id: 1, at: '2026-11-12T00:00:00Z', username: 'admin', result: 'OK', detail: null, ip: '10.0.0.1', userAgent: 'Edge' },
          ])
        : json(200, []),
    )
    vi.stubGlobal('fetch', fetch)
    render(
      <StaticAuth user={ADMIN}>
        <RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/admin/login-history'] })} />
      </StaticAuth>,
    )
    expect(await screen.findByText('1번째 실패')).toBeInTheDocument()
    expect(screen.getByText('로그인 실패', { selector: '.kp-state' })).toBeInTheDocument()
    expect(screen.getByText('로그인', { selector: '.kp-state' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('사용자'), { target: { value: 'kim' } })
    fireEvent.change(screen.getByLabelText('결과'), { target: { value: 'FAIL' } })
    fireEvent.click(screen.getByRole('button', { name: '조회' }))
    await waitFor(() =>
      expect(fetch).toHaveBeenLastCalledWith('/api/admin/login-history?username=kim&result=FAIL&limit=200'),
    )
  })

  it('운전원은 관리자 화면 403', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, [])))
    render(
      <StaticAuth user={{ ...ADMIN, role: 'OPERATOR' }}>
        <RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/admin/login-history'] })} />
      </StaticAuth>,
    )
    expect(await screen.findByText('이 화면을 볼 권한이 없습니다')).toBeInTheDocument()
  })
})
