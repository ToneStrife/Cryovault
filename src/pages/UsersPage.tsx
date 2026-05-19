import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Users, Shield, ChevronDown, UserPlus, Mail, Clock, X, Check, KeyRound, Building2 } from 'lucide-react';
import type { Laboratory, Profile, UserRole } from '@/types';
import { selectClass } from '@/lib/formStyles';

const LAB_ROLES: UserRole[] = ['admin', 'researcher', 'technician', 'read_only'];

const ROLE_COLORS: Record<UserRole, string> = {
  super_admin: 'bg-purple-100 text-purple-700',
  admin: 'bg-blue-100 text-blue-700',
  researcher: 'bg-green-100 text-green-700',
  technician: 'bg-cyan-100 text-cyan-700',
  read_only: 'bg-gray-100 text-gray-600',
};

const ROLE_LABEL: Record<UserRole, string> = {
  super_admin: 'Admin general',
  admin: 'Administrador',
  researcher: 'Investigador',
  technician: 'Técnico',
  read_only: 'Solo lectura',
};

const PERMISSIONS: { action: string; label: string; category: string }[] = [
  { action: 'view_samples', label: 'Ver muestras', category: 'Muestras' },
  { action: 'create_samples', label: 'Crear muestras', category: 'Muestras' },
  { action: 'edit_samples', label: 'Editar muestras', category: 'Muestras' },
  { action: 'delete_samples', label: 'Eliminar muestras', category: 'Muestras' },
  { action: 'view_freezers', label: 'Ver congeladores', category: 'Infraestructura' },
  { action: 'manage_freezers', label: 'Gestionar congeladores', category: 'Infraestructura' },
  { action: 'view_boxes', label: 'Ver cajas', category: 'Infraestructura' },
  { action: 'manage_boxes', label: 'Gestionar cajas', category: 'Infraestructura' },
  { action: 'view_reports', label: 'Ver informes', category: 'Sistema' },
  { action: 'manage_users', label: 'Gestionar usuarios', category: 'Sistema' },
];

const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  super_admin: ['manage_users'],
  admin: PERMISSIONS.map((p) => p.action),
  researcher: ['view_samples', 'create_samples', 'edit_samples', 'delete_samples', 'view_freezers', 'manage_freezers', 'view_boxes', 'manage_boxes', 'view_reports'],
  technician: ['view_samples', 'create_samples', 'edit_samples', 'view_freezers', 'view_boxes', 'view_reports'],
  read_only: ['view_samples', 'view_freezers', 'view_boxes', 'view_reports'],
};

const PERMISSION_CATEGORIES = Array.from(new Set(PERMISSIONS.map((p) => p.category)));

function slugifyLaboratory(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'laboratorio';
}

