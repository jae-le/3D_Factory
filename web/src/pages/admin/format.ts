/** 날짜·시각 (한국 표기) */
export function when(iso?: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })
}
