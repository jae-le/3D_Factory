import { FileUp, Pencil, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { AddModelDialog } from '../../objects/AddModelDialog'
import { deleteModel, listModels, modelThumbUrl, updateModel } from '../../objects/api'
import { CATEGORY_LABEL, type Category, type ModelInfo } from '../../objects/types'
import { when } from './format'

type Dialog = { kind: 'edit' | 'replace' | 'delete'; m: ModelInfo } | null
const CATEGORIES = Object.keys(CATEGORY_LABEL) as Category[]

/** 관리자 › 객체관리: 목록 · 수정(이름·분류·별칭) · 파일 교체 · 삭제 */
export function ModelsPage() {
  const [rows, setRows] = useState<ModelInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<Category>('equip')
  const [aliases, setAliases] = useState('')
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => {
    listModels().then(setRows).catch((e: Error) => setError(e.message))
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
  /** 실패하면 창을 열어 둔 채 창 안에 오류 표시 */
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
  const startEdit = (m: ModelInfo) => {
    setName(m.name)
    setCategory(m.category)
    setAliases(m.aliases.join(', '))
    open({ kind: 'edit', m })
  }
  const save = (e: FormEvent) => {
    e.preventDefault()
    if (dialog) run(() => updateModel(dialog.m.id, { name: name.trim(), category, aliases: aliases.split(',').map((a) => a.trim()).filter(Boolean) }))
  }
  return (
    <section className="kp-card kp-section" aria-label="객체관리">
      <div className="kp-section-head">
        <div>
          <h2>객체관리</h2>
          <p className="kp-desc">등록된 3D 객체의 이름·분류·별칭을 고치거나 파일을 교체·삭제합니다.</p>
        </div>
      </div>
      {error && <p className="kp-error-text">{error}</p>}
      {rows === null ? (
        <p className="kp-desc">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="kp-desc">등록된 객체가 없습니다.</p>
      ) : (
        <table className="kp-table">
          <thead>
            <tr><th>썸네일</th><th>이름</th><th>분류</th><th>크기</th><th>별칭</th><th>사용 도면</th><th>수정일</th><th>관리</th></tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td><img src={modelThumbUrl(m)} alt="" width="64" height="48" /></td>
                <td>{m.name}</td>
                <td>{CATEGORY_LABEL[m.category]}</td>
                <td>{`${m.sizeX.toFixed(1)} × ${m.sizeY.toFixed(1)} × ${m.sizeZ.toFixed(1)} m`}</td>
                <td className="mono">{m.aliases.join(', ')}</td>
                <td className="num">{m.usedDrawings}</td>
                <td>{when(m.updatedAt)}</td>
                <td className="actions">
                  <button className="kp-btn kp-btn-stroke kp-btn-xs" aria-label={`${m.name} 수정`} onClick={() => startEdit(m)}>
                    <Pencil size={14} aria-hidden />
                  </button>
                  <button className="kp-btn kp-btn-stroke kp-btn-xs" aria-label={`${m.name} 파일 교체`} onClick={() => open({ kind: 'replace', m })}>
                    <FileUp size={14} aria-hidden />
                  </button>
                  <button className="kp-btn kp-btn-danger kp-btn-xs" aria-label={`${m.name} 삭제`} onClick={() => open({ kind: 'delete', m })}>
                    <Trash2 size={14} aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {dialog?.kind === 'edit' && (
        <Modal title="객체 수정" onClose={() => setDialog(null)}>
          <form className="kp-form" onSubmit={save}>
            <label className="kp-field">
              <span>이름</span>
              <input className="kp-input" value={name} maxLength={100} autoFocus onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="kp-field">
              <span>분류</span>
              <select className="kp-input" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
              </select>
            </label>
            <label className="kp-field">
              <span>별칭</span>
              <input className="kp-input" value={aliases} placeholder="쉼표로 구분" onChange={(e) => setAliases(e.target.value)} />
            </label>
            {dialogError && <p className="kp-error-text" role="alert">{dialogError}</p>}
            <div className="kp-modal-actions">
              <button type="button" className="kp-btn kp-btn-stroke" onClick={() => setDialog(null)}>취소</button>
              <button type="submit" className="kp-btn kp-btn-primary" disabled={!name.trim() || busy}>저장</button>
            </div>
          </form>
        </Modal>
      )}
      {dialog?.kind === 'replace' && <AddModelDialog mode={{ replace: dialog.m }} onClose={() => setDialog(null)} onCreated={done} />}
      {dialog?.kind === 'delete' && (
        <Modal title="객체 삭제" onClose={() => setDialog(null)}>
          <p className="kp-desc">{`'${dialog.m.name}' 모델을 삭제합니다.${dialog.m.usedDrawings > 0 ? ` ${dialog.m.usedDrawings}개 도면에 배치된 객체는 임시 상자로 바뀝니다.` : ''}`}</p>
          {dialogError && <p className="kp-error-text" role="alert">{dialogError}</p>}
          <div className="kp-modal-actions">
            <button type="button" className="kp-btn kp-btn-stroke" onClick={() => setDialog(null)}>취소</button>
            <button type="button" className="kp-btn kp-btn-danger-fill" disabled={busy} onClick={() => run(() => deleteModel(dialog.m.id))}>삭제</button>
          </div>
        </Modal>
      )}
    </section>
  )
}
