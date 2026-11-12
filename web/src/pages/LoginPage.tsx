import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { safeNext, useAuth } from '../auth/context'
import { AuthScene } from './AuthScene'

/** 로그인: 마주 보는 실제·디지털 트윈 배경 + 청록 유리 카드 (사용자 레퍼런스 — 색만 DESIGN.md 예외). 로그인하면 원래 보려던 주소로 */
export function LoginPage() {
  const { state, login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (state.status === 'ok') return <Navigate to={state.user.mustChangePassword ? '/password' : next} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) return setError('아이디와 비밀번호를 입력하세요.')
    setBusy(true)
    setError(null)
    try {
      const user = await login(username.trim(), password)
      navigate(user.mustChangePassword ? '/password' : next, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <AuthScene>
      <form className="auth-card" onSubmit={submit} aria-labelledby="login-title">
        <h1 id="login-title" className="auth-logo">
          FACTORY 3D
        </h1>
        <p className="auth-welcome">다시 오신 것을 환영합니다</p>
        <label className="auth-field">
          <span>아이디</span>
          <input className="auth-input" autoComplete="username" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label className="auth-field">
          <span>비밀번호</span>
          <input
            className="auth-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <button className="auth-btn" disabled={busy}>
          {busy ? '로그인 중…' : '로그인'}
        </button>
        <p className="auth-help">계정이 없거나 비밀번호를 잊었다면 관리자에게 문의하세요.</p>
      </form>
    </AuthScene>
  )
}
