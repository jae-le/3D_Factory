import type { ApplyResult, ChatEntry, ChatEvent, ChatUsage, Proposal, ProposalItem } from './types'

export interface ToolLine { name: string; label: string }
export interface UserMsg { id: number; role: 'user'; text: string; images?: string[] }
export interface AiMsg { id: number; role: 'ai'; text: string; tools: ToolLine[]; error: string | null; done: boolean; usage: ChatUsage | null }
export type Msg = UserMsg | AiMsg
export type ProposalStatus = 'open' | 'applying' | 'applied' | 'reverting' | 'reverted'
export interface ProposalState { proposal: Proposal; status: ProposalStatus; result: ApplyResult | null; error: string | null }
export interface ChatState { msgs: Msg[]; sending: boolean; proposal: ProposalState | null; nextId: number }
export type ChatAction =
  | { type: 'send'; text: string; images?: string[] }
  | { type: 'event'; ev: ChatEvent }
  | { type: 'end' }
  | { type: 'fail'; message: string }
  | { type: 'applying' }
  | { type: 'applied'; result: ApplyResult }
  | { type: 'discarded' }
  | { type: 'reverting' }
  | { type: 'reverted' }
  | { type: 'proposalError'; message: string }
  | { type: 'reset' }
  | { type: 'load'; entries: ChatEntry[] }

export const initialChat = (): ChatState => ({ msgs: [], sending: false, proposal: null, nextId: 1 })

/** 마지막 AI 말풍선 고치기 */
function onAi(s: ChatState, f: (m: AiMsg) => AiMsg): ChatState {
  const i = s.msgs.length - 1
  const m = s.msgs[i]
  if (!m || m.role !== 'ai') return s
  const msgs = s.msgs.slice()
  msgs[i] = f(m)
  return { ...s, msgs }
}

export function chatReducer(s: ChatState, a: ChatAction): ChatState {
  switch (a.type) {
    case 'send':
      return {
        ...s,
        sending: true,
        nextId: s.nextId + 2,
        msgs: [...s.msgs, { id: s.nextId, role: 'user', text: a.text, ...(a.images?.length ? { images: a.images } : {}) }, { id: s.nextId + 1, role: 'ai', text: '', tools: [], error: null, done: false, usage: null }],
      }
    case 'event': {
      const ev = a.ev
      if (ev.type === 'text') return onAi(s, (m) => ({ ...m, text: m.text + ev.t }))
      if (ev.type === 'tool') return onAi(s, (m) => ({ ...m, tools: [...m.tools, { name: ev.name, label: ev.label }] }))
      if (ev.type === 'proposal')
        return { ...s, proposal: ev.proposal.items.length === 0 ? null : { proposal: ev.proposal, status: 'open', result: null, error: null } }
      if (ev.type === 'done') return { ...onAi(s, (m) => ({ ...m, done: true, usage: ev.usage })), sending: false }
      return { ...onAi(s, (m) => ({ ...m, done: true, error: ev.message })), sending: false }
    }
    case 'end':
      if (!s.sending) return s
      return { ...onAi(s, (m) => ({ ...m, done: true, error: m.error ?? '응답이 중간에 끊겼습니다' })), sending: false }
    case 'fail':
      return { ...onAi(s, (m) => ({ ...m, done: true, error: a.message })), sending: false }
    case 'applying':
      return s.proposal ? { ...s, proposal: { ...s.proposal, status: 'applying', error: null } } : s
    case 'applied':
      return s.proposal ? { ...s, proposal: { ...s.proposal, status: 'applied', result: a.result, error: null } } : s
    case 'discarded':
      return { ...s, proposal: null }
    case 'reverting':
      return s.proposal ? { ...s, proposal: { ...s.proposal, status: 'reverting', error: null } } : s
    case 'reverted':
      return s.proposal ? { ...s, proposal: { ...s.proposal, status: 'reverted', error: null } } : s
    case 'proposalError': {
      if (!s.proposal) return s
      const back = s.proposal.status === 'reverting' ? 'applied' : s.proposal.status === 'applying' ? 'open' : s.proposal.status
      return { ...s, proposal: { ...s.proposal, status: back, error: a.message } }
    }
    case 'reset':
      return initialChat()
    case 'load': {
      if (s.msgs.length > 0 || !Array.isArray(a.entries) || a.entries.length === 0) return s // 이미 대화 중이면 덮지 않음
      const msgs: Msg[] = a.entries.map((e, i): Msg =>
        e.role === 'user'
          ? { id: i + 1, role: 'user', text: e.text }
          : { id: i + 1, role: 'ai', text: e.text, tools: e.tools.map((label) => ({ name: '', label })), error: e.error, done: true, usage: null },
      )
      return { ...s, msgs, nextId: msgs.length + 1 }
    }
  }
}

const NONE: ProposalItem[] = [] // 같은 빈 목록 (미리보기 효과가 매번 다시 돌지 않게)

/** 3D 미리보기를 보일 항목 (제안 카드가 열려 있거나 적용 중일 때만) */
export function previewItems(s: ChatState): ProposalItem[] {
  const p = s.proposal
  return p && (p.status === 'open' || p.status === 'applying') ? p.proposal.items : NONE
}
