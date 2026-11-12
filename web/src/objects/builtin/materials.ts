import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

/** 기본 모델 재질·형상 도우미 (demo index.html 의 mat·box·rbox·cyl·TEX.box·MAT.pallet·MAT.load 이식) */
export const ENV_I = 0.25   // 환경맵 반사 세기 (P2 최종값)

export const mat = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.15, envMapIntensity: ENV_I, ...extra })

export function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
  o.position.set(x, y, z)
  return o
}

export function rbox(w: number, h: number, d: number, r: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), m)
  o.position.set(x, y, z)
  return o
}

export function cyl(r: number, h: number, m: THREE.Material, x: number, y: number, z: number, axis: 'x' | 'y' | 'z' = 'y', seg = 16) {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m)
  o.position.set(x, y, z)
  if (axis === 'z') o.rotation.x = Math.PI / 2
  else if (axis === 'x') o.rotation.z = Math.PI / 2
  return o
}

function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
}

let boxTex: THREE.CanvasTexture | null = null
/** 크라프트 박스 + 테이프 (128px 캔버스, 처음 쓸 때 만들고 재사용) */
export function boxTexture() {
  if (boxTex) return boxTex
  const cv = document.createElement('canvas')
  cv.width = cv.height = 128
  const c = cv.getContext('2d')!
  const w = 128, h = 128
  c.fillStyle = '#c49a64'
  c.fillRect(0, 0, w, h)
  const r = rng(3)
  for (let i = 0; i < 1500; i++) {
    c.fillStyle = `rgba(80,50,20,${r() * 0.08})`
    c.fillRect(r() * w, r() * h, 2, 1)
  }
  c.fillStyle = 'rgba(200,170,120,.9)'
  c.fillRect(w * 0.42, 0, w * 0.16, h)
  c.strokeStyle = 'rgba(90,60,30,.4)'
  c.lineWidth = 3
  c.strokeRect(1, 1, w - 2, h - 2)
  boxTex = new THREE.CanvasTexture(cv)
  boxTex.colorSpace = THREE.SRGBColorSpace
  boxTex.anisotropy = 8
  return boxTex
}

let pallet: THREE.MeshStandardMaterial | null = null
let load: THREE.MeshStandardMaterial | null = null
/** 팔레트·받침목 나무 */
export const palletMat = () => (pallet ??= new THREE.MeshStandardMaterial({ color: 0xb8915e, roughness: 0.95, envMapIntensity: ENV_I }))
/** 박스 짐 */
export const loadMat = () => (load ??= new THREE.MeshStandardMaterial({ map: boxTexture(), roughness: 0.85, envMapIntensity: ENV_I }))
