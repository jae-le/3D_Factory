import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDrawing } from './useDrawing'

const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body })
const detail = (version: number) => ({ id: 1, name: '나셀 공장', sourceType: 'dxf', version, createdBy: 'system', createdAt: '', updatedAt: '', plan: { format: 1, rotQ: 0 }, layerRules: {} })

describe('useDrawing', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('id 가 없으면 idle, 있으면 상세를 불러옴', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, detail(1))))
    const { result, rerender } = renderHook(({ id }) => useDrawing(id), { initialProps: { id: null as number | null } })
    expect(result.current.state.kind).toBe('idle')
    rerender({ id: 1 })
    await waitFor(() => expect(result.current.state.kind).toBe('ok'))
  })

  it('저장은 지금 버전으로 PUT, 409 면 다시 불러오고 conflict', async () => {
    let v = 1
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        const body = JSON.parse(String(init.body))
        if (body.version !== v) return json(409, { detail: '다른 사람이 먼저 수정했습니다.' })
        v++
        return json(200, detail(v))
      }
      return json(200, detail(v))
    })
    vi.stubGlobal('fetch', fetch)
    const { result } = renderHook(() => useDrawing(1))
    await waitFor(() => expect(result.current.state.kind).toBe('ok'))
    let r = ''
    await act(async () => { r = await result.current.save({ format: 1, rotQ: 1 } as never) })
    expect(r).toBe('ok')
    expect(result.current.state).toMatchObject({ kind: 'ok', detail: { version: 2 } })
    v = 5 // 다른 사람이 저장함
    await act(async () => { r = await result.current.save({ format: 1, rotQ: 2 } as never) })
    expect(r).toBe('conflict')
    await waitFor(() => expect(result.current.state).toMatchObject({ kind: 'ok', detail: { version: 5 } }))
  })
})
