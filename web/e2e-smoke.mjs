import os from 'node:os'
import { chromium } from 'playwright'

const shots = os.tmpdir() + '/'
const WEB = process.env.WEB_URL ?? 'http://localhost:5173'
const API = process.env.API_URL ?? 'http://localhost:5264'
const browser = await chromium.launch()
const page = await browser.newPage()

// 1. Register via UI
await page.goto(WEB + '/login')
await page.click('text=No account? Sign up')
await page.fill('input[type=email]', 'ui' + Date.now() + '@bonsai.dev')
await page.fill('input[type=password]', 'password123')
await page.click('button[type=submit]')
await page.waitForURL(WEB + '/dashboard')
await page.waitForTimeout(500)

// 2. Create root goal (rollup)
await page.fill('input[placeholder*="Add a big goal"]', 'อ่านหนังสือ 12 เล่มปีนี้')
await page.click('button:has-text("Add")')
await page.waitForTimeout(800)
await page.screenshot({ path: shots + 's1-dashboard.png' })

// 3. Goal detail: add manual subgoal via the header button
await page.click('text=อ่านหนังสือ 12 เล่มปีนี้')
await page.waitForTimeout(500)
await page.click('button:has-text("Add subgoal")')
await page.fill('input[placeholder*="Subgoal title"]', 'อ่านทุกวัน 20 นาที')
await page.selectOption('select', 'daily')
await page.waitForTimeout(300) // let React state settle before submitting
await page.click('form button:has-text("Add")')
await page.waitForTimeout(800)
await page.screenshot({ path: shots + 's2-detail.png' })

// 4. Today: check in the habit
await page.click('a:has-text("Today")')
await page.waitForTimeout(500)
await page.click('[role=checkbox]')
await page.waitForTimeout(800)
await page.screenshot({ path: shots + 's3-today.png' })

// 5. Dashboard: progress should have rolled up
await page.click('a:has-text("Goals")')
await page.waitForTimeout(800)
await page.screenshot({ path: shots + 's4-dashboard-after.png' })

await browser.close()
console.log('done')
