import { isPickClick } from './clicks'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import type { Plan, Pt } from '../drawing/plan/types'
import { localToPlan, planToLocal } from './coords'
import { createMaterials, type Materials } from './materials'
import { Navigator } from './navigation'
import { planToMeshes, type PlanMeshes } from './planToMeshes'
import { createTextures, type Textures } from './textures'

export type ViewMode = '3d' | 'plan'
export type Quality = 'high' | 'low'
export interface GroundPick { x: number; y: number } // plan 좌표(m)
export interface PickSource {
  setGroundClick(cb: ((p: GroundPick) => void) | null): void
  setMarkers(pts: Pt[]): void
}

const SNAP_PX = 12
const MARK_COLOR = 0xff5a1f // 측정 점·선: 밝은 바닥·어두운 도면 양쪽에서 잘 보이는 주황
const MARK_Y = 0.06
const BG_3D = 0xc3cad2
const BG_PLAN = 0x0e1013

/** 그리드 칸 간격 (demo niceStep) */
const niceStep = (gs: number) => (gs > 400 ? 10 : gs > 80 ? 5 : gs > 20 ? 1 : 0.5)

/** 그룹 안 형상·재질 해제 (userData.keep 인 공유 재질은 남김 — demo disposeGroup) */
function disposeGroup(g: THREE.Object3D) {
  g.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.geometry && !mesh.geometry.userData.keep) mesh.geometry.dispose()
    const mats = ([] as THREE.MeshBasicMaterial[]).concat((mesh.material as THREE.MeshBasicMaterial | THREE.MeshBasicMaterial[] | undefined) ?? [])
    for (const m of mats)
      if (!m.userData.keep) {
        m.map?.dispose()
        m.dispose()
      }
  })
  g.clear()
}

