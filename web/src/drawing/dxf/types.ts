export type Pt = [number, number]
export interface DxfRecord { type: string; g: [number, string][] }
export interface DxfLayer { color: number; off: boolean }
export interface DxfBlock { name: string; bx: number; by: number; recs: DxfRecord[] }
export interface DxfDoc { header: Record<string, string>; layers: Record<string, DxfLayer>; blocks: Record<string, DxfBlock>; entities: DxfRecord[] }
export interface PolyPrim { kind: 'poly'; layer: string; color: number | null; pts: Pt[]; closed: boolean }
export interface TextPrim { kind: 'text'; layer: string; color: number | null; x: number; y: number; h: number; rot: number; str: string; ha: 0 | 1 | 2; va: 0 | 1 | 2 | 3 }
export interface InsertPrim { kind: 'insert'; layer: string; color: number | null; block: string; x: number; y: number; rot: number }
export type Prim = PolyPrim | TextPrim | InsertPrim
export interface Flattened { prims: Prim[]; stats: Record<string, number>; unsupported: Record<string, number> }
