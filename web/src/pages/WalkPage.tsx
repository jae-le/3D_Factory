import { Gauge } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/context'
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
import { typing } from '../scene/navigation'
import type { SceneObject } from '../scene/objectLayer'
import { loadQuality, saveQuality } from '../scene/qualityPref'
import { buildColliders, type Solid } from '../walk/colliders'
import { WalkController, type WalkMode } from '../walk/controller'
import { Minimap } from '../walk/WalkMinimap'
import type { MiniObject } from '../walk/minimap'
import { WALK } from '../walk/player'
import { findSpawn } from '../walk/spawn'
import { TouchJoystick } from '../walk/TouchJoystick'
import { useWalkInput } from '../walk/useWalkInput'
import { WalkDetail } from '../walk/WalkDetail'
import { WalkHud } from '../walk/WalkHud'
import { WalkOverlay } from '../walk/WalkOverlay'
import { zoneAt } from '../walk/zoneAt'
import { ErrorPage } from './ErrorPage'

const NO_MODELS: ModelInfo[] = []
const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'])
const AISLE = '통로' // 어느 구역에도 없을 때
const FRAME_EVERY = 6 // 이름표·구역은 6프레임마다 (참고 파일)

interface Tip { id: number; x: number; y: number }

/** /walk — 체험 공간: 고른 도면의 3D 를 1인칭으로 걷기 (참고 파일 '공장 3D 체험 공간') */
export function WalkPage() {
  const { user } = useAuth()
  const [drawings, retry] = useDrawings()
  const [chosen, setChosen] = useState<number | null>(() => (user ? loadStored(user.username) : null))
  const [quality, setQuality] = useState<Quality>(loadQuality)
  const [scene, setScene] = useState<SceneHost | null>(null)
  const list = drawings.kind === 'ok' ? drawings.list : []
  const drawingId = pickDrawing(list, chosen)
  const { state } = useDrawing(drawingId)
  const detail = state.kind === 'ok' && state.detail.id === drawingId ? state.detail : null
  const plan = detail?.plan ?? null
  const models = useModels()
  const modelList = models.state.kind === 'ok' ? models.state.list : NO_MODELS
  const placements = usePlacements(detail?.id ?? null)
  const live = useLive(drawingId)
  const data = live.data && live.data.drawingId === drawingId ? live.data : null

  const [ctl, setCtl] = useState<WalkController | null>(null) // 있으면 입장한 상태
  const [mode, setMode] = useState<WalkMode>('walk')
  const [zone, setZone] = useState(AISLE)
  const [tip, setTip] = useState<Tip | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)
  const stage = useRef<HTMLDivElement>(null)
  const kept = useRef<{ drawingId: number; ctl: WalkController } | null>(null) // 같은 도면에 다시 입장하면 걷던 자리부터
  const openRef = useRef(openId)
  const aimRef = useRef<number | null>(null)
  // 도면이 바뀌면 시작 화면으로 (렌더 중 조정)
  const [seen, setSeen] = useState(drawingId)
  if (seen !== drawingId) {
    setSeen(drawingId)
    setCtl(null)
    setMode('walk')
    setOpenId(null)
    setTip(null)
    setZone(AISLE)
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
  // 미니맵: 분류 색으로 그리게 모델 분류를 함께
  const miniObjects = useMemo<MiniObject[]>(
    () =>
      placements.list.map((p) => {
        const m = p.modelId != null ? (byId.get(p.modelId) ?? null) : null
        const size = m ?? BOX_SIZE
        return { x: p.x, y: p.y, rot: p.rot, sizeX: size.sizeX, sizeY: size.sizeY, category: m?.category ?? null }
      }),
    [placements.list, byId],
  )
  const colliders = useMemo(() => {
    if (!plan) return null
    const solids = placements.list.map((p): Solid => {
      const m = p.modelId != null ? (byId.get(p.modelId) ?? null) : null
      const size = m ?? BOX_SIZE
      return { x: p.x, y: p.y, rot: p.rot, sizeX: size.sizeX, sizeY: size.sizeY, category: m?.category ?? null }
    })
    return buildColliders(plan, solids)
  }, [plan, placements.list, byId])
  const ready = colliders !== null && !placements.loading && models.state.kind !== 'loading'
  const zones = plan?.zones ?? null

  const openAt = useCallback(
    (x: number, y: number) => {
      const id = scene?.pickPlacement(x, y, WALK.pickFar) ?? null
      if (id !== null) setOpenId(id)
    },
    [scene],
  )
  const input = useWalkInput(stage, ctl, openAt)

  useEffect(() => {
    openRef.current = openId
    aimRef.current = tip?.id ?? null
  })
  useEffect(() => scene?.setInteractive(false), [scene])
  useEffect(() => scene?.setObjects(sceneObjects), [scene, sceneObjects])
  useEffect(() => scene?.setSelected(openId), [scene, openId])
  const detailId = detail?.id ?? null
  useEffect(() => {
    if (scene && detailId !== null) scene.frameOverview() // 시작 화면 뒤 3D 는 전체 보기
  }, [scene, detailId])
  useEffect(() => {
    if (ctl && colliders && plan) ctl.setColliders(colliders, plan.bounds)
  }, [ctl, colliders, plan])
  // 입장 = 카메라 드라이버, 나가거나 화면을 떠나면 해제 (궤도 시점·OrbitControls 로 돌아감)
  useEffect(() => {
    if (!scene || !ctl) return
    scene.setCameraDriver(ctl)
    return () => scene.setCameraDriver(null)
  }, [scene, ctl])
  // 조감 뷰일 때만 벽 반투명 — 나가거나 도면이 바뀌거나 화면을 떠나면 원래대로
  const ghost = ctl !== null && mode === 'overview'
  useEffect(() => {
    if (!scene) return
    scene.setGhostWalls(ghost)
    return () => scene.setGhostWalls(false)
  }, [scene, ghost])

  // 6프레임마다: 구역 배지 · 커서가 가리키는 배치 이름표 (참고 파일 updateTooltip·updateZoneBadge)
  useEffect(() => {
    if (!scene || !ctl || !zones) return
    let n = 0
    scene.onFrame(() => {
      n = (n + 1) % FRAME_EVERY
      if (n !== 0) return
      const p = ctl.player
      setZone(zoneAt(zones, p.x, p.y)?.name ?? AISLE)
      const c = input.cursor.current
      const id = ctl.mode === 'walk' && !input.dragging.current ? scene.pickPlacement(c.x, c.y, WALK.pickFar) : null
      const r = stage.current?.getBoundingClientRect()
      const x = c.x - (r?.left ?? 0), y = c.y - (r?.top ?? 0) + 22
      const next = id === null ? null : { id, x, y: r?.height ? Math.min(y, r.height - 60) : y }
      setTip((t) => (t?.id === next?.id && t?.x === next?.x && t?.y === next?.y ? t : next))
    })
    return () => scene.onFrame(null)
  }, [scene, ctl, zones, input.cursor, input.dragging])

  // 키: 입장한 뒤에만, 입력칸에 쓰는 중이면 무시
  useEffect(() => {
    if (!ctl) return
    const leave = () => {
      ctl.setMode('walk')
      setMode('walk')
      setTip(null)
      setCtl(null)
    }
    const down = (e: KeyboardEvent) => {
      if (typing() || e.ctrlKey || e.metaKey || e.altKey) return
      if (MOVE_KEYS.has(e.code)) {
        ctl.keyDown(e.code)
        if (e.code.startsWith('Arrow')) e.preventDefault()
        return
      }
      if (e.repeat) return
      if (e.code === 'KeyM') {
        const m = ctl.toggleMode()
        setMode(m)
        if (m === 'overview') setTip(null)
      } else if (e.code === 'KeyE') {
        if (openRef.current !== null) setOpenId(null)
        else if (aimRef.current !== null) setOpenId(aimRef.current)
      } else if (e.code === 'Escape') {
        if (openRef.current !== null) setOpenId(null)
        else leave()
      }
    }
    const up = (e: KeyboardEvent) => ctl.keyUp(e.code)
    // 창을 떠나면 keyup 을 못 받으므로 누른 키를 비움 (계속 걸어가지 않게)
    const blur = () => ctl.clearKeys()
    const hidden = () => {
      if (document.visibilityState === 'hidden') ctl.clearKeys()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
      document.removeEventListener('visibilitychange', hidden)
      ctl.clearKeys()
    }
  }, [ctl])

  if (drawings.kind === 'error')
    return <ErrorPage code={drawings.error.kind === 'network' ? 'offline' : '500'} detail={drawings.error.message} onRetry={retry} />
  const select = (id: number) => {
    setChosen(id)
    if (user) saveStored(user.username, id)
  }
  const enter = () => {
    if (!plan || !colliders || drawingId === null) return
    let c = kept.current?.drawingId === drawingId ? kept.current.ctl : null
    if (!c) {
      c = new WalkController(colliders, plan.bounds, findSpawn(colliders, plan.bounds))
      kept.current = { drawingId, ctl: c }
    }
    c.setMode('walk')
    setMode('walk')
    setCtl(c)
  }
  const byPlacement = new Map(placements.list.map((p) => [p.id, p]))
  const opened = openId !== null ? (byPlacement.get(openId) ?? null) : null
  const openedModel = opened?.modelId != null ? (byId.get(opened.modelId) ?? null) : null
  const station = opened && data ? (data.stations.find((s) => s.placementName === opened.name) ?? null) : null
  const project = station?.projectId != null && data ? (data.projects.find((p) => p.id === station.projectId) ?? null) : null
  const tipName = tip ? byPlacement.get(tip.id)?.name : undefined
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
    <AppShell active="walk" head={head}>
      {drawings.kind === 'loading' ? (
        <p className="empty-state" role="status">도면 목록 불러오는 중…</p>
      ) : list.length === 0 ? (
        <div className="empty-state">
          <strong>등록된 도면이 없습니다</strong>
          <span>도면을 추가하면 체험 공간이 여기에 표시됩니다.</span>
        </div>
      ) : (
        <>
          <div ref={stage} className={ctl ? 'walk-stage on' : 'walk-stage'}>
            <FactoryView plan={plan} planKey={detail?.id} view="3d" quality={quality} onScene={setScene} />
          </div>
          {state.kind === 'error' && (
            <div className="dash-notice">
              <p className="dash-note" role="alert">{state.error.message}</p>
            </div>
          )}
          {ctl && plan ? (
            <>
              <WalkHud mode={mode} zone={zone} tip={tip && tipName ? { name: tipName, x: tip.x, y: tip.y } : null} onTip={() => tip && setOpenId(tip.id)} />
              <Minimap plan={plan} objects={miniObjects} me={() => ctl.player} />
              {opened && <WalkDetail placement={opened} model={openedModel} station={station} project={project} onClose={() => setOpenId(null)} />}
              {input.joy && <TouchJoystick joy={input.joy} />}
            </>
          ) : (
            <WalkOverlay drawingName={detail?.name ?? ''} ready={ready} onEnter={enter} />
          )}
        </>
      )}
    </AppShell>
  )
}
