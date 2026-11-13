import * as THREE from 'three'
import { planToWorld, type PlanFrame } from './coords'
import type { Materials } from './materials'

/** plan 좌표(m) + 높이(m) */
export interface PlanPoint { x: number; y: number; h: number }
/** 걷기 카메라 자세: 눈 · 바라보는 점 (plan 좌표 — 회전·반전은 장면이 바꿈) */
export interface CameraPose { eye: PlanPoint; look: PlanPoint }
/** 체험 공간: 매 프레임 카메라 자세를 정함 */
export interface CameraDriver { update(dt: number): CameraPose }

export const WALK_FOV = 70
export const WALK_NEAR = 0.1 // 벽에서 0.45 m 떨어져도 화면이 잘리지 않게
export const GHOST_OPACITY = 0.13
const GHOST_KINDS = new Set(['wall', 'partition', 'plinth'])
const tmp = new THREE.Vector3()

export function worldOf(p: PlanPoint, f: PlanFrame, out = new THREE.Vector3()): THREE.Vector3 {
  const [x, z] = planToWorld(p.x, p.y, f)
  return out.set(x, p.h, z)
}

/** 자세 → 카메라 위치·방향 (위쪽 = +y, 피치 ±1.35 rad 라 lookAt 이 뒤집히지 않음) */
export function applyPose(cam: THREE.PerspectiveCamera, pose: CameraPose, f: PlanFrame): void {
  worldOf(pose.eye, f, cam.position)
  cam.lookAt(worldOf(pose.look, f, tmp))
}

/** 참고 파일 setViewMode: 조감 뷰 = 벽 재질 반투명 0.13 · 깊이 쓰기 끔 · 벽 그림자 끔 */
export function ghostWalls(mats: Materials, group: THREE.Object3D | null, on: boolean): void {
  for (const m of [mats.panel, mats.drywall, mats.plinth]) {
    m.transparent = on
    m.opacity = on ? GHOST_OPACITY : 1
    m.depthWrite = !on
    m.needsUpdate = true
  }
  group?.traverse((o) => {
    if (GHOST_KINDS.has(o.userData.kind as string)) o.castShadow = !on
  })
}

/** 걷는 동안 안개 60~160 m (참고 파일), 조감 뷰 250~800 m — 큰 도면은 도면 크기에 맞춰 더 멀리 */
export function walkFog(span: number, overview: boolean): { near: number; far: number } {
  return overview ? { near: Math.max(250, span * 2.2), far: Math.max(800, span * 6) } : { near: 60, far: 160 }
}
