import type { Colliders } from './colliders'
import { clearance } from './collide'

const MAX_CELLS = 200000 // 아주 큰 도면은 격자를 성기게

/**
 * 시작 자리: 도면 경계 안 1 m 격자 칸 가운데 중, 장애물·경계에서 room(1 m) 이상 떨어진 칸 가운데
 * 도면 가운데에 가장 가까운 칸 (같은 거리면 x 가 작은 칸, 그다음 y 가 작은 칸). 없으면 도면 가운데.
 */
export function findSpawn(c: Colliders, b: { w: number; h: number }, room = 1): { x: number; y: number } {
  const cx = b.w / 2, cy = b.h / 2
  const step = Math.max(1, Math.ceil(Math.sqrt((b.w * b.h) / MAX_CELLS)))
  const cells: { x: number; y: number; d: number }[] = []
  for (let i = 0; (i + 1) * step <= b.w; i++)
    for (let j = 0; (j + 1) * step <= b.h; j++) {
      const x = i * step + step / 2, y = j * step + step / 2
      cells.push({ x, y, d: (x - cx) ** 2 + (y - cy) ** 2 })
    }
  cells.sort((p, q) => p.d - q.d) // 안정 정렬 — 같은 거리는 넣은 순서
  for (const p of cells) {
    if (p.x < room || p.x > b.w - room || p.y < room || p.y > b.h - room) continue
    if (clearance(p.x, p.y, c) >= room) return { x: p.x, y: p.y }
  }
  return { x: cx, y: cy }
}
