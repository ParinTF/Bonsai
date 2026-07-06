import { chromium } from 'playwright'

const shots = 'C:/Users/xibom/AppData/Local/Temp/'
const browser = await chromium.launch()
const page = await browser.newPage()

// 1. Register via UI
await page.goto('http://localhost:5173/login')
await page.click('text=ยังไม่มีบัญชี? สมัครสมาชิก')
await page.fill('input[type=email]', 'ui' + Date.now() + '@bonsai.dev')
await page.fill('input[type=password]', 'password123')
await page.click('button[type=submit]')
await page.waitForURL('http://localhost:5173/')
await page.waitForTimeout(500)

// 2. Create root goal (rollup)
await page.fill('input[placeholder*="เพิ่มเป้าหมายใหญ่"]', 'อ่านหนังสือ 12 เล่มปีนี้')
await page.click('button:has-text("เพิ่ม")')
await page.waitForTimeout(800)
await page.screenshot({ path: shots + 's1-dashboard.png' })

// 3. Goal detail: add manual subgoal via the header button
await page.click('text=อ่านหนังสือ 12 เล่มปีนี้')
await page.waitForTimeout(500)
await page.click('button:has-text("+ เพิ่มเป้าย่อย")')
await page.fill('input[placeholder*="ชื่อเป้าย่อย"]', 'อ่านทุกวัน 20 นาที')
await page.selectOption('select', 'daily')
await page.click('form button:has-text("เพิ่ม")')
await page.waitForTimeout(800)
await page.screenshot({ path: shots + 's2-detail.png' })

// 4. Today: check in the habit
await page.click('a:has-text("วันนี้")')
await page.waitForTimeout(500)
await page.click('input[type=checkbox]')
await page.waitForTimeout(800)
await page.screenshot({ path: shots + 's3-today.png' })

// 5. Dashboard: progress should have rolled up
await page.click('a:has-text("เป้าหมาย")')
await page.waitForTimeout(800)
await page.screenshot({ path: shots + 's4-dashboard-after.png' })

await browser.close()
console.log('done')
