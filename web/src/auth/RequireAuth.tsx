import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { ErrorPage } from '../pages/ErrorPage'
import { hasRole, useAuth, type Role } from './context'

/** 로그인해야 보이는 화면. 비밀번호 변경이 필요하면 /password 로만, 역할이 모자라면 403 */
export function RequireAuth({ children, role }: { children: ReactNode; role?: Role }) {
  const { state } = useAuth()
  const loc = useLocation()
  if (state.status === 'loading')
    return (
      <p className="app-loading" role="status">
        불러오는 중…
      </p>
    )
  if (state.status === 'anon') return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  if (state.user.mustChangePassword && loc.pathname !== '/password') return <Navigate to="/password" replace />
  if (role && !hasRole(state.user, role)) return <ErrorPage code="403" />
  return children
}

