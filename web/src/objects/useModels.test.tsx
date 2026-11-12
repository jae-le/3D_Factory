import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { modelFileUrl, modelThumbUrl } from './api'
import { useModels } from './useModels'

describe('useModels', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('목록과 버전 붙은 주소', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [{ id: 2, name: '허브', version: 3 }] })))
    const { result } = renderHook(() => useModels())
    await waitFor(() => expect(result.current.state.kind).toBe('ok'))
    expect(modelFileUrl({ id: 2, version: 3 })).toBe('/api/models/2/file?v=3')
    expect(modelThumbUrl({ id: 2, version: 3 })).toBe('/api/models/2/thumbnail?v=3')
  })
})
