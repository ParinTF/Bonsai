// Regenerates the three README screenshots (docs/screenshots/*.png) against a
// freshly seeded account, so the images stay in sync with the current UI.
// Run by the "screenshots" CI job on every push to main/master — see
// .github/workflows/ci.yml. Seed dates are all computed relative to "today"
// so this keeps working indefinitely (never hardcode calendar dates here).
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '..', 'docs', 'screenshots')
const WEB = process.env.WEB_URL ?? 'http://localhost:5173'
const API = process.env.API_URL ?? 'http://localhost:5264'

const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return fmt(d) }
const mondayOf = d => { const c = new Date(d); c.setDate(c.getDate() - ((c.getDay() + 6) % 7)); return c }

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

const email = 'readme-shots-' + Date.now() + '@bonsai.dev'
const reg = await (await fetch(API + '/auth/register', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: 'password123' }),
})).json()
const token = reg.token
const call = (method, p, body) =>
  fetch(API + p, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }).then(r => r.json())
const post = (p, body) => call('POST', p, body)
const checkin = (goalId, date) => call('PATCH', `/habits/${goalId}/checkin?date=${date}`)

// ---- Seed a goal tree matching the shape of the committed screenshots ----

const root = await post('/goals', { title: 'Get fit this year', progressType: 'rollup' })
const morningRun = await post('/goals', { title: 'Morning run', progressType: 'daily', parentId: root.id })
const readBooks20 = await post('/goals', { title: 'Read 20 minutes', progressType: 'daily', parentId: root.id })
const gym = await post('/goals', { title: 'Gym 3x a week', progressType: 'weekly', parentId: root.id })
await post('/goals', {
  title: 'Train for a 5K', progressType: 'numeric', parentId: morningRun.id,
  numeric: { target: 5, current: 3.2, unit: 'km' },
})
await post('/goals', {
  title: 'Read 12 books', progressType: 'numeric',
  numeric: { target: 12, current: 4, unit: 'books' },
})

// Morning run: 8 consecutive days including today -> streak 8, daily% 100 (7/7 last week)
for (let i = 0; i <= 7; i++) await checkin(morningRun.id, daysAgo(i))
// Read 20 minutes: today + every other day -> streak 1 (yesterday not checked), daily% ~57 (4/7)
for (const i of [0, 2, 4, 6]) await checkin(readBooks20.id, daysAgo(i))

// Gym 3x a week: 4 recorded weeks. weeks[0] = this week, weeks[3] = oldest.
// results are indexed the same way, so oldest -> newest reads pass, fail, pass, pass (75%).
const thisMonday = mondayOf(new Date())
const weeks = [0, 1, 2, 3].map(n => { const d = new Date(thisMonday); d.setDate(d.getDate() - 7 * n); return fmt(d) })
const results = ['pass', 'pass', 'fail', 'pass'] // [thisWeek, -1wk, -2wk, -3wk]
for (let i = 0; i < weeks.length; i++) {
  await post(`/goals/${gym.id}/weekly-attempt`, { result: results[i], weekOf: weeks[i] })
}

// ---- Log in and capture ----

await page.goto(WEB + '/login')
await page.fill('input[type=email]', email)
await page.fill('input[type=password]', 'password123')
await page.click('button[type=submit]')
await page.waitForURL(WEB + '/')
await page.waitForTimeout(1000)
await page.screenshot({ path: path.join(OUT, 'dashboard.png'), fullPage: true })

await page.goto(WEB + '/today')
await page.waitForTimeout(600)
await page.screenshot({ path: path.join(OUT, 'today.png') })

// Go straight to the goal's URL — a text= click is ambiguous now that the
// dashboard's To Do section also mentions root goal titles in breadcrumbs.
await page.goto(WEB + '/goals/' + root.id)
await page.waitForSelector('.react-flow__node')
await page.waitForTimeout(1200)
await page.screenshot({ path: path.join(OUT, 'goal-graph.png') })

await browser.close()
console.log('README screenshots refreshed in', OUT)
