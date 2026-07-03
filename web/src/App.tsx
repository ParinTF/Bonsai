import { useState } from 'react'
import './index.css'

const API = 'http://localhost:5264'

type Status = 'idle' | 'loading' | 'ok' | 'error'

export default function App() {
  const [status, setStatus] = useState<Status>('idle')
  const [detail, setDetail] = useState('')

  async function ping() {
    setStatus('loading')
    setDetail('')
    try {
      const res = await fetch(`${API}/health`)
      const data = await res.json()
      setStatus('ok')
      setDetail(JSON.stringify(data, null, 2))
    } catch (e) {
      setStatus('error')
      setDetail(String(e))
    }
  }

  const badge: Record<Status, string> = {
    idle: 'bg-gray-100 text-gray-500',
    loading: 'bg-yellow-100 text-yellow-700',
    ok: 'bg-green-100 text-green-700',
    error: 'bg-red-100 text-red-700',
  }

  const label: Record<Status, string> = {
    idle: 'idle',
    loading: 'pinging…',
    ok: 'connected',
    error: 'error',
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-white">
      <h1 className="text-3xl font-semibold text-gray-800">Bonsai</h1>

      <span className={`px-3 py-1 rounded-full text-sm font-medium ${badge[status]}`}>
        {label[status]}
      </span>

      <button
        onClick={ping}
        disabled={status === 'loading'}
        className="px-5 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors cursor-pointer"
      >
        Ping /health
      </button>

      {detail && (
        <pre className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-700">
          {detail}
        </pre>
      )}
    </div>
  )
}
