import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPlacements, deletePlacement, listPlacements, updatePlacement } from './api'
import { History } from './history'
import type { NewPlacement, Placement, PlacementPatch } from './types'

const recreateBody = (p: Placement): NewPlacement => ({ modelId: p.modelId, name: p.name, x: p.x, y: p.y, rot: p.rot, hintLabel: p.hintLabel })

/** 한 도면의 배치 목록 + 즉시 저장 + 되돌리기·다시 하기 */
export function usePlacements(drawingId: number | null) {
  const [data, setData] = useState<{ id: number; rows: Placement[] } | null>(null)
  const [err, setErr] = useState<{ id: number; message: string } | null>(null)
  const [flags, setFlags] = useState({ id: drawingId, canUndo: false, canRedo: false })
  const [tick, setTick] = useState(0)
  const history = useRef(new History())
  const idRef = useRef(drawingId)
  const rowsRef = useRef<Placement[]>([])
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  /** 도면을 바꾸거나 다시 불러올 때마다 +1. 작업은 한 줄로 돌므로 시작할 때의 값과 같아야 결과를 반영함 (A→B→A 로 돌아와도 옛 작업은 버림) */
  const genRef = useRef(0)
  const opGen = useRef(0)
  const list = useMemo(() => (data && data.id === drawingId ? data.rows : []), [data, drawingId])
  useEffect(() => {
    idRef.current = drawingId
  })

  /** 기록이 바뀔 때마다 되돌리기·다시 하기 가능 여부를 다시 그리게 함 */
  const bump = useCallback(() => {
    setFlags({ id: idRef.current, canUndo: history.current.canUndo, canRedo: history.current.canRedo })
  }, [])

  const alive = useCallback((drawing: number) => idRef.current === drawing && genRef.current === opGen.current, [])

  const setRows = useCallback((drawing: number, fn: (rows: Placement[]) => Placement[]) => {
    if (!alive(drawing)) return
    const next = fn(rowsRef.current)
    rowsRef.current = next
    setData({ id: drawing, rows: next })
  }, [alive])

  const reloadList = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    genRef.current++
    history.current.clear()
    rowsRef.current = []
    if (drawingId === null) return
    let cancel = false
    listPlacements(drawingId)
      .then((rows) => {
        if (cancel) return
        rowsRef.current = rows
        setData({ id: drawingId, rows })
      })
      .catch((e: Error) => !cancel && setErr({ id: drawingId, message: e.message }))
    return () => {
      cancel = true
    }
  }, [drawingId, tick])

  /** 요청을 보내고, 실패하면 오류 문구 + 서버 기준으로 다시 불러옴 (기록은 비움) */
  const exec = useCallback(
    async (fn: (drawing: number) => Promise<void>) => {
      const drawing = idRef.current
      if (drawing === null) return
      opGen.current = genRef.current
      try {
        await fn(drawing)
        if (alive(drawing)) setErr(null)
      } catch (e) {
        if (!alive(drawing)) return
        setErr({ id: drawing, message: (e as Error).message })
        history.current.clear()
        bump()
        // 다음 작업이 옛 목록을 보지 않게, 줄 안에서 서버 기준 목록을 바로 다시 읽음
        try {
          const rows = await listPlacements(drawing)
          if (alive(drawing)) {
            rowsRef.current = rows
            setData({ id: drawing, rows })
          }
        } catch {
          if (alive(drawing)) reloadList()
        }
      }
    },
    [alive, bump, reloadList],
  )

  /** 변경 작업은 한 줄로 세워 앞 작업이 끝난(목록·기록 반영까지) 뒤에 시작 */
  const run = useCallback(
    (fn: (drawing: number) => Promise<void>): Promise<void> => {
      const p = queue.current.then(() => exec(fn))
      queue.current = p
      return p
    },
    [exec],
  )

  const add = useCallback(
    async (items: NewPlacement[]): Promise<Placement[]> => {
      let made: Placement[] = []
      await run(async (drawing) => {
        const res = await createPlacements(drawing, items)
        if (!alive(drawing)) return
        made = res
        setRows(drawing, (l) => [...l, ...res])
        if (items.length === 1 && res.length === 1) {
          history.current.push({ kind: 'add', placement: res[0] })
          bump()
        }
      })
      return made
    },
    [run, bump, setRows, alive],
  )

  const update = useCallback(
    (id: number, patch: PlacementPatch) =>
      run(async (drawing) => {
        const cur = rowsRef.current.find((p) => p.id === id)
        const before: PlacementPatch = {}
        if (cur) {
          if (patch.name !== undefined) before.name = cur.name
          if (patch.x !== undefined) before.x = cur.x
          if (patch.y !== undefined) before.y = cur.y
          if (patch.rot !== undefined) before.rot = cur.rot
          if (patch.modelId !== undefined || patch.clearModel) {
            if (cur.modelId != null) before.modelId = cur.modelId
            else before.clearModel = true
          }
        }
        const res = await updatePlacement(id, patch)
        if (!alive(drawing)) return
        setRows(drawing, (l) => l.map((p) => (p.id === id ? res : p)))
        if (cur) {
          history.current.push({ kind: 'update', id, before, after: patch })
          bump()
        }
      }),
    [run, bump, setRows, alive],
  )

  /** 여러 개를 한 번에 (정렬 등): 차례로 저장하고 기록은 묶음 하나 */
  const updateMany = useCallback(
    (list: { id: number; patch: PlacementPatch }[]) =>
      run(async (drawing) => {
        const items: { id: number; before: PlacementPatch; after: PlacementPatch }[] = []
        try {
          for (const { id, patch } of list) {
            const cur = rowsRef.current.find((p) => p.id === id)
            if (!cur) continue
            const before: PlacementPatch = {}
            if (patch.x !== undefined) before.x = cur.x
            if (patch.y !== undefined) before.y = cur.y
            if (patch.rot !== undefined) before.rot = cur.rot
            const res = await updatePlacement(id, patch)
            if (!alive(drawing)) return
            setRows(drawing, (l) => l.map((p) => (p.id === id ? res : p)))
            items.push({ id, before, after: patch })
          }
        } finally {
          if (items.length > 0 && alive(drawing)) {
            history.current.push({ kind: 'batch', items })
            bump()
          }
        }
      }),
    [run, bump, setRows, alive],
  )

  const remove = useCallback(
    (id: number) =>
      run(async (drawing) => {
        const cur = rowsRef.current.find((p) => p.id === id)
        await deletePlacement(id)
        if (!alive(drawing)) return
        setRows(drawing, (l) => l.filter((p) => p.id !== id))
        if (cur) {
          history.current.push({ kind: 'delete', placement: cur })
          bump()
        }
      }),
    [run, bump, setRows, alive],
  )

  /** 지워진 항목을 다시 만들고 기록 속 옛 id 를 새 id 로 바꿈 */
  const recreate = useCallback(async (drawing: number, p: Placement) => {
    const [made] = await createPlacements(drawing, [recreateBody(p)])
    if (!alive(drawing)) return
    history.current.remap(p.id, made.id)
    setRows(drawing, (l) => [...l, made])
  }, [setRows, alive])

  const erase = useCallback(async (drawing: number, id: number) => {
    await deletePlacement(id)
    if (!alive(drawing)) return
    setRows(drawing, (l) => l.filter((p) => p.id !== id))
  }, [setRows, alive])

  const patch = useCallback(async (drawing: number, id: number, body: PlacementPatch) => {
    const res = await updatePlacement(id, body)
    if (!alive(drawing)) return
    setRows(drawing, (l) => l.map((p) => (p.id === id ? res : p)))
  }, [setRows, alive])

  const undo = useCallback(
    () =>
      run(async (drawing) => {
        const c = history.current.undo()
        bump()
        if (!c) return
        if (c.kind === 'batch') {
          for (const i of [...c.items].reverse()) await patch(drawing, i.id, i.before)
          return
        }
        if (c.kind === 'add') await erase(drawing, c.placement.id)
        else if (c.kind === 'delete') await recreate(drawing, c.placement)
        else await patch(drawing, c.id, c.before)
      }),
    [run, bump, erase, recreate, patch],
  )

  const redo = useCallback(
    () =>
      run(async (drawing) => {
        const c = history.current.redo()
        bump()
        if (!c) return
        if (c.kind === 'batch') {
          for (const i of c.items) await patch(drawing, i.id, i.after)
          return
        }
        if (c.kind === 'add') await recreate(drawing, c.placement)
        else if (c.kind === 'delete') await erase(drawing, c.placement.id)
        else await patch(drawing, c.id, c.after)
      }),
    [run, bump, erase, recreate, patch],
  )

  const reload = useCallback(() => {
    history.current.clear()
    bump()
    reloadList()
  }, [bump, reloadList])

  const mine = flags.id === drawingId
  const loading = drawingId !== null && data?.id !== drawingId && err?.id !== drawingId
  const error = err && err.id === drawingId ? err.message : null
  return { list, loading, error, add, update, updateMany, remove, undo, redo, canUndo: mine && flags.canUndo, canRedo: mine && flags.canRedo, reload }
}
