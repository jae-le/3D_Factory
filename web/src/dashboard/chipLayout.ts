/** 칩 하나: 설비 기준점의 화면 좌표(x, y px)와 칩 크기(w, h) */
export interface ChipIn { id: number; x: number; y: number; w: number; h: number }
/** 칩 자리: 아래 가운데(cx, bottom). lift = 설비까지 잇는 선 길이, dx = 꼬리를 설비 쪽에 두기 위한 가로 차이 */
export interface ChipOut { id: number; cx: number; bottom: number; lift: number; dx: number }

const TAIL = 7 // 칩 꼬리 높이
const GAP = 4
const EDGE = 6
const UPS = [0, 1, 2]
const SIDES = [0, 0.55, -0.55, 1.05, -1.05]

/**
 * demo dashFrame: 아래쪽(가까운) 칩부터 자리를 잡고, 겹치면 후보 자리(위로 0~2칸 × 좌우 5) 중
 * 겹치지 않고 가장 덜 움직이는 곳. 화면 안·위 KPI 줄(top) 아래로만.
 */
export function layoutChips(chips: ChipIn[], view: { w: number; h: number }, top = 62): ChipOut[] {
  const placed: { x: number; w: number; top: number; bottom: number }[] = []
  const clampX = (x: number, w: number) => Math.min(view.w - w / 2 - EDGE, Math.max(w / 2 + EDGE, x))
  const free = (cx: number, bottom: number, c: ChipIn) =>
    !placed.some((p) => Math.abs(p.x - cx) < (p.w + c.w) / 2 + GAP && bottom > p.top - GAP && bottom - c.h < p.bottom + GAP)
  const out: ChipOut[] = []
  for (const c of [...chips].sort((a, b) => b.y - a.y)) {
    let best: { cx: number; bottom: number; cost: number } | null = null
    for (const up of UPS)
      for (const side of SIDES) {
        const cx = clampX(c.x + side * c.w, c.w)
        const bottom = Math.max(c.y - TAIL - up * (c.h + 8), top + c.h)
        const cost = Math.abs(cx - c.x) + Math.abs(c.y - TAIL - bottom) * 1.2
        if ((!best || cost < best.cost) && free(cx, bottom, c)) best = { cx, bottom, cost }
      }
    const at = best ?? { cx: clampX(c.x, c.w), bottom: Math.max(c.y - TAIL, top + c.h) }
    placed.push({ x: at.cx, w: c.w, top: at.bottom - c.h, bottom: at.bottom })
    out.push({ id: c.id, cx: at.cx, bottom: at.bottom, lift: Math.max(0, c.y - TAIL - at.bottom), dx: at.cx - c.x })
  }
  return out
}
