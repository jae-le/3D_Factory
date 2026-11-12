import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AddDrawingDialog } from './AddDrawingDialog'
import { dxfText, line, rect, text } from './dxf/testDxf'

const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body })
const dxfFile = (text: string, name = '2공장.dxf') => new File([text], name, { type: 'application/dxf' })

function pick(file: File) {
  fireEvent.change(screen.getByLabelText('DXF 파일'), { target: { files: [file] } })
}

describe('도면 추가 창', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('파일을 고르면 해석 요약·이름, 등록하면 서버에 원본+plan 을 보냄', async () => {
    const fetch = vi.fn(async () => json(201, { id: 7, name: '2공장' }))
    vi.stubGlobal('fetch', fetch)
    const onCreated = vi.fn()
    render(<AddDrawingDialog onClose={vi.fn()} onCreated={onCreated} />)
    pick(dxfFile(dxfText({ insunits: 4, ents: [line('WALL', 0, 0, 20000, 0), rect('PARTITION', 0, 0, 2000, 1000), { type: 'HATCH', g: [[8, 'H']] }] })))
    expect(await screen.findByText('벽 1 · 가벽 1 · 기둥 0 · 구역 0 · 객체 표기 0')).toBeInTheDocument()
    expect(screen.getByText('지원 안 됨: HATCH 1')).toBeInTheDocument()
    expect(screen.getByLabelText('도면 이름')).toHaveValue('2공장')
    expect(screen.queryByLabelText('단위')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '등록' }))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(7, undefined, undefined))
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/drawings')
    const form = init.body as FormData
    expect(form.get('name')).toBe('2공장')
    expect(JSON.parse(String(form.get('plan'))).partitions).toHaveLength(1)
    expect((form.get('file') as File).name).toBe('2공장.dxf')
  })

  it('표기가 있으면 모델을 받아 자동 배치하고 결과를 넘김', async () => {
    const model = { id: 1, name: '허브', category: 'equipment', sourceExt: 'glb', sizeX: 1, sizeY: 1, sizeZ: 1, aliases: ['HUB'], version: 1, usedDrawings: 0, updatedAt: '' }
    const fetch = vi.fn(async (url: string) => {
      if (url === '/api/models') return json(200, [model])
      if (url === '/api/drawings/7/placements') return json(201, [])
      return json(201, { id: 7 })
    })
    vi.stubGlobal('fetch', fetch)
    const onCreated = vi.fn()
    render(<AddDrawingDialog onClose={vi.fn()} onCreated={onCreated} />)
    pick(dxfFile(dxfText({ insunits: 4, ents: [line('WALL', 0, 0, 20000, 0), text('EQUIP', 1000, 1000, 300, 'HUB'), text('EQUIP', 2000, 1000, 300, 'PUMP')] })))
    await screen.findByText(/객체 표기 2/)
    fireEvent.click(screen.getByRole('button', { name: '등록' }))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(7, { count: 2, unmatched: 1 }, undefined))
    const call = (fetch.mock.calls as unknown as [string, RequestInit][]).find(([u]) => u === '/api/drawings/7/placements')!
    const body = JSON.parse(String(call[1].body))
    expect(body).toHaveLength(2)
    expect(body[0]).toMatchObject({ modelId: 1, name: '허브 1', hintLabel: 'HUB' })
    expect(body[1]).toMatchObject({ modelId: null, name: '표기 PUMP' })
  })

  it('자동 배치가 실패해도 등록은 성공, 오류 메시지를 따로 넘김', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url === '/api/models' ? json(500, { detail: '서버 오류' }) : json(201, { id: 7 }))))
    const onCreated = vi.fn()
    render(<AddDrawingDialog onClose={vi.fn()} onCreated={onCreated} />)
    pick(dxfFile(dxfText({ insunits: 4, ents: [line('WALL', 0, 0, 20000, 0), text('EQUIP', 1000, 1000, 300, 'HUB')] })))
    await screen.findByText(/객체 표기 1/)
    fireEvent.click(screen.getByRole('button', { name: '등록' }))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(7, undefined, expect.any(String)))
    expect(screen.queryByText('서버 오류')).toBeNull()
  })

  it('단위 추정이면 안내와 단위 선택, 바꾸면 크기 다시 계산', async () => {
    render(<AddDrawingDialog onClose={vi.fn()} onCreated={vi.fn()} />)
    pick(dxfFile(dxfText({ ents: [line('WALL', 0, 0, 5000, 0)] })))
    expect(await screen.findByText('단위를 mm 로 추정했습니다')).toBeInTheDocument()
    expect(screen.getByText('5.0 × 0.0 m')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('단위'), { target: { value: 'cm' } })
    expect(await screen.findByText('50.0 × 0.0 m')).toBeInTheDocument()
  })

  it('DWG 는 안내, 선이 없으면 등록 불가, 서버 오류는 표시', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(409, { detail: '같은 이름의 도면이 있습니다.' })))
    render(<AddDrawingDialog onClose={vi.fn()} onCreated={vi.fn()} />)
    pick(new File(['AC1032 binary'], 'a.dwg'))
    expect(await screen.findByText('DWG 파일은 읽을 수 없습니다. DXF(ASCII) 로 변환해 주세요 (ODA File Converter).')).toBeInTheDocument()
    pick(dxfFile(dxfText({ ents: [] }), 'empty.dxf'))
    expect(await screen.findByText('도면에서 그릴 선을 찾지 못했습니다.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '등록' })).toBeDisabled()
    pick(dxfFile(dxfText({ insunits: 6, ents: [line('WALL', 0, 0, 10, 0)] }), '중복.dxf'))
    await screen.findByText('벽 1 · 가벽 0 · 기둥 0 · 구역 0 · 객체 표기 0')
    fireEvent.click(screen.getByRole('button', { name: '등록' }))
    expect(await screen.findByText('같은 이름의 도면이 있습니다.')).toBeInTheDocument()
  })

  it('먼저 고른 파일이 늦게 읽혀도 나중에 고른 파일 결과가 유지됨', async () => {
    render(<AddDrawingDialog onClose={vi.fn()} onCreated={vi.fn()} />)
    const slow = dxfFile(dxfText({ ents: [line('WALL', 0, 0, 10, 0)] }), 'A.dxf')
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => (release = r))
    const real = slow.arrayBuffer ? slow.arrayBuffer.bind(slow) : () => new Response(slow).arrayBuffer()
    Object.defineProperty(slow, 'arrayBuffer', { value: async () => { await gate; return real() } })
    pick(slow)
    pick(dxfFile(dxfText({ insunits: 6, ents: [line('WALL', 0, 0, 10, 0), rect('PARTITION', 0, 0, 2, 1)] }), 'B.dxf'))
    expect(await screen.findByText('벽 1 · 가벽 1 · 기둥 0 · 구역 0 · 객체 표기 0')).toBeInTheDocument()
    release()
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.getByLabelText('도면 이름')).toHaveValue('B')
    expect(screen.getByText('벽 1 · 가벽 1 · 기둥 0 · 구역 0 · 객체 표기 0')).toBeInTheDocument()
  })
})
