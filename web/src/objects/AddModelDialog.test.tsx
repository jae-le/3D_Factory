import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import * as THREE from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AddModelDialog } from './AddModelDialog'

const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body })
const deps = {
  load: vi.fn(async (files: File[]) => ({ object: new THREE.Mesh(new THREE.BoxGeometry(4000, 3000, 2000)), ext: 'obj' as const, name: files[0].name.replace(/\.[^.]+$/, '') })),
  exportGlb: vi.fn(async () => new Blob([new Uint8Array([0x67, 0x6c, 0x54, 0x46])], { type: 'model/gltf-binary' })),
  thumbnail: vi.fn(async () => new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' })),
}

describe('객체 추가 창', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('파일 → 크기·단위 추정 → 등록(변환·썸네일·업로드)', async () => {
    const fetch = vi.fn(async () => json(201, { id: 9, name: '펌프', category: 'equip', version: 1 }))
    vi.stubGlobal('fetch', fetch)
    const onCreated = vi.fn()
    render(<AddModelDialog onClose={vi.fn()} onCreated={onCreated} deps={deps} />)
    fireEvent.change(screen.getByLabelText('3D 파일'), { target: { files: [new File(['o'], '펌프.obj')] } })
    expect(await screen.findByText('가로 4.00 × 세로 2.00 × 높이 3.00 m')).toBeInTheDocument()
    expect(screen.getByText('단위를 mm 로 추정했습니다')).toBeInTheDocument()
    expect(screen.getByLabelText('이름')).toHaveValue('펌프')
    fireEvent.change(screen.getByLabelText('별칭'), { target: { value: 'PUMP, P-1' } })
    fireEvent.click(screen.getByRole('button', { name: '90° 돌리기' }))
    expect(await screen.findByText('가로 2.00 × 세로 4.00 × 높이 3.00 m')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '등록' }))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 9 })))
    const form = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData
    expect(form.get('name')).toBe('펌프')
    expect(form.get('sourceExt')).toBe('obj')
    expect(form.get('aliases')).toBe('PUMP,P-1')
    expect(Number(form.get('sizeX'))).toBeCloseTo(2)
    expect(deps.exportGlb).toHaveBeenCalled()
  })

  it('지원 안 되는 파일·큰 파일·서버 오류', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(409, { detail: '같은 이름의 모델이 있습니다.' })))
    render(<AddModelDialog onClose={vi.fn()} onCreated={vi.fn()} deps={deps} />)
    fireEvent.change(screen.getByLabelText('3D 파일'), { target: { files: [new File(['x'], 'a.dwg')] } })
    expect(await screen.findByText('glb, gltf, fbx, obj, stl 파일만 올릴 수 있습니다.')).toBeInTheDocument()
    const big = new File(['x'], 'big.glb')
    Object.defineProperty(big, 'size', { value: 101 * 1024 * 1024 })
    fireEvent.change(screen.getByLabelText('3D 파일'), { target: { files: [big] } })
    expect(await screen.findByText('파일이 너무 큽니다 (최대 100MB).')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('3D 파일'), { target: { files: [new File(['o'], '허브.obj')] } })
    await screen.findByText(/가로 4.00/)
    fireEvent.click(screen.getByRole('button', { name: '등록' }))
    expect(await screen.findByText('같은 이름의 모델이 있습니다.')).toBeInTheDocument()
  })
})
