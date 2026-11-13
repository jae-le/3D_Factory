import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { layoutChips, type ChipIn, type ChipOut } from './chipLayout'
import { gaugeCells, stepOf } from './gauge'
import { liveReducer, MAX_EVENTS } from './liveReducer'
import { eventIcon, fmtTime } from './status'
import { easeOutCubic, retarget, useTweened, valueAt } from './tween'
import type { Kpi, LiveEvent, LiveState, StationLive } from './types'

const KPI: Kpi = { running: 1, ok: 1, warn: 0, bad: 0, doneToday: 0, planRate: 100, at: '2026-11-13T01:00:00Z' }
const ST: StationLive = { id: 1, no: 1, name: 'A', placementName: 'A', steps: ['a', 'b'], step: 1, actual: 10, target: 12, status: 'ok', projectId: null, unitNo: null }
const ev = (id: number, kind: LiveEvent['kind'] = 'unit_done', data: Record<string, unknown> = {}): LiveEvent => ({ id, at: '2026-11-13T01:00:00Z', kind, station: 'A', text: `e${id}`, data })
const snap = (over: Partial<LiveState> = {}) => ({ type: 'snapshot' as const, drawingId: 7, kpi: KPI, stations: [ST], projects: [], events: [], materials: [], ...over })

describe('liveReducer', () => {
  it('snapshot 은 통째로(step_* 빼고), tick 은 kpi·stations 만', () => {
    const s = liveReducer(null, snap({ events: [ev(2), ev(1, 'step_start')] }))!
    expect(s.drawingId).toBe(7)
    expect(s.events.map((e) => e.id)).toEqual([2])
    const t = liveReducer(s, { type: 'tick', kpi: { ...KPI, ok: 0, warn: 1 }, stations: [{ ...ST, actual: 11 }] })!
    expect(t.kpi.warn).toBe(1)
    expect(t.stations[0].actual).toBe(11)
    expect(t.events).toBe(s.events)
  })
  it('snapshot 전 tick·event·projects 는 무시', () => {
    expect(liveReducer(null, { type: 'tick', kpi: KPI, stations: [] })).toBeNull()
    expect(liveReducer(null, { type: 'event', event: ev(1) })).toBeNull()
    expect(liveReducer(null, { type: 'projects', projects: [] })).toBeNull()
  })
  it('event 는 앞에 붙이고 50개, 같은 id·step_* 은 무시, material_in 은 자재에도', () => {
    let s = liveReducer(null, snap())!
    for (let i = 1; i <= 55; i++) s = liveReducer(s, { type: 'event', event: ev(i) })!
    expect(s.events).toHaveLength(MAX_EVENTS)
    expect(s.events[0].id).toBe(55)
    expect(liveReducer(s, { type: 'event', event: ev(55) })).toBe(s)
    expect(liveReducer(s, { type: 'event', event: ev(99, 'step_done') })).toBe(s)
    const m = liveReducer(s, { type: 'event', event: ev(100, 'material_in') })!
    expect(m.events[0].id).toBe(100)
    expect(m.materials.map((e) => e.id)).toEqual([100])
  })
  it('projects 교체', () => {
    const s = liveReducer(liveReducer(null, snap())!, { type: 'projects', projects: [{ id: 1, name: 'P', done: 4, total: 13, period: null, state: 'run' }] })!
    expect(s.projects[0].done).toBe(4)
  })
})

describe('눈금 게이지', () => {
  it('막대 1개 = step 1개, 실적만큼 채움, 목표 막대, 진행 중 막대', () => {
    const c = gaugeCells(12, 60.4, 88)
    expect(c).toHaveLength(12)
    expect(c.filter((x) => x.on)).toHaveLength(8) // step 8/12 → 막대 8개
    expect(c.findIndex((x) => x.target)).toBe(10)
    expect(c.findIndex((x) => x.current)).toBe(7)
    const h = gaugeCells(12, 85, 93) // 칩 '11/12 · 85%' → 11개, 11번째가 진행 중
    expect(h.filter((x) => x.on)).toHaveLength(11)
    expect(h.findIndex((x) => x.current)).toBe(10)
  })
  it('끝값', () => {
    expect(gaugeCells(4, 0, 0).findIndex((x) => x.target)).toBe(0)
    expect(gaugeCells(4, 0, 0).filter((x) => x.on)).toHaveLength(1) // step 1/4 진행 중
    expect(gaugeCells(4, 100, 130).findIndex((x) => x.target)).toBe(3)
    expect(gaugeCells(4, 100, 130).every((x) => x.on)).toBe(true)
    expect(stepOf(0, 12)).toBe(1)
    expect(stepOf(99.9, 12)).toBe(12)
    expect(stepOf(100, 12)).toBe(12)
  })
})

