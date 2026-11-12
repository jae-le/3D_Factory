/** 올린 파일 바이트 → DXF 글자. UTF-8 로 읽고 깨지면 EUC-KR. DWG·바이너리 DXF 는 거부 */
export class DxfReadError extends Error {}

export function readDxfFile(buf: ArrayBuffer): string {
  const head = new TextDecoder('latin1').decode(buf.slice(0, 22))
  if (/^AC10\d\d/.test(head)) throw new DxfReadError('DWG 파일은 읽을 수 없습니다. DXF(ASCII) 로 변환해 주세요 (ODA File Converter).')
  if (head.startsWith('AutoCAD Binary DXF')) throw new DxfReadError('바이너리 DXF 는 읽을 수 없습니다. DXF(ASCII) 로 저장해 주세요.')
  const utf8 = new TextDecoder('utf-8').decode(buf)
  if (!utf8.includes('�')) return utf8
  return new TextDecoder('euc-kr').decode(buf)
}
