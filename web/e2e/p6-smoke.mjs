// P6 실제 화면 확인 (Edge): 키 없을 때 AI 챗봇 꺼짐 → 관리자 키 등록·사용·연결 테스트 → 챗봇 'Main Station 1 을 오른쪽으로 2m 옮겨줘'
// → 3D 유령 미리보기 → 적용 → 위치 +2m → 변경 이력 AI 1건 → 되돌리기 → 원래 자리 → AI 사용량.
// 서버는 F3D_AI_FAKE=true · F3D_AI_MASTER_KEY(테스트 값) 로 띄울 것 (실제 Claude 를 부르지 않음). 스크린샷 e2e/shots/p6-*
// 사용: node e2e/p6-smoke.mjs <주소> <아이디> <비밀번호>   (walk smoke 다음에)
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const [base = 'http://localhost:8081', id = 'admin', pw = 'Factory3d1!'] = process.argv.slice(2)
const TARGET = 'Main Station 1'
mkdirSync('e2e/shots', { recursive: true })
const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const fail = (msg) => {
  console.error('실패:', msg)
  process.exitCode = 1
}
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(e.message))
page.on('console', (m) => m.type() === 'error' && !m.text().includes('status of 401') && pageErrors.push(m.text())) // 로그인 전 /api/auth/me 401 은 정상
const shot = (name) => page.screenshot({ path: `e2e/shots/${name}.png` })
const api = (url) => page.evaluate(async (u) => (await fetch(u)).json(), url)

/** 나셀 공장 도면 id 와 TARGET 배치 */
async function target() {
  const drawings = await api('/api/drawings')
  const d = drawings.find((x) => x.name === '나셀 공장')
  if (!d) throw new Error('나셀 공장 도면이 없습니다')
  const list = await api(`/api/drawings/${d.id}/placements`)
  const p = list.find((x) => x.name === TARGET)
  if (!p) throw new Error(`${TARGET} 배치가 없습니다`)
  return { drawingId: d.id, p }
}

async function factoryWithNacelle() {
  await page.goto(base + '/')
  const select = page.getByRole('combobox', { name: '도면 선택' })
  await select.waitFor()
  if ((await select.locator('option:checked').textContent()) !== '나셀 공장') await select.selectOption({ label: '나셀 공장' })
}

try {
  await page.goto(base + '/login')
  await page.getByLabel('아이디').fill(id)
  await page.getByLabel('비밀번호').fill(pw)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL((u) => u.pathname === '/')

  // 1. 키가 없으면 레일 AI 챗봇 꺼짐 + 이유
  await factoryWithNacelle()
  const rail = page.getByRole('button', { name: 'AI 챗봇' })
  await page.waitForFunction(() => document.querySelector('button[aria-label="AI 챗봇"]')?.getAttribute('title')?.includes('—'))
  const title = (await rail.getAttribute('title')) ?? ''
  if (!(await rail.isDisabled()) || !title.includes('Claude API 키가 등록되지 않았습니다')) fail(`키 없을 때 버튼: disabled=${await rail.isDisabled()} title=${title}`)
  await shot('p6-1-disabled')

  // 2. 관리자 › Claude API 관리: 키 등록 · 사용 켬 · 연결 테스트
  await page.goto(base + '/admin/ai')
  await page.getByRole('heading', { name: 'Claude API 관리' }).waitFor()
  await page.getByLabel('API 키').fill('sk-ant-api03-smoke-test-0000000abcd')
  await page.getByRole('button', { name: '등록' }).click()
  await page.getByText('등록됨 sk-ant-…abcd').waitFor()
  await page.getByLabel('AI 챗봇 사용').check()
  await page.getByRole('button', { name: '저장' }).click()
  await page.getByText('저장했습니다.').waitFor()
  await page.getByRole('button', { name: '연결 테스트' }).click()
  await page.getByText(/^연결됨 · claude-opus-5-5 · \d+ ms$/).waitFor()
  await shot('p6-2-admin')

  // 3. 챗봇: 이동 요청 → 도구 진행 줄 · 제안 카드 · 3D 유령
  const before = await target()
  await factoryWithNacelle()
  await page.getByRole('button', { name: 'AI 챗봇' }).click()
  const panel = page.getByRole('complementary', { name: 'AI 챗봇' })
  await panel.getByLabel('AI 에게 보낼 요청').fill(`${TARGET} 을 오른쪽으로 2m 옮겨줘`)
  await panel.getByLabel('AI 에게 보낼 요청').press('Enter')
  const card = panel.getByRole('region', { name: '변경 제안' })
  await card.waitFor({ timeout: 15000 })
  if (!(await panel.getByText(`${TARGET} 이동 제안`).isVisible())) fail('도구 진행 줄이 없습니다')
  const head = (await card.locator('header strong').textContent()) ?? ''
  if (head !== '변경 1건') fail(`제안 카드: ${head}`)
  await card.getByRole('button', { name: new RegExp(`^${TARGET} 이동`) }).click() // 카메라 이동
  await page.waitForTimeout(6000) // 모델 내려받기·카메라 이동 (headless 는 소프트웨어 WebGL)
  await shot('p6-3-preview')
  const mid = await target()
  if (Math.abs(mid.p.x - before.p.x) > 1e-6) fail('제안만 했는데 위치가 바뀌었습니다')

  // 4. 적용 → 위치 +2m
  await card.getByRole('button', { name: '적용' }).click()
  await card.getByText('적용됨 · 1건').waitFor()
  const after = await target()
  if (Math.abs(after.p.x - (before.p.x + 2)) > 0.01 /* 서버가 소수 둘째 자리로 반올림 */) fail(`적용 뒤 x=${after.p.x} (기대 ${before.p.x + 2})`)
  await page.waitForTimeout(1500)
  await shot('p6-4-applied')

  // 5. 변경 이력: AI 1건 → 되돌리기 → 원래 자리
  await page.goto(base + '/admin/changes')
  await page.getByRole('heading', { name: '변경 이력' }).waitFor()
  await page.getByLabel('출처').selectOption('AI')
  await page.getByRole('button', { name: '찾기' }).click()
  const row = page.locator('table.kp-table tbody tr', { hasText: TARGET }).first()
  await row.waitFor()
  const aiRows = await page.locator('table.kp-table tbody tr').filter({ has: page.getByText('AI', { exact: true }) }).count()
  if (aiRows !== 1) fail(`AI 변경 이력 ${aiRows}건 (기대 1)`)
  await shot('p6-5-changes')
  await row.getByRole('button', { name: '되돌리기' }).click()
  const dialog = page.getByRole('dialog', { name: '변경 되돌리기' })
  await dialog.getByRole('button', { name: '되돌리기' }).click()
  await dialog.waitFor({ state: 'detached' })
  await row.getByText('되돌림').waitFor()
  const back = await target()
  if (Math.abs(back.p.x - before.p.x) > 1e-6) fail(`되돌린 뒤 x=${back.p.x} (기대 ${before.p.x})`)

  // 6. AI 사용량
  await page.goto(base + '/admin/ai-usage')
  await page.getByRole('heading', { name: 'AI 사용량' }).waitFor()
  await page.getByRole('table', { name: '사용자별 사용량' }).getByText(id).waitFor()
  await shot('p6-6-usage')

  if (pageErrors.length) fail(`화면 오류: ${pageErrors.join(' | ')}`)
  if (!process.exitCode) console.log('P6 smoke 통과')
} catch (e) {
  fail(e.stack ?? String(e))
  await shot('p6-error').catch(() => {})
} finally {
  await browser.close()
}
