import { Suspense, lazy } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { getToken } from './lib/api'
import { useI18n } from './lib/i18n'
import { Layout } from './components/Layout'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'

// Everything behind login is lazy: the public landing page (what search
// engines and first-time link-shares actually load) has no reason to pay
// for React Flow, Dagre, and five other authenticated pages up front.
const DashboardPage = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })))
const GoalDetailPage = lazy(() => import('./pages/GoalDetailPage').then(m => ({ default: m.GoalDetailPage })))
const TodayPage = lazy(() => import('./pages/TodayPage').then(m => ({ default: m.TodayPage })))
const WeekPage = lazy(() => import('./pages/WeekPage').then(m => ({ default: m.WeekPage })))
const WeeklyReviewPage = lazy(() => import('./pages/WeeklyReviewPage').then(m => ({ default: m.WeeklyReviewPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })))

function RequireAuth() {
  return getToken() ? <Outlet /> : <Navigate to="/login" replace />
}

function PageFallback() {
  const { t } = useI18n()
  return <p className="text-muted-foreground">{t('common.loading')}</p>
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
          <Route
            path="/dashboard"
            element={<Suspense fallback={<PageFallback />}><DashboardPage /></Suspense>}
          />
          <Route
            path="/goals/:id"
            element={<Suspense fallback={<PageFallback />}><GoalDetailPage /></Suspense>}
          />
          <Route
            path="/today"
            element={<Suspense fallback={<PageFallback />}><TodayPage /></Suspense>}
          />
          <Route
            path="/week"
            element={<Suspense fallback={<PageFallback />}><WeekPage /></Suspense>}
          />
          <Route
            path="/review"
            element={<Suspense fallback={<PageFallback />}><WeeklyReviewPage /></Suspense>}
          />
          <Route
            path="/settings"
            element={<Suspense fallback={<PageFallback />}><SettingsPage /></Suspense>}
          />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
