import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';

// Carga perezosa: cada página va en su propio chunk, así el bundle inicial
// solo contiene el login y el esqueleto de la app.
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const AcceptInvitePage = lazy(() => import('./pages/AcceptInvitePage').then((m) => ({ default: m.AcceptInvitePage })));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const BoxesPage = lazy(() => import('./pages/BoxesPage').then((m) => ({ default: m.BoxesPage })));
const FreezersPage = lazy(() => import('./pages/FreezersPage').then((m) => ({ default: m.FreezersPage })));
const SearchPage = lazy(() => import('./pages/SearchPage').then((m) => ({ default: m.SearchPage })));
const ReportsPage = lazy(() => import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const UsersPage = lazy(() => import('./pages/UsersPage').then((m) => ({ default: m.UsersPage })));
const FreezerDetailPage = lazy(() => import('./pages/FreezerDetailPage').then((m) => ({ default: m.FreezerDetailPage })));
const BoxDetailPage = lazy(() => import('./pages/BoxDetailPage').then((m) => ({ default: m.BoxDetailPage })));

function RouteFallback() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]" role="status" aria-live="polite">
      <div className="w-10 h-10 rounded-full border-4 border-gray-200 border-t-blue-600 animate-spin" />
      <span className="sr-only">Cargando...</span>
    </div>
  );
}

function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/accept-invite" element={<AcceptInvitePage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Suspense fallback={<RouteFallback />}>
                <Routes>
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/freezers" element={<FreezersPage />} />
                  <Route path="/freezers/:id" element={<FreezerDetailPage />} />
                  <Route path="/box/:boxId" element={<BoxDetailPage />} />
                  <Route path="/freezers/:freezerId/box/:boxId" element={<BoxDetailPage />} />
                  <Route path="/boxes" element={<BoxesPage />} />
                  <Route path="/samples" element={<Navigate to="/search" replace />} />
                  <Route path="/search" element={<SearchPage />} />
                  <Route path="/reports" element={<ReportsPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/profile" element={<ProfilePage />} />
                  <Route path="/users" element={<UsersPage />} />
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
              </Suspense>
            </ProtectedRoute>
          }
        />
      </Routes>
    </Suspense>
  );
}

export default App;
