import { useEffect, useMemo, useRef } from 'react'
import type { Plan } from '../drawing/plan/types'
import { drawMinimap, miniFrame, type MiniMe, type MiniObject } from './minimap'

interface Props { plan: Plan; objects: MiniObject[]; me: () => MiniMe }

/** 오른쪽 아래 미니맵: 0.1초마다 다시 그림. data-pos = 내 위치(plan m, 실제 화면 확인용) */
export function Minimap({ plan, objects, me }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const meRef = useRef(me)
  useEffect(() => {
    meRef.current = me
  })
  const frame = useMemo(() => miniFrame(plan), [plan])
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ctx = el.getContext('2d') // jsdom 은 null — data-pos 만
    const draw = () => {
      const p = meRef.current()
      el.dataset.pos = `${p.x.toFixed(2)},${p.y.toFixed(2)}`
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      drawMinimap(ctx, frame, plan, objects, p)
    }
    draw()
    const t = setInterval(draw, 100)
    return () => clearInterval(t)
  }, [frame, plan, objects, dpr])
  return (
    <canvas
      ref={ref}
      className="walk-mini"
      role="img"
      aria-label="미니맵"
      width={Math.round(frame.width * dpr)}
      height={Math.round(frame.height * dpr)}
      style={{ width: frame.width, height: frame.height }}
    />
  )
}
