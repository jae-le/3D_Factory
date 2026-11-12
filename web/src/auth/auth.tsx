import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { apiJson, apiSend, UNAUTHORIZED_EVENT } from '../api/client'
import { AuthContext, type Auth, type AuthState, type User } from './context'

/** 로그인 상태: 시작할 때 /api/auth/me 로 확인, API 가 401 을 받으면 로그아웃 상태로 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })
  useEffect(() => {
    let cancel = false
    apiJson<User>('/api/auth/me')
      .then((user) => !cancel && setState({ status: 'ok', user }))
      .catch(() => !cancel && setState({ status: 'anon' }))
    const onLost = () => setState({ status: 'anon' })
    window.addEventListener(UNAUTHORIZED_EVENT, onLost)
    return () => {
      cancel = true
      window.removeEventListener(UNAUTHORIZED_EVENT, onLost)
    }
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const user = await apiSend<User>('POST', '/api/auth/login', { username, password })
    setState({ status: 'ok', user })
    return user
  }, [])
  const logout = useCallback(async () => {
    await apiSend('POST', '/api/auth/logout').catch(() => {})
    setState({ status: 'anon' })
  }, [])
  const changePassword = useCallback(async (current: string, next: string) => {
    const user = await apiSend<User>('POST', '/api/auth/password', { current, next })
    setState({ status: 'ok', user })
    return user
  }, [])

  const value = useMemo<Auth>(
    () => ({ state, user: state.status === 'ok' ? state.user : null, login, logout, changePassword }),
    [state, login, logout, changePassword],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** 테스트·미리보기용: 정해진 사용자로 */
export function StaticAuth({ user, children }: { user: User | null; children: ReactNode }) {
  const value = useMemo<Auth>(
    () => ({
      state: user ? { status: 'ok', user } : { status: 'anon' },
      user,
      login: async () => user!,
      logout: async () => {},
      changePassword: async () => user!,
    }),
    [user],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
