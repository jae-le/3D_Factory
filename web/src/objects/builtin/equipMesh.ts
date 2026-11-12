import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { box, cyl, loadMat, mat, palletMat, rbox } from './materials'

/* 기본 설비·자재 모델 (demo index.html mergeByMaterial · makeEquipMesh 이식).
 * 모델은 +X 가 길이(앞) 방향, 단위 m. 끝에서 바닥 중심 원점(bbox 아래면 y=0, x·z 중심 0)으로 맞춘다. */

type V3 = [number, number, number]

/** 같은 재질끼리 형상을 합쳐 그리기 호출 수를 줄임 (지그 하나가 수백 개 부품) */
function mergeByMaterial(g: THREE.Group) {
  g.updateMatrixWorld(true)
  const by = new Map<THREE.Material, THREE.BufferGeometry[]>()
  const out = new THREE.Group()
  g.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return
    const src = o.geometry as THREE.BufferGeometry
    const geo = src.index ? src.toNonIndexed() : src.clone()
    geo.applyMatrix4(o.matrixWorld)
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k)
    const m = o.material as THREE.Material
    if (!by.has(m)) by.set(m, [])
    by.get(m)!.push(geo)
    src.dispose()
  })
  for (const [m, geos] of by) {
    out.add(new THREE.Mesh(mergeGeometries(geos), m))
    geos.forEach((x) => x.dispose())
  }
  return out
}

