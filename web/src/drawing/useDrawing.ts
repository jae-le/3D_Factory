import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client'
import { getDrawing, savePlan, type DrawingDetail } from './api'
import type { LayerRules, Plan } from './plan/types'

export type DrawingState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; detail: DrawingDetail }
  | { kind: 'error'; error: ApiError }

/** 고른 도면의 상세(plan) 와 저장. 저장은 버전을 붙여 보내고, 어긋나면(409) 다시 불러와 'conflict' */
export function useDrawing(id: number | null) {
  const [state, setState] = useState<DrawingState>({ kind: 'idle' })
  const [tick, setTick] = useState(0)
  const idRef = useRef(id)
  useEffect(() => {
    idRef.current = id
  }, [id])
  useEffect(() => {
    if (id == null) return
    let cancel = false
    getDrawing(id)
      .then((detail) => !cancel && setState({ kind: 'ok', detail }))
      .catch((error: ApiError) => !cancel && setState({ kind: 'error', error }))
    return () => {
      cancel = true
    }
  }, [id, tick])
  const reload = useCallback(() => setTick((n) => n + 1), [])
  const save = useCallback(
    async (plan: Plan, layerRules?: LayerRules): Promise<'ok' | 'conflict'> => {
      if (state.kind !== 'ok') return 'conflict'
      const d = state.detail
      try {
        const next = await savePlan(d.id, d.version, plan, layerRules ?? d.layerRules)
        if (idRef.current === d.id) setState({ kind: 'ok', detail: next })
        return 'ok'
      } catch (e) {
        if (e instanceof ApiError && e.kind === 'conflict') {
          if (idRef.current === d.id) reload()
          return 'conflict'
        }
        throw e
      }
    },
    [state, reload],
  )
  return { state: id == null ? ({ kind: 'idle' } as DrawingState) : state, save, reload }
}
