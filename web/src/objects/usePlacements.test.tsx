import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePlacements } from './usePlacements'

const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body })

function fakeServer() {
  let seq = 10
  const rows = new Map<number, { id: number; name: string; x: number; y: number; rot: number; modelId?: number }>([[1, { id: 1, name: '허브 1', x: 0, y: 0, rot: 0, modelId: 5 }]])
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const m = init?.method ?? 'GET'
    if (url === '/api/drawings/3/placements' && m === 'GET') return json(200, [...rows.values()])
    if (url === '/api/drawings/3/placements' && m === 'POST') {
      const made = JSON.parse(String(init!.body)).map((n: object) => ({ rot: 0, ...n, id: ++seq }))
      for (const p of made) rows.set(p.id, p)
      return json(201, made)
    }
    const id = Number(url.split('/').pop())
    if (m === 'PATCH') {
      const p = { ...rows.get(id)!, ...JSON.parse(String(init!.body)) }
      rows.set(id, p)
      return json(200, p)
    }
    if (m === 'DELETE') {
      rows.delete(id)
      return { ok: true, status: 204, json: async () => undefined }
    }
    return json(404, { detail: 'x' })
  })
  return { fetch, rows }
}

describe('usePlacements', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('불러오기 · 이동 · 되돌리기 · 다시 하기', async () => {
    const s = fakeServer()
    vi.stubGlobal('fetch', s.fetch)
    const { result } = renderHook(() => usePlacements(3))
    await waitFor(() => expect(result.current.list).toHaveLength(1))
    await act(() => result.current.update(1, { x: 5, y: 6 }))
    expect(result.current.list[0]).toMatchObject({ x: 5, y: 6 })
    expect(result.current.canUndo).toBe(true)
    await act(() => result.current.undo())
    expect(s.rows.get(1)).toMatchObject({ x: 0, y: 0 })
    expect(result.current.list[0]).toMatchObject({ x: 0, y: 0 })
    await act(() => result.current.redo())
    expect(s.rows.get(1)).toMatchObject({ x: 5, y: 6 })
  })

  it('추가를 되돌리면 삭제, 삭제를 되돌리면 다시 만들고 이후 기록 id 도 바뀜', async () => {
    const s = fakeServer()
    vi.stubGlobal('fetch', s.fetch)
    const { result } = renderHook(() => usePlacements(3))
    await waitFor(() => expect(result.current.list).toHaveLength(1))
    await act(async () => { await result.current.add([{ name: '허브 2', x: 1, y: 1, modelId: 5 }]) })
    expect(result.current.list).toHaveLength(2)
    await act(() => result.current.undo())
    expect(result.current.list).toHaveLength(1)
    await act(() => result.current.update(1, { rot: 90 }))
    await act(() => result.current.remove(1))
    expect(result.current.list).toHaveLength(0)
    await act(() => result.current.undo()) // 다시 만들어짐 (새 id)
    expect(result.current.list).toHaveLength(1)
    const newId = result.current.list[0].id
    expect(newId).not.toBe(1)
    await act(() => result.current.undo()) // 회전 되돌리기는 새 id 로
    expect(s.rows.get(newId)).toMatchObject({ rot: 0 })
  })

  it('여러 개 자동 배치는 기록하지 않음, 실패하면 오류 문구', async () => {
    const s = fakeServer()
    vi.stubGlobal('fetch', s.fetch)
    const { result } = renderHook(() => usePlacements(3))
    await waitFor(() => expect(result.current.list).toHaveLength(1))
    await act(async () => { await result.current.add([{ name: 'a', x: 0, y: 0 }, { name: 'b', x: 1, y: 1 }]) })
    expect(result.current.canUndo).toBe(false)
    s.fetch.mockImplementationOnce(async () => json(409, { detail: '같은 이름의 객체가 이 도면에 있습니다.' }))
    await act(() => result.current.update(1, { name: 'a' }))
    expect(result.current.error).toBe('같은 이름의 객체가 이 도면에 있습니다.')
  })

  it('빠르게 두 번 되돌려도 순서대로 처리 (삭제 되돌린 새 id 로 회전 되돌리기)', async () => {
    const s = fakeServer()
    vi.stubGlobal('fetch', s.fetch)
    const { result } = renderHook(() => usePlacements(3))
    await waitFor(() => expect(result.current.list).toHaveLength(1))
    await act(() => result.current.update(1, { rot: 90 }))
    await act(() => result.current.remove(1))
    await act(async () => { await Promise.all([result.current.undo(), result.current.undo()]) })
    expect(result.current.error).toBeNull()
    expect(s.rows.size).toBe(1)
    const [row] = [...s.rows.values()]
    expect(row.id).not.toBe(1)
    expect(row.rot).toBe(0)
    expect(result.current.list).toHaveLength(1)
  })

  it('같은 항목을 연달아 고쳐도 이전 값이 정확해 두 번 되돌리면 원래대로', async () => {
    const s = fakeServer()
    vi.stubGlobal('fetch', s.fetch)
    const { result } = renderHook(() => usePlacements(3))
    await waitFor(() => expect(result.current.list).toHaveLength(1))
    await act(async () => { await Promise.all([result.current.update(1, { x: 5 }), result.current.update(1, { x: 9 })]) })
    expect(s.rows.get(1)).toMatchObject({ x: 9 })
    await act(async () => { await Promise.all([result.current.undo(), result.current.undo()]) })
    expect(s.rows.get(1)).toMatchObject({ x: 0 })
    expect(result.current.error).toBeNull()
  })

  it('도면이 없으면 빈 목록', () => {
    const { result } = renderHook(() => usePlacements(null))
    expect(result.current.list).toEqual([])
  })
})
