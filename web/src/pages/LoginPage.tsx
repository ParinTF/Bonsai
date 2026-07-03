import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi, setToken } from '../lib/api'

export function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const res = mode === 'login'
        ? await authApi.login(email, password)
        : await authApi.register(email, password)
      setToken(res.token)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold text-emerald-700 text-center">🌱 Bonsai</h1>
        <p className="text-sm text-gray-500 text-center">
          {mode === 'login' ? 'เข้าสู่ระบบ' : 'สร้างบัญชีใหม่'}
        </p>
        <input
          type="email" required placeholder="อีเมล" value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <input
          type="password" required minLength={8} placeholder="รหัสผ่าน (อย่างน้อย 8 ตัว)" value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit" disabled={busy}
          className="w-full py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? 'กำลังดำเนินการ…' : mode === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}
        </button>
        <button
          type="button"
          onClick={() => setMode(m => (m === 'login' ? 'register' : 'login'))}
          className="w-full text-sm text-emerald-600 hover:underline"
        >
          {mode === 'login' ? 'ยังไม่มีบัญชี? สมัครสมาชิก' : 'มีบัญชีแล้ว? เข้าสู่ระบบ'}
        </button>
      </form>
    </div>
  )
}
