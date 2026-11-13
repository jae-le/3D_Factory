import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../../api/types'
import { StaticAuth } from '../../auth/auth'
import { routes } from '../../routes'

const ADMIN: User = { id: 1, username: 'admin', displayName: '관리자', role: 'ADMIN', enabled: true, mustChangePassword: false, locked: false, createdAt: '' }
const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body })
const DRAWINGS = [
  { id: 1, name: '나셀 공장', sourceType: 'dxf', version: 1, createdBy: 'system', updatedAt: '', width: 160, height: 65.8, placements: 2 },
  { id: 2, name: '2공장', sourceType: 'dxf', version: 1, createdBy: 'kim', updatedAt: '', width: 40, height: 20, placements: 0 },
]
const STATIONS = [
  { id: 11, no: 1, name: 'Hub 조립장', placementName: 'Hub 조립장', steps: ['a', 'b'], taktSec: 1200, warnPp: 10, delayPp: 20, projectId: 21, countsProject: false, materials: ['Hub Casting'] },
  { id: 12, no: 2, name: 'Main Station 3', placementName: 'Main Station 3', steps: ['a'], taktSec: 1800, warnPp: 10, delayPp: 20, projectId: 21, countsProject: true, materials: [] },
]
const PROJECTS = [{ id: 21, name: '야월해상', done: 3, total: 13, period: "'25.09~'27.03", state: 'run', sortOrder: 1 }]
const PLACEMENTS = [
  { id: 31, modelId: 1, name: 'Hub 조립장', x: 1, y: 1, rot: 0 },
  { id: 32, modelId: 1, name: 'Main Station 3', x: 2, y: 2, rot: 0 },
]
type Call = [string, RequestInit | undefined]

function show(handler: (url: string, init?: RequestInit) => unknown = () => null) {
  const fetch = vi.fn(async (url: string, init?: RequestInit) =>
    handler(url, init) ??
    (url === '/api/drawings' ? json(200, DRAWINGS)
      : url === '/api/drawings/1/stations' ? json(200, STATIONS)
      : url === '/api/drawings/1/projects' ? json(200, PROJECTS)
      : url === '/api/drawings/1/placements' ? json(200, PLACEMENTS)
      : json(200, [])),
  )
  vi.stubGlobal('fetch', fetch)
  render(
    <StaticAuth user={ADMIN}>
      <RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/admin/stations?drawing=1'] })} />
    </StaticAuth>,
  )
  return fetch
}
const sent = (fetch: ReturnType<typeof show>, method: string) => (fetch.mock.calls as unknown as Call[]).filter(([, i]) => i?.method === method)