export function UsersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editUser, setEditUser] = useState<Profile | null>(null);
  const [newRole, setNewRole] = useState<UserRole>('researcher');
  const [newLaboratory, setNewLaboratory] = useState('');
  const [editError, setEditError] = useState('');
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('researcher');
  const [inviteLaboratory, setInviteLaboratory] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [showLabDialog, setShowLabDialog] = useState(false);
  const [labName, setLabName] = useState('');
  const [labError, setLabError] = useState('');
  const [showPermMatrix, setShowPermMatrix] = useState(false);
  const [permEditUser, setPermEditUser] = useState<Profile | null>(null);
  const [permState, setPermState] = useState<Record<string, boolean>>({});
  const [permSaving, setPermSaving] = useState(false);
  const [permError, setPermError] = useState('');

  const isSuperAdmin = user?.role === 'super_admin';
  const isLabAdmin = user?.role === 'admin';
  const canManageUsers = isSuperAdmin || isLabAdmin;
  const assignableRoles = isSuperAdmin ? (['admin'] as UserRole[]) : LAB_ROLES;

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users', user?.role, user?.laboratory],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: true });
      if (error) throw error;
      return data as Profile[];
    },
    enabled: !!user && isLabAdmin,
  });

  const { data: laboratories = [] } = useQuery({
    queryKey: ['laboratories'],
    queryFn: async () => {
      const { data, error } = await (supabase.from('laboratories') as any)
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data || []) as Laboratory[];
    },
    enabled: !!user && canManageUsers,
  });

  const { data: invites = [] } = useQuery({
    queryKey: ['invites', user?.role, user?.laboratory],
    queryFn: async () => {
      const { data, error } = await (supabase.from('invites') as any).select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!user && canManageUsers,
  });

  const { data: allOverrides = [] } = useQuery({
    queryKey: ['user-permissions', user?.role, user?.laboratory],
    queryFn: async () => {
      const { data, error } = await (supabase.from('user_permissions') as any).select('*');
      if (error) throw error;
      return (data || []) as { user_id: string; action: string; granted: boolean }[];
    },
    enabled: !!user && canManageUsers,
  });

  const laboratoryOptions = laboratories.length
    ? laboratories
    : user?.laboratory
      ? [{ id: user.laboratory, name: user.laboratory, slug: user.laboratory, created_by: null, created_at: '', updated_at: '' }]
      : [];

  const getEffectivePermissions = (u: Profile): Record<string, boolean> => {
    const base = ROLE_PERMISSIONS[u.role as UserRole] || [];
    const result: Record<string, boolean> = {};
    PERMISSIONS.forEach((p) => { result[p.action] = base.includes(p.action); });
    allOverrides.filter((o) => o.user_id === u.id).forEach((o) => { result[o.action] = o.granted; });
    return result;
  };

  const createLaboratoryMutation = useMutation({
    mutationFn: async (name: string) => {
      const cleanName = name.trim();
      if (!cleanName) throw new Error('El nombre del laboratorio es obligatorio');
      const { error } = await (supabase.from('laboratories') as any).insert([{
        name: cleanName,
        slug: slugifyLaboratory(cleanName),
        created_by: user!.id,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['laboratories'] });
      setShowLabDialog(false);
      setLabName('');
      setLabError('');
    },
    onError: (e: any) => setLabError(e.message),
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, role, laboratory }: { userId: string; role: UserRole; laboratory: string }) => {
      const payload: Record<string, string> = { role };
      if (isSuperAdmin) payload.laboratory = laboratory;
      const { error } = await (supabase.from('profiles') as any).update(payload).eq('id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['user-permissions'] });
      setEditUser(null);
      setEditError('');
    },
    onError: (e: any) => setEditError(e.message),
  });

  const inviteMutation = useMutation({
    mutationFn: async ({ email, role, laboratory }: { email: string; role: UserRole; laboratory: string }) => {
      const { error } = await supabase.functions.invoke('invite-user', {
        body: {
        email: email.trim().toLowerCase(),
        role,
        laboratory,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invites'] });
      setShowInviteDialog(false);
      setInviteEmail('');
      setInviteRole('researcher');
      setInviteLaboratory(user?.laboratory || '');
      setInviteError('');
      setInviteSuccess('Se ha enviado un email para crear contraseña.');
    },
    onError: (e: any) => setInviteError(e.message),
  });

  const revokeInviteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from('invites') as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invites'] }),
  });

  const openEdit = (u: Profile) => {
    setEditUser(u);
    setNewRole(u.role as UserRole);
    setNewLaboratory(u.laboratory);
    setEditError('');
  };

  const openInvite = () => {
    setInviteError('');
    setInviteSuccess('');
    setInviteRole(isSuperAdmin ? 'admin' : 'researcher');
    setInviteLaboratory(user?.laboratory || laboratoryOptions[0]?.slug || '');
    setShowInviteDialog(true);
  };

  const openPermEdit = (u: Profile) => {
    setPermState(getEffectivePermissions(u));
    setPermEditUser(u);
    setPermError('');
  };

  const savePermissions = async () => {
    if (!permEditUser) return;
    setPermSaving(true);
    setPermError('');
    try {
      const roleDefaults = ROLE_PERMISSIONS[permEditUser.role as UserRole] || [];
      for (const p of PERMISSIONS) {
        const granted = permState[p.action] ?? false;
        const defaultGranted = roleDefaults.includes(p.action);
        if (granted !== defaultGranted) {
          const { error } = await (supabase.from('user_permissions') as any).upsert({
            user_id: permEditUser.id,
            action: p.action,
            granted,
            laboratory: permEditUser.laboratory,
          }, { onConflict: 'user_id,action' });
          if (error) throw error;
        } else {
          const { error } = await (supabase.from('user_permissions') as any)
            .delete()
            .eq('user_id', permEditUser.id)
            .eq('action', p.action);
          if (error) throw error;
        }
      }
      queryClient.invalidateQueries({ queryKey: ['user-permissions'] });
      setPermEditUser(null);
    } catch (e: any) {
      setPermError(e.message);
    } finally {
      setPermSaving(false);
    }
  };

  const pendingInvites = invites.filter((i: any) => !i.accepted_at);

  return (
    <AppLayout>
      <div className="min-h-full bg-gray-50">
        <div className="bg-white border-b border-gray-200 px-4 lg:px-8 py-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Usuarios</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {canManageUsers ? `${users.length} usuario${users.length !== 1 ? 's' : ''} registrado${users.length !== 1 ? 's' : ''}` : 'Gestión de usuarios'}
              </p>
            </div>
            {canManageUsers && (
              <div className="flex items-center gap-2">
                {isSuperAdmin && (
                  <Button
                    variant="outline"
                    onClick={() => { setLabError(''); setShowLabDialog(true); }}
                    className="border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    <Building2 className="w-4 h-4" /> Nuevo laboratorio
                  </Button>
                )}
                {isLabAdmin && (
                  <Button
                    variant="outline"
                    onClick={() => setShowPermMatrix(!showPermMatrix)}
                    className="border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    <Shield className="w-4 h-4" /> Matriz de permisos
                  </Button>
                )}
                <Button onClick={openInvite} className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white">
                  <UserPlus className="w-4 h-4" /> {isSuperAdmin ? 'Invitar admin' : 'Invitar usuario'}
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="px-4 lg:px-8 py-5 space-y-6">
          {!canManageUsers && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-sm flex items-center gap-2">
              <Shield className="w-4 h-4 flex-shrink-0" />
              Solo los administradores pueden gestionar usuarios y roles.
            </div>
          )}
          {inviteSuccess && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm flex items-center gap-2">
              <Mail className="w-4 h-4 flex-shrink-0" />
              {inviteSuccess}
            </div>
          )}

          {isSuperAdmin && (
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Building2 className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-semibold text-gray-700">Laboratorios</span>
                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{laboratories.length}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {laboratories.map((lab) => (
                  <span key={lab.id} className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                    {lab.name} <span className="text-gray-400 font-mono">({lab.slug})</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {showPermMatrix && isLabAdmin && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm overflow-x-auto">
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Matriz de permisos por rol</h3>
              <p className="text-xs text-gray-400 mb-4">Permisos predeterminados. Los permisos individuales se pueden editar por usuario.</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-xs font-medium text-gray-500 pb-2 pr-6">Permiso</th>
                    {assignableRoles.map((r) => (
                      <th key={r} className="text-center text-xs font-medium pb-2 px-3">
                        <span className={`px-2 py-0.5 rounded-full ${ROLE_COLORS[r]}`}>{ROLE_LABEL[r]}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {PERMISSION_CATEGORIES.map((cat) => (
                    <>
                      <tr key={`cat-${cat}`}>
                        <td colSpan={assignableRoles.length + 1} className="pt-3 pb-1">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{cat}</span>
                        </td>
                      </tr>
                      {PERMISSIONS.filter((p) => p.category === cat).map(({ action, label }) => (
                        <tr key={action}>
                          <td className="py-1.5 pr-6 text-gray-700 text-xs">{label}</td>
                          {assignableRoles.map((r) => (
                            <td key={r} className="text-center py-1.5 px-3">
                              {ROLE_PERMISSIONS[r].includes(action)
                                ? <Check className="w-4 h-4 text-green-500 mx-auto" />
                                : <X className="w-4 h-4 text-gray-200 mx-auto" />}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {canManageUsers && pendingInvites.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
                <Mail className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-semibold text-gray-700">Invitaciones pendientes</span>
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{pendingInvites.length}</span>
              </div>
              <div className="divide-y divide-gray-50">
                {pendingInvites.map((inv: any) => (
                  <div key={inv.id} className="px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                        <Mail className="w-3.5 h-3.5 text-amber-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-800">{inv.email}</p>
                        <p className="text-xs text-gray-400 flex items-center gap-1 flex-wrap">
                          <Clock className="w-3 h-3" />
                          {new Date(inv.created_at).toLocaleDateString('es-ES')}
                          <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${ROLE_COLORS[inv.role as UserRole] || 'bg-gray-100 text-gray-500'}`}>
                            {ROLE_LABEL[inv.role as UserRole] || inv.role}
                          </span>
                          {isSuperAdmin && <span className="font-mono text-gray-500">{inv.laboratory}</span>}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => revokeInviteMutation.mutate(inv.id)}
                      className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" /> Revocar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {canManageUsers && (
            isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 bg-gray-100 animate-pulse rounded-xl" />)}
              </div>
            ) : users.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Sin usuarios registrados</p>
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                      <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">Usuario</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden sm:table-cell">Laboratorio</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Rol</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden md:table-cell">Registrado</th>
                      <th className="px-4 py-3 w-40" />
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => {
                      const hasOverrides = isLabAdmin && allOverrides.some((o) => o.user_id === u.id);
                      const canEditUser = u.id !== user?.id && (isSuperAdmin ? u.role === 'admin' : u.role !== 'super_admin');
                      return (
                        <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center flex-shrink-0">
                                <span className="text-xs font-bold text-white">
                                  {(u.full_name || u.email).charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-900">{u.full_name || '—'}</p>
                                <p className="text-xs text-gray-400">{u.email}</p>
                                {u.id === user?.id && <span className="text-[10px] text-blue-600 font-medium">Tú</span>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 hidden sm:table-cell">
                            <span className="text-sm text-gray-600 font-mono">{u.laboratory}</span>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${ROLE_COLORS[u.role as UserRole] || 'bg-gray-100 text-gray-500'}`}>
                                {ROLE_LABEL[u.role as UserRole] || u.role}
                              </span>
                              {hasOverrides && (
                                <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full font-medium">Personalizado</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 hidden md:table-cell text-sm text-gray-400">
                            {new Date(u.created_at).toLocaleDateString('es-ES')}
                          </td>
                          <td className="px-4 py-3.5">
                            {canEditUser && (
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => openEdit(u)}
                                  className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 hover:border-gray-300 px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
                                >
                                  Editar <ChevronDown className="w-3 h-3" />
                                </button>
                                {isLabAdmin && u.role !== 'super_admin' && (
                                  <button
                                    onClick={() => openPermEdit(u)}
                                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 border border-gray-200 hover:border-blue-200 rounded-lg transition-colors"
                                    title="Editar permisos"
                                  >
                                    <KeyRound className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      </div>

      <Dialog open={showLabDialog} onOpenChange={(open) => !open && setShowLabDialog(false)}>
        <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-sm">
          <DialogHeader><DialogTitle>Nuevo laboratorio</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            {labError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{labError}</p>}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Nombre</label>
              <Input value={labName} onChange={(e) => setLabName(e.target.value)} placeholder="Laboratorio de Oncología" autoFocus />
              <p className="text-xs text-gray-400">Identificador: <span className="font-mono">{slugifyLaboratory(labName)}</span></p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setShowLabDialog(false)} className="flex-1 border-gray-300 text-gray-700">Cancelar</Button>
              <Button onClick={() => createLaboratoryMutation.mutate(labName)} disabled={createLaboratoryMutation.isPending || !labName.trim()} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
                {createLaboratoryMutation.isPending ? 'Creando...' : 'Crear'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-sm">
          <DialogHeader><DialogTitle>Editar usuario</DialogTitle></DialogHeader>
          {editUser && (
            <div className="space-y-4 mt-2">
              {editError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{editError}</p>}
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                  <span className="text-sm font-bold text-white">{(editUser.full_name || editUser.email).charAt(0).toUpperCase()}</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">{editUser.full_name}</p>
                  <p className="text-xs text-gray-400">{editUser.email}</p>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Rol</label>
                <div className="grid grid-cols-2 gap-2">
                  {assignableRoles.map((role) => (
                    <button key={role} onClick={() => setNewRole(role)}
                      className={`px-3 py-2.5 rounded-lg border text-sm text-left transition-all ${newRole === role ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                      <span className={`inline-block w-2 h-2 rounded-full mr-2 ${newRole === role ? 'bg-blue-500' : 'bg-gray-300'}`} />
                      {ROLE_LABEL[role]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Laboratorio</label>
                {isSuperAdmin ? (
                  <select
                    value={newLaboratory}
                    onChange={(e) => setNewLaboratory(e.target.value)}
                    className={selectClass}
                  >
                    {laboratoryOptions.map((lab) => <option key={lab.slug} value={lab.slug}>{lab.name}</option>)}
                  </select>
                ) : (
                  <p className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 font-mono">{editUser.laboratory}</p>
                )}
              </div>
              <p className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3">
                Cambiar el rol actualiza los permisos predeterminados. Las personalizaciones individuales se mantienen.
              </p>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setEditUser(null)} className="flex-1 border-gray-300 text-gray-700">Cancelar</Button>
                <Button
                  onClick={() => updateUserMutation.mutate({ userId: editUser.id, role: newRole, laboratory: newLaboratory || editUser.laboratory })}
                  disabled={updateUserMutation.isPending || (newRole === editUser.role && newLaboratory === editUser.laboratory)}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {updateUserMutation.isPending ? 'Guardando...' : 'Guardar'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!permEditUser} onOpenChange={(open) => !open && setPermEditUser(null)}>
        <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-blue-500" /> Permisos de usuario
            </DialogTitle>
          </DialogHeader>
          {permEditUser && (
            <div className="space-y-4 mt-2">
              {permError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{permError}</p>}
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-white">{(permEditUser.full_name || permEditUser.email).charAt(0).toUpperCase()}</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">{permEditUser.full_name}</p>
                  <p className="text-xs text-gray-400">{permEditUser.email}</p>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${ROLE_COLORS[permEditUser.role as UserRole]}`}>
                    {ROLE_LABEL[permEditUser.role as UserRole]}
                  </span>
                </div>
              </div>

              <p className="text-xs bg-blue-50 border border-blue-100 rounded-lg p-3 text-blue-600">
                Las casillas etiquetadas "Por defecto" reflejan el rol. Puedes activar o desactivar permisos individuales para este usuario.
              </p>

              {PERMISSION_CATEGORIES.map((cat) => (
                <div key={cat} className="space-y-1.5">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{cat}</p>
                  {PERMISSIONS.filter((p) => p.category === cat).map((p) => {
                    const isDefault = ROLE_PERMISSIONS[permEditUser.role as UserRole]?.includes(p.action) ?? false;
                    const isGranted = permState[p.action] ?? false;
                    const isOverridden = isGranted !== isDefault;
                    return (
                      <label
                        key={p.action}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all select-none ${
                          isGranted
                            ? isOverridden ? 'border-amber-300 bg-amber-50' : 'border-green-200 bg-green-50'
                            : isOverridden ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isGranted}
                          onChange={(e) => setPermState((prev) => ({ ...prev, [p.action]: e.target.checked }))}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className={`text-sm flex-1 ${isGranted ? 'text-gray-800' : 'text-gray-400'}`}>{p.label}</span>
                        {isOverridden ? (
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${isGranted ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'}`}>
                            {isGranted ? 'Añadido' : 'Revocado'}
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-300">{isDefault ? 'Por defecto' : ''}</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              ))}

              <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                <span className="text-xs text-gray-400 mr-1">Ajuste rápido:</span>
                <button
                  type="button"
                  onClick={() => {
                    const defaults = ROLE_PERMISSIONS[permEditUser.role as UserRole] || [];
                    const next: Record<string, boolean> = {};
                    PERMISSIONS.forEach((p) => { next[p.action] = defaults.includes(p.action); });
                    setPermState(next);
                  }}
                  className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-2 py-1 rounded transition-colors"
                >
                  Restablecer rol
                </button>
                <button
                  type="button"
                  onClick={() => { const next: Record<string, boolean> = {}; PERMISSIONS.forEach((p) => { next[p.action] = true; }); setPermState(next); }}
                  className="text-xs text-blue-500 hover:text-blue-700 border border-blue-200 px-2 py-1 rounded transition-colors"
                >
                  Todo permitido
                </button>
                <button
                  type="button"
                  onClick={() => { const next: Record<string, boolean> = {}; PERMISSIONS.forEach((p) => { next[p.action] = false; }); setPermState(next); }}
                  className="text-xs text-red-400 hover:text-red-600 border border-red-200 px-2 py-1 rounded transition-colors"
                >
                  Sin acceso
                </button>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setPermEditUser(null)} className="flex-1 border-gray-300 text-gray-700">Cancelar</Button>
                <Button onClick={savePermissions} disabled={permSaving} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
                  {permSaving ? 'Guardando...' : 'Guardar permisos'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showInviteDialog} onOpenChange={(open) => !open && setShowInviteDialog(false)}>
        <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-sm">
          <DialogHeader><DialogTitle>{isSuperAdmin ? 'Invitar administrador' : 'Invitar usuario'}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            {inviteError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{inviteError}</p>}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Email</label>
              <Input
                type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="usuario@laboratorio.es" autoFocus
              />
            </div>
            {isSuperAdmin ? (
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Rol inicial</label>
                <p className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  Administrador
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Rol inicial</label>
                <div className="grid grid-cols-2 gap-2">
                  {LAB_ROLES.map((role) => (
                    <button key={role} onClick={() => setInviteRole(role)}
                      className={`px-3 py-2.5 rounded-lg border text-sm text-left transition-all ${inviteRole === role ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                      {ROLE_LABEL[role]}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Laboratorio</label>
              {isSuperAdmin ? (
                <select
                  value={inviteLaboratory}
                  onChange={(e) => setInviteLaboratory(e.target.value)}
                  className={selectClass}
                >
                  {laboratoryOptions.map((lab) => <option key={lab.slug} value={lab.slug}>{lab.name}</option>)}
                </select>
              ) : (
                <p className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 font-mono">{user?.laboratory}</p>
              )}
            </div>
            <p className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3">
              Se enviará un email para que el usuario cree su contraseña y acceda al sistema.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setShowInviteDialog(false)} className="flex-1 border-gray-300 text-gray-700">Cancelar</Button>
              <Button
                disabled={inviteMutation.isPending || !inviteEmail.trim() || !(isSuperAdmin ? inviteLaboratory : user?.laboratory)}
                onClick={() => {
                  if (!inviteEmail.trim()) return setInviteError('El email es obligatorio');
                  const laboratory = isSuperAdmin ? inviteLaboratory : user!.laboratory;
                  if (!laboratory) return setInviteError('Selecciona un laboratorio');
                  inviteMutation.mutate({ email: inviteEmail, role: isSuperAdmin ? 'admin' : inviteRole, laboratory });
                }}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              >
                {inviteMutation.isPending ? 'Enviando...' : 'Enviar invitación'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
