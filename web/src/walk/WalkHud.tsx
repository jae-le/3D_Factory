import type { WalkMode } from './controller'

/** 커서가 가리키는 배치 이름표 (무대 기준 px) */
export interface TipView { name: string; x: number; y: number }

interface Props { mode: WalkMode; zone: string; tip: TipView | null; onTip(): void }

const HELP_WALK = 'WASD 이동 · 드래그 시점 회전 · Shift 달리기 · M 조감 뷰 · 클릭/E 상세정보 · Esc 나가기'
const HELP_OVERVIEW = '조감 뷰 — 드래그로 돌려 보기 · M 걷기로 돌아가기 · Esc 나가기'

/** 걷는 동안 덮개 (참고 파일 #hud): 조준점 · 구역 배지 · 이름표 · 도움말 줄. 이름표만 누를 수 있음 */
export function WalkHud({ mode, zone, tip, onTip }: Props) {
  return (
    <div className="walk-hud">
      {mode === 'walk' && <span className="walk-cross" aria-hidden />}
      <p className="walk-zone">{zone}</p>
      {tip && (
        <button type="button" className="walk-tip" style={{ left: tip.x, top: tip.y }} onClick={onTip}>
          {tip.name}
          <small>클릭 또는 E — 상세정보</small>
        </button>
      )}
      <p className="walk-help">{mode === 'walk' ? HELP_WALK : HELP_OVERVIEW}</p>
    </div>
  )
}
