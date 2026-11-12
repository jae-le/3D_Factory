import type { Pt } from '../dxf/types'
export type { Pt }
export type Role = 'wall' | 'partition' | 'column' | 'zone' | 'object' | 'line'
export type UnitName = 'inch' | 'feet' | 'mm' | 'cm' | 'm'
export interface LayerRule { role: Role; height?: number; thickness?: number }
export type LayerRules = Record<string, LayerRule>
export interface PlanLayer { name: string; color: string; count: number; role: Role; height: number; thickness: number; visible: boolean }
export interface PlanLine { layer: string; pts: Pt[]; closed: boolean; color: string | null }
export interface PlanText { layer: string; x: number; y: number; h: number; rot: number; str: string; ha: 0 | 1 | 2; va: 0 | 1 | 2 | 3; color: string | null }
export interface WallSeg { id: string; pts: Pt[]; h: number; t: number }
export interface Column { id: string; x: number; y: number; w: number; d: number; h: number }
export interface Zone { id: string; name: string; poly: Pt[]; color: string; stationId: string | null }
export interface ObjectHint { id: string; label: string; x: number; y: number; rot: number }
export interface Plan {
  format: 1; unit: UnitName; scale: number; rotQ: 0 | 1 | 2 | 3; flip: 1 | -1
  bounds: { w: number; h: number }
  layers: PlanLayer[]; lines: PlanLine[]; texts: PlanText[]
  walls: WallSeg[]; partitions: WallSeg[]; columns: Column[]; zones: Zone[]; objectHints: ObjectHint[]
  warnings: { unsupported: Record<string, number>; unitGuessed: boolean }
}
