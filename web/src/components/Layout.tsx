import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LogOut, Moon, Settings, Sparkles, Sun } from 'lucide-react'
import { isDemoToken, setToken } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { Button } from '@/components/ui/button'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `px-2.5 sm:px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
    isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'
  }`

export function Layout() {
  const navigate = useNavigate()
  const { t, lang, setLang } = useI18n()
  const demo = isDemoToken()
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))

  function toggleTheme() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('bonsai_theme', next ? 'dark' : 'light')
  }

  return (
    <div className="min-h-screen bg-background">
      {demo && (
        <div className="bg-accent text-accent-foreground text-sm px-3 py-2 flex items-center justify-center gap-2 flex-wrap">
          <Sparkles size={14} className="shrink-0" />
          <span>{t('banner.demo')}</span>
          <button
            onClick={() => { setToken(null); navigate('/login') }}
            className="underline font-medium hover:opacity-80"
          >
            {t('banner.signup')}
          </button>
        </div>
      )}
      <header className="bg-card/80 backdrop-blur border-b border-border sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-3 sm:px-4 h-14 flex items-center gap-1 sm:gap-2">
          <img src="/Bonsai.svg" alt="Bonsai" className="h-7 sm:h-8 w-auto mr-2 sm:mr-4 dark:brightness-150" />
          <NavLink to="/" end className={linkClass}>{t('nav.goals')}</NavLink>
          <NavLink to="/today" className={linkClass}>{t('nav.today')}</NavLink>
          <NavLink to="/week" className={linkClass}>{t('nav.week')}</NavLink>
          <NavLink to="/review" className={linkClass}>{t('nav.review')}</NavLink>
          <button
            onClick={() => setLang(lang === 'en' ? 'th' : 'en')}
            className="ml-auto px-2 py-1 rounded text-xs font-semibold text-muted-foreground hover:bg-secondary"
            title={t('settings.language')}
          >
            {lang === 'en' ? 'ไทย' : 'EN'}
          </button>
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded text-muted-foreground hover:bg-secondary"
            title={t('settings.theme')}
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <NavLink to="/settings" className={p => `${linkClass(p)} flex items-center`} aria-label="Settings">
            <Settings size={16} />
          </NavLink>
          <Button
            variant="ghost" size="sm"
            onClick={() => { setToken(null); navigate('/login') }}
            className="text-muted-foreground"
            aria-label={t('nav.logout')}
          >
            <LogOut className="sm:hidden" size={16} />
            <span className="hidden sm:inline">{t('nav.logout')}</span>
          </Button>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <Outlet />
      </main>
    </div>
  )
}
