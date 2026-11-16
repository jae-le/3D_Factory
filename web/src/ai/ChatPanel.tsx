import { Bot, LoaderCircle, MessageSquarePlus, SendHorizontal, Wrench } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ProposalCard } from './ProposalCard'
import type { ProposalItem } from './types'
import type { Chat } from './useChat'

const EXAMPLES = ['Main Station 1 을 오른쪽으로 2m 옮겨줘', 'Hub 조립장 택타임을 25분으로 바꿔줘', '조립 구역 가운데에 가벽을 세워줘']

interface Props {
  open: boolean
  chat: Chat
  onHover(seq: number | null): void
  onFocus(item: ProposalItem): void
}

/** 레일 옆 AI 챗봇 패널 (객체 패널 자리): 말풍선 · 도구 진행 줄 · 제안 카드 · 입력칸 */
export function ChatPanel({ open, chat, onHover, onFocus }: Props) {
  const { state } = chat
  const [text, setText] = useState('')
  const body = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = body.current
    if (el) el.scrollTop = el.scrollHeight
  }, [state.msgs, state.proposal])
  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (state.sending || !text.trim()) return
    chat.send(text)
    setText('')
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }
  return (
    <aside className={open ? 'side-panel chat-panel' : 'side-panel chat-panel closed'} aria-label="AI 챗봇" aria-hidden={!open}>
      <div className="side-panel-inner" inert={!open}>
        <header className="side-panel-head chat-head">
          <div>
            <strong>AI 챗봇</strong>
            <span>요청하면 변경 제안을 3D 로 미리 보여 줍니다</span>
          </div>
          <button className="chat-new" onClick={chat.newChat} title="대화와 제안을 비웁니다">
            <MessageSquarePlus size={14} aria-hidden /> 새 대화
          </button>
        </header>
        <div className="chat-body" ref={body}>
          {state.msgs.length === 0 && (
            <div className="chat-empty">
              <Bot size={28} aria-hidden />
              <p>3D 공장을 어떻게 바꿀지 말해 주세요.</p>
              <ul>
                {EXAMPLES.map((x) => (
                  <li key={x}>
                    <button className="chat-example" onClick={() => setText(x)}>
                      {x}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {state.msgs.map((m) =>
            m.role === 'user' ? (
              <p key={m.id} className="chat-msg user">
                {m.text}
              </p>
            ) : (
              <div key={m.id} className="chat-msg ai" aria-live="polite">
                {m.tools.map((t, i) => (
                  <p key={i} className="chat-tool">
                    <Wrench size={12} aria-hidden /> {t.label}
                  </p>
                ))}
                {m.text && <p className="chat-text">{m.text}</p>}
                {!m.done && !m.text && (
                  <p className="chat-wait">
                    <LoaderCircle size={14} className="spin" aria-hidden /> 답을 쓰는 중…
                  </p>
                )}
                {m.error && (
                  <p className="chat-error" role="alert">
                    {m.error}
                  </p>
                )}
              </div>
            ),
          )}
          {state.proposal && (
            <ProposalCard state={state.proposal} onApply={chat.apply} onDiscard={chat.discard} onRevert={chat.revert} onHover={onHover} onFocus={onFocus} />
          )}
        </div>
        <form className="chat-input" onSubmit={submit}>
          <textarea
            aria-label="AI 에게 보낼 요청"
            placeholder="예: Main Station 1 을 오른쪽으로 2m 옮겨줘 (Enter 보내기 · Shift+Enter 줄바꿈)"
            value={text}
            maxLength={2000}
            rows={3}
            disabled={state.sending}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
          />
          <button type="submit" aria-label="보내기" disabled={state.sending || !text.trim()}>
            {state.sending ? <LoaderCircle size={16} className="spin" aria-hidden /> : <SendHorizontal size={16} aria-hidden />}
          </button>
        </form>
      </div>
    </aside>
  )
}
