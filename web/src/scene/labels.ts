import * as THREE from 'three'
import type { PlanText } from '../drawing/plan/types'
import { planToLocal } from './coords'

const FONT = '"Pretendard Variable", "Malgun Gothic", sans-serif'

/** 여러 줄 글자를 캔버스 텍스처로 (demo canvasLabel). 2D 컨텍스트가 없으면 null */
function canvasLabel(str: string, colorCss: string, fs = 64) {
  const lines = String(str).split('\n'), pad = 4
  const cv = document.createElement('canvas')
  const ctx = cv.getContext('2d')
  if (!ctx) return null
  ctx.font = `${fs}px ${FONT}`
  const w = Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width))) + pad * 2
  const h = lines.length * fs * 1.2 + pad * 2
  cv.width = w
  cv.height = h
  ctx.font = `${fs}px ${FONT}` // 크기를 바꾸면 컨텍스트가 초기화됨
  ctx.fillStyle = colorCss
  ctx.textBaseline = 'top'
  lines.forEach((l, j) => ctx.fillText(l, pad, pad + j * fs * 1.2))
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
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
  m.position.set(lx, 0.02, lz)
  return m
}
