import * as THREE from 'three'
import type { GhostObject, GhostWall, Preview } from '../ai/preview'
import { planToLocal } from './coords'

export const PREVIEW_COLOR = { move: 0x3b82f6, add: 0x22c55e, delete: 0xef4444, wallAdd: 0xf97316, wallDelete: 0xef4444 }
const OPACITY = 0.35
const OPACITY_HI = 0.65
const DELETE_PAD = 1.06 // 삭제 덮개는 원래보다 조금 크게
const noRaycast = () => {}
const rad = (deg: number) => (deg * Math.PI) / 180

/** AI 제안 3D 미리보기 (반투명 유령 · 원래 자리 점선 · 가벽). 고르기(raycast) 대상 아님 */
export class PreviewLayer {
  private parent: THREE.Group
  private bounds = { w: 0, h: 0 }
  private preview: Preview | null = null
  private hi: number | null = null
  private parts: THREE.Object3D[] = []

  constructor(parent: THREE.Group) {
    this.parent = parent
  }

  setBounds(b: { w: number; h: number }): void {
    this.bounds = { w: b.w, h: b.h }
    this.build()
  }

  set(p: Preview | null): void {
    this.preview = p
    this.build()
  }

  highlight(seq: number | null): void {
    this.hi = seq
    for (const o of this.parts) {
      const m = o as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
      if (m.isMesh) m.material.opacity = o.userData.seq === seq ? OPACITY_HI : o.userData.base
    }
  }

  dispose(): void {
    this.clear()
  }

  private build() {
    this.clear()
    if (!this.preview) return
    for (const g of this.preview.objects) this.object(g)
    for (const w of this.preview.walls) this.wall(w)
    this.highlight(this.hi)
  }

  private mesh(geo: THREE.BufferGeometry, color: number, seq: number, kind: string) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: OPACITY, depthWrite: false, toneMapped: false })
    const m = new THREE.Mesh(geo, mat)
    m.userData = { seq, kind, base: OPACITY }
    m.renderOrder = 8
    m.raycast = noRaycast
    this.add(m)
    return m
  }

  private object(g: GhostObject) {
    const k = g.kind === 'delete' ? DELETE_PAD : 1
    const { sizeX, sizeY, sizeZ } = g.size
    const m = this.mesh(new THREE.BoxGeometry(sizeX * k, sizeZ * k, sizeY * k), PREVIEW_COLOR[g.kind], g.seq, g.kind)
    const [x, z] = planToLocal(g.at.x, g.at.y, this.bounds)
    m.position.set(x, (sizeZ * k) / 2, z)
    m.rotation.y = rad(g.at.rot)
    if (g.from) {
      // 원래 자리: 바닥 위 점선 사각형
      const hx = sizeX / 2, hz = sizeY / 2, y = 0.05
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-hx, y, -hz), new THREE.Vector3(hx, y, -hz), new THREE.Vector3(hx, y, hz), new THREE.Vector3(-hx, y, hz), new THREE.Vector3(-hx, y, -hz),
      ])
      const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: PREVIEW_COLOR.move, dashSize: 0.4, gapSize: 0.25, depthTest: false, toneMapped: false }))
      line.computeLineDistances()
      const [fx, fz] = planToLocal(g.from.x, g.from.y, this.bounds)
      line.position.set(fx, 0, fz)
      line.rotation.y = rad(g.from.rot)
      line.userData = { seq: g.seq, kind: 'from' }
      line.renderOrder = 8
      line.raycast = noRaycast
      this.add(line)
    }
  }

  private wall(w: GhostWall) {
    const [ax, ay] = w.a, [bx, by] = w.b
    const len = Math.hypot(bx - ax, by - ay)
    const m = this.mesh(new THREE.BoxGeometry(len, w.h, w.t), w.kind === 'add' ? PREVIEW_COLOR.wallAdd : PREVIEW_COLOR.wallDelete, w.seq, `wall-${w.kind}`)
    const [x, z] = planToLocal((ax + bx) / 2, (ay + by) / 2, this.bounds)
    m.position.set(x, w.h / 2, z)
    m.rotation.y = Math.atan2(by - ay, bx - ax)
  }

  private add(o: THREE.Object3D) {
    this.parts.push(o)
    this.parent.add(o)
  }

  private clear() {
    for (const o of this.parts) {
      this.parent.remove(o)
      const m = o as THREE.Mesh
      m.geometry?.dispose()
      ;(m.material as THREE.Material | undefined)?.dispose()
    }
    this.parts = []
  }
}
