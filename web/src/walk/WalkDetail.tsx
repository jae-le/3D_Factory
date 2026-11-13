import { X } from 'lucide-react'
import { gaugeCells } from '../dashboard/gauge'
import { STATUS_LABEL } from '../dashboard/status'
import type { ProjectLive, StationLive } from '../dashboard/types'
import { BOX_SIZE, CATEGORY_LABEL, type ModelInfo, type Placement } from '../objects/types'

interface Props { placement: Placement; model: ModelInfo | null; station: StationLive | null; project: ProjectLive | null; onClose(): void }

const m1 = (v: number) => String(Math.round(v * 10) / 10)

/** 오른쪽 상세 패널 (참고 파일 #detail): 사양 + 같은 이름의 공정이 있으면 상황판 실시간 상태 */
export function WalkDetail({ placement: p, model, station, project, onClose }: Props) {
  const size = model ?? BOX_SIZE
  return (
    <aside className="walk-detail" aria-label="상세정보">
      <div className="wd-head">
        <h2>{p.name}</h2>
        <button type="button" aria-label="상세정보 닫기" onClick={onClose}>
          <X size={16} aria-hidden />
        </button>
      </div>
      <p className="wd-type">{model ? `${CATEGORY_LABEL[model.category]} · ${model.name}` : '임시 상자'}</p>
      <h3 className="wd-sec">사양</h3>
      <table className="wd-specs">
        <tbody>
          <tr><th scope="row">모델</th><td>{model?.name ?? '임시 상자 (모델 없음)'}</td></tr>
          <tr><th scope="row">분류</th><td>{model ? CATEGORY_LABEL[model.category] : '—'}</td></tr>
          <tr><th scope="row">크기</th><td>{`${m1(size.sizeX)} × ${m1(size.sizeY)} × ${m1(size.sizeZ)} m`}</td></tr>
          <tr><th scope="row">위치</th><td>{`x ${p.x.toFixed(1)} · y ${p.y.toFixed(1)} m · ${p.rot}°`}</td></tr>
        </tbody>
      </table>
      <h3 className="wd-sec">실시간 상태</h3>
      {station ? <LiveBlock s={station} project={project} /> : <p className="wd-none">실시간 상태 없음</p>}
    </aside>
  )
}

function LiveBlock({ s, project }: { s: StationLive; project: ProjectLive | null }) {
  const n = s.steps.length
  const a = Math.round(s.actual)
  const t = Math.min(100, Math.round(s.target))
  return (
    <div className="wd-live">
      <p className="wd-row">
        <span className={`pill ${s.status}`}>{STATUS_LABEL[s.status]}</span>
        <b>{`${s.no}. ${s.name}`}</b>
      </p>
      {project && (
        <p className="wd-pjt">
          {`${project.name} #${s.unitNo ?? Math.min(project.total, project.done + 1)}`} <span>{`· 제작 ${project.done}/${project.total}`}</span>
        </p>
      )}
      <p className="wd-job">
        <span>{`${s.step}/${n}`}</span> {s.steps[s.step - 1] ?? ''}
      </p>
      <div className="wd-gauge">
        <span className={`gauge ${s.status}`} aria-hidden>
          {gaugeCells(n, s.actual, s.target).map((c, i) => (
            <i key={i} className={[c.on ? 'on' : '', c.target ? 'tg' : '', c.current ? 'cur' : ''].filter(Boolean).join(' ') || undefined} />
          ))}
        </span>
        <b>{`${a}%`}</b>
      </div>
      <p className="wd-nums">{`실적 ${a}% · 목표 ${t}%`}</p>
    </div>
  )
}
