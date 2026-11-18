import { Bot, Box, Boxes, Footprints, LayoutDashboard, Settings, type LucideIcon } from 'lucide-react'
import { useNavigate } from 'react-router'
import { REASON_TEXT } from '../ai/types'
import { useAiStatus } from '../ai/useAiStatus'
import { hasRole, useAuth } from '../auth/context'

export type RailKey = 'factory' | 'objects' | 'walk' | 'dashboard' | 'chat' | 'admin'

/** 3D 공장 화면의 옆 패널 (객체 · AI 챗봇 — 한 번에 하나). 다른 화면에서 누르면 공장 화면으로 가서 그 패널을 엶 */
export interface RailPanel {
  objectsOpen: boolean
  onObjects(): void
  chatOpen?: boolean
  onChat?(): void
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
  { key: 'walk', label: '체험', icon: Footprints, to: '/walk' },
  { key: 'dashboard', label: '상황판', icon: LayoutDashboard, to: '/dashboard' },
  { key: 'chat', label: 'AI 챗봇', icon: Bot, to: '/' },
]
const ADMIN: Item = { key: 'admin', label: '관리자', icon: Settings, to: '/admin' }
export const OBJECTS_PANEL_KEY = 'f3d:objects-panel'
export const OPEN_CHAT_KEY = 'f3d:open-chat'

/** 맨 왼쪽 메뉴(아이콘 + 이름). AI 챗봇은 운전원 이상 + AI API 사용 가능일 때, 관리자는 관리자에게만 */
export function IconRail({ active, panel }: { active: RailKey; panel?: RailPanel }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const ai = useAiStatus()
  const current = active === 'factory' && panel?.chatOpen ? 'chat' : panel?.objectsOpen && active === 'factory' ? 'objects' : active
  // AI 챗봇: 운전원 이상 + 서버 상태 enabled 일 때만
  const chatBlock = !hasRole(user, 'OPERATOR') ? '운전원 이상만 쓸 수 있습니다'
    : ai.kind === 'loading' ? '상태 확인 중'
    : ai.kind === 'error' ? '상태를 확인하지 못했습니다'
    : !ai.status.enabled ? (ai.status.reason ? REASON_TEXT[ai.status.reason] : '쓸 수 없습니다')
    : null
  const go = ({ key, to }: Item) => {
    if (key === 'objects') {
      if (panel) return panel.onObjects()
      try {
        localStorage.setItem(OBJECTS_PANEL_KEY, '1')
      } catch {
        /* 저장 못 해도 이동 */
      }
    } else if (key === 'chat') {
      if (panel?.onChat) return panel.onChat()
      try {
        localStorage.setItem(OPEN_CHAT_KEY, '1')
      } catch {
        /* 저장 못 해도 이동 */
      }
    } else if (key === 'factory' && panel?.chatOpen) return panel.onChat?.() // 공장 화면에서 '3D 공장' = 패널 접기
    else if (key === 'factory' && panel?.objectsOpen) return panel.onObjects()
    if (to) navigate(to)
  }
  const button = (item: Item, extra = '') => {
    const { key, label, icon: Icon, to } = item
    const why = key === 'chat' ? chatBlock : !to ? '준비 중' : null
    const on = key === current
    const cls = [on ? 'active' : '', extra].filter(Boolean).join(' ') || undefined
    return (
      <button
        key={key}
        className={cls}
        aria-current={on ? 'page' : undefined}
        aria-expanded={panel && (key === 'objects' || key === 'chat') ? (key === 'objects' ? panel.objectsOpen : !!panel.chatOpen) : undefined}
        aria-label={!to ? `${label} (준비 중)` : label}
        title={why ? `${label} — ${why}` : label}
        disabled={!!why}
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
