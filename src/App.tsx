import { Component, type ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { FreezersPage } from '@/pages/FreezersPage';
import { FreezerDetailPage } from '@/pages/FreezerDetailPage';
import { BoxDetailPage } from '@/pages/BoxDetailPage';
import { SamplesPage } from '@/pages/SamplesPage';
import { SearchPage } from '@/pages/SearchPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { UsersPage } from '@/pages/UsersPage';
import { BoxesPage } from '@/pages/BoxesPage';
import './App.css';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
          <div className="max-w-lg w-full bg-white border border-gray-200 rounded-xl p-8 text-center shadow-sm">
            <p className="text-red-600 font-semibold text-lg mb-2">Something went wrong</p>
            <p className="text-gray-500 text-sm font-mono">{(this.state.error as Error).message}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-6 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<Navigate to="/login" replace />} />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/freezers"
        element={
          <ProtectedRoute>
            <FreezersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/freezers/:id"
        element={
          <ProtectedRoute>
            <FreezerDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/freezers/:freezerId/box/:boxId"
        element={
          <ProtectedRoute>
            <BoxDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/boxes"
        element={
          <ProtectedRoute>
            <BoxesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/samples"
        element={
          <ProtectedRoute>
            <SamplesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/search"
        element={
          <ProtectedRoute>
            <SearchPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute>
            <ReportsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedRoute>
            <UsersPage />
          </ProtectedRoute>
        }
      />

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
