import { describe, expect, it } from 'vitest'
import { sseParser, toChatEvent, type SseMessage } from './sse'

function parse(chunks: string[]): SseMessage[] {
  const got: SseMessage[] = []
  const p = sseParser((m) => got.push(m))
  for (const c of chunks) p.push(c)
  p.end()
  return got
}

describe('SSE 파서', () => {
  it('Spring 형식(콜론 뒤 공백 없음)과 조각난 줄', () => {
    const got = parse(['event:te', 'xt\ndata:{"t":"안', '녕"}\n', '\nevent:done\nda', 'ta:{"costUsd":0.1}\n\n'])
    expect(got).toEqual([
      { event: 'text', data: '{"t":"안녕"}' },
      { event: 'done', data: '{"costUsd":0.1}' },
    ])
  })

  it('CRLF · \\r\\n 이 조각 사이에서 갈림 · 여러 data 줄 · 주석 · 이름 없는 이벤트', () => {
    const got = parse([': ping\r\n', 'data: a\r', '\ndata: b\r\n\r\n', 'data:x'])
    expect(got).toEqual([
      { event: 'message', data: 'a\nb' },
      { event: 'message', data: 'x' }, // 끝(end)에서 마저 내보냄
    ])
  })

  it('채팅 이벤트로 바꿈 (모르는 이름·깨진 JSON 은 버림)', () => {
    expect(toChatEvent({ event: 'text', data: '{"t":"가"}' })).toEqual({ type: 'text', t: '가' })
    expect(toChatEvent({ event: 'tool', data: '{"name":"get_scene","label":"장면 확인 중…"}' })).toEqual({ type: 'tool', name: 'get_scene', label: '장면 확인 중…' })
    expect(toChatEvent({ event: 'proposal', data: '{"id":"b1","items":[]}' })).toEqual({ type: 'proposal', proposal: { id: 'b1', items: [] } })
    expect(toChatEvent({ event: 'done', data: '{"inputTokens":1,"outputTokens":2,"cacheReadTokens":0,"cacheWriteTokens":0,"costUsd":0.5}' }))
      .toEqual({ type: 'done', usage: { inputTokens: 1, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.5 } })
    expect(toChatEvent({ event: 'error', data: '{"message":"한도"}' })).toEqual({ type: 'error', message: '한도' })
    expect(toChatEvent({ event: 'ping', data: '{}' })).toBeNull()
    expect(toChatEvent({ event: 'text', data: '{깨짐' })).toBeNull()
  })
})
