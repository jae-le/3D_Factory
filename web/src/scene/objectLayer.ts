import * as THREE from 'three'
import { cellSize, editCells, rectOf, snapToCells } from '../objects/grid'
import { planToLocal } from './coords'
import { zoneLabel, type ZoneLabel } from './labels'
import { instance } from './modelCache'

/** 3D 에 그릴 배치 하나 (plan 좌표 m, rot 도·반시계, size 는 모델 또는 BOX_SIZE) */
export interface SceneObject { id: number; name: string; url: string | null; sizeX: number; sizeY: number; sizeZ: number; x: number; y: number; rot: number; label?: string | null }
export interface ObjectEvents {
  onSelect(id: number | null): void // 클릭으로 고름 (빈 곳 클릭 = null)
  onDrag?(id: number, x: number, y: number): void // 편집 끌기 중 (plan 좌표, 격자 붙음)
  onDrop?(id: number, x: number, y: number): void // 끌기 끝
  onPlace?(x: number, y: number, rot: number): void // 배치 모드 클릭
}
export interface GhostSpec { url: string | null; sizeX: number; sizeY: number; sizeZ: number }

const BOX_COLOR = 0x9aa3ad
const SELECT_COLOR = 0x3b82f6
const CELL_OK = 0x3b82f6
const CELL_HIT = 0xef4444
const GRID_LINE = 0x60a5fa
const MAX_CELLS = 6000 // demo 와 같음 — 아주 큰 객체도 화면이 멈추지 않게
const GRID_PAD = 2 // 격자선은 차지 칸 바깥으로 2칸 더
const SELECT_PAD = 0.4
const GHOST_OPACITY = 0.45

interface Entry {
  o: SceneObject
  group: THREE.Group // 위치·회전, userData.placementId
  body: THREE.Group // 모델 또는 임시 상자 (pick 대상)
  key: string // 모양이 바뀌었는지 (url·크기·이름표)
  label: ZoneLabel | null
  token: number // 늦게 끝난 모델 로드 무시용
}

interface Ghost { spec: GhostSpec; group: THREE.Group; mats: THREE.Material[]; rot: number; at: { x: number; y: number } | null; raw: { x: number; y: number; snap: boolean } | null; token: number }

const noRaycast = () => {}
const shapeKey = (o: SceneObject) => `${o.url ?? ''}|${o.sizeX}|${o.sizeY}|${o.sizeZ}|${o.label ?? o.name}`

