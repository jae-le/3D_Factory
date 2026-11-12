/** demo mainScenario (index.html 3431~3469) 의 설비·자재 배치 — put(type, px, py, ang, name) 를 그대로 옮긴 표.
 *  운반(addMover)·경로망 부분은 옮기지 않는다. */
export type Put = [key: string, px: number, py: number, ang?: number, name?: string]
export const PUTS: Put[] = [
  // 상단 왼쪽: Hub 조립장 → 허브 구획: 텐셔너 · 부품 + 허브 6 + 부품 줄
  ['jigHub', 156, 366, 0, 'Hub 조립장'],
  ['tensioner', 147, 485], ['pallet', 202, 478, 90], ['pallet', 202, 500, 90],
  ['hub', 307, 465], ['hub', 370, 465], ['hub', 432, 465], ['hub', 506, 465], ['hub', 567, 465], ['hub', 627, 465],
  ['pallet', 295, 510], ['pallet', 323, 510], ['pallet', 351, 510], ['pallet', 379, 510], ['pallet', 407, 510], ['pallet', 437, 510],
  ['pallet', 497, 510], ['pallet', 523, 510], ['pallet', 555, 510], ['pallet', 581, 510], ['pallet', 612, 510], ['pallet', 638, 510],
  // 상단 가운데: 허브 적치 3 → 프레임 조립대 2 · 허브 2
  ['hub', 786, 362], ['hub', 868, 362], ['hub', 928, 362],
  ['frameTable', 777, 487, 90], ['frameTable', 852, 487, 90],
  ['hub', 965, 467], ['hub', 965, 520],
  // 상단 오른쪽: 긴 자재 랙 7
  ['longmat', 1115, 490, 90], ['longmat', 1155, 490, 90], ['longmat', 1195, 490, 90], ['longmat', 1235, 490, 90],
  ['longmat', 1275, 490, 90], ['longmat', 1317, 490, 90], ['longmat', 1356, 490, 90],
  // 메인 줄: Main Station 3 · 2 · (미표기) · 1
  ['jigMain', 161, 680, 0, 'Main Station 3'], ['jigMain', 375, 680, 0, 'Main Station 2'],
  ['jigMain', 626, 680, 0, 'Station (미표기)'], ['jigMain', 843, 680, 0, 'Main Station 1'],
  // 메인 줄 오른쪽: 부품 · 서브 조립 지그 2 · 부품 줄 → Sub_Yaw Bearing(링 3) → 동쪽 끝 칸 허브 2
  ['pallet', 1081, 665], ['pallet', 1100, 665], ['pallet', 1090, 718], ['pallet', 1139, 728, 90],
  ['jigSub', 1157, 662], ['jigSub', 1295, 662],
  ['pallet', 1249, 735], ['pallet', 1268, 735], ['pallet', 1288, 735], ['pallet', 1307, 735], ['pallet', 1327, 735], ['pallet', 1347, 735],
  ['ring', 1390, 661], ['ring', 1422, 661, 0, 'Sub_Yaw Bearing'], ['ring', 1454, 661],
  ['hub', 1499, 661], ['hub', 1497, 745],
  // 하단 줄 왼쪽: 서브 지그 · 메인 프레임 · 프레임 조립대 | 치구 프레임 10 | 프레임 조립대 · 서브 지그
  ['jigSub', 225, 842], ['mainframe', 325, 840, 90], ['frameTable', 425, 833, 90],
  ['fixture', 525, 836, 90], ['fixture', 553, 836, 90], ['fixture', 580, 836, 90], ['fixture', 600, 836, 90], ['fixture', 625, 836, 90],
  ['fixture', 649, 836, 90], ['fixture', 674, 836, 90], ['fixture', 723, 836, 90], ['fixture', 742, 836, 90], ['fixture', 762, 836, 90],
  ['frameTable', 841, 826, 90], ['jigSub', 921, 830],
  // 하단 줄 오른쪽: Sub_Main Frame 조립장 (텐셔너 · 조립대 · 부품 · 링)
  ['tensioner', 1116, 838],
  ['frameTable', 1188, 825, 0, 'Sub_Main Frame 조립장'],
  ['pallet', 1254, 816], ['pallet', 1302, 814], ['pallet', 1336, 817], ['pallet', 1336, 856],
  ['ring', 1302, 855],
]

const K = 107.8 // mm / px
/** demo 픽셀 → 도면 mm */
export const pxToMm = (px: number, py: number): [number, number] => [(px - 57) * K, (912 - py) * K]
