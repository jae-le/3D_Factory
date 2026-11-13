// 체험 공간 실제 화면 확인 (Edge): 레일 체험 → 시작 화면 → 입장 → W 2초 이동 · 달려도 벽 안 → 설비 클릭 상세 · 공정 연결 설비 실시간 상태 → M 조감 → Esc 시작 화면 → 상황판 회귀.
// 스크린샷 e2e/shots/walk-*
// 사용: node e2e/walk-smoke.mjs <주소> <아이디> <비밀번호>   (P4 smoke 다음에)
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const [base = 'http://localhost:8081', id = 'admin', pw = 'Factory3d1!'] = process.argv.slice(2)
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
const RADIUS = 0.45

/** 미니맵 data-pos = 내 위치 (plan m) */
async function pos() {
  const s = (await page.locator('canvas.walk-mini').getAttribute('data-pos')) ?? ''
  const [x, y] = s.split(',').map(Number)
  return { x, y }
}

function segDist(p, a, b) {
  const vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a[0]) * vx + (p.y - a[1]) * vy) / l2)) : 0
  return Math.hypot(p.x - (a[0] + vx * t), p.y - (a[1] + vy * t))
}

/** 도면 경계 안 · 외벽·가벽 두께 + 몸 반지름 밖인지 */
function checkInside(plan, p, label) {
  const { w, h } = plan.bounds
  if (!(p.x >= RADIUS - 0.02 && p.x <= w - RADIUS + 0.02 && p.y >= RADIUS - 0.02 && p.y <= h - RADIUS + 0.02)) fail(`${label}: 도면 밖 (${p.x}, ${p.y})`)
  for (const wl of [...plan.walls, ...plan.partitions])
    for (let j = 0; j + 1 < wl.pts.length; j++) {
      const a = wl.pts[j], b = wl.pts[j + 1]
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.05) continue
      const d = segDist(p, a, b)
      if (d < wl.t / 2 + RADIUS - 0.02) fail(`${label}: 벽 ${wl.id} 안으로 들어감 (중심선까지 ${d.toFixed(2)} m)`)
    }
}

async function hold(keys, ms) {
  for (const k of keys) await page.keyboard.down(k)
  await page.waitForTimeout(ms)
  for (const k of [...keys].reverse()) await page.keyboard.up(k)
  await page.waitForTimeout(400)
}

