import { useRef, useState, type FormEvent } from 'react'
import { Modal } from '../components/Modal'
import { createDrawing } from './api'
import { interpretDxf } from './plan/interpret'
import type { Plan, UnitName } from './plan/types'
import { PlanPreview } from './PlanPreview'
import { readDxfFile } from './readDxfFile'

type Loaded = { file: File; text: string; plan: Plan; guessed: boolean }

const bytesOf = (file: File): Promise<ArrayBuffer> =>
  typeof file.arrayBuffer === 'function' ? file.arrayBuffer() : new Response(file).arrayBuffer()

/** 도면 추가: DXF 선택 → 브라우저에서 해석·미리보기 → 등록 */
export function AddDrawingDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const pickSeq = useRef(0)
  const choose = async (file: File | undefined) => {
    const seq = ++pickSeq.current
    setError(null)
    setLoaded(null)
    if (!file) return
    try {
      const buf = await bytesOf(file)
      if (seq !== pickSeq.current) return
      const text = readDxfFile(buf)
      const plan = interpretDxf(text)
      setLoaded({ file, text, plan, guessed: plan.warnings.unitGuessed })
      setName(file.name.replace(/\.[^.]+$/, ''))
    } catch (e) {
      if (seq === pickSeq.current) setError((e as Error).message)
    }
  }
  const setUnit = (unit: UnitName) => {
    if (!loaded) return
    try {
      setLoaded({ ...loaded, plan: interpretDxf(loaded.text, { unit }) })
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!loaded) return
    setBusy(true)
    setError(null)
    try {
      const d = await createDrawing(loaded.file, name, loaded.plan, {})
      onCreated(d.id)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const p = loaded?.plan
  const empty = !!p && p.lines.length === 0
  const unsupported = p ? Object.entries(p.warnings.unsupported) : []
  return (
    <Modal title="도면 추가" onClose={onClose} wide>
      <form className="kp-form" onSubmit={submit}>
        <label className="kp-field">
          <span>DXF 파일</span>
          <input type="file" accept=".dxf,.DXF" onChange={(e) => choose(e.target.files?.[0])} />
        </label>
        {loaded && p && (
          <>
            <PlanPreview plan={p} />
            <p className="kp-desc">{`벽 ${p.walls.length} · 가벽 ${p.partitions.length} · 기둥 ${p.columns.length} · 구역 ${p.zones.length} · 객체 표기 ${p.objectHints.length}`}</p>
            <p className="kp-desc">{`${p.bounds.w.toFixed(1)} × ${p.bounds.h.toFixed(1)} m`}</p>
            {unsupported.length > 0 && <p className="kp-desc">{`지원 안 됨: ${unsupported.map(([k, v]) => `${k} ${v}`).join(', ')}`}</p>}
            {loaded.guessed && (
              <>
                <p className="kp-desc">{`단위를 ${p.unit} 로 추정했습니다`}</p>
                <label className="kp-field">
                  <span>단위</span>
                  <select className="kp-input" value={p.unit} onChange={(e) => setUnit(e.target.value as UnitName)}>
                    <option value="mm">mm</option>
                    <option value="cm">cm</option>
                    <option value="m">m</option>
                  </select>
                </label>
              </>
            )}
            {empty && <p className="kp-error-text">도면에서 그릴 선을 찾지 못했습니다.</p>}
            <label className="kp-field">
              <span>도면 이름</span>
              <input className="kp-input" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
            </label>
          </>
        )}
        {error && <p className="kp-error-text">{error}</p>}
        <div className="kp-modal-actions">
          <button type="button" className="kp-btn kp-btn-stroke" onClick={onClose}>취소</button>
          <button type="submit" className="kp-btn kp-btn-primary" disabled={!p || empty || !name.trim() || busy}>등록</button>
        </div>
      </form>
    </Modal>
  )
}
