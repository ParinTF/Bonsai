import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LogOut, Sparkles } from 'lucide-react'
import { isDemoToken, setToken } from '../lib/api'
import { Button } from '@/components/ui/button'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `px-2.5 sm:px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
    isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'
  }`

export function Layout() {
  const navigate = useNavigate()
  const demo = isDemoToken()
  return (
    <div className="min-h-screen bg-background">
      {demo && (
        <div className="bg-accent text-accent-foreground text-sm px-3 py-2 flex items-center justify-center gap-2 flex-wrap">
          <Sparkles size={14} className="shrink-0" />
          <span>You're viewing a demo — sign up to save your own goals</span>
          <button
            onClick={() => { setToken(null); navigate('/login') }}
            className="underline font-medium hover:opacity-80"
          >
            Sign up
          </button>
        </div>
      )}
      <header className="bg-card/80 backdrop-blur border-b border-border sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-3 sm:px-4 h-14 flex items-center gap-1 sm:gap-2">
          <img src="/Bonsai.svg" alt="Bonsai" className="h-7 sm:h-8 w-auto mr-2 sm:mr-4" />
          <NavLink to="/" end className={linkClass}>Goals</NavLink>
          <NavLink to="/today" className={linkClass}>Today</NavLink>
          <NavLink to="/week" className={linkClass}>This Week</NavLink>
          <Button
            variant="ghost" size="sm"
            onClick={() => { setToken(null); navigate('/login') }}
            className="ml-auto text-muted-foreground"
            aria-label="Log out"
          >
            <LogOut className="sm:hidden" size={16} />
            <span className="hidden sm:inline">Log out</span>
          </Button>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <Outlet />
      </main>
    </div>
  )
}
