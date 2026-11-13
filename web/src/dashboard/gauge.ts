/** 눈금 게이지 막대 하나: 실적만큼 채움(on) · 목표 step 막대(target, 길게) · 실적이 걸친 막대(current, 맥동) */
export interface Cell { on: boolean; target: boolean; current: boolean }

/** 실적 % → 진행 중 step 번호 1..n (demo stStep) */
export function stepOf(actual: number, n: number): number {
  return Math.max(1, Math.min(n, Math.floor((actual / 100) * n) + 1))
}

/** demo gauge(): 막대 1개 = step 1개 */
export function gaugeCells(n: number, actual: number, target: number): Cell[] {
  const fill = Math.round((actual / 100) * n)
  const tg = Math.max(0, Math.min(n - 1, Math.ceil((target / 100) * n) - 1))
  const cur = stepOf(actual, n) - 1
  return Array.from({ length: n }, (_, i) => ({ on: i < fill, target: i === tg, current: i === cur }))
}
