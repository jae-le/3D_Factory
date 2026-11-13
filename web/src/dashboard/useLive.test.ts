import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiJson, UNAUTHORIZED_EVENT } from '../api/client'
import { useLive } from './useLive'

vi.mock('../api/client', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/client')>()), apiJson: vi.fn() }))
const me = vi.mocked(apiJson)

/** 가짜 WebSocket: 만든 것을 모아 두고 테스트가 메시지·끊김을 일으킴 */
class FakeWS {
  static all: FakeWS[] = []
  url: string
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: ((e: { code: number }) => void) | null = null
  closed = false
  constructor(url: string) {
    this.url = url
    FakeWS.all.push(this)
  }
  close() {
    this.closed = true
  }
  send(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) })
  }
  drop(code = 1006) {
    this.onclose?.({ code })
  }
}
const last = () => FakeWS.all[FakeWS.all.length - 1]
const KPI = { running: 0, ok: 0, warn: 0, bad: 0, doneToday: 0, planRate: 0, at: '2026-11-13T01:00:00Z' }
const snap = (drawingId: number) => ({ type: 'snapshot', drawingId, kpi: KPI, stations: [], projects: [], events: [], materials: [] })

describe('useLive', () => {
  beforeEach(() => {
    FakeWS.all = []
    vi.stubGlobal('WebSocket', FakeWS)
    vi.useFakeTimers()
    me.mockReset()
    me.mockResolvedValue({})
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('주소, snapshot 을 받으면 live', () => {
    const { result } = renderHook(() => useLive(7))
    expect(result.current.conn).toBe('connecting')
    expect(last().url).toBe(`ws://${location.host}/ws/live?drawing=7`)
    act(() => last().send(snap(7)))
    expect(result.current.conn).toBe('live')
    expect(result.current.data?.drawingId).toBe(7)
  })

  it('끊기면 retrying, 마지막 데이터는 유지', () => {
    const { result } = renderHook(() => useLive(7))
    act(() => last().send(snap(7)))
    act(() => last().drop())
    expect(result.current.conn).toBe('retrying')
    expect(result.current.data?.drawingId).toBe(7)
  })

  it('1·2·4·8·16·30·30초 뒤 다시 접속, snapshot 을 받으면 1초부터', () => {
    renderHook(() => useLive(7))
    for (const wait of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
      const n = FakeWS.all.length
      act(() => last().drop())
      act(() => vi.advanceTimersByTime(wait - 1))
      expect(FakeWS.all).toHaveLength(n)
      act(() => vi.advanceTimersByTime(1))
      expect(FakeWS.all).toHaveLength(n + 1)
    }
    act(() => last().send(snap(7)))
    const n = FakeWS.all.length
    act(() => last().drop())
    act(() => vi.advanceTimersByTime(1000))
    expect(FakeWS.all).toHaveLength(n + 1)
  })

  it('snapshot 전에 끊기면 로그인 확인, 풀렸으면 로그아웃 알림', async () => {
    me.mockRejectedValue(new ApiError('unauthorized', 401, '로그인이 필요합니다.'))
    const lost = vi.fn()
    window.addEventListener(UNAUTHORIZED_EVENT, lost)
    try {
      renderHook(() => useLive(7))
      await act(async () => last().drop())
      expect(me).toHaveBeenCalledWith('/api/auth/me')
      expect(lost).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener(UNAUTHORIZED_EVENT, lost)
    }
  })

  it('snapshot 뒤 끊김, 4404, 다른 오류는 로그아웃 알림 없음', async () => {
    const lost = vi.fn()
    window.addEventListener(UNAUTHORIZED_EVENT, lost)
    try {
      renderHook(() => useLive(7))
      act(() => last().send(snap(7)))
      await act(async () => last().drop())
      expect(me).not.toHaveBeenCalled()
      me.mockRejectedValue(new ApiError('network', null, '서버에 연결할 수 없습니다.'))
      act(() => vi.advanceTimersByTime(1000))
      await act(async () => last().drop()) // 새 연결은 snapshot 전 → 확인은 하지만 로그인은 그대로
      expect(me).toHaveBeenCalledTimes(1)
      act(() => vi.advanceTimersByTime(1000))
      await act(async () => last().drop(4404))
      expect(me).toHaveBeenCalledTimes(1)
      expect(lost).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener(UNAUTHORIZED_EVENT, lost)
    }
  })

  it('4404 면 다시 접속하지 않음', () => {
    const { result } = renderHook(() => useLive(7))
    act(() => last().drop(4404))
    expect(result.current.conn).toBe('closed')
    act(() => vi.advanceTimersByTime(60000))
    expect(FakeWS.all).toHaveLength(1)
  })

  it('도면이 바뀌면 닫고 새로, 이전 데이터는 버림', () => {
    const { result, rerender } = renderHook(({ id }) => useLive(id), { initialProps: { id: 7 } })
    const first = last()
    act(() => first.send(snap(7)))
    rerender({ id: 8 })
    expect(first.closed).toBe(true)
    expect(last().url).toContain('drawing=8')
    expect(result.current).toEqual({ conn: 'connecting', data: null })
    act(() => first.send(snap(7))) // 닫힌 연결의 늦은 메시지는 무시
    expect(result.current.data).toBeNull()
  })

  it('도면이 없으면 연결하지 않음', () => {
    renderHook(() => useLive(null))
    expect(FakeWS.all).toHaveLength(0)
  })
})
