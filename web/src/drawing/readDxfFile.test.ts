import { describe, expect, it } from 'vitest'
import { DxfReadError, readDxfFile } from './readDxfFile'

const buf = (bytes: number[] | Uint8Array) => new Uint8Array(bytes).buffer

describe('readDxfFile', () => {
  it('UTF-8 은 그대로', () => {
    expect(readDxfFile(new TextEncoder().encode('0\nSECTION\n허브').buffer)).toBe('0\nSECTION\n허브')
  })
  it('UTF-8 이 깨지면 EUC-KR 로 다시 읽음', () => {
    // "허브" EUC-KR = C7 E3 BA EA
    expect(readDxfFile(buf([0x30, 0x0a, 0xc7, 0xe3, 0xba, 0xea]))).toBe('0\n허브')
  })
  it('DWG·바이너리 DXF 는 한국어 안내로 거부', () => {
    expect(() => readDxfFile(new TextEncoder().encode('AC1032xxxx').buffer)).toThrow(DxfReadError)
    expect(() => readDxfFile(new TextEncoder().encode('AC1032xxxx').buffer)).toThrow('DWG 파일은 읽을 수 없습니다. DXF(ASCII) 로 변환해 주세요 (ODA File Converter).')
    expect(() => readDxfFile(new TextEncoder().encode('AutoCAD Binary DXF\r\n').buffer)).toThrow('바이너리 DXF 는 읽을 수 없습니다. DXF(ASCII) 로 저장해 주세요.')
  })
})
