import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../auth/context'
import { AuthScene } from './AuthScene'

const RULE = '8자 이상, 영문과 숫자를 섞어 주세요. 아이디와 같으면 안 됩니다.'

/** 비밀번호 변경 (로그인 화면과 같은 배경·카드). 첫 로그인·초기화 뒤에는 이 화면만 열림 */
export function PasswordPage() {
  const { user, changePassword, logout } = useAuth()
  const navigate = useNavigate()
  const forced = !!user?.mustChangePassword
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!current || !next) return setError('모든 칸을 입력하세요.')
    if (next !== confirm) return setError('새 비밀번호가 서로 다릅니다.')
    setBusy(true)
    setError(null)
    try {
      await changePassword(current, next)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <AuthScene>
      <form className="auth-card" onSubmit={submit} aria-labelledby="pw-title">
        <h1 id="pw-title" className="auth-title">
          비밀번호 변경
        </h1>
        <p className="auth-welcome small">
          {forced ? `${user?.displayName}님, 처음 로그인했거나 비밀번호가 초기화되어 새 비밀번호를 정해야 합니다.` : RULE}
        </p>
        <label className="auth-field">
          <span>{forced ? '받은 임시 비밀번호' : '지금 비밀번호'}</span>
          <input className="auth-input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </label>
        <label className="auth-field">
          <span>새 비밀번호</span>
          <input className="auth-input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </label>
        <label className="auth-field">
          <span>새 비밀번호 확인</span>
          <input className="auth-input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        {forced && <p className="auth-help">{RULE}</p>}
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <button className="auth-btn" disabled={busy}>
          {busy ? '바꾸는 중…' : '비밀번호 바꾸기'}
        </button>
        {forced ? (
          <button type="button" className="auth-link" onClick={() => logout()}>
            다른 계정으로 로그인
          </button>
        ) : (
          <button type="button" className="auth-link" onClick={() => navigate(-1)}>
            취소
          </button>
        )}
      </form>
    </AuthScene>
  )
}