const box = (o: ChipOut, c: ChipIn) => ({ l: o.cx - c.w / 2, r: o.cx + c.w / 2, t: o.bottom - c.h, b: o.bottom })
const overlaps = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b
const VIEW = { w: 1000, h: 800 }

describe('칩 겹침 회피 (demo dashFrame)', () => {
  it('혼자면 설비 바로 위 (꼬리 7px)', () => {
    expect(layoutChips([{ id: 1, x: 500, y: 400, w: 200, h: 100 }], VIEW)).toEqual([{ id: 1, cx: 500, bottom: 393, lift: 0, dx: 0 }])
  })
  it('같은 자리 세 개: 한 칸 위 → 옆, 서로 겹치지 않음', () => {
    const chips = [1, 2, 3].map((id) => ({ id, x: 500, y: 400, w: 200, h: 100 }))
    const out = layoutChips(chips, VIEW)
    expect(out).toEqual([
      { id: 1, cx: 500, bottom: 393, lift: 0, dx: 0 },
      { id: 2, cx: 500, bottom: 285, lift: 108, dx: 0 },
      { id: 3, cx: 710, bottom: 393, lift: 0, dx: 210 },
    ])
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(overlaps(box(out[i], chips[i]), box(out[j], chips[j]))).toBe(false)
  })
  it('아래(가까운) 칩부터 자리를 잡음', () => {
    const out = layoutChips([{ id: 2, x: 500, y: 300, w: 200, h: 100 }, { id: 1, x: 500, y: 400, w: 200, h: 100 }], VIEW)
    expect(out.find((o) => o.id === 1)).toMatchObject({ bottom: 393, lift: 0 })
    expect(out.find((o) => o.id === 2)).toMatchObject({ bottom: 185, lift: 108 })
  })
  it('화면 가장자리·위 KPI 줄 안쪽으로', () => {
    expect(layoutChips([{ id: 1, x: 10, y: 400, w: 200, h: 100 }], VIEW)[0]).toMatchObject({ cx: 106, dx: 96 })
    expect(layoutChips([{ id: 1, x: 500, y: 50, w: 200, h: 100 }], VIEW)[0]).toMatchObject({ bottom: 162, lift: 0 })
  })
})

describe('보간', () => {
  it('ease-out cubic', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875)
    expect(easeOutCubic(1)).toBe(1)
    expect(easeOutCubic(2)).toBe(1)
  })
  it('지금 보이는 값에서 새 값으로, snapDown 이면 내려갈 때 바로', () => {
    const a = retarget({ from: 10, to: 10, t0: 0, ms: 600 }, 20, 0, 600)
    expect(valueAt(a, 0)).toBe(10)
    expect(valueAt(a, 300)).toBeCloseTo(18.75)
    expect(valueAt(a, 600)).toBe(20)
    const b = retarget(a, 30, 300, 600) // 중간에 새 값: 보이는 값(18.75)부터
    expect(valueAt(b, 300)).toBeCloseTo(18.75)
    expect(valueAt(retarget(b, 2, 400, 600, true), 400)).toBe(2) // 한 대 완료(100 → 2): 거꾸로 차오르지 않게 바로
    expect(valueAt(retarget(b, 2, 400, 600, false), 400)).toBeGreaterThan(2)
  })
})

describe('useTweened', () => {
  afterEach(() => vi.useRealTimers())
  it('0.6초 동안 새 값으로, 내려갈 때는 바로', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    const { result, rerender } = renderHook(({ v }) => useTweened(v, 600, { snapDown: true }), { initialProps: { v: 10 } })
    expect(result.current).toBe(10)
    rerender({ v: 20 })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current).toBeGreaterThan(10)
    expect(result.current).toBeLessThan(20)
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(result.current).toBe(20)
    rerender({ v: 3 })
    expect(result.current).toBe(3)
  })
})

describe('상태·이벤트 표', () => {
  it('이벤트 아이콘: step_* 은 없음, 상태 변경은 바뀐 상태 색', () => {
    expect(eventIcon(ev(1, 'step_start'))).toBeNull()
    expect(eventIcon(ev(1, 'unit_done'))?.color).toBe('#22c55e')
    expect(eventIcon(ev(1, 'status_change', { to: 'bad' }))?.color).toBe('#ef4444')
    expect(eventIcon(ev(1, 'status_change', { to: 'warn' }))?.color).toBe('#f59e0b')
    expect(eventIcon(ev(1, 'material_in'))).not.toBeNull()
    expect(eventIcon(ev(1, 'move'))).not.toBeNull()
  })
  it('시각 HH:MM:SS', () => {
    expect(fmtTime('2026-11-13T01:02:03Z')).toMatch(/^\d{2}:02:03$/)
    expect(fmtTime('x')).toBe('')
  })
})
