import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { getToken } from './lib/api'
import { Layout } from './components/Layout'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { GoalDetailPage } from './pages/GoalDetailPage'
import { TodayPage } from './pages/TodayPage'
import { WeekPage } from './pages/WeekPage'
import { WeeklyReviewPage } from './pages/WeeklyReviewPage'
import { SettingsPage } from './pages/SettingsPage'

function RequireAuth() {
  return getToken() ? <Outlet /> : <Navigate to="/login" replace />
}

// "/" is the public landing page — already-logged-in visitors skip straight
// to the dashboard instead of seeing it again.
function RootRoute() {
  return getToken() ? <Navigate to="/dashboard" replace /> : <LandingPage />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRoute />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<LoginPage defaultMode="register" />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/goals/:id" element={<GoalDetailPage />} />
          <Route path="/today" element={<TodayPage />} />
          <Route path="/week" element={<WeekPage />} />
          <Route path="/review" element={<WeeklyReviewPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
