import { JOY_R, type JoyView } from './touch'

/** 터치 조이스틱 (참고 파일 #joy): 왼쪽 반을 누른 자리에 원, 손잡이는 끈 만큼 */
export function TouchJoystick({ joy }: { joy: JoyView }) {
  return (
    <div className="walk-joy" style={{ left: joy.cx - JOY_R, top: joy.cy - JOY_R }} aria-hidden>
      <i style={{ transform: `translate(${joy.kx}px, ${joy.ky}px)` }} />
    </div>
  )
}