/** 기본 모델 key → 메쉬 묶음 (선택 테두리 없음, 바닥 y=0, 앞 +X, m) */
export function makeEquipMesh(key: string): THREE.Group {
  const g = new THREE.Group()
  const cast = mat(0x4b5563, { roughness: 0.55, metalness: 0.45 }), castLt = mat(0x6b7280, { roughness: 0.5, metalness: 0.5 })
  const gold = mat(0xc89b3c, { roughness: 0.4, metalness: 0.65 }), steel = mat(0xb6bdc6, { roughness: 0.35, metalness: 0.75 })
  const blue = mat(0x2563eb, { roughness: 0.45, metalness: 0.3 }), yellow = mat(0xf5c518, { roughness: 0.45 })
  const grate = mat(0x8b949e, { roughness: 0.7, metalness: 0.4 }), slab = mat(0xc4c8cd, { roughness: 0.9 })
  const dark = mat(0x22262d, { roughness: 0.6 }), orange = mat(0xf97316, { roughness: 0.45 }), wood = palletMat()
  const add = <T extends THREE.Object3D>(o: T) => (g.add(o), o)
  const flat = (geo: THREE.BufferGeometry, m: THREE.Material, y: number) => {
    const o = new THREE.Mesh(geo, m)
    o.rotation.x = -Math.PI / 2
    o.position.y = y
    return add(o)
  }
  const lathe = (r0: number, r1: number, h: number, m: THREE.Material, y: number, seg = 64) => {   // 직사각 단면을 돌린 링 (안지름 r0, 바깥지름 r1, 높이 h)
    const pts = [[r0, 0], [r1, 0], [r1, h], [r0, h], [r0, 0]].map(([a, b]) => new THREE.Vector2(a, b))
    const o = new THREE.Mesh(new THREE.LatheGeometry(pts, seg), m)
    o.position.y = y
    return add(o)
  }
  const bar = (a: V3, b: V3, t: number, m: THREE.Material) => {   // 두 점(x,y,z) 사이 각재
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), L = A.distanceTo(B)
    const o = new THREE.Mesh(new THREE.BoxGeometry(t, L, t), m)
    o.position.copy(A).add(B).multiplyScalar(0.5)
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize())
    return add(o)
  }
  const rail = (x0: number, z0: number, x1: number, z1: number, y: number, m: THREE.Material = yellow) => {   // 난간: 기둥 + 손잡이 + 중간대
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 1.5))
    for (let i = 0; i <= n; i++) {
      const t = i / n
      add(box(0.05, 1.05, 0.05, m, x0 + (x1 - x0) * t, y + 0.52, z0 + (z1 - z0) * t))
    }
    for (const h of [1.05, 0.55]) bar([x0, y + h, z0], [x1, y + h, z1], 0.045, m)
  }
  const deck = (x: number, z: number, L: number, D: number, y: number, rails: string) => {   // 발판(그레이팅) + 테두리 보 + 바깥 난간
    add(box(L, 0.07, D, grate, x, y, z))
    for (const s of [-1, 1]) add(box(L, 0.18, 0.1, blue, x, y - 0.12, z + (s * D) / 2))
    const [x0, x1, z0, z1] = [x - L / 2, x + L / 2, z - D / 2, z + D / 2]
    if (rails.includes('n')) rail(x0, z0, x1, z0, y)
    if (rails.includes('s')) rail(x0, z1, x1, z1, y)
    if (rails.includes('w')) rail(x0, z0, x0, z1, y)
    if (rails.includes('e')) rail(x1, z0, x1, z1, y)
  }
  const stairs = (x: number, z: number, y: number, w = 0.9) => {   // x 에서 +X 방향으로 올라가는 계단 (바닥 → 높이 y)
    const n = Math.round(y / 0.22), run = 0.26
    for (let i = 0; i < n; i++) add(box(run, 0.05, w, grate, x + (i + 0.5) * run, ((i + 1) * y) / n, z))
    for (const s of [-1, 1]) {
      bar([x, 0, z + (s * w) / 2], [x + n * run, y, z + (s * w) / 2], 0.08, blue)
      bar([x, 1, z + (s * w) / 2], [x + n * run, y + 1, z + (s * w) / 2], 0.04, yellow)
    }
    return n * run
  }
  const tower = (x: number, z: number, h: number, s = 0.9) => {   // 격자 기둥: 모서리 4개 + 가로·대각 브레이싱
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) add(box(0.14, h, 0.14, blue, x + (dx * s) / 2, h / 2, z + (dz * s) / 2))
    for (let y = 1.2; y < h; y += 1.4) {
      for (const dz of [-1, 1]) {
        add(box(s, 0.08, 0.08, blue, x, y, z + (dz * s) / 2))
        bar([x - s / 2, y, z + (dz * s) / 2], [x + s / 2, Math.min(h, y + 1.4), z + (dz * s) / 2], 0.05, blue)
      }
      for (const dx of [-1, 1]) add(box(0.08, 0.08, s, blue, x + (dx * s) / 2, y, z))
    }
  }
  const casting = (L: number, H: number, D: number, y: number, x = 0) => {   // 베드플레이트 주물: 몸체 + 앞쪽 주축 하우징(테이퍼) + 뒤쪽 발전기 암 + 아래 요 플랜지
    add(rbox(L * 0.62, H, D, Math.min(0.3, H / 4), cast, x - L * 0.12, y, 0))
    const hs = new THREE.Mesh(new THREE.CylinderGeometry(H * 0.32, H * 0.5, L * 0.34, 28), castLt)
    hs.rotation.z = -Math.PI / 2
    hs.position.set(x + L * 0.33, y + H * 0.12, 0)
    add(hs)
    add(cyl(H * 0.42, 0.12, steel, x + L * 0.5, y + H * 0.12, 0, 'x', 28))
    for (const s of [-1, 1]) add(box(L * 0.3, H * 0.35, 0.28, cast, x - L * 0.5, y + H * 0.1, s * D * 0.36))
    lathe(D * 0.32, D * 0.42, 0.18, steel, y - H / 2 - 0.18)
  }
  const hubBody = (r: number, y: number) => {   // 허브: 구형 주물 + 블레이드 플랜지 3개(테두리·안쪽 구멍) + 앞쪽 콘 + 주축 플랜지
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 36, 24), gold)
    s.position.y = y
    s.scale.set(1.05, 0.95, 0.95)
    add(s)
    for (let k = 0; k < 3; k++) {
      const piv = new THREE.Group()
      piv.position.y = y
      piv.rotation.x = (k * Math.PI * 2) / 3
      g.add(piv)
      piv.add(cyl(r * 0.55, r * 0.3, gold, 0, r * 0.85, 0, 'y', 32))
      const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.5, 0.07, 8, 40), steel)
      rim.rotation.x = Math.PI / 2
      rim.position.y = r * 1.0
      piv.add(rim)
      const hole = new THREE.Mesh(new THREE.CircleGeometry(r * 0.38, 32), dark)
      hole.rotation.x = -Math.PI / 2
      hole.position.y = r * 1.005
      piv.add(hole)
    }
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.2, r * 0.48, r * 0.6, 28), gold)
    cone.rotation.z = -Math.PI / 2
    cone.position.set(r * 1.15, y, 0)
    add(cone)
    add(cyl(r * 0.6, 0.1, steel, -r * 0.98, y, 0, 'x', 32))
  }
  const bigJig = (S: number, levels: number) => {   // 조립 지그: 바닥판 + 중앙 받침 + 프레임 + 코너 타워 + U자 발판(1~2층) + 계단 + 상부 빔·호이스트
    const h = S / 2, th = levels === 2 ? 6.4 : 4.4
    add(box(S, 0.2, S, slab, 0, 0.1, 0))
    for (const z of [-1.4, 1.4]) add(box(S * 0.6, 0.6, 0.45, blue, 0, 0.5, z))
    for (const x of [-S * 0.22, S * 0.22]) add(box(0.45, 0.6, 3.2, blue, x, 0.5, 0))
    casting(S * 0.52, S * 0.17, S * 0.29, 0.8 + S * 0.085)
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) tower(x * (h - 0.6), z * (h - 0.6), th)
    for (const y of levels === 2 ? [2.4, 4.6] : [2.4]) {
      deck(0, -(h - 0.9), S - 2.4, 1.2, y, 'n')
      deck(0, h - 0.9, S - 2.4, 1.2, y, 's')
      deck(-(h - 0.9), 0, 1.2, S - 4.2, y, 'w')
      rail(-(h - 1.5), -(h - 1.5), h - 1.2, -(h - 1.5), y)   // 안쪽 난간
      rail(-(h - 1.5), h - 1.5, h - 1.2, h - 1.5, y)
    }
    const run = Math.round(2.4 / 0.22) * 0.26
    stairs(h - 0.1 - run, -(h - 0.9) - 1.2, 2.4)   // 발판 바깥쪽 계단
    if (levels === 2) stairs(-(h - 1.5), h - 0.9, 2.2)
    for (const z of [-(h - 0.6), h - 0.6]) add(box(S - 0.4, 0.45, 0.35, blue, 0, th + 0.2, z))   // 상부 빔
    add(box(0.5, 0.4, S - 1.2, yellow, S * 0.05, th + 0.3, 0))
    add(box(0.7, 0.5, 0.7, dark, S * 0.05, th + 0.05, 0))
  }

  if (key === 'jigMain') bigJig(11, 2)
  else if (key === 'jigSub') bigJig(7, 1)
  else if (key === 'jigHub') {
    add(box(7, 0.2, 7, slab, 0, 0.1, 0))
    lathe(0, 2.3, 0.45, blue, 0.2)
    lathe(1.2, 1.6, 0.6, steel, 0.65)
    hubBody(1.7, 2.75)
    flat(new THREE.RingGeometry(2.45, 3.3, 48), grate, 2.0)
    for (let k = 0; k < 16; k++) {
      const a = (k * Math.PI) / 8
      add(box(0.12, 2.0, 0.12, blue, Math.cos(a) * 3.2, 1.0, Math.sin(a) * 3.2))
    }
    for (let k = 0; k < 24; k++) {
      const a = (k * Math.PI) / 12
      add(box(0.05, 1.05, 0.05, yellow, Math.cos(a) * 3.28, 2.52, Math.sin(a) * 3.28))
    }
    const hr = new THREE.Mesh(new THREE.TorusGeometry(3.28, 0.035, 6, 64), yellow)
    hr.rotation.x = Math.PI / 2
    hr.position.y = 3.05
    add(hr)
  } else if (key === 'tensioner') {
    add(box(6.5, 0.2, 6.5, slab, 0, 0.1, 0))
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4
      add(box(0.45, 0.7, 0.45, blue, Math.cos(a) * 1.9, 0.55, Math.sin(a) * 1.9))
    }
    lathe(1.6, 2.2, 0.32, steel, 0.9)
    for (let k = 0; k < 32; k++) {
      const a = (k * Math.PI) / 16
      add(cyl(0.09, 0.42, orange, Math.cos(a) * 1.9, 1.43, Math.sin(a) * 1.9, 'y', 10))
    }
    add(box(1.4, 1.1, 0.9, blue, -2.4, 0.75, 2.4))   // 유압 펌프 유닛
    add(cyl(0.3, 0.8, dark, -2.4, 1.6, 2.4, 'y', 16))
    for (let k = 0; k < 3; k++) bar([-2.0, 0.9, 2.0 - k * 0.15], [-1.4 + k * 0.4, 1.3, 1.2 - k * 0.3], 0.05, dark)   // 호스
    add(box(0.9, 1.8, 0.5, dark, 2.5, 1.0, 2.5))
    add(box(0.55, 0.35, 0.02, new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 1 }), 2.5, 1.45, 2.24))
  } else if (key === 'frameTable') {
    add(box(6.6, 0.12, 4, steel, 0, 0.95, 0))
    for (let i = 0; i < 7; i++) add(box(0.06, 0.02, 4, dark, -3 + i, 1.02, 0))   // 정반 홈
    for (const x of [-3, -1, 1, 3]) for (const z of [-1.8, 1.8]) add(box(0.25, 0.9, 0.25, blue, x, 0.45, z))
    for (const z of [-1.8, 1.8]) add(box(6.4, 0.15, 0.2, blue, 0, 0.25, z))
    for (const [x, z] of [[-2.4, -1.5], [2.4, -1.5], [-2.4, 1.5], [2.4, 1.5]]) {   // 클램프
      add(box(0.4, 0.5, 0.3, orange, x, 1.25, z))
      add(box(0.08, 0.6, 0.08, dark, x, 1.65, z))
    }
    casting(4, 1.3, 2.3, 1.85, -0.2)
    add(box(0.5, 1.7, 2.2, dark, 3.6, 0.85, 0))
    add(box(0.52, 0.08, 2.1, orange, 3.6, 1.2, 0))
  } else if (key === 'hub') {
    for (const z of [-0.9, 0.9]) add(box(3.4, 0.3, 0.35, wood, 0, 0.15, z))
    for (const x of [-1.2, 1.2]) add(box(0.35, 0.25, 3.0, wood, x, 0.42, 0))
    hubBody(1.55, 2.05)
  } else if (key === 'ring') {
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2 + Math.PI / 4
      add(box(0.4, 0.25, 0.4, wood, Math.cos(a) * 1.45, 0.125, Math.sin(a) * 1.45))
    }
    lathe(1.25, 1.65, 0.32, steel, 0.25)
    lathe(1.38, 1.52, 0.02, dark, 0.57)
    for (let k = 0; k < 36; k++) {   // 볼트 구멍
      const a = (k * Math.PI) / 18
      add(cyl(0.035, 0.02, dark, Math.cos(a) * 1.45, 0.585, Math.sin(a) * 1.45, 'y', 6))
    }
  } else if (key === 'mainframe') {
    add(box(4.8, 0.22, 2.8, wood, 0, 0.11, 0))
    for (const x of [-1.8, 0, 1.8]) add(box(0.3, 0.3, 2.8, wood, x, 0.37, 0))
    casting(4.4, 1.5, 2.4, 1.45, -0.2)
  } else if (key === 'longmat') {   // 캔틸레버 랙: 가운데 기둥 3개 + 받침 다리 + 양쪽 3단 팔 + 빔
    for (const x of [-4.2, 0, 4.2]) {
      add(box(0.3, 3.4, 0.3, blue, x, 1.7, 0))
      add(box(0.25, 0.2, 2.6, blue, x, 0.1, 0))
      for (const y of [0.9, 1.9, 2.9])
        for (const s of [-1, 1]) {
          add(box(0.12, 0.14, 1.1, orange, x, y, s * 0.68))
          add(box(0.12, 0.12, 0.08, orange, x, y + 0.12, s * 1.2))
        }
    }
    for (const x of [-2.1, 2.1]) bar([x - 2.1, 0.4, 0], [x + 2.1, 3.2, 0], 0.08, blue)
    for (const y of [0.9, 1.9, 2.9]) for (const s of [-1, 1]) for (let c = 0; c < 3; c++) add(box(10, 0.22, 0.24, steel, 0, y + 0.18, s * (0.35 + c * 0.28)))
  } else if (key === 'fixture') {   // 치구 프레임: 받침판 + 레일 2줄 + 가로대 + 양 끝 블록 + 클램프
    add(box(7, 0.12, 1.2, steel, 0, 0.06, 0))
    for (const z of [-0.35, 0.35]) add(box(6.6, 0.25, 0.16, castLt, 0, 0.25, z))
    for (const x of [-2.4, -0.8, 0.8, 2.4]) add(box(0.14, 0.18, 0.86, castLt, x, 0.34, 0))
    for (const x of [-3.2, 3.2]) add(box(0.5, 0.7, 1.0, cast, x, 0.47, 0))
    for (const x of [-1.6, 0, 1.6]) {
      add(box(0.3, 0.45, 0.3, orange, x, 0.55, 0))
      add(cyl(0.06, 0.4, dark, x, 0.95, 0, 'y', 8))
    }
  } else if (key === 'pallet') {   // 부품 팔레트
    const load = loadMat()
    add(box(1.2, 0.15, 1, wood, 0, 0.075, 0))
    add(box(0.55, 0.45, 0.45, load, -0.28, 0.375, -0.24))
    add(box(0.55, 0.45, 0.45, load, 0.28, 0.375, -0.24))
    add(box(0.55, 0.4, 0.45, load, -0.28, 0.35, 0.24))
    add(box(0.5, 0.35, 0.4, load, -0.28, 0.75, -0.24))
  } else throw new Error(`모르는 기본 모델 ${key}`)

  const m = mergeByMaterial(g)
  // 바닥 중심 원점으로 맞춤 (demo 형상은 계단·주축 등으로 x·z 가 조금 치우침)
  const bb = new THREE.Box3().setFromObject(m)
  const c = bb.getCenter(new THREE.Vector3())
  m.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return
    const geo = o.geometry as THREE.BufferGeometry
    geo.translate(-c.x, -bb.min.y, -c.z)
    o.castShadow = o.receiveShadow = true
  })
  return m
}
