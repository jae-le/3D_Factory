import * as THREE from 'three'

export interface ScreenPoint { sx: number; sy: number; visible: boolean }

/** project() 한 정규화 좌표 → 화면 px. 카메라 뒤이거나 화면 밖으로 20% 넘으면 안 보임 (demo dashFrame) */
export function toScreen(ndc: THREE.Vector3, w: number, h: number): ScreenPoint {
  const visible = !(ndc.z > 1 || Math.abs(ndc.x) > 1.2 || Math.abs(ndc.y) > 1.2)
  return { sx: ((ndc.x + 1) / 2) * w, sy: ((1 - ndc.y) / 2) * h, visible }
}

/** demo frameDash: 벽 범위(월드 box)가 화면에 꽉 차게, 북쪽(-z)이 위로 약 70° 내려다보는 시점 */
export function overviewPose(box: THREE.Box3, fovDeg: number, aspect: number): { target: THREE.Vector3; position: THREE.Vector3 } {
  const c = box.getCenter(new THREE.Vector3()).setY(0)
  const sz = box.getSize(new THREE.Vector3())
  const f = Math.tan((fovDeg * Math.PI) / 360), el = 1.22
  c.z -= sz.z * 0.06 // 공장을 조금 아래로: 북쪽 스테이션 칩이 위 KPI 줄에 걸리지 않게
  const dist = Math.max(((sz.z * 0.8) / 2 / f) * 1.4, (sz.x / 2 / f / aspect) * 1.06) // 기울여 보므로 세로는 약 0.8배
  return { target: c, position: c.clone().add(new THREE.Vector3(0, Math.sin(el) * dist, Math.cos(el) * dist)) }
}
