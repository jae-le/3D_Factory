import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { BUILTIN } from './catalog'
import { makeEquipMesh } from './equipMesh'

/** 굽기 전용 페이지: window.bake(key) → glb·png(base64)·크기. scripts/bake-models.mjs 가 Playwright 로 부름 */
const toB64 = (buf: ArrayBuffer) => {
  let s = ''
  const b = new Uint8Array(buf)
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return btoa(s)
}

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
renderer.setSize(240, 180)
renderer.toneMapping = THREE.ACESFilmicToneMapping
document.body.appendChild(renderer.domElement)
const env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture

async function bake(key: string) {
  const g = makeEquipMesh(key)
  const box = new THREE.Box3().setFromObject(g)
  const size = box.getSize(new THREE.Vector3())
  const glb = (await new GLTFExporter().parseAsync(g, { binary: true })) as ArrayBuffer
  // 썸네일 (demo renderThumbs 와 같은 구도)
  const scene = new THREE.Scene()
  scene.environment = env
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f96, 0.6))
  const sun = new THREE.DirectionalLight(0xffffff, 2.6)
  sun.position.set(5, 10, 7)
  scene.add(sun)
  g.rotation.y = -0.6
  scene.add(g)
  const c = new THREE.Box3().setFromObject(g).getCenter(new THREE.Vector3())
  const dist = Math.max(size.x, size.y * 1.25, size.z) * 1.55 + 0.25
  const cam = new THREE.PerspectiveCamera(35, 240 / 180, 0.01, 1000)
  cam.position.copy(c).add(new THREE.Vector3(0.75, 0.5, 0.9).multiplyScalar(dist))
  cam.lookAt(c)
  renderer.render(scene, cam)
  const png = renderer.domElement.toDataURL('image/png').split(',')[1]
  return { glb: toB64(glb), png, size: [size.x, size.z, size.y].map((v) => Math.round(v * 1000) / 1000) }
}

Object.assign(window, { bake, BUILTIN })
