import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Flame, GitBranch, Layers, Sparkles } from 'lucide-react'
import { GithubLogo } from '@phosphor-icons/react'
import { authApi, setToken } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { Button } from '@/components/ui/button'

/** Public entry point at "/" — logged-out visitors land here first, not on
 * the login form. Already-authenticated visitors never see this (App.tsx's
 * RootRoute redirects straight to /dashboard). */
export function LandingPage() {
  const { t, lang, setLang } = useI18n()
  const navigate = useNavigate()
  const [demoBusy, setDemoBusy] = useState(false)
  const [demoError, setDemoError] = useState('')

  async function tryDemo() {
    setDemoError('')
    setDemoBusy(true)
    try {
      const res = await authApi.demo()
      setToken(res.token)
      navigate('/dashboard')
    } catch (err) {
      setDemoError(err instanceof Error ? err.message : t('login.error'))
    } finally {
      setDemoBusy(false)
    }
  }

  const features: { Icon: typeof Flame; title: string; desc: string }[] = [
    { Icon: GitBranch, title: t('landing.feature.hierarchy.title'), desc: t('landing.feature.hierarchy.desc') },
    { Icon: Layers, title: t('landing.feature.types.title'), desc: t('landing.feature.types.desc') },
    { Icon: Sparkles, title: t('landing.feature.ai.title'), desc: t('landing.feature.ai.desc') },
    { Icon: Flame, title: t('landing.feature.streaks.title'), desc: t('landing.feature.streaks.desc') },
  ]

  return (
    <div className="min-h-screen bg-background">
      <header className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <img src="/Bonsai.svg" alt="Bonsai" className="h-7 sm:h-8 w-auto dark:brightness-150" />
        <button
          onClick={() => setLang(lang === 'en' ? 'th' : 'en')}
          className="px-2 py-1 rounded text-xs font-semibold text-muted-foreground hover:bg-secondary"
          title={t('settings.language')}
        >
          {lang === 'en' ? 'ไทย' : 'EN'}
        </button>
      </header>

      {/* Hero */}
      <section className="max-w-2xl mx-auto px-4 sm:px-6 pt-10 sm:pt-16 pb-12 text-center space-y-5">
        <h1 className="text-3xl sm:text-5xl font-bold leading-tight text-balance">
          {t('landing.headline')}
        </h1>
        <p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto text-balance">
          {t('landing.subtext')}
        </p>
        {demoError && <p className="text-sm text-destructive">{demoError}</p>}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          {/* Try Demo performs an action (calls the API, then navigates only on
              success) — a <button>. Sign Up/Log In are plain navigation, so
              they're real <a> elements underneath (via asChild) for crawlers
              and accessibility, not onClick-only. */}
          <Button size="lg" variant="accent" onClick={tryDemo} disabled={demoBusy} className="w-full sm:w-auto">
            <Sparkles size={16} /> {demoBusy ? t('login.working') : t('landing.tryDemo')}
          </Button>
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link to="/register">{t('landing.signUp')}</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
            <Link to="/login">{t('landing.logIn')}</Link>
          </Button>
        </div>
      </section>

      {/* Preview */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pb-14">
        <PreviewImage />
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-16">
        <h2 className="text-xl sm:text-2xl font-bold text-center mb-8">{t('landing.featuresTitle')}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ Icon, title, desc }) => (
            <div key={title} className="bg-card rounded-xl border border-border shadow-sm p-5 space-y-2">
              <Icon size={22} className="text-primary" />
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>🌱 Bonsai</span>
          <a
            href="https://github.com/ParinTF/Bonsai"
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 hover:text-foreground hover:underline"
          >
            <GithubLogo size={14} /> {t('landing.footerGithub')}
          </a>
        </div>
      </footer>
    </div>
  )
}

/** Shows web/public/landing/dashboard-preview.png (currently the graph-view
 * screenshot — swap the file to change it, no code change needed) with a
 * friendly fallback if it's ever missing, so the page never looks broken. */
function PreviewImage() {
  const { t } = useI18n()
  const [broken, setBroken] = useState(false)

  if (broken) {
    return (
      <div className="aspect-video rounded-2xl border border-dashed border-border bg-card flex items-center justify-center px-6">
        <p className="text-sm text-muted-foreground text-center">{t('landing.previewPlaceholder')}</p>
      </div>
    )
  }

  return (
    <div className="aspect-video rounded-2xl border border-border bg-card shadow-lg shadow-primary/5 overflow-hidden">
      <img
        src="/landing/dashboard-preview.png"
        alt={t('landing.previewAlt')}
        className="w-full h-full object-cover object-top"
        loading="lazy"
        onError={() => setBroken(true)}
      />
    </div>
  )
}
