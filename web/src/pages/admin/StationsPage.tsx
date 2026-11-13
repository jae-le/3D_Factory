import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { Modal } from '../../components/Modal'
import {
  createProject, createStation, deleteProject, deleteStation, listProjects, listStations, orderStations, updateProject, updateStation,
  type Project, type ProjectState, type Station,
} from '../../dashboard/api'
import { PROJECT_STATE_LABEL } from '../../dashboard/status'
import { pickDrawing, useDrawings } from '../../drawing/useDrawings'
import { listPlacements } from '../../objects/api'
import { parseProjectForm, parseStationForm, projectForm, stationForm, type ProjectForm, type StationForm } from './stationForm'

type Dialog =
  | { kind: 'station'; s: Station | null }
  | { kind: 'project'; p: Project | null }
  | { kind: 'deleteStation'; s: Station }
  | { kind: 'deleteProject'; p: Project }
  | null
interface Data { id: number; stations: Station[]; projects: Project[]; placements: string[] }

const STATES = Object.keys(PROJECT_STATE_LABEL) as ProjectState[]
const ICON_BTN = 'kp-btn kp-btn-stroke kp-btn-xs'
const taktMinutes = (sec: number) => Math.round(sec / 6) / 10

/** 관리자 › 공정·생산 기준정보: 도면별 PJT · 공정(순서 = 칩 번호). 저장하면 상황판이 그 도면을 처음부터 */
export function StationsPage() {
  const [params, setParams] = useSearchParams()
  const [drawings] = useDrawings()
  const list = drawings.kind === 'ok' ? drawings.list : []
  const asked = Number(params.get('drawing'))
  const drawingId = pickDrawing(list, Number.isInteger(asked) && asked > 0 ? asked : null)
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [sf, setSf] = useState<StationForm>(() => stationForm(null))
  const [pf, setPf] = useState<ProjectForm>(() => projectForm(null))
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (drawingId == null) return
    let cancel = false
    Promise.all([listStations(drawingId), listProjects(drawingId), listPlacements(drawingId)])
      .then(([stations, projects, placements]) => {
        if (cancel) return
        setData({ id: drawingId, stations, projects, placements: placements.map((p) => p.name) })
        setError(null)
      })
      .catch((e: Error) => !cancel && setError(e.message))
    return () => {
      cancel = true
    }
  }, [drawingId, tick])
  const reload = () => setTick((n) => n + 1)
  const cur = data && data.id === drawingId ? data : null
  const projectName = (id: number | null) => cur?.projects.find((p) => p.id === id)?.name ?? '—'

  const open = (d: Dialog) => {
    setDialogError(null)
    if (d?.kind === 'station') setSf(stationForm(d.s))
    if (d?.kind === 'project') setPf(projectForm(d.p))
    setDialog(d)
  }
  /** 실패하면 창을 열어 둔 채 창 안에 오류 */
  const run = async (f: () => Promise<unknown>) => {
    setDialogError(null)
    setBusy(true)
    try {
      await f()
      setDialog(null)
      reload()
    } catch (e) {
      setDialogError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const saveStation = (e: FormEvent) => {
    e.preventDefault()
    if (dialog?.kind !== 'station' || drawingId == null) return
    const r = parseStationForm(sf)
    if ('error' in r) return setDialogError(r.error)
    const s = dialog.s
    void run(() => (s ? updateStation(s.id, r.input) : createStation(drawingId, r.input)))
  }
  const saveProject = (e: FormEvent) => {
    e.preventDefault()
    if (dialog?.kind !== 'project' || drawingId == null) return
    const r = parseProjectForm(pf)
    if ('error' in r) return setDialogError(r.error)
    const p = dialog.p
    void run(() => (p ? updateProject(p.id, r.input) : createProject(drawingId, r.input)))
  }
  const move = (i: number, d: -1 | 1) => {
    if (!cur || drawingId == null) return
    const ids = cur.stations.map((s) => s.id)
    ;[ids[i], ids[i + d]] = [ids[i + d], ids[i]]
    orderStations(drawingId, ids).then(reload).catch((e: Error) => setError(e.message))
  }
  const placementOptions = cur
    ? [...new Set([...cur.placements, ...(sf.placementName ? [sf.placementName] : [])])].sort((a, b) => a.localeCompare(b, 'ko'))
    : []

  return (
    <section className="kp-card kp-section" aria-label="공정·생산 기준정보">
      <div className="kp-section-head">
        <div>
          <h2>공정·생산 기준정보</h2>
          <p className="kp-desc">상황판에 쓰는 PJT(제작 현황)와 공정(스테이션)을 도면마다 정합니다. 공정 순서가 칩 번호입니다.</p>
        </div>
      </div>
      <div className="kp-filter">
        <label className="kp-field">
          <span>도면</span>
          <select className="kp-input" aria-label="도면" value={drawingId ?? ''} disabled={list.length === 0} onChange={(e) => setParams({ drawing: e.target.value })}>
            {list.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
      </div>
      {error && <p className="kp-error-text" role="alert">{error}</p>}
      {!cur ? (
        <p className="kp-desc">{drawings.kind === 'ok' && list.length === 0 ? '등록된 도면이 없습니다.' : '불러오는 중…'}</p>
      ) : (
        <>
          <div className="kp-section-head">
            <h3>PJT (제작 현황)</h3>
            <button className="kp-btn kp-btn-stroke kp-btn-sm" onClick={() => open({ kind: 'project', p: null })}>
              <Plus size={14} aria-hidden />
              PJT 추가
            </button>
          </div>
          {cur.projects.length === 0 ? (
            <p className="kp-desc">PJT 가 없습니다.</p>
          ) : (
            <table className="kp-table">
              <thead>
                <tr><th>이름</th><th>제작</th><th>기간</th><th>상태</th><th>관리</th></tr>
              </thead>
              <tbody>
                {cur.projects.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td className="num">{`${p.done}/${p.total}`}</td>
                    <td>{p.period ?? ''}</td>
                    <td>{PROJECT_STATE_LABEL[p.state]}</td>
                    <td className="actions">
                      <button className={ICON_BTN} aria-label={`PJT ${p.name} 수정`} onClick={() => open({ kind: 'project', p })}>
                        <Pencil size={14} aria-hidden />
                      </button>
                      <button className="kp-btn kp-btn-danger kp-btn-xs" aria-label={`PJT ${p.name} 삭제`} onClick={() => open({ kind: 'deleteProject', p })}>
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="kp-section-head">
            <h3>공정</h3>
            <button className="kp-btn kp-btn-stroke kp-btn-sm" onClick={() => open({ kind: 'station', s: null })}>
              <Plus size={14} aria-hidden />
              공정 추가
            </button>
          </div>
          {cur.stations.length === 0 ? (
            <p className="kp-desc">공정이 없습니다. 공정을 추가하면 상황판에 표시됩니다.</p>
          ) : (
            <table className="kp-table">
              <thead>
                <tr><th>번호</th><th>이름</th><th>연결 설비</th><th>step 수</th><th>택타임(분)</th><th>주의/지연(%p)</th><th>PJT</th><th>관리</th></tr>
              </thead>
              <tbody>
                {cur.stations.map((s, i) => (
                  <tr key={s.id}>
                    <td className="num">{s.no}</td>
                    <td>{s.name}</td>
                    <td>
                      {s.placementName ?? '—'}
                      {s.placementName && !cur.placements.includes(s.placementName) && <span className="kp-help"> (도면에 없음)</span>}
                    </td>
                    <td className="num">{s.steps.length}</td>
                    <td className="num">{taktMinutes(s.taktSec)}</td>
                    <td className="num">{`${s.warnPp} / ${s.delayPp}`}</td>
                    <td>{projectName(s.projectId)}</td>
                    <td className="actions">
                      <button className={ICON_BTN} aria-label={`${s.name} 위로`} disabled={i === 0} onClick={() => move(i, -1)}>
                        <ArrowUp size={14} aria-hidden />
                      </button>
                      <button className={ICON_BTN} aria-label={`${s.name} 아래로`} disabled={i === cur.stations.length - 1} onClick={() => move(i, 1)}>
                        <ArrowDown size={14} aria-hidden />
                      </button>
                      <button className={ICON_BTN} aria-label={`${s.name} 수정`} onClick={() => open({ kind: 'station', s })}>
                        <Pencil size={14} aria-hidden />
                      </button>
                      <button className="kp-btn kp-btn-danger kp-btn-xs" aria-label={`${s.name} 삭제`} onClick={() => open({ kind: 'deleteStation', s })}>
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {dialog?.kind === 'station' && cur && (
        <Modal title={dialog.s ? '공정 수정' : '공정 추가'} onClose={() => setDialog(null)}>
          <form className="kp-form" noValidate onSubmit={saveStation}>
            <label className="kp-field">
              <span>이름</span>
              <input className="kp-input" value={sf.name} maxLength={100} autoFocus onChange={(e) => setSf({ ...sf, name: e.target.value })} />
            </label>
            <label className="kp-field">
              <span>연결 설비</span>
              <select className="kp-input" value={sf.placementName} onChange={(e) => setSf({ ...sf, placementName: e.target.value })}>
                <option value="">없음</option>
                {placementOptions.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label className="kp-field">
              <span>PJT</span>
              <select className="kp-input" value={sf.projectId} onChange={(e) => setSf({ ...sf, projectId: e.target.value })}>
                <option value="">없음</option>
                {cur.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="kp-check">
              <input type="checkbox" checked={sf.countsProject} onChange={(e) => setSf({ ...sf, countsProject: e.target.checked })} />
              완료 시 PJT 제작 수에 셈
            </label>
            <label className="kp-field">
              <span>step (한 줄에 하나)</span>
              <textarea className="kp-input" rows={6} style={{ height: 'auto', paddingTop: 8, paddingBottom: 8 }} value={sf.steps} onChange={(e) => setSf({ ...sf, steps: e.target.value })} />
            </label>
            <label className="kp-field">
              <span>택타임(분)</span>
              <input className="kp-input" type="number" min={1} max={10080} value={sf.taktMin} onChange={(e) => setSf({ ...sf, taktMin: e.target.value })} />
            </label>
            <label className="kp-field">
              <span>주의 기준(%p)</span>
              <input className="kp-input" type="number" min={0} max={99} value={sf.warnPp} onChange={(e) => setSf({ ...sf, warnPp: e.target.value })} />
            </label>
            <label className="kp-field">
              <span>지연 기준(%p)</span>
              <input className="kp-input" type="number" min={1} max={100} value={sf.delayPp} onChange={(e) => setSf({ ...sf, delayPp: e.target.value })} />
            </label>
            <label className="kp-field">
              <span>입고 자재</span>
              <input className="kp-input" value={sf.materials} placeholder="쉼표로 구분" onChange={(e) => setSf({ ...sf, materials: e.target.value })} />
            </label>
            {dialogError && <p className="kp-error-text" role="alert">{dialogError}</p>}
            <p className="kp-help">저장하면 상황판이 이 도면을 처음부터 다시 진행합니다.</p>
            <div className="kp-modal-actions">
              <button type="button" className="kp-btn kp-btn-stroke" onClick={() => setDialog(null)}>취소</button>
              <button type="submit" className="kp-btn kp-btn-primary" disabled={busy}>저장</button>
            </div>
          </form>
        </Modal>
      )}
      {dialog?.kind === 'project' && (
        <Modal title={dialog.p ? 'PJT 수정' : 'PJT 추가'} onClose={() => setDialog(null)}>
          <form className="kp-form" noValidate onSubmit={saveProject}>
            <label className="kp-field">
              <span>이름</span>
              <input className="kp-input" value={pf.name} maxLength={100} autoFocus onChange={(e) => setPf({ ...pf, name: e.target.value })} />
            </label>
            <label className="kp-field">
              <span>제작</span>
              <input className="kp-input" type="number" min={0} value={pf.done} onChange={(e) => setPf({ ...pf, done: e.target.value })} />
            </label>
            <label className="kp-field">
              <span>전체</span>
              <input className="kp-input" type="number" min={1} value={pf.total} onChange={(e) => setPf({ ...pf, total: e.target.value })} />
            </label>
            <label className="kp-field">
              <span>기간</span>
              <input className="kp-input" value={pf.period} maxLength={40} placeholder="'25.09~'27.03" onChange={(e) => setPf({ ...pf, period: e.target.value })} />
            </label>
            <label className="kp-field">
              <span>상태</span>
              <select className="kp-input" value={pf.state} onChange={(e) => setPf({ ...pf, state: e.target.value as ProjectState })}>
                {STATES.map((s) => <option key={s} value={s}>{PROJECT_STATE_LABEL[s]}</option>)}
              </select>
            </label>
            {dialogError && <p className="kp-error-text" role="alert">{dialogError}</p>}
            <p className="kp-help">저장하면 상황판이 이 도면을 처음부터 다시 진행합니다.</p>
            <div className="kp-modal-actions">
              <button type="button" className="kp-btn kp-btn-stroke" onClick={() => setDialog(null)}>취소</button>
              <button type="submit" className="kp-btn kp-btn-primary" disabled={busy}>저장</button>
            </div>
          </form>
        </Modal>
      )}
      {dialog?.kind === 'deleteStation' && (
        <Modal title="공정 삭제" onClose={() => setDialog(null)}>
          <p className="kp-desc">{`'${dialog.s.name}' 공정을 삭제합니다. 뒤 공정의 번호는 하나씩 당겨집니다.`}</p>
          {dialogError && <p className="kp-error-text" role="alert">{dialogError}</p>}
          <div className="kp-modal-actions">
            <button type="button" className="kp-btn kp-btn-stroke" onClick={() => setDialog(null)}>취소</button>
            <button type="button" className="kp-btn kp-btn-danger-fill" disabled={busy} onClick={() => run(() => deleteStation(dialog.s.id))}>삭제</button>
          </div>
        </Modal>
      )}
      {dialog?.kind === 'deleteProject' && (
        <Modal title="PJT 삭제" onClose={() => setDialog(null)}>
          <p className="kp-desc">{`'${dialog.p.name}' PJT 를 삭제합니다. 이 PJT 를 쓰던 공정은 PJT 없음이 됩니다.`}</p>
          {dialogError && <p className="kp-error-text" role="alert">{dialogError}</p>}
          <div className="kp-modal-actions">
            <button type="button" className="kp-btn kp-btn-stroke" onClick={() => setDialog(null)}>취소</button>
            <button type="button" className="kp-btn kp-btn-danger-fill" disabled={busy} onClick={() => run(() => deleteProject(dialog.p.id))}>삭제</button>
          </div>
        </Modal>
      )}
    </section>
  )
}
