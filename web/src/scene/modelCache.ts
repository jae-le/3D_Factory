import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

/** glb 는 envMapIntensity 를 담지 않음 — 실내 환경맵이 너무 밝지 않게 (demo 재질과 같은 값) */
const ENV_INTENSITY = 0.25

const pending = new Map<string, Promise<THREE.Object3D>>()
const loaded = new Map<string, THREE.Object3D>()
let loader: GLTFLoader | null = null
let gen = 0 // disposeCache 이후 늦게 끝난 로드는 캐시에 넣지 않음

/** url 의 glb 를 한 번만 받아 scene 을 돌려줌 (실패하면 캐시에서 지워 다시 시도 가능) */
export function loadModel(url: string): Promise<THREE.Object3D> {
  const hit = pending.get(url)
  if (hit) return hit
  const g = gen
  loader ??= new GLTFLoader()
  const p = loader.loadAsync(url).then(
    (gltf) => {
      const s = gltf.scene
      s.traverse((o) => {
        for (const m of matsOf(o)) if ('envMapIntensity' in m) (m as THREE.MeshStandardMaterial).envMapIntensity = ENV_INTENSITY
      })
      if (g === gen) loaded.set(url, s)
      return s
    },
    (e: unknown) => {
      if (pending.get(url) === p) pending.delete(url)
      throw e
    },
  )
  pending.set(url, p)
  return p
}

/** 형상·재질은 원본과 공유하는 복제 */
export function instance(src: THREE.Object3D): THREE.Object3D {
  return src.clone(true)
}

/** 캐시한 모델의 형상·재질·텍스처 해제 */
export function disposeCache(): void {
  gen++
  for (const s of loaded.values())
    s.traverse((o) => {
      const geo = (o as THREE.Mesh).geometry
      geo?.dispose()
      for (const m of matsOf(o)) {
        for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose()
        m.dispose()
      }
    })
  loaded.clear()
  pending.clear()
}

function matsOf(o: THREE.Object3D): THREE.Material[] {
  const m = (o as THREE.Mesh).material
  return m ? ([] as THREE.Material[]).concat(m) : []
}
