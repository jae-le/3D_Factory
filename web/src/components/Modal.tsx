import { useEffect, type ReactNode } from 'react'

/** DESIGN.md 모달: 직각, 그림자, 어두운 바탕. wide = 넓은 창 (미리보기 등) */
export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose(): void; wide?: boolean }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])
  return (
    <div className="kp-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={wide ? 'kp-modal kp-modal-wide' : 'kp-modal'} role="dialog" aria-modal="true" aria-label={title}>
        <header className="kp-modal-head">
          <h2>{title}</h2>
          <button className="kp-modal-x" aria-label="닫기" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="kp-modal-body">{children}</div>
      </div>
    </div>
  )
}
