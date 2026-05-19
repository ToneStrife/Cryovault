import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Plus,
  Package2,
  ChevronRight,
  Grid3x3 as Grid3X3,
  List,
  Search,
  Layers,
  Package,
  Pencil,
  Check,
  X,
  Upload,
  Archive,
  ArchiveRestore,
  Trash2,
} from 'lucide-react';
import { BOX_STATUS_LABEL, BOX_TYPE_LABEL, labelOption, useSettingsOptions } from '@/lib/settingsOptions';
import { canManageBoxes } from '@/lib/labPermissions';
import { archiveBox, unarchiveBox, softDeleteBoxWithSamples, getBoxSampleCounts } from '@/lib/boxLifecycle';
import { BoxDeleteConfirmDialog } from '@/components/box/BoxDeleteConfirmDialog';
import type { Box, Freezer, Rack } from '@/types';

interface BoxWithContext extends Box {
  freezerName: string;
  freezerId: string;
  freezerTemp: number;
  rackName?: string;
}

interface BoxFormData {
  freezer_id: string;
  shelf_number: string;
  rack_id: string;
  name: string;
  description: string;
  rows: string;
  columns: string;
  box_type: string;
}

const emptyBoxForm: BoxFormData = {
  freezer_id: '',
  shelf_number: '',
  rack_id: '',
  name: '',
  description: '',
  rows: '9',
  columns: '9',
  box_type: 'standard',
};

const TEMP_LABELS: Record<string, string> = {
  '-196': '-196°C',
  '-80': '-80°C',
  '-20': '-20°C',
  '4': '4°C',
};

function getTempLabel(temp: number) {
  return TEMP_LABELS[String(temp)] ?? `${temp}°C`;
}

