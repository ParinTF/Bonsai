# Deploying Bonsai (free tier)

เป้าหมาย: ให้ Bonsai ออนไลน์เป็น web app จริงโดย**ไม่เสียเงินเลย** ด้วย stack:

| ส่วน | บริการ | Free tier | หมายเหตุ |
|---|---|---|---|
| Database | **MongoDB Atlas M0** | 512 MB ฟรีถาวร | ใช้ cluster เดิมที่มีอยู่ได้เลย |
| Backend API | **Render** (Docker web service) | ฟรี | ⚠️ sleep หลัง idle 15 นาที — request แรกหลังตื่นช้า ~30–60 วิ |
| Frontend | **Cloudflare Pages** | ฟรีถาวร ไม่ sleep | เสิร์ฟ static build ของ Vite |

> ทางเลือกอื่นที่ใช้แผนเดียวกันได้: frontend ใช้ Netlify/Vercel แทน Cloudflare Pages ได้ทุกเจ้า (ต่างแค่วิธีตั้ง SPA redirect), backend ใช้ Koyeb แทน Render ได้

---

## ภาพรวม

```
ผู้ใช้ ──▶ Cloudflare Pages (React static)  https://bonsai-xxx.pages.dev
              │  fetch API
              ▼
         Render (.NET container)            https://bonsai-api-xxx.onrender.com
              │
              ▼
         MongoDB Atlas M0                   mongodb+srv://...
```

ค่า 2 ตัวที่จะรู้หลัง deploy และต้องอ้างถึงกัน:
- `<API_URL>` = URL ของ Render (เช่น `https://bonsai-api.onrender.com`)
- `<WEB_URL>` = URL ของ Cloudflare Pages (เช่น `https://bonsai.pages.dev`)

ลำดับที่แนะนำ: **Atlas → Render → Cloudflare Pages → Google OAuth** (เพราะ frontend ต้องรู้ URL ของ API ตอน build)

---

## ขั้นที่ 0: Push ขึ้น GitHub

ทั้ง Render และ Cloudflare Pages ดึงโค้ดจาก GitHub

```sh
# สร้าง repo ว่างบน github.com ก่อน (ห้ามติ๊ก initialize with README) แล้ว:
cd c:\Users\xibom\Project\Bonsai
git remote add origin https://github.com/<username>/bonsai.git
git push -u origin master
```

เช็คก่อน push ว่าไม่มี secret หลุด: `.env` ต้องไม่ติดไป (มีใน `.gitignore` แล้ว — ยืนยันด้วย `git status`)

---

## ขั้นที่ 1: MongoDB Atlas

ใช้ cluster `bonsai-dev` เดิมได้เลย หรือสร้างใหม่แยก production ก็ได้ (แนะนำสร้าง database user แยก)

