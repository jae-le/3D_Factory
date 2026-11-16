import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { PREVIEW_COLOR, PreviewLayer } from './previewLayer'

type BoxMesh = THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>
const meshes = (g: THREE.Group) => g.children.filter((o): o is BoxMesh => (o as THREE.Mesh).isMesh)

describe('PreviewLayer', () => {
  it('유령 상자 자리·크기·색, 옮김은 원래 자리 점선, 가벽은 두 점 사이', () => {
    const g = new THREE.Group()
    const layer = new PreviewLayer(g)
    layer.setBounds({ w: 10, h: 10 })
    layer.set({
      objects: [
        { seq: 1, kind: 'move', at: { x: 7, y: 5, rot: 90 }, from: { x: 5, y: 5, rot: 0 }, size: { sizeX: 4, sizeY: 2, sizeZ: 3 } },
        { seq: 2, kind: 'delete', at: { x: 1, y: 1, rot: 0 }, from: null, size: { sizeX: 2, sizeY: 2, sizeZ: 2 } },
      ],
      walls: [{ seq: 3, kind: 'add', a: [0, 9], b: [4, 9], h: 1.2, t: 0.5 }],
    })
    const [move, del, wall] = meshes(g)
    expect(move.position.x).toBeCloseTo(2)
    expect(move.position.z).toBeCloseTo(0)
    expect(move.position.y).toBeCloseTo(1.5)
    expect(move.rotation.y).toBeCloseTo(Math.PI / 2)
    expect(move.geometry.parameters).toMatchObject({ width: 4, height: 3, depth: 2 })
    expect(move.material.color.getHex()).toBe(PREVIEW_COLOR.move)
    expect(move.material.transparent).toBe(true)
    expect(del.material.color.getHex()).toBe(PREVIEW_COLOR.delete)
    expect(del.geometry.parameters.width).toBeCloseTo(2.12) // 삭제는 조금 크게 덮음
    expect(wall.material.color.getHex()).toBe(PREVIEW_COLOR.wallAdd)
    expect(wall.geometry.parameters).toMatchObject({ width: 4, height: 1.2, depth: 0.5 })
    expect(wall.position.x).toBeCloseTo(-3)
    expect(wall.position.z).toBeCloseTo(-4)
    const outline = g.children.find((o) => (o as THREE.Line).isLine) as THREE.Line
    expect(outline).toBeDefined()
    expect(outline.position.x).toBeCloseTo(0)
    expect((outline.material as THREE.LineDashedMaterial).isLineDashedMaterial).toBe(true)
  })

  it('강조하면 그 항목만 진하게, 비우면 모두 사라짐', () => {
    const g = new THREE.Group()
    const layer = new PreviewLayer(g)
    layer.setBounds({ w: 10, h: 10 })
    layer.set({
      objects: [
        { seq: 1, kind: 'add', at: { x: 1, y: 1, rot: 0 }, from: null, size: { sizeX: 1, sizeY: 1, sizeZ: 1 } },
        { seq: 2, kind: 'add', at: { x: 2, y: 2, rot: 0 }, from: null, size: { sizeX: 1, sizeY: 1, sizeZ: 1 } },
      ],
      walls: [],
    })
    layer.highlight(2)
    const [a, b] = meshes(g)
    expect(b.material.opacity).toBeGreaterThan(a.material.opacity)
    layer.highlight(null)
    expect(b.material.opacity).toBeCloseTo(a.material.opacity)
    layer.set(null)
    expect(g.children).toHaveLength(0)
    layer.set({ objects: [{ seq: 1, kind: 'add', at: { x: 1, y: 1, rot: 0 }, from: null, size: { sizeX: 1, sizeY: 1, sizeZ: 1 } }], walls: [] })
    layer.dispose()
    expect(g.children).toHaveLength(0)
  })
})
