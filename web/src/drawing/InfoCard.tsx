import type { Plan } from './plan/types'

/** 3D 왼쪽 아래(객체 패널이 열려 있으면 오른쪽 아래): 도면 이름 · 크기 · 단위 */
export function InfoCard({ name, plan, calibrated, right }: { name: string; plan: Plan; calibrated: boolean; right?: boolean }) {
  return (
    <div className={right ? 'info-card right' : 'info-card'}>
      <strong>{name}</strong>
      <span>{`${plan.bounds.w.toFixed(1)} × ${plan.bounds.h.toFixed(1)} m`}</span>
      <span>{calibrated ? '보정됨' : `단위 ${plan.unit}${plan.warnings.unitGuessed ? ' (추정)' : ''}`}</span>
    </div>
  )
}
