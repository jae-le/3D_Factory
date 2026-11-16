import { useCallback, useEffect, useReducer, useRef } from 'react'
import { applyProposal, discardProposal, resetChat, revertBatch, streamChat } from './api'
import { chatReducer, initialChat, type ChatState } from './chat'

export interface Chat {
  state: ChatState
  send(text: string): void
  apply(): void
  discard(): void
  revert(): void
  newChat(): void
}

/** 도면 하나의 AI 대화. 도면이 바뀌거나 화면을 떠나면 진행 중 요청을 끊고 비움 (서버 대화도) */
export function useChat(drawingId: number | null, onApplied: () => void): Chat {
  const [state, dispatch] = useReducer(chatReducer, undefined, initialChat)
  const stateRef = useRef(state)
  const busy = useRef(false)
  const abort = useRef<AbortController | null>(null)
  const appliedCb = useRef(onApplied)
  useEffect(() => {
    stateRef.current = state
    appliedCb.current = onApplied
  })
  useEffect(
    () => () => {
      abort.current?.abort()
      abort.current = null
      busy.current = false
      dispatch({ type: 'reset' })
      if (drawingId != null) void resetChat(drawingId).catch(() => {})
    },
    [drawingId],
  )

  const send = useCallback(
    (text: string) => {
      const t = text.trim()
      if (drawingId == null || !t || busy.current) return
      busy.current = true
      dispatch({ type: 'send', text: t })
      const ac = new AbortController()
      abort.current = ac
      streamChat(drawingId, t, (ev) => !ac.signal.aborted && dispatch({ type: 'event', ev }), ac.signal)
        .then(() => !ac.signal.aborted && dispatch({ type: 'end' }))
        .catch((e: Error) => !ac.signal.aborted && dispatch({ type: 'fail', message: e.message }))
        .finally(() => {
          if (abort.current === ac) busy.current = false
        })
    },
    [drawingId],
  )

  const apply = useCallback(() => {
    const p = stateRef.current.proposal
    if (!p || p.status !== 'open') return
    dispatch({ type: 'applying' })
    applyProposal(p.proposal.id)
      .then((result) => {
        dispatch({ type: 'applied', result })
        appliedCb.current()
      })
      .catch((e: Error) => dispatch({ type: 'proposalError', message: e.message }))
  }, [])

  const discard = useCallback(() => {
    const p = stateRef.current.proposal
    if (!p || p.status !== 'open') return
    discardProposal(p.proposal.id)
      .then(() => dispatch({ type: 'discarded' }))
      .catch((e: Error) => dispatch({ type: 'proposalError', message: e.message }))
  }, [])

  const revert = useCallback(() => {
    const p = stateRef.current.proposal
    if (!p || p.status !== 'applied' || !p.result) return
    dispatch({ type: 'reverting' })
    revertBatch(p.result.batchId)
      .then(() => {
        dispatch({ type: 'reverted' })
        appliedCb.current()
      })
      .catch((e: Error) => dispatch({ type: 'proposalError', message: e.message }))
  }, [])

  const newChat = useCallback(() => {
    abort.current?.abort()
    abort.current = null
    busy.current = false
    dispatch({ type: 'reset' })
    if (drawingId != null) void resetChat(drawingId).catch(() => {})
  }, [drawingId])

  return { state, send, apply, discard, revert, newChat }
}