/** 배치 객체 표시·선택 테두리·편집 격자·배치 미리보기 (root 로컬 좌표 = planToLocal) */
export class ObjectLayer {
  private parent: THREE.Group
  private load: (url: string) => Promise<THREE.Object3D>
  private bounds = { w: 0, h: 0 }
  private items = new Map<number, Entry>()
  private selected: number | null = null
  private outline: THREE.LineLoop | null = null
  private editing: number | null = null
  private stats: { cells: number; hits: number } | null = null
  private ghost: Ghost | null = null
  private ghostRot = 0
  private dark = true
  private tokens = 0
  private disposed = false
  // 공유 자원
  private boxGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0) // 바닥 y=0
  private boxMat = new THREE.MeshStandardMaterial({ color: BOX_COLOR, transparent: true, opacity: 0.6, roughness: 0.8 })
  private ghostBoxMat = new THREE.MeshStandardMaterial({ color: BOX_COLOR, transparent: true, opacity: GHOST_OPACITY, depthWrite: false, roughness: 0.8 })
  private outlineMat = new THREE.LineBasicMaterial({ color: SELECT_COLOR, depthTest: false, toneMapped: false, transparent: true })
  private editVis = new THREE.Group()
  private cellGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
  private cellMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, toneMapped: false, depthWrite: false })
  private cells = new THREE.InstancedMesh(this.cellGeo, this.cellMat, MAX_CELLS)
  private lineMat = new THREE.LineBasicMaterial({ color: GRID_LINE, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false })
  private lines: THREE.LineSegments | null = null

  constructor(parent: THREE.Group, load: (url: string) => Promise<THREE.Object3D>) {
    this.parent = parent
    this.load = load
    this.cells.count = 0
    this.cells.frustumCulled = false
    this.cells.renderOrder = 8
    this.cells.raycast = noRaycast
    this.cells.setColorAt(0, new THREE.Color(CELL_OK)) // 처음부터 instanceColor 를 두어 셰이더가 다시 컴파일되지 않게
    this.editVis.add(this.cells)
    this.editVis.visible = false
    parent.add(this.editVis)
  }

  setBounds(b: { w: number; h: number }): void {
    this.bounds = { w: b.w, h: b.h }
    for (const e of this.items.values()) this.pose(e.group, e.o.x, e.o.y, e.o.rot)
    const g = this.ghost
    if (g?.raw) this.moveGhost(g.raw.x, g.raw.y, g.raw.snap)
    this.refreshEdit()
  }

  /** id 기준 차이만 반영: 없어진 것은 지우고, 모양이 바뀐 것만 다시 만들고, 위치는 옮김 */
  setObjects(list: SceneObject[]): void {
    const keep = new Set(list.map((o) => o.id))
    for (const [id, e] of this.items) if (!keep.has(id)) this.remove(id, e)
    for (const o of list) {
      const e = this.items.get(o.id)
      if (!e) {
        const group = new THREE.Group()
        group.userData.placementId = o.id
        const body = new THREE.Group()
        group.add(body)
        const n: Entry = { o, group, body, key: shapeKey(o), label: null, token: 0 }
        this.items.set(o.id, n)
        this.parent.add(group)
        this.build(n)
        this.pose(group, o.x, o.y, o.rot)
        continue
      }
      const prev = e.o
      e.o = o
      if (e.key !== shapeKey(o)) {
        e.key = shapeKey(o)
        this.build(e)
        if (this.selected === o.id) this.setSelected(o.id)
      }
      if (prev.x !== o.x || prev.y !== o.y || prev.rot !== o.rot) this.pose(e.group, o.x, o.y, o.rot)
    }
    if (this.selected != null && !this.items.has(this.selected)) this.setSelected(null)
    this.refreshEdit()
  }

  setSelected(id: number | null): void {
    if (this.outline) {
      this.outline.removeFromParent()
      this.outline.geometry.dispose()
      this.outline = null
    }
    this.selected = id
    const e = id == null ? undefined : this.items.get(id)
    if (!e) return
    const hx = e.o.sizeX / 2 + SELECT_PAD, hz = e.o.sizeY / 2 + SELECT_PAD, y = 0.05
    const pts = [new THREE.Vector3(-hx, y, -hz), new THREE.Vector3(hx, y, -hz), new THREE.Vector3(hx, y, hz), new THREE.Vector3(-hx, y, hz)]
    const line = (this.outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), this.outlineMat))
    line.renderOrder = 9
    line.raycast = noRaycast
    e.group.add(line)
  }

  setEditing(id: number | null): void {
    this.editing = id
    this.refreshEdit()
  }

  /** 테스트·안내용: 편집 격자 칸 수와 겹친 칸 수 */
  editStats(): { cells: number; hits: number } | null {
    return this.stats
  }

  /** 배치 미리보기. 같은 모양이면 그대로 둠 (React 가 매번 새 객체를 넘겨도 회전 유지) */
  setGhost(g: GhostSpec | null): void {
    const cur = this.ghost
    if (cur && g && cur.spec.url === g.url && cur.spec.sizeX === g.sizeX && cur.spec.sizeY === g.sizeY && cur.spec.sizeZ === g.sizeZ) return
    if (cur) this.dropGhost(cur)
    this.ghost = null
    if (!g) {
      this.ghostRot = 0
      return
    }
    const group = new THREE.Group()
    group.visible = false // 처음 옮길 때까지 숨김
    const box = new THREE.Mesh(this.boxGeo, this.ghostBoxMat)
    box.scale.set(g.sizeX, g.sizeZ, g.sizeY)
    box.raycast = noRaycast
    group.add(box)
    const ghost: Ghost = { spec: { ...g }, group, mats: [], rot: this.ghostRot, at: null, raw: null, token: ++this.tokens }
    group.rotation.y = (ghost.rot * Math.PI) / 180
    this.ghost = ghost
    this.parent.add(group)
    if (g.url)
      this.load(g.url).then(
        (src) => {
          if (this.disposed || this.ghost !== ghost) return
          const m = instance(src)
          m.traverse((o) => {
            o.raycast = noRaycast
            const mesh = o as THREE.Mesh
            if (!mesh.material) return
            const clone = (x: THREE.Material) => {
              const c = x.clone()
              c.transparent = true
              c.opacity = GHOST_OPACITY
              c.depthWrite = false
              ghost.mats.push(c)
              return c
            }
            mesh.material = Array.isArray(mesh.material) ? mesh.material.map(clone) : clone(mesh.material)
          })
          group.clear()
          group.add(m)
        },
        () => {}, // 실패하면 상자 그대로
      )
  }

  /** 미리보기를 plan (x, y) 로. snap 이면 바깥 상자 모서리를 격자선에 붙임 */
  moveGhost(x: number, y: number, snap: boolean): { x: number; y: number } {
    const g = this.ghost
    if (!g) return { x, y }
    g.raw = { x, y, snap }
    const at = snap ? snapToCells(rectOf({ x, y, rot: g.rot }, g.spec), x, y, cellSize(this.bounds)) : { x, y }
    g.at = at
    this.pose(g.group, at.x, at.y, g.rot)
    g.group.visible = true
    return { ...at }
  }

  /** +90° (반시계), 새 rot */
  rotateGhost(): number {
    this.ghostRot = (this.ghostRot + 90) % 360
    const g = this.ghost
    if (g) {
      g.rot = this.ghostRot
      if (g.raw) this.moveGhost(g.raw.x, g.raw.y, g.raw.snap)
      else g.group.rotation.y = (g.rot * Math.PI) / 180
    }
    return this.ghostRot
  }

  /** 미리보기의 현재 자리 (아직 안 옮겼으면 null) */
  ghostPose(): { x: number; y: number; rot: number } | null {
    const g = this.ghost
    return g?.at ? { ...g.at, rot: g.rot } : null
  }

  hasGhost(): boolean {
    return this.ghost != null
  }

  /** 광선에 맞은 가장 가까운 배치 id */
  pick(ray: THREE.Raycaster): number | null {
    const bodies = [...this.items.values()].map((e) => e.body)
    for (const hit of ray.intersectObjects(bodies, true)) {
      for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) {
        const id = o.userData.placementId
        if (id != null) return id as number
      }
    }
    return null
  }

  /** 끌기 중: 메쉬만 옮기고 편집 격자 다시 */
  move(id: number, x: number, y: number): void {
    const e = this.items.get(id)
    if (!e) return
    e.o = { ...e.o, x, y }
    this.pose(e.group, x, y, e.o.rot)
    this.refreshEdit()
  }

  /** 지금 그리고 있는 배치 정보 (끌기 중이면 옮긴 자리) */
  object(id: number): SceneObject | null {
    return this.items.get(id)?.o ?? null
  }

  /** 배치 중심의 월드 좌표 */
  worldPos(id: number): THREE.Vector3 | null {
    const e = this.items.get(id)
    if (!e) return null
    e.group.updateWorldMatrix(true, false)
    return e.group.getWorldPosition(new THREE.Vector3())
  }

  /** 배치 메쉬 bbox 최고 높이(월드 y) — 상황판 칩 기준점. 이름표 스프라이트는 빼고 메쉬만 */
  top(id: number): number | null {
    const e = this.items.get(id)
    if (!e) return null
    e.group.updateWorldMatrix(true, true)
    const b = new THREE.Box3()
    e.body.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) b.expandByObject(o)
    })
    return b.isEmpty() ? null : b.max.y
  }

  /** 이름표: 3D = 어두운 글자, 도면 보기 = 흰 글자 */
  setDark(dark: boolean): void {
    this.dark = dark
    for (const e of this.items.values()) if (e.label) e.label.sprite.material.map = dark ? e.label.dark : e.label.light
  }

  dispose(): void {
    this.disposed = true
    this.setSelected(null)
    for (const [id, e] of this.items) this.remove(id, e)
    if (this.ghost) this.dropGhost(this.ghost)
    this.ghost = null
    this.editVis.removeFromParent()
    this.lines?.geometry.dispose()
    this.cells.dispose()
    for (const x of [this.boxGeo, this.cellGeo, this.boxMat, this.ghostBoxMat, this.outlineMat, this.cellMat, this.lineMat]) x.dispose()
  }

  /* ---------------- 내부 ---------------- */

  private pose(o: THREE.Object3D, x: number, y: number, rot: number) {
    const [lx, lz] = planToLocal(x, y, this.bounds)
    o.position.set(lx, 0, lz)
    o.rotation.y = (rot * Math.PI) / 180
  }

  /** 몸체 다시: 임시 상자 → (url 있으면) 모델 로드 후 바꿈. url 없음·실패면 상자 + 이름표 */
  private build(e: Entry) {
    const token = (e.token = ++this.tokens)
    this.clearBody(e)
    const o = e.o
    const box = new THREE.Mesh(this.boxGeo, this.boxMat)
    box.scale.set(o.sizeX, o.sizeZ, o.sizeY)
    box.castShadow = box.receiveShadow = true
    e.body.add(box)
    if (!o.url) {
      this.addLabel(e)
      return
    }
    this.load(o.url).then(
      (src) => {
        if (this.disposed || e.token !== token || this.items.get(o.id) !== e) return
        const m = instance(src)
        m.traverse((c) => {
          c.castShadow = c.receiveShadow = true
        })
        this.clearBody(e)
        e.body.add(m)
      },
      () => {
        if (this.disposed || e.token !== token || this.items.get(o.id) !== e) return
        this.addLabel(e)
      },
    )
  }

  private addLabel(e: Entry) {
    const lab = zoneLabel(e.o.label ?? e.o.name)
    if (!lab) return // jsdom 등 2D 캔버스가 없으면 이름표 없이
    lab.sprite.material.map = this.dark ? lab.dark : lab.light
    lab.sprite.position.set(0, e.o.sizeZ + 0.4, 0)
    lab.sprite.raycast = noRaycast
    e.label = lab
    e.group.add(lab.sprite)
  }

  /** 몸체·이름표 비움 (형상·재질은 공유 — 이름표만 해제) */
  private clearBody(e: Entry) {
    e.body.clear()
    if (e.label) {
      e.label.sprite.removeFromParent()
      e.label.sprite.material.dispose()
      e.label.dark.dispose()
      e.label.light.dispose()
      e.label = null
    }
  }

  private remove(id: number, e: Entry) {
    if (this.selected === id) this.setSelected(null)
    e.token = -1
    this.clearBody(e)
    e.group.removeFromParent()
    this.items.delete(id)
  }

  private dropGhost(g: Ghost) {
    g.group.removeFromParent()
    g.group.clear()
    for (const m of g.mats) m.dispose()
  }

  /** 편집 격자: 차지 칸(파랑)·겹친 칸(빨강) + 둘레 격자선 */
  private refreshEdit() {
    const e = this.editing == null ? undefined : this.items.get(this.editing)
    if (this.lines) {
      this.lines.removeFromParent()
      this.lines.geometry.dispose()
      this.lines = null
    }
    if (!e) {
      this.editVis.visible = false
      this.cells.count = 0
      this.stats = null
      return
    }
    const b = this.bounds, c = cellSize(b)
    const others = [...this.items.values()].filter((x) => x !== e).map((x) => rectOf(x.o, x.o))
    const list = editCells(rectOf(e.o, e.o), others, c)
    const n = Math.min(list.length, MAX_CELLS)
    const mtx = new THREE.Matrix4(), col = new THREE.Color()
    let hits = 0, i0 = Infinity, i1 = -Infinity, j0 = Infinity, j1 = -Infinity
    for (let k = 0; k < n; k++) {
      const cell = list[k]
      const [lx, lz] = planToLocal(cell.x + c / 2, cell.y + c / 2, b)
      mtx.makeScale(c * 0.94, 1, c * 0.94).setPosition(lx, 0.035, lz)
      this.cells.setMatrixAt(k, mtx)
      this.cells.setColorAt(k, col.setHex(cell.hit ? CELL_HIT : CELL_OK))
      if (cell.hit) hits++
      const i = Math.round(cell.x / c), j = Math.round(cell.y / c)
      i0 = Math.min(i0, i)
      i1 = Math.max(i1, i + 1)
      j0 = Math.min(j0, j)
      j1 = Math.max(j1, j + 1)
    }
    this.cells.count = n
    this.cells.instanceMatrix.needsUpdate = true
    if (this.cells.instanceColor) this.cells.instanceColor.needsUpdate = true
    this.stats = { cells: n, hits }
    this.editVis.visible = true
    if (!n) return
    i0 -= GRID_PAD
    j0 -= GRID_PAD
    i1 += GRID_PAD
    j1 += GRID_PAD
    const pos: number[] = []
    const at = (px: number, py: number) => {
      const [lx, lz] = planToLocal(px, py, b)
      pos.push(lx, 0.03, lz)
    }
    for (let i = i0; i <= i1; i++) {
      at(i * c, j0 * c)
      at(i * c, j1 * c)
    }
    for (let j = j0; j <= j1; j++) {
      at(i0 * c, j * c)
      at(i1 * c, j * c)
    }
    const lines = (this.lines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)), this.lineMat))
    lines.raycast = noRaycast
    lines.renderOrder = 7
    this.editVis.add(lines)
  }
}
