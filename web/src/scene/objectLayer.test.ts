import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { ObjectLayer, type SceneObject } from './objectLayer'

const box = async () => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial())
const obj = (id: number, over: Partial<SceneObject> = {}): SceneObject => ({ id, name: `a${id}`, url: null, sizeX: 4, sizeY: 2, sizeZ: 3, x: 5, y: 5, rot: 0, ...over })

describe('ObjectLayer (형상만)', () => {
  it('배치 위치·회전 (plan → 로컬), 차이만 반영', () => {
    const root = new THREE.Group()
    const layer = new ObjectLayer(root, box)
    layer.setBounds({ w: 10, h: 10 })
    layer.setObjects([obj(1), obj(2, { x: 1, y: 9, rot: 90 })])
    const g = root.children.filter((c) => c.userData.placementId != null)
    expect(g).toHaveLength(2)
    const b = g.find((c) => c.userData.placementId === 2)!
    expect(b.position.x).toBeCloseTo(-4)
    expect(b.position.z).toBeCloseTo(-4)
    expect(b.rotation.y).toBeCloseTo(Math.PI / 2)
    const first = g.find((c) => c.userData.placementId === 1)!
    layer.setObjects([obj(1)])
    expect(root.children.filter((c) => c.userData.placementId != null)).toHaveLength(1)
    expect(root.children.find((c) => c.userData.placementId === 1)).toBe(first) // 같은 것은 다시 만들지 않음
  })

  it('광선 선택', () => {
    const root = new THREE.Group()
    const layer = new ObjectLayer(root, box)
    layer.setBounds({ w: 10, h: 10 })
    layer.setObjects([obj(1)])
    root.updateMatrixWorld(true)
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 50, 0), new THREE.Vector3(0, -1, 0))
    expect(layer.pick(ray)).toBe(1)
    ray.set(new THREE.Vector3(4.5, 50, 4.5), new THREE.Vector3(0, -1, 0))
    expect(layer.pick(ray)).toBeNull()
  })

  it('배치 미리보기: 격자 붙기·회전', () => {
    const root = new THREE.Group()
    const layer = new ObjectLayer(root, box)
    layer.setBounds({ w: 100, h: 100 })
    layer.setGhost({ url: null, sizeX: 4, sizeY: 2, sizeZ: 1 })
    expect(layer.moveGhost(5.3, 5.6, true)).toEqual({ x: 5, y: 6 })
    expect(layer.moveGhost(5.3, 5.6, false)).toEqual({ x: 5.3, y: 5.6 })
    expect(layer.rotateGhost()).toBe(90)
    layer.setGhost(null)
  })

  it('편집 격자: 겹친 칸 수만큼 빨강', () => {
    const root = new THREE.Group()
    const layer = new ObjectLayer(root, box)
    layer.setBounds({ w: 100, h: 100 })
    layer.setObjects([obj(1, { x: 2, y: 1 }), obj(2, { x: 4, y: 1, sizeX: 2 })])
    layer.setEditing(1)
    expect(layer.editStats()).toEqual({ cells: 8, hits: 2 })
    layer.setEditing(null)
    expect(layer.editStats()).toBeNull()
  })
})
