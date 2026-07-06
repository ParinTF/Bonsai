import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { setToken } from '../lib/api'
import { Button } from '@/components/ui/button'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `px-2.5 sm:px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
    isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'
  }`

export function Layout() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card/80 backdrop-blur border-b border-border sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-3 sm:px-4 h-14 flex items-center gap-1 sm:gap-2">
          <span className="font-heading text-lg font-bold text-primary mr-2 sm:mr-4">🌱 Bonsai</span>
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
