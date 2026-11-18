import { describe, expect, it } from 'vitest'
import { chatReducer, initialChat, previewItems, type AiMsg, type ChatAction, type ChatState } from './chat'
import type { Proposal } from './types'

const P: Proposal = {
  id: 'b1',
  items: [{ seq: 1, kind: 'placement.move', target: 'MS1', targetKey: 'placement:1', before: { name: 'MS1', x: 1, y: 1, rot: 0 }, after: { name: 'MS1', x: 3, y: 1, rot: 0 }, label: 'MS1 이동' }],
}
const run = (actions: ChatAction[], s: ChatState = initialChat()) => actions.reduce(chatReducer, s)
const lastAi = (s: ChatState) => s.msgs[s.msgs.length - 1] as AiMsg

describe('챗 상태', () => {
  it('보내기 → 글자 조각·도구 줄·제안·끝', () => {
    const s = run([
      { type: 'send', text: '옮겨줘' },
      { type: 'event', ev: { type: 'text', t: '장면을 ' } },
      { type: 'event', ev: { type: 'tool', name: 'get_scene', label: '장면 확인 중…' } },
      { type: 'event', ev: { type: 'text', t: '확인했습니다.' } },
      { type: 'event', ev: { type: 'proposal', proposal: P } },
      { type: 'event', ev: { type: 'done', usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.01 } } },
    ])
    expect(s.msgs.map((m) => m.role)).toEqual(['user', 'ai'])
    expect(s.msgs[0]).toMatchObject({ role: 'user', text: '옮겨줘' })
    expect(lastAi(s)).toMatchObject({ text: '장면을 확인했습니다.', tools: [{ name: 'get_scene', label: '장면 확인 중…' }], done: true, error: null })
    expect(s.sending).toBe(false)
    expect(s.proposal).toMatchObject({ status: 'open', proposal: P })
    expect(previewItems(s)).toHaveLength(1)
  })

  it('오류 · 끊김 · 실패', () => {
    const e = run([{ type: 'send', text: 'a' }, { type: 'event', ev: { type: 'error', message: '한도를 넘었습니다' } }])
    expect(lastAi(e)).toMatchObject({ error: '한도를 넘었습니다', done: true })
    expect(e.sending).toBe(false)
    const cut = run([{ type: 'send', text: 'a' }, { type: 'event', ev: { type: 'text', t: '반' } }, { type: 'end' }])
    expect(lastAi(cut)).toMatchObject({ text: '반', error: '응답이 중간에 끊겼습니다', done: true })
    const ok = run([{ type: 'send', text: 'a' }, { type: 'event', ev: { type: 'done', usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0 } } }, { type: 'end' }])
    expect(lastAi(ok).error).toBeNull()
    const fail = run([{ type: 'send', text: 'a' }, { type: 'fail', message: '서버에 연결할 수 없습니다.' }])
    expect(lastAi(fail)).toMatchObject({ error: '서버에 연결할 수 없습니다.', done: true })
  })

  it('적용 → 적용됨(미리보기 끝) → 되돌리기, 실패하면 그 앞 상태 + 안내', () => {
    let s = run([{ type: 'send', text: 'a' }, { type: 'event', ev: { type: 'proposal', proposal: P } }])
    s = chatReducer(s, { type: 'applying' })
    expect(s.proposal?.status).toBe('applying')
    expect(previewItems(s)).toHaveLength(1)
    s = chatReducer(s, { type: 'proposalError', message: '충돌' })
    expect(s.proposal).toMatchObject({ status: 'open', error: '충돌' })
    s = chatReducer(s, { type: 'applying' })
    s = chatReducer(s, { type: 'applied', result: { batchId: 'b1', drawingId: 1, applied: 1, skipped: [] } })
    expect(s.proposal).toMatchObject({ status: 'applied', error: null, result: { applied: 1 } })
    expect(previewItems(s)).toEqual([])
    s = chatReducer(s, { type: 'reverting' })
    s = chatReducer(s, { type: 'proposalError', message: '이후에 바뀐 객체가 있어 되돌릴 수 없습니다' })
    expect(s.proposal?.status).toBe('applied')
    s = chatReducer(chatReducer(s, { type: 'reverting' }), { type: 'reverted' })
    expect(s.proposal?.status).toBe('reverted')
  })

  it('빈 제안은 카드를 닫고, 취소·새 대화는 비움', () => {
    let s = run([{ type: 'send', text: 'a' }, { type: 'event', ev: { type: 'proposal', proposal: P } }])
    s = chatReducer(s, { type: 'event', ev: { type: 'proposal', proposal: { id: 'b1', items: [] } } })
    expect(s.proposal).toBeNull()
    s = chatReducer(chatReducer(s, { type: 'event', ev: { type: 'proposal', proposal: P } }), { type: 'discarded' })
    expect(s.proposal).toBeNull()
    expect(chatReducer(s, { type: 'reset' })).toEqual(initialChat())
  })
})

describe('지난 대화 불러오기', () => {
  it('빈 대화일 때만 기록으로 채우고 다음 id 를 이어 감', () => {
    const entries = [
      { id: 7, at: '', role: 'user' as const, text: '옮겨줘', tools: [], error: null },
      { id: 8, at: '', role: 'ai' as const, text: '옮겼어요', tools: ['장면 확인'], error: null },
    ]
    const s = chatReducer(initialChat(), { type: 'load', entries })
    expect(s.msgs.map((m) => m.text)).toEqual(['옮겨줘', '옮겼어요'])
    expect(s.msgs[1]).toMatchObject({ role: 'ai', done: true, tools: [{ label: '장면 확인' }] })
    expect(chatReducer(s, { type: 'send', text: '또' }).msgs.map((m) => m.id)).toEqual([1, 2, 3, 4])
    expect(chatReducer(s, { type: 'load', entries: [] })).toBe(s)
    expect(chatReducer(s, { type: 'load', entries })).toBe(s) // 이미 대화 중이면 덮지 않음
  })
})
