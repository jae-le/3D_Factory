import { useState, type Ref } from 'react'
import { gaugeCells } from './gauge'
import { STATUS_LABEL } from './status'
import { useTweened } from './tween'
import type { ProjectLive, StationLive } from './types'

interface Props { s: StationLive; project?: ProjectLive; selected: boolean; onClick(): void; ref?: Ref<HTMLButtonElement> }

/** 설비 위 스테이션 칩 (demo chipHtml). 실적·목표는 0.6초 보간, 한 대 완료(값이 내려감)는 바로 */
export function StationChip({ s, project, selected, onClick, ref }: Props) {
  const actual = useTweened(s.actual, 600, { snapDown: true })
  const target = useTweened(s.target, 600, { snapDown: true })
  // 상태가 바뀔 때마다 반짝 (flash-a ↔ flash-b 로 바꿔 CSS 애니메이션을 다시 시작) — 렌더 중 조정
  const [seen, setSeen] = useState(s.status)
  const [flash, setFlash] = useState(0)
  if (seen !== s.status) {
    setSeen(s.status)
    setFlash((n) => n + 1)
  }
  const st = s.status
  const n = s.steps.length
  const a = Math.round(actual)
  const t = Math.min(100, Math.round(target))
  const gap = a - Math.round(target)
  const cls = ['dlabel', st, selected ? 'sel' : '', flash ? (flash % 2 ? 'flash-a' : 'flash-b') : ''].filter(Boolean).join(' ')
  return (
    <button ref={ref} type="button" className={cls} aria-pressed={selected} onClick={onClick}>
      <span className="ch">
        <span className={`dno ${st}`}>{s.no}</span>
        <b>{s.name}</b>
        <span className={`pill ${st}`}>{STATUS_LABEL[st]}</span>
      </span>
      {project && (
        <span className="pjt">
          {`${project.name} #${s.unitNo ?? Math.min(project.total, project.done + 1)}`} <span>{`· 제작 ${project.done}/${project.total}`}</span>
        </span>
      )}
      <span className="job">
        <span className="stp">{`${s.step}/${n}`}</span>
        {s.steps[s.step - 1] ?? ''}
      </span>
      <span className="cb">
        <span className={`gauge ${st}`} aria-hidden>
          {gaugeCells(n, actual, target).map((c, i) => (
            <i key={i} className={[c.on ? 'on' : '', c.target ? 'tg' : '', c.current ? 'cur' : ''].filter(Boolean).join(' ') || undefined} />
          ))}
        </span>
        <span className="pct">{`${a}%`}</span>
      </span>
      <span className="nums">
        <span>{`목표 ${t}%`}</span>
        <span className={`st ${st}`}>{`계획 대비 ${gap >= 0 ? '+' : ''}${gap}%p`}</span>
      </span>
    </button>
  )
}
