import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { needsPasswordSetup } from '@/lib/authCallback';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  const [mustSetPassword, setMustSetPassword] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setMustSetPassword(false);
      return;
    }
    supabase.auth.getUser().then(({ data: { user } }) => {
      setMustSetPassword(needsPasswordSetup(user));
    });
  }, [isAuthenticated]);

  if (isLoading || (isAuthenticated && mustSetPassword === null)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-4 border-slate-700 border-t-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (mustSetPassword) {
    return <Navigate to="/accept-invite" replace />;
  }

  return <>{children}</>;
}
