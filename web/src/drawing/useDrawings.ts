import { useEffect, useState } from 'react'
import { ApiError, apiJson } from '../api/client'
import type { DrawingSummary } from '../api/types'

export type DrawingList =
  | { kind: 'loading' }
  | { kind: 'ok'; list: DrawingSummary[] }
  | { kind: 'error'; error: ApiError }

/** 서버의 도면 목록. [상태, 다시 시도(불러오는 중 표시), 조용히 새로 고침(화면 유지)] */
export function useDrawings(): [DrawingList, () => void, () => Promise<void>] {
  const [state, setState] = useState<DrawingList>({ kind: 'loading' })
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let cancel = false
    apiJson<DrawingSummary[]>('/api/drawings')
      .then((list) => !cancel && setState({ kind: 'ok', list }))
      .catch((error: ApiError) => !cancel && setState({ kind: 'error', error }))
    return () => {
      cancel = true
    }
  }, [reload])
  return [
    state,
    () => {
      setState({ kind: 'loading' })
      setReload((n) => n + 1)
    },
    () =>
      apiJson<DrawingSummary[]>('/api/drawings')
        .then((list) => setState({ kind: 'ok', list }))
        .catch(() => setReload((n) => n + 1)), // 실패하면 평소처럼 다시 불러옴
  ]
}

/** 기억한 도면이 목록에 있으면 그것, 없으면 첫 도면 */
export function pickDrawing(list: DrawingSummary[], stored: number | null): number | null {
  if (stored !== null && list.some((d) => d.id === stored)) return stored
  return list[0]?.id ?? null
}

const key = (username: string) => `f3d:drawing:${username}`

/** 마지막으로 고른 도면 (사용자별, 브라우저에 저장 — 막혀 있으면 기억 안 함) */
export function loadStored(username: string): number | null {
  try {
    const v = localStorage.getItem(key(username))
    return v ? Number(v) : null
  } catch {
    return null
  }
}

export function saveStored(username: string, id: number): void {
  try {
    localStorage.setItem(key(username), String(id))
  } catch {
    /* 저장 못 해도 화면은 동작 */
  }
}
