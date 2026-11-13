import { PanelRight } from 'lucide-react'
import { eventIcon, fmtTime } from './status'
import type { LiveEvent } from './types'

/** 이벤트 종류 아이콘 (step_* 은 없음) */
export function EventIcon({ e, size = 16 }: { e: LiveEvent; size?: number }) {
  const ic = eventIcon(e)
  if (!ic) return null
  const Icon = ic.icon
  return <Icon size={size} color={ic.color} strokeWidth={1.8} aria-hidden />
}

/** 아래 이벤트 줄 (demo #dashTicker): 최근 3개 + 제작·자재 서랍 버튼 */
export function EventTicker({ events, drawerOpen, onToggle }: { events: LiveEvent[]; drawerOpen: boolean; onToggle(): void }) {
  const shown = events.filter((e) => eventIcon(e)).slice(0, 3)
  return (
    <div className="dash-ticker">
      <ul className="evs" aria-label="최근 이벤트">
        {shown.length === 0 ? (
          <li className="ev old">이벤트 없음</li>
        ) : (
          shown.map((e, i) => (
            <li key={e.id} className={i ? 'ev old' : 'ev'}>
              <EventIcon e={e} size={15} />
              <span>{e.text}</span>
              <small>{fmtTime(e.at)}</small>
            </li>
          ))
        )}
      </ul>
      <button type="button" className={drawerOpen ? 'on' : undefined} aria-pressed={drawerOpen} onClick={onToggle}>
        <PanelRight size={15} aria-hidden />
        제작·자재 현황
      </button>
    </div>
  )
}
