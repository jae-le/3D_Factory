import { Bot, LoaderCircle, MessageSquarePlus, Paperclip, SendHorizontal, Wrench, X } from 'lucide-react'
import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent, type KeyboardEvent } from 'react'
import { ProposalCard } from './ProposalCard'
import type { ChatImage, ProposalItem } from './types'
import type { Chat } from './useChat'

const MAX_IMAGES = 3
const MAX_BYTES = 5 * 1024 * 1024
const TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

/** 파일 → 붙일 이미지 (형식·크기 검사) */
export function readImage(f: File): Promise<ChatImage> {
  if (!(TYPES as readonly string[]).includes(f.type)) return Promise.reject(new Error('이미지는 PNG, JPG, WEBP 만 붙일 수 있습니다.'))
  if (f.size > MAX_BYTES) return Promise.reject(new Error('이미지 한 장은 5MB 이하만 붙일 수 있습니다.'))
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const url = String(r.result)
      resolve({ name: f.name || '붙여넣은 이미지', mediaType: f.type as ChatImage['mediaType'], data: url.slice(url.indexOf(',') + 1), url })
    }
    r.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'))
    r.readAsDataURL(f)
  })
}

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
  const [images, setImages] = useState<ChatImage[]>([])
  const [imageError, setImageError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const addFiles = (files: File[]) => {
    const list = files.filter((f) => f.type.startsWith('image/'))
    if (list.length === 0) return
    setImageError(null)
    if (images.length + list.length > MAX_IMAGES) {
      setImageError(`이미지는 ${MAX_IMAGES}장까지 붙일 수 있습니다.`)
      return
    }
    Promise.all(list.map(readImage))
      .then((read) => setImages((cur) => [...cur, ...read].slice(0, MAX_IMAGES)))
      .catch((e: Error) => setImageError(e.message))
  }
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.files)
    if (files.some((f) => f.type.startsWith('image/'))) {
      e.preventDefault()
      addFiles(files)
    }
  }
  const onDrop = (e: DragEvent<HTMLFormElement>) => {
    e.preventDefault()
    addFiles(Array.from(e.dataTransfer.files))
  }
  useEffect(() => {
    const el = body.current
    if (el) el.scrollTop = el.scrollHeight
  }, [state.msgs, state.proposal])
  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (state.sending || (!text.trim() && images.length === 0)) return
    chat.send(text, images)
    setText('')
    setImages([])
    setImageError(null)
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
              <div key={m.id} className="chat-msg user">
                {m.images && m.images.length > 0 && (
                  <div className="chat-msg-images">
                    {m.images.map((u, i) => (
                      <img key={i} src={u} alt={`붙인 이미지 ${i + 1}`} />
                    ))}
                  </div>
                )}
                {m.text}
              </div>
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
        {(images.length > 0 || imageError) && (
          <div className="chat-attach" aria-label="붙인 이미지">
            {images.map((im, i) => (
              <span key={i} className="chat-attach-item">
                <img src={im.url} alt={im.name} />
                <button type="button" aria-label={`${im.name} 빼기`} onClick={() => setImages((cur) => cur.filter((_, j) => j !== i))}>
                  <X size={12} aria-hidden />
                </button>
              </span>
            ))}
            {imageError && (
              <span className="chat-error" role="alert">
                {imageError}
              </span>
            )}
          </div>
        )}
        <form className="chat-input" onSubmit={submit} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            hidden
            aria-label="이미지 파일"
            onChange={(e) => {
              addFiles(Array.from(e.target.files ?? []))
              e.target.value = ''
            }}
          />
          <button type="button" className="chat-attach-btn" aria-label="이미지 붙이기" title="이미지 붙이기 (붙여넣기·끌어다 놓기도 됨, 3장까지)" disabled={state.sending || images.length >= MAX_IMAGES} onClick={() => fileInput.current?.click()}>
            <Paperclip size={16} aria-hidden />
          </button>
          <textarea
            aria-label="AI 에게 보낼 요청"
            placeholder="예: Main Station 1 을 오른쪽으로 2m 옮겨줘 (Enter 보내기 · Shift+Enter 줄바꿈)"
            value={text}
            maxLength={2000}
            rows={3}
            disabled={state.sending}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
            onPaste={onPaste}
          />
          <button type="submit" aria-label="보내기" disabled={state.sending || (!text.trim() && images.length === 0)}>
            {state.sending ? <LoaderCircle size={16} className="spin" aria-hidden /> : <SendHorizontal size={16} aria-hidden />}
          </button>
        </form>
      </div>
    </aside>
  )
}
