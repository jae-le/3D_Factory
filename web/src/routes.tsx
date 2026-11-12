import type { RouteObject } from 'react-router'
import { RequireAuth } from './auth/RequireAuth'
import { ErrorPage } from './pages/ErrorPage'
import { FactoryPage } from './pages/FactoryPage'
import { LoginPage } from './pages/LoginPage'
import { PasswordPage } from './pages/PasswordPage'

// errorElement = 화면을 그리다 난 예외 → 500 페이지. 로그인 화면 말고는 모두 로그인 필요
export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/password', element: <RequireAuth><PasswordPage /></RequireAuth> },
  { path: '/', element: <RequireAuth><FactoryPage /></RequireAuth>, errorElement: <ErrorPage code="500" /> },
  { path: '*', element: <ErrorPage code="404" /> },
]
