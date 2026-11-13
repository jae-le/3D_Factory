import type { Conn } from './types'

const TEXT: Record<Conn, string> = { connecting: '연결 중…', live: 'LIVE · 가상 데이터', retrying: '재연결 중…', closed: '도면을 찾을 수 없습니다' }

/** 오른쪽 위 연결 표시: 초록 점 LIVE / 주황 깜빡임 재연결 중 */
export function LiveBadge({ conn }: { conn: Conn }) {
  return (
    <p className={`live-badge ${conn}`} role="status">
      <i aria-hidden />
      {TEXT[conn]}
    </p>
  )
}
