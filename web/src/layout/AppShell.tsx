import type { ReactNode } from 'react'
import { UserMenu } from '../components/UserMenu'
import { IconRail, type RailKey } from './IconRail'

/** 작업 화면 틀: 왼쪽 레일 · (옆 패널) · 위 머리글(head + 사용자 메뉴) · 본문. side 는 레일 옆에 붙어 화면 높이만큼 펼쳐짐 */
export function AppShell({ active, head, side, children }: { active: RailKey; head?: ReactNode; side?: ReactNode; children: ReactNode }) {
  return (
    <div className="app-shell">
      <IconRail active={active} />
      {side}
      <div className="app-main">
        <header className="app-head">
          {head}
          <span className="spacer" />
          <UserMenu />
        </header>
        <main className="app-body">{children}</main>
      </div>
    </div>
  )
}
