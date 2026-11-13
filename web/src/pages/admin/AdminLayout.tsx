import { NavLink, Outlet } from 'react-router'
import { UserMenu } from '../../components/UserMenu'
import { IconRail } from '../../layout/IconRail'

/** 관리자 (ADMIN): 어두운 아이콘 레일 + 흰 본문 · 밑줄 탭. 다른 관리 메뉴는 해당 단계에서 탭으로 추가 */
export function AdminLayout() {
  return (
    <div className="kp-shell">
      <IconRail active="admin" />
      <div className="kp-shell-main">
        <header className="kp-header">
          <h1 className="kp-current-menu">관리자</h1>
          <span className="spacer" />
          <UserMenu light />
        </header>
        <nav className="kp-tabs" aria-label="관리자 메뉴">
          <NavLink to="/admin/users">권한관리</NavLink>
          <NavLink to="/admin/login-history">로그인 이력</NavLink>
          <NavLink to="/admin/audit">감사 기록</NavLink>
          <NavLink to="/admin/drawings">도면 관리</NavLink>
          <NavLink to="/admin/models">객체관리</NavLink>
          <NavLink to="/admin/stations">공정·생산 기준정보</NavLink>
        </nav>
        <main className="kp-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
