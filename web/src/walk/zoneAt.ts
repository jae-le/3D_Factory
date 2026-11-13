import type { Pt, Zone } from '../drawing/plan/types'

/** 점이 다각형 안인가 (짝홀 규칙, 오목 다각형도) */
export function inPoly(x: number, y: number, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** 지금 서 있는 구역 (먼저 맞는 것). 꼭짓점 3개 미만은 건너뜀 */
export function zoneAt(zones: Zone[], x: number, y: number): Zone | null {
  return zones.find((z) => z.poly.length >= 3 && inPoly(x, y, z.poly)) ?? null
}
