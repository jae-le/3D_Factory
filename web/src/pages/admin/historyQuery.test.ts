import { describe, expect, it } from 'vitest'
import { historyQuery } from './historyQuery'

describe('로그인 이력 조회 주소', () => {
  it('빈 조건은 빼고, 값은 인코딩', () => {
    expect(historyQuery({ username: '', result: '', from: '', to: '' })).toBe('/api/admin/login-history?limit=200')
    expect(historyQuery({ username: ' kim ', result: 'FAIL', from: '2026-11-01', to: '2026-11-12' })).toBe(
      '/api/admin/login-history?username=kim&result=FAIL&from=2026-11-01&to=2026-11-12&limit=200',
    )
    expect(historyQuery({ username: '김 운전', result: '', from: '', to: '' })).toBe(
      '/api/admin/login-history?username=%EA%B9%80+%EC%9A%B4%EC%A0%84&limit=200',
    )
  })
})
