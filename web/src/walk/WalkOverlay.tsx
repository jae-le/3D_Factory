const KEYS: [string, string][] = [
  ['W A S D', '이동 (방향키도)'],
  ['드래그', '시점 회전'],
  ['Shift', '달리기'],
  ['M', '조감 뷰 ↔ 걷기'],
  ['클릭 / E', '설비 상세정보'],
  ['Esc', '패널 닫기 · 나가기'],
  ['터치', '왼쪽 이동 · 오른쪽 시점'],
]

interface Props { drawingName: string; ready: boolean; onEnter(): void }

/** 시작 화면 (참고 파일 #overlay): 3D 위 어두운 카드 — 제목 · 도면 이름 · 조작 키 · 입장하기 */
export function WalkOverlay({ drawingName, ready, onEnter }: Props) {
  return (
    <section className="walk-overlay" aria-labelledby="walk-title">
      <div className="walk-card">
        <h2 id="walk-title">체험 공간</h2>
        <p className="sub">{drawingName || '도면 불러오는 중…'}</p>
        <ul className="walk-keys">
          {KEYS.map(([k, v]) => (
            <li key={k}>
              <kbd>{k}</kbd>
              {v}
            </li>
          ))}
        </ul>
        <button type="button" className="walk-enter" disabled={!ready} onClick={onEnter}>
          입장하기
        </button>
        <p className="hint">{ready ? '설비에 마우스를 올리면 이름이, 클릭하면 상세정보가 표시됩니다' : '도면·객체 불러오는 중…'}</p>
      </div>
    </section>
  )
}
