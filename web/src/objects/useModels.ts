import { useCallback, useEffect, useState } from 'react'
import type { ApiError } from '../api/client'
import { listModels } from './api'
import type { ModelInfo } from './types'

export type ModelsState = { kind: 'loading' } | { kind: 'ok'; list: ModelInfo[] } | { kind: 'error'; error: ApiError }

/** 모델 라이브러리 목록 */
export function useModels() {
  const [state, setState] = useState<ModelsState>({ kind: 'loading' })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let cancel = false
    listModels()
      .then((list) => !cancel && setState({ kind: 'ok', list }))
      .catch((error: ApiError) => !cancel && setState({ kind: 'error', error }))
    return () => {
      cancel = true
    }
  }, [tick])
  const reload = useCallback(() => setTick((n) => n + 1), [])
  return { state, reload }
}
