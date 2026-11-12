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
  const listRef = useRef<Placement[]>([])
  const list = useMemo(() => (data && data.id === drawingId ? data.rows : []), [data, drawingId])
  useEffect(() => {
    idRef.current = drawingId
    listRef.current = list
  })

  /** 기록이 바뀔 때마다 되돌리기·다시 하기 가능 여부를 다시 그리게 함 */
  const bump = useCallback(() => {
    setFlags({ id: idRef.current, canUndo: history.current.canUndo, canRedo: history.current.canRedo })
  }, [])

  const setRows = useCallback((drawing: number, fn: (rows: Placement[]) => Placement[]) => {
    setData((d) => (d && d.id === drawing ? { id: drawing, rows: fn(d.rows) } : d))
  }, [])

  const reloadList = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    history.current.clear()
    if (drawingId === null) return
    let cancel = false
    listPlacements(drawingId)
      .then((rows) => {
        if (cancel) return
        setData({ id: drawingId, rows })
      })
      .catch((e: Error) => !cancel && setErr({ id: drawingId, message: e.message }))
    return () => {
      cancel = true
    }
  }, [drawingId, tick])

  /** 요청을 보내고, 실패하면 오류 문구 + 서버 기준으로 다시 불러옴 (기록은 비움) */
  const run = useCallback(
    async (fn: (drawing: number) => Promise<void>) => {
      const drawing = idRef.current
      if (drawing === null) return
      try {
        await fn(drawing)
        if (idRef.current === drawing) setErr(null)
      } catch (e) {
        if (idRef.current !== drawing) return
        setErr({ id: drawing, message: (e as Error).message })
        history.current.clear()
        bump()
        reloadList()
      }
    },
    [bump, reloadList],
  )

  const add = useCallback(
    async (items: NewPlacement[]): Promise<Placement[]> => {
      let made: Placement[] = []
      await run(async (drawing) => {
        const res = await createPlacements(drawing, items)
        if (idRef.current !== drawing) return
        made = res
        setRows(drawing, (l) => [...l, ...res])
        if (items.length === 1 && res.length === 1) {
          history.current.push({ kind: 'add', placement: res[0] })
          bump()
        }
      })
      return made
    },
    [run, bump, setRows],
  )

  const update = useCallback(
    (id: number, patch: PlacementPatch) =>
      run(async (drawing) => {
        const cur = listRef.current.find((p) => p.id === id)
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
        if (idRef.current !== drawing) return
        setRows(drawing, (l) => l.map((p) => (p.id === id ? res : p)))
        history.current.push({ kind: 'update', id, before, after: patch })
        bump()
      }),
    [run, bump, setRows],
  )

  const remove = useCallback(
    (id: number) =>
      run(async (drawing) => {
        const cur = listRef.current.find((p) => p.id === id)
        await deletePlacement(id)
        if (idRef.current !== drawing) return
        setRows(drawing, (l) => l.filter((p) => p.id !== id))
        if (cur) {
          history.current.push({ kind: 'delete', placement: cur })
          bump()
        }
      }),
    [run, bump, setRows],
  )

  /** 지워진 항목을 다시 만들고 기록 속 옛 id 를 새 id 로 바꿈 */
  const recreate = useCallback(async (drawing: number, p: Placement) => {
    const [made] = await createPlacements(drawing, [recreateBody(p)])
    if (idRef.current !== drawing) return
    history.current.remap(p.id, made.id)
    setRows(drawing, (l) => [...l, made])
  }, [setRows])

  const erase = useCallback(async (drawing: number, id: number) => {
    await deletePlacement(id)
    if (idRef.current !== drawing) return
    setRows(drawing, (l) => l.filter((p) => p.id !== id))
  }, [setRows])

  const patch = useCallback(async (drawing: number, id: number, body: PlacementPatch) => {
    const res = await updatePlacement(id, body)
    if (idRef.current !== drawing) return
    setRows(drawing, (l) => l.map((p) => (p.id === id ? res : p)))
  }, [setRows])

  const undo = useCallback(
    () =>
      run(async (drawing) => {
        const c = history.current.undo()
        bump()
        if (!c) return
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
  return { list, loading, error, add, update, remove, undo, redo, canUndo: mine && flags.canUndo, canRedo: mine && flags.canRedo, reload }
}
