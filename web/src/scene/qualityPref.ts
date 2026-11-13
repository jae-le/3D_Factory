import type { Quality } from './FactoryScene'

/** 3D 공장 화면과 같은 저장값 f3d:view 의 quality (상황판·체험 공간이 함께 씀) */
export function loadQuality(): Quality {
  try {
    return JSON.parse(localStorage.getItem('f3d:view') ?? '{}').quality === 'low' ? 'low' : 'high'
  } catch {
    return 'high'
  }
}

export function saveQuality(q: Quality): void {
  try {
    const v = JSON.parse(localStorage.getItem('f3d:view') ?? '{}') as object
    localStorage.setItem('f3d:view', JSON.stringify({ ...v, quality: q }))
  } catch {
    /* 저장 못 해도 동작 */
  }
}
