import { createContext, useContext } from 'react'
import type { User } from '../api/types'

export type { User }
export type Role = User['role']

export const ROLE_LABEL: Record<Role, string> = { ADMIN: '관리자', OPERATOR: '운전원', VIEWER: '조회' }
const RANK: Record<Role, number> = { VIEWER: 1, OPERATOR: 2, ADMIN: 3 }

/** 관리자 ⊃ 운전원 ⊃ 조회 (서버 RoleHierarchy 와 같게). 비밀번호 변경이 필요하면 아무 역할도 없음 */
export function hasRole(user: User | null | undefined, role: Role): boolean {
  return !!user && !user.mustChangePassword && RANK[user.role] >= RANK[role]
}

export type AuthState = { status: 'loading' } | { status: 'anon' } | { status: 'ok'; user: User }

export interface Auth {
  state: AuthState
  user: User | null
  login(username: string, password: string): Promise<User>
  logout(): Promise<void>
  changePassword(current: string, next: string): Promise<User>
}

export const AuthContext = createContext<Auth | null>(null)

export function useAuth(): Auth {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('AuthProvider 안에서만 쓸 수 있습니다')
  return auth
}

/** 로그인 뒤 돌아갈 주소 (다른 사이트 주소·로그인 화면은 막음) */
export function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/login') ? next : '/'
}
