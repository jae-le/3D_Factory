import * as THREE from 'three'

export interface Textures { concrete: THREE.Texture; panel: THREE.Texture }

type Draw = (c: CanvasRenderingContext2D, w: number, h: number) => void

/** 캔버스에 그린 반복 텍스처 (demo canvasTex) */
function canvasTex(w: number, h: number, draw: Draw, repeat = true): THREE.Texture {
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const ctx = cv.getContext('2d')
  if (ctx) draw(ctx, w, h)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

/** 고정 시드 난수 (LCG) — 매번 같은 무늬 */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
}

/** 절차적 텍스처 (콘크리트 바닥 · 골강판). canvas 가 필요해 브라우저 전용 */
export function createTextures(): Textures {
  const concrete = canvasTex(512, 512, (c, w, h) => {
    // 4m 타일: 얼룩 + 줄눈
    c.fillStyle = '#b9bcbf'
    c.fillRect(0, 0, w, h)
    const r = rng(7)
    for (let i = 0; i < 260; i++) {
      c.fillStyle = `rgba(${r() < 0.5 ? '90,92,96' : '230,232,235'},${0.03 + r() * 0.05})`
      c.beginPath()
      c.arc(r() * w, r() * h, 6 + r() * 40, 0, 7)
      c.fill()
    }
    for (let i = 0; i < 9000; i++) {
      c.fillStyle = `rgba(0,0,0,${r() * 0.06})`
      c.fillRect(r() * w, r() * h, 1, 1)
    }
    c.strokeStyle = 'rgba(70,72,76,.35)'
    c.lineWidth = 2
    c.strokeRect(1, 1, w - 2, h - 2)
  })
  const panel = canvasTex(256, 64, (c, w, h) => {
    // 1m 폭 골강판: 세로 골 4개
    const g = c.createLinearGradient(0, 0, w / 4, 0)
    g.addColorStop(0, '#c9cdd2')
    g.addColorStop(0.45, '#eef0f2')
    g.addColorStop(0.55, '#dfe2e6')
    g.addColorStop(1, '#b6bbc1')
    for (let i = 0; i < 4; i++) {
      c.save()
      c.translate((i * w) / 4, 0)
      c.fillStyle = g
      c.fillRect(0, 0, w / 4, h)
      c.restore()
    }
  })
  return { concrete, panel }
}
