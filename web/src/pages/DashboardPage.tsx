import { Gauge } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { hasRole, useAuth } from '../auth/context'
import { ChipLayer, type ChipItem } from '../dashboard/ChipLayer'
import { EventTicker } from '../dashboard/EventTicker'
import { KpiBar } from '../dashboard/KpiBar'
import { LiveBadge } from '../dashboard/LiveBadge'
import { LiveDrawer } from '../dashboard/LiveDrawer'
import { STATUS_COLOR } from '../dashboard/status'
import { useLive } from '../dashboard/useLive'
import { useDrawing } from '../drawing/useDrawing'
import { loadStored, pickDrawing, saveStored, useDrawings } from '../drawing/useDrawings'
import { AppShell } from '../layout/AppShell'
import { DrawingBar } from '../layout/DrawingBar'
import { modelFileUrl } from '../objects/api'
import { BOX_SIZE, type ModelInfo } from '../objects/types'
import { useModels } from '../objects/useModels'
import { usePlacements } from '../objects/usePlacements'
import type { Quality, SceneHost } from '../scene/FactoryScene'
import { FactoryView } from '../scene/FactoryView'
import type { SceneObject } from '../scene/objectLayer'
import { ErrorPage } from './ErrorPage'

const NO_MODELS: ModelInfo[] = []
const RING_K = 0.62 // 링 반지름 = 설비 큰 변 × 0.62 (demo)

/** 3D 공장 화면과 같은 저장값 f3d:view 의 quality */
function loadQuality(): Quality {
  try {
    return JSON.parse(localStorage.getItem('f3d:view') ?? '{}').quality === 'low' ? 'low' : 'high'
  } catch {
    return 'high'
  }
}

function saveQuality(q: Quality) {
  try {
    const v = JSON.parse(localStorage.getItem('f3d:view') ?? '{}') as object
    localStorage.setItem('f3d:view', JSON.stringify({ ...v, quality: q }))
  } catch {
    /* 저장 못 해도 동작 */
  }
}

