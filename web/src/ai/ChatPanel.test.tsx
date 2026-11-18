import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatPanel } from './ChatPanel'
import { useChat } from './useChat'

const LABEL = 'Main Station 1 이동 (10.0, 5.0) → (12.0, 5.0)'
const ITEM = {
  seq: 1, kind: 'placement.move', target: 'Main Station 1', targetKey: 'placement:5',
  before: { id: 5, name: 'Main Station 1', modelId: null, x: 10, y: 5, rot: 0 },
  after: { id: 5, name: 'Main Station 1', modelId: null, x: 12, y: 5, rot: 0 }, label: LABEL,
}
const sse = (events: [string, unknown][]) => events.map(([e, d]) => `event:${e}\ndata:${JSON.stringify(d)}\n\n`).join('')
const STREAM = sse([
  ['text', { t: '장면을 확인하겠습니다.' }],
  ['tool', { name: 'get_scene', label: '장면 확인 중…' }],
  ['tool', { name: 'move_object', label: 'Main Station 1 이동 제안' }],
  ['text', { t: ' 제안을 만들었습니다.' }],
  ['proposal', { id: 'b1', items: [ITEM] }],
  ['done', { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.01 }],
])
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
type Call = { url: string; method: string; body: unknown }

function setup(chatResponse: () => Response = () => new Response(STREAM, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })) {
  const calls: Call[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null })
    if (url === '/api/ai/chat') return chatResponse()
    if (url.startsWith('/api/ai/chat/history')) return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
    if (url.endsWith('/apply')) return json(200, { batchId: 'b1', drawingId: 1, applied: 1, skipped: [] })
    if (url.endsWith('/revert')) return json(200, { batchId: 'b1', reverted: 1 })
    return new Response(null, { status: 204 })
  }))
  const applied = vi.fn(), hover = vi.fn(), focus = vi.fn()
  function H() {
    const chat = useChat(1, applied)
    return <ChatPanel open chat={chat} onHover={hover} onFocus={focus} />
  }
  render(<H />)
  return { calls, applied, hover, focus }
}

function type(text: string, opts: { shiftKey?: boolean } = {}) {
  const box = screen.getByLabelText('AI 에게 보낼 요청')
  fireEvent.change(box, { target: { value: text } })
  fireEvent.keyDown(box, { key: 'Enter', ...opts })
  return box
}

