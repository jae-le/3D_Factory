import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { getAiSettings, getUsage } from '../../ai/api'
import type { AiSettings, UsageReport, UsageRow } from '../../ai/types'

const tok = (v: number) => v.toLocaleString('ko-KR')
const usd = (v: number) => (v < 1 && v > 0 ? v.toFixed(4) : v.toFixed(2))

function UsageTable({ label, head, rows }: { label: string; head: string; rows: UsageRow[] }) {
  return (
    <table className="kp-table usage-table" aria-label={label}>
      <colgroup>
        <col className="usage-col-key" />
        {Array.from({ length: 6 }, (_, i) => (
          <col key={i} />
        ))}
      </colgroup>
      <thead>
        <tr>
          <th>{head}</th>
          <th>호출</th>
          <th>입력 토큰</th>
          <th>출력 토큰</th>
          <th>캐시 읽기</th>
          <th>캐시 쓰기</th>
          <th>비용 (USD)</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td colSpan={7} className="muted">
              기록이 없습니다.
            </td>
          </tr>
        )}
        {rows.map((r) => (
          <tr key={r.key}>
            <td className="mono">{r.key}</td>
            <td className="mono">{tok(r.calls)}</td>
            <td className="mono">{tok(r.inputTokens)}</td>
            <td className="mono">{tok(r.outputTokens)}</td>
            <td className="mono">{tok(r.cacheReadTokens)}</td>
            <td className="mono">{tok(r.cacheWriteTokens)}</td>
            <td className="mono">${usd(r.costUsd)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** 관리자 › AI 사용량: 이번 달 합계(비용/한도 막대) · 일별 · 사용자별 */
export function AiUsagePage() {
  const [range, setRange] = useState({ from: '', to: '' })
  const [applied, setApplied] = useState({ from: '', to: '' })
  const [day, setDay] = useState<UsageReport | null>(null)
  const [user, setUser] = useState<UsageReport | null>(null)
  const [byModel, setByModel] = useState<UsageReport | null>(null)
  const [setting, setSetting] = useState<AiSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => {
    Promise.all([getUsage('day', applied.from, applied.to), getUsage('user', applied.from, applied.to), getUsage('model', applied.from, applied.to)])
      .then(([d, u, m]) => {
        setError(null)
        setDay(d)
        setUser(u)
        setByModel(m)
        setRange((cur) => (cur.from || cur.to ? cur : { from: d.from, to: d.to }))
        getAiSettings().then(setSetting).catch(() => setSetting(null))
      })
      .catch((e: Error) => setError(e.message))
  }, [applied])
  useEffect(() => load(), [load])
  const submit = (e: FormEvent) => {
    e.preventDefault()
    setApplied(range)
  }
  const m = day?.month
  const pct = day && m ? (day.limitUsd > 0 ? Math.round((m.costUsd / day.limitUsd) * 100) : 100) : 0
  const tone = pct >= 100 ? 'bad' : pct >= 80 ? 'warn' : 'ok'
  return (
    <section className="kp-card kp-section" aria-label="AI 사용량">
      <div className="kp-section-head">
        <div>
          <h2>AI 사용량</h2>
          <p className="kp-desc">AI 호출 수·토큰·추정 비용입니다 (Gemini 무료 등급은 비용 0). 이번 달 비용이 한도에 닿으면 AI 챗봇이 멈춥니다.</p>
        </div>
      </div>
      {error && <p className="kp-error-text">{error}</p>}
      {day && m && (
        <div className="usage-month">
          <div>
            <span>이번 달 호출</span>
            <strong>{tok(m.calls)}</strong>
          </div>
          <div>
            <span>입력 / 출력 토큰</span>
            <strong>
              {tok(m.inputTokens)} / {tok(m.outputTokens)}
            </strong>
          </div>
          {setting?.geminiToday != null && (
            <div className="usage-cost">
              <span>오늘 Gemini 요청 / 하루 한도 (RPD · {setting.model})</span>
              <strong>
                {tok(setting.geminiToday)} / {tok(setting.geminiDailyLimit)}
              </strong>
              <div
                className={`usage-bar ${setting.geminiToday >= setting.geminiDailyLimit ? 'bad' : setting.geminiToday >= setting.geminiDailyLimit * 0.8 ? 'warn' : 'ok'}`}
                role="meter"
                aria-label="오늘 Gemini 요청 / 하루 한도"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.min(100, setting.geminiDailyLimit > 0 ? Math.round((setting.geminiToday / setting.geminiDailyLimit) * 100) : 100)}
              >
                <span style={{ width: `${Math.min(100, setting.geminiDailyLimit > 0 ? (setting.geminiToday / setting.geminiDailyLimit) * 100 : 100)}%` }} />
              </div>
            </div>
          )}
          <div className="usage-cost">
            <span>비용 / 한도</span>
            <strong>
              ${usd(m.costUsd)} / ${day.limitUsd.toFixed(2)}
            </strong>
            <div className={`usage-bar ${tone}`} role="meter" aria-label="이번 달 비용 / 한도" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(pct, 100)}>
              <span style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
          </div>
        </div>
      )}
      {setting?.geminiToday != null && (
        <p className="kp-help usage-note">
          Gemini 하루 한도는 미국 태평양 시간 자정(한국 오후 4~5시)에 초기화됩니다. 자동 재시도는 세지 않아 AI Studio 숫자가 조금 더 클 수 있습니다.
        </p>
      )}
      <form className="kp-filter" onSubmit={submit}>
        <label className="kp-field">
          <span>시작일</span>
          <input className="kp-input" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        </label>
        <label className="kp-field">
          <span>종료일</span>
          <input className="kp-input" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </label>
        <button className="kp-btn kp-btn-primary" type="submit">
          찾기
        </button>
      </form>
      <h3 className="ai-sub">일별</h3>
      {day ? <UsageTable label="일별 사용량" head="날짜" rows={day.rows} /> : <p className="kp-desc">불러오는 중…</p>}
      <h3 className="ai-sub">모델별</h3>
      {byModel ? <UsageTable label="모델별 사용량" head="모델" rows={byModel.rows} /> : <p className="kp-desc">불러오는 중…</p>}
      <h3 className="ai-sub">사용자별</h3>
      {user ? <UsageTable label="사용자별 사용량" head="사용자" rows={user.rows} /> : <p className="kp-desc">불러오는 중…</p>}
    </section>
  )
}
