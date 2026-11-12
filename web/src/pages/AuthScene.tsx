import type { ReactNode } from 'react'
import '../styles/auth.css'

/**
 * 로그인·비밀번호 변경 배경: 어두운 남색 바탕 + 지평선으로 멀어지는 바닥 격자(천천히 앞으로 흐름)
 * + 가운데로 모이는 파란 빛줄기(아주 천천히 돎) + 가운데 은은한 빛.
 * 카드는 가운데 파란 유리.
 */
export function AuthScene({ children }: { children: ReactNode }) {
  return (
    <main className="auth-scene">
      <span className="auth-grid" aria-hidden />
      <span className="auth-beams" aria-hidden>
        <span className="auth-beam left" />
        <span className="auth-beam right" />
      </span>
      <span className="auth-band" aria-hidden />
      {children}
    </main>
  )
}
