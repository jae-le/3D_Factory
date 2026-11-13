import { useEffect, useRef, useState } from 'react'

export const easeOutCubic = (k: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3)

/** from → to 를 t0 부터 ms 동안 (ease-out cubic) */
export interface Tween { from: number; to: number; t0: number; ms: number }

export function valueAt(t: Tween, now: number): number {
  if (t.ms <= 0) return t.to
  return t.from + (t.to - t.from) * easeOutCubic((now - t.t0) / t.ms)
}

/** 새 값을 받음: 지금 보이는 값에서 새 값으로. snapDown 이면 내려갈 때는 보간 없이 바로 (한 대 완료 100% → 작은 값) */
export function retarget(cur: Tween, value: number, now: number, ms: number, snapDown = false): Tween {
  const shown = valueAt(cur, now)
  if (snapDown && value < shown) return { from: value, to: value, t0: now, ms }
  return { from: shown, to: value, t0: now, ms }
}

/** 값이 바뀌면 ms 동안 보간한 값을 돌려줌 (처음 값은 보간 없이) */
export function useTweened(value: number, ms = 600, opts: { snapDown?: boolean } = {}): number {
  const snapDown = opts.snapDown ?? false
  const [shown, setShown] = useState(value)
  const tw = useRef<Tween>({ from: value, to: value, t0: 0, ms })
  useEffect(() => {
    if (value === tw.current.to) return
    tw.current = retarget(tw.current, value, performance.now(), ms, snapDown)
    let raf = 0
    const step = () => {
      const t = performance.now()
      setShown(valueAt(tw.current, t))
      if (t - tw.current.t0 < tw.current.ms) raf = requestAnimationFrame(step)
    }
    step()
    return () => cancelAnimationFrame(raf)
  }, [value, ms, snapDown])
  return shown
}

/** KPI 숫자 카운트업 (정수) */
export function useCountUp(value: number, ms = 600): number {
  return Math.round(useTweened(value, ms))
}
