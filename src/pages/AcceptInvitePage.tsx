import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import {
  establishSessionFromUrl,
  needsPasswordSetup,
} from '@/lib/authCallback';
import { getAuthHashType } from '@/lib/appUrl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle, Snowflake } from 'lucide-react';

type PageState = 'loading' | 'ready' | 'invalid' | 'done';

export function AcceptInvitePage() {
  const navigate = useNavigate();
  const [pageState, setPageState] = useState<PageState>('loading');
  const [email, setEmail] = useState('');
  const [flowType, setFlowType] = useState<'invite' | 'recovery' | 'other'>('invite');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | undefined;
    let subscription: { unsubscribe: () => void } | undefined;

    const applySession = async () => {
      const type = getAuthHashType();
      if (type === 'recovery') setFlowType('recovery');
      else if (type === 'invite' || type === 'signup' || type === 'magiclink') setFlowType('invite');
      else setFlowType('other');

      const { session, error: sessionError } = await establishSessionFromUrl();
      if (cancelled) return;

      if (sessionError) {
        setError(sessionError);
        setPageState('invalid');
        return;
      }

      if (session?.user?.email) {
        setEmail(session.user.email);
        const authType = getAuthHashType();
        if (authType !== 'recovery' && !needsPasswordSetup(session.user)) {
          const hasProfile = await ensureProfile(session.user.id);
          if (hasProfile) {
            navigate('/dashboard', { replace: true });
            return;
          }
        }
        setPageState('ready');
        return;
      }

      timeoutId = window.setTimeout(async () => {
        if (cancelled) return;
        const retry = await establishSessionFromUrl();
        if (retry.session?.user?.email) {
          setEmail(retry.session.user.email);
          setPageState('ready');
        } else {
          setPageState('invalid');
        }
      }, 3000);

      const { data: { subscription: sub } } = supabase.auth.onAuthStateChange((_event, newSession) => {
        if (cancelled || !newSession?.user?.email) return;
        setEmail(newSession.user.email);
        setPageState('ready');
        if (timeoutId) window.clearTimeout(timeoutId);
      });
      subscription = sub;
    };

    applySession();

    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      subscription?.unsubscribe();
    };
  }, [navigate]);

  const validatePasswords = () => {
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres');
      return false;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return false;
    }
    return true;
  };

  const ensureProfile = async (userId: string) => {
    const { data, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();
    if (profileError) throw profileError;
    return !!data;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!validatePasswords()) return;

    setIsSubmitting(true);
    try {
      const { data: { user: before } } = await supabase.auth.getUser();
      const meta = before?.user_metadata ?? {};

      const { error: updateError } = await supabase.auth.updateUser({
        password,
        data: {
          ...meta,
          needs_password_setup: false,
        },
      });
      if (updateError) throw updateError;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No se pudo verificar la sesión');

      const hasProfile = await ensureProfile(user.id);
      if (!hasProfile) {
        throw new Error(
          'Tu cuenta no tiene perfil asignado. Contacta al administrador del laboratorio.',
        );
      }

      window.history.replaceState(null, '', window.location.pathname);
      setPageState('done');
      navigate('/dashboard', { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar la contraseña');
    } finally {
      setIsSubmitting(false);
    }
  };

  const title =
    flowType === 'recovery' ? 'Nueva contraseña' : 'Activar tu cuenta';
  const subtitle =
    flowType === 'recovery'
      ? 'Elige una contraseña nueva para tu cuenta'
      : 'Crea tu contraseña para acceder a CryoVault';
  const submitLabel =
    flowType === 'recovery' ? 'Guardar contraseña' : 'Activar cuenta';

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
          <p className="text-gray-500 text-sm">{subtitle}</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl shadow-xl shadow-gray-100/50 p-8">
          {pageState === 'loading' && (
            <div className="text-center py-8">
              <div className="w-10 h-10 rounded-full border-4 border-gray-200 border-t-blue-600 animate-spin mx-auto mb-4" />
              <p className="text-sm text-gray-500">Verificando enlace...</p>
            </div>
          )}

          {pageState === 'invalid' && (
            <div className="text-center space-y-4">
              <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
              <h2 className="text-lg font-semibold text-gray-900">Enlace inválido o caducado</h2>
              <p className="text-sm text-gray-600">
                {error ||
                  'Pide a un administrador que te reenvíe la invitación o usa «Olvidé mi contraseña» si ya tenías cuenta.'}
              </p>
              <Link
                to="/login"
                className="inline-block text-sm text-blue-600 hover:underline font-medium"
              >
                Ir a iniciar sesión
              </Link>
            </div>
          )}

          {pageState === 'ready' && (
            <>
              <h2 className="text-xl font-bold text-gray-900 mb-6">{title}</h2>

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
                    value={email}
                    readOnly
                    disabled
                    className="text-gray-600 bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Contraseña</label>
                  <Input
                    type="password"
                    placeholder="Mínimo 8 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isSubmitting}
                    required
                    minLength={8}
                    autoFocus
                    className="text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirmar contraseña</label>
                  <Input
                    type="password"
                    placeholder="Repite la contraseña"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={isSubmitting}
                    required
                    minLength={8}
                    className="text-gray-900"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-semibold py-2.5"
                >
                  {isSubmitting ? 'Guardando...' : submitLabel}
                </Button>
              </form>

              <p className="mt-4 text-center text-sm text-gray-500">
                <Link to="/login" className="text-blue-600 hover:underline">
                  Volver a iniciar sesión
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
