import { useEffect, useState } from 'react'
import { apiJson } from '../../api/client'
import type { AuditEntry } from '../../api/types'
import { when } from './format'

type Entry = AuditEntry

const ACTION: Record<string, { label: string; tone: string }> = {
  LOGIN_OK: { label: '로그인', tone: 'ok' },
  LOGIN_FAIL: { label: '로그인 실패', tone: 'warn' },
  LOGIN_LOCKED: { label: '로그인 잠김', tone: 'bad' },
  LOGOUT: { label: '로그아웃', tone: 'info' },
  PASSWORD_CHANGE: { label: '비밀번호 변경', tone: 'info' },
  USER_CREATE: { label: '사용자 추가', tone: 'info' },
  USER_UPDATE: { label: '사용자 수정', tone: 'info' },
  USER_RESET_PASSWORD: { label: '비밀번호 초기화', tone: 'warn' },
  USER_DELETE: { label: '사용자 삭제', tone: 'bad' },
}

/** 설정 › 감사 기록: 최근 200건 (누가·언제·무엇을) */
export function AuditPage() {
  const [rows, setRows] = useState<Entry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    apiJson<Entry[]>('/api/audit?limit=200')
      .then(setRows)
      .catch((e: Error) => setError(e.message))
  }, [])
  return (
    <section className="kp-card kp-section" aria-label="감사 기록">
      <div className="kp-section-head">
        <div>
          <h2>감사 기록</h2>
          <p className="kp-desc">로그인·사용자 관리 등 관리 기록입니다. 최근 200건을 보여 줍니다.</p>
        </div>
      </div>
      {error && <p className="kp-error-text">{error}</p>}
      {rows === null ? (
        <p className="kp-desc">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="kp-desc">기록이 없습니다.</p>
      ) : (
        <table className="kp-table">
          <thead>
            <tr>
              <th>시각</th>
              <th>사용자</th>
              <th>동작</th>
              <th>대상</th>
              <th>내용</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const a = ACTION[r.action] ?? { label: r.action, tone: 'info' }
              return (
                <tr key={r.id}>
                  <td>{when(r.at)}</td>
                  <td className="mono">{r.username ?? '—'}</td>
                  <td>
                    <span className={`kp-state ${a.tone}`}>{a.label}</span>
                  </td>
                  <td className="mono">{r.target ?? ''}</td>
                  <td>{r.detail ?? ''}</td>
                  <td className="mono muted">{r.ip ?? ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}
