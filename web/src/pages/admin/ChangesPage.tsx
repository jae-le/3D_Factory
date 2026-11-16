import { ChevronDown, ChevronRight, Undo2 } from 'lucide-react'
import { Fragment, useCallback, useEffect, useState, type FormEvent } from 'react'
import { getChanges, revertBatch, type ChangeQuery } from '../../ai/api'
import type { ChangeEntry, ChangePage } from '../../ai/types'
import { apiJson } from '../../api/client'
import { Modal } from '../../components/Modal'
import type { DrawingSummary } from '../../api/types'
import { KIND_LABEL, summary } from './changeSummary'
import { when } from './format'

interface Filter { drawingId: string; source: '' | 'USER' | 'AI'; from: string; to: string }
const EMPTY: Filter = { drawingId: '', source: '', from: '', to: '' }
const toQuery = (f: Filter, page: number): ChangeQuery => ({
  drawingId: f.drawingId ? Number(f.drawingId) : undefined, source: f.source || undefined, from: f.from || undefined, to: f.to || undefined, page,
})
const pretty = (v: unknown) => (v == null ? '없음' : JSON.stringify(v, null, 2))

/** 관리자 › 변경 이력: 사람·AI 가 바꾼 기록 (도면·출처·기간), 펼치면 before/after, 묶음 되돌리기 */
export function ChangesPage() {
  const [drawings, setDrawings] = useState<DrawingSummary[]>([])
  const [filter, setFilter] = useState<Filter>(EMPTY)
  const [query, setQuery] = useState<{ f: Filter; page: number }>({ f: EMPTY, page: 0 })
  const [data, setData] = useState<ChangePage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Set<number>>(new Set())
  const [confirm, setConfirm] = useState<{ batchId: string; count: number } | null>(null)
  const [revertError, setRevertError] = useState<string | null>(null)
  const load = useCallback(() => {
    getChanges(toQuery(query.f, query.page))
      .then((d) => {
        setError(null)
        setData(d)
      })
      .catch((e: Error) => setError(e.message))
  }, [query])
  useEffect(() => load(), [load])
  useEffect(() => {
    apiJson<DrawingSummary[]>('/api/drawings').then(setDrawings).catch(() => setDrawings([]))
  }, [])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setQuery({ f: filter, page: 0 })
  }
  const set = (patch: Partial<Filter>) => setFilter((f) => ({ ...f, ...patch }))
  const toggle = (id: number) =>
    setOpen((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const doRevert = () => {
    if (!confirm) return
    revertBatch(confirm.batchId)
      .then(() => {
        setConfirm(null)
        load()
      })
      .catch((e: Error) => setRevertError(e.message))
  }
  const rows = data?.items ?? []
  const pages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1
  return (
    <section className="kp-card kp-section" aria-label="변경 이력">
      <div className="kp-section-head">
        <div>
          <h2>변경 이력</h2>
          <p className="kp-desc">사람과 AI 가 3D 공장을 바꾼 기록입니다. 한 번에 바뀐 묶음 단위로 되돌릴 수 있습니다.</p>
        </div>
      </div>
      <form className="kp-filter" onSubmit={submit}>
        <label className="kp-field">
          <span>도면</span>
          <select className="kp-input" value={filter.drawingId} onChange={(e) => set({ drawingId: e.target.value })}>
            <option value="">전체</option>
            {drawings.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="kp-field">
          <span>출처</span>
          <select className="kp-input" value={filter.source} onChange={(e) => set({ source: e.target.value as Filter['source'] })}>
            <option value="">전체</option>
            <option value="USER">사람</option>
            <option value="AI">AI</option>
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
        <button className="kp-btn kp-btn-primary kp-btn-sm" type="submit">
          찾기
        </button>
      </form>
      {error && <p className="kp-error-text">{error}</p>}
      {data === null ? (
        <p className="kp-desc">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="kp-desc">기록이 없습니다.</p>
      ) : (
        <table className="kp-table" aria-label="변경 이력 표">
          <thead>
            <tr>
              <th aria-label="펼치기" />
              <th>시각</th>
              <th>사용자</th>
              <th>출처</th>
              <th>도면</th>
              <th>종류</th>
              <th>대상</th>
              <th>요약</th>
              <th>묶음</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: ChangeEntry) => (
              <Fragment key={r.id}>
                <tr className={r.reverted ? 'off' : undefined}>
                  <td>
                    <button className="kp-btn kp-btn-text kp-btn-xs" aria-label="자세히" aria-expanded={open.has(r.id)} onClick={() => toggle(r.id)}>
                      {open.has(r.id) ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
                    </button>
                  </td>
                  <td>{when(r.at)}</td>
                  <td className="mono">{r.username ?? '—'}</td>
                  <td>
                    <span className={r.source === 'AI' ? 'kp-badge source-ai' : 'kp-badge source-user'}>{r.source === 'AI' ? 'AI' : '사람'}</span>
                  </td>
                  <td>{r.drawingName}</td>
                  <td>{KIND_LABEL[r.kind] ?? r.kind}</td>
                  <td>{r.target ?? ''}</td>
                  <td className="mono">{summary(r.kind, r.before, r.after)}</td>
                  <td>
                    {r.reverted ? (
                      <span className="kp-state off">되돌림</span>
                    ) : (
                      <button
                        className="kp-btn kp-btn-stroke kp-btn-xs"
                        onClick={() => {
                          setRevertError(null)
                          setConfirm({ batchId: r.batchId, count: rows.filter((x) => x.batchId === r.batchId).length })
                        }}
                      >
                        <Undo2 size={12} aria-hidden /> 되돌리기
                      </button>
                    )}
                  </td>
                </tr>
                {open.has(r.id) && (
                  <tr className="change-detail">
                    <td />
                    <td colSpan={8}>
                      <div className="change-json">
                        <div>
                          <strong>이전</strong>
                          <pre>{pretty(r.before)}</pre>
                        </div>
                        <div>
                          <strong>이후</strong>
                          <pre>{pretty(r.after)}</pre>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
      {data && data.total > data.size && (
        <div className="kp-pager">
          <button className="kp-btn kp-btn-text kp-btn-sm" disabled={query.page === 0} onClick={() => setQuery({ ...query, page: query.page - 1 })}>
            이전
          </button>
          <span>
            {query.page + 1} / {pages}
          </span>
          <button className="kp-btn kp-btn-text kp-btn-sm" disabled={query.page + 1 >= pages} onClick={() => setQuery({ ...query, page: query.page + 1 })}>
            다음
          </button>
        </div>
      )}
      {confirm && (
        <Modal title="변경 되돌리기" onClose={() => setConfirm(null)}>
          <p className="kp-desc">이 묶음의 변경 {confirm.count}건을 모두 되돌립니다. 그 뒤에 같은 객체를 바꾼 기록이 있으면 되돌릴 수 없습니다.</p>
          {revertError && <p className="kp-error-text">{revertError}</p>}
          <div className="kp-modal-actions">
            <button className="kp-btn kp-btn-text kp-btn-sm" onClick={() => setConfirm(null)}>
              닫기
            </button>
            <button className="kp-btn kp-btn-primary kp-btn-sm" onClick={doRevert}>
              되돌리기
            </button>
          </div>
        </Modal>
      )}
    </section>
  )
}
