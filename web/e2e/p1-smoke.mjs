// P1 실제 화면 확인: 첫 관리자 로그인 → 비밀번호 변경 → 3D 공장 화면 → 관리자 › 로그인 이력. 스크린샷은 e2e/shots/
// 사용: 깨끗한 DB 로 서버를 F3D_ADMIN_PASSWORD=<처음 비밀번호> 로 띄운 뒤
//   node e2e/p1-smoke.mjs <주소> <처음 비밀번호> <새 비밀번호>
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const [base = 'http://localhost:8080', first = 'Start1234', next = 'Factory3d1!'] = process.argv.slice(2)
mkdirSync('e2e/shots', { recursive: true })
const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const fail = (msg) => {
  console.error('실패:', msg)
  process.exitCode = 1
}

await page.goto(base + '/')
await page.waitForURL(/\/login/)
await page.screenshot({ path: 'e2e/shots/1-login.png' })
await page.getByLabel('아이디').fill('admin')
await page.getByLabel('비밀번호').fill(first)
await page.getByRole('button', { name: '로그인' }).click()
await page.waitForURL(/\/password/)
await page.getByLabel('받은 임시 비밀번호').fill(first)
await page.getByLabel('새 비밀번호', { exact: true }).fill(next)
await page.getByLabel('새 비밀번호 확인').fill(next)
await page.getByRole('button', { name: /비밀번호 바꾸기/ }).click()
await page.waitForURL((u) => u.pathname === '/')
await page.getByText('등록된 도면이 없습니다').waitFor()
await page.screenshot({ path: 'e2e/shots/2-factory.png' })
if (!(await page.getByRole('combobox', { name: '도면 선택' }).isDisabled())) fail('도면이 없는데 select 가 켜져 있음')

await page.getByRole('button', { name: '관리자', exact: true }).click()
await page.waitForURL(/\/admin\/users/)
await page.getByRole('link', { name: '로그인 이력' }).click()
await page.locator('table.kp-table .kp-state', { hasText: '로그인' }).first().waitFor()
await page.screenshot({ path: 'e2e/shots/3-login-history.png' })
const rows = await page.locator('table.kp-table tbody tr').count()
if (rows < 1) fail('로그인 이력이 비어 있음')

await browser.close()
console.log(process.exitCode ? 'P1 화면 확인 실패' : `P1 화면 확인 통과 (로그인 이력 ${rows}건)`)
