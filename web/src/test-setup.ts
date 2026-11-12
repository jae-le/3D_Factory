import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// 테스트마다 그린 화면 정리 (vitest globals 미사용 시 자동 정리가 안 됨)
afterEach(() => cleanup())
