import { useEffect, useRef, useState } from 'react'
import type { Plan } from '../drawing/plan/types'
import { FactoryScene, type ObjectHost, type PickSource, type Quality, type ViewMode } from './FactoryScene'

interface Props {
  plan: Plan | null
  /** 도면 id — 바뀔 때만 카메라를 처음 자리로 */
  planKey?: number
  view: ViewMode
  quality: Quality
  onScene?: (s: (PickSource & ObjectHost) | null) => void
}

/** 3D 화면 껍데기: FactoryScene 을 만들고 plan·보기·품질을 넘김 */
export function FactoryView({ plan, planKey, view, quality, onScene }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const scene = useRef<FactoryScene | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    try {
      scene.current = new FactoryScene(box.current!)
      onScene?.(scene.current)
    } catch {
      setFailed(true)
    }
    return () => {
      onScene?.(null)
      scene.current?.dispose()
      scene.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => scene.current?.setPlan(plan, planKey), [plan, planKey])
  useEffect(() => scene.current?.setView(view), [view])
  useEffect(() => scene.current?.setQuality(quality), [quality])
  if (failed)
    return (
      <p className="empty-state" role="alert">
        3D 화면을 표시할 수 없습니다. (WebGL 을 지원하는 브라우저가 필요합니다)
      </p>
    )
  return <div ref={box} className="factory-view" />
}
