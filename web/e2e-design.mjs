import os from 'node:os'
import { chromium } from 'playwright'

const shots = os.tmpdir() + '/'
const WEB = process.env.WEB_URL ?? 'http://localhost:5173'
const API = process.env.API_URL ?? 'http://localhost:5264'
const browser = await chromium.launch()

const email = 'design' + Date.now() + '@bonsai.dev'
const reg = await (await fetch(API + '/auth/register', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: 'password123' }),
})).json()
const token = reg.token
const req = (method, path, body) =>
  fetch(API + '' + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(r => r.json())
const post = (path, body) => req('POST', path, body)

// Seed a believable goal tree
const root = await post('/goals', { title: 'Get fit this year', progressType: 'rollup' })
const run = await post('/goals', { title: 'Morning run', progressType: 'daily', parentId: root.id })
const read = await post('/goals', { title: 'Read 20 minutes', progressType: 'daily', parentId: root.id })
const gym = await post('/goals', { title: 'Gym 3x a week', progressType: 'weekly', parentId: root.id })
await post('/goals', { title: 'Train for a 5K', progressType: 'numeric', parentId: run.id, numeric: { target: 5, current: 3.2, unit: 'km' } })
await post('/goals', { title: 'Read 12 books', progressType: 'numeric', numeric: { target: 12, current: 4, unit: 'books' } })

// Weekly history: pass, fail, pass, pass
const monday = (offsetWeeks) => {
  const d = new Date()
  const day = (d.getDay() + 6) % 7 // Monday = 0
  d.setDate(d.getDate() - day - offsetWeeks * 7)
  return d.toISOString().slice(0, 10)
}
for (const [i, result] of ['pass', 'pass', 'fail', 'pass'].entries()) {
  await post(`/goals/${gym.id}/weekly-attempt`, { result, weekOf: monday(i) })
}

// Checkin history across the month for the heatmap (mix of full/partial days)
const days = [...Array(8)].map((_, i) => new Date(Date.now() - i * 86400000).toISOString().slice(0, 10))
for (const [i, d] of days.entries()) {
  await req('PATCH', `/habits/${run.id}/checkin?date=${d}&done=true`)
  if (i % 2 === 0) await req('PATCH', `/habits/${read.id}/checkin?date=${d}&done=true`)
}

async function shoot(viewport, prefix) {
  const page = await browser.newPage({ viewport })
  await page.goto(WEB + '/login')
  await page.screenshot({ path: `${shots}${prefix}-login.png` })
  await page.fill('input[type=email]', email)
  await page.fill('input[type=password]', 'password123')
  await page.click('button[type=submit]')
  await page.waitForURL(WEB + '/')
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${shots}${prefix}-dashboard.png`, fullPage: true })
  await page.click('text=Get fit this year')
  await page.waitForSelector('.react-flow__node')
  await page.waitForTimeout(1400)
  await page.screenshot({ path: `${shots}${prefix}-graph.png` })
  await page.click('a:has-text("Today")')
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${shots}${prefix}-today.png` })
  await page.close()
}

await shoot({ width: 1280, height: 800 }, 'd')
await shoot({ width: 375, height: 720 }, 'm')

await browser.close()
console.log('done')
