// P3 실제 화면 확인 (Edge): 기본 배치 79개 · 목록에서 고르기 · 편집·회전·되돌리기 · 배치 · 객체 추가(obj → glb) · 도면 전환 · 관리자 객체관리.
// 스크린샷 e2e/shots/p3-*
// 사용: node e2e/p3-smoke.mjs <주소> <아이디> <비밀번호>   (P2 smoke 다음에 — P2 가 만든 '시험 도면' 을 씀)
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
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(e.message))
page.on('console', (m) => m.type() === 'error' && pageErrors.push(m.text()))
const shot = (name) => page.screenshot({ path: `e2e/shots/${name}.png` })
const rowsOf = () => page.locator('ul.placement-list > li')
const countIs = async (n, what) => {
  await page.locator('.placement-head span', { hasText: `이 도면의 객체 ${n}` }).waitFor({ timeout: 15000 }).catch(() => {})
  const c = await rowsOf().count()
  if (c !== n) fail(`${what}: 객체 목록 ${c}개 (기대 ${n})`)
  return c
}
const info = page.getByRole('region', { name: '객체 정보' })
const rotText = () => page.locator('.object-info-rows dd').nth(2).textContent()
try {
  await page.goto(base + '/login')
  await page.getByLabel('아이디').fill(id)
  await page.getByLabel('비밀번호').fill(pw)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL((u) => u.pathname === '/')
  const select = page.getByRole('combobox', { name: '도면 선택' })
  await select.waitFor()
  if ((await select.locator('option:checked').textContent()) !== '나셀 공장') await select.selectOption({ label: '나셀 공장' })
  await page.locator('.info-card strong', { hasText: '나셀 공장' }).waitFor()
  await page.locator('.factory-view canvas').waitFor()

  // 1. 기본 배치 79개
  await countIs(79, '기본 배치')
  await page.waitForTimeout(8000) // 모델 11종 내려받기·첫 렌더 (headless 는 소프트웨어 WebGL)
  await shot('p3-1-factory-objects')

  // 2. 목록에서 고르기 → 카메라 이동
  await page.getByRole('button', { name: /^Main Station 1\b/ }).first().click()
  await page.waitForTimeout(1500)
  const infoName = await page.getByLabel('객체 이름').inputValue()
  if (infoName !== 'Main Station 1') fail(`정보 카드 이름: ${infoName}`)
  await shot('p3-2-focus')

  // 3. 편집 → 90° 회전 → Ctrl+Z
  await info.getByRole('button', { name: '편집', exact: true }).click()
  const rot0 = await rotText()
  await info.getByRole('button', { name: /90° 회전/ }).click()
  await page.waitForFunction((r) => document.querySelectorAll('.object-info-rows dd')[2]?.textContent !== r, rot0, { timeout: 5000 }).catch(() => {})
  const rot1 = await rotText()
  if (rot1 === rot0) fail(`회전 값이 그대로: ${rot0}`)
  await page.evaluate(() => document.activeElement?.blur()) // 입력칸 밖으로 포커스
  await page.keyboard.press('Control+z')
  await page.waitForFunction((r) => document.querySelectorAll('.object-info-rows dd')[2]?.textContent === r, rot0, { timeout: 5000 }).catch(() => {})
  const rot2 = await rotText()
  if (rot2 !== rot0) fail(`되돌리기 뒤 회전 ${rot2} (기대 ${rot0})`)
  const tag = (await page.locator('.edit-tag').textContent().catch(() => '')) ?? ''
  if (!/총 \d+칸/.test(tag)) fail(`편집 태그가 이상함: ${tag}`)
  await page.waitForTimeout(800)
  await shot('p3-3-edit')
  console.log(`회전 ${rot0} → ${rot1} → ${rot2}, 태그: ${tag}`)
  await info.getByRole('button', { name: '편집 완료' }).click()
  await page.getByRole('button', { name: '객체 정보 닫기' }).click()

  // 4. 자재 › 허브 배치
  await page.getByRole('tab', { name: '자재' }).click()
  await page.locator('.model-card', { hasText: '허브' }).first().click()
  await page.locator('.edit-tag', { hasText: '클릭해 놓기' }).waitFor()
  const box = await page.locator('.factory-view canvas').boundingBox()
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
  await page.waitForTimeout(1500) // 미리보기 모델
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5)
  await page.waitForTimeout(1000)
  await page.keyboard.press('Escape')
  await countIs(80, '허브 배치 뒤')
  await page.waitForTimeout(1000)
  await shot('p3-4-placed')

  // 5. 객체 추가 (obj → glb)
  await page.getByRole('button', { name: /객체 추가/ }).click()
  await page.getByLabel('3D 파일').setInputFiles(fileURLToPath(new URL('./fixtures/box.obj', import.meta.url)))
  await page.getByText('가로 2.00 × 세로 1.00 × 높이 1.50 m').waitFor({ timeout: 15000 })
  const modelName = `시험 상자 ${Date.now()}`
  await page.getByLabel('이름').fill(modelName)
  await page.waitForTimeout(500)
  await shot('p3-5a-add-model-dialog')
  await page.getByRole('button', { name: '등록' }).click()
  await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 30000 })
  if (await page.locator('.edit-tag', { hasText: '클릭해 놓기' }).isVisible()) {
    await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.58)
    await page.waitForTimeout(1500)
    await page.mouse.click(box.x + box.width * 0.62, box.y + box.height * 0.58)
    await page.waitForTimeout(1000)
    await page.keyboard.press('Escape')
  } else fail('등록 뒤 배치 모드가 아님')
  await countIs(81, '새 모델 배치 뒤')
  await page.getByRole('tab', { name: '설비' }).click()
  await page.locator('.model-card', { hasText: modelName }).waitFor({ timeout: 10000 }).catch(() => fail('새 모델 카드가 설비 탭에 없음'))
  await page.waitForTimeout(1000)
  await shot('p3-5-added-model')

  // 6. 도면 전환
  const testDrawing = await select.locator('option', { hasText: '시험 도면' }).first().textContent()
  if (!testDrawing) fail('P2 의 시험 도면이 없음')
  else {
    await select.selectOption({ label: testDrawing })
    await page.locator('.info-card strong', { hasText: testDrawing }).waitFor()
    await countIs(0, '시험 도면')
    await select.selectOption({ label: '나셀 공장' })
    await page.locator('.info-card strong', { hasText: '나셀 공장' }).waitFor()
    await countIs(81, '나셀 공장으로 돌아옴')
    await page.waitForTimeout(4000)
    await shot('p3-6-switch')
  }

  // 7. 관리자 객체관리
  await page.goto(base + '/admin/models')
  await page.getByRole('heading', { name: '객체관리' }).waitFor()
  await page.locator('table.kp-table tbody tr').first().waitFor()
  const rows = await page.locator('table.kp-table tbody tr').count()
  if (rows < 12) fail(`객체관리 표 행이 ${rows}개`)
  await page.waitForTimeout(1000)
  await shot('p3-7-admin-models')
  console.log(`객체관리 표 ${rows}행`)
} catch (e) {
  fail(e.message)
} finally {
  await browser.close()
}
if (pageErrors.length) console.log('브라우저 오류:\n  ' + pageErrors.join('\n  '))
console.log(process.exitCode ? 'P3 화면 확인 실패' : 'P3 화면 확인 통과')
