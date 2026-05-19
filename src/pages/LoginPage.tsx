import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { hasAuthCallbackInUrl } from '@/lib/appUrl';
import { needsPasswordSetup } from '@/lib/authCallback';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CircleAlert as AlertCircle, Snowflake } from 'lucide-react';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { signIn, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string; search?: string; hash?: string } })?.from;

  useEffect(() => {
    if (hasAuthCallbackInUrl()) {
      navigate('/accept-invite', { replace: true });
      return;
    }
    if (isAuthenticated) {
      const target = from
        ? `${from.pathname}${from.search ?? ''}${from.hash ?? ''}`
        : '/dashboard';
      navigate(target, { replace: true });
    }
  }, [isAuthenticated, navigate, from]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await signIn(email, password);
      const { data: { user } } = await supabase.auth.getUser();
      if (user && needsPasswordSetup(user)) {
        navigate('/accept-invite', { replace: true });
        return;
      }
      const target = from
        ? `${from.pathname}${from.search ?? ''}${from.hash ?? ''}`
        : '/dashboard';
      navigate(target, { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2.5 mb-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-200">
              <Snowflake className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold text-gray-900">
              Cryo<span className="bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">Vault</span>
            </span>
          </div>
          <p className="text-gray-500 text-sm">Gestión inteligente de muestras biológicas</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl shadow-xl shadow-gray-100/50 p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Iniciar sesión</h2>

          {error && (
            <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-lg flex gap-3 items-start">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <Input
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
                required
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-gray-700">Contraseña</label>
                <Link to="/forgot-password" className="text-xs text-blue-600 hover:underline">
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                required
              />
            </div>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-semibold py-2.5 rounded-lg transition-all shadow-sm"
            >
              {isSubmitting ? 'Accediendo...' : 'Iniciar sesión'}
            </Button>
          </form>

          <p className="mt-5 text-center text-xs text-gray-500">
            ¿Primera vez? Usa el enlace del email de invitación que te envió tu administrador.
          </p>
        </div>
      </div>
    </div>
  );
}