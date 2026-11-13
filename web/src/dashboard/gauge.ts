/** 눈금 게이지 막대 하나: 지금 step 까지 채움(on) · 목표 step 막대(target, 길게) · 진행 중 step 막대(current, 맥동) */
export interface Cell { on: boolean; target: boolean; current: boolean }

/** 실적 % → 진행 중 step 번호 1..n (demo stStep) */
export function stepOf(actual: number, n: number): number {
  return Math.max(1, Math.min(n, Math.floor((actual / 100) * n) + 1))
}

/** 막대 1개 = step 1개. 칩의 `k/n` 과 맞게 끝난 step + 진행 중 step(k 개)을 채우고, 진행 중 막대는 맥동 */
export function gaugeCells(n: number, actual: number, target: number): Cell[] {
  const step = stepOf(actual, n)
  const tg = Math.max(0, Math.min(n - 1, Math.ceil((target / 100) * n) - 1))
  return Array.from({ length: n }, (_, i) => ({ on: i < step, target: i === tg, current: i === step - 1 }))
}
