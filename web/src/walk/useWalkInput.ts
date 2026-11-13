import { useEffect, useRef, useState, type RefObject } from 'react'
import type { WalkController } from './controller'
import { WALK } from './player'
import { TouchSticks, type JoyView } from './touch'

export interface WalkInput {
  cursor: RefObject<{ x: number; y: number }> // 마지막 마우스 자리 (clientX/Y)
  dragging: RefObject<boolean>
  joy: JoyView | null // 터치 조이스틱 그림 (없으면 null)
}

/**
 * 걷는 동안(ctl 있음) 무대의 마우스·터치 (참고 파일): 왼쪽 끌기 = 시점, 6 px 안 움직인 클릭 = onClickAt(걷기 때만),
 * 터치 왼쪽 반 = 조이스틱 · 오른쪽 반 = 시점 (짧게 톡 = 브라우저가 만든 마우스 클릭으로 선택)
 */
export function useWalkInput(stage: RefObject<HTMLDivElement | null>, ctl: WalkController | null, onClickAt: (x: number, y: number) => void): WalkInput {
  const cursor = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
  const dragging = useRef(false)
  const [joy, setJoy] = useState<JoyView | null>(null)
  const click = useRef(onClickAt)
  useEffect(() => {
    click.current = onClickAt
  })
  useEffect(() => {
    const el = stage.current
    if (!el || !ctl) return
    let drag: { x: number; y: number; moved: number } | null = null
    const sticks = new TouchSticks()
    const down = (e: MouseEvent) => {
      if (e.button !== 0) return
      drag = { x: e.clientX, y: e.clientY, moved: 0 }
      dragging.current = true
      el.classList.add('dragging')
    }
    const move = (e: MouseEvent) => {
      cursor.current = { x: e.clientX, y: e.clientY }
      if (!drag) return
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y
      drag.moved += Math.abs(dx) + Math.abs(dy)
      drag.x = e.clientX
      drag.y = e.clientY
      ctl.drag(dx, dy)
    }
    const up = (e: MouseEvent) => {
      if (!drag) return
      const d = drag
      drag = null
      dragging.current = false
      el.classList.remove('dragging')
      cursor.current = { x: e.clientX, y: e.clientY }
      if (d.moved < WALK.clickPx && ctl.mode === 'walk') click.current(e.clientX, e.clientY)
    }
    const touches = (e: TouchEvent, fn: (id: number, x: number, y: number, width: number) => void) => {
      const r = el.getBoundingClientRect()
      for (const t of Array.from(e.changedTouches)) fn(t.identifier, t.clientX - r.left, t.clientY - r.top, r.width)
      const v = sticks.vec()
      ctl.setJoy(v.x, v.y)
      setJoy(sticks.view())
    }
    const tStart = (e: TouchEvent) => touches(e, (id, x, y, w) => sticks.start(id, x, y, w))
    const tMove = (e: TouchEvent) =>
      touches(e, (id, x, y) => {
        const look = sticks.move(id, x, y)
        if (look) ctl.drag(look.dx, look.dy, true)
      })
    const tEnd = (e: TouchEvent) => touches(e, (id) => sticks.end(id))
    el.addEventListener('mousedown', down)
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    el.addEventListener('touchstart', tStart, { passive: true })
    el.addEventListener('touchmove', tMove, { passive: true })
    el.addEventListener('touchend', tEnd)
    el.addEventListener('touchcancel', tEnd)
    return () => {
      el.removeEventListener('mousedown', down)
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      el.removeEventListener('touchstart', tStart)
      el.removeEventListener('touchmove', tMove)
      el.removeEventListener('touchend', tEnd)
      el.removeEventListener('touchcancel', tEnd)
      dragging.current = false
      el.classList.remove('dragging')
      ctl.setJoy(0, 0)
      setJoy(null)
    }
  }, [stage, ctl])
  return { cursor, dragging, joy }
}