function getOccupancyBar(pct: number) {
  if (pct >= 90) return 'bg-red-500';
  if (pct >= 60) return 'bg-orange-400';
  if (pct >= 30) return 'bg-yellow-400';
  return 'bg-teal-500';
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    full: 'bg-orange-100 text-orange-700',
    in_use: 'bg-amber-100 text-amber-800',
    archived: 'bg-gray-100 text-gray-500',
    retired: 'bg-red-100 text-red-600',
  };
  const labels: Record<string, string> = {
    active: 'Activo', full: 'Llena', in_use: 'En uso', archived: 'Archivada', retired: 'Retirada',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[status] || 'bg-gray-100 text-gray-500'}`}>
      {labels[status] || labelOption(status, BOX_STATUS_LABEL)}
    </span>
  );
}

type ViewMode = 'grid' | 'list';

export function BoxesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { options: settingsOptions } = useSettingsOptions(user?.laboratory);

  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [freezerFilter, setFreezerFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [tempFilter, setTempFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [form, setForm] = useState<BoxFormData>(emptyBoxForm);
  const [formError, setFormError] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [editingBoxId, setEditingBoxId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BoxWithContext | null>(null);
  const [deleteSampleCount, setDeleteSampleCount] = useState(0);
  const [deleteInUseCount, setDeleteInUseCount] = useState(0);
  const [listActionError, setListActionError] = useState('');

  const canManage = canManageBoxes(user?.role);

  const { data: freezers = [] } = useQuery({
    queryKey: ['freezers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('freezers').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as Freezer[];
    },
    enabled: !!user,
  });

  const { data: racks = [] } = useQuery({
    queryKey: ['all-racks'],
    queryFn: async () => {
      const { data, error } = await (supabase.from('racks') as any).select('*');
      if (error) throw error;
      return data as Rack[];
    },
    enabled: !!user,
  });

  const { data: boxes = [], isLoading } = useQuery({
    queryKey: ['all-boxes', showArchived],
    queryFn: async () => {
      let query = supabase.from('boxes').select('*').is('deleted_at', null);
      if (showArchived) {
        query = query.eq('archived', true);
      } else {
        query = query.eq('archived', false);
      }
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      return data as Box[];
    },
    enabled: !!user,
  });

  const freezerMap = Object.fromEntries(freezers.map((f) => [f.id, f]));
  const rackMap = Object.fromEntries(racks.map((r) => [r.id, r]));

  const enriched: BoxWithContext[] = boxes.map((b) => ({
    ...b,
    freezerName: freezerMap[b.freezer_id]?.name ?? '—',
    freezerId: b.freezer_id,
    freezerTemp: freezerMap[b.freezer_id]?.temperature ?? 0,
    rackName: b.rack_id ? rackMap[b.rack_id]?.name : undefined,
  }));

  const filtered = enriched.filter((b) => {
    if (freezerFilter !== 'all' && b.freezer_id !== freezerFilter) return false;
    if (statusFilter !== 'all' && b.status !== statusFilter) return false;
    if (tempFilter !== 'all' && String(b.freezerTemp) !== tempFilter) return false;
    if (search && !b.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const racksForFreezer = racks.filter((r) => r.freezer_id === form.freezer_id);
  const racksForShelf = racksForFreezer.filter(
    (r) => !form.shelf_number || r.shelf_number === parseInt(form.shelf_number)
  );
  const selectedFreezer = freezers.find((f) => f.id === form.freezer_id);
  const shelfCount = selectedFreezer?.shelf_count || 3;

  async function uploadBoxImage(boxId: string): Promise<string | null> {
    if (!imageFile) return null;
    const ext = imageFile.name.split('.').pop();
    const path = `boxes/${boxId}.${ext}`;
    const { error } = await supabase.storage.from('cryo-images').upload(path, imageFile, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from('cryo-images').getPublicUrl(path);
    return data.publicUrl;
  }

  const addBoxMutation = useMutation({
    mutationFn: async (data: BoxFormData) => {
      if (!data.freezer_id) throw new Error('Selecciona un congelador');
      if (!data.name.trim()) throw new Error('El nombre es obligatorio');
      const payload = {
        freezer_id: data.freezer_id,
        name: data.name.trim(),
        description: data.description.trim() || null,
        rows: parseInt(data.rows) || 9,
        columns: parseInt(data.columns) || 9,
        box_type: data.box_type,
        status: settingsOptions.defaultBoxStatus,
        occupancy: 0,
        archived: false,
        shelf_number: data.shelf_number ? parseInt(data.shelf_number) : null,
        rack_id: data.rack_id || null,
        image_url: null as string | null,
        created_by: user!.id,
      };
      const { data: inserted, error } = await (supabase.from('boxes') as any)
        .insert([payload])
        .select('id')
        .single();
      if (error) throw error;
      if (imageFile) {
        const imageUrl = await uploadBoxImage(inserted.id);
        await (supabase.from('boxes') as any).update({ image_url: imageUrl }).eq('id', inserted.id);
      }
      return inserted;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-boxes'] });
      queryClient.invalidateQueries({ queryKey: ['boxes'] });
      queryClient.invalidateQueries({ queryKey: ['freezer-box-counts'] });
      closeAddDialog();
    },
    onError: (e: any) => setFormError(e.message),
  });

  const renameMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await (supabase.from('boxes') as any).update({ name }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-boxes'] });
      queryClient.invalidateQueries({ queryKey: ['boxes'] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => archiveBox(id),
    onSuccess: () => {
      setListActionError('');
      queryClient.invalidateQueries({ queryKey: ['all-boxes'] });
      queryClient.invalidateQueries({ queryKey: ['boxes'] });
    },
    onError: (e: Error) => setListActionError(e.message),
  });

  const unarchiveMutation = useMutation({
    mutationFn: (id: string) => unarchiveBox(id),
    onSuccess: () => {
      setListActionError('');
      queryClient.invalidateQueries({ queryKey: ['all-boxes'] });
      queryClient.invalidateQueries({ queryKey: ['boxes'] });
    },
    onError: (e: Error) => setListActionError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => softDeleteBoxWithSamples(id, user!.id),
    onSuccess: () => {
      setDeleteTarget(null);
      setListActionError('');
      queryClient.invalidateQueries({ queryKey: ['all-boxes'] });
      queryClient.invalidateQueries({ queryKey: ['boxes'] });
      queryClient.invalidateQueries({ queryKey: ['boxes-trash'] });
      queryClient.invalidateQueries({ queryKey: ['audit-report'] });
    },
    onError: (e: Error) => setListActionError(e.message),
  });

  const openDeleteDialog = async (box: BoxWithContext, e: React.MouseEvent) => {
    e.stopPropagation();
    setListActionError('');
    try {
      const counts = await getBoxSampleCounts(box.id);
      setDeleteSampleCount(counts.total);
      setDeleteInUseCount(counts.inUse);
      setDeleteTarget(box);
    } catch (err: unknown) {
      setListActionError(err instanceof Error ? err.message : 'Error al cargar muestras');
    }
  };

  const closeAddDialog = () => {
    setShowAddDialog(false);
    setForm(emptyBoxForm);
    setFormError('');
    setImageFile(null);
    setImagePreview(null);
  };

  const openAddDialog = () => {
    setForm({
      ...emptyBoxForm,
      freezer_id: freezers[0]?.id || '',
      rows: String(settingsOptions.defaultBoxRows),
      columns: String(settingsOptions.defaultBoxColumns),
      box_type: settingsOptions.defaultBoxType,
    });
    setFormError('');
    setShowAddDialog(true);
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    addBoxMutation.mutate(form);
  };

  const startRename = (box: BoxWithContext) => {
    setEditingBoxId(box.id);
    setEditingName(box.name);
  };

  const commitRename = (id: string) => {
    if (editingName.trim()) renameMutation.mutate({ id, name: editingName.trim() });
    setEditingBoxId(null);
  };

  const cancelRename = () => setEditingBoxId(null);

  const uniqueTemps = Array.from(new Set(freezers.map((f) => f.temperature)));

  return (
    <AppLayout>
      <div className="min-h-full bg-gray-50">
        {/* Page header */}
        <div className="bg-white border-b border-gray-200 px-8 py-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Cajas de almacenamiento</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Explora todas las cajas de muestras del laboratorio
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={openAddDialog}
                className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white"
              >
                <Plus className="w-4 h-4" />
                Añadir caja
              </Button>
            </div>
          </div>

          {/* Freezer filter pills */}
          {freezers.length > 0 && (
            <div className="flex items-center gap-2 mt-5 flex-wrap">
              <button
                onClick={() => setFreezerFilter('all')}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  freezerFilter === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Todos los congeladores
              </button>
              {freezers.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFreezerFilter(freezerFilter === f.id ? 'all' : f.id)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    freezerFilter === f.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {f.name} {getTempLabel(f.temperature)}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="px-8 py-6">
          {/* Filters row */}
          <div className="flex items-center gap-3 mb-6 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar cajas por nombre..."
                className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Todos los estados</option>
              {settingsOptions.boxStatuses.map((status) => (
                <option key={status} value={status}>{labelOption(status, BOX_STATUS_LABEL)}</option>
              ))}
            </select>
            {uniqueTemps.length > 1 && (
              <select
                value={tempFilter}
                onChange={(e) => setTempFilter(e.target.value)}
                className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Todas las temps</option>
                {uniqueTemps.map((t) => (
                  <option key={t} value={String(t)}>{getTempLabel(t)}</option>
                ))}
              </select>
            )}
            {canManage && (
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Ver archivadas
              </label>
            )}
            <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1 ml-auto">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded transition-colors ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}
                title="Vista cuadrícula"
              >
                <Grid3X3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded transition-colors ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}
                title="Vista tabla"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>

          {listActionError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{listActionError}</p>
          )}

          {isLoading ? (
            viewMode === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-44 bg-white animate-pulse rounded-xl border border-gray-200" />
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-14 border-b border-gray-100 animate-pulse" />
                ))}
              </div>
            )
          ) : filtered.length === 0 ? (
            <div className="text-center py-24">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Package2 className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-lg font-semibold text-gray-800 mb-1">Sin cajas</p>
              <p className="text-sm text-gray-500 mb-6">
                {search || statusFilter !== 'all' || freezerFilter !== 'all'
                  ? 'No hay cajas que coincidan con los filtros.'
                  : 'Crea la primera caja de almacenamiento.'}
              </p>
              {!search && statusFilter === 'all' && freezerFilter === 'all' && (
                <Button
                  onClick={openAddDialog}
                  className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white"
                >
                  <Plus className="w-4 h-4" /> Añadir caja
                </Button>
              )}
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((box) => {
                const total = box.rows * box.columns;
                const pct = total > 0 ? Math.min(100, Math.round((box.occupancy / total) * 100)) : 0;
                return (
                  <div
                    key={box.id}
                    className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md hover:border-gray-300 transition-all group cursor-pointer"
                    onClick={() => navigate(`/freezers/${box.freezerId}/box/${box.id}`)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center flex-shrink-0">
                          <Package2 className="w-5 h-5 text-white" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{box.name}</p>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">{box.freezerName}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={box.status} />
                        {canManage && (
                          <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                            {box.archived ? (
                              <button type="button" title="Desarchivar" onClick={() => { if (confirm('¿Desarchivar esta caja?')) unarchiveMutation.mutate(box.id); }} className="p-1 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded"><ArchiveRestore className="w-3.5 h-3.5" /></button>
                            ) : (
                              <button type="button" title="Archivar" onClick={() => { if (confirm('¿Archivar esta caja?')) archiveMutation.mutate(box.id); }} className="p-1 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded"><Archive className="w-3.5 h-3.5" /></button>
                            )}
                            <button type="button" title="Eliminar" onClick={(e) => openDeleteDialog(box, e)} className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        )}
                        <ChevronRight className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                      <span className="text-xs text-gray-500 flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded-full">
                        <Grid3X3 className="w-3 h-3" /> {box.rows}×{box.columns}
                      </span>
                      {box.shelf_number && (
                        <span className="text-xs text-gray-500 flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded-full">
                          <Layers className="w-3 h-3" /> Balda {box.shelf_number}
                        </span>
                      )}
                      {box.rackName && (
                        <span className="text-xs text-gray-500 flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded-full">
                          <Package className="w-3 h-3" /> {box.rackName}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">Ocupación</span>
                        <span className="text-xs font-semibold text-gray-700">
                          {box.occupancy}/{total} ({pct}%)
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${getOccupancyBar(pct)}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Nombre</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden md:table-cell">Congelador</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden lg:table-cell">Balda / Rack</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Cuadrícula</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Ocupación</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Estado</th>
                    {canManage && <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Acciones</th>}
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((box) => {
                    const total = box.rows * box.columns;
                    const pct = total > 0 ? Math.min(100, Math.round((box.occupancy / total) * 100)) : 0;
                    const isEditing = editingBoxId === box.id;
                    return (
                      <tr key={box.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') commitRename(box.id);
                                  if (e.key === 'Escape') cancelRename();
                                }}
                                className="border border-blue-400 rounded px-2 py-1 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
                                autoFocus
                              />
                              <button onClick={() => commitRename(box.id)} className="p-1 text-green-600 hover:bg-green-50 rounded">
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={cancelRename} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 group/name">
                              <span
                                className="font-medium text-sm text-gray-900 cursor-pointer hover:underline"
                                onClick={() => navigate(`/freezers/${box.freezerId}/box/${box.id}`)}
                              >
                                {box.name}
                              </span>
                              <button
                                onClick={(e) => { e.stopPropagation(); startRename(box); }}
                                className="p-0.5 text-gray-300 hover:text-gray-600 opacity-0 group-hover/name:opacity-100 transition-opacity"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">{box.freezerName}</td>
                        <td className="px-4 py-3 text-sm text-gray-500 hidden lg:table-cell">
                          {box.shelf_number ? `Balda ${box.shelf_number}` : '—'}
                          {box.rackName ? ` / ${box.rackName}` : ''}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{box.rows}×{box.columns}</td>
                        <td className="px-4 py-3 min-w-32">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-500">{box.occupancy}/{total}</span>
                              <span className="text-xs font-medium text-gray-700">{pct}%</span>
                            </div>
                            <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${getOccupancyBar(pct)}`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={box.status} /></td>
                        {canManage && (
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              {box.archived ? (
                                <button
                                  type="button"
                                  title="Desarchivar"
                                  onClick={() => { if (confirm('¿Desarchivar esta caja?')) unarchiveMutation.mutate(box.id); }}
                                  className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded"
                                >
                                  <ArchiveRestore className="w-4 h-4" />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  title="Archivar"
                                  onClick={() => { if (confirm('¿Archivar esta caja?')) archiveMutation.mutate(box.id); }}
                                  className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded"
                                >
                                  <Archive className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                type="button"
                                title="Eliminar"
                                onClick={(e) => openDeleteDialog(box, e)}
                                className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <Link
                            to={`/freezers/${box.freezerId}/box/${box.id}`}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors flex items-center justify-center"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add Box Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-gray-900">Nueva caja</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddSubmit} className="space-y-4 mt-2">
            {formError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{formError}</p>
            )}

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Congelador *</label>
              <select
                value={form.freezer_id}
                onChange={(e) => setForm({ ...form, freezer_id: e.target.value, shelf_number: '', rack_id: '' })}
                className="w-full px-3 py-2 bg-white border border-gray-300 text-gray-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Selecciona un congelador...</option>
                {freezers.map((f) => (
                  <option key={f.id} value={f.id}>{f.name} ({getTempLabel(f.temperature)})</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Balda</label>
                <select
                  value={form.shelf_number}
                  onChange={(e) => setForm({ ...form, shelf_number: e.target.value, rack_id: '' })}
                  disabled={!form.freezer_id}
                  className="w-full px-3 py-2 bg-white border border-gray-300 text-gray-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  <option value="">Sin asignar</option>
                  {Array.from({ length: shelfCount }, (_, i) => (
                    <option key={i + 1} value={i + 1}>Balda {i + 1}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Rack</label>
                <select
                  value={form.rack_id}
                  onChange={(e) => setForm({ ...form, rack_id: e.target.value })}
                  disabled={!form.shelf_number || racksForShelf.length === 0}
                  className="w-full px-3 py-2 bg-white border border-gray-300 text-gray-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  <option value="">En la balda</option>
                  {racksForShelf.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Nombre de la caja *</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ej: Caja A1 — Sueros"
                className="border-gray-300 text-gray-900 focus:ring-blue-500"
                autoFocus
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Descripción</label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Proyecto X, Ronda 1..."
                className="border-gray-300 text-gray-900"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Filas</label>
                <Input
                  type="number"
                  value={form.rows}
                  onChange={(e) => setForm({ ...form, rows: e.target.value })}
                  min={1} max={20}
                  className="border-gray-300 text-gray-900"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Columnas</label>
                <Input
                  type="number"
                  value={form.columns}
                  onChange={(e) => setForm({ ...form, columns: e.target.value })}
                  min={1} max={20}
                  className="border-gray-300 text-gray-900"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Tipo de caja</label>
              <select
                value={form.box_type}
                onChange={(e) => setForm({ ...form, box_type: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-gray-300 text-gray-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {settingsOptions.boxTypes.map((type) => (
                  <option key={type} value={type}>{labelOption(type, BOX_TYPE_LABEL)}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Foto (opcional)</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setImageFile(file);
                  setImagePreview(URL.createObjectURL(file));
                }}
                className="hidden"
              />
              <div className="flex items-center gap-3">
                {imagePreview && (
                  <div className="relative flex-shrink-0">
                    <img src={imagePreview} alt="preview" className="w-14 h-14 rounded-lg object-cover border border-gray-200" />
                    <button
                      type="button"
                      onClick={() => { setImageFile(null); setImagePreview(null); }}
                      className="absolute -top-1 -right-1 bg-red-500 rounded-full p-0.5"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {imagePreview ? 'Cambiar foto' : 'Subir foto'}
                </button>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={closeAddDialog}
                className="flex-1 border-gray-300 text-gray-700"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={addBoxMutation.isPending}
                className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 text-white"
              >
                {addBoxMutation.isPending ? 'Creando...' : 'Crear caja'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {deleteTarget && (
        <BoxDeleteConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
          boxName={deleteTarget.name}
          sampleCount={deleteSampleCount}
          inUseCount={deleteInUseCount}
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
        />
      )}
    </AppLayout>
  );
}