describe('AI 챗봇 패널', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('보내기 → 글자·도구 줄·제안 카드 → 항목 강조·카메라 → 적용 → 되돌리기', async () => {
    const { calls, applied, hover, focus } = setup()
    expect(screen.getByText('3D 공장을 어떻게 바꿀지 말해 주세요.')).toBeInTheDocument()
    type('Main Station 1 을 오른쪽으로 2m 옮겨줘')
    expect(await screen.findByText('장면을 확인하겠습니다. 제안을 만들었습니다.')).toBeInTheDocument()
    expect(screen.getByText('Main Station 1 을 오른쪽으로 2m 옮겨줘')).toHaveClass('chat-msg', 'user')
    expect(screen.getByText('장면 확인 중…')).toBeInTheDocument()
    expect(screen.getByText('Main Station 1 이동 제안')).toBeInTheDocument()
    expect(calls.find((c) => c.url === '/api/ai/chat')?.body).toEqual({ drawingId: 1, message: 'Main Station 1 을 오른쪽으로 2m 옮겨줘' })
    expect((screen.getByLabelText('AI 에게 보낼 요청') as HTMLTextAreaElement).value).toBe('')

    const card = screen.getByRole('region', { name: '변경 제안' })
    expect(within(card).getByText('변경 1건')).toBeInTheDocument()
    const row = within(card).getByRole('button', { name: LABEL })
    fireEvent.mouseEnter(row.closest('li')!)
    expect(hover).toHaveBeenLastCalledWith(1)
    fireEvent.mouseLeave(row.closest('li')!)
    expect(hover).toHaveBeenLastCalledWith(null)
    fireEvent.click(row)
    expect(focus).toHaveBeenCalledWith(expect.objectContaining({ seq: 1 }))

    fireEvent.click(within(card).getByRole('button', { name: '적용' }))
    expect(await within(card).findByText('적용됨 · 1건')).toBeInTheDocument()
    expect(applied).toHaveBeenCalledTimes(1)
    expect(calls.some((c) => c.url === '/api/ai/changes/b1/apply' && c.method === 'POST')).toBe(true)
    fireEvent.click(within(card).getByRole('button', { name: '되돌리기' }))
    expect(await within(card).findByText('되돌렸습니다')).toBeInTheDocument()
    expect(calls.some((c) => c.url === '/api/changes/b1/revert' && c.method === 'POST')).toBe(true)
    expect(applied).toHaveBeenCalledTimes(2)
  })

  it('보내는 중 잠금 · Shift+Enter 는 줄바꿈 · 서버 오류 안내', async () => {
    let ctrl!: ReadableStreamDefaultController<Uint8Array>
    const stream = new ReadableStream<Uint8Array>({ start: (c) => { ctrl = c } })
    const { calls } = setup(() => new Response(stream, { status: 200 }))
    type('줄바꿈만', { shiftKey: true })
    expect(calls.filter((c) => c.url === '/api/ai/chat')).toHaveLength(0)
    const box = type('한도 확인')
    expect(await screen.findByText('답을 쓰는 중…')).toBeInTheDocument()
    expect(box).toBeDisabled()
    expect(screen.getByRole('button', { name: '보내기' })).toBeDisabled()
    ctrl.enqueue(new TextEncoder().encode(sse([['error', { message: '이번 달 AI 사용 한도를 넘었습니다' }]])))
    ctrl.close()
    expect(await screen.findByRole('alert')).toHaveTextContent('이번 달 AI 사용 한도를 넘었습니다')
    expect(box).not.toBeDisabled()
  })

  it('입력 오류(400)는 말풍선에 안내', async () => {
    setup(() => json(400, { detail: '요청은 1~2000자로 입력하세요.' }))
    type('가')
    expect(await screen.findByRole('alert')).toHaveTextContent('요청은 1~2000자로 입력하세요.')
  })

  it('취소는 묶음을 버리고 카드를 닫음, 새 대화는 모두 비움', async () => {
    const { calls } = setup()
    type('옮겨줘')
    const card = await screen.findByRole('region', { name: '변경 제안' })
    fireEvent.click(within(card).getByRole('button', { name: '취소' }))
    await screen.findByText('장면을 확인하겠습니다. 제안을 만들었습니다.')
    expect(await screen.findByText('옮겨줘')).toBeInTheDocument()
    expect(calls.some((c) => c.url === '/api/ai/changes/b1/discard')).toBe(true)
    await vi.waitFor(() => expect(screen.queryByRole('region', { name: '변경 제안' })).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: '새 대화' }))
    expect(screen.queryByText('옮겨줘')).toBeNull()
    expect(calls.some((c) => c.url === '/api/ai/chat/new' && (c.body as { drawingId: number }).drawingId === 1)).toBe(true)
  })

  it('이미지를 붙여 보내면 요청에 실리고 말풍선에 미리보기, 형식이 틀리면 안내', async () => {
    const { calls } = setup()
    const input = screen.getByLabelText('이미지 파일')
    fireEvent.change(input, { target: { files: [new File(['gif'], 'a.gif', { type: 'image/gif' })] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('이미지는 PNG, JPG, WEBP 만 붙일 수 있습니다.')
    fireEvent.change(input, { target: { files: [new File([new Uint8Array([1, 2, 3])], 'plan.png', { type: 'image/png' })] } })
    expect(await screen.findByRole('img', { name: 'plan.png' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '보내기' }))
    await vi.waitFor(() => expect(calls.some((c) => c.url === '/api/ai/chat')).toBe(true))
    const body = calls.find((c) => c.url === '/api/ai/chat')!.body as { message: string; images: { mediaType: string; data: string }[] }
    expect(body.message).toBe('')
    expect(body.images).toEqual([{ mediaType: 'image/png', data: 'AQID' }])
    expect(screen.getByRole('img', { name: '붙인 이미지 1' })).toBeInTheDocument()
  })
})
