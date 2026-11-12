import { apiJson, apiSend, apiSendForm } from '../api/client'
import type { Category, ModelInfo, NewPlacement, Placement, PlacementPatch } from './types'

export const modelFileUrl = (m: Pick<ModelInfo, 'id' | 'version'>) => `/api/models/${m.id}/file?v=${m.version}`
export const modelThumbUrl = (m: Pick<ModelInfo, 'id' | 'version'>) => `/api/models/${m.id}/thumbnail?v=${m.version}`

export interface ModelUpload { glb: Blob; thumbnail: Blob; sourceExt: string; sizeX: number; sizeY: number; sizeZ: number }

function form(u: ModelUpload): FormData {
  const f = new FormData()
  f.append('file', u.glb, 'model.glb')
  f.append('thumbnail', u.thumbnail, 'thumb.png')
  f.append('sourceExt', u.sourceExt)
  f.append('sizeX', String(u.sizeX))
  f.append('sizeY', String(u.sizeY))
  f.append('sizeZ', String(u.sizeZ))
  return f
}

export const listModels = () => apiJson<ModelInfo[]>('/api/models')

export function createModel(u: ModelUpload & { name: string; category: Category; aliases: string[] }): Promise<ModelInfo> {
  const f = form(u)
  f.append('name', u.name)
  f.append('category', u.category)
  f.append('aliases', u.aliases.join(','))
  return apiSendForm<ModelInfo>('POST', '/api/models', f)
}

export const updateModel = (id: number, patch: { name?: string; category?: Category; aliases?: string[] }) =>
  apiSend<ModelInfo>('PATCH', `/api/models/${id}`, patch)
export const replaceModelFile = (id: number, u: ModelUpload) => apiSendForm<ModelInfo>('PUT', `/api/models/${id}/file`, form(u))
export const deleteModel = (id: number) => apiSend<void>('DELETE', `/api/models/${id}`)

export const listPlacements = (drawingId: number) => apiJson<Placement[]>(`/api/drawings/${drawingId}/placements`)
export const createPlacements = (drawingId: number, items: NewPlacement[]) =>
  apiSend<Placement[]>('POST', `/api/drawings/${drawingId}/placements`, items)
export const updatePlacement = (id: number, patch: PlacementPatch) => apiSend<Placement>('PATCH', `/api/placements/${id}`, patch)
export const deletePlacement = (id: number) => apiSend<void>('DELETE', `/api/placements/${id}`)
