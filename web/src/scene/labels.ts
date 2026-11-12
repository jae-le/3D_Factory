import * as THREE from 'three'
import type { PlanText } from '../drawing/plan/types'
import { planToLocal } from './coords'

const FONT = '"Pretendard Variable", "Malgun Gothic", sans-serif'

/** 여러 줄 글자를 캔버스 텍스처로 (demo canvasLabel). outline 이 있으면 굵은 테두리 글자. 2D 컨텍스트가 없으면 null */
function canvasLabel(str: string, colorCss: string, fs = 64, outline?: string) {
  const lines = String(str).split('\n'), pad = outline ? 6 : 4, font = `${outline ? '600 ' : ''}${fs}px ${FONT}`
  const cv = document.createElement('canvas')
  const ctx = cv.getContext('2d')
  if (!ctx) return null
  ctx.font = font
  const w = Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width))) + pad * 2
  const h = lines.length * fs * 1.2 + pad * 2
  cv.width = w
  cv.height = h
  ctx.font = font // 크기를 바꾸면 컨텍스트가 초기화됨
  ctx.textBaseline = 'top'
  if (outline) {
    ctx.lineWidth = Math.round(fs * 0.22)
    ctx.lineJoin = 'round'
    ctx.strokeStyle = outline
    lines.forEach((l, j) => ctx.strokeText(l, pad, pad + j * fs * 1.2))
  }
  ctx.fillStyle = colorCss
  lines.forEach((l, j) => ctx.fillText(l, pad, pad + j * fs * 1.2))
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  tex.premultiplyAlpha = !!outline // 축소할 때 투명 가장자리가 검게 번지지 않게 (재질도 premultipliedAlpha)
  return { tex, w, h, lines: lines.length }
}

/** 도면 글자 → 바닥에 눕힌 평면 메쉬 (demo textMesh). 캔버스를 못 쓰면 null */
export function textMesh(t: PlanText, colorCss: string, b: { w: number; h: number }): THREE.Mesh | null {
  const lab = canvasLabel(t.str, colorCss)
  if (!lab) return null
  const { tex, w, h, lines } = lab
  const ph = t.h * 1.2 * lines, pw = (ph * w) / h
  const geo = new THREE.PlaneGeometry(pw, ph)
  // 정렬: ha 0=왼 1=가운데 2=오른 / va 0=베이스 1=아래 2=중간 3=위
  geo.translate(pw / 2 - [0, pw / 2, pw][t.ha], -ph / 2 + [ph - t.h * 0.2, ph, ph / 2, 0][t.va], 0)
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }))
  m.rotation.x = -Math.PI / 2
  m.rotateZ(t.rot)
  const [lx, lz] = planToLocal(t.x, t.y, b)
  m.position.set(lx, 0.04, lz)
  return m
}


/** 구역 이름 표 (화면 크기 고정 Sprite). 3D = 어두운 글자 + 흰 테두리, 도면 보기 = 흰 글자 + 검은 테두리 */
export interface ZoneLabel { sprite: THREE.Sprite; dark: THREE.Texture; light: THREE.Texture }

export const ZONE_LABEL_PX = 0.024 // 화면 높이 기준 크기 (sizeAttenuation 끔) — 900px 화면에서 글자 약 15px

export function zoneLabel(name: string): ZoneLabel | null {
  const dark = canvasLabel(name, '#1c2128', 32, '#ffffffd9')
  const light = canvasLabel(name, '#ffffff', 32, '#000000aa')
  if (!dark || !light) return null
  const mat = new THREE.SpriteMaterial({
    map: dark.tex, toneMapped: false, depthWrite: false, depthTest: false, sizeAttenuation: false, fog: false, transparent: true, premultipliedAlpha: true,
  })
  const sprite = new THREE.Sprite(mat)
  sprite.scale.set((ZONE_LABEL_PX * dark.w) / dark.h, ZONE_LABEL_PX, 1)
  sprite.renderOrder = 5 // 벽 뒤에 있어도 이름은 보이게 (깊이 무시)
  return { sprite, dark: dark.tex, light: light.tex }
}
