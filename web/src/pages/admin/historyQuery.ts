import type { LoginResult } from '../../api/types'

export interface HistoryFilter {
  username: string
  result: '' | LoginResult
  from: string // YYYY-MM-DD 또는 ''
  to: string
}

export const EMPTY_FILTER: HistoryFilter = { username: '', result: '', from: '', to: '' }

/** 조건 → 서버 주소 (빈 조건은 뺌, 최근 200건) */
export function historyQuery(f: HistoryFilter): string {
  const q = new URLSearchParams()
  if (f.username.trim()) q.set('username', f.username.trim())
  if (f.result) q.set('result', f.result)
  if (f.from) q.set('from', f.from)
  if (f.to) q.set('to', f.to)
  q.set('limit', '200')
  return `/api/admin/login-history?${q.toString()}`
}
