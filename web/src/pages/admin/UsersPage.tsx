import { Copy, KeyRound, Pencil, Trash2, UserPlus } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Modal } from '../../components/Modal'
import { apiJson, apiSend } from '../../api/client'
import { ROLE_LABEL, useAuth, type Role, type User } from '../../auth/context'
import { when } from './format'

interface WithTemp {
  user: User
  tempPassword: string
}

const ROLES: { role: Role; desc: string }[] = [
  { role: 'VIEWER', desc: '모니터링만' },
  { role: 'OPERATOR', desc: '모니터링 + 시운전 점검' },
  { role: 'ADMIN', desc: '전부 + 사용자 관리' },
]

/** 설정 › 사용자: 목록 · 추가 · 수정(이름·역할·사용 여부) · 비밀번호 초기화 */
export function UsersPage() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState<User[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<User | 'new' | null>(null)
  const [temp, setTemp] = useState<WithTemp | null>(null)
  const [resetting, setResetting] = useState<User | null>(null)
  const [deleting, setDeleting] = useState<User | null>(null)

  const load = useCallback(() => {
    apiJson<User[]>('/api/users')
      .then(setUsers)
      .catch((e: Error) => setError(e.message))
  }, [])
  useEffect(load, [load])

  return (
    <section className="kp-card kp-section" aria-label="사용자">
      <div className="kp-section-head">
        <div>
          <h2>사용자</h2>
          <p className="kp-desc">플랫폼에 로그인할 수 있는 계정입니다. 새 계정과 초기화한 계정은 첫 로그인 때 비밀번호를 바꿔야 합니다.</p>
        </div>
        <button className="kp-btn kp-btn-primary kp-btn-sm" onClick={() => setEditing('new')}>
          <UserPlus size={16} aria-hidden />
          사용자 추가
        </button>
      </div>
      {error && <p className="kp-error-text">{error}</p>}
      {users === null ? (
        <p className="kp-desc">불러오는 중…</p>
      ) : (
        <table className="kp-table">
          <thead>
            <tr>
              <th>아이디</th>
              <th>이름</th>
              <th>역할</th>
              <th>상태</th>
              <th>마지막 로그인</th>
              <th aria-label="관리" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.enabled ? undefined : 'off'}>
                <td className="mono">{u.username}</td>
                <td>{u.displayName}</td>
                <td>
                  <span className={`kp-badge role-${u.role.toLowerCase()}`}>{ROLE_LABEL[u.role]}</span>
                </td>
                <td>
                  <UserState u={u} />
                </td>
                <td>{when(u.lastLoginAt)}</td>
                <td className="actions">
                  <button className="kp-btn kp-btn-stroke kp-btn-xs" onClick={() => setEditing(u)} aria-label={`${u.username} 수정`}>
                    <Pencil size={14} aria-hidden />
                    수정
                  </button>
                  <button className="kp-btn kp-btn-stroke kp-btn-xs" onClick={() => setResetting(u)} aria-label={`${u.username} 비밀번호 초기화`}>
                    <KeyRound size={14} aria-hidden />
                    비밀번호 초기화
                  </button>
                  {u.username !== me?.username && (
                    <button className="kp-btn kp-btn-danger kp-btn-xs" onClick={() => setDeleting(u)} aria-label={`${u.username} 삭제`}>
                      <Trash2 size={14} aria-hidden />
                      삭제
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <UserDialog
          user={editing === 'new' ? null : editing}
          isSelf={editing !== 'new' && editing.username === me?.username}
          onClose={() => setEditing(null)}
          onSaved={(r) => {
            setEditing(null)
            if (r) setTemp(r)
            load()
          }}
        />
      )}
      {resetting && (
        <Confirm
          title="비밀번호 초기화"
          ok="초기화"
          onCancel={() => setResetting(null)}
          onOk={async () => {
            const r = await apiSend<WithTemp>('POST', `/api/users/${resetting.id}/reset-password`)
            setResetting(null)
            setTemp(r)
            load()
          }}
        >
          <b>{resetting.displayName}</b>({resetting.username})의 비밀번호를 임시 비밀번호로 바꿉니다. 지금 로그인해 있다면 로그아웃되고, 다음 로그인 때 새 비밀번호를
          정해야 합니다.
        </Confirm>
      )}
      {deleting && (
        <Confirm
          title="사용자 삭제"
          ok="삭제"
          danger
          onCancel={() => setDeleting(null)}
          onOk={async () => {
            await apiSend('DELETE', `/api/users/${deleting.id}`)
            setDeleting(null)
            load()
          }}
        >
          <b>{deleting.displayName}</b>({deleting.username}) 계정을 삭제합니다. 지금 로그인해 있다면 바로 로그아웃되고, 되돌릴 수 없습니다. 감사 기록은 그대로
          남습니다. 잠시 막기만 하려면 「수정」에서 로그인 허용을 끄세요.
        </Confirm>
      )}
      {temp && <TempPassword data={temp} onClose={() => setTemp(null)} />}
    </section>
  )
}

function UserState({ u }: { u: User }) {
  if (!u.enabled) return <span className="kp-state off">사용 중지</span>
  if (u.locked) return <span className="kp-state warn">잠김 (10분)</span>
  if (u.mustChangePassword) return <span className="kp-state info">비밀번호 변경 필요</span>
  return <span className="kp-state ok">사용</span>
}

/** 추가·수정 창. 추가면 임시 비밀번호를 돌려줌 */
function UserDialog({
  user,
  isSelf,
  onClose,
  onSaved,
}: {
  user: User | null
  isSelf: boolean
  onClose(): void
  onSaved(created: WithTemp | null): void
}) {
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [role, setRole] = useState<Role>(user?.role ?? 'VIEWER')
  const [enabled, setEnabled] = useState(user?.enabled ?? true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (user) {
        await apiSend('PATCH', `/api/users/${user.id}`, { displayName, role, enabled })
        onSaved(null)
      } else onSaved(await apiSend<WithTemp>('POST', '/api/users', { username, displayName, role }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <Modal title={user ? `사용자 수정 — ${user.username}` : '사용자 추가'} onClose={onClose}>
      <form onSubmit={submit} className="kp-form">
        {!user && (
          <label className="kp-field">
            <span>아이디</span>
            <input className="kp-input" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus placeholder="영문 소문자·숫자 3~32자" />
          </label>
        )}
        <label className="kp-field">
          <span>이름</span>
          <input className="kp-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoFocus={!!user} />
        </label>
        <div className="kp-field" role="radiogroup" aria-label="역할">
          <span>역할</span>
          <div className="kp-segment">
            {ROLES.map((r) => (
              <button
                key={r.role}
                type="button"
                role="radio"
                aria-checked={role === r.role}
                onClick={() => setRole(r.role)}
              >
                <b>{ROLE_LABEL[r.role]}</b>
                <small>{r.desc}</small>
              </button>
            ))}
          </div>
        </div>
        {user && (
          <label className="kp-check">
            <input type="checkbox" checked={enabled} disabled={isSelf} onChange={(e) => setEnabled(e.target.checked)} />
            로그인 허용 {isSelf && <small>(자기 자신은 사용 중지할 수 없음)</small>}
          </label>
        )}
        {error && (
          <p className="kp-error-text" role="alert">
            {error}
          </p>
        )}
        <div className="kp-modal-actions">
          <button type="button" className="kp-btn kp-btn-stroke" onClick={onClose}>
            취소
          </button>
          <button className="kp-btn kp-btn-primary" disabled={busy}>
            {user ? '저장' : '추가'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/** 임시 비밀번호: 이 창에서만 보임 */
function TempPassword({ data, onClose }: { data: WithTemp; onClose(): void }) {
  const [copied, setCopied] = useState(false)
  return (
    <Modal title="임시 비밀번호" onClose={onClose}>
      <p className="kp-desc">
        <b>{data.user.displayName}</b>({data.user.username})에게 아래 임시 비밀번호를 전달하세요. 첫 로그인 때 새 비밀번호로 바꿔야 합니다.
        <br />이 창을 닫으면 다시 볼 수 없습니다.
      </p>
      <div className="kp-temp">
        <code>{data.tempPassword}</code>
        <button
          className="kp-btn kp-btn-stroke kp-btn-xs"
          onClick={() => navigator.clipboard?.writeText(data.tempPassword).then(() => setCopied(true))}
        >
          <Copy size={14} aria-hidden />
          {copied ? '복사됨' : '복사'}
        </button>
      </div>
      <div className="kp-modal-actions">
        <button className="kp-btn kp-btn-primary" onClick={onClose}>
          확인
        </button>
      </div>
    </Modal>
  )
}

function Confirm({
  title,
  ok,
  danger = false,
  children,
  onOk,
  onCancel,
}: {
  title: string
  ok: string
  danger?: boolean
  children: ReactNode
  onOk(): Promise<void>
  onCancel(): void
}) {
  const [error, setError] = useState<string | null>(null)
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="kp-desc">{children}</p>
      {error && <p className="kp-error-text">{error}</p>}
      <div className="kp-modal-actions">
        <button className="kp-btn kp-btn-stroke" onClick={onCancel}>
          취소
        </button>
        <button
          className={`kp-btn ${danger ? 'kp-btn-danger-fill' : 'kp-btn-primary'}`}
          onClick={() => onOk().catch((e: Error) => setError(e.message))}
        >
          {ok}
        </button>
      </div>
    </Modal>
  )
}
