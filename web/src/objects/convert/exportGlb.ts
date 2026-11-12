import type * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'

export async function exportGlb(o: THREE.Object3D): Promise<Blob> {
  const buf = (await new GLTFExporter().parseAsync(o, { binary: true })) as ArrayBuffer
  return new Blob([buf], { type: 'model/gltf-binary' })
}
