export type Category = 'equip' | 'mat' | 'mover'
export const CATEGORY_LABEL: Record<Category, string> = { equip: '설비', mat: '자재', mover: '운반' }
export interface ModelInfo { id: number; name: string; category: Category; sourceExt: string; sizeX: number; sizeY: number; sizeZ: number; aliases: string[]; version: number; usedDrawings: number; updatedAt: string }
export interface Placement { id: number; modelId?: number | null; name: string; x: number; y: number; rot: number; hintLabel?: string | null }
export interface NewPlacement { modelId?: number | null; name: string; x: number; y: number; rot?: number; hintLabel?: string | null }
export interface PlacementPatch { name?: string; x?: number; y?: number; rot?: number; modelId?: number; clearModel?: boolean }
export const BOX_SIZE = { sizeX: 2, sizeY: 2, sizeZ: 2 }   // 모델 없는 배치(임시 상자)
