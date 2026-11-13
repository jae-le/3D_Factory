import type { LiveEvent, LiveMessage, LiveState } from './types'

export const MAX_EVENTS = 50
export const MAX_MATERIALS = 20

/** step_start·step_done 은 너무 잦아 화면 목록에 넣지 않음 (서버도 snapshot 의 최근 이벤트에 넣지 않음, P5 운반 애니메이션용) */
export const isStepEvent = (e: Pick<LiveEvent, 'kind'>) => e.kind === 'step_start' || e.kind === 'step_done'

/** WebSocket 메시지 → 화면 상태. snapshot 전에 온 메시지는 버림 */
export function liveReducer(state: LiveState | null, msg: LiveMessage): LiveState | null {
  switch (msg.type) {
    case 'snapshot':
      return {
        drawingId: msg.drawingId,
        kpi: msg.kpi,
        stations: msg.stations,
        projects: msg.projects,
        events: msg.events.filter((e) => !isStepEvent(e)).slice(0, MAX_EVENTS),
        materials: msg.materials.slice(0, MAX_MATERIALS),
      }
    case 'tick':
      return state && { ...state, kpi: msg.kpi, stations: msg.stations }
    case 'projects':
      return state && { ...state, projects: msg.projects }
    case 'event': {
      const e = msg.event
      if (!state || isStepEvent(e) || state.events.some((x) => x.id === e.id)) return state
      return {
        ...state,
        events: [e, ...state.events].slice(0, MAX_EVENTS),
        materials: e.kind === 'material_in' ? [e, ...state.materials].slice(0, MAX_MATERIALS) : state.materials,
      }
    }
    default:
      return state
  }
}
