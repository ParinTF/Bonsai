import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { getToken } from './lib/api'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { GoalDetailPage } from './pages/GoalDetailPage'
import { TodayPage } from './pages/TodayPage'
import { WeekPage } from './pages/WeekPage'
import { SettingsPage } from './pages/SettingsPage'

function RequireAuth() {
  return getToken() ? <Outlet /> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/goals/:id" element={<GoalDetailPage />} />
          <Route path="/today" element={<TodayPage />} />
          <Route path="/week" element={<WeekPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
