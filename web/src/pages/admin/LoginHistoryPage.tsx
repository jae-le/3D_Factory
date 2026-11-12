import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { apiJson } from '../../api/client'
import type { LoginEvent, LoginResult } from '../../api/types'
import { when } from './format'
import { EMPTY_FILTER, historyQuery, type HistoryFilter } from './historyQuery'

const RESULT: Record<LoginResult, { label: string; tone: string }> = {
  OK: { label: '로그인', tone: 'ok' },
  FAIL: { label: '로그인 실패', tone: 'warn' },
  LOCKED: { label: '잠김', tone: 'bad' },
  LOGOUT: { label: '로그아웃', tone: 'info' },
}

/** 관리자 › 로그인 이력: 사용자·결과·기간으로 찾기, 최근 200건 */
export function LoginHistoryPage() {
  const [filter, setFilter] = useState<HistoryFilter>(EMPTY_FILTER)
  const [rows, setRows] = useState<LoginEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback((f: HistoryFilter) => {
    apiJson<LoginEvent[]>(historyQuery(f))
      .then((r) => {
        setError(null)
        setRows(r)
      })
      .catch((e: Error) => setError(e.message))
  }, [])
  useEffect(() => load(EMPTY_FILTER), [load])
  const submit = (e: FormEvent) => {
    e.preventDefault()
    load(filter)
  }
  const set = (patch: Partial<HistoryFilter>) => setFilter((f) => ({ ...f, ...patch }))
  return (
    <section className="kp-card kp-section" aria-label="로그인 이력">
      <div className="kp-section-head">
        <div>
          <h2>로그인 이력</h2>
          <p className="kp-desc">로그인 성공·실패·잠김·로그아웃 기록입니다. 최근 200건을 보여 줍니다.</p>
        </div>
      </div>
      <form className="kp-filter" onSubmit={submit}>
        <label className="kp-field">
          <span>사용자</span>
          <input className="kp-input" value={filter.username} onChange={(e) => set({ username: e.target.value })} />
        </label>
        <label className="kp-field">
          <span>결과</span>
          <select className="kp-input" value={filter.result} onChange={(e) => set({ result: e.target.value as HistoryFilter['result'] })}>
            <option value="">전체</option>
            {(Object.keys(RESULT) as LoginResult[]).map((r) => (
              <option key={r} value={r}>
                {RESULT[r].label}
              </option>
            ))}
          </select>
        </label>
        <label className="kp-field">
          <span>시작일</span>
          <input className="kp-input" type="date" value={filter.from} onChange={(e) => set({ from: e.target.value })} />
        </label>
        <label className="kp-field">
          <span>종료일</span>
          <input className="kp-input" type="date" value={filter.to} onChange={(e) => set({ to: e.target.value })} />
        </label>
        <button className="kp-btn kp-btn-primary" type="submit">
          조회
        </button>
      </form>
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
              <th>결과</th>
              <th>내용</th>
              <th>IP</th>
              <th>브라우저</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const s = RESULT[r.result]
              return (
                <tr key={r.id}>
                  <td>{when(r.at)}</td>
                  <td className="mono">{r.username ?? '—'}</td>
                  <td>
                    <span className={`kp-state ${s.tone}`}>{s.label}</span>
                  </td>
                  <td>{r.detail ?? ''}</td>
                  <td className="mono muted">{r.ip ?? ''}</td>
                  <td className="muted" title={r.userAgent ?? ''}>
                    {(r.userAgent ?? '').slice(0, 40)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}
