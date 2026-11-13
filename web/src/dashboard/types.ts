/** 상황판 실시간 데이터 — 서버 live/LiveMessages 와 같은 모양 */
export type Status = 'ok' | 'warn' | 'bad'
export type EventKind = 'step_start' | 'step_done' | 'unit_done' | 'status_change' | 'material_in' | 'move'
/** 연결 상태: 처음 연결 전 · 받는 중 · 끊겨서 다시 붙는 중 · 끝(도면 없음 4404) */
export type Conn = 'connecting' | 'live' | 'retrying' | 'closed'

export interface Kpi { running: number; ok: number; warn: number; bad: number; doneToday: number; planRate: number; at: string }
export interface StationLive {
  id: number; no: number; name: string; placementName: string | null; steps: string[]; step: number
  actual: number; target: number; status: Status; projectId: number | null; unitNo: number | null
}
export interface ProjectLive { id: number; name: string; done: number; total: number; period: string | null; state: 'run' | 'wait' | 'done' }
export interface LiveEvent { id: number; at: string; kind: EventKind; station: string; text: string; data: Record<string, unknown> }
export interface LiveState { drawingId: number; kpi: Kpi; stations: StationLive[]; projects: ProjectLive[]; events: LiveEvent[]; materials: LiveEvent[] }

export type LiveMessage =
  | ({ type: 'snapshot' } & LiveState)
  | { type: 'tick'; kpi: Kpi; stations: StationLive[] }
  | { type: 'event'; event: LiveEvent }
  | { type: 'projects'; projects: ProjectLive[] }
