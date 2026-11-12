import { FlipHorizontal2, RotateCw, Ruler, Scaling } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Modal } from '../components/Modal'
import type { PickSource } from '../scene/FactoryScene'
import type { Plan, Pt } from './plan/types'
import { calibrate, flipPlan, rotate } from './plan/transform'

type Tool = 'none' | 'measure' | 'calib'
const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1])

/** 3D 오른쪽 위 도구줄: 거리 측정(모두) · 스케일 보정 · 90° 회전 · 좌우 반전(운전원 이상) */
export function DrawingTools({ scene, plan, canEdit, onSave }: { scene: PickSource | null; plan: Plan; canEdit: boolean; onSave: (plan: Plan) => Promise<void> }) {
  const [tool, setTool] = useState<Tool>('none')
  const [picks, setPicks] = useState<Pt[]>([])
  const [actual, setActual] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false) // 저장 중 — 연타로 같은 버전 PUT 두 번(409) 방지

  const stop = () => {
    setTool('none')
    setPicks([])
    setActual('')
    setError(null)
  }
  useEffect(() => {
    if (!scene) return
    scene.setGroundClick(tool === 'none' ? null : (p) => setPicks((cur) => (cur.length >= 2 ? [[p.x, p.y]] : [...cur, [p.x, p.y]])))
    return () => scene.setGroundClick(null)
  }, [scene, tool])
  useEffect(() => scene?.setMarkers(picks), [scene, picks])
  useEffect(() => () => scene?.setMarkers([]), [scene])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && stop()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const start = (t: Tool) => {
    stop()
    setTool(t)
  }
  const measured = picks.length === 2 ? dist(picks[0], picks[1]) : null
  const saving = (p: Plan) => {
    setBusy(true)
    return onSave(p).finally(() => setBusy(false))
  }
  const apply = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    try {
      const next = calibrate(plan, measured ?? 0, Number(actual))
      await saving(next)
      stop()
    } catch (err) {
      setError((err as Error).message)
    }
  }
  return (
    <div className="tool-bar" role="toolbar" aria-label="도면 도구">
      <button className={tool === 'measure' ? 'on' : ''} aria-pressed={tool === 'measure'} onClick={() => start('measure')}>
        <Ruler size={16} aria-hidden /> 거리 측정
      </button>
      {canEdit && (
        <>
          <button className={tool === 'calib' ? 'on' : ''} aria-pressed={tool === 'calib'} onClick={() => start('calib')}>
            <Scaling size={16} aria-hidden /> 스케일 보정
          </button>
          <button disabled={busy} onClick={() => { setPicks([]); void saving(rotate(plan)) }}>
            <RotateCw size={16} aria-hidden /> 90° 회전
          </button>
          <button disabled={busy} onClick={() => { setPicks([]); void saving(flipPlan(plan)) }}>
            <FlipHorizontal2 size={16} aria-hidden /> 좌우 반전
          </button>
        </>
      )}
      {tool !== 'none' && <span className="tool-break" aria-hidden />}
      {tool !== 'none' && (
        <p className="tool-hint" role="status">
          {measured != null && tool === 'measure' ? `거리 ${measured.toFixed(2)} m` : picks.length === 0 ? '첫 점을 클릭하세요 (Esc 취소)' : '둘째 점을 클릭하세요'}
        </p>
      )}
      {tool === 'calib' && measured != null && (
        <Modal title="스케일 보정" onClose={stop}>
          <form className="kp-form" onSubmit={apply}>
            <p className="kp-desc">{`두 점 사이 지금 거리: ${measured.toFixed(2)} m`}</p>
            <label className="kp-field">
              <span>실제 거리 (m)</span>
              <input className="kp-input" type="number" step="any" autoFocus value={actual} onChange={(e) => setActual(e.target.value)} />
            </label>
            {error && <p className="kp-error-text">{error}</p>}
            <div className="kp-modal-actions">
              <button type="button" className="kp-btn kp-btn-stroke" onClick={stop}>취소</button>
              <button type="submit" className="kp-btn kp-btn-primary" disabled={busy}>적용</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