try {
  await page.goto(base + '/login')
  await page.getByLabel('아이디').fill(id)
  await page.getByLabel('비밀번호').fill(pw)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL((u) => u.pathname === '/')

  // 1. 레일 › 체험 → 시작 화면 (나셀 공장)
  await page.getByRole('button', { name: '체험' }).click()
  await page.waitForURL((u) => u.pathname === '/walk')
  const select = page.getByRole('combobox', { name: '도면 선택' })
  await select.waitFor()
  if ((await select.locator('option:checked').textContent()) !== '나셀 공장') await select.selectOption({ label: '나셀 공장' })
  await page.getByRole('heading', { name: '체험 공간' }).waitFor()
  await page.waitForFunction(() => {
    const b = document.querySelector('.walk-enter')
    return b instanceof HTMLButtonElement && !b.disabled
  }, null, { timeout: 20000 })
  const drawingId = Number(await select.inputValue())
  const plan = (await (await page.request.get(`${base}/api/drawings/${drawingId}`)).json()).plan
  await page.waitForTimeout(6000) // 모델 내려받기 (headless 는 소프트웨어 WebGL)
  await shot('walk-1-start')

  // 2. 입장 → W 2초: 위치가 바뀌고 벽 안으로 들어가지 않음
  await page.getByRole('button', { name: '입장하기' }).click()
  await page.locator('canvas.walk-mini').waitFor()
  const stage = await page.locator('.walk-stage').boundingBox()
  const cx = stage.x + stage.width / 2, cy = stage.y + stage.height / 2
  await page.mouse.move(cx, cy)
  await page.waitForTimeout(1500)
  const p0 = await pos()
  checkInside(plan, p0, '시작 자리')
  await hold(['w'], 2000)
  const p1 = await pos()
  const moved = Math.hypot(p1.x - p0.x, p1.y - p0.y)
  console.log(`W 2초: (${p0.x}, ${p0.y}) → (${p1.x}, ${p1.y}) ${moved.toFixed(1)} m`)
  if (!(moved >= 0.5)) fail(`W 2초에 ${moved} m 만 움직임`)
  checkInside(plan, p1, 'W 2초 뒤')
  const zone = ((await page.locator('.walk-zone').textContent()) ?? '').trim()
  if (!zone) fail('구역 배지가 비어 있음')
  console.log(`구역: ${zone}`)
  await shot('walk-2-walk')

  // 3. Shift 달리기 6초 → 벽에 닿아도 뚫지 않음
  await hold(['Shift', 'w'], 6000)
  const p2 = await pos()
  console.log(`달리기 6초 뒤: (${p2.x}, ${p2.y})`)
  checkInside(plan, p2, '달리기 6초 뒤')
  await shot('walk-3-wall')

  // 4. 설비 클릭 → 상세 패널 (8방향 × 화면 가운데 줄을 눌러 봄)
  const detail = page.getByRole('complementary', { name: '상세정보' })
  let found = false
  for (let turn = 0; turn < 8 && !found; turn++) {
    for (const fy of [0.55, 0.65]) {
      for (let fx = 0.15; fx < 0.9 && !found; fx += 0.1) {
        await page.mouse.click(stage.x + stage.width * fx, stage.y + stage.height * fy)
        await page.waitForTimeout(80)
        found = await detail.isVisible()
      }
      if (found) break
    }
    if (!found) {
      // 왼쪽으로 약 45° (175 px × 0.0045 rad)
      await page.mouse.move(cx, cy)
      await page.mouse.down()
      await page.mouse.move(cx - 175, cy, { steps: 5 })
      await page.mouse.up()
      await page.waitForTimeout(400)
    }
  }
  if (!found) fail('8방향 어디를 눌러도 상세정보가 열리지 않음')
  else {
    const name = await detail.getByRole('heading', { level: 2 }).textContent()
    const text = (await detail.textContent()) ?? ''
    if (!text.includes('사양') || !text.includes('실시간 상태')) fail(`상세정보 내용: ${text}`)
    console.log(`상세정보: ${name}`)
    await page.waitForTimeout(500)
    await shot('walk-4-detail')
    await page.keyboard.press('Escape')
    await detail.waitFor({ state: 'detached' })
    if (!(await page.locator('.walk-help').isVisible())) fail('Esc 한 번에 시작 화면으로 나감 (패널만 닫혀야 함)')
  }

  // 4-2. 공정이 연결된 설비 (예: Main Station 1) → 상세에 실시간 상태 (돌면서 눌러 봄)
  let linked = false
  for (let turn = 0; turn < 8 && !linked; turn++) {
    for (const fy of [0.55, 0.65]) {
      for (let fx = 0.15; fx < 0.9 && !linked; fx += 0.1) {
        await page.mouse.click(stage.x + stage.width * fx, stage.y + stage.height * fy)
        await page.waitForTimeout(80)
        if (await detail.isVisible()) linked = ((await detail.textContent()) ?? '').includes('실적 ')
      }
      if (linked) break
    }
    if (!linked) {
      await page.mouse.move(cx, cy)
      await page.mouse.down()
      await page.mouse.move(cx - 175, cy, { steps: 5 })
      await page.mouse.up()
      await page.waitForTimeout(400)
    }
  }
  if (!linked) fail('8방향 어디에도 실시간 상태가 나오는 설비가 없음')
  else {
    const name = await detail.getByRole('heading', { level: 2 }).textContent()
    const live = ((await detail.locator('.wd-live').textContent()) ?? '').trim()
    console.log(`실시간 상태: ${name} — ${live}`)
    await page.waitForTimeout(500)
    await shot('walk-4b-live')
  }
  if (await detail.isVisible()) {
    await page.keyboard.press('Escape')
    await detail.waitFor({ state: 'detached' })
  }

  // 5. M 조감 뷰 → 다시 M 이면 걷던 자리
  const before = await pos()
  await page.keyboard.press('m')
  await page.waitForTimeout(3500)
  if (!((await page.locator('.walk-help').textContent()) ?? '').includes('조감 뷰')) fail('M 을 눌러도 조감 뷰 도움말이 아님')
  await shot('walk-5-overview')
  await page.keyboard.press('m')
  await page.waitForTimeout(800)
  const after = await pos()
  if (Math.hypot(after.x - before.x, after.y - before.y) > 0.01) fail(`조감 뷰를 다녀오니 자리가 바뀜 (${before.x},${before.y} → ${after.x},${after.y})`)

  // 6. Esc → 시작 화면
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '입장하기' }).waitFor()
  await page.waitForTimeout(1000)
  await shot('walk-6-exit')

  // 7. 상황판 회귀 (체험에서 나와도 정상)
  await page.getByRole('button', { name: '상황판' }).click()
  await page.waitForURL((u) => u.pathname === '/dashboard')
  await page.locator('.live-badge', { hasText: 'LIVE' }).waitFor({ timeout: 15000 })
  await page.waitForTimeout(4000)
  await shot('walk-7-dashboard-regression')
} catch (e) {
  fail(e.message)
} finally {
  await browser.close()
}
if (pageErrors.length) console.log('브라우저 오류:\n  ' + pageErrors.join('\n  '))
console.log(process.exitCode ? '체험 공간 화면 확인 실패' : '체험 공간 화면 확인 통과')
