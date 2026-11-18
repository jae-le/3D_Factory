import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceBetween,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceBetween,
  X,
  type LucideIcon,
} from 'lucide-react'
import { canAlign, type AlignOp } from './align'

const OPS: { op: AlignOp; label: string; icon: LucideIcon }[][] = [
  [
    { op: 'left', label: '왼쪽 맞춤', icon: AlignStartVertical },
    { op: 'hcenter', label: '가로 가운데 맞춤', icon: AlignCenterVertical },
    { op: 'right', label: '오른쪽 맞춤', icon: AlignEndVertical },
  ],
  [
    { op: 'top', label: '위쪽 맞춤', icon: AlignStartHorizontal },
    { op: 'vmiddle', label: '세로 가운데 맞춤', icon: AlignCenterHorizontal },
    { op: 'bottom', label: '아래쪽 맞춤', icon: AlignEndHorizontal },
  ],
  [
    { op: 'hdist', label: '가로 간격 고르게', icon: AlignHorizontalSpaceBetween },
    { op: 'vdist', label: '세로 간격 고르게', icon: AlignVerticalSpaceBetween },
  ],
]

interface Props {
  names: string[]
  canEdit: boolean
  onAlign(op: AlignOp): void
  onClose(): void
}

/** 여러 객체를 골랐을 때 (Shift+클릭): 몇 개 · 정렬 · 간격 고르게 */
export function MultiSelectCard({ names, canEdit, onAlign, onClose }: Props) {
  return (
    <section className="object-info" aria-label="여러 객체 선택">
      <div className="object-info-head">
        <strong className="multi-count">{names.length}개 선택</strong>
        <button className="icon-btn" aria-label="선택 해제" onClick={onClose}>
          <X size={16} aria-hidden />
        </button>
      </div>
      <p className="multi-names" title={names.join(', ')}>
        {names.join(', ')}
      </p>
      {canEdit ? (
        <div className="multi-align" role="toolbar" aria-label="정렬">
          {OPS.map((group, i) => (
            <div key={i} className="multi-align-group">
              {group.map(({ op, label, icon: Icon }) => (
                <button key={op} aria-label={label} title={op.endsWith('dist') ? `${label} (3개 이상)` : label} disabled={!canAlign(op, names.length)} onClick={() => onAlign(op)}>
                  <Icon size={16} aria-hidden />
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <p className="multi-names">조회 권한은 정렬할 수 없습니다.</p>
      )}
      <p className="multi-help">Shift+클릭으로 더하거나 빼기 · 정렬은 Ctrl+Z 한 번에 되돌림</p>
    </section>
  )
}
