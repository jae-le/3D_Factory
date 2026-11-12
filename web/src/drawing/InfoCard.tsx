import type { Plan } from './plan/types'

/** 3D 왼쪽 아래: 도면 이름 · 크기 · 단위 */
export function InfoCard({ name, plan, calibrated }: { name: string; plan: Plan; calibrated: boolean }) {
  return (
    <div className="info-card">
      <strong>{name}</strong>
      <span>{`${plan.bounds.w.toFixed(1)} × ${plan.bounds.h.toFixed(1)} m`}</span>
      <span>{calibrated ? '보정됨' : `단위 ${plan.unit}${plan.warnings.unitGuessed ? ' (추정)' : ''}`}</span>
    </div>
  )
}
