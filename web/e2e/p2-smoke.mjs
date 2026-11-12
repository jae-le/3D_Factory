// P2 실제 화면 확인 (Edge): 기본 도면 3D · 도면 보기 · 거리 측정 · 도면 추가 · 관리자 도면 관리. 스크린샷 e2e/shots/p2-*
// 사용: node e2e/p2-smoke.mjs <주소> <아이디> <비밀번호>   (비밀번호 변경이 끝난 계정)
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const [base = 'http://localhost:8080', id = 'admin', pw = 'Factory3d1!'] = process.argv.slice(2)
mkdirSync('e2e/shots', { recursive: true })
const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const fail = (msg) => {
  console.error('실패:', msg)
  process.exitCode = 1
}
try {
  await page.goto(base + '/login')
  await page.getByLabel('아이디').fill(id)
  await page.getByLabel('비밀번호').fill(pw)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL((u) => u.pathname === '/')
  const select = page.getByRole('combobox', { name: '도면 선택' })
  await page.locator('.info-card strong', { hasText: '나셀 공장' }).waitFor()
  if ((await select.locator('option:checked').textContent()) !== '나셀 공장') fail('기본 도면이 선택되지 않음')
  await page.locator('.factory-view canvas').waitFor()
  await page.waitForTimeout(3000) // 첫 렌더·그림자
  await page.screenshot({ path: 'e2e/shots/p2-1-factory-3d.png' })

  await page.getByRole('button', { name: '도면 보기' }).click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'e2e/shots/p2-2-plan-view.png' })
  await page.getByRole('button', { name: '3D 보기' }).click()

  await page.getByRole('button', { name: /거리 측정/ }).click()
  const box = await page.locator('.factory-view canvas').boundingBox()
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.5)
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.5)
  const hint = await page.locator('.tool-hint').textContent()
  if (!/^거리 \d+\.\d\d m$/.test(hint ?? '')) fail(`측정 결과 문구가 이상함: ${hint}`)
  await page.screenshot({ path: 'e2e/shots/p2-3-measure.png' })
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: /도면 추가/ }).click()
  await page.getByLabel('DXF 파일').setInputFiles(fileURLToPath(new URL('./fixtures/small.dxf', import.meta.url)))
  await page.getByText('벽 2 · 가벽 1 · 기둥 0 · 구역 0 · 객체 표기 0').waitFor()
  await page.getByLabel('도면 이름').fill(`시험 도면 ${Date.now()}`)
  await page.screenshot({ path: 'e2e/shots/p2-4-add-dialog.png' })
  await page.getByRole('button', { name: '등록' }).click()
  await page.waitForTimeout(2000)
  if (!(await select.locator('option:checked').textContent())?.startsWith('시험 도면')) fail('새 도면이 선택되지 않음')
  await page.screenshot({ path: 'e2e/shots/p2-5-added.png' })

  await page.goto(base + '/admin/drawings')
  await page.getByRole('heading', { name: '도면 관리' }).waitFor()
  await page.locator('table.kp-table tbody tr').first().waitFor()
  const rows = await page.locator('table.kp-table tbody tr').count()
  if (rows < 2) fail(`도면 관리 표 행이 ${rows}개`)
  await page.screenshot({ path: 'e2e/shots/p2-6-admin-drawings.png' })
} catch (e) {
  fail(e.message)
} finally {
  await browser.close()
}
console.log(process.exitCode ? 'P2 화면 확인 실패' : 'P2 화면 확인 통과')
