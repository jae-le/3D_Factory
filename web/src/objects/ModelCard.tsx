import { modelThumbUrl } from './api'
import type { ModelInfo } from './types'

/** 모델 카드 (썸네일 · 이름) — 누르면 배치 모드 */
export function ModelCard({ model, on, onPick }: { model: ModelInfo; on: boolean; onPick?: () => void }) {
  return (
    <button className={on ? 'model-card on' : 'model-card'} aria-pressed={on} onClick={onPick}>
      <img src={modelThumbUrl(model)} alt="" loading="lazy" />
      <span>{model.name}</span>
    </button>
  )
}
