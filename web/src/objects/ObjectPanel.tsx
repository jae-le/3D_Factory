import { ChevronDown, Plus } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { ModelCard } from './ModelCard'
import { PlacementList } from './PlacementList'
import { CATEGORY_LABEL, type Category, type ModelInfo, type Placement } from './types'

interface Props {
  open: boolean
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

/** 번호 붙은 접이식 카드 (demo 왼쪽 패널 구역) */
function Section({ no, title, grow, children }: { no: number; title: ReactNode; grow?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <section className={['panel-sec', open ? 'open' : '', grow && open ? 'grow' : ''].filter(Boolean).join(' ')}>
      <button className="panel-sec-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="panel-sec-no">{no}</span>
        <span className="panel-sec-title">{title}</span>
        <ChevronDown size={14} aria-hidden className="panel-sec-chev" />
      </button>
      {open && <div className="panel-sec-body">{children}</div>}
    </section>
  )
}

/** 레일 옆 객체 패널(화면 높이, 레일 '객체' 로 펼침·접기): 모델 라이브러리(분류 탭·카드·객체 추가) · 이 도면의 객체 목록 */
export function ObjectPanel({ open, models, placements, canEdit, selectedId, placingModelId, onPickModel, onSelect, onAddModel }: Props) {
  const [tab, setTab] = useState<Category>('equip')
  const cards = models.filter((m) => m.category === tab)
  return (
    <aside className={open ? 'side-panel' : 'side-panel closed'} aria-label="객체 패널" aria-hidden={!open}>
      <div className="side-panel-inner" inert={!open}>
        <header className="side-panel-head">
          <strong>객체</strong>
          <span>모델 라이브러리 · 배치 · 이 도면의 객체</span>
        </header>
        <div className="side-panel-body">
          <Section no={1} title="모델 라이브러리">
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
          </Section>
          <Section no={2} title="이 도면의 객체" grow>
            <PlacementList placements={placements} models={models} selectedId={selectedId} onSelect={onSelect} />
          </Section>
        </div>
      </div>
    </aside>
  )
}
