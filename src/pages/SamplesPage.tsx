import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Search, FlaskConical, Pencil, X, ChevronDown, Filter, Trash2, RotateCcw, SquareCheck as CheckSquare, Square, Beaker, Archive, Thermometer, Package2, ArrowUpFromLine } from 'lucide-react';
import { useSampleCheckout } from '@/hooks/useSampleCheckout';
import { ReturnSampleDialog } from '@/components/ReturnSampleDialog';
import type { Sample, SampleType, SampleStatus, UnitType, Freezer, Box } from '@/types';

const STATUS_LABEL: Record<string, string> = {
  active: 'Activo', in_use: 'En uso', used: 'Usado', discarded: 'Descartado',
  archived: 'Archivado', contaminated: 'Contaminado',
};
const STATUS_BADGE: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  in_use: 'bg-amber-100 text-amber-800',
  used: 'bg-yellow-100 text-yellow-700',
  discarded: 'bg-red-100 text-red-700',
  archived: 'bg-gray-100 text-gray-600',
  contaminated: 'bg-red-900/20 text-red-800',
};
const STATUS_DOT: Record<string, string> = {
  active: 'bg-green-500', in_use: 'bg-amber-500', used: 'bg-yellow-400', discarded: 'bg-red-500',
  archived: 'bg-gray-400', contaminated: 'bg-red-900',
};

const SAMPLE_TYPES: SampleType[] = ['tissue', 'blood', 'serum', 'plasma', 'urine', 'csf', 'saliva', 'dna', 'rna', 'protein', 'other'];
const STATUSES: SampleStatus[] = ['active', 'in_use', 'used', 'discarded', 'archived', 'contaminated'];
const UNITS: UnitType[] = ['mL', 'µL', 'mg', 'µg', 'ng', 'mol/L', '%', 'other'];

interface SampleFormData {
  sample_code: string; patient_code: string; project: string;
  sample_type: SampleType; subtype: string; volume: string; units: UnitType;
  concentration: string; status: SampleStatus; freeze_date: string;
  collection_date: string; max_thaws: string; notes: string;
}

const emptyForm: SampleFormData = {
  sample_code: '', patient_code: '', project: '', sample_type: 'blood',
  subtype: '', volume: '', units: 'mL', concentration: '', status: 'active',
  freeze_date: '', collection_date: '', max_thaws: '3', notes: '',
};

interface Filters {
  search: string;
  status: string;
  type: string;
  project: string;
  patient: string;
  freezer_id: string;
  box_id: string;
  date_from: string;
  date_to: string;
  show_deleted: boolean;
}

const emptyFilters: Filters = {
  search: '', status: '', type: '', project: '', patient: '',
  freezer_id: '', box_id: '', date_from: '', date_to: '', show_deleted: false,
};

function countActiveFilters(f: Filters) {
  return [f.search, f.status, f.type, f.project, f.patient, f.freezer_id, f.box_id, f.date_from, f.date_to]
    .filter(Boolean).length + (f.show_deleted ? 1 : 0);
}

