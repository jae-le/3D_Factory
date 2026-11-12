import { SearchX, ShieldX, TriangleAlert, WifiOff, type LucideIcon } from 'lucide-react'

export type ErrorCode = '404' | '500' | '403' | 'offline'

const PAGES: Record<ErrorCode, { title: string; desc: string; icon: LucideIcon }> = {
  '404': { title: '찾을 수 없습니다', desc: '주소가 잘못됐거나 없는 화면입니다.', icon: SearchX },
  '500': { title: '서버에서 오류가 났습니다', desc: '잠시 후 다시 시도해 주세요. 계속되면 관리자에게 알려 주세요.', icon: TriangleAlert },
  '403': { title: '이 화면을 볼 권한이 없습니다', desc: '권한이 필요하면 관리자에게 요청하세요.', icon: ShieldX },
  offline: { title: '서버에 연결할 수 없습니다', desc: '네트워크와 서버 상태를 확인한 뒤 다시 시도해 주세요.', icon: WifiOff },
}

interface Props {
  code: ErrorCode
  detail?: string // 기본 설명 대신 보여 줄 문장
  onRetry?: () => void
}

/** 오류 페이지 (새 화면 — DESIGN.md 그대로): 가운데 흰 카드 하나 */
export function ErrorPage({ code, detail, onRetry }: Props) {
  const p = PAGES[code]
  const Icon = p.icon
  return (
    <main className="kp-page" aria-labelledby="error-title">
      <section className="kp-card kp-error-card">
        <Icon className="kp-error-icon" size={40} strokeWidth={1.5} aria-hidden />
        {code !== 'offline' && <p className="kp-error-code">{code}</p>}
        <h1 id="error-title" className="kp-error-title">
          {p.title}
        </h1>
        <p className="kp-error-desc">{detail ?? p.desc}</p>
        <div className="kp-error-actions">
          {onRetry && (
            <button className="kp-btn kp-btn-primary" onClick={onRetry}>
              다시 시도
            </button>
          )}
          <a className={`kp-btn ${onRetry ? 'kp-btn-stroke' : 'kp-btn-primary'}`} href="/">
            처음으로
          </a>
        </div>
      </section>
    </main>
  )
}
