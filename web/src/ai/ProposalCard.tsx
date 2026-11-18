import { BrickWall, Check, LoaderCircle, MapPin, MoveRight, Pencil, RotateCw, SlidersHorizontal, SquarePlus, Trash2, Type, Undo2, type LucideIcon } from 'lucide-react'
import type { ProposalState } from './chat'
import type { ChangeKind, ProposalItem } from './types'

const ICON: Record<ChangeKind, LucideIcon> = {
  'placement.move': MoveRight,
  'placement.rotate': RotateCw,
  'placement.rename': Type,
  'placement.update': Pencil,
  'placement.add': SquarePlus,
  'placement.delete': Trash2,
  'station.update': SlidersHorizontal,
  'plan.partition.add': BrickWall,
  'plan.partition.delete': BrickWall,
  'plan.zone.rename': MapPin,
  'plan.text.rename': Type,
  'plan.text.add': Type,
  'plan.text.delete': Trash2,
}

interface Props {
  state: ProposalState
  onApply(): void
  onDiscard(): void
  onRevert(): void
  onHover(seq: number | null): void
  onFocus(item: ProposalItem): void
}

/** 변경 제안 카드: 항목(마우스 = 3D 강조, 클릭 = 카메라 이동) · 적용/취소 · 적용됨/되돌리기 */
export function ProposalCard({ state, onApply, onDiscard, onRevert, onHover, onFocus }: Props) {
  const { proposal, status, result, error } = state
  const skipped = new Map((result?.skipped ?? []).map((s) => [s.seq, s.reason]))
  return (
    <section className={`proposal-card ${status}`} aria-label="변경 제안">
      <header>
        <strong>변경 {proposal.items.length}건</strong>
        {(status === 'open' || status === 'applying') && <span>3D 에 미리 보는 중 · 아직 저장 안 됨</span>}
      </header>
      <ul>
        {proposal.items.map((it) => {
          const Icon = ICON[it.kind] ?? Pencil
          const why = skipped.get(it.seq)
          return (
            <li key={it.seq} className={why ? 'skipped' : undefined} onMouseEnter={() => onHover(it.seq)} onMouseLeave={() => onHover(null)}>
              <button className="proposal-item" onClick={() => onFocus(it)} title="3D 에서 보기">
                <Icon size={14} aria-hidden />
                <span>{it.label}</span>
              </button>
              {why && <p className="proposal-skip">건너뜀: {why}</p>}
            </li>
          )
        })}
      </ul>
      {error && <p className="chat-error" role="alert">{error}</p>}
      <footer>
        {status === 'open' && (
          <>
            <button className="chat-btn primary" onClick={onApply}>
              <Check size={14} aria-hidden /> 적용
            </button>
            <button className="chat-btn" onClick={onDiscard}>
              취소
            </button>
          </>
        )}
        {status === 'applying' && (
          <span className="proposal-state">
            <LoaderCircle size={14} className="spin" aria-hidden /> 적용 중…
          </span>
        )}
        {(status === 'applied' || status === 'reverting') && (
          <>
            <span className="proposal-state ok">
              적용됨 · {result?.applied ?? 0}건{result && result.skipped.length > 0 ? ` (건너뜀 ${result.skipped.length}건)` : ''}
            </span>
            <button className="chat-btn" onClick={onRevert} disabled={status === 'reverting' || !result?.applied}>
              <Undo2 size={14} aria-hidden /> 되돌리기
            </button>
          </>
        )}
        {status === 'reverted' && <span className="proposal-state">되돌렸습니다</span>}
      </footer>
    </section>
  )
}
