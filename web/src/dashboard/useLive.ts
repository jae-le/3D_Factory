import { useEffect, useState } from 'react'
import { liveReducer } from './liveReducer'
import type { Conn, LiveMessage, LiveState } from './types'

/** 끊긴 뒤 다시 붙기까지 기다리는 시간 (ms) — 1·2·4·8·16·30초, 그 뒤는 30초 */
export const BACKOFF = [1000, 2000, 4000, 8000, 16000, 30000]
/** 서버가 '도면 없음' 으로 닫을 때의 코드 — 다시 붙지 않음 */
export const CLOSE_NOT_FOUND = 4404

export function liveUrl(drawingId: number, loc: Pick<Location, 'protocol' | 'host'> = window.location): string {
  return `${loc.protocol === 'https:' ? 'wss:' : 'ws:'}//${loc.host}/ws/live?drawing=${drawingId}`
}

export interface Live { conn: Conn; data: LiveState | null }
interface Held extends Live { id: number | null }

/** 한 도면의 상황판 실시간 데이터 (개발 서버는 vite 의 /ws 프록시) */
export function useLive(drawingId: number | null): Live {
  const [held, setHeld] = useState<Held>({ id: drawingId, conn: 'connecting', data: null })
  if (held.id !== drawingId) setHeld({ id: drawingId, conn: 'connecting', data: null }) // 도면이 바뀌면 처음부터 (렌더 중 조정)
  useEffect(() => {
    if (drawingId === null) return
    let ws: WebSocket | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let tries = 0
    let stopped = false
    const update = (f: (h: Held) => Held) => setHeld((h) => (h.id === drawingId ? f(h) : h))
    const connect = () => {
      const sock = new WebSocket(liveUrl(drawingId))
      ws = sock
      sock.onmessage = (e: MessageEvent) => {
        if (stopped || ws !== sock) return
        let msg: LiveMessage
        try {
          msg = JSON.parse(String(e.data)) as LiveMessage
        } catch {
          return
        }
        if (msg.type === 'snapshot') tries = 0
        update((h) => ({ ...h, conn: 'live', data: liveReducer(h.data, msg) }))
      }
      sock.onclose = (e: CloseEvent) => {
        if (stopped || ws !== sock) return
        ws = null
        if (e.code === CLOSE_NOT_FOUND) {
          update((h) => ({ ...h, conn: 'closed' }))
          return
        }
        update((h) => ({ ...h, conn: 'retrying' }))
        timer = setTimeout(connect, BACKOFF[Math.min(tries, BACKOFF.length - 1)])
        tries++
      }
    }
    connect()
    return () => {
      stopped = true
      clearTimeout(timer)
      ws?.close()
    }
  }, [drawingId])
  return held.id === drawingId ? { conn: held.conn, data: held.data } : { conn: 'connecting', data: null }
}
