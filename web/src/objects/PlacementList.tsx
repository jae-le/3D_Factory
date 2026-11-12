import { Search } from 'lucide-react'
import { useState } from 'react'
import type { ModelInfo, Placement } from './types'

/** 이 도면의 객체 목록 + 검색 (이름 · 모델 이름 · 표기) */
export function PlacementList({ placements, models, selectedId, onSelect }: { placements: Placement[]; models: ModelInfo[]; selectedId: number | null; onSelect(id: number): void }) {
  const [q, setQ] = useState('')
  const byId = new Map(models.map((m) => [m.id, m]))
  const key = q.trim().toLowerCase()
  const rows = placements
    .map((p) => ({ p, model: p.modelId != null ? (byId.get(p.modelId) ?? null) : null }))
    .filter(({ p, model }) => !key || [p.name, model?.name, p.hintLabel].some((s) => s?.toLowerCase().includes(key)))
  return (
    <>
      <div className="placement-head">
        <span>{`이 도면의 객체 ${placements.length}`}</span>
        <label className="placement-search">
          <Search size={14} aria-hidden />
          <input aria-label="객체 검색" placeholder="이름 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      <ul className="placement-list" aria-label="이 도면의 객체">
        {rows.map(({ p, model }) => (
          <li key={p.id}>
            <button className={p.id === selectedId ? 'on' : ''} aria-current={p.id === selectedId || undefined} onClick={() => onSelect(p.id)}>
              <span>{p.name}</span>
              <span className="muted">{model ? model.name : '모델 없음'}</span>
            </button>
          </li>
        ))}
      </ul>
      {rows.length === 0 && <p className="placement-empty">{placements.length ? '찾는 객체가 없습니다' : '배치된 객체가 없습니다'}</p>}
    </>
  )
}
