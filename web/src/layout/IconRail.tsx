import { Bot, Box, LayoutDashboard, Play, Settings, type LucideIcon } from 'lucide-react'
import { useNavigate } from 'react-router'
import { hasRole, useAuth } from '../auth/context'

export type RailKey = 'factory' | 'dashboard' | 'run' | 'chat' | 'admin'

interface Item {
  key: RailKey
  label: string
  icon: LucideIcon
  to?: string // 없으면 준비 중
  adminOnly?: boolean
}

const MENU: Item[] = [
  { key: 'factory', label: '3D 공장', icon: Box, to: '/' },
  { key: 'dashboard', label: '상황판', icon: LayoutDashboard },
  { key: 'run', label: '실행', icon: Play },
  { key: 'chat', label: 'AI 챗봇', icon: Bot },
]
const ADMIN: Item = { key: 'admin', label: '관리자', icon: Settings, to: '/admin', adminOnly: true }

/** 맨 왼쪽 아이콘 메뉴. 상황판·실행·AI 챗봇은 다음 단계에서 열림, 관리자는 관리자에게만 */
export function IconRail({ active }: { active: RailKey }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const button = ({ key, label, icon: Icon, to }: Item, extra = '') => {
    const blocked = !to
    const cls = [key === active ? 'active' : '', extra].filter(Boolean).join(' ') || undefined
    return (
      <button
        key={key}
        className={cls}
        aria-current={key === active ? 'page' : undefined}
        aria-label={blocked ? `${label} (준비 중)` : label}
        title={blocked ? `${label} — 준비 중` : label}
        disabled={blocked}
        onClick={() => to && navigate(to)}
      >
        <Icon size={20} strokeWidth={1.8} aria-hidden />
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
