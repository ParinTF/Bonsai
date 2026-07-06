import { chromium } from 'playwright'

const shots = 'C:/Users/xibom/AppData/Local/Temp/'
const browser = await chromium.launch()
const page = await browser.newPage()

// Register a fresh user and build a small tree via the API for speed
const email = 'graph' + Date.now() + '@bonsai.dev'
const reg = await (await fetch('http://localhost:5264/auth/register', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: 'password123' }),
})).json()
const token = reg.token
const post = (path, body) =>
  fetch('http://localhost:5264' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(body),
  }).then(r => r.json())

const root = await post('/goals', { title: 'ฟิตร่างกาย', progressType: 'rollup' })
const a = await post('/goals', { title: 'วิ่งทุกวัน', progressType: 'daily', parentId: root.id })
await post('/goals', { title: 'เวท 3 ครั้ง/สัปดาห์', progressType: 'weekly', parentId: root.id })
await post('/goals', { title: 'ซ้อม 5K', progressType: 'numeric', parentId: a.id, numeric: { target: 5, current: 2, unit: 'km' } })

// Login in the browser and open the graph
await page.goto('http://localhost:5173/login')
await page.fill('input[type=email]', email)
await page.fill('input[type=password]', 'password123')
await page.click('button[type=submit]')
await page.waitForURL('http://localhost:5173/')
await page.click('text=ฟิตร่างกาย')
await page.waitForSelector('.react-flow__node')
await page.waitForTimeout(1200)
await page.screenshot({ path: shots + 'g1-graph.png' })

// Click a node -> editor panel opens
await page.click('.react-flow__node:has-text("วิ่งทุกวัน")')
await page.waitForTimeout(600)
await page.screenshot({ path: shots + 'g2-selected.png' })

// Drag a node and confirm the position is persisted
const node = page.locator('.react-flow__node:has-text("เวท 3 ครั้ง")')
const box = await node.boundingBox()
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await page.mouse.down()
await page.mouse.move(box.x + 200, box.y + 120, { steps: 12 })
await page.mouse.up()
await page.waitForTimeout(1000)
await page.screenshot({ path: shots + 'g3-dragged.png' })

// Verify persistence via the API
const goals = await fetch('http://localhost:5264/goals', {
  headers: { Authorization: 'Bearer ' + token },
}).then(r => r.json())
const dragged = goals.find(g => g.title.startsWith('เวท'))
console.log('persisted position:', dragged.positionX, dragged.positionY)
if (dragged.positionX == null) { console.error('POSITION NOT SAVED'); process.exit(1) }

await browser.close()
console.log('done')
