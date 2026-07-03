import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { setToken } from '../lib/api'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
    isActive ? 'bg-emerald-100 text-emerald-800' : 'text-gray-600 hover:bg-gray-100'
  }`

export function Layout() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-2">
          <span className="text-lg font-semibold text-emerald-700 mr-4">🌱 Bonsai</span>
          <NavLink to="/" end className={linkClass}>เป้าหมาย</NavLink>
          <NavLink to="/today" className={linkClass}>วันนี้</NavLink>
          <NavLink to="/week" className={linkClass}>สัปดาห์นี้</NavLink>
          <button
            onClick={() => { setToken(null); navigate('/login') }}
            className="ml-auto text-sm text-gray-400 hover:text-gray-600"
          >
            ออกจากระบบ
          </button>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
