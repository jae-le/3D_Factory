import { fmtTime } from './status'
import { useCountUp } from './tween'
import type { Kpi } from './types'

/** 왼쪽 위 KPI 줄 (demo #dashBar). 숫자는 바뀔 때 0.6초 카운트업 */
export function KpiBar({ kpi }: { kpi: Kpi }) {
  const running = useCountUp(kpi.running)
  const ok = useCountUp(kpi.ok)
  const warn = useCountUp(kpi.warn)
  const bad = useCountUp(kpi.bad)
  const done = useCountUp(kpi.doneToday)
  const rate = useCountUp(kpi.planRate)
  return (
    <div className="dash-bar" role="group" aria-label="공정 KPI">
      <span className="ttl">공정 상황판</span>
      <span className="k"><b>{running}</b>가동</span>
      <span className="k ok"><b>{ok}</b>진행중</span>
      <span className="k warn"><b>{warn}</b>주의</span>
      <span className="k bad"><b>{bad}</b>지연</span>
      <span className="k"><b>{done}</b>오늘 완료</span>
      <span className="k"><b>{rate}%</b>계획 달성률</span>
      <span className="k t">{fmtTime(kpi.at)}</span>
    </div>
  )
}
