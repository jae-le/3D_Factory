import { useEffect, useState } from 'react'
import { Modal } from '../../components/Modal'
import { getDrawing, getSource, savePlan, type DrawingDetail } from '../../drawing/api'
import { reinterpretDxf } from '../../drawing/plan/interpret'
import { roleDefaults } from '../../drawing/plan/rules'
import type { LayerRules, Role } from '../../drawing/plan/types'
import { readDxfFile } from '../../drawing/readDxfFile'

const ROLES: [Role, string][] = [
  ['wall', '외벽'], ['partition', '낮은 가벽'], ['column', '기둥'], ['zone', '구역'], ['object', '객체 표기'], ['line', '바닥 선'],
]

/** 레이어마다 역할·높이·두께 → 원본을 받아 브라우저에서 다시 해석해 저장 (보정·회전 유지) */
export function LayerRulesDialog({ id, onClose, onSaved }: { id: number; onClose: () => void; onSaved: () => void }) {
  const [detail, setDetail] = useState<DrawingDetail | null>(null)
  const [rules, setRules] = useState<LayerRules>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    getDrawing(id)
      .then((d) => {
        setDetail(d)
        setRules(Object.fromEntries(d.plan.layers.map((l) => [l.name, { role: l.role, height: l.height, thickness: l.thickness }])))
      })
      .catch((e: Error) => setError(e.message))
  }, [id])
  const set = (name: string, patch: Partial<LayerRules[string]>) =>
    setRules((r) => ({ ...r, [name]: { ...r[name], ...patch } as LayerRules[string] }))
  const save = async () => {
    if (!detail) return
    setBusy(true)
    setError(null)
    try {
      const text = readDxfFile(await getSource(id))
      const plan = reinterpretDxf(text, rules, detail.plan)
      await savePlan(id, detail.version, plan, rules)
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title={`레이어 규칙${detail ? ` — ${detail.name}` : ''}`} onClose={onClose} wide>
      {!detail && !error && <p className="kp-desc">불러오는 중…</p>}
      {detail && (
        <table className="kp-table">
          <thead>
            <tr><th>레이어</th><th>선 수</th><th>역할</th><th>높이(m)</th><th>두께(m)</th></tr>
          </thead>
          <tbody>
            {detail.plan.layers.map((l) => (
              <tr key={l.name}>
                <td><span className="swatch" style={{ background: l.color }} aria-hidden /> {l.name}</td>
                <td className="num">{l.count}</td>
                <td>
                  <select
                    className="kp-input"
                    aria-label={`${l.name} 역할`}
                    value={rules[l.name]?.role}
                    onChange={(e) => set(l.name, { role: e.target.value as Role, ...roleDefaults(e.target.value as Role) })}
                  >
                    {ROLES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                  </select>
                </td>
                <td><input className="kp-input" type="number" step="any" aria-label={`${l.name} 높이`} value={rules[l.name]?.height ?? 0} onChange={(e) => set(l.name, { height: Number(e.target.value) })} /></td>
                <td><input className="kp-input" type="number" step="any" aria-label={`${l.name} 두께`} value={rules[l.name]?.thickness ?? 0} onChange={(e) => set(l.name, { thickness: Number(e.target.value) })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {error && <p className="kp-error-text">{error}</p>}
      <div className="kp-modal-actions">
        <button type="button" className="kp-btn kp-btn-stroke" onClick={onClose}>취소</button>
        <button type="button" className="kp-btn kp-btn-primary" disabled={!detail || busy} onClick={save}>저장 후 다시 해석</button>
      </div>
    </Modal>
  )
}
