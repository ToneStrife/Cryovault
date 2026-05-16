import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Users, Shield, ChevronDown } from 'lucide-react';
import type { Profile, UserRole } from '@/types';

const ROLES: UserRole[] = ['admin', 'researcher', 'technician', 'read_only'];

const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'bg-blue-500/20 text-blue-400',
  researcher: 'bg-green-500/20 text-green-400',
  technician: 'bg-cyan-500/20 text-cyan-400',
  read_only: 'bg-slate-500/20 text-slate-400',
};

export function UsersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editUser, setEditUser] = useState<Profile | null>(null);
  const [newRole, setNewRole] = useState<UserRole>('researcher');

  const isAdmin = user?.role === 'admin';

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as Profile[];
    },
    enabled: !!user,
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: UserRole }) => {
      const { error } = await (supabase.from('profiles') as any)
        .update({ role })
        .eq('id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setEditUser(null);
    },
  });

  const openEdit = (u: Profile) => {
    setEditUser(u);
    setNewRole(u.role as UserRole);
  };

  return (
    <AppLayout>
      <div className="p-8">
        {!isAdmin && (
          <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-yellow-400 text-sm flex items-center gap-2">
            <Shield className="w-4 h-4 flex-shrink-0" />
            Solo los administradores pueden cambiar roles de usuario.
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 bg-slate-800/50 animate-pulse rounded-xl border border-slate-700" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Sin usuarios registrados</p>
          </div>
        ) : (
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-900/50">
                  <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">Usuario</th>
                  <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">Laboratorio</th>
                  <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">Rol</th>
                  <th className="text-left text-xs text-slate-400 font-medium px-4 py-3 hidden md:table-cell">Registrado</th>
                  {isAdmin && <th className="px-4 py-3 w-24"></th>}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-white font-medium">{u.full_name || '—'}</p>
                      <p className="text-slate-400 text-xs">{u.email}</p>
                      {u.id === user?.id && (
                        <span className="text-xs text-blue-400">(tú)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-300 text-sm">{u.laboratory}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${ROLE_COLORS[u.role as UserRole] || 'bg-slate-700 text-slate-400'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-slate-400 text-sm">
                      {new Date(u.created_at).toLocaleDateString('es-ES')}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        {u.id !== user?.id && (
                          <button
                            onClick={() => openEdit(u)}
                            className="text-xs text-slate-400 hover:text-white border border-slate-600 hover:border-slate-500 px-3 py-1.5 rounded flex items-center gap-1"
                          >
                            Rol <ChevronDown className="w-3 h-3" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Role Dialog */}
      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle>Cambiar rol</DialogTitle>
          </DialogHeader>
          {editUser && (
            <div className="space-y-4 mt-2">
              <div>
                <p className="text-slate-300 text-sm font-medium">{editUser.full_name}</p>
                <p className="text-slate-400 text-xs">{editUser.email}</p>
              </div>
              <div>
                <label className="text-sm text-slate-300 block mb-2">Nuevo rol</label>
                <div className="grid grid-cols-2 gap-2">
                  {ROLES.map((role) => (
                    <button
                      key={role}
                      onClick={() => setNewRole(role)}
                      className={`px-3 py-2.5 rounded-lg border text-sm capitalize text-left transition-all ${
                        newRole === role
                          ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                          : 'border-slate-700 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      {role}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setEditUser(null)}
                  className="flex-1 border-slate-600 text-slate-300"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={() => updateRoleMutation.mutate({ userId: editUser.id, role: newRole })}
                  disabled={updateRoleMutation.isPending || newRole === editUser.role}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {updateRoleMutation.isPending ? 'Guardando...' : 'Guardar rol'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