/** /dashboard — 실시간 상황판: 3D(보기 전용) + KPI 줄 · 스테이션 칩 · 바닥 링 · 이벤트 줄 · 제작·자재 서랍 */
export function DashboardPage() {
  const { user } = useAuth()
  const isAdmin = hasRole(user, 'ADMIN')
  const [drawings, retry] = useDrawings()
  const [chosen, setChosen] = useState<number | null>(() => (user ? loadStored(user.username) : null))
  const [quality, setQuality] = useState<Quality>(loadQuality)
  const [scene, setScene] = useState<SceneHost | null>(null)
  const list = drawings.kind === 'ok' ? drawings.list : []
  const drawingId = pickDrawing(list, chosen)
  const { state } = useDrawing(drawingId)
  const detail = state.kind === 'ok' && state.detail.id === drawingId ? state.detail : null
  const models = useModels()
  const modelList = models.state.kind === 'ok' ? models.state.list : NO_MODELS
  const placements = usePlacements(detail?.id ?? null)
  const live = useLive(drawingId)
  const data = live.data && live.data.drawingId === drawingId ? live.data : null
  const [selId, setSelId] = useState<number | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  // 도면이 바뀌면 칩 선택 해제 (렌더 중 조정)
  const [selDrawing, setSelDrawing] = useState(drawingId)
  if (selDrawing !== drawingId) {
    setSelDrawing(drawingId)
    setSelId(null)
  }

  const byId = useMemo(() => new Map(modelList.map((m) => [m.id, m])), [modelList])
  const sceneObjects = useMemo<SceneObject[]>(
    () =>
      placements.list.map((p) => {
        const m = p.modelId != null ? (byId.get(p.modelId) ?? null) : null
        const size = m ?? BOX_SIZE
        return { id: p.id, name: p.name, url: m ? modelFileUrl(m) : null, sizeX: size.sizeX, sizeY: size.sizeY, sizeZ: size.sizeZ, x: p.x, y: p.y, rot: p.rot, label: p.hintLabel ?? p.name }
      }),
    [placements.list, byId],
  )
  // 스테이션 ↔ 같은 이름의 배치 (못 찾으면 칩·링만 빠지고 KPI·서랍에는 포함)
  const items = useMemo<ChipItem[]>(() => {
    if (!data) return []
    const byName = new Map(placements.list.map((p) => [p.name, p]))
    const out: ChipItem[] = []
    for (const s of data.stations) {
      const p = s.placementName ? byName.get(s.placementName) : undefined
      if (!p) continue
      const size = (p.modelId != null ? byId.get(p.modelId) : undefined) ?? BOX_SIZE
      out.push({ station: s, placementId: p.id, x: p.x, y: p.y, radius: Math.max(size.sizeX, size.sizeY) * RING_K })
    }
    return out
  }, [data, placements.list, byId])

  useEffect(() => scene?.setInteractive(false), [scene])
  useEffect(() => scene?.setObjects(sceneObjects), [scene, sceneObjects])
  useEffect(() => {
    scene?.setRings(items.map((i) => ({ id: i.station.id, x: i.x, y: i.y, r: i.radius, color: STATUS_COLOR[i.station.status], strong: i.station.id === selId })))
  }, [scene, items, selId])
  const detailId = detail?.id ?? null
  useEffect(() => {
    if (scene && detailId !== null) scene.frameOverview() // FactoryView 가 같은 커밋에서 plan 을 먼저 그림
  }, [scene, detailId])

  if (drawings.kind === 'error')
    return <ErrorPage code={drawings.error.kind === 'network' ? 'offline' : '500'} detail={drawings.error.message} onRetry={retry} />
  const select = (id: number) => {
    setChosen(id)
    if (user) saveStored(user.username, id)
  }
  const onChip = (id: number) => {
    const it = items.find((i) => i.station.id === id)
    if (selId === id || !it) {
      setSelId(null)
      scene?.frameOverview()
    } else {
      setSelId(id)
      scene?.focusObject(it.placementId)
    }
  }
  const empty = data !== null && data.stations.length === 0
  const head = (
    <>
      <DrawingBar drawings={list} selectedId={drawingId} onSelect={select} canAdd={false} onAdd={() => {}} />
      <button
        className="bar-btn"
        aria-pressed={quality === 'high'}
        onClick={() => {
          const q: Quality = quality === 'high' ? 'low' : 'high'
          setQuality(q)
          saveQuality(q)
        }}
      >
        <Gauge size={14} aria-hidden /> {quality === 'high' ? '고품질' : '저사양'}
      </button>
    </>
  )
  return (
    <AppShell active="dashboard" head={head}>
      {drawings.kind === 'loading' ? (
        <p className="empty-state" role="status">도면 목록 불러오는 중…</p>
      ) : list.length === 0 ? (
        <div className="empty-state">
          <strong>등록된 도면이 없습니다</strong>
          <span>도면을 추가하면 상황판이 여기에 표시됩니다.</span>
        </div>
      ) : (
        <>
          <FactoryView plan={detail?.plan ?? null} planKey={detail?.id} view="3d" quality={quality} onScene={setScene} />
          {state.kind === 'error' && <p className="empty-state" role="alert">{state.error.message}</p>}
          {data && !empty && <ChipLayer scene={scene} items={items} projects={data.projects} selectedId={selId} onSelect={onChip} />}
          {data && !empty && <KpiBar kpi={data.kpi} />}
          {drawingId !== null && <LiveBadge conn={live.conn} />}
          {empty && (
            <div className="empty-state dash-empty">
              <strong>이 도면에는 공정 기준정보가 없습니다</strong>
              {isAdmin && <Link to={`/admin/stations?drawing=${drawingId}`}>기준정보 설정</Link>}
            </div>
          )}
          {live.conn === 'closed' && <p className="empty-state" role="alert">도면을 찾을 수 없습니다.</p>}
          {data && !empty && <EventTicker events={data.events} drawerOpen={drawerOpen} onToggle={() => setDrawerOpen((o) => !o)} />}
          {data && !empty && drawerOpen && (
            <LiveDrawer projects={data.projects} materials={data.materials} events={data.events} onClose={() => setDrawerOpen(false)} />
          )}
        </>
      )}
    </AppShell>
  )
}
