import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { authApi, setToken } from '../lib/api'
import { googleClientId } from '../main'
import { useI18n } from '../lib/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function LoginPage({ defaultMode = 'login' }: { defaultMode?: 'login' | 'register' }) {
  const { t } = useI18n()
  const [mode, setMode] = useState<'login' | 'register'>(defaultMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  async function googleSignIn(idToken: string) {
    setError('')
    setBusy(true)
    try {
      const res = await authApi.google(idToken)
      setToken(res.token)
      navigate('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.error'))
    } finally {
      setBusy(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const res = mode === 'login'
        ? await authApi.login(email, password)
        : await authApi.register(email, password)
      setToken(res.token)
      navigate('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <form onSubmit={submit} className="bg-card rounded-2xl shadow-lg shadow-primary/5 border border-border p-6 sm:p-8 w-full max-w-sm space-y-4">
        <h1 className="flex justify-center">
          <Link to="/">
            <img src="/Bonsai.svg" alt="Bonsai" className="h-12 w-auto" />
          </Link>
        </h1>
        <p className="text-sm text-muted-foreground text-center">
          {mode === 'login' ? t('login.tagline') : t('login.taglineRegister')}
        </p>
        <Input
          type="email" required placeholder={t('login.email')} value={email}
          onChange={e => setEmail(e.target.value)}
        />
        <Input
          type="password" required minLength={8} placeholder={t('login.password')} value={password}
          onChange={e => setPassword(e.target.value)}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? t('login.working') : mode === 'login' ? t('login.signin') : t('login.signup')}
        </Button>
        <Button
          type="button" variant="accent" disabled={busy} className="w-full"
          onClick={async () => {
            setError('')
            setBusy(true)
            try {
              const res = await authApi.demo()
              setToken(res.token)
              navigate('/dashboard')
            } catch (err) {
              setError(err instanceof Error ? err.message : t('login.error'))
            } finally {
              setBusy(false)
            }
          }}
        >
          {t('login.demo')}
        </Button>
        {googleClientId && (
          <>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">{t('login.or')}</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="flex justify-center">
              <GoogleLogin
                onSuccess={cred => { if (cred.credential) googleSignIn(cred.credential) }}
                onError={() => setError(t('login.error'))}
              />
            </div>
          </>
        )}
        <button
          type="button"
          onClick={() => setMode(m => (m === 'login' ? 'register' : 'login'))}
          className="w-full text-sm text-accent hover:underline"
        >
          {mode === 'login' ? t('login.toSignup') : t('login.toSignin')}
        </button>
      </form>
    </div>
  )
}
