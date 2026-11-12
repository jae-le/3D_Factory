import * as THREE from 'three'

export type Unit = 'm' | 'cm' | 'mm'
export const UNIT_SCALE: Record<Unit, number> = { m: 1, cm: 0.01, mm: 0.001 }

export function guessUnit(size: { x: number; y: number; z: number }): Unit {
  const longest = Math.max(size.x, size.y, size.z)
  if (longest > 100) return 'mm'
  if (longest > 10) return 'cm'
  return 'm'
}

/** 단위 배율 → 앞방향(90° 단위) 회전 → 바닥 중심 원점. 입력은 건드리지 않고 복제본을 돌려준다 */
export function normalize(object: THREE.Object3D, unit: Unit, quarterTurns: number) {
  const group = new THREE.Group()
  const holder = new THREE.Group()
  holder.scale.setScalar(UNIT_SCALE[unit])
  holder.rotation.y = (quarterTurns * Math.PI) / 2
  holder.add(object.clone(true))
  group.add(holder)
  group.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(group)
  const c = box.getCenter(new THREE.Vector3())
  holder.position.set(-c.x, -box.min.y, -c.z)
  group.updateMatrixWorld(true)
  const s = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3())
  return { group, size: { sizeX: s.x, sizeY: s.z, sizeZ: s.y } }
}
