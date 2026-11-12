import { useEffect, useRef } from 'react'
import type { Plan } from './plan/types'

/** 위에서 본 선 그림 (가벽 주황 굵게, 구역 반투명) — 등록 전 확인용 */
export function PlanPreview({ plan }: { plan: Plan }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    const W = cv.width, H = cv.height, pad = 8
    const k = Math.min((W - pad * 2) / (plan.bounds.w || 1), (H - pad * 2) / (plan.bounds.h || 1))
    const X = (x: number) => pad + x * k, Y = (y: number) => H - pad - y * k
    ctx.fillStyle = '#0e1013'
    ctx.fillRect(0, 0, W, H)
    const path = (pts: [number, number][], close: boolean) => {
      ctx.beginPath()
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))))
      if (close) ctx.closePath()
    }
    for (const z of plan.zones) {
      ctx.fillStyle = z.color + '40'
      path(z.poly, true)
      ctx.fill()
    }
    ctx.lineWidth = 1
    for (const l of plan.lines) {
      ctx.strokeStyle = l.color ?? plan.layers.find((x) => x.name === l.layer)?.color ?? '#ffffff'
      path(l.pts, l.closed)
      ctx.stroke()
    }
    ctx.lineWidth = 3
    ctx.strokeStyle = '#ff8c1a'
    for (const p of plan.partitions) {
      path(p.pts, false)
      ctx.stroke()
    }
  }, [plan])
  return <canvas ref={ref} className="plan-preview" width={560} height={280} aria-label="도면 미리보기" />
}