describe('관리자 › 공정·생산 기준정보', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('PJT 표·공정 표 (택타임 분·기준·PJT), 탭 선택', async () => {
    show()
    const row = (await screen.findAllByText('Main Station 3', { selector: 'td' }))[0].closest('tr')!
    expect(within(row).getByText('30')).toBeInTheDocument()
    expect(within(row).getByText('10 / 20')).toBeInTheDocument()
    expect(within(row).getByText('야월해상')).toBeInTheDocument()
    expect(screen.getByText('3/13')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '공정·생산 기준정보' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('combobox', { name: '도면' })).toHaveValue('1')
    expect(screen.getByRole('button', { name: 'Hub 조립장 위로' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Main Station 3 아래로' })).toBeDisabled()
  })

  it('공정 추가 → POST (step 줄바꿈·택타임 분→초·자재 쉼표)', async () => {
    const fetch = show((_url, init) => (init?.method === 'POST' ? json(201, { ...STATIONS[0], id: 13, no: 3, name: '도장' }) : null))
    fireEvent.click(await screen.findByRole('button', { name: /공정 추가/ }))
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '도장' } })
    fireEvent.change(screen.getByLabelText('연결 설비'), { target: { value: 'Hub 조립장' } })
    fireEvent.change(screen.getByLabelText('PJT'), { target: { value: '21' } })
    fireEvent.click(screen.getByLabelText('완료 시 PJT 제작 수에 셈'))
    fireEvent.change(screen.getByLabelText('step (한 줄에 하나)'), { target: { value: '세척\n\n도장\n건조 ' } })
    fireEvent.change(screen.getByLabelText('택타임(분)'), { target: { value: '15' } })
    fireEvent.change(screen.getByLabelText('입고 자재'), { target: { value: 'Paint, Thinner ' } })
    expect(screen.getByText('저장하면 상황판이 이 도면을 처음부터 다시 진행합니다.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(sent(fetch, 'POST')).toHaveLength(1))
    const [url, init] = sent(fetch, 'POST')[0]
    expect(url).toBe('/api/drawings/1/stations')
    expect(JSON.parse(String(init!.body))).toEqual({
      name: '도장', placementName: 'Hub 조립장', projectId: 21, countsProject: true,
      steps: ['세척', '도장', '건조'], taktSec: 900, warnPp: 10, delayPp: 20, materials: ['Paint', 'Thinner'],
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('검사 오류는 창 안에 한국어, 서버 409 도 창 안에', async () => {
    const fetch = show((_url, init) => (init?.method === 'POST' ? json(409, { detail: '같은 이름의 공정이 있습니다.' }) : null))
    fireEvent.click(await screen.findByRole('button', { name: /공정 추가/ }))
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: 'Hub 조립장' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(screen.getByRole('alert')).toHaveTextContent('step 은 1~40개, 각 1~100자로 입력하세요.')
    fireEvent.change(screen.getByLabelText('step (한 줄에 하나)'), { target: { value: 'a' } })
    fireEvent.change(screen.getByLabelText('택타임(분)'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(screen.getByRole('alert')).toHaveTextContent('택타임은 1~10080분으로 입력하세요.')
    fireEvent.change(screen.getByLabelText('택타임(분)'), { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText('지연 기준(%p)'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(screen.getByRole('alert')).toHaveTextContent('주의·지연 기준은 0 ≤ 주의 < 지연 ≤ 100 이어야 합니다.')
    expect(sent(fetch, 'POST')).toHaveLength(0)
    fireEvent.change(screen.getByLabelText('지연 기준(%p)'), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(await screen.findByText('같은 이름의 공정이 있습니다.')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: '공정 추가' })).toBeInTheDocument()
  })

  it('순서: 아래로 → PUT 전체 순서', async () => {
    const fetch = show((_url, init) => (init?.method === 'PUT' ? json(200, [STATIONS[1], STATIONS[0]]) : null))
    fireEvent.click(await screen.findByRole('button', { name: 'Hub 조립장 아래로' }))
    await waitFor(() => expect(sent(fetch, 'PUT')).toHaveLength(1))
    expect(sent(fetch, 'PUT')[0][0]).toBe('/api/drawings/1/stations/order')
    expect(sent(fetch, 'PUT')[0][1]!.body).toBe(JSON.stringify([12, 11]))
  })

  it('PJT 수정 → PATCH', async () => {
    const fetch = show((_url, init) => (init?.method === 'PATCH' ? json(200, { ...PROJECTS[0], done: 4 }) : null))
    fireEvent.click(await screen.findByRole('button', { name: 'PJT 야월해상 수정' }))
    expect(screen.getByLabelText('이름')).toHaveValue('야월해상')
    fireEvent.change(screen.getByLabelText('제작'), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('상태'), { target: { value: 'wait' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(sent(fetch, 'PATCH')).toHaveLength(1))
    const [url, init] = sent(fetch, 'PATCH')[0]
    expect(url).toBe('/api/projects/21')
    expect(JSON.parse(String(init!.body))).toEqual({ done: 4, state: 'wait' }) // 바뀐 칸만
  })

  it('PJT 수정: 제작 수를 안 고쳤으면 보내지 않음 (상황판이 늘린 값을 덮지 않게)', async () => {
    const fetch = show((_url, init) => (init?.method === 'PATCH' ? json(200, PROJECTS[0]) : null))
    fireEvent.click(await screen.findByRole('button', { name: 'PJT 야월해상 수정' }))
    fireEvent.change(screen.getByLabelText('기간'), { target: { value: "'25.10~'27.03" } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(sent(fetch, 'PATCH')).toHaveLength(1))
    expect(JSON.parse(String(sent(fetch, 'PATCH')[0][1]!.body))).toEqual({ period: "'25.10~'27.03" })
  })

  it('공정 수정: 택타임(분)을 안 고쳤으면 초 그대로 (보내지 않음), 고치면 분→초', async () => {
    const odd = [{ ...STATIONS[0], taktSec: 1234 }, STATIONS[1]] // 20.6분으로 보임
    const fetch = show((url, init) =>
      init?.method === 'PATCH' ? json(200, odd[0]) : url === '/api/drawings/1/stations' ? json(200, odd) : null)
    fireEvent.click(await screen.findByRole('button', { name: 'Hub 조립장 수정' }))
    expect(screen.getByLabelText('택타임(분)')).toHaveValue(20.6)
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: 'Hub 조립' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(sent(fetch, 'PATCH')).toHaveLength(1))
    const body = JSON.parse(String(sent(fetch, 'PATCH')[0][1]!.body)) as Record<string, unknown>
    expect(body.name).toBe('Hub 조립')
    expect(body).not.toHaveProperty('taktSec')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    fireEvent.click(await screen.findByRole('button', { name: 'Hub 조립장 수정' }))
    fireEvent.change(screen.getByLabelText('택타임(분)'), { target: { value: '21' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(sent(fetch, 'PATCH')).toHaveLength(2))
    expect(JSON.parse(String(sent(fetch, 'PATCH')[1][1]!.body))).toMatchObject({ taktSec: 1260 })
  })
})
