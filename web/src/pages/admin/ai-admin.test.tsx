import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../../api/types'
import { StaticAuth } from '../../auth/auth'
import { routes } from '../../routes'
import { summary } from './changeSummary'

const ADMIN: User = { id: 1, username: 'admin', displayName: '관리자', role: 'ADMIN', enabled: true, mustChangePassword: false, locked: false, createdAt: '' }
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
type Call = { url: string; method: string; body: unknown }
const SETTINGS = { hasKey: false, keyHint: null, model: 'claude-opus-5-5', monthlyLimitUsd: 50, enabled: false, masterKey: true, geminiDailyLimit: 500, geminiToday: null, updatedBy: null, updatedAt: '2026-11-13T00:00:00Z' }

function show(path: string, handler: (url: string, method: string, body: unknown) => Response | null) {
  const calls: Call[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : null
    calls.push({ url, method, body })
    return handler(url, method, body) ?? (url === '/api/ai/status' ? json(200, { enabled: false, reason: 'no-key' }) : json(200, []))
  }))
  render(
    <StaticAuth user={ADMIN}>
      <RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />
    </StaticAuth>,
  )
  return calls
}

describe('관리자 › AI', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('AI API 관리: 키 등록 → 연결 테스트 → 모델·한도·사용 저장', async () => {
    let cur: Record<string, unknown> = { ...SETTINGS }
    const calls = show('/admin/ai', (url, method, body) => {
      if (url === '/api/admin/ai' && method === 'GET') return json(200, cur)
      if (url === '/api/admin/ai/key' && method === 'PUT') return json(200, (cur = { ...cur, hasKey: true, keyHint: 'sk-ant-…abcd' }))
      if (url === '/api/admin/ai/test') return json(200, { ok: true, model: 'claude-opus-5-5', latencyMs: 812, message: null })
      if (url === '/api/admin/ai' && method === 'PUT') return json(200, (cur = { ...cur, ...(body as object) }))
      return null
    })
    expect(await screen.findByText('미등록')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '연결 테스트' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('API 키'), { target: { value: 'sk-ant-api03-xyz-abcd' } })
    fireEvent.click(screen.getByRole('button', { name: '등록' }))
    expect(await screen.findByText('등록됨 sk-ant-…abcd')).toBeInTheDocument()
    expect(calls.find((c) => c.url === '/api/admin/ai/key')?.body).toEqual({ apiKey: 'sk-ant-api03-xyz-abcd' })
    expect((screen.getByLabelText('API 키') as HTMLInputElement).value).toBe('') // 키는 화면에 남기지 않음
    fireEvent.click(screen.getByRole('button', { name: '연결 테스트' }))
    expect(await screen.findByText('연결됨 · claude-opus-5-5 · 812 ms')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('모델'), { target: { value: 'claude-sonnet-5-5' } })
    expect(screen.getByText('입력 $2 · 출력 $10 / 1M 토큰')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('월 한도 (USD)'), { target: { value: '12.5' } })
    fireEvent.click(screen.getByLabelText('AI 챗봇 사용'))
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(await screen.findByText('저장했습니다.')).toBeInTheDocument()
    expect(calls.find((c) => c.url === '/api/admin/ai' && c.method === 'PUT')?.body).toEqual({ model: 'claude-sonnet-5-5', monthlyLimitUsd: 12.5, enabled: true, geminiDailyLimit: 500 })
  })

  it('AI API 관리: 마스터 키가 없으면 경고 · 키 삭제는 확인 창', async () => {
    const calls = show('/admin/ai', (url, method) => {
      if (url === '/api/admin/ai' && method === 'GET') return json(200, { ...SETTINGS, masterKey: false, hasKey: true, keyHint: 'sk-ant-…abcd' })
      if (url === '/api/admin/ai/key' && method === 'DELETE') return json(200, { ...SETTINGS, masterKey: false })
      return null
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('F3D_AI_MASTER_KEY 가 설정되지 않아 키를 저장할 수 없습니다')
    expect(screen.getByRole('button', { name: '등록' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '키 삭제' }))
    const dialog = screen.getByRole('dialog', { name: 'AI API 키 삭제' })
    fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }))
    expect(await screen.findByText('미등록')).toBeInTheDocument()
    expect(calls.some((c) => c.url === '/api/admin/ai/key' && c.method === 'DELETE')).toBe(true)
  })

  it('변경 이력: 출처 배지·요약·펼치기·필터·묶음 되돌리기', async () => {
    const entry = {
      id: 9, at: '2026-11-13T03:00:00Z', username: 'kim', source: 'AI', drawingId: 1, drawingName: '나셀 공장', batchId: 'b-1',
      kind: 'placement.move', target: 'Main Station 1', before: { name: 'Main Station 1', x: 10, y: 5, rot: 0 }, after: { name: 'Main Station 1', x: 12, y: 5, rot: 0 },
      reverted: false, revertedBy: null, revertedAt: null,
    }
    let reverted = false
    const calls = show('/admin/changes', (url, method) => {
      if (url === '/api/drawings') return json(200, [{ id: 1, name: '나셀 공장', sourceType: 'dxf', version: 1, createdBy: 'system', updatedAt: '', width: 40, height: 20, placements: 1 }])
      if (url.startsWith('/api/changes?')) return json(200, { items: [{ ...entry, reverted }], total: 1, page: 0, size: 50 })
      if (url === '/api/changes/b-1/revert' && method === 'POST') {
        reverted = true
        return json(200, { batchId: 'b-1', reverted: 1 })
      }
      return null
    })
    const row = (await screen.findByText('Main Station 1')).closest('tr')!
    expect(within(row).getByText('AI')).toBeInTheDocument()
    expect(within(row).getByText('이동')).toBeInTheDocument()
    expect(within(row).getByText('(10.0, 5.0) → (12.0, 5.0)')).toBeInTheDocument()
    fireEvent.click(within(row).getByRole('button', { name: '자세히' }))
    expect(screen.getByText(/"x": 12/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('출처'), { target: { value: 'AI' } })
    fireEvent.click(screen.getByRole('button', { name: '찾기' }))
    await waitFor(() => expect(calls.some((c) => c.url.includes('source=AI'))).toBe(true))

    fireEvent.click(within((await screen.findByText('Main Station 1')).closest('tr')!).getByRole('button', { name: '되돌리기' }))
    const dialog = screen.getByRole('dialog', { name: '변경 되돌리기' })
    expect(dialog).toHaveTextContent('이 묶음의 변경 1건을 모두 되돌립니다')
    fireEvent.click(within(dialog).getByRole('button', { name: '되돌리기' }))
    expect(await screen.findByText('되돌림')).toBeInTheDocument()
    expect(calls.some((c) => c.url === '/api/changes/b-1/revert')).toBe(true)
  })

  it('변경 이력: 되돌리기 실패는 창 안에 이유', async () => {
    const entry = {
      id: 9, at: '2026-11-13T03:00:00Z', username: 'kim', source: 'USER', drawingId: 1, drawingName: '나셀 공장', batchId: 'b-2',
      kind: 'placement.delete', target: 'A', before: { name: 'A', x: 1, y: 1, rot: 0 }, after: null, reverted: false, revertedBy: null, revertedAt: null,
    }
    show('/admin/changes', (url) => {
      if (url.startsWith('/api/changes?')) return json(200, { items: [entry], total: 1, page: 0, size: 50 })
      if (url === '/api/changes/b-2/revert') return json(409, { detail: '이후에 바뀐 객체가 있어 되돌릴 수 없습니다' })
      return null
    })
    const table = await screen.findByRole('table', { name: '변경 이력 표' })
    const row = within(table).getByText('사람').closest('tr')! // 출처 select 의 '사람' 과 겹치지 않게 표 안에서
    fireEvent.click(within(row).getByRole('button', { name: '되돌리기' }))
    const dialog = screen.getByRole('dialog', { name: '변경 되돌리기' })
    fireEvent.click(within(dialog).getByRole('button', { name: '되돌리기' }))
    expect(await within(dialog).findByText('이후에 바뀐 객체가 있어 되돌릴 수 없습니다')).toBeInTheDocument()
  })

  it('AI 사용량: 이번 달 합계·한도 막대·일별·사용자별', async () => {
    const month = { key: 'month', calls: 3, inputTokens: 6000, outputTokens: 30, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 3 }
    show('/admin/ai-usage', (url) => {
      if (url.startsWith('/api/admin/ai/usage?group=day'))
        return json(200, { month, limitUsd: 50, from: '2026-11-01', to: '2026-11-13', group: 'day', rows: [{ ...month, key: '2026-11-13', calls: 1, costUsd: 1.5 }, { ...month, key: '2026-11-01', calls: 2, costUsd: 1.5 }] })
      if (url.startsWith('/api/admin/ai/usage?group=user'))
        return json(200, { month, limitUsd: 50, from: '2026-11-01', to: '2026-11-13', group: 'user', rows: [{ ...month, key: 'kim', calls: 2, costUsd: 2 }, { ...month, key: 'lee', calls: 1, costUsd: 1 }] })
      if (url === '/api/admin/ai') return json(200, { ...SETTINGS, model: 'gemini-3.8-flash', geminiDailyLimit: 500, geminiToday: 420 })
      if (url.startsWith('/api/admin/ai/usage?group=model'))
        return json(200, { month, limitUsd: 50, from: '2026-11-01', to: '2026-11-13', group: 'model', rows: [{ ...month, key: 'gemini-3.8-flash', calls: 3, costUsd: 0 }] })
      return null
    })
    expect(await screen.findByText('$3.00 / $50.00')).toBeInTheDocument()
    expect(screen.getByRole('meter', { name: '이번 달 비용 / 한도' })).toHaveAttribute('aria-valuenow', '6')
    expect(within(screen.getByRole('table', { name: '모델별 사용량' })).getByText('gemini-3.8-flash')).toBeInTheDocument()
    expect(await screen.findByText('420 / 500')).toBeInTheDocument()
    expect(screen.getByRole('meter', { name: '오늘 Gemini 요청 / 하루 한도' })).toHaveAttribute('aria-valuenow', '84')
    const day = screen.getByRole('table', { name: '일별 사용량' })
    expect(within(day).getByText('2026-11-13')).toBeInTheDocument()
    const users = screen.getByRole('table', { name: '사용자별 사용량' })
    expect(within(users).getByText('kim')).toBeInTheDocument()
  })

  it('변경 요약', () => {
    expect(summary('placement.rotate', { x: 1, y: 1, rot: 0 }, { x: 1, y: 1, rot: 90 })).toBe('0° → 90°')
    expect(summary('placement.rename', { name: 'A' }, { name: 'B' })).toBe('A → B')
    expect(summary('placement.add', null, { x: 3, y: 4 })).toBe('(3.0, 4.0)')
    expect(summary('station.update', { taktSec: 1200, warnPp: 10, delayPp: 20, placementName: 'A' }, { taktSec: 1500, warnPp: 10, delayPp: 25, placementName: 'A' }))
      .toBe('택타임 20분 → 25분 · 지연 20% → 25%')
    expect(summary('plan.partition.add', null, { id: 'p2', pts: [[2, 10], [8, 10]], h: 1.2, t: 0.5 })).toBe('(2.0, 10.0) → (8.0, 10.0)')
    expect(summary('plan.zone.rename', { name: 'a' }, { name: 'b' })).toBe('a → b')
  })
})
