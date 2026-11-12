import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

/** 240×180 png — builtin/bakePage.ts 와 같은 구도 */
export async function captureThumbnail(o: THREE.Object3D): Promise<Blob> {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  const pmrem = new THREE.PMREMGenerator(renderer)
  try {
    renderer.setSize(240, 180)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    const scene = new THREE.Scene()
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f96, 0.6))
    const sun = new THREE.DirectionalLight(0xffffff, 2.6)
    sun.position.set(5, 10, 7)
    scene.add(sun)
    const holder = new THREE.Group()
    holder.rotation.y = -0.6
    holder.add(o.clone(true))
    scene.add(holder)
    holder.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(holder)
    const size = box.getSize(new THREE.Vector3())
    const c = box.getCenter(new THREE.Vector3())
    const dist = Math.max(size.x, size.y * 1.25, size.z) * 1.55 + 0.25
    const cam = new THREE.PerspectiveCamera(35, 240 / 180, 0.01, 1000)
    cam.position.copy(c).add(new THREE.Vector3(0.75, 0.5, 0.9).multiplyScalar(dist))
    cam.lookAt(c)
    renderer.render(scene, cam)
    return await new Promise<Blob>((resolve, reject) =>
      renderer.domElement.toBlob((b) => (b ? resolve(b) : reject(new Error('썸네일을 만들지 못했습니다.'))), 'image/png'),
    )
  } finally {
    pmrem.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
  }
}
