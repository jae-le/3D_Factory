import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import * as THREE from 'three'
import { Modal } from '../components/Modal'
import { createModel, replaceModelFile } from './api'
import { exportGlb } from './convert/exportGlb'
import { extOf, loadModelFiles, type ModelExt } from './convert/load'
import { guessUnit, normalize, type Unit } from './convert/normalize'
import { captureThumbnail } from './convert/thumbnail'
import { CATEGORY_LABEL, type Category, type ModelInfo } from './types'

export interface ConvertDeps { load: typeof loadModelFiles; exportGlb: typeof exportGlb; thumbnail: typeof captureThumbnail }
const REAL: ConvertDeps = { load: loadModelFiles, exportGlb, thumbnail: captureThumbnail }
const MAX_BYTES = 100 * 1024 * 1024
const CATEGORIES = Object.keys(CATEGORY_LABEL) as Category[]
const UNITS: Unit[] = ['m', 'cm', 'mm']

type Loaded = { object: THREE.Object3D; ext: ModelExt; guessed: Unit }

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'))
  } catch {
    return false
  }
}

/** 작은 three 캔버스에 천천히 돌리며 보여줌 — WebGL 이 없으면 안내 문구 */
function Preview({ group }: { group: THREE.Object3D }) {
  const host = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(() => !hasWebGL())
  useEffect(() => {
    if (failed) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      queueMicrotask(() => setFailed(true))
      return
    }
    renderer.setSize(320, 200)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    host.current?.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f96, 1.4))
    const sun = new THREE.DirectionalLight(0xffffff, 2.2)
    sun.position.set(5, 10, 7)
    scene.add(sun)
    const spin = new THREE.Group()
    spin.add(group)
    scene.add(spin)
    const box = new THREE.Box3().setFromObject(group)
    const size = box.getSize(new THREE.Vector3())
    const c = box.getCenter(new THREE.Vector3())
    const dist = Math.max(size.x, size.y * 1.25, size.z) * 1.55 + 0.25
    const cam = new THREE.PerspectiveCamera(35, 320 / 200, 0.01, 1000)
    cam.position.copy(c).add(new THREE.Vector3(0.75, 0.5, 0.9).multiplyScalar(dist))
    cam.lookAt(c)
    let raf = 0
    const tick = () => {
      spin.rotation.y += 0.008
      renderer.render(scene, cam)
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => {
      cancelAnimationFrame(raf)
      spin.remove(group)
      renderer.domElement.remove()
      renderer.dispose()
      renderer.forceContextLoss()
    }
  }, [group, failed])
  return (
    <div ref={host} className="kp-desc" style={{ width: 320, height: 200 }}>
      {failed && <p>미리보기를 표시할 수 없습니다</p>}
    </div>
  )
}

/** 객체 추가: 3D 파일 선택 → 브라우저에서 읽기·단위·앞방향 정리 → glb·썸네일로 변환해 등록 */
export function AddModelDialog({ onClose, onCreated, deps, mode }: { onClose: () => void; onCreated: (m: ModelInfo) => void; deps?: Partial<ConvertDeps>; mode?: { replace: ModelInfo } }) {
  const replace = mode?.replace
  const d = { ...REAL, ...deps }
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [unit, setUnit] = useState<Unit>('m')
  const [turns, setTurns] = useState(0)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<Category>('equip')
  const [aliases, setAliases] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const pickSeq = useRef(0)
  const choose = async (list: FileList | null) => {
    const seq = ++pickSeq.current
    setError(null)
    setLoaded(null)
    const files = Array.from(list ?? [])
    if (files.length === 0) return
    if (files.some((f) => f.size > MAX_BYTES)) return setError('파일이 너무 큽니다 (최대 100MB).')
    if (!files.some((f) => extOf(f.name))) return setError('glb, gltf, fbx, obj, stl 파일만 올릴 수 있습니다.')
    try {
      const r = await d.load(files)
      if (seq !== pickSeq.current) return
      const size = new THREE.Box3().setFromObject(r.object).getSize(new THREE.Vector3())
      const guessed = guessUnit(size)
      setLoaded({ object: r.object, ext: r.ext, guessed })
      setUnit(guessed)
      setTurns(0)
      setName(r.name)
    } catch (e) {
      if (seq === pickSeq.current) setError(`3D 파일을 읽지 못했습니다: ${(e as Error).message}`)
    }
  }

  const result = useMemo(() => (loaded ? normalize(loaded.object, unit, turns) : null), [loaded, unit, turns])
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!loaded || !result) return
    setBusy(true)
    setError(null)
    try {
      const glb = await d.exportGlb(result.group)
      const thumbnail = await d.thumbnail(result.group)
      const upload = { glb, thumbnail, sourceExt: loaded.ext, ...result.size }
      const m = replace
        ? await replaceModelFile(replace.id, upload)
        : await createModel({ ...upload, name: name.trim(), category, aliases: aliases.split(',').map((a) => a.trim()).filter(Boolean) })
      onCreated(m)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const f2 = (v: number) => v.toFixed(2)
  return (
    <Modal title={replace ? `파일 교체 - ${replace.name}` : '객체 추가'} onClose={onClose} wide>
      <form className="kp-form" onSubmit={submit}>
        <label className="kp-field">
          <span>3D 파일</span>
          <input type="file" multiple accept=".glb,.gltf,.bin,.fbx,.obj,.stl,.png,.jpg,.jpeg" onChange={(e) => void choose(e.target.files)} />
        </label>
        {loaded && result && (
          <>
            <Preview group={result.group} />
            <p className="kp-desc">{`가로 ${f2(result.size.sizeX)} × 세로 ${f2(result.size.sizeY)} × 높이 ${f2(result.size.sizeZ)} m`}</p>
            {loaded.guessed !== 'm' && <p className="kp-desc">{`단위를 ${loaded.guessed} 로 추정했습니다`}</p>}
            <label className="kp-field">
              <span>단위</span>
              <select className="kp-input" value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </label>
            <div>
              <button type="button" className="kp-btn kp-btn-stroke" onClick={() => setTurns((t) => (t + 1) % 4)}>90° 돌리기</button>
            </div>
            {!replace && (
              <>
            <label className="kp-field">
              <span>이름</span>
              <input className="kp-input" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="kp-field">
              <span>분류</span>
              <select className="kp-input" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
              </select>
            </label>
            <label className="kp-field">
              <span>별칭</span>
              <input className="kp-input" value={aliases} placeholder="쉼표로 구분" onChange={(e) => setAliases(e.target.value)} />
            </label>
              </>
            )}
          </>
        )}
        {error && <p className="kp-error-text">{error}</p>}
        <div className="kp-modal-actions">
          <button type="button" className="kp-btn kp-btn-stroke" onClick={onClose}>취소</button>
          <button type="submit" className="kp-btn kp-btn-primary" disabled={!loaded || (!replace && !name.trim()) || busy}>{replace ? '교체' : '등록'}</button>
        </div>
      </form>
    </Modal>
  )
}
