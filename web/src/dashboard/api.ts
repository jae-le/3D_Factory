import { apiJson, apiSend } from '../api/client'

export type ProjectState = 'run' | 'wait' | 'done'
/** 공정 기준정보 (no = 칩 번호) */
export interface Station {
  id: number; no: number; name: string; placementName: string | null; steps: string[]; taktSec: number
  warnPp: number; delayPp: number; projectId: number | null; countsProject: boolean; materials: string[]
}
export interface Project { id: number; name: string; done: number; total: number; period: string | null; state: ProjectState; sortOrder: number }
/** 추가·수정 (수정에서 빠진 칸은 그대로, clear* 로 비움) */
export interface StationInput {
  name?: string; placementName?: string; clearPlacement?: boolean; steps?: string[]; taktSec?: number; warnPp?: number
  delayPp?: number; projectId?: number; clearProject?: boolean; countsProject?: boolean; materials?: string[]
}
export interface ProjectInput { name?: string; done?: number; total?: number; period?: string; state?: ProjectState }

export const listStations = (drawingId: number) => apiJson<Station[]>(`/api/drawings/${drawingId}/stations`)
export const createStation = (drawingId: number, s: StationInput) => apiSend<Station>('POST', `/api/drawings/${drawingId}/stations`, s)
export const updateStation = (id: number, s: StationInput) => apiSend<Station>('PATCH', `/api/stations/${id}`, s)
export const deleteStation = (id: number) => apiSend<void>('DELETE', `/api/stations/${id}`)
export const orderStations = (drawingId: number, ids: number[]) => apiSend<Station[]>('PUT', `/api/drawings/${drawingId}/stations/order`, ids)

export const listProjects = (drawingId: number) => apiJson<Project[]>(`/api/drawings/${drawingId}/projects`)
export const createProject = (drawingId: number, p: ProjectInput) => apiSend<Project>('POST', `/api/drawings/${drawingId}/projects`, p)
export const updateProject = (id: number, p: ProjectInput) => apiSend<Project>('PATCH', `/api/projects/${id}`, p)
export const deleteProject = (id: number) => apiSend<void>('DELETE', `/api/projects/${id}`)
