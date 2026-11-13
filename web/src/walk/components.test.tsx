import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ProjectLive, StationLive } from '../dashboard/types'
import type { Plan } from '../drawing/plan/types'
import type { ModelInfo, Placement } from '../objects/types'
import { Minimap } from './WalkMinimap'
import { TouchJoystick } from './TouchJoystick'
import { WalkDetail } from './WalkDetail'
import { WalkHud } from './WalkHud'
import { WalkOverlay } from './WalkOverlay'

const PLAN: Plan = {
  format: 1, unit: 'm', scale: 1, rotQ: 0, flip: 1, bounds: { w: 100, h: 50 },
  layers: [], lines: [], texts: [], walls: [], partitions: [], columns: [], zones: [], objectHints: [],
  warnings: { unsupported: {}, unitGuessed: false },
}
const MODEL: ModelInfo = { id: 1, name: '나셀 조립대', category: 'equip', sourceExt: 'glb', sizeX: 4, sizeY: 2.5, sizeZ: 3, aliases: [], version: 1, usedDrawings: 1, updatedAt: '' }
const PLACEMENT: Placement = { id: 10, modelId: 1, name: 'Main Station 1', x: 12.34, y: 5, rot: 90 }
const STATION: StationLive = { id: 3, no: 2, name: 'Main Station 1', placementName: 'Main Station 1', steps: ['허브 체결', '배선'], step: 2, actual: 64, target: 70, status: 'warn', projectId: 7, unitNo: 3 }
const PROJECT: ProjectLive = { id: 7, name: 'N-2000', done: 2, total: 10, period: null, state: 'run' }

describe('체험 공간 덮개', () => {
  it('시작 화면: 제목·도면 이름·조작 키, 준비 전에는 입장 못 함', () => {
    const onEnter = vi.fn()
    const { rerender } = render(<WalkOverlay drawingName="나셀 공장" ready={false} onEnter={onEnter} />)
    expect(screen.getByRole('heading', { name: '체험 공간' })).toBeInTheDocument()
    expect(screen.getByText('나셀 공장')).toBeInTheDocument()
    expect(screen.getByText('W A S D')).toBeInTheDocument()
    expect(screen.getByText('조감 뷰 ↔ 걷기')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '입장하기' })).toBeDisabled()
    rerender(<WalkOverlay drawingName="나셀 공장" ready onEnter={onEnter} />)
    fireEvent.click(screen.getByRole('button', { name: '입장하기' }))
    expect(onEnter).toHaveBeenCalledTimes(1)
  })

  it('HUD: 구역 배지 · 이름표(누르면 상세) · 걷기 도움말, 조감 뷰는 조준점 없이 다른 도움말', () => {
    const onTip = vi.fn()
    const { container, rerender } = render(<WalkHud mode="walk" zone="Hub 조립장" tip={{ name: 'Main Station 1', x: 300, y: 222 }} onTip={onTip} />)
    expect(screen.getByText('Hub 조립장')).toHaveClass('walk-zone')
    const tip = screen.getByRole('button', { name: /Main Station 1/ })
    expect(tip).toHaveTextContent('클릭 또는 E — 상세정보')
    expect(tip).toHaveStyle({ left: '300px', top: '222px' })
    fireEvent.click(tip)
    expect(onTip).toHaveBeenCalledTimes(1)
    expect(container.querySelector('.walk-cross')).not.toBeNull()
    expect(screen.getByText(/^WASD 이동/)).toBeInTheDocument()
    rerender(<WalkHud mode="overview" zone="통로" tip={null} onTip={onTip} />)
    expect(container.querySelector('.walk-cross')).toBeNull()
    expect(screen.getByText(/^조감 뷰 —/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('상세: 모델·분류·크기·위치 + 실시간 상태(상태·PJT 호기·step·게이지·실적/목표)', () => {
    const onClose = vi.fn()
    render(<WalkDetail placement={PLACEMENT} model={MODEL} station={STATION} project={PROJECT} onClose={onClose} />)
    const panel = screen.getByRole('complementary', { name: '상세정보' })
    expect(screen.getByRole('heading', { name: 'Main Station 1', level: 2 })).toBeInTheDocument()
    expect(panel).toHaveTextContent('설비 · 나셀 조립대')
    expect(panel).toHaveTextContent('4 × 2.5 × 3 m')
    expect(panel).toHaveTextContent('x 12.3 · y 5.0 m · 90°')
    expect(panel).toHaveTextContent('주의')
    expect(panel).toHaveTextContent('N-2000 #3')
    expect(panel).toHaveTextContent('2/2 배선')
    expect(panel).toHaveTextContent('실적 64% · 목표 70%')
    expect(panel.querySelectorAll('.gauge i')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: '상세정보 닫기' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('상세: 모델 없는 임시 상자, 공정이 없으면 실시간 상태 없음', () => {
    render(<WalkDetail placement={{ ...PLACEMENT, modelId: null }} model={null} station={null} project={null} onClose={() => {}} />)
    const panel = screen.getByRole('complementary', { name: '상세정보' })
    expect(panel).toHaveTextContent('임시 상자')
    expect(panel).toHaveTextContent('2 × 2 × 2 m')
    expect(panel).toHaveTextContent('실시간 상태 없음')
    expect(panel.querySelector('.gauge')).toBeNull()
  })

  it('미니맵: 폭 280 · 도면 비율 높이, 내 위치를 data-pos 로', () => {
    render(<Minimap plan={PLAN} objects={[]} me={() => ({ x: 1.234, y: 5, yaw: 0 })} />)
    const cv = screen.getByRole('img', { name: '미니맵' })
    expect(cv).toHaveStyle({ width: '280px', height: '148px' })
    expect(cv).toHaveAttribute('data-pos', '1.23,5.00')
  })

  it('조이스틱: 누른 자리에 원, 손잡이는 끈 만큼', () => {
    const { container } = render(<TouchJoystick joy={{ cx: 100, cy: 200, kx: 10, ky: -5 }} />)
    const ring = container.querySelector('.walk-joy') as HTMLElement
    expect(ring).toHaveStyle({ left: '45px', top: '145px' })
    expect(ring.querySelector('i')).toHaveStyle({ transform: 'translate(10px, -5px)' })
  })
})
