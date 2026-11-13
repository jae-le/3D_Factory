import { FileText, Info, Package, X } from 'lucide-react'
import { EventIcon } from './EventTicker'
import { eventIcon, fmtTime, PROJECT_STATE_LABEL } from './status'
import type { LiveEvent, ProjectLive } from './types'

const BLUE = '#3b82f6'

function EventList({ items, empty }: { items: LiveEvent[]; empty: string }) {
  if (items.length === 0) return <p className="dempty">{empty}</p>
  return (
    <ul>
      {items.map((e) => (
        <li key={e.id}>
          <EventIcon e={e} />
          <span>{e.text}</span>
          <small>{fmtTime(e.at)}</small>
        </li>
      ))}
    </ul>
  )
}

/** 오른쪽 서랍 (demo #dashDrawer): 제작 현황 · 자재 입고 · 이벤트 */
export function LiveDrawer({ projects, materials, events, onClose }: { projects: ProjectLive[]; materials: LiveEvent[]; events: LiveEvent[]; onClose(): void }) {
  return (
    <aside className="dash-drawer" aria-label="제작·자재 현황">
      <div className="dh">
        <b>제작 · 자재 현황</b>
        <button type="button" className="icon-btn" aria-label="서랍 닫기" onClick={onClose}>
          <X size={14} aria-hidden />
        </button>
      </div>
      <section className="dpanel">
        <h4><FileText size={16} color={BLUE} aria-hidden />제작 현황</h4>
        <table>
          <thead>
            <tr><th>PJT</th><th>제작</th><th>기간</th><th>상태</th></tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{`${p.done}/${p.total}`}</td>
                <td>{p.period ?? ''}</td>
                <td className={`st ${p.state === 'run' ? 'ok' : p.state === 'wait' ? 'warn' : ''}`}>{PROJECT_STATE_LABEL[p.state]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="dpanel">
        <h4><Package size={16} color={BLUE} aria-hidden />자재 입고</h4>
        <EventList items={materials} empty="입고 기록 없음" />
      </section>
      <section className="dpanel">
        <h4><Info size={16} color={BLUE} aria-hidden />이벤트</h4>
        <EventList items={events.filter((e) => eventIcon(e)).slice(0, 20)} empty="이벤트 없음" />
      </section>
    </aside>
  )
}
