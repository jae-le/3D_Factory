import * as THREE from 'three'
import { planToLocal } from './coords'

/** 상황판 바닥 링 하나 (plan 좌표 m, 반지름 r m, 색 '#rrggbb', strong = 선택) */
export interface RingSpec { id: number; x: number; y: number; r: number; color: string; strong: boolean }

const RING_Y = 0.04
const FADE_MS = 600
const OPACITY = 0.6
const OPACITY_STRONG = 0.95

type RingMesh = THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>
interface Ring { spec: RingSpec; mesh: RingMesh; from: THREE.Color; to: THREE.Color; t0: number }

const noRaycast = () => {}
const ringGeo = (r: number) => new THREE.RingGeometry(r * 0.9, r, 64) // 두께 10%

/** 상황판 바닥 상태 링 (demo buildDashLabels 의 ring). 색이 바뀌면 0.6초 동안 바뀜 */
export class RingLayer {
  private parent: THREE.Group
  private now: () => number
  private bounds = { w: 0, h: 0 }
  private rings = new Map<number, Ring>()

  constructor(parent: THREE.Group, now: () => number = () => performance.now()) {
    this.parent = parent
    this.now = now
  }

  setBounds(b: { w: number; h: number }): void {
    this.bounds = { w: b.w, h: b.h }
    for (const r of this.rings.values()) this.place(r)
  }

  setRings(list: RingSpec[]): void {
    const keep = new Set(list.map((s) => s.id))
    for (const [id, r] of this.rings) if (!keep.has(id)) this.remove(id, r)
    for (const s of list) {
      let r = this.rings.get(s.id)
      if (!r) {
        const mat = new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: OPACITY, depthWrite: false, toneMapped: false })
        const mesh = new THREE.Mesh(ringGeo(s.r), mat) as RingMesh
        mesh.rotation.x = -Math.PI / 2
        mesh.renderOrder = 7
        mesh.raycast = noRaycast
        r = { spec: s, mesh, from: new THREE.Color(s.color), to: new THREE.Color(s.color), t0: -Infinity }
        this.rings.set(s.id, r)
        this.parent.add(mesh)
      } else {
        if (r.spec.r !== s.r) {
          r.mesh.geometry.dispose()
          r.mesh.geometry = ringGeo(s.r)
        }
        if (r.spec.color !== s.color) {
          r.from.copy(r.mesh.material.color)
          r.to.set(s.color)
          r.t0 = this.now()
        }
        r.spec = s
      }
      r.mesh.material.opacity = s.strong ? OPACITY_STRONG : OPACITY
      this.place(r)
    }
  }

  /** 매 프레임: 색 보간 */
  update(): void {
    const t = this.now()
    for (const r of this.rings.values()) {
      const k = Math.min(1, (t - r.t0) / FADE_MS)
      r.mesh.material.color.copy(r.from).lerp(r.to, k)
    }
  }

  dispose(): void {
    for (const [id, r] of this.rings) this.remove(id, r)
  }

  private place(r: Ring) {
    const [x, z] = planToLocal(r.spec.x, r.spec.y, this.bounds)
    r.mesh.position.set(x, RING_Y, z)
  }

  private remove(id: number, r: Ring) {
    this.parent.remove(r.mesh)
    r.mesh.geometry.dispose()
    r.mesh.material.dispose()
    this.rings.delete(id)
  }
}
