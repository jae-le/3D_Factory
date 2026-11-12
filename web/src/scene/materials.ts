import * as THREE from 'three'
import type { Textures } from './textures'

export const ENV_I = 0.4 // 환경맵 반사 세기 (너무 크면 그림자가 묻힘)

export interface Materials {
  ground3d: THREE.MeshStandardMaterial
  groundPlan: THREE.MeshStandardMaterial
  panel: THREE.MeshStandardMaterial
  drywall: THREE.MeshStandardMaterial
  plinth: THREE.MeshStandardMaterial
  steel: THREE.MeshStandardMaterial
}

/** 공유 재질 (demo MAT 의 도면 부분). tex 가 없으면(테스트) 색만 */
export function createMaterials(tex?: Textures): Materials {
  const m: Materials = {
    ground3d: new THREE.MeshStandardMaterial({ map: tex?.concrete ?? null, color: tex ? 0xffffff : 0xb9bcbf, roughness: 0.85, metalness: 0 }),
    groundPlan: new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 1 }),
    panel: new THREE.MeshStandardMaterial({ map: tex?.panel ?? null, color: tex ? 0xffffff : 0xdfe2e6, roughness: 0.55, metalness: 0.35 }),
    drywall: new THREE.MeshStandardMaterial({ color: 0xeceef0, roughness: 0.9 }),
    plinth: new THREE.MeshStandardMaterial({ color: 0x8e9399, roughness: 0.95 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x5b6573, roughness: 0.45, metalness: 0.6 }),
  }
  for (const x of Object.values(m)) {
    x.envMapIntensity = ENV_I
    x.userData.keep = true
  }
  return m
}
