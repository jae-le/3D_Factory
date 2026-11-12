/** 서버 응답 모양 (server/ 의 record 와 같게 유지) */
export type Role = 'ADMIN' | 'OPERATOR' | 'VIEWER'

export interface User {
  id: number
  username: string
  displayName: string
  role: Role
  enabled: boolean
  mustChangePassword: boolean
  locked: boolean
  lastLoginAt?: string | null
  createdAt: string
}

export interface AuditEntry {
  id: number
  at: string
  username?: string | null
  action: string
  target?: string | null
  detail?: string | null
  ip?: string | null
}

export type LoginResult = 'OK' | 'FAIL' | 'LOCKED' | 'LOGOUT'

export interface LoginEvent {
  id: number
  at: string
  username?: string | null
  result: LoginResult
  detail?: string | null
  ip?: string | null
  userAgent?: string | null
}

export interface DrawingSummary {
  id: number
  name: string
  sourceType: 'dxf' | 'image'
  version: number
  createdBy: string | null
  updatedAt: string
  width: number | null
  height: number | null
}
