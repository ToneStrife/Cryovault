import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CircleAlert as AlertCircle, Snowflake } from 'lucide-react';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { signIn } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await signIn(email, password);
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
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
                disabled={isLoading}
                className="bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Contraseña</label>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                className="bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 focus:ring-blue-500"
              />
            </div>

            <Button
              type="submit"
              disabled={isLoading || !email || !password}
              className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-semibold py-2.5 rounded-lg transition-all shadow-sm"
            >
              {isLoading ? 'Cargando...' : 'Iniciar sesión'}
            </Button>
          </form>

          <div className="mt-6 pt-5 border-t border-gray-100">
            <p className="text-xs text-gray-400 text-center">
              El acceso es solo por invitación. Contacta con tu administrador para obtener acceso.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
