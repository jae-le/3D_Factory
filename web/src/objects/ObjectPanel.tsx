import { PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react'
import { useState } from 'react'
import { ModelCard } from './ModelCard'
import { PlacementList } from './PlacementList'
import { CATEGORY_LABEL, type Category, type ModelInfo, type Placement } from './types'

interface Props {
  models: ModelInfo[]
  placements: Placement[]
  canEdit: boolean
  selectedId: number | null
  placingModelId: number | null
  onPickModel(m: ModelInfo): void
  onSelect(id: number): void
  onAddModel(): void
}

const CATEGORIES = Object.keys(CATEGORY_LABEL) as Category[]

/** 레일 옆 객체 패널(화면 높이, 옆으로 펼침·접기): 분류 탭 + 모델 카드(누르면 배치 모드) · 객체 추가 · 이 도면의 객체 목록 */
export function ObjectPanel({ models, placements, canEdit, selectedId, placingModelId, onPickModel, onSelect, onAddModel }: Props) {
  const [open, setOpen] = useState(true)
  const [tab, setTab] = useState<Category>('equip')
  const cards = models.filter((m) => m.category === tab)
  return (
    <aside className={open ? 'object-panel' : 'object-panel closed'} aria-label="객체 패널">
      <div className="object-panel-inner" inert={!open}>
        <header>
          <span>객체</span>
          <button className="icon-btn" aria-label="객체 패널 닫기" aria-expanded onClick={() => setOpen(false)}>
            <PanelLeftClose size={16} aria-hidden />
          </button>
        </header>
        <div className="object-tabs" role="tablist" aria-label="모델 분류">
          {CATEGORIES.map((c) => (
            <button key={c} role="tab" aria-selected={tab === c} onClick={() => setTab(c)}>
              {CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
        <div className="model-cards" role="tabpanel" aria-label={CATEGORY_LABEL[tab]}>
          {cards.map((m) => (
            <ModelCard key={m.id} model={m} on={m.id === placingModelId} onPick={canEdit ? () => onPickModel(m) : undefined} />
          ))}
          {cards.length === 0 && <p className="placement-empty">이 분류의 모델이 없습니다</p>}
        </div>
        {canEdit && (
          <button className="object-add" onClick={onAddModel}>
            <Plus size={14} aria-hidden /> 객체 추가
          </button>
        )}
        <PlacementList placements={placements} models={models} selectedId={selectedId} onSelect={onSelect} />
      </div>
      {!open && (
        <button className="object-panel-handle" aria-label="객체 패널 열기" aria-expanded={false} title="객체 패널 열기" onClick={() => setOpen(true)}>
          <PanelLeftOpen size={16} aria-hidden />
          <span>객체</span>
        </button>
      )}
    </aside>
  )
}