export function SamplesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editTarget, setEditTarget] = useState<Sample | null>(null);
  const [form, setForm] = useState<SampleFormData>(emptyForm);
  const [formError, setFormError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState('');
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [returnTarget, setReturnTarget] = useState<Sample | null>(null);
  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const { checkoutSample, checkoutSamplesAsync, isCheckingOutSample, isCheckingOutSamples } = useSampleCheckout();

  const setF = useCallback(<K extends keyof Filters>(key: K, val: Filters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: val }));
  }, []);

  // Fetch freezers for filter dropdown
  const { data: freezers = [] } = useQuery({
    queryKey: ['freezers-for-filter'],
    queryFn: async () => {
      const { data } = await supabase.from('freezers').select('id, name, temperature').order('name');
      return (data || []) as (Freezer & { temperature: number })[];
    },
    enabled: !!user,
  });

  // Fetch boxes for filter dropdown
  const { data: boxes = [] } = useQuery({
    queryKey: ['boxes-for-filter'],
    queryFn: async () => {
      const { data } = await supabase.from('boxes').select('id, name, freezer_id').order('name');
      return (data || []) as Box[];
    },
    enabled: !!user,
  });

  const { data: samples = [], isLoading } = useQuery({
    queryKey: ['samples'],
    queryFn: async () => {
      const { data, error } = await (supabase.from('samples') as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Sample[];
    },
    enabled: !!user,
  });

  const filtered = useMemo(() => {
    const q = filters.search.toLowerCase();
    return samples.filter((s: any) => {
      // Soft delete filter
      if (!filters.show_deleted && s.deleted_at) return false;
      if (filters.show_deleted && !s.deleted_at) return false;

      const matchQ = !q || s.sample_code.toLowerCase().includes(q) ||
        (s.patient_code || '').toLowerCase().includes(q) ||
        (s.project || '').toLowerCase().includes(q);
      const matchStatus = !filters.status || s.status === filters.status;
      const matchType = !filters.type || s.sample_type === filters.type;
      const matchProject = !filters.project || (s.project || '').toLowerCase().includes(filters.project.toLowerCase());
      const matchPatient = !filters.patient || (s.patient_code || '').toLowerCase().includes(filters.patient.toLowerCase());
      const matchBox = !filters.box_id || s.box_id === filters.box_id;
      const matchFreezer = !filters.freezer_id || boxes.find((b) => b.id === s.box_id)?.freezer_id === filters.freezer_id;
      const matchFrom = !filters.date_from || (s.freeze_date && s.freeze_date >= filters.date_from);
      const matchTo = !filters.date_to || (s.freeze_date && s.freeze_date <= filters.date_to);

      return matchQ && matchStatus && matchType && matchProject && matchPatient &&
        matchBox && matchFreezer && matchFrom && matchTo;
    });
  }, [samples, filters, boxes]);

  // Boxes filtered by selected freezer
  const boxesForFilter = filters.freezer_id
    ? boxes.filter((b) => b.freezer_id === filters.freezer_id)
    : boxes;

  const saveMutation = useMutation({
    mutationFn: async (data: SampleFormData) => {
      const payload: any = {
        sample_code: data.sample_code.trim(),
        patient_code: data.patient_code.trim() || null,
        project: data.project.trim() || null,
        sample_type: data.sample_type,
        subtype: data.subtype.trim() || null,
        volume: data.volume ? parseFloat(data.volume) : null,
        units: data.units,
        concentration: data.concentration ? parseFloat(data.concentration) : null,
        status: data.status,
        freeze_date: data.freeze_date || null,
        collection_date: data.collection_date || null,
        max_thaws: parseInt(data.max_thaws) || 3,
        notes: data.notes.trim() || null,
        laboratory: user!.laboratory,
        created_by: user!.id,
      };
      if (editTarget) {
        const { thaw_count: _t, created_by: _c, ...rest } = payload;
        const { error } = await (supabase.from('samples') as any).update(rest).eq('id', editTarget.id);
        if (error) throw error;
      } else {
        payload.thaw_count = 0;
        const { error } = await (supabase.from('samples') as any).insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['samples'] }); closeDialog(); },
    onError: (e: any) => setFormError(e.message),
  });

  const softDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await (supabase.from('samples') as any)
        .update({ deleted_at: new Date().toISOString(), deleted_by: user!.id })
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['samples'] });
      setSelected(new Set());
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await (supabase.from('samples') as any)
        .update({ deleted_at: null, deleted_by: null })
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['samples'] });
      setSelected(new Set());
    },
  });

  const bulkStatusMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: string }) => {
      const { error } = await (supabase.from('samples') as any).update({ status }).in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['samples'] });
      setSelected(new Set());
      setShowBulkDialog(false);
    },
  });

  const openCreate = () => { setEditTarget(null); setForm(emptyForm); setFormError(''); setShowDialog(true); };
  const openEdit = (s: Sample) => {
    setEditTarget(s);
    setForm({
      sample_code: s.sample_code, patient_code: s.patient_code || '', project: s.project || '',
      sample_type: s.sample_type as SampleType, subtype: s.subtype || '',
      volume: s.volume !== null ? String(s.volume) : '', units: s.units as UnitType,
      concentration: s.concentration !== null ? String(s.concentration) : '',
      status: s.status as SampleStatus, freeze_date: s.freeze_date || '',
      collection_date: s.collection_date || '', max_thaws: String(s.max_thaws), notes: s.notes || '',
    });
    setFormError('');
    setShowDialog(true);
  };
  const closeDialog = () => { setShowDialog(false); setEditTarget(null); setForm(emptyForm); };
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!form.sample_code.trim()) return setFormError('El código de muestra es obligatorio');
    saveMutation.mutate(form);
  };
  const f = (field: keyof SampleFormData, val: string) => setForm((prev) => ({ ...prev, [field]: val }));

  const toggleSelect = (id: string) => {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const selectAll = () => setSelected(new Set(filtered.map((s) => s.id)));
  const clearSelect = () => setSelected(new Set());

  const handleBulkCheckout = async () => {
    const targets = filtered.filter(
      (s: Sample & { deleted_at?: string | null }) => selected.has(s.id) && !s.deleted_at && s.status !== 'in_use',
    );
    if (targets.length === 0) {
      alert('No hay muestras activas seleccionadas que se puedan sacar.');
      return;
    }
    if (!confirm(`¿Sacar ${targets.length} muestra${targets.length !== 1 ? 's' : ''}? (+1 descongelación cada una)`)) {
      return;
    }
    try {
      await checkoutSamplesAsync(targets);
      clearSelect();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error al sacar muestras');
    }
  };

  const activeFilterCount = countActiveFilters(filters);

  return (
    <AppLayout>
      <div className="min-h-full bg-gray-50">
        {/* Page header */}
        <div className="bg-white border-b border-gray-200 px-4 lg:px-8 py-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Muestras</h1>
              <p className="text-sm text-gray-500 mt-0.5">{filtered.length} muestra{filtered.length !== 1 ? 's' : ''}{activeFilterCount > 0 ? ` (${samples.filter((s: any) => !s.deleted_at).length} total)` : ''}</p>
            </div>
            <Button onClick={openCreate} className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white self-start sm:self-auto">
              <Plus className="w-4 h-4" /> Nueva muestra
            </Button>
          </div>
        </div>

        <div className="px-4 lg:px-8 py-5 space-y-4">
          {/* Toolbar */}
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                value={filters.search}
                onChange={(e) => setF('search', e.target.value)}
                placeholder="Buscar por código, paciente, proyecto..."
                className="pl-9 border-gray-200 bg-white text-gray-900 placeholder:text-gray-400"
              />
              {filters.search && (
                <button onClick={() => setF('search', '')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="relative">
              <select value={filters.status} onChange={(e) => setF('status', e.target.value)}
                className="appearance-none pl-3 pr-8 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Todos los estados</option>
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>

            <div className="relative">
              <select value={filters.type} onChange={(e) => setF('type', e.target.value)}
                className="appearance-none pl-3 pr-8 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Todos los tipos</option>
                {SAMPLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>

            <button
              onClick={() => setFiltersOpen(!filtersOpen)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                filtersOpen || activeFilterCount > 0
                  ? 'bg-blue-50 border-blue-200 text-blue-700'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Filter className="w-4 h-4" />
              Filtros
              {activeFilterCount > 0 && (
                <span className="bg-blue-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">{activeFilterCount}</span>
              )}
            </button>

            {activeFilterCount > 0 && (
              <button onClick={() => setFilters(emptyFilters)} className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg border border-gray-200 bg-white">
                <X className="w-3.5 h-3.5" /> Limpiar
              </button>
            )}
          </div>

          {/* Extended filter panel */}
          {filtersOpen && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500 flex items-center gap-1"><Beaker className="w-3 h-3" /> Paciente</label>
                <Input value={filters.patient} onChange={(e) => setF('patient', e.target.value)} placeholder="PAT-001" className="border-gray-200 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500">Proyecto</label>
                <Input value={filters.project} onChange={(e) => setF('project', e.target.value)} placeholder="Proyecto-X" className="border-gray-200 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500 flex items-center gap-1"><Thermometer className="w-3 h-3" /> Congelador</label>
                <select value={filters.freezer_id} onChange={(e) => { setF('freezer_id', e.target.value); setF('box_id', ''); }}
                  className="w-full px-2 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Todos</option>
                  {freezers.map((fr) => <option key={fr.id} value={fr.id}>{fr.name} ({fr.temperature}°C)</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500 flex items-center gap-1"><Package2 className="w-3 h-3" /> Caja</label>
                <select value={filters.box_id} onChange={(e) => setF('box_id', e.target.value)}
                  className="w-full px-2 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Todas</option>
                  {boxesForFilter.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500">Congelado desde</label>
                <Input type="date" value={filters.date_from} onChange={(e) => setF('date_from', e.target.value)} className="border-gray-200 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500">Congelado hasta</label>
                <Input type="date" value={filters.date_to} onChange={(e) => setF('date_to', e.target.value)} className="border-gray-200 text-sm" />
              </div>
              <div className="space-y-1 col-span-2 sm:col-span-1 flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={filters.show_deleted} onChange={(e) => setF('show_deleted', e.target.checked)} className="rounded border-gray-300 text-blue-600" />
                  <span className="text-sm text-gray-600">Ver eliminadas</span>
                </label>
              </div>
            </div>
          )}

          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-blue-800">{selected.size} seleccionada{selected.size !== 1 ? 's' : ''}</span>
              <button onClick={clearSelect} className="text-xs text-blue-600 hover:underline">Deseleccionar</button>
              <div className="flex items-center gap-2 ml-auto flex-wrap">
                <button
                  onClick={() => setShowBulkDialog(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  <Archive className="w-3.5 h-3.5" /> Cambiar estado
                </button>
                {!filters.show_deleted && (
                  <button
                    onClick={handleBulkCheckout}
                    disabled={isCheckingOutSamples}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-amber-200 text-amber-700 rounded-lg hover:bg-amber-50 transition-colors disabled:opacity-50"
                  >
                    <ArrowUpFromLine className="w-3.5 h-3.5" /> Sacar
                  </button>
                )}
                {!filters.show_deleted ? (
                  <button
                    onClick={() => softDeleteMutation.mutate(Array.from(selected))}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Eliminar
                  </button>
                ) : (
                  <button
                    onClick={() => restoreMutation.mutate(Array.from(selected))}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-green-200 text-green-600 rounded-lg hover:bg-green-50 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Restaurar
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Table */}
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 bg-gray-100 animate-pulse rounded-xl" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-24">
              <FlaskConical className="w-16 h-16 mx-auto mb-4 text-gray-200" />
              <p className="text-xl font-medium text-gray-400 mb-2">Sin muestras</p>
              <p className="text-sm text-gray-400 mb-6">
                {activeFilterCount > 0 ? 'No se encontraron muestras con los filtros aplicados.' : 'Añade tu primera muestra para comenzar.'}
              </p>
              {activeFilterCount === 0 && (
                <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white">
                  <Plus className="w-4 h-4" /> Nueva muestra
                </Button>
              )}
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    <th className="px-4 py-2.5 w-10">
                      <button onClick={selected.size === filtered.length ? clearSelect : selectAll}>
                        {selected.size === filtered.length && filtered.length > 0
                          ? <CheckSquare className="w-4 h-4 text-blue-600" />
                          : <Square className="w-4 h-4 text-gray-400" />}
                      </button>
                    </th>
                    {['Código', 'Tipo', 'Proyecto', 'Posición', 'Thaws', 'Estado', ''].map((h) => (
                      <th key={h} className="text-left text-xs font-semibold text-gray-500 px-3 py-2.5 whitespace-nowrap last:w-24">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s: any) => (
                    <tr key={s.id} className={`border-b border-gray-50 hover:bg-blue-50/20 transition-colors ${s.deleted_at ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-3">
                        <button onClick={() => toggleSelect(s.id)}>
                          {selected.has(s.id)
                            ? <CheckSquare className="w-4 h-4 text-blue-600" />
                            : <Square className="w-4 h-4 text-gray-300 hover:text-gray-500" />}
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-mono text-sm font-semibold text-gray-900">{s.sample_code}</p>
                        {s.patient_code && <p className="text-xs text-gray-400">P: {s.patient_code}</p>}
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-sm text-gray-700 capitalize">{s.sample_type}</span>
                        {s.subtype && <p className="text-xs text-gray-400">{s.subtype}</p>}
                      </td>
                      <td className="px-3 py-3 hidden md:table-cell">
                        <span className="text-sm text-gray-600">{s.project || <span className="text-gray-300">—</span>}</span>
                      </td>
                      <td className="px-3 py-3">
                        {s.position_label
                          ? <span className="font-mono text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-semibold">{s.position_label}</span>
                          : <span className="text-gray-300 text-sm">—</span>}
                      </td>
                      <td className="px-3 py-3 hidden lg:table-cell">
                        <span className={`font-mono text-xs ${s.thaw_count >= s.max_thaws ? 'text-red-600 font-bold' : 'text-gray-600'}`}>
                          {s.thaw_count}/{s.max_thaws}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full w-fit ${STATUS_BADGE[s.status] || 'bg-gray-100 text-gray-500'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[s.status] || 'bg-gray-400'}`} />
                          {STATUS_LABEL[s.status] || s.status}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1">
                          {!s.deleted_at && s.status === 'in_use' && s.box_id && (
                            <button
                              onClick={() => { setReturnTarget(s); setShowReturnDialog(true); }}
                              title="Devolver a la caja"
                              className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors text-xs font-medium"
                            >
                              ↓
                            </button>
                          )}
                          {!s.deleted_at && s.status !== 'in_use' && s.box_id && (
                            <button
                              onClick={() => { if (confirm('¿Sacar muestra? (+1 descongelación)')) checkoutSample(s); }}
                              disabled={isCheckingOutSample}
                              title="Sacar muestra (+1 descongelación)"
                              className="p-1.5 text-amber-500 hover:bg-amber-50 rounded-lg transition-colors text-xs font-medium"
                            >
                              ↑
                            </button>
                          )}
                          <button
                            onClick={() => openEdit(s)}
                            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {!s.deleted_at ? (
                            <button
                              onClick={() => softDeleteMutation.mutate([s.id])}
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => restoreMutation.mutate([s.id])}
                              className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Editar muestra' : 'Nueva muestra'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            {formError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{formError}</p>}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <label className="text-sm font-medium text-gray-700">Código de muestra *</label>
                <Input value={form.sample_code} onChange={(e) => f('sample_code', e.target.value)} placeholder="SMP-2024-001" className="border-gray-300 font-mono" autoFocus />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Código paciente</label>
                <Input value={form.patient_code} onChange={(e) => f('patient_code', e.target.value)} placeholder="PAT-001" className="border-gray-300" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Proyecto</label>
                <Input value={form.project} onChange={(e) => f('project', e.target.value)} placeholder="Proyecto-X" className="border-gray-300" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Tipo *</label>
                <select value={form.sample_type} onChange={(e) => f('sample_type', e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-300 text-gray-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {SAMPLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Estado</label>
                <select value={form.status} onChange={(e) => f('status', e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-300 text-gray-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1 col-span-2">
                <label className="text-sm font-medium text-gray-700">Volumen</label>
                <Input type="number" value={form.volume} onChange={(e) => f('volume', e.target.value)} placeholder="0.5" step="0.001" className="border-gray-300" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Unidad</label>
                <select value={form.units} onChange={(e) => f('units', e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-300 text-gray-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Máx. thaws</label>
                <Input type="number" value={form.max_thaws} onChange={(e) => f('max_thaws', e.target.value)} min={1} className="border-gray-300" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Subtipo</label>
                <Input value={form.subtype} onChange={(e) => f('subtype', e.target.value)} placeholder="PBMC..." className="border-gray-300" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Fecha congelación</label>
                <Input type="date" value={form.freeze_date} onChange={(e) => f('freeze_date', e.target.value)} className="border-gray-300" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Fecha extracción</label>
                <Input type="date" value={form.collection_date} onChange={(e) => f('collection_date', e.target.value)} className="border-gray-300" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Notas</label>
              <Input value={form.notes} onChange={(e) => f('notes', e.target.value)} placeholder="Observaciones..." className="border-gray-300" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={closeDialog} className="flex-1 border-gray-300 text-gray-700">Cancelar</Button>
              <Button type="submit" disabled={saveMutation.isPending} className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 text-white">
                {saveMutation.isPending ? 'Guardando...' : editTarget ? 'Guardar cambios' : 'Crear muestra'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bulk status change dialog */}
      <Dialog open={showBulkDialog} onOpenChange={setShowBulkDialog}>
        <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-sm">
          <DialogHeader>
            <DialogTitle>Cambiar estado — {selected.size} muestra{selected.size !== 1 ? 's' : ''}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => setBulkStatus(s)}
                  className={`px-3 py-2.5 rounded-lg border text-sm text-left transition-all ${bulkStatus === s ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                >
                  <span className={`inline-block w-2 h-2 rounded-full mr-2 ${STATUS_DOT[s]}`} />
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setShowBulkDialog(false)} className="flex-1 border-gray-300">Cancelar</Button>
              <Button
                disabled={!bulkStatus || bulkStatusMutation.isPending}
                onClick={() => bulkStatusMutation.mutate({ ids: Array.from(selected), status: bulkStatus })}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              >
                {bulkStatusMutation.isPending ? 'Guardando...' : 'Aplicar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ReturnSampleDialog
        sample={returnTarget}
        open={showReturnDialog}
        onClose={() => { setShowReturnDialog(false); setReturnTarget(null); }}
      />
    </AppLayout>
  );
}
