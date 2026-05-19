import { Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { AcceptInvitePage } from './pages/AcceptInvitePage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { DashboardPage } from './pages/DashboardPage';
import { BoxesPage } from './pages/BoxesPage';
import { FreezersPage } from './pages/FreezersPage';
import { SearchPage } from './pages/SearchPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { ProfilePage } from './pages/ProfilePage';
import { UsersPage } from './pages/UsersPage';
import { FreezerDetailPage } from './pages/FreezerDetailPage';
import { BoxDetailPage } from './pages/BoxDetailPage';
import { ProtectedRoute } from './components/ProtectedRoute';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/accept-invite" element={<AcceptInvitePage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
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
            </Routes>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default App;