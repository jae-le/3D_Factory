import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { extOf, MODEL_EXTS } from './load'
import { guessUnit, normalize } from './normalize'

describe('모델 정규화', () => {
  it('확장자', () => {
    expect(MODEL_EXTS).toContain('stl')
    expect(extOf('a.FBX')).toBe('fbx')
    expect(extOf('a.dwg')).toBeNull()
  })
  it('단위 추정', () => {
    expect(guessUnit({ x: 4000, y: 2000, z: 3000 })).toBe('mm')
    expect(guessUnit({ x: 40, y: 20, z: 3 })).toBe('cm')
    expect(guessUnit({ x: 4, y: 2, z: 3 })).toBe('m')
  })
  it('배율·바닥 중심·앞방향 회전, 크기(sizeX=x, sizeY=z, sizeZ=높이)', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(4000, 3000, 2000))
    mesh.position.set(10000, 5000, -3000)
    const { group, size } = normalize(mesh, 'mm', 0)
    expect(size.sizeX).toBeCloseTo(4)
    expect(size.sizeY).toBeCloseTo(2)
    expect(size.sizeZ).toBeCloseTo(3)
    const b = new THREE.Box3().setFromObject(group)
    expect(b.min.y).toBeCloseTo(0)
    expect((b.min.x + b.max.x) / 2).toBeCloseTo(0)
    expect((b.min.z + b.max.z) / 2).toBeCloseTo(0)
    const turned = normalize(new THREE.Mesh(new THREE.BoxGeometry(4, 3, 2)), 'm', 1)
    expect(turned.size.sizeX).toBeCloseTo(2)
    expect(turned.size.sizeY).toBeCloseTo(4)
  })
})
