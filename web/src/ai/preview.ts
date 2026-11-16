import type { Pt } from '../drawing/plan/types'
import type { PartitionSnap, PlacementSnap, ProposalItem } from './types'

export interface Size { sizeX: number; sizeY: number; sizeZ: number }
export interface Pose { x: number; y: number; rot: number }
/** 객체 유령: move(옮김·회전·변경 — 파랑, 원래 자리 점선) · add(초록) · delete(빨강) */
export interface GhostObject { seq: number; kind: 'move' | 'add' | 'delete'; at: Pose; from: Pose | null; size: Size }
export interface GhostWall { seq: number; kind: 'add' | 'delete'; a: Pt; b: Pt; h: number; t: number }
export interface Preview { objects: GhostObject[]; walls: GhostWall[] }

const pose = (p: PlacementSnap): Pose => ({ x: p.x, y: p.y, rot: p.rot })

/** 제안 항목 → 3D 유령 (이름만 바꿈·공정·구역 이름은 유령 없음) */
export function previewOf(items: ProposalItem[], sizeOf: (modelId: number | null | undefined) => Size): Preview {
  const objects: GhostObject[] = []
  const walls: GhostWall[] = []
  for (const it of items) {
    const b = it.before as PlacementSnap | null, a = it.after as PlacementSnap | null
    switch (it.kind) {
      case 'placement.move':
      case 'placement.rotate':
      case 'placement.update':
        if (a && b) objects.push({ seq: it.seq, kind: 'move', at: pose(a), from: pose(b), size: sizeOf(a.modelId) })
        break
      case 'placement.add':
        if (a) objects.push({ seq: it.seq, kind: 'add', at: pose(a), from: null, size: sizeOf(a.modelId) })
        break
      case 'placement.delete':
        if (b) objects.push({ seq: it.seq, kind: 'delete', at: pose(b), from: null, size: sizeOf(b.modelId) })
        break
      case 'plan.partition.add':
      case 'plan.partition.delete': {
        const w = (it.kind === 'plan.partition.add' ? it.after : it.before) as PartitionSnap | null
        if (w && w.pts.length >= 2)
          walls.push({ seq: it.seq, kind: it.kind === 'plan.partition.add' ? 'add' : 'delete', a: w.pts[0], b: w.pts[w.pts.length - 1], h: w.h, t: w.t })
        break
      }
    }
  }
  return { objects, walls }
}

/** 항목을 눌렀을 때 카메라가 갈 자리 (없으면 null) */
export function focusOf(it: ProposalItem): { x: number; y: number } | null {
  if (it.kind.startsWith('placement.')) {
    const p = (it.after ?? it.before) as PlacementSnap | null
    return p ? { x: p.x, y: p.y } : null
  }
  if (it.kind === 'plan.partition.add' || it.kind === 'plan.partition.delete') {
    const w = (it.after ?? it.before) as PartitionSnap | null
    if (!w || w.pts.length < 2) return null
    const a = w.pts[0], b = w.pts[w.pts.length - 1]
    return { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 }
  }
  return null
}
