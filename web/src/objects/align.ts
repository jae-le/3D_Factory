/** 여러 객체 정렬 · 간격 고르게 (도면 좌표 m, y 위쪽). 회전한 객체는 바깥 사각형(축에 맞춘 상자) 기준 */
export type AlignOp = 'left' | 'hcenter' | 'right' | 'top' | 'vmiddle' | 'bottom' | 'hdist' | 'vdist'

/** 가운데(x, y) + 바깥 상자 반폭(ex, ey) */
export interface AlignBox { id: number; x: number; y: number; ex: number; ey: number }
export interface Move { id: number; x: number; y: number }

const r3 = (v: number) => Math.round(v * 1000) / 1000

/** 회전 사각형(길이 sizeX, 폭 sizeY, rot°)의 바깥 상자 반폭 */
export function boxOf(id: number, p: { x: number; y: number; rot: number }, size: { sizeX: number; sizeY: number }): AlignBox {
  const a = (p.rot * Math.PI) / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a))
  const hl = size.sizeX / 2, hw = size.sizeY / 2
  return { id, x: p.x, y: p.y, ex: c * hl + s * hw, ey: s * hl + c * hw }
}

/** 간격 고르게는 3개부터, 정렬은 2개부터 */
export const canAlign = (op: AlignOp, n: number) => n >= (op === 'hdist' || op === 'vdist' ? 3 : 2)

/** 실제로 움직이는 것만 돌려줌 */
export function alignMoves(boxes: AlignBox[], op: AlignOp): Move[] {
  if (!canAlign(op, boxes.length)) return []
  const minL = Math.min(...boxes.map((b) => b.x - b.ex)), maxR = Math.max(...boxes.map((b) => b.x + b.ex))
  const minB = Math.min(...boxes.map((b) => b.y - b.ey)), maxT = Math.max(...boxes.map((b) => b.y + b.ey))
  const out = new Map<number, Move>()
  const put = (b: AlignBox, x: number, y: number) => out.set(b.id, { id: b.id, x: r3(x), y: r3(y) })
  switch (op) {
    case 'left': boxes.forEach((b) => put(b, minL + b.ex, b.y)); break
    case 'right': boxes.forEach((b) => put(b, maxR - b.ex, b.y)); break
    case 'hcenter': boxes.forEach((b) => put(b, (minL + maxR) / 2, b.y)); break
    case 'top': boxes.forEach((b) => put(b, b.x, maxT - b.ey)); break
    case 'bottom': boxes.forEach((b) => put(b, b.x, minB + b.ey)); break
    case 'vmiddle': boxes.forEach((b) => put(b, b.x, (minB + maxT) / 2)); break
    case 'hdist': {
      // 양 끝은 그대로, 사이 빈 칸(간격)을 같게
      const s = [...boxes].sort((a, b) => a.x - a.ex - (b.x - b.ex) || a.id - b.id)
      const gap = (maxR - minL - s.reduce((t, b) => t + 2 * b.ex, 0)) / (s.length - 1)
      let at = minL
      for (const b of s) {
        put(b, at + b.ex, b.y)
        at += 2 * b.ex + gap
      }
      break
    }
    case 'vdist': {
      const s = [...boxes].sort((a, b) => a.y - a.ey - (b.y - b.ey) || a.id - b.id)
      const gap = (maxT - minB - s.reduce((t, b) => t + 2 * b.ey, 0)) / (s.length - 1)
      let at = minB
      for (const b of s) {
        put(b, b.x, at + b.ey)
        at += 2 * b.ey + gap
      }
      break
    }
  }
  return boxes.map((b) => out.get(b.id)!).filter((m) => {
    const b = boxes.find((x) => x.id === m.id)!
    return Math.abs(m.x - b.x) > 1e-6 || Math.abs(m.y - b.y) > 1e-6
  })
}
