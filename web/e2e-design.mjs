import { chromium } from 'playwright'

const shots = 'C:/Users/xibom/AppData/Local/Temp/'
const browser = await chromium.launch()

const email = 'design' + Date.now() + '@bonsai.dev'
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

const root = await post('/goals', { title: 'ฟิตร่างกายปีนี้', progressType: 'rollup' })
const a = await post('/goals', { title: 'วิ่งทุกวัน', progressType: 'daily', parentId: root.id })
await post('/goals', { title: 'เวท 3 ครั้ง/สัปดาห์', progressType: 'weekly', parentId: root.id })
await post('/goals', { title: 'ซ้อม 5K', progressType: 'numeric', parentId: a.id, numeric: { target: 5, current: 2, unit: 'km' } })
await post('/goals', { title: 'อ่านหนังสือ 12 เล่ม', progressType: 'numeric', numeric: { target: 12, current: 4, unit: 'เล่ม' } })
await fetch(`http://localhost:5264/habits/${a.id}/checkin`, { method: 'PATCH', headers: { Authorization: 'Bearer ' + token } })

async function shoot(viewport, prefix) {
  const page = await browser.newPage({ viewport })
  await page.goto('http://localhost:5173/login')
  await page.screenshot({ path: `${shots}${prefix}-login.png` })
  await page.fill('input[type=email]', email)
  await page.fill('input[type=password]', 'password123')
  await page.click('button[type=submit]')
  await page.waitForURL('http://localhost:5173/')
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${shots}${prefix}-dashboard.png` })
  await page.click('text=ฟิตร่างกายปีนี้')
  await page.waitForSelector('.react-flow__node')
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${shots}${prefix}-graph.png` })
  await page.click('a:has-text("วันนี้")')
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${shots}${prefix}-today.png` })
  await page.close()
}

await shoot({ width: 1280, height: 800 }, 'd')
await shoot({ width: 375, height: 720 }, 'm')

await browser.close()
console.log('done')
