import { Plus } from 'lucide-react'
import type { DrawingSummary } from '../api/types'

interface Props {
  drawings: DrawingSummary[]
  selectedId: number | null
  onSelect: (id: number) => void
  canAdd: boolean
  onAdd: () => void
}

/** 머리글 왼쪽: 도면 select + 도면 추가 */
export function DrawingBar({ drawings, selectedId, onSelect, canAdd, onAdd }: Props) {
  return (
    <div className="drawing-bar">
      <label className="drawing-select">
        <span>도면</span>
        <select
          aria-label="도면 선택"
          value={selectedId ?? ''}
          disabled={drawings.length === 0}
          onChange={(e) => onSelect(Number(e.target.value))}
        >
          {drawings.length === 0 ? (
            <option value="">등록된 도면 없음</option>
          ) : (
            drawings.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))
          )}
        </select>
      </label>
      {canAdd && (
        <button className="bar-btn" onClick={onAdd}>
          <Plus size={16} aria-hidden />
          도면 추가
        </button>
      )}
    </div>
  )
}