/** 3D 공장 화면. React 는 setPlan·setView·setQuality·도구 콜백만 부른다 */
export class FactoryScene implements PickSource {
  private container: HTMLElement
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100000)
  private controls: OrbitControls
  private composer: EffectComposer
  private passes: { dispose(): void }[]
  private envTex: THREE.Texture
  private hemi = new THREE.HemisphereLight(0xffffff, 0x5c6168, 0.3)
  private sun = new THREE.DirectionalLight(0xfff3e0, 2.2)
  private bg = new THREE.Color(BG_3D)
  private fog = new THREE.Fog(BG_3D, 100, 300)
  private tex: Textures
  private mats: Materials
  private ground: THREE.Mesh
  private grid: THREE.GridHelper | null = null
  private root = new THREE.Group() // 회전·반전 (plan.rotQ, plan.flip)
  private overlay = new THREE.Group() // 측정 점·선 (root 아래)
  // 측정 점: 화면 크기 고정 점, 선: 항상 위에 (깊이 무시)
  private markMat = new THREE.PointsMaterial({ color: MARK_COLOR, size: 12, sizeAttenuation: false, depthTest: false, toneMapped: false, transparent: true })
  private markLineMat = new THREE.LineBasicMaterial({ color: MARK_COLOR, depthTest: false, toneMapped: false, transparent: true })
  private meshes: PlanMeshes | null = null
  private plan: Plan | null = null
  private planKey: string | number | undefined
  private span = 50
  private mode: ViewMode = '3d'
  private quality: Quality = 'high'
  private camMode: ViewMode | null = null // 카메라가 어느 보기 기준으로 놓였는지
  private nav: Navigator
  private onPick: ((p: GroundPick) => void) | null = null
  private resizeObs: ResizeObserver
  private timer = new THREE.Timer() // 0.186: Clock 은 deprecated
  private downAt: { x: number; y: number } | null = null
  private ray = new THREE.Raycaster()
  private ndc = new THREE.Vector2()
  private floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

  constructor(container: HTMLElement) {
    this.container = container
    const renderer = (this.renderer = new THREE.WebGLRenderer({ antialias: true }))
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 0.85
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap // 0.186: PCFSoftShadowMap 제거됨 (PCFShadowMap 가 부드러운 그림자)
    renderer.domElement.style.display = 'block'
    container.appendChild(renderer.domElement)

    const controls = (this.controls = new OrbitControls(this.camera, renderer.domElement))
    controls.enableDamping = true
    controls.maxPolarAngle = Math.PI / 2 - 0.02
    controls.minDistance = 2

    // 조명: 실내 환경맵(반사·간접광) + 반구광 + 그림자 내리는 태양광
    const pmrem = new THREE.PMREMGenerator(renderer)
    this.envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()
    this.scene.environment = this.envTex
    this.sun.castShadow = true
    this.sun.shadow.bias = -0.0004
    this.sun.shadow.normalBias = 0.03
    this.scene.add(this.hemi, this.sun, this.sun.target)

    // 후처리: GTAO(모서리 음영) → 톤매핑 출력
    const composer = (this.composer = new EffectComposer(renderer))
    const renderPass = new RenderPass(this.scene, this.camera)
    const gtao = new GTAOPass(this.scene, this.camera, 1, 1)
    gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1, scale: 1.2, samples: 12 })
    gtao.blendIntensity = 0.9
    const outputPass = new OutputPass()
    composer.addPass(renderPass)
    composer.addPass(gtao)
    composer.addPass(outputPass)
    this.passes = [renderPass, gtao, outputPass]

    this.tex = createTextures()
    this.mats = createMaterials(this.tex)
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mats.ground3d)
    this.ground.rotation.x = -Math.PI / 2
    this.ground.position.y = -0.01
    this.ground.receiveShadow = true
    this.scene.add(this.ground, this.root)
    this.root.add(this.overlay)

    this.nav = new Navigator(this.camera, controls, renderer.domElement)
    const dom = renderer.domElement
    dom.addEventListener('pointerdown', this.onPointerDown)
    dom.addEventListener('click', this.onClick)
    dom.addEventListener('dblclick', this.onDblClick)

    this.resizeObs = new ResizeObserver(() => this.resize())
    this.resizeObs.observe(container)
    this.resize()
    this.resetCamera()
    this.applyLook()
    this.timer.connect(document) // 탭이 숨겨졌다 돌아올 때 큰 dt 방지
    renderer.setAnimationLoop(this.tick)
  }

  /** key 가 바뀌면(다른 도면) 카메라 초기화, 같은 key 의 보정·회전 갱신은 카메라 유지 */
  setPlan(plan: Plan | null, key?: string | number): void {
    const prev = this.plan
    const prevKey = this.planKey
    this.planKey = key
    if (this.meshes) {
      this.root.remove(this.meshes.group)
      disposeGroup(this.meshes.group)
      for (const z of this.meshes.zoneLabels) {
        z.dark.dispose()
        z.light.dispose()
      }
      this.meshes = null
    }
    this.plan = plan
    if (!plan) {
      this.clearOverlay()
      return
    }
    this.meshes = planToMeshes(plan, this.mats, { labels: true })
    this.root.add(this.meshes.group)
    this.root.scale.set(plan.flip, 1, 1)
    this.root.rotation.y = (plan.rotQ * Math.PI) / 2
    this.root.updateMatrixWorld(true)

    const span = (this.span = Math.max(plan.bounds.w, plan.bounds.h) || 50)
    this.ground.scale.set(span * 3, span * 3, 1)
    this.tex.concrete.repeat.set((span * 3) / 4, (span * 3) / 4)
    if (this.grid) {
      this.scene.remove(this.grid)
      this.grid.dispose()
    }
    const gs = Math.ceil((span * 1.6) / 10) * 10, div = Math.min(200, Math.round(gs / niceStep(gs)))
    this.grid = new THREE.GridHelper(gs, div, 0x2b3240, 0x20252e)
    this.grid.position.y = -0.005
    this.scene.add(this.grid)

    // 카메라는 도면(key)이 바뀔 때만 초기화 (같은 도면의 회전·보정 저장 때는 유지)
    if (!prev || prevKey !== key) this.resetCamera()
    this.applyLook()
  }

  setView(mode: ViewMode): void {
    this.mode = mode
    this.applyLook()
  }

  setQuality(q: Quality): void {
    this.quality = q
    this.applyLook()
  }

  setGroundClick(cb: ((p: GroundPick) => void) | null): void {
    this.onPick = cb
  }

  setMarkers(pts: Pt[]): void {
    this.clearOverlay()
    const plan = this.plan
    if (!plan) return
    if (!pts.length) return
    const at = pts.map(([x, y]) => {
      const [lx, lz] = planToLocal(x, y, plan.bounds)
      return new THREE.Vector3(lx, MARK_Y, lz)
    })
    if (at.length >= 2) {
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(at), this.markLineMat)
      line.renderOrder = 10
      this.overlay.add(line)
    }
    const dots = new THREE.Points(new THREE.BufferGeometry().setFromPoints(at), this.markMat)
    dots.renderOrder = 11
    this.overlay.add(dots)
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null)
    this.resizeObs.disconnect()
    this.timer.dispose()
    this.nav.dispose()
    const dom = this.renderer.domElement
    dom.removeEventListener('pointerdown', this.onPointerDown)
    dom.removeEventListener('click', this.onClick)
    dom.removeEventListener('dblclick', this.onDblClick)
    this.controls.dispose()
    this.setPlan(null)
    this.markMat.dispose()
    this.markLineMat.dispose()
    if (this.grid) this.grid.dispose()
    this.ground.geometry.dispose()
    for (const m of Object.values(this.mats)) (m as THREE.Material).dispose()
    this.tex.concrete.dispose()
    this.tex.panel.dispose()
    this.envTex.dispose()
    this.sun.shadow.map?.dispose()
    for (const p of this.passes) p.dispose()
    this.composer.dispose()
    this.renderer.forceContextLoss() // 브라우저 WebGL 컨텍스트 수 제한 — 바로 돌려줌
    this.renderer.dispose()
    dom.remove()
  }

  /* ---------------- 내부 ---------------- */

  private tick = () => {
    this.timer.update()
    const dt = Math.min(this.timer.getDelta(), 0.1)
    this.nav.update(dt)
    this.controls.update()
    if (this.mode === '3d' && this.quality === 'high') this.composer.render()
    else this.renderer.render(this.scene, this.camera)
  }

  private resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight
    if (!w || !h) return
    this.renderer.setSize(w, h)
    this.composer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  /** 카메라 거리 기준 크기: 작은 도면·높은 벽도 한눈에 (세로 화면이면 더 멀리) */
  private camSpan(): number {
    let hMax = 0
    const p = this.plan
    if (p) {
      for (const w of p.walls) hMax = Math.max(hMax, w.h)
      for (const w of p.partitions) hMax = Math.max(hMax, w.h)
      for (const c of p.columns) hMax = Math.max(hMax, c.h)
    }
    let s = Math.max(this.span, hMax * 8, 40)
    if (this.camera.aspect < 1) s /= this.camera.aspect
    return s
  }

  /** 새 도면: 범위에 맞춰 near/far 와 비스듬한 시점 (demo 910~911) */
  private resetCamera() {
    const span = this.span, cs = this.camSpan()
    this.camera.near = Math.max(0.1, span / 400)
    this.camera.far = Math.max(span, cs) * 50
    this.camera.updateProjectionMatrix()
    this.controls.target.set(0, 0, 0)
    this.camera.position.set(-cs * 0.25, cs * 0.55, cs * 0.75)
    this.controls.update()
    this.nav.cancel()
    this.camMode = '3d'
  }

  /** 보기 모드(3D 실사 / 도면)·품질에 맞춰 배경·조명·선 색·그림자를 바꿈 (demo applyLook) */
  private applyLook() {
    const is3d = this.mode === '3d', span = this.span
    const { scene, sun } = this
    scene.background = this.bg.setHex(is3d ? BG_3D : BG_PLAN)
    this.fog.near = span * 2.2
    this.fog.far = span * 6
    scene.fog = is3d ? this.fog : null
    this.ground.material = is3d ? this.mats.ground3d : this.mats.groundPlan
    this.tex.concrete.repeat.set((span * 3) / 4, (span * 3) / 4)
    if (this.grid) this.grid.visible = !is3d
    // CAD 선·글자: 도면 모드에서는 원색, 3D 모드에서는 바닥 마킹처럼 어둡고 옅게
    const op = 1
    if (this.meshes) {
      for (const m of this.meshes.lineMats) {
        m.color.setHex(is3d ? 0x2c3138 : 0xffffff)
        m.opacity = is3d ? op * 0.45 : op
      }
      for (const m of this.meshes.labelMats) {
        m.color.setHex(is3d ? 0x2c3138 : 0xffffff)
        m.opacity = is3d ? 0.6 : 1
      }
      for (const z of this.meshes.zoneLabels) z.sprite.material.map = is3d ? z.dark : z.light
    }
    this.hemi.intensity = is3d ? 0.3 : 0.9
    sun.intensity = is3d ? 2.2 : 1.4
    this.renderer.shadowMap.enabled = is3d
    const sz = this.quality === 'high' ? 4096 : 2048
    if (sun.shadow.mapSize.x !== sz) {
      sun.shadow.mapSize.set(sz, sz)
      sun.shadow.map?.dispose()
      sun.shadow.map = null
    }
    // 태양광 그림자 범위를 도면 크기에 맞춤
    sun.position.set(span * 0.35, span * 0.9, span * 0.45)
    sun.target.position.set(0, 0, 0)
    const sc = sun.shadow.camera
    sc.left = sc.bottom = -span * 0.75
    sc.right = sc.top = span * 0.75
    sc.near = 1
    sc.far = span * 3
    sc.updateProjectionMatrix()

    // 보기가 바뀌면 카메라: 도면 보기 = 위에서 내려다봄, 3D = 비스듬히
    if (this.camMode !== this.mode) {
      const t = this.controls.target, cs = this.camSpan()
      if (is3d) this.camera.position.set(t.x - cs * 0.25, t.y + cs * 0.55, t.z + cs * 0.75)
      else this.camera.position.set(t.x, t.y + cs * 1.2, t.z + 0.001)
      this.nav.cancel()
      this.controls.update()
      this.camMode = this.mode
    }
  }

  private clearOverlay() {
    for (const o of this.overlay.children) (o as THREE.Line | THREE.Points).geometry.dispose()
    this.overlay.clear()
  }

  /** 화면 좌표 → 바닥(y=0) 교차점 (월드) */
  private hitGround(ev: MouseEvent): THREE.Vector3 | null {
    const rect = this.renderer.domElement.getBoundingClientRect()
    if (!rect.width || !rect.height) return null
    this.ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1)
    this.ray.setFromCamera(this.ndc, this.camera)
    const hit = new THREE.Vector3()
    return this.ray.ray.intersectPlane(this.floor, hit)
  }

  /** 바닥 클릭 → plan 좌표. 화면상 SNAP_PX 안의 가장 가까운 도면 꼭짓점에 붙임 (demo pickGround) */
  private pickPlan(ev: MouseEvent): GroundPick | null {
    const plan = this.plan
    if (!plan) return null
    const hit = this.hitGround(ev)
    if (!hit) return null
    this.root.updateMatrixWorld(true)
    this.camera.updateMatrixWorld()
    const rect = this.renderer.domElement.getBoundingClientRect()
    const mx = ev.clientX - rect.left, my = ev.clientY - rect.top
    const v = new THREE.Vector3()
    let best: Pt | null = null, bd = SNAP_PX * SNAP_PX
    for (const p of this.meshes?.verts ?? []) {
      const [lx, lz] = planToLocal(p[0], p[1], plan.bounds)
      v.set(lx, 0, lz).applyMatrix4(this.root.matrixWorld).project(this.camera)
      if (v.z > 1) continue
      const sx = ((v.x + 1) / 2) * rect.width, sy = ((1 - v.y) / 2) * rect.height
      const d = (sx - mx) ** 2 + (sy - my) ** 2
      if (d < bd) {
        bd = d
        best = p
      }
    }
    if (best) return { x: best[0], y: best[1] }
    const loc = this.root.worldToLocal(hit.clone())
    const [x, y] = localToPlan(loc.x, loc.z, plan.bounds)
    return { x, y }
  }

  private onPointerDown = (ev: PointerEvent) => {
    this.downAt = ev.button === 0 ? { x: ev.clientX, y: ev.clientY } : null
  }

  private onClick = (ev: MouseEvent) => {
    const d = this.downAt
    this.downAt = null
    if (!this.onPick || !isPickClick(d, ev)) return
    const p = this.pickPlan(ev)
    if (p) this.onPick(p)
  }

  private onDblClick = (ev: MouseEvent) => {
    if (!this.plan) return
    const hit = this.hitGround(ev)
    if (hit) this.nav.focusOn(hit, this.camera.position.distanceTo(this.controls.target) * 0.35)
  }
}
