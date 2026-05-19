import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { joinFullName, splitFullName } from '@/lib/profileName';
import { AlertCircle, CircleCheck as CheckCircle, User } from 'lucide-react';
import { PAGE_HEADER, PAGE_BODY } from '@/lib/layout';

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Administrador general',
  admin: 'Administrador',
  researcher: 'Investigador',
  technician: 'Técnico',
  read_only: 'Solo lectura',
};

export function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  useEffect(() => {
    if (!user) return;
    const { firstName: fn, lastName: ln } = splitFullName(user.full_name);
    setFirstName(fn);
    setLastName(ln);
  }, [user]);

  const saveProfileMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('No hay sesión');
      if (!firstName.trim()) throw new Error('El nombre es obligatorio');

      const full_name = joinFullName(firstName, lastName);
      const { error } = await (supabase.from('profiles') as any)
        .update({ full_name, updated_at: new Date().toISOString() })
        .eq('id', user.id);

      if (error) throw error;

      const { error: metaError } = await supabase.auth.updateUser({
        data: { full_name },
      });
      if (metaError) throw metaError;
    },
    onSuccess: async () => {
      setProfileError('');
      setProfileSuccess(true);
      await refreshUser();
      window.setTimeout(() => setProfileSuccess(false), 3000);
    },
    onError: (e: Error) => {
      setProfileSuccess(false);
      setProfileError(e.message);
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async () => {
      if (!user?.email) throw new Error('No hay sesión');
      if (!currentPassword) throw new Error('Introduce tu contraseña actual');
      if (newPassword.length < 8) throw new Error('La nueva contraseña debe tener al menos 8 caracteres');
      if (newPassword !== confirmPassword) throw new Error('Las contraseñas nuevas no coinciden');

      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (verifyError) throw new Error('La contraseña actual no es correcta');

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      setPasswordError('');
      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      window.setTimeout(() => setPasswordSuccess(false), 3000);
    },
    onError: (e: Error) => {
      setPasswordSuccess(false);
      setPasswordError(e.message);
    },
  });

  if (!user) return null;

  return (
    <AppLayout>
      <div className="min-h-full bg-gray-50">
        <div className={`bg-white border-b border-gray-200 ${PAGE_HEADER} py-6`}>
          <h1 className="text-2xl font-bold text-gray-900">Mi perfil</h1>
          <p className="text-sm text-gray-500 mt-0.5">Datos personales y seguridad de la cuenta</p>
        </div>

        <div className={`${PAGE_BODY} max-w-2xl space-y-6`}>
          <section className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                <User className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">{user.email}</p>
                <p className="text-sm text-gray-500">{ROLE_LABELS[user.role] || user.role}</p>
              </div>
            </div>

            {profileError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex gap-2 text-sm text-red-600">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                {profileError}
              </div>
            )}
            {profileSuccess && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex gap-2 text-sm text-green-700">
                <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                Perfil actualizado correctamente
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setProfileError('');
                saveProfileMutation.mutate();
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Nombre</label>
                  <Input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="María"
                    disabled={saveProfileMutation.isPending}
                    className="text-gray-900"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Apellidos</label>
                  <Input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="García López"
                    disabled={saveProfileMutation.isPending}
                    className="text-gray-900"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                <Input value={user.email} readOnly disabled className="text-gray-500 bg-gray-50" />
                <p className="text-xs text-gray-400 mt-1">El email no se puede cambiar desde aquí.</p>
              </div>
              <Button
                type="submit"
                disabled={saveProfileMutation.isPending}
                className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white"
              >
                {saveProfileMutation.isPending ? 'Guardando...' : 'Guardar datos'}
              </Button>
            </form>
          </section>

          <section className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Contraseña</h2>
            <p className="text-sm text-gray-500 mb-4">Cambia la contraseña de acceso a CryoVault.</p>

            {passwordError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex gap-2 text-sm text-red-600">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                {passwordError}
              </div>
            )}
            {passwordSuccess && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex gap-2 text-sm text-green-700">
                <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                Contraseña actualizada correctamente
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setPasswordError('');
                changePasswordMutation.mutate();
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Contraseña actual</label>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  disabled={changePasswordMutation.isPending}
                  autoComplete="current-password"
                  className="text-gray-900"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Nueva contraseña</label>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={changePasswordMutation.isPending}
                    minLength={8}
                    autoComplete="new-password"
                    className="text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirmar nueva</label>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={changePasswordMutation.isPending}
                    minLength={8}
                    autoComplete="new-password"
                    className="text-gray-900"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-400">Mínimo 8 caracteres.</p>
              <Button
                type="submit"
                variant="outline"
                disabled={changePasswordMutation.isPending}
                className="text-gray-700"
              >
                {changePasswordMutation.isPending ? 'Actualizando...' : 'Cambiar contraseña'}
              </Button>
            </form>
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
