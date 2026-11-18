import { ApiError, apiErrorOf, apiJson, apiSend, csrfToken } from '../api/client'
import { sseParser, toChatEvent } from './sse'
import type { AiSettings, AiStatus, AiTestResult, ApplyResult, ChangePage, ChatEvent, UsageReport } from './types'

export const getAiStatus = () => apiJson<AiStatus>('/api/ai/status')

/** 챗봇 요청 → SSE 를 읽어 이벤트마다 onEvent. 400·403 등은 ApiError, 끊으면(signal) AbortError */
export async function streamChat(drawingId: number, message: string, onEvent: (e: ChatEvent) => void, signal?: AbortSignal): Promise<void> {
  let r: Response
  try {
    r = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': csrfToken() },
      body: JSON.stringify({ drawingId, message }),
      signal,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ApiError('network', null, '서버에 연결할 수 없습니다.')
  }
  if (!r.ok || !r.body) {
    const body = (await r.json().catch(() => null)) as { detail?: string } | null
    throw apiErrorOf(r.status, body?.detail)
  }
  const reader = r.body.getReader()
  const dec = new TextDecoder()
  const p = sseParser((m) => {
    const ev = toChatEvent(m)
    if (ev) onEvent(ev)
  })
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    p.push(dec.decode(value, { stream: true }))
  }
  p.push(dec.decode())
  p.end()
}

export const resetChat = (drawingId: number) => apiSend<void>('POST', '/api/ai/chat/reset', { drawingId })
export const applyProposal = (id: string) => apiSend<ApplyResult>('POST', `/api/ai/changes/${id}/apply`)
export const discardProposal = (id: string) => apiSend<void>('POST', `/api/ai/changes/${id}/discard`)
export const revertBatch = (batchId: string) => apiSend<{ batchId: string; reverted: number }>('POST', `/api/changes/${batchId}/revert`)

// 관리자
export const getAiSettings = () => apiJson<AiSettings>('/api/admin/ai')
export const saveAiSettings = (patch: Partial<Pick<AiSettings, 'model' | 'monthlyLimitUsd' | 'enabled'>>) => apiSend<AiSettings>('PUT', '/api/admin/ai', patch)
export const setAiKey = (apiKey: string) => apiSend<AiSettings>('PUT', '/api/admin/ai/key', { apiKey })
export const deleteAiKey = () => apiSend<AiSettings>('DELETE', '/api/admin/ai/key')
export const testAi = () => apiSend<AiTestResult>('POST', '/api/admin/ai/test')
/** 저장된 (Gemini) 키로 쓸 수 있는 모델 목록 */
export const getGeminiModels = () => apiJson<{ id: string; label: string }[]>('/api/admin/ai/gemini-models')

export function getUsage(group: 'day' | 'user', from?: string, to?: string): Promise<UsageReport> {
  const q = new URLSearchParams({ group })
  if (from) q.set('from', from)
  if (to) q.set('to', to)
  return apiJson<UsageReport>(`/api/admin/ai/usage?${q}`)
}

export interface ChangeQuery { drawingId?: number; source?: 'USER' | 'AI'; from?: string; to?: string; page?: number }
export function getChanges(c: ChangeQuery): Promise<ChangePage> {
  const q = new URLSearchParams()
  if (c.drawingId != null) q.set('drawingId', String(c.drawingId))
  if (c.source) q.set('source', c.source)
  if (c.from) q.set('from', c.from)
  if (c.to) q.set('to', c.to)
  q.set('page', String(c.page ?? 0))
  return apiJson<ChangePage>(`/api/changes?${q}`)
}
