import type { Category } from '../types'

/** 기본 모델 11종 (demo EQUIP_TYPES 의 설비·자재) */
export const BUILTIN: { key: string; name: string; category: Category; aliases: string[] }[] = [
  { key: 'jigMain', name: '메인 조립 지그', category: 'equip', aliases: ['JIG_MAIN', 'MAIN JIG'] },
  { key: 'jigSub', name: '서브 조립 지그', category: 'equip', aliases: ['JIG_SUB', 'SUB JIG'] },
  { key: 'jigHub', name: '허브 조립 지그', category: 'equip', aliases: ['JIG_HUB', 'HUB JIG'] },
  { key: 'tensioner', name: '요 베어링 텐셔너', category: 'equip', aliases: ['TENSIONER'] },
  { key: 'frameTable', name: '메인 프레임 조립대', category: 'equip', aliases: ['FRAME_TABLE'] },
  { key: 'hub', name: '허브', category: 'mat', aliases: ['HUB'] },
  { key: 'ring', name: '베어링 링', category: 'mat', aliases: ['RING', 'BEARING'] },
  { key: 'mainframe', name: '메인 프레임', category: 'mat', aliases: ['MAINFRAME', 'MAIN FRAME'] },
  { key: 'longmat', name: '긴 자재 랙', category: 'mat', aliases: ['LONG_RACK'] },
  { key: 'fixture', name: '치구 프레임', category: 'mat', aliases: ['FIXTURE'] },
  { key: 'pallet', name: '부품 팔레트', category: 'mat', aliases: ['PALLET'] },
]
