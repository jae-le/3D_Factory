import * as THREE from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'

const NAV_KEYS = new Set(['w', 'a', 's', 'd', 'q', 'e', 'r', 'f', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'])
/** 글자 입력 중이거나 대화 상자 안에 포커스가 있으면 이동 키 무시 */
const typing = () => {
  const el = document.activeElement
  return /INPUT|SELECT|TEXTAREA/.test(el?.tagName ?? '') || !!el?.closest('[role=dialog]')
}

interface CamAnim { t0: number; dur: number; fT: THREE.Vector3; tT: THREE.Vector3; fP: THREE.Vector3; tP: THREE.Vector3 }

/**
 * 더블클릭 다가가기(0.6초) · WASD/방향키 이동 · Q/E 회전 · R/F 높이 · Shift 3배 (demo 그대로).
 * 속도는 카메라와 바라보는 점 사이 거리에 비례 (가까이 있으면 천천히).
 */
export class Navigator {
  private camera: THREE.PerspectiveCamera
  private controls: OrbitControls
  private dom: HTMLElement
  private camAnim: CamAnim | null = null
  private keys = new Set<string>()
  private fwd = new THREE.Vector3()
  private right = new THREE.Vector3()
  private mv = new THREE.Vector3()

  constructor(camera: THREE.PerspectiveCamera, controls: OrbitControls, dom: HTMLElement) {
    this.camera = camera
    this.controls = controls
    this.dom = dom
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
    dom.addEventListener('pointerdown', this.cancel)
    dom.addEventListener('wheel', this.cancel, { passive: true })
  }

  /** p 쪽으로 0.6초 동안 이동. 지금 바라보는 수평 방향은 유지, 약 50° 내려다보기 (demo focusOn) */
  focusOn(p: THREE.Vector3, size = 12): void {
    const { camera, controls } = this
    const off = camera.position.clone().sub(controls.target), yaw = Math.atan2(off.x, off.z)
    const dist = Math.max(10, size * 1.7), pitch = 0.85
    const to = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(dist)
    this.camAnim = {
      t0: performance.now(), dur: 600,
      fT: controls.target.clone(), tT: p.clone().setY(0),
      fP: camera.position.clone(), tP: p.clone().setY(0).add(to),
    }
  }

  /** 정한 시점으로 0.6초 이동 (상황판 전체 보기) */
  flyTo(target: THREE.Vector3, position: THREE.Vector3, dur = 600): void {
    this.camAnim = {
      t0: performance.now(), dur,
      fT: this.controls.target.clone(), tT: target.clone(),
      fP: this.camera.position.clone(), tP: position.clone(),
    }
  }

  /** 매 프레임: 포커스 애니메이션 + 키보드 이동 */
  update(dt: number): void {
    this.stepCamAnim()
    this.keyNav(dt)
  }

  cancel = (): void => {
    this.camAnim = null
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    this.dom.removeEventListener('pointerdown', this.cancel)
    this.dom.removeEventListener('wheel', this.cancel)
    this.keys.clear()
    this.camAnim = null
  }

  /** 실제 시간 기준 (프레임이 느려도 0.6초에 끝남) */
  private stepCamAnim() {
    const a = this.camAnim
    if (!a) return
    const k = Math.min(1, (performance.now() - a.t0) / a.dur), e = 1 - Math.pow(1 - k, 3)
    this.controls.target.lerpVectors(a.fT, a.tT, e)
    this.camera.position.lerpVectors(a.fP, a.tP, e)
    if (k >= 1) this.camAnim = null
  }

  private keyNav(dt: number) {
    const KEYS = this.keys
    if (!KEYS.size || typing()) return
    this.camAnim = null
    const { camera } = this
    const has = (...ks: string[]) => ks.some((k) => KEYS.has(k)), t = this.controls.target
    const sp = Math.max(3, camera.position.distanceTo(t) * 0.8) * (KEYS.has('shift') ? 3 : 1) * dt
    const fwd = this.fwd.subVectors(t, camera.position).setY(0)
    if (fwd.lengthSq() < 1e-9) fwd.set(0, 0, -1)
    fwd.normalize()
    const right = this.right.crossVectors(fwd, camera.up).normalize()
    const mv = this.mv.set(0, 0, 0)
    if (has('w', 'arrowup')) mv.add(fwd)
    if (has('s', 'arrowdown')) mv.sub(fwd)
    if (has('d', 'arrowright')) mv.add(right)
    if (has('a', 'arrowleft')) mv.sub(right)
    if (mv.lengthSq()) {
      mv.normalize().multiplyScalar(sp)
      camera.position.add(mv)
      t.add(mv)
    }
    if (has('q', 'e')) {
      // 바라보는 점을 중심으로 수평 회전
      const a = (has('q') ? 1 : -1) * 1.4 * dt * (KEYS.has('shift') ? 2 : 1), off = camera.position.clone().sub(t)
      off.applyAxisAngle(camera.up, a)
      camera.position.copy(t).add(off)
    }
    if (has('r')) camera.position.y += sp
    if (has('f')) camera.position.y = Math.max(t.y + 0.5, camera.position.y - sp)
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase()
    if (typing() || e.ctrlKey || e.metaKey || e.altKey || !NAV_KEYS.has(k)) return
    this.keys.add(k)
    if (k.startsWith('arrow')) e.preventDefault()
  }

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase())
  }

  private onBlur = () => {
    this.keys.clear()
  }
}
