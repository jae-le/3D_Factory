import { apiBuffer, apiJson, apiSend, apiSendForm } from '../api/client'
import type { LayerRules, Plan } from './plan/types'

export interface DrawingDetail {
  id: number
  name: string
  sourceType: 'dxf' | 'image'
  version: number
  createdBy: string | null
  createdAt: string
  updatedAt: string
  plan: Plan
  layerRules: LayerRules
}

export const getDrawing = (id: number) => apiJson<DrawingDetail>(`/api/drawings/${id}`)
export const getSource = (id: number) => apiBuffer(`/api/drawings/${id}/source`)

export function createDrawing(file: File, name: string, plan: Plan, layerRules: LayerRules): Promise<DrawingDetail> {
  const f = new FormData()
  f.append('file', file)
  f.append('name', name)
  f.append('plan', JSON.stringify(plan))
  f.append('layerRules', JSON.stringify(layerRules))
  return apiSendForm<DrawingDetail>('POST', '/api/drawings', f)
}

export const savePlan = (id: number, version: number, plan: Plan, layerRules: LayerRules) =>
  apiSend<DrawingDetail>('PUT', `/api/drawings/${id}/plan`, { version, plan, layerRules })
export const renameDrawing = (id: number, name: string) => apiSend<DrawingDetail>('PATCH', `/api/drawings/${id}`, { name })
export const deleteDrawing = (id: number) => apiSend<void>('DELETE', `/api/drawings/${id}`)
