import { Navigate, type RouteObject } from 'react-router'
import { RequireAuth } from './auth/RequireAuth'
import { AdminLayout } from './pages/admin/AdminLayout'
import { AuditPage } from './pages/admin/AuditPage'
import { DashboardPage } from './pages/DashboardPage'
import { DrawingsPage } from './pages/admin/DrawingsPage'
import { LoginHistoryPage } from './pages/admin/LoginHistoryPage'
import { ModelsPage } from './pages/admin/ModelsPage'
import { StationsPage } from './pages/admin/StationsPage'
import { UsersPage } from './pages/admin/UsersPage'
import { ErrorPage } from './pages/ErrorPage'
import { FactoryPage } from './pages/FactoryPage'
import { LoginPage } from './pages/LoginPage'
import { PasswordPage } from './pages/PasswordPage'

// errorElement = 화면을 그리다 난 예외 → 500 페이지. 로그인 화면 말고는 모두 로그인 필요
export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/password', element: <RequireAuth><PasswordPage /></RequireAuth> },
  { path: '/', element: <RequireAuth><FactoryPage /></RequireAuth>, errorElement: <ErrorPage code="500" /> },
  { path: '/dashboard', element: <RequireAuth><DashboardPage /></RequireAuth>, errorElement: <ErrorPage code="500" /> },
  {
    path: '/admin',
    element: <RequireAuth role="ADMIN"><AdminLayout /></RequireAuth>,
    errorElement: <ErrorPage code="500" />,
    children: [
      { index: true, element: <Navigate to="users" replace /> },
      { path: 'users', element: <UsersPage /> },
      { path: 'login-history', element: <LoginHistoryPage /> },
      { path: 'audit', element: <AuditPage /> },
      { path: 'drawings', element: <DrawingsPage /> },
      { path: 'models', element: <ModelsPage /> },
      { path: 'stations', element: <StationsPage /> },
    ],
  },
  { path: '*', element: <ErrorPage code="404" /> },
]
