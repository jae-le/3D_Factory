import type { ChatEvent } from './types'

export interface SseMessage { event: string; data: string }

/** text/event-stream 조각 → 완성된 메시지. 줄 끝 \n · \r\n · \r, 여러 data 줄은 \n 으로 이음, ':' 주석 무시 */
export function sseParser(onMessage: (m: SseMessage) => void): { push(chunk: string): void; end(): void } {
  let buf = ''
  let event = ''
  let data: string[] = []
  const line = (l: string) => {
    if (l === '') {
      if (data.length) onMessage({ event: event || 'message', data: data.join('\n') })
      event = ''
      data = []
      return
    }
    if (l.startsWith(':')) return
    const i = l.indexOf(':')
    const field = i < 0 ? l : l.slice(0, i)
    let value = i < 0 ? '' : l.slice(i + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') event = value
    else if (field === 'data') data.push(value)
  }
  return {
    push(chunk) {
      buf += chunk
      for (;;) {
        const n = buf.search(/[\r\n]/)
        if (n < 0) return
        if (buf[n] === '\r' && n === buf.length - 1) return // \r\n 이 조각 사이에서 갈릴 수 있음
        const len = buf[n] === '\r' && buf[n + 1] === '\n' ? 2 : 1
        line(buf.slice(0, n))
        buf = buf.slice(n + len)
      }
    },
    end() {
      if (buf) line(buf.replace(/\r$/, ''))
      buf = ''
      line('')
    },
  }
}

/** 서버 이벤트 → 채팅 이벤트 (모르는 이름·깨진 JSON 은 null) */
export function toChatEvent(m: SseMessage): ChatEvent | null {
  let d: Record<string, unknown>
  try {
    d = JSON.parse(m.data) as Record<string, unknown>
  } catch {
    return null
  }
  switch (m.event) {
    case 'text': return { type: 'text', t: String(d.t ?? '') }
    case 'tool': return { type: 'tool', name: String(d.name ?? ''), label: String(d.label ?? '') }
    case 'proposal': return { type: 'proposal', proposal: d as unknown as Extract<ChatEvent, { type: 'proposal' }>['proposal'] }
    case 'done': return { type: 'done', usage: d as unknown as Extract<ChatEvent, { type: 'done' }>['usage'] }
    case 'error': return { type: 'error', message: String(d.message ?? 'AI 챗봇 오류') }
    default: return null
  }
}
