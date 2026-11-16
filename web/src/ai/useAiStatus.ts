import { useEffect, useState } from 'react'
import { getAiStatus } from './api'
import type { AiStatus } from './types'

export type AiState = { kind: 'loading' } | { kind: 'ok'; status: AiStatus } | { kind: 'error' }

let pending: Promise<AiStatus> | null = null

/** 같은 순간(레일·화면이 함께 그려질 때)의 요청은 하나로 */
function load(): Promise<AiStatus> {
  if (!pending) pending = getAiStatus().finally(() => (pending = null))
  return pending
}

/** 챗봇 사용 가능 여부 (레일 버튼·3D 공장 화면) */
export function useAiStatus(): AiState {
  const [state, setState] = useState<AiState>({ kind: 'loading' })
  useEffect(() => {
    let cancel = false
    load()
      .then((s) => !cancel && setState(typeof s?.enabled === 'boolean' ? { kind: 'ok', status: s } : { kind: 'error' }))
      .catch(() => !cancel && setState({ kind: 'error' }))
    return () => {
      cancel = true
    }
  }, [])
  return state
}
