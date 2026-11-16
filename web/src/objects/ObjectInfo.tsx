import { Check, Move, RotateCw, Trash2, X } from 'lucide-react'
import { useRef, useState } from 'react'
import type { ModelInfo, Placement } from './types'

interface Props {
  placement: Placement
  model: ModelInfo | null
  models: ModelInfo[]
  canEdit: boolean
  editing: boolean
  /** false = 거절(같은 이름 등): 입력을 원래 이름으로 되돌리고 다시 고칠 수 있게 함 */
  onRename(name: string): boolean | void
  onEdit(): void
  onRotate(): void
  onDelete(): void
  onAssign(modelId: number): void
  onClose(): void
}

/** 선택한 객체 정보 카드 (오른쪽 아래): 이름 · 모델 · 위치 · 회전 + 편집 · 90° 회전 · 모델 지정 · 삭제 */
export function ObjectInfo({ placement, model, models, canEdit, editing, onRename, onEdit, onRotate, onDelete, onAssign, onClose }: Props) {
  const [name, setName] = useState(placement.name)
  const sent = useRef(placement.name) // Enter 뒤 blur 로 같은 이름을 두 번 보내지 않게
  const commit = () => {
    const v = name.trim()
    if (!v) {
      setName(placement.name)
      return
    }
    if (v === sent.current) return
    sent.current = v
    if (onRename(v) === false) {
      sent.current = placement.name
      setName(placement.name)
    }
  }
  return (
    <section className="object-info" aria-label="객체 정보">
      <div className="object-info-head">
        <input
          className="kp-input"
          aria-label="객체 이름"
          value={name}
          readOnly={!canEdit}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => canEdit && commit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canEdit) commit()
            else if (e.key === 'Escape') {
              setName(placement.name)
              e.currentTarget.blur()
            }
          }}
        />
        <button className="icon-btn" aria-label="객체 정보 닫기" onClick={onClose}>
          <X size={16} aria-hidden />
        </button>
      </div>
      <dl className="object-info-rows">
        <dt>모델</dt>
        <dd>
          {model ? (
            model.name
          ) : canEdit ? (
            <select className="kp-input" aria-label="모델 지정" value="" onChange={(e) => e.target.value && onAssign(Number(e.target.value))}>
              <option value="">모델 없음 — 지정</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          ) : (
            '모델 없음'
          )}
        </dd>
        <dt>위치</dt>
        <dd>{`${placement.x.toFixed(2)}, ${placement.y.toFixed(2)} m`}</dd>
        <dt>회전</dt>
        <dd>{`${placement.rot}°`}</dd>
      </dl>
      {canEdit && (
        <div className="object-info-actions">
          <button className={editing ? 'on' : ''} aria-pressed={editing} onClick={onEdit}>
            {editing ? <Check size={14} aria-hidden /> : <Move size={14} aria-hidden />}
            {editing ? '편집 완료' : '편집'}
          </button>
          <button onClick={onRotate}>
            <RotateCw size={14} aria-hidden /> 90° 회전
          </button>
          <button className="danger" onClick={onDelete}>
            <Trash2 size={14} aria-hidden /> 삭제
          </button>
        </div>
      )}
    </section>
  )
}
