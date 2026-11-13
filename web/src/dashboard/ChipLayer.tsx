import { useEffect, useRef } from 'react'
import type { DashHost } from '../scene/FactoryScene'
import { layoutChips, type ChipIn } from './chipLayout'
import { StationChip } from './StationChip'
import type { ProjectLive, StationLive } from './types'

/** 칩 하나: 스테이션 + 붙일 배치(plan 좌표 m) + 바닥 링 반지름 */
export interface ChipItem { station: StationLive; placementId: number; x: number; y: number; radius: number }

const LIFT_M = 0.8 // 설비 꼭대기 위 0.8m 에 칩 꼬리 (demo)
const DEFAULT_TOP = 3 // 모델을 아직 못 읽었을 때 높이

interface Props { scene: DashHost | null; items: ChipItem[]; projects: ProjectLive[]; selectedId: number | null; onSelect(stationId: number): void }

/** 설비 위 스테이션 칩들 (demo dashFrame). 매 프레임 3D → 화면 좌표 → 겹침 회피를 style 에 직접 씀 */
export function ChipLayer({ scene, items, projects, selectedId, onSelect }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const els = useRef(new Map<number, HTMLElement>())
  const latest = useRef(items)
  useEffect(() => {
    latest.current = items
  })
  useEffect(() => {
    if (!scene) return
    scene.onFrame((project) => {
      const layer = box.current
      if (!layer) return
      const chips: ChipIn[] = []
      for (const it of latest.current) {
        const el = els.current.get(it.station.id)
        if (!el) continue
        const p = project(it.x, it.y, (scene.objectTop(it.placementId) ?? DEFAULT_TOP) + LIFT_M)
        el.style.display = p.visible ? '' : 'none'
        if (p.visible) chips.push({ id: it.station.id, x: p.sx, y: p.sy, w: el.offsetWidth, h: el.offsetHeight })
      }
      for (const o of layoutChips(chips, { w: layer.clientWidth, h: layer.clientHeight })) {
        const el = els.current.get(o.id)
        if (!el) continue
        el.style.setProperty('--lift', `${o.lift.toFixed(1)}px`)
        el.style.setProperty('--dx', `${o.dx.toFixed(1)}px`)
        el.style.transform = `translate(${o.cx.toFixed(1)}px, ${o.bottom.toFixed(1)}px) translate(-50%, -100%)`
      }
    })
    return () => scene.onFrame(null)
  }, [scene])
  const byId = new Map(projects.map((p) => [p.id, p]))
  return (
    <div ref={box} className="chip-layer">
      {items.map((it) => {
        const id = it.station.id
        return (
          <StationChip
            key={id}
            ref={(el: HTMLButtonElement | null) => {
              if (el) els.current.set(id, el)
              else els.current.delete(id)
            }}
            s={it.station}
            project={it.station.projectId != null ? byId.get(it.station.projectId) : undefined}
            selected={selectedId === id}
            onClick={() => onSelect(id)}
          />
        )
      })}
    </div>
  )
}
