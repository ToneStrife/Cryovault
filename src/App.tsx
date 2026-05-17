import { Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { BoxesPage } from './pages/BoxesPage';
import { FreezersPage } from './pages/FreezersPage';
import { SamplesPage } from './pages/SamplesPage';
import { SearchPage } from './pages/SearchPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { UsersPage } from './pages/UsersPage';
import { FreezerDetailPage } from './pages/FreezerDetailPage';
import { BoxDetailPage } from './pages/BoxDetailPage';
import { AppLayout } from './components/AppLayout';
import { ProtectedRoute } from './components/ProtectedRoute';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppLayout>
              <Routes>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/freezers" element={<FreezersPage />} />
                <Route path="/freezers/:id" element={<FreezerDetailPage />} />
                <Route path="/freezers/:freezerId/box/:boxId" element={<BoxDetailPage />} />
                <Route path="/boxes" element={<BoxesPage />} />
                <Route path="/samples" element={<SamplesPage />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/users" element={<UsersPage />} />
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </AppLayout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default App;