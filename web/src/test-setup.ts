import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// 전체를 한꺼번에 돌려 PC 가 바쁠 때 findBy·waitFor 가 1초(기본) 안에 못 찾아 흔들리지 않게
configure({ asyncUtilTimeout: 3000 })

// 테스트마다 그린 화면 정리 (vitest globals 미사용 시 자동 정리가 안 됨)
afterEach(() => cleanup())

// jsdom 에는 canvas 가 없어 getContext 가 경고를 찍음 — 조용히 null
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext
