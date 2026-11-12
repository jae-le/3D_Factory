import * as THREE from 'three'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { STLLoader } from 'three/addons/loaders/STLLoader.js'

export const MODEL_EXTS = ['glb', 'gltf', 'fbx', 'obj', 'stl'] as const
export type ModelExt = (typeof MODEL_EXTS)[number]

export function extOf(name: string): ModelExt | null {
  const e = name.split('.').pop()?.toLowerCase() ?? ''
  return (MODEL_EXTS as readonly string[]).includes(e) ? (e as ModelExt) : null
}

const bytesOf = (file: File): Promise<ArrayBuffer> =>
  typeof file.arrayBuffer === 'function' ? file.arrayBuffer() : new Response(file).arrayBuffer()
const textOf = async (file: File) => new TextDecoder().decode(await bytesOf(file))
const baseName = (url: string) => decodeURIComponent(url.split(/[?#]/)[0]).split(/[\\/]/).pop() ?? url

/** 주 파일 = 첫 번째 지원 확장자. gltf 의 .bin·텍스처는 나머지 파일에서 찾아 쓴다 */
export async function loadModelFiles(files: File[]): Promise<{ object: THREE.Object3D; ext: ModelExt; name: string }> {
  const main = files.find((f) => extOf(f.name))
  if (!main) throw new Error('glb, gltf, fbx, obj, stl 파일만 올릴 수 있습니다.')
  const ext = extOf(main.name) as ModelExt
  const name = main.name.replace(/\.[^.]+$/, '')
  const urls: string[] = []
  try {
    let object: THREE.Object3D
    if (ext === 'glb') {
      object = (await new GLTFLoader().parseAsync(await bytesOf(main), '')).scene
    } else if (ext === 'gltf') {
      const others = new Map(files.filter((f) => f !== main).map((f) => [f.name, f]))
      const manager = new THREE.LoadingManager()
      manager.setURLModifier((url) => {
        const f = others.get(baseName(url))
        if (!f) return url
        const u = URL.createObjectURL(f)
        urls.push(u)
        return u
      })
      object = (await new GLTFLoader(manager).parseAsync(await textOf(main), '')).scene
    } else if (ext === 'fbx') {
      object = new FBXLoader().parse(await bytesOf(main), '')
    } else if (ext === 'obj') {
      object = new OBJLoader().parse(await textOf(main))
    } else {
      const geometry = new STLLoader().parse(await bytesOf(main))
      object = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xb8bec6, roughness: 0.6 }))
    }
    return { object, ext, name }
  } finally {
    urls.forEach((u) => URL.revokeObjectURL(u))
  }
}
