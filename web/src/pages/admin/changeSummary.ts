import type { ChangeKind } from '../../ai/types'

export const KIND_LABEL: Record<ChangeKind, string> = {
  'placement.move': '이동',
  'placement.rotate': '회전',
  'placement.rename': '이름 변경',
  'placement.update': '변경',
  'placement.add': '추가',
  'placement.delete': '삭제',
  'station.update': '공정 변경',
  'plan.partition.add': '가벽 추가',
  'plan.partition.delete': '가벽 삭제',
  'plan.zone.rename': '구역 이름',
}

type Snap = Record<string, unknown> | null | undefined
const n = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0))
const f1 = (v: unknown) => n(v).toFixed(1)
const xy = (s: Snap) => `(${f1(s?.x)}, ${f1(s?.y)})`
const min = (sec: unknown) => `${Math.round((n(sec) / 60) * 100) / 100}분`

/** 변경 이력 한 줄 요약 (before → after) */
export function summary(kind: ChangeKind, before: unknown, after: unknown): string {
  const b = before as Snap, a = after as Snap
  switch (kind) {
    case 'placement.move': return `${xy(b)} → ${xy(a)}`
    case 'placement.rotate': return `${n(b?.rot)}° → ${n(a?.rot)}°`
    case 'placement.rename': return `${String(b?.name)} → ${String(a?.name)}`
    case 'placement.update': return `(${f1(b?.x)}, ${f1(b?.y)}, ${n(b?.rot)}°) → (${f1(a?.x)}, ${f1(a?.y)}, ${n(a?.rot)}°)`
    case 'placement.add': return xy(a)
    case 'placement.delete': return xy(b)
    case 'station.update': {
      const parts: string[] = []
      if (n(b?.taktSec) !== n(a?.taktSec)) parts.push(`택타임 ${min(b?.taktSec)} → ${min(a?.taktSec)}`)
      if (n(b?.warnPp) !== n(a?.warnPp)) parts.push(`주의 ${n(b?.warnPp)}% → ${n(a?.warnPp)}%`)
      if (n(b?.delayPp) !== n(a?.delayPp)) parts.push(`지연 ${n(b?.delayPp)}% → ${n(a?.delayPp)}%`)
      if ((b?.placementName ?? null) !== (a?.placementName ?? null)) parts.push(`연결 설비 ${String(b?.placementName ?? '없음')} → ${String(a?.placementName ?? '없음')}`)
      return parts.join(' · ')
    }
    case 'plan.partition.add':
    case 'plan.partition.delete': {
      const pts = ((kind === 'plan.partition.add' ? a : b)?.pts ?? []) as [number, number][]
      if (pts.length < 2) return ''
      const p = pts[0], q = pts[pts.length - 1]
      return `(${f1(p[0])}, ${f1(p[1])}) → (${f1(q[0])}, ${f1(q[1])})`
    }
    case 'plan.zone.rename': return `${String(b?.name)} → ${String(a?.name)}`
  }
}
