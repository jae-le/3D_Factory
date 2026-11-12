import { ChevronDown, KeyRound, LogOut, UserRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { ROLE_LABEL, useAuth } from '../auth/context'

/** 머리글 오른쪽: 이름·역할 → 비밀번호 변경 · 로그아웃. light = 흰 관리자 화면용 */
export function UserMenu({ light = false }: { light?: boolean }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])
  if (!user) return null
  return (
    <div className={`user-menu${light ? ' light' : ''}`} ref={box}>
      <button className="user-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <UserRound size={16} aria-hidden />
        <span className="user-name">{user.displayName}</span>
        <span className="user-role">{ROLE_LABEL[user.role]}</span>
        <ChevronDown size={14} aria-hidden />
      </button>
      {open && (
        <div className="user-pop" role="menu">
          <p className="user-id">{user.username}</p>
          <button role="menuitem" onClick={() => navigate('/password')}>
            <KeyRound size={16} aria-hidden />
            비밀번호 변경
          </button>
          <button role="menuitem" onClick={() => logout()}>
            <LogOut size={16} aria-hidden />
            로그아웃
          </button>
        </div>
      )}
    </div>
  )
}
