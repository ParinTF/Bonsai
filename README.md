# 🌱 Bonsai

เว็บแอปจัดการเป้าหมายแบบลำดับชั้น — แตกเป้าใหญ่เป็นเป้าย่อยจนถึง action รายสัปดาห์/รายวัน พร้อมคำนวณ progress อัตโนมัติและ AI ช่วยแตกเป้า

## Stack

- **Backend** — ASP.NET Core (.NET 10) minimal API + MongoDB Atlas + JWT auth (`api/Bonsai.Api`)
- **Frontend** — React + TypeScript + Vite + Tailwind v4 + TanStack Query + React Router (`web/`)
- **AI** — Anthropic API (structured outputs) สำหรับ `POST /goals/breakdown`

## Setup

### Backend

ตั้งค่า secrets (ครั้งเดียว):

```sh
cd api/Bonsai.Api
dotnet user-secrets set "Mongo:ConnectionString" "mongodb+srv://..."
dotnet user-secrets set "Jwt:Key" "<random string ยาวๆ อย่างน้อย 32 ตัว>"
dotnet user-secrets set "Anthropic:ApiKey" "sk-ant-..."   # สำหรับปุ่มแตกเป้าด้วย AI
```

รัน:

```sh
cd api/Bonsai.Api
dotnet run --launch-profile http   # http://localhost:5264
```

> ถ้าเชื่อม Atlas ไม่ได้ (TLS/timeout) ให้เช็ค **Network Access → IP allowlist** ใน Atlas ว่ามี IP ปัจจุบันของเครื่อง

### Frontend

```sh
cd web
npm install
npm run dev   # http://localhost:5173
```

## Endpoints หลัก

| Method | Path | คำอธิบาย |
|---|---|---|
| POST | `/auth/register`, `/auth/login` | คืน JWT (อายุ 7 วัน) |
| GET | `/goals` | goal tree ทั้งหมดพร้อม progress คำนวณแล้ว |
| POST | `/goals` | สร้างเป้า (`title`, `parentId?`, `progressType`) |
| PATCH | `/goals/{id}` | แก้ title/status/stages/numeric/progress/order |
| DELETE | `/goals/{id}` | ลบทั้ง subtree (รวม checkins/attempts) |
| GET | `/goals/this-week` | เป้า weekly ที่ active |
| GET | `/today` | habit รายวัน + สถานะ checkin + streak |
| PATCH | `/habits/{id}/checkin?date=` | toggle checkin (default วันนี้) |
| POST | `/goals/{id}/weekly-attempt` | บันทึก `{"result": "pass"\|"fail"}` (upsert ต่อสัปดาห์) |
| POST | `/goals/breakdown` | AI แตกเป้าเป็น tree สูงสุด 3 ชั้น จบด้วย weekly/daily |

## progressType ทั้ง 7 แบบ

| type | การคำนวณ progress |
|---|---|
| `stages` | % ของ stages ที่ done |
| `numeric` | current / target |
| `checklist` | % ของ children ที่ status = done |
| `manual` | กรอกเอง 0–100 |
| `rollup` | เฉลี่ย progress ของ children |
| `daily` | % วันที่ checkin ใน 7 วันล่าสุด |
| `weekly` | % pass จาก attempt 4 สัปดาห์ล่าสุด |

โครงสร้าง tree ใช้ `parentId` + `ancestors` array (query ทั้ง subtree ได้ใน query เดียว)
