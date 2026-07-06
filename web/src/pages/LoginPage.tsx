import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi, setToken } from '../lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

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
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <form onSubmit={submit} className="bg-card rounded-2xl shadow-lg shadow-primary/5 border border-border p-6 sm:p-8 w-full max-w-sm space-y-4">
        <h1 className="font-heading text-3xl font-bold text-primary text-center">🌱 Bonsai</h1>
        <p className="text-sm text-muted-foreground text-center">
          {mode === 'login' ? 'Sign in to tend your goals' : 'Create a new account'}
        </p>
        <Input
          type="email" required placeholder="Email" value={email}
          onChange={e => setEmail(e.target.value)}
        />
        <Input
          type="password" required minLength={8} placeholder="Password (min 8 characters)" value={password}
          onChange={e => setPassword(e.target.value)}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Sign up'}
        </Button>
        <button
          type="button"
          onClick={() => setMode(m => (m === 'login' ? 'register' : 'login'))}
          className="w-full text-sm text-accent hover:underline"
        >
          {mode === 'login' ? 'No account? Sign up' : 'Have an account? Sign in'}
        </button>
      </form>
    </div>
  )
}
