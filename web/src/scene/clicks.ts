export const CLICK_PX = 5

/** click 이벤트가 '지면 선택' 클릭인지: 왼쪽 단일 클릭이며 누른 자리에서 거의 안 움직임 (더블클릭·드래그 제외) */
export function isPickClick(
  down: { x: number; y: number } | null,
  ev: { button: number; detail: number; clientX: number; clientY: number },
): boolean {
  if (!down || ev.button !== 0 || ev.detail >= 2) return false
  return Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < CLICK_PX
}
