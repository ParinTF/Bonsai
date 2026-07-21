import os from 'node:os'
import { chromium } from 'playwright'

const shots = os.tmpdir() + '/'
const WEB = process.env.WEB_URL ?? 'http://localhost:5173'
const API = process.env.API_URL ?? 'http://localhost:5264'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

const email = 'dash' + Date.now() + '@bonsai.dev'
const reg = await (await fetch(API + '/auth/register', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: 'password123' }),
})).json()
const token = reg.token
const post = (path, body) =>
  fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(body),
  }).then(r => r.json())

// Seed: root goal, 2 daily habits, 1 weekly goal with history
const root = await post('/goals', { title: 'Get fit this year', progressType: 'rollup' })
const h1 = await post('/goals', { title: 'Morning run', progressType: 'daily', parentId: root.id })
const h2 = await post('/goals', { title: 'Read 20 minutes', progressType: 'daily', parentId: root.id })
const w = await post('/goals', { title: 'Gym 3x this week', progressType: 'weekly', parentId: root.id })
// 4 weeks of history: pass, fail, pass, pass
for (const [weekOf, result] of [['2026-06-15','pass'],['2026-06-22','fail'],['2026-06-29','pass'],['2026-07-06','pass']]) {
  await post(`/goals/${w.id}/weekly-attempt`, { result, weekOf })
}

// Login and view dashboard
await page.goto(WEB + '/login')
await page.fill('input[type=email]', email)
await page.fill('input[type=password]', 'password123')
await page.click('button[type=submit]')
await page.waitForURL(WEB + '/dashboard')
await page.waitForTimeout(1000)
await page.screenshot({ path: shots + 'dash1-initial.png' })

// Check both habits directly on the dashboard (no reload)
const boxes = page.locator('section:has(h1:has-text("Today")) [role=checkbox]')
await boxes.nth(0).click()
await page.waitForTimeout(600)
await boxes.nth(1).click()
await page.waitForTimeout(900)
await page.screenshot({ path: shots + 'dash2-alldone.png' })

// Assert the celebration banner appeared without a reload
const banner = await page.locator('text=All done for today!').count()
console.log('celebration banner visible:', banner === 1)
if (banner !== 1) process.exit(1)

// Assert 4 history dots are rendered on the weekly card
const dots = await page.locator('section:has(h2:has-text("This Week")) span[title*=": "]').count()
console.log('history dots:', dots)
if (dots !== 4) process.exit(1)

await browser.close()
console.log('done')
