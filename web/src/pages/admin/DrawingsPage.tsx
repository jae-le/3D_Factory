import { Layers, Pencil, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { apiJson } from '../../api/client'
import type { DrawingSummary } from '../../api/types'
import { Modal } from '../../components/Modal'
import { deleteDrawing, renameDrawing } from '../../drawing/api'
import { when } from './format'
import { LayerRulesDialog } from './LayerRulesDialog'

type Dialog = { kind: 'rename' | 'rules' | 'delete'; d: DrawingSummary } | null

/** 관리자 › 도면 관리: 목록 · 이름 바꾸기 · 레이어 규칙(재해석) · 삭제 */
export function DrawingsPage() {
  const [rows, setRows] = useState<DrawingSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [name, setName] = useState('')
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => {
    apiJson<DrawingSummary[]>('/api/drawings').then(setRows).catch((e: Error) => setError(e.message))
  }, [])
  useEffect(load, [load])
  const done = () => {
    setDialog(null)
    load()
  }
  const open = (d: Dialog) => {
    setDialogError(null)
    setDialog(d)
  }
  /** 실패하면 창을 열어 둔 채 창 안에 오류 표시 (입력한 이름 유지) */
  const run = async (f: () => Promise<unknown>) => {
    setDialogError(null)
    setBusy(true)
    try {
      await f()
      done()
    } catch (e) {
      setDialogError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const rename = (e: FormEvent) => {
    e.preventDefault()
    if (dialog) run(() => renameDrawing(dialog.d.id, name.trim()))
  }
  return (
    <section className="kp-card kp-section" aria-label="도면 관리">
      <div className="kp-section-head">
        <div>
          <h2>도면 관리</h2>
          <p className="kp-desc">등록된 도면의 이름·레이어 인식 규칙을 바꾸거나 삭제합니다.</p>
        </div>
      </div>
      {error && <p className="kp-error-text">{error}</p>}
      {rows === null ? (
        <p className="kp-desc">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="kp-desc">등록된 도면이 없습니다.</p>
      ) : (
        <table className="kp-table">
          <thead>
            <tr><th>이름</th><th>형식</th><th>크기</th><th>버전</th><th>등록자</th><th>수정일</th><th>관리</th></tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id}>
                <td>{d.name}</td>
                <td className="mono">{d.sourceType.toUpperCase()}</td>
                <td>{d.width != null && d.height != null ? `${d.width.toFixed(1)} × ${d.height.toFixed(1)} m` : '—'}</td>
                <td className="num">{d.version}</td>
                <td className="mono">{d.createdBy ?? '—'}</td>
                <td>{when(d.updatedAt)}</td>
                <td className="actions">
                  <button className="kp-btn kp-btn-stroke kp-btn-xs" aria-label={`${d.name} 이름 바꾸기`} onClick={() => { setName(d.name); open({ kind: 'rename', d }) }}>
                    <Pencil size={14} aria-hidden />
                  </button>
                  <button className="kp-btn kp-btn-stroke kp-btn-xs" aria-label={`${d.name} 레이어 규칙`} onClick={() => open({ kind: 'rules', d })}>
                    <Layers size={14} aria-hidden />
                  </button>
                  <button className="kp-btn kp-btn-danger kp-btn-xs" aria-label={`${d.name} 삭제`} onClick={() => open({ kind: 'delete', d })}>
                    <Trash2 size={14} aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {dialog?.kind === 'rename' && (
        <Modal title="이름 바꾸기" onClose={() => setDialog(null)}>
          <form className="kp-form" onSubmit={rename}>
            <label className="kp-field">
              <span>새 이름</span>
              <input className="kp-input" value={name} maxLength={100} autoFocus onChange={(e) => setName(e.target.value)} />
            </label>
            {dialogError && <p className="kp-error-text" role="alert">{dialogError}</p>}
            <div className="kp-modal-actions">
              <button type="button" className="kp-btn kp-btn-stroke" onClick={() => setDialog(null)}>취소</button>
              <button type="submit" className="kp-btn kp-btn-primary" disabled={!name.trim() || busy}>저장</button>
            </div>
          </form>
        </Modal>
      )}
      {dialog?.kind === 'rules' && <LayerRulesDialog id={dialog.d.id} onClose={() => setDialog(null)} onSaved={done} />}
      {dialog?.kind === 'delete' && (
        <Modal title="도면 삭제" onClose={() => setDialog(null)}>
          <p className="kp-desc">{`'${dialog.d.name}' 도면을 삭제합니다. ${dialog.d.placements > 0 ? `원본 파일과 배치된 객체 ${dialog.d.placements}개도 함께 삭제됩니다.` : '원본 파일까지 삭제됩니다.'}`}</p>
          {dialogError && <p className="kp-error-text" role="alert">{dialogError}</p>}
          <div className="kp-modal-actions">
            <button type="button" className="kp-btn kp-btn-stroke" onClick={() => setDialog(null)}>취소</button>
            <button type="button" className="kp-btn kp-btn-danger-fill" disabled={busy} onClick={() => run(() => deleteDrawing(dialog.d.id))}>삭제</button>
          </div>
        </Modal>
      )}
    </section>
  )
}
