import * as THREE from 'three'
import type { Plan, Pt, WallSeg } from '../drawing/plan/types'
import { planToLocal } from './coords'
import { textMesh, zoneLabel, type ZoneLabel } from './labels'
import type { Materials } from './materials'

export interface PlanMeshes {
  group: THREE.Group
  lineMats: THREE.LineBasicMaterial[]
  labelMats: THREE.MeshBasicMaterial[]
  /** 구역 이름 표 (보기 모드에 따라 FactoryScene 이 글자 텍스처를 바꿈) */
  zoneLabels: ZoneLabel[]
  verts: Pt[]
}

/** 바닥 장식 높이 (z-fighting 방지): 구역 면 < 구역 테두리 < 선 < 글자 */
export const DECAL_Y = { zone: 0.02, zoneEdge: 0.025, line: 0.03, label: 0.04 }

/** plan → 3D (로컬 좌표: 도면 가운데 원점, XZ 평면, m). 회전·반전은 FactoryScene 의 root 가 맡음 */
export function planToMeshes(plan: Plan, mats: Materials, opts: { labels: boolean }): PlanMeshes {
  const b = plan.bounds
  const L = (x: number, y: number) => planToLocal(x, y, b)
  const group = new THREE.Group()
  const lines = named('lines'), labels = named('labels'), zones = named('zones'), solids = named('solids')
  group.add(zones, lines, labels, solids)
  const lineMats: THREE.LineBasicMaterial[] = [], labelMats: THREE.MeshBasicMaterial[] = []
  const verts: Pt[] = []
  const layer = new Map(plan.layers.map((l) => [l.name, l]))
  const c = new THREE.Color()

  // 바닥 선 그림: 레이어마다 LineSegments 하나 (정점색)
  const byLayer = new Map<string, typeof plan.lines>()
  for (const ln of plan.lines) {
    let a = byLayer.get(ln.layer)
    if (!a) byLayer.set(ln.layer, (a = []))
    a.push(ln)
  }
  for (const [name, list] of byLayer) {
    const pos: number[] = [], col: number[] = []
    const visible = layer.get(name)?.visible ?? true
    for (const ln of list) {
      c.set(ln.color ?? layer.get(name)?.color ?? '#ffffff')
      const pts = ln.closed ? [...ln.pts, ln.pts[0]] : ln.pts
      if (visible) for (const p of ln.pts) verts.push(p) // 스냅은 보이는 레이어만 (demo collectSnapVerts)
      for (let j = 0; j + 1 < pts.length; j++) {
        const [ax, az] = L(...pts[j]), [bx, bz] = L(...pts[j + 1])
        pos.push(ax, DECAL_Y.line, az, bx, DECAL_Y.line, bz)
        col.push(c.r, c.g, c.b, c.r, c.g, c.b)
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 1 })
    lineMats.push(mat)
    const seg = new THREE.LineSegments(geo, mat)
    seg.name = name
    seg.visible = visible
    lines.add(seg)
  }

  // 글자 (브라우저에서만)
  if (opts.labels)
    for (const t of plan.texts) {
      if (layer.get(t.layer)?.visible === false) continue
      const m = textMesh(t, t.color ?? layer.get(t.layer)?.color ?? '#ffffff', b)
      if (m) {
        labelMats.push(m.material as THREE.MeshBasicMaterial)
        labels.add(m)
      }
    }

  // 구역: 반투명 바닥 면 + 테두리 + 이름 표 (톤매핑 제외 — 원색 유지)
  const zoneLabels: ZoneLabel[] = []
  for (const z of plan.zones) {
    const shape = new THREE.Shape(z.poly.map(([x, y]) => new THREE.Vector2(x - b.w / 2, y - b.h / 2)))
    const geo = new THREE.ShapeGeometry(shape)
    geo.rotateX(-Math.PI / 2)
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: z.color, transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }))
    mesh.position.y = DECAL_Y.zone
    mesh.userData = { kind: 'zone', id: z.id, name: z.name }
    zones.add(mesh)
    const edge = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(z.poly.map(([x, y]) => new THREE.Vector3(...xz(L(x, y))))),
      new THREE.LineBasicMaterial({ color: z.color, transparent: true, opacity: 0.9, toneMapped: false }),
    )
    edge.userData = { kind: 'zoneEdge', id: z.id }
    zones.add(edge)
    const lab = opts.labels && z.name.trim() ? zoneLabel(z.name.trim()) : null
    if (lab) {
      const [cx, cy] = centroid(z.poly)
      const [lx, lz] = L(cx, cy)
      lab.sprite.position.set(lx, 1.5, lz)
      lab.sprite.userData = { kind: 'zoneLabel', id: z.id }
      zones.add(lab.sprite)
      zoneLabels.push(lab)
    }
  }

  // 외벽·가벽: 선분마다 상자. 높이 > 4m 는 골강판 + 걸레받이(1.2m), 낮은 벽은 석고 (demo rebuildSolids 의 wall 분기)
  const wallSeg = (w: WallSeg, kind: 'wall' | 'partition') => {
    const inner = w.h <= 4
    for (let j = 0; j + 1 < w.pts.length; j++) {
      const [ax, az] = L(...w.pts[j]), [bx, bz] = L(...w.pts[j + 1])
      const len = Math.hypot(bx - ax, bz - az)
      if (len < 0.05) continue
      const ang = -Math.atan2(bz - az, bx - ax), cx = (ax + bx) / 2, cz = (az + bz) / 2
      const geo = new THREE.BoxGeometry(len, w.h, w.t)
      if (!inner) {
        const uv = geo.attributes.uv
        for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) * len) // 골 간격 1m 유지
      }
      const m = new THREE.Mesh(geo, inner ? mats.drywall : mats.panel)
      m.position.set(cx, w.h / 2, cz)
      m.rotation.y = ang
      m.userData = { kind, id: w.id }
      solids.add(m)
      if (!inner) {
        const base = new THREE.Mesh(new THREE.BoxGeometry(len, 1.2, w.t + 0.06), mats.plinth)
        base.position.set(cx, 0.6, cz)
        base.rotation.y = ang
        base.userData = { kind: 'plinth', id: w.id }
        solids.add(base)
      }
    }
  }
  plan.walls.forEach((w) => wallSeg(w, 'wall'))
  plan.partitions.forEach((w) => wallSeg(w, 'partition'))

  // 기둥: H빔 (플랜지 2 + 웨브 + 베이스 플레이트) — demo hbeam 분기
  for (const col of plan.columns) {
    const g = new THREE.Group()
    const tf = Math.max(0.02, col.d * 0.08), tw = Math.max(0.015, col.w * 0.06)
    const add = (x: number, y: number, z: number, sx: number, sy: number, sz: number, mat: THREE.Material) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat)
      m.position.set(x, y, z)
      g.add(m)
    }
    add(0, col.h / 2, -col.d / 2 + tf / 2, col.w, col.h, tf, mats.steel)
    add(0, col.h / 2, col.d / 2 - tf / 2, col.w, col.h, tf, mats.steel)
    add(0, col.h / 2, 0, tw, col.h, col.d, mats.steel)
    add(0, 0.02, 0, col.w * 1.5, 0.04, col.d * 1.5, mats.plinth)
    const [x, z] = L(col.x, col.y)
    g.position.set(x, 0, z)
    g.userData = { kind: 'column', id: col.id }
    solids.add(g)
  }

  solids.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true
      o.receiveShadow = true
    }
  })
  return { group, lineMats, labelMats, zoneLabels, verts }
}

const xz = ([x, z]: [number, number]): [number, number, number] => [x, DECAL_Y.zoneEdge, z]

/** 다각형 무게중심 (넓이 0 이면 꼭짓점 평균) */
export function centroid(poly: Pt[]): Pt {
  let a = 0, cx = 0, cy = 0
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length]
    const k = x0 * y1 - x1 * y0
    a += k
    cx += (x0 + x1) * k
    cy += (y0 + y1) * k
  }
  if (Math.abs(a) < 1e-9) {
    const n = poly.length || 1
    return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n]
  }
  return [cx / (3 * a), cy / (3 * a)]
}

function named(name: string) {
  const g = new THREE.Group()
  g.name = name
  return g
}
