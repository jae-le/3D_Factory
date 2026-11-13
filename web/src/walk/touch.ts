export const JOY_R = 55 // 조이스틱 원 반지름 px (참고 파일 110 px 원)
export const JOY_MAX = 48 // 손잡이가 움직이는 최대 거리 px

/** 조이스틱 그림: 원 중심(무대 기준 px) · 손잡이 이동(px) */
export interface JoyView { cx: number; cy: number; kx: number; ky: number }

/** 참고 파일 터치: 왼쪽 반 첫 손가락 = 조이스틱, 그 밖 첫 손가락 = 시점 */
export class TouchSticks {
  private joy: { id: number; cx: number; cy: number; dx: number; dy: number } | null = null
  private look: { id: number; x: number; y: number } | null = null

  start(id: number, x: number, y: number, width: number): void {
    if (x < width / 2 && !this.joy) this.joy = { id, cx: x, cy: y, dx: 0, dy: 0 }
    else if (!this.look) this.look = { id, x, y }
  }

  move(id: number, x: number, y: number): { dx: number; dy: number } | null {
    const j = this.joy
    if (j?.id === id) {
      const dx = x - j.cx, dy = y - j.cy, len = Math.hypot(dx, dy), cl = Math.min(len, JOY_MAX) / (len || 1)
      j.dx = dx * cl
      j.dy = dy * cl
      return null
    }
    const l = this.look
    if (l?.id === id) {
      const d = { dx: x - l.x, dy: y - l.y }
      l.x = x
      l.y = y
      return d
    }
    return null
  }

  end(id: number): void {
    if (this.joy?.id === id) this.joy = null
    if (this.look?.id === id) this.look = null
  }

  vec(): { x: number; y: number } {
    const j = this.joy
    return j ? { x: j.dx / JOY_MAX, y: j.dy / JOY_MAX } : { x: 0, y: 0 }
  }

  view(): JoyView | null {
    const j = this.joy
    return j ? { cx: j.cx, cy: j.cy, kx: j.dx, ky: j.dy } : null
  }
}
