import { Bot, Box, Boxes, LayoutDashboard, Play, Settings, type LucideIcon } from 'lucide-react'
import { useNavigate } from 'react-router'
import { hasRole, useAuth } from '../auth/context'

export type RailKey = 'factory' | 'objects' | 'dashboard' | 'run' | 'chat' | 'admin'

/** 3D 공장 화면에서 레일 '객체' 를 누르면 옆 패널을 열고 닫음. 다른 화면에서 누르면 공장 화면으로 가서 패널을 엶 */
export interface RailPanel {
  objectsOpen: boolean
  onObjects(): void
}

interface Item {
  key: RailKey
  label: string
  icon: LucideIcon
  to?: string // 없으면 준비 중
}

const MENU: Item[] = [
  { key: 'factory', label: '3D 공장', icon: Box, to: '/' },
  { key: 'objects', label: '객체', icon: Boxes, to: '/' },
  { key: 'dashboard', label: '상황판', icon: LayoutDashboard, to: '/dashboard' },
  { key: 'run', label: '실행', icon: Play },
  { key: 'chat', label: 'AI 챗봇', icon: Bot },
]
const ADMIN: Item = { key: 'admin', label: '관리자', icon: Settings, to: '/admin' }
export const OBJECTS_PANEL_KEY = 'f3d:objects-panel'

/** 맨 왼쪽 메뉴(아이콘 + 이름). 실행·AI 챗봇은 다음 단계에서 열림, 관리자는 관리자에게만 */
export function IconRail({ active, panel }: { active: RailKey; panel?: RailPanel }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const current = panel?.objectsOpen && active === 'factory' ? 'objects' : active
  const go = ({ key, to }: Item) => {
    if (key === 'objects') {
      if (panel) return panel.onObjects()
      try {
        localStorage.setItem(OBJECTS_PANEL_KEY, '1')
      } catch {
        /* 저장 못 해도 이동 */
      }
    } else if (key === 'factory' && panel?.objectsOpen) return panel.onObjects() // 공장 화면에서 '3D 공장' = 패널 접기
    if (to) navigate(to)
  }
  const button = (item: Item, extra = '') => {
    const { key, label, icon: Icon, to } = item
    const blocked = !to
    const on = key === current
    const cls = [on ? 'active' : '', extra].filter(Boolean).join(' ') || undefined
    return (
      <button
        key={key}
        className={cls}
        aria-current={on ? 'page' : undefined}
        aria-expanded={key === 'objects' && panel ? panel.objectsOpen : undefined}
        aria-label={blocked ? `${label} (준비 중)` : label}
        title={blocked ? `${label} — 준비 중` : label}
        disabled={blocked}
        onClick={() => go(item)}
      >
        <Icon size={20} strokeWidth={1.8} aria-hidden />
        <span aria-hidden>{label}</span>
      </button>
    )
  }
  return (
    <nav className="rail" aria-label="메뉴">
      <span className="rail-logo" aria-hidden>
        F3
      </span>
      {MENU.map((m) => button(m))}
      {hasRole(user, 'ADMIN') && button(ADMIN, 'rail-bottom')}
    </nav>
  )
}
