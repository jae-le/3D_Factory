import { Box, Gauge, Map as MapIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { previewItems } from '../ai/chat'
import { ChatPanel } from '../ai/ChatPanel'
import { focusOf, previewOf, type Preview } from '../ai/preview'
import type { ProposalItem } from '../ai/types'
import { useAiStatus } from '../ai/useAiStatus'
import { useChat } from '../ai/useChat'
import { hasRole, useAuth } from '../auth/context'
import { AddDrawingDialog } from '../drawing/AddDrawingDialog'
import { DrawingTools } from '../drawing/DrawingTools'
import { InfoCard } from '../drawing/InfoCard'
import type { Plan, UnitName } from '../drawing/plan/types'
import { useDrawing } from '../drawing/useDrawing'
import { loadStored, pickDrawing, saveStored, useDrawings } from '../drawing/useDrawings'
import { AppShell } from '../layout/AppShell'
import { DrawingBar } from '../layout/DrawingBar'
import { OBJECTS_PANEL_KEY, OPEN_CHAT_KEY } from '../layout/IconRail'
import { modelFileUrl } from '../objects/api'
import { AddModelDialog } from '../objects/AddModelDialog'
import { EditTag } from '../objects/EditTag'
import { cellSize, editCells, editTag, rectOf, snapToCells } from '../objects/grid'
import { nextName } from '../objects/match'
import { ObjectInfo } from '../objects/ObjectInfo'
import { ObjectPanel } from '../objects/ObjectPanel'
import { BOX_SIZE, type ModelInfo, type Placement } from '../objects/types'
import { useModels } from '../objects/useModels'
import { usePlacements } from '../objects/usePlacements'
import type { ObjectHost, PickSource, PreviewHost, Quality, ViewMode } from '../scene/FactoryScene'
import { FactoryView } from '../scene/FactoryView'
import type { SceneObject } from '../scene/objectLayer'
import { ErrorPage } from './ErrorPage'

const UNIT_SCALE: Record<UnitName, number> = { inch: 0.0254, feet: 0.3048, mm: 0.001, cm: 0.01, m: 1 }
const NO_MODELS: ModelInfo[] = []
const PLACING_HINT = '클릭해 놓기 · 오른쪽 클릭 90° 회전 · Shift 격자 없이 · Esc 끝'
type Side = 'objects' | 'chat' | null
type ViewPref = { mode: ViewMode; quality: Quality }
type DragPos = { id: number; x: number; y: number }

function loadView(): ViewPref {
  try {
    return { mode: '3d', quality: 'high', ...JSON.parse(localStorage.getItem('f3d:view') ?? '{}') }
  } catch {
    return { mode: '3d', quality: 'high' }
  }
}

/** 입력칸에 글을 쓰는 중인가 (단축키 되돌리기 제외용) */
function typing(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

const sizeOf = (p: Placement, byId: Map<number, ModelInfo>) => (p.modelId != null ? (byId.get(p.modelId) ?? BOX_SIZE) : BOX_SIZE)

/** / — 3D 공장 화면: 도면 select · 3D · 보기 전환 · 정보 카드 · 도면 도구 · 객체 패널(배치·선택·편집·되돌리기) */
export function FactoryPage() {
  const { user } = useAuth()
  const canEdit = hasRole(user, 'OPERATOR')
  const [drawings, retry, refresh] = useDrawings()
  const [chosen, setChosen] = useState<number | null>(() => (user ? loadStored(user.username) : null))
  const [pref, setPref] = useState<ViewPref>(loadView)
  const [scene, setScene] = useState<(PickSource & ObjectHost & PreviewHost) | null>(null)
  const list = drawings.kind === 'ok' ? drawings.list : []
  const drawingId = pickDrawing(list, chosen)
  const { state, save, reload: reloadDrawing } = useDrawing(drawingId)
  const detail = state.kind === 'ok' && state.detail.id === drawingId ? state.detail : null
  const [adding, setAdding] = useState(false)
  const [addingModel, setAddingModel] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  // 객체
  const models = useModels()
  const modelList = models.state.kind === 'ok' ? models.state.list : NO_MODELS
  const placements = usePlacements(detail?.id ?? null)
  // AI 챗봇 (운전원 이상 + Claude API 사용 가능)
  const ai = useAiStatus()
  const canChat = canEdit && ai.kind === 'ok' && ai.status.enabled
  const chat = useChat(canChat ? (detail?.id ?? null) : null, () => {
    placements.reload()
    reloadDrawing()
  })
  const { add, update, remove, undo, redo } = placements
  const [selId, setSelId] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [placing, setPlacing] = useState<ModelInfo | null>(null)
  const [dragPos, setDragPos] = useState<DragPos | null>(null)
  const [toolOn, setToolOn] = useState(false)
  // 옆 패널: 객체 · AI 챗봇 · 없음 (하나만). 다른 화면에서 레일 'AI 챗봇' 을 누르고 왔으면 챗봇
  const [side, setSideState] = useState<Side>(() => {
    try {
      if (localStorage.getItem(OPEN_CHAT_KEY) === '1') return 'chat'
      return localStorage.getItem(OBJECTS_PANEL_KEY) !== '0' ? 'objects' : null
    } catch {
      return 'objects'
    }
  })
  useEffect(() => {
    try {
      localStorage.removeItem(OPEN_CHAT_KEY)
    } catch {
      /* 없어도 동작 */
    }
  }, [])
  const setSide = (next: Side) => {
    if (next === 'objects' || side === 'objects') {
      try {
        localStorage.setItem(OBJECTS_PANEL_KEY, next === 'objects' ? '1' : '0')
      } catch {
        /* 저장 못 해도 동작 */
      }
    }
    setSideState(next)
  }
  const pendingNames = useRef(new Set<string>()) // 놓기 요청 중인 이름 — 빠른 연속 놓기에도 이름이 겹치지 않게
  // 도면이 바뀌면 선택·편집·배치 모드를 끝냄 (렌더 중 조정)
  const [objDrawing, setObjDrawing] = useState(detail?.id ?? null)
  if (objDrawing !== (detail?.id ?? null)) {
    setObjDrawing(detail?.id ?? null)
    setSelId(null)
    setEditingId(null)
    setPlacing(null)
    setDragPos(null)
  }

  // 배치 저장 실패·모델 목록 실패는 토스트로 (새 오류가 생길 때 한 번)
  const errText = placements.error ?? (models.state.kind === 'error' ? `모델 목록을 불러오지 못했습니다: ${models.state.error.message}` : null)
  const [shownErr, setShownErr] = useState<string | null>(null)
  if (errText !== shownErr) {
    setShownErr(errText)
    if (errText) setToast(errText)
  }

  const byId = useMemo(() => new Map(modelList.map((m) => [m.id, m])), [modelList])
  const chatOn = side === 'chat' && canChat
  const previewList = chatOn ? previewItems(chat.state) : null
  const preview = useMemo<Preview | null>(
    () => (previewList && previewList.length > 0 ? previewOf(previewList, (id) => (id != null ? (byId.get(id) ?? BOX_SIZE) : BOX_SIZE)) : null),
    [previewList, byId],
  )
  const focusItem = (it: ProposalItem) => {
    const f = focusOf(it)
    if (f) scene?.focusPoint(f.x, f.y)
  }
  const rows = placements.list
  const selected = rows.find((p) => p.id === selId) ?? null
  const editing = editingId != null && rows.some((p) => p.id === editingId) ? editingId : null
  const sceneObjects = useMemo<SceneObject[]>(
    () =>
      rows.map((p) => {
        const m = p.modelId != null ? (byId.get(p.modelId) ?? null) : null
        const size = m ?? BOX_SIZE
        // 끌기 중(그리고 저장 응답 전)인 객체는 끈 자리를 그대로 — 다시 그려도 제자리로 튀지 않게
        const at = dragPos && dragPos.id === p.id ? dragPos : p
        return { id: p.id, name: p.name, url: m ? modelFileUrl(m) : null, sizeX: size.sizeX, sizeY: size.sizeY, sizeZ: size.sizeZ, x: at.x, y: at.y, rot: p.rot, label: p.hintLabel ?? p.name }
      }),
    [rows, byId, dragPos],
  )

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

  // 3D 와 맞추기
  useEffect(() => scene?.setObjects(sceneObjects), [scene, sceneObjects])
  useEffect(() => scene?.setPreview(preview), [scene, preview])
  useEffect(() => scene?.setSelected(selected?.id ?? null), [scene, selected?.id])
  useEffect(() => scene?.setEditing(editing), [scene, editing])
  useEffect(() => {
    if (!scene) return
    scene.setPlacing(placing ? { url: modelFileUrl(placing), sizeX: placing.sizeX, sizeY: placing.sizeY, sizeZ: placing.sizeZ } : null)
    return () => scene.setPlacing(null)
  }, [scene, placing])
  useEffect(() => {
    if (!scene) return
    scene.setObjectEvents({
      onSelect: (id) => {
        setSelId(id)
        setEditingId((e) => (e === id ? e : null))
      },
      onDrag: (id, x, y) => setDragPos({ id, x, y }),
      onDrop: (id, x, y) => {
        setDragPos({ id, x, y })
        void update(id, { x, y }).finally(() => setDragPos((d) => (d && d.id === id && d.x === x && d.y === y ? null : d)))
      },
      onPlace: (x, y, rot) => {
        if (!placing) return
        const name = nextName(placing.name, [...rows.map((p) => p.name), ...pendingNames.current])
        pendingNames.current.add(name)
        void add([{ modelId: placing.id, name, x, y, rot }]).finally(() => pendingNames.current.delete(name))
      },
    })
    return () => scene.setObjectEvents(null)
  }, [scene, placing, rows, add, update])

  // 단축키: Ctrl+Z 되돌리기 · Ctrl+Y / Ctrl+Shift+Z 다시 하기 · Esc 배치 모드 → 편집 → 선택 순으로 끝
  const keys = useRef<(e: KeyboardEvent) => void>(() => {})
  useEffect(() => {
    keys.current = (e) => {
      if (e.key === 'Escape') {
        if (toolOn || adding || addingModel || typing(e.target)) return // 도구·창·입력칸이 먼저 Esc 를 받음
        if (placing) setPlacing(null)
        else if (editing != null) setEditingId(null)
        else setSelId(null)
        return
      }
      if (!canEdit || !(e.ctrlKey || e.metaKey) || typing(e.target) || adding || addingModel) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault()
        void undo()
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault()
        void redo()
      }
    }
  })
  useEffect(() => {
    const on = (e: KeyboardEvent) => keys.current(e)
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [])

  if (drawings.kind === 'error')
    return <ErrorPage code={drawings.error.kind === 'network' ? 'offline' : '500'} detail={drawings.error.message} onRetry={retry} />
  const select = (id: number) => {
    setChosen(id)
    if (user) saveStored(user.username, id)
  }
  const onSave = async (p: Plan, opts?: { scaleFactor?: number }) => {
    try {
      const r = await save(p, undefined, opts?.scaleFactor)
      if (r === 'conflict') setToast('다른 사람이 먼저 수정했습니다. 다시 불러옵니다.')
      else if (opts?.scaleFactor != null) placements.reload()
    } catch (e) {
      setToast((e as Error).message)
    }
  }
  const onToolChange = (active: boolean) => {
    setToolOn(active)
    if (!active) return
    setPlacing(null)
    setEditingId(null)
  }
  const pickModel = (m: ModelInfo) => {
    if (!canEdit || toolOn) return
    setEditingId(null)
    setPlacing((cur) => (cur?.id === m.id ? null : m)) // 같은 카드를 다시 누르면 끝
  }
  const selectFromList = (id: number) => {
    setSelId(id)
    setEditingId((e) => (e === id ? e : null))
    scene?.focusObject(id)
  }

  // 편집 격자 태그 (끄는 중이면 끈 자리 기준)
  let tag: string | null = null
  if (placing) tag = PLACING_HINT
  else if (editing != null && selected && selected.id === editing && detail) {
    const at = dragPos && dragPos.id === editing ? dragPos : selected
    const c = cellSize(detail.plan.bounds)
    const rect = rectOf({ x: at.x, y: at.y, rot: selected.rot }, sizeOf(selected, byId))
    const others = rows.filter((p) => p.id !== editing).map((p) => rectOf(p, sizeOf(p, byId)))
    tag = editTag(rect, editCells(rect, others, c), c)
  }

  const objectInfo = selected && (
    <ObjectInfo
      key={`${selected.id}:${selected.name}`}
      placement={dragPos && dragPos.id === selected.id ? { ...selected, x: dragPos.x, y: dragPos.y } : selected}
      model={selected.modelId != null ? (byId.get(selected.modelId) ?? null) : null}
      models={modelList}
      canEdit={canEdit}
      editing={editing === selected.id}
      onRename={(name) => {
        if (rows.some((p) => p.id !== selected.id && p.name === name)) setToast(`같은 이름의 객체가 이미 있습니다: ${name}`)
        else void update(selected.id, { name })
      }}
      onEdit={() => {
        setPlacing(null)
        setEditingId(editing === selected.id ? null : selected.id)
      }}
      onRotate={() => {
        const rot = (selected.rot + 90) % 360
        if (editing === selected.id && detail) {
          const { x, y } = snapToCells(rectOf({ x: selected.x, y: selected.y, rot }, sizeOf(selected, byId)), selected.x, selected.y, cellSize(detail.plan.bounds))
          void update(selected.id, { rot, x, y })
        } else void update(selected.id, { rot })
      }}
      onDelete={() => {
        setSelId(null)
        setEditingId(null)
        void remove(selected.id)
      }}
      onAssign={(modelId) => void update(selected.id, { modelId })}
      onClose={() => {
        setSelId(null)
        setEditingId(null)
      }}
    />
  )

  const head = (
    <>
      <DrawingBar drawings={list} selectedId={drawingId} onSelect={select} canAdd={canEdit} onAdd={() => setAdding(true)} />
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
  const objectPanel = detail && drawings.kind === 'ok' && list.length > 0 && (
    <ObjectPanel
      open={side === 'objects'}
      models={modelList}
      placements={rows}
      canEdit={canEdit}
      selectedId={selected?.id ?? null}
      placingModelId={placing?.id ?? null}
      onPickModel={pickModel}
      onSelect={selectFromList}
      onAddModel={() => setAddingModel(true)}
    />
  )
  const chatPanel = canChat && detail && (
    <ChatPanel open={chatOn} chat={chat} onHover={(seq) => scene?.highlightPreview(seq)} onFocus={focusItem} />
  )
  const objectsOpen = side === 'objects' && !!objectPanel
  const rail = {
    objectsOpen,
    onObjects: () => setSide(objectsOpen ? null : 'objects'),
    chatOpen: chatOn,
    onChat: () => setSide(chatOn ? null : 'chat'),
  }
  return (
    <AppShell active="factory" head={head} side={<>{objectPanel}{chatPanel}</>} panel={rail}>
      {drawings.kind === 'loading' ? (
        <p className="empty-state" role="status">도면 목록 불러오는 중…</p>
      ) : list.length === 0 ? (
        <div className="empty-state">
          <strong>등록된 도면이 없습니다</strong>
          <span>도면을 추가하면 3D 공장이 여기에 표시됩니다.</span>
        </div>
      ) : (
        <>
          <FactoryView plan={detail?.plan ?? null} planKey={detail?.id} view={pref.mode} quality={pref.quality} onScene={setScene} />
          {state.kind === 'error' && <p className="empty-state" role="alert">{state.error.message}</p>}
          {detail && <DrawingTools scene={scene} plan={detail.plan} canEdit={canEdit} onSave={onSave} onToolChange={onToolChange} />}
          {objectInfo}
          {tag && <EditTag text={tag} />}
          {toast && <p className={tag ? 'toast raised' : 'toast'} role="status">{toast}</p>}
          {detail && (
            <InfoCard
              name={detail.name}
              plan={detail.plan}
              calibrated={Math.abs(detail.plan.scale - UNIT_SCALE[detail.plan.unit]) > 1e-9}
            />
          )}
        </>
      )}
      {adding && <AddDrawingDialog onClose={() => setAdding(false)} onCreated={(id, placed, placeError) => {
          setAdding(false)
          select(id)
          void refresh()
          if (placed) setToast(placed.unmatched > 0 ? `객체 ${placed.count}개 배치 (모델 없음 ${placed.unmatched}개)` : `객체 ${placed.count}개 배치`)
          else if (placeError) setToast(`객체 자동 배치에 실패했습니다: ${placeError}`)
        }} />}
      {addingModel && (
        <AddModelDialog
          onClose={() => setAddingModel(false)}
          onCreated={(m) => {
            setAddingModel(false)
            models.reload()
            setEditingId(null)
            setPlacing(m)
          }}
        />
      )}
    </AppShell>
  )
}
