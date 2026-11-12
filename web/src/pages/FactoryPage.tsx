import { Box, Gauge, Map as MapIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { hasRole, useAuth } from '../auth/context'
import { AddDrawingDialog } from '../drawing/AddDrawingDialog'
import { DrawingTools } from '../drawing/DrawingTools'
import { InfoCard } from '../drawing/InfoCard'
import type { Plan, UnitName } from '../drawing/plan/types'
import { useDrawing } from '../drawing/useDrawing'
import { loadStored, pickDrawing, saveStored, useDrawings } from '../drawing/useDrawings'
import { AppShell } from '../layout/AppShell'
import { DrawingBar } from '../layout/DrawingBar'
import type { PickSource, Quality, ViewMode } from '../scene/FactoryScene'
import { FactoryView } from '../scene/FactoryView'
import { ErrorPage } from './ErrorPage'

const UNIT_SCALE: Record<UnitName, number> = { inch: 0.0254, feet: 0.3048, mm: 0.001, cm: 0.01, m: 1 }
type ViewPref = { mode: ViewMode; quality: Quality }

function loadView(): ViewPref {
  try {
    return { mode: '3d', quality: 'high', ...JSON.parse(localStorage.getItem('f3d:view') ?? '{}') }
  } catch {
    return { mode: '3d', quality: 'high' }
  }
}

/** / — 3D 공장 화면: 도면 select · 3D · 보기 전환 · 정보 카드 (도구·추가는 Task 7·8 에서) */
export function FactoryPage() {
  const { user } = useAuth()
  const [drawings, retry] = useDrawings()
  const [chosen, setChosen] = useState<number | null>(() => (user ? loadStored(user.username) : null))
  const [pref, setPref] = useState<ViewPref>(loadView)
  const [scene, setScene] = useState<PickSource | null>(null)
  const list = drawings.kind === 'ok' ? drawings.list : []
  const selectedId = pickDrawing(list, chosen)
  const { state, save } = useDrawing(selectedId)
  const [adding, setAdding] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])
  useEffect(() => {
    try {
      localStorage.setItem('f3d:view', JSON.stringify(pref))
    } catch {
      /* 저장 못 해도 동작 */
    }
  }, [pref])
  if (drawings.kind === 'error')
    return <ErrorPage code={drawings.error.kind === 'network' ? 'offline' : '500'} detail={drawings.error.message} onRetry={retry} />
  const select = (id: number) => {
    setChosen(id)
    if (user) saveStored(user.username, id)
  }
  const detail = state.kind === 'ok' && state.detail.id === selectedId ? state.detail : null
  const onSave = async (p: Plan) => {
    try {
      if ((await save(p)) === 'conflict') setToast('다른 사람이 먼저 수정했습니다. 다시 불러옵니다.')
    } catch (e) {
      setToast((e as Error).message)
    }
  }
  const plan: Plan | null = detail?.plan ?? null
  const head = (
    <>
      <DrawingBar drawings={list} selectedId={selectedId} onSelect={select} canAdd={hasRole(user, 'OPERATOR')} onAdd={() => setAdding(true)} />
      <div className="seg" role="group" aria-label="보기">
        <button className={pref.mode === '3d' ? 'on' : ''} aria-pressed={pref.mode === '3d'} onClick={() => setPref({ ...pref, mode: '3d' })}>
          <Box size={14} aria-hidden /> 3D 보기
        </button>
        <button className={pref.mode === 'plan' ? 'on' : ''} aria-pressed={pref.mode === 'plan'} onClick={() => setPref({ ...pref, mode: 'plan' })}>
          <MapIcon size={14} aria-hidden /> 도면 보기
        </button>
      </div>
      <button className="bar-btn" aria-pressed={pref.quality === 'high'} onClick={() => setPref({ ...pref, quality: pref.quality === 'high' ? 'low' : 'high' })}>
        <Gauge size={14} aria-hidden /> {pref.quality === 'high' ? '고품질' : '저사양'}
      </button>
    </>
  )
  return (
    <AppShell active="factory" head={head}>
      {drawings.kind === 'loading' ? (
        <p className="empty-state" role="status">도면 목록 불러오는 중…</p>
      ) : list.length === 0 ? (
        <div className="empty-state">
          <strong>등록된 도면이 없습니다</strong>
          <span>도면을 추가하면 3D 공장이 여기에 표시됩니다.</span>
        </div>
      ) : (
        <>
          <FactoryView plan={plan} planKey={detail?.id} view={pref.mode} quality={pref.quality} onScene={setScene} />
          {state.kind === 'error' && <p className="empty-state" role="alert">{state.error.message}</p>}
          {detail && <DrawingTools scene={scene} plan={detail.plan} canEdit={hasRole(user, 'OPERATOR')} onSave={onSave} />}
          {toast && <p className="toast" role="status">{toast}</p>}
          {detail && (
            <InfoCard name={detail.name} plan={detail.plan} calibrated={Math.abs(detail.plan.scale - UNIT_SCALE[detail.plan.unit]) > 1e-9} />
          )}
        </>
      )}
      {adding && <AddDrawingDialog onClose={() => setAdding(false)} onCreated={(id) => { setAdding(false); select(id); retry() }} />}
    </AppShell>
  )
}