1. เข้า [cloud.mongodb.com](https://cloud.mongodb.com) → เลือก cluster
2. **Network Access** → Add IP Address → **Allow access from anywhere** (`0.0.0.0/0`)
   - จำเป็น เพราะ Render free tier ไม่มี static IP
   - ความปลอดภัยยังอยู่ที่ username/password + TLS
3. **Database Access** → ยืนยันว่ามี user ที่มีสิทธิ์ readWrite → copy connection string:
   `mongodb+srv://<user>:<password>@bonsai-dev.xxxxx.mongodb.net/?appName=bonsai`

---

## ขั้นที่ 2: Backend บน Render

1. สมัคร/login [render.com](https://render.com) ด้วยบัญชี GitHub
2. **New → Web Service** → เลือก repo `bonsai`
3. ตั้งค่า:
   - **Root Directory**: `api/Bonsai.Api`
   - **Runtime**: Docker (Render เจอ `Dockerfile` เอง)
   - **Instance Type**: Free
   - **Region**: Singapore (ใกล้ไทยสุด)
4. **Environment Variables** (ใต้ Advanced หรือหน้า Environment หลังสร้าง):

   | Key | Value |
   |---|---|
   | `Mongo__ConnectionString` | connection string จากขั้นที่ 1 |
   | `Jwt__Key` | random string ยาว 32+ ตัว (สร้างใหม่ อย่าใช้ตัว dev — `openssl rand -base64 48`) |
   | `Cors__AllowedOrigins` | `<WEB_URL>` — ยังไม่รู้ตอนนี้ ใส่ placeholder ไปก่อนแล้วกลับมาแก้หลังขั้นที่ 3 |
   | `Google__ClientId` | (ถ้าใช้ Google login) client id เดียวกับ frontend |

   > สังเกต: ใช้ **double underscore** (`Mongo__ConnectionString`) — เป็น convention ของ .NET สำหรับ nested config
   >
   > **ไม่ต้องตั้ง** `ANTHROPIC_API_KEY` — ระบบเป็น BYOK ผู้ใช้ใส่ key ตัวเองในหน้า Settings และ key ถูกเก็บเข้ารหัสใน Mongo (key ring ก็อยู่ใน Mongo แล้ว รอด restart/deploy)

5. **Create Web Service** → รอ build (~5 นาที) → ได้ URL เช่น `https://bonsai-api.onrender.com`
6. ทดสอบ: เปิด `<API_URL>/health` → ต้องได้ `{"status":"ok"}` และ `<API_URL>/health/db` → `{"db":"ok"}`
   - ถ้า `/health/db` ค้าง/พัง → เช็ค Atlas Network Access กับ connection string อีกรอบ

---

## ขั้นที่ 3: Frontend บน Cloudflare Pages

1. สมัคร/login [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages → Create → Pages → Connect to Git** → เลือก repo
2. ตั้งค่า build:
   - **Framework preset**: None (หรือ Vite ถ้ามีให้เลือก)
   - **Root directory**: `web`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
3. **Environment variables** (สำคัญ — Vite ฝังค่าตอน build):

   | Key | Value |
   |---|---|
   | `VITE_API_URL` | `<API_URL>` จากขั้นที่ 2 (ไม่มี / ปิดท้าย) |
   | `VITE_GOOGLE_CLIENT_ID` | (ถ้าใช้ Google login) client id |

4. สร้างไฟล์ SPA fallback — จำเป็น ไม่งั้น refresh ที่ `/today` จะ 404:
   ```sh
   echo "/* /index.html 200" > web/public/_redirects
   git add web/public/_redirects && git commit -m "Add SPA redirects for Cloudflare Pages" && git push
   ```
5. **Save and Deploy** → ได้ URL เช่น `https://bonsai.pages.dev`
6. **กลับไป Render** → แก้ `Cors__AllowedOrigins` เป็น URL นี้ (เป๊ะๆ รวม https:// ไม่มี / ท้าย) → Render จะ redeploy เอง

ทดสอบ: เปิด `<WEB_URL>` → กด **Try Demo** → ต้องเห็น dashboard พร้อมข้อมูล
(ครั้งแรกอาจรอ ~1 นาที เพราะ Render กำลังตื่นจาก sleep)

---

## ขั้นที่ 4: Google OAuth (ข้ามได้ถ้าไม่ใช้ Google login)

1. [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials) → เลือก OAuth Client ID ที่มีอยู่ (หรือสร้างใหม่ type Web application)
2. **Authorized JavaScript origins** → เพิ่ม `<WEB_URL>` (เช่น `https://bonsai.pages.dev`)
3. ยืนยันว่า `VITE_GOOGLE_CLIENT_ID` (Cloudflare) และ `Google__ClientId` (Render) เป็นค่าเดียวกัน
4. **Retry deployment** บน Cloudflare Pages (env มีผลตอน build เท่านั้น)

---

## ขั้นที่ 5: เก็บงาน

- **README**: แก้ section "Live demo" ใส่ `<WEB_URL>` จริง
- **Custom domain** (ถ้ามี): ผูกได้ฟรีทั้ง Cloudflare Pages และ Render — อย่าลืมอัปเดต `Cors__AllowedOrigins` (comma-separated ได้ เช่น `https://bonsai.pages.dev,https://bonsai.example.com`) และ Google origins
- **Auto-deploy**: ทั้งสองเจ้า deploy อัตโนมัติทุก push ไป master อยู่แล้ว
- **CI**: GitHub Actions จะรัน unit tests + build + Playwright E2E ทุก push (มีอยู่แล้วใน `.github/workflows/ci.yml`)

---

## Troubleshooting

| อาการ | สาเหตุที่พบบ่อย |
|---|---|
| หน้าเว็บขึ้นแต่ข้อมูลไม่โหลด, console มี CORS error | `Cors__AllowedOrigins` บน Render ไม่ตรงกับ URL ของ Pages (เช็ค https/http, trailing slash) |
| Login แล้วเด้งกลับหน้า login | `Jwt__Key` บน Render เปลี่ยนไป (token เก่า invalid) — ผู้ใช้ login ใหม่ได้ปกติ |
| `/health/db` พัง | Atlas Network Access ไม่ได้ allow `0.0.0.0/0` หรือ connection string ผิด |
| Google button ไม่ขึ้น | `VITE_GOOGLE_CLIENT_ID` ไม่ได้ตั้งตอน build → ตั้ง env แล้ว retry deployment |
| Google button ขึ้นแต่กดแล้ว error | โดเมนไม่อยู่ใน Authorized JavaScript origins หรือ backend ไม่มี `Google__ClientId` |
| Request แรกช้ามาก | Render free กำลังตื่นจาก sleep — เป็นเรื่องปกติของ free tier |
| ปุ่ม AI ใช้ไม่ได้หลัง redeploy | ปกติต้องไม่เกิด (key ring อยู่ใน Mongo แล้ว) — ถ้าเกิด ให้ผู้ใช้ Remove key แล้วใส่ใหม่ในหน้า Settings |
| Refresh ที่ /today แล้ว 404 | ไม่มีไฟล์ `web/public/_redirects` (ขั้นที่ 3 ข้อ 4) |
