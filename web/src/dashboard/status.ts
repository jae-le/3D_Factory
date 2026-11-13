import { Bell, CircleCheck, Info, PackageOpen, TriangleAlert, Truck, type LucideIcon } from 'lucide-react'
import type { LiveEvent, ProjectLive, Status } from './types'

export const STATUS_LABEL: Record<Status, string> = { ok: '진행중', warn: '주의', bad: '지연' }
export const STATUS_COLOR: Record<Status, string> = { ok: '#22c55e', warn: '#f59e0b', bad: '#ef4444' }
export const PROJECT_STATE_LABEL: Record<ProjectLive['state'], string> = { run: '진행', wait: '대기', done: '완료' }
const MUTED = '#8d939e'
const BLUE = '#3b82f6'

/** 이벤트 줄·서랍 아이콘. step_start·step_done 은 넣지 않음(null) */
export function eventIcon(e: LiveEvent): { icon: LucideIcon; color: string } | null {
  switch (e.kind) {
    case 'unit_done':
      return { icon: CircleCheck, color: STATUS_COLOR.ok }
    case 'status_change':
      if (e.data.to === 'bad') return { icon: TriangleAlert, color: STATUS_COLOR.bad }
      if (e.data.to === 'warn') return { icon: Bell, color: STATUS_COLOR.warn }
      return { icon: Info, color: MUTED }
    case 'material_in':
      return { icon: PackageOpen, color: BLUE }
    case 'move':
      return { icon: Truck, color: MUTED }
    default:
      return null
  }
}

/** ISO 시각 → HH:MM:SS (브라우저 시간대) */
export function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':')
}
