// 기본 모델 11종을 glb·썸네일로 구워 server/src/main/resources/seed/models/ 에 저장 (Edge 필요)
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(web, '../server/src/main/resources/seed/models')
const server = await createServer({ root: web, server: { port: 5299, strictPort: true }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch({ channel: 'msedge' })
try {
  const page = await browser.newPage()
  page.on('pageerror', (e) => console.error(e))
  await page.goto('http://localhost:5299/bake.html')
  await page.waitForFunction(() => 'bake' in window)
  const list = await page.evaluate(() => window.BUILTIN)
  const meta = []
  for (const m of list) {
    const r = await page.evaluate((k) => window.bake(k), m.key)
    mkdirSync(resolve(out, m.key), { recursive: true })
    writeFileSync(resolve(out, m.key, 'model.glb'), Buffer.from(r.glb, 'base64'))
    writeFileSync(resolve(out, m.key, 'thumb.png'), Buffer.from(r.png, 'base64'))
    meta.push({ ...m, sizeX: r.size[0], sizeY: r.size[1], sizeZ: r.size[2] })
    console.log(m.key, r.size.join(' × '), 'm')
  }
  writeFileSync(resolve(out, '../models.json'), JSON.stringify(meta, null, 2) + '\n')
} finally {
  await browser.close()
  await server.close()
}
