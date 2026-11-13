import type { Project, ProjectInput, ProjectState, Station, StationInput } from '../../dashboard/api'

/** 공정 창 입력값 (모두 글자, 체크만 boolean) */
export interface StationForm {
  name: string; placementName: string; projectId: string; countsProject: boolean
  steps: string; taktMin: string; warnPp: string; delayPp: string; materials: string
}
export interface ProjectForm { name: string; done: string; total: string; period: string; state: ProjectState }

const minutes = (sec: number) => String(Math.round(sec / 6) / 10)

export function stationForm(s: Station | null): StationForm {
  if (!s) return { name: '', placementName: '', projectId: '', countsProject: false, steps: '', taktMin: '20', warnPp: '10', delayPp: '20', materials: '' }
  return {
    name: s.name, placementName: s.placementName ?? '', projectId: s.projectId == null ? '' : String(s.projectId), countsProject: s.countsProject,
    steps: s.steps.join('\n'), taktMin: minutes(s.taktSec), warnPp: String(s.warnPp), delayPp: String(s.delayPp), materials: s.materials.join(', '),
  }
}

export function projectForm(p: Project | null): ProjectForm {
  if (!p) return { name: '', done: '0', total: '1', period: '', state: 'run' }
  return { name: p.name, done: String(p.done), total: String(p.total), period: p.period ?? '', state: p.state }
}

/** 서버와 같은 검사 (문구도 같게, 택타임은 분) */
export function parseStationForm(f: StationForm): { input: StationInput } | { error: string } {
  const name = f.name.trim()
  if (!name || name.length > 100) return { error: '공정 이름은 1~100자로 입력하세요.' }
  const steps = f.steps.split('\n').map((s) => s.trim()).filter(Boolean)
  if (steps.length < 1 || steps.length > 40 || steps.some((s) => s.length > 100)) return { error: 'step 은 1~40개, 각 1~100자로 입력하세요.' }
  const takt = Number(f.taktMin)
  if (!f.taktMin.trim() || !Number.isFinite(takt) || takt < 1 || takt > 10080) return { error: '택타임은 1~10080분으로 입력하세요.' }
  const warnPp = Number(f.warnPp), delayPp = Number(f.delayPp)
  if (!Number.isInteger(warnPp) || !Number.isInteger(delayPp) || !(warnPp >= 0 && warnPp < delayPp && delayPp <= 100))
    return { error: '주의·지연 기준은 0 ≤ 주의 < 지연 ≤ 100 이어야 합니다.' }
  const materials = f.materials.split(',').map((s) => s.trim()).filter(Boolean)
  if (materials.length > 40 || materials.some((m) => m.length > 100)) return { error: '입고 자재는 40개까지, 각 1~100자로 입력하세요.' }
  return {
    input: {
      name, steps, taktSec: Math.round(takt * 60), warnPp, delayPp, countsProject: f.countsProject, materials,
      ...(f.placementName ? { placementName: f.placementName } : { clearPlacement: true }),
      ...(f.projectId ? { projectId: Number(f.projectId) } : { clearProject: true }),
    },
  }
}

export function parseProjectForm(f: ProjectForm): { input: ProjectInput } | { error: string } {
  const name = f.name.trim()
  if (!name || name.length > 100) return { error: 'PJT 이름은 1~100자로 입력하세요.' }
  const done = Number(f.done), total = Number(f.total)
  if (!Number.isInteger(done) || !Number.isInteger(total) || total < 1 || done < 0 || done > total)
    return { error: '제작 수는 0 ≤ 제작 ≤ 전체, 전체 ≥ 1 이어야 합니다.' }
  const period = f.period.trim()
  if (period.length > 40) return { error: '기간은 40자까지입니다.' }
  return { input: { name, done, total, period, state: f.state } }
}
