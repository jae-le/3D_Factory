import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiJson } from './client'

const reply = (status: number, body?: unknown) =>
  vi.fn(async () => ({ ok: status < 400, status, json: async () => body ?? Promise.reject(new Error('no body')) }))

describe('apiJson', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('성공이면 JSON', async () => {
    vi.stubGlobal('fetch', reply(200, { a: 1 }))
    await expect(apiJson('/api/x')).resolves.toEqual({ a: 1 })
  })

  it('네트워크 오류 → network', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    await expect(apiJson('/api/x')).rejects.toMatchObject({ kind: 'network', status: null })
  })

  it('404 → notFound, 서버의 한국어 detail 을 메시지로', async () => {
    vi.stubGlobal('fetch', reply(404, { detail: "도면 'NOPE' 를 찾을 수 없습니다." }))
    const e = await apiJson('/api/x').catch((x: ApiError) => x)
    expect(e).toBeInstanceOf(ApiError)
    expect(e).toMatchObject({ kind: 'notFound', status: 404, message: "도면 'NOPE' 를 찾을 수 없습니다." })
  })

  it('502·503·504 → network (서버 꺼짐·프록시), 500 → server', async () => {
    vi.stubGlobal('fetch', reply(502))
    await expect(apiJson('/api/x')).rejects.toMatchObject({ kind: 'network' })
    vi.stubGlobal('fetch', reply(500, { detail: '서버에서 오류가 났습니다.' }))
    await expect(apiJson('/api/x')).rejects.toMatchObject({ kind: 'server', status: 500 })
  })
})
