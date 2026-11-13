// P4 실제 화면 확인 (Edge): 상황판 6칩·KPI · 실적 변화 · 칩 클릭 이동 · 서랍 · 기준정보 택타임 수정 → 상황판 반영 · 3D 공장 회귀.
// 서버는 F3D_LIVE_TIME_SCALE=30 으로 띄울 것 (1초에 가상 30초). 스크린샷 e2e/shots/p4-*
// 사용: node e2e/p4-smoke.mjs <주소> <아이디> <비밀번호>   (P3 smoke 다음에)
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const [base = 'http://localhost:8080', id = 'admin', pw = 'Factory3d1!'] = process.argv.slice(2)
mkdirSync('e2e/shots', { recursive: true })
const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const fail = (msg) => {
  console.error('실패:', msg)
  process.exitCode = 1
}
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(e.message))
page.on('console', (m) => m.type() === 'error' && pageErrors.push(m.text()))
const shot = (name) => page.screenshot({ path: `e2e/shots/${name}.png` })
const chips = page.locator('.chip-layer .dlabel')
const chip = (name) => chips.filter({ hasText: name }).first()
const pctOf = async (name) => Number(((await chip(name).locator('.pct').textContent()) ?? '').replace('%', ''))
const drawer = page.getByRole('complementary', { name: '제작·자재 현황' })

/** 상황판에서 나셀 공장을 고르고 칩 6개 · LIVE 까지 기다림 */
async function readyDashboard() {
  const select = page.getByRole('combobox', { name: '도면 선택' })
  await select.waitFor()
  if ((await select.locator('option:checked').textContent()) !== '나셀 공장') await select.selectOption({ label: '나셀 공장' })
  await page.locator('.live-badge', { hasText: 'LIVE' }).waitFor({ timeout: 15000 })
  await chips.nth(5).waitFor({ state: 'attached', timeout: 20000 })
}

/** 관리자 › 공정·생산 기준정보에서 공정 택타임(분) 바꾸기 */
async function setTakt(name, minutes) {
  await page.goto(base + '/admin/stations')
  await page.getByRole('heading', { name: '공정·생산 기준정보' }).waitFor()
  await page.getByRole('button', { name: `${name} 수정` }).click()
  await page.getByLabel('택타임(분)').fill(String(minutes))
  await page.getByRole('button', { name: '저장' }).click()
  await page.getByRole('dialog').waitFor({ state: 'detached' })
  await page.locator('table.kp-table tbody tr', { hasText: name }).first().locator('td', { hasText: new RegExp(`^${minutes}$`) }).waitFor()
}

try {
  await page.goto(base + '/login')
  await page.getByLabel('아이디').fill(id)
  await page.getByLabel('비밀번호').fill(pw)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL((u) => u.pathname === '/')

  // 1. 레일 › 상황판: 칩 6개 · KPI '6 가동'
  await page.getByRole('button', { name: '상황판' }).click()
  await page.waitForURL((u) => u.pathname === '/dashboard')
  await readyDashboard()
  const n = await chips.count()
  if (n !== 6) fail(`칩 ${n}개 (기대 6)`)
  const kpi = (await page.locator('.dash-bar').textContent()) ?? ''
  if (!kpi.includes('6가동')) fail(`KPI 줄: ${kpi}`)
  await page.waitForTimeout(8000) // 모델 내려받기·전체 보기 이동 (headless 는 소프트웨어 WebGL)
  await shot('p4-1-dashboard')

  // 2. 몇 초 뒤 실적 값이 바뀜 (배율 30 → 1초에 약 2.5%)
  const names = ['Main Station 1', 'Main Station 2', 'Hub 조립장']
  const before = await Promise.all(names.map(pctOf))
  await page.waitForTimeout(5000)
  const after = await Promise.all(names.map(pctOf))
  if (before.every((v, i) => v === after[i])) fail(`실적이 그대로: ${before} → ${after}`)
  console.log(`실적 ${before.join('/')} → ${after.join('/')}`)
  await shot('p4-2-progress')

  // 3. 칩 클릭 → 그 설비로 이동(선택), 다시 → 전체 보기
  await chip('Main Station 1').click()
  await page.waitForTimeout(1500)
  if ((await page.locator('.chip-layer .dlabel.sel').count()) !== 1) fail('칩 선택 표시 없음')
  await shot('p4-3-focus')
  await chip('Main Station 1').click()
  await page.waitForTimeout(1000)
  if ((await page.locator('.chip-layer .dlabel.sel').count()) !== 0) fail('같은 칩을 다시 눌러도 선택이 남음')

  // 4. 제작·자재 서랍
  await page.getByRole('button', { name: /제작·자재 현황/ }).click()
  await drawer.waitFor()
  const pjtRows = await drawer.locator('tbody tr').count()
  if (pjtRows !== 4) fail(`제작 현황 ${pjtRows}행 (기대 4)`)
  await page.waitForTimeout(500)
  await shot('p4-4-drawer')

  // 5. 기준정보: Hub 조립장 택타임 20 → 5분. 다시 올리면 Hub 는 60% 부터 1초에 약 7~10% → 10초 안에 한 대 완료
  //    (20분 그대로라면 같은 60% 에서 15초 넘게 걸림)
  await setTakt('Hub 조립장', 5)
  await shot('p4-5-admin-stations')
  await page.goto(base + '/dashboard')
  await readyDashboard()
  await page.getByRole('button', { name: /제작·자재 현황/ }).click()
  await drawer.waitFor()
  await drawer.getByText('Hub 조립장 1대 조립 완료').first().waitFor({ timeout: 10000 })
    .catch(() => fail('택타임 5분으로 바꾼 뒤 10초 안에 Hub 조립장 완료 이벤트가 없음'))
  await shot('p4-6-takt-applied')
  await setTakt('Hub 조립장', 20) // 되돌림

  // 6. 3D 공장 화면 회귀 (P3 smoke 뒤라 배치 81개)
  await page.goto(base + '/')
  await page.locator('.factory-view canvas').waitFor()
  const rows = page.locator('ul.placement-list > li')
  await rows.nth(78).waitFor({ timeout: 15000 }).catch(() => {})
  const count = await rows.count()
  if (count < 79) fail(`3D 공장 객체 목록 ${count}개 (79 이상 기대)`)
  await page.waitForTimeout(4000)
  await shot('p4-7-factory-regression')
} catch (e) {
  fail(e.message)
} finally {
  await browser.close()
}
if (pageErrors.length) console.log('브라우저 오류:\n  ' + pageErrors.join('\n  '))
console.log(process.exitCode ? 'P4 화면 확인 실패' : 'P4 화면 확인 통과')
