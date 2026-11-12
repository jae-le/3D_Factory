import { useState } from 'react'
import { hasRole, useAuth } from '../auth/context'
import { loadStored, pickDrawing, saveStored, useDrawings } from '../drawing/useDrawings'
import { AppShell } from '../layout/AppShell'
import { DrawingBar } from '../layout/DrawingBar'
import { ErrorPage } from './ErrorPage'

/** / — 3D 공장 화면. P1 은 레이아웃과 도면 선택까지, 3D 는 P2 */
export function FactoryPage() {
  const { user } = useAuth()
  const drawings = useDrawings()
  const [chosen, setChosen] = useState<number | null>(() => (user ? loadStored(user.username) : null))
  if (drawings.kind === 'error')
    return <ErrorPage code={drawings.error.kind === 'network' ? 'offline' : '500'} detail={drawings.error.message} />
  const list = drawings.kind === 'ok' ? drawings.list : []
  const selectedId = pickDrawing(list, chosen)
  const current = list.find((d) => d.id === selectedId)
  const select = (id: number) => {
    setChosen(id)
    if (user) saveStored(user.username, id)
  }
  return (
    <AppShell
      active="factory"
      head={<DrawingBar drawings={list} selectedId={selectedId} onSelect={select} canAdd={hasRole(user, 'OPERATOR')} />}
    >
      {drawings.kind === 'loading' ? (
        <p className="empty-state" role="status">
          도면 목록 불러오는 중…
        </p>
      ) : current ? (
        <div className="empty-state">
          <strong>{current.name}</strong>
          <span>3D 화면은 다음 단계(P2)에서 표시됩니다.</span>
        </div>
      ) : (
        <div className="empty-state">
          <strong>등록된 도면이 없습니다</strong>
          <span>도면을 추가하면 3D 공장이 여기에 표시됩니다.</span>
        </div>
      )}
    </AppShell>
  )
}
