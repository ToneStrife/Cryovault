import { useState, useMemo } from 'react';
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
  Search,
  Beaker,
  Pencil,
  X,
  ChevronDown,
} from 'lucide-react';
import type { Sample, SampleType, SampleStatus, UnitType } from '@/types';

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-500/20 text-green-400',
  used: 'bg-yellow-500/20 text-yellow-400',
  discarded: 'bg-red-500/20 text-red-400',
  archived: 'bg-slate-500/20 text-slate-400',
  contaminated: 'bg-red-700/20 text-red-500',
};

const SAMPLE_TYPES: SampleType[] = [
  'tissue', 'blood', 'serum', 'plasma', 'urine', 'csf', 'saliva', 'dna', 'rna', 'protein', 'other',
];
const STATUSES: SampleStatus[] = ['active', 'used', 'discarded', 'archived', 'contaminated'];
const UNITS: UnitType[] = ['mL', 'µL', 'mg', 'µg', 'ng', 'mol/L', '%', 'other'];

interface SampleFormData {
  sample_code: string;
  patient_code: string;
  project: string;
  sample_type: SampleType;
  subtype: string;
  volume: string;
  units: UnitType;
  concentration: string;
  status: SampleStatus;
  freeze_date: string;
  collection_date: string;
  max_thaws: string;
  notes: string;
}

const emptyForm: SampleFormData = {
  sample_code: '',
  patient_code: '',
  project: '',
  sample_type: 'blood',
  subtype: '',
  volume: '',
  units: 'mL',
  concentration: '',
  status: 'active',
  freeze_date: '',
  collection_date: '',
  max_thaws: '3',
  notes: '',
};

export function SamplesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [showDialog, setShowDialog] = useState(false);
  const [editTarget, setEditTarget] = useState<Sample | null>(null);
  const [form, setForm] = useState<SampleFormData>(emptyForm);
  const [formError, setFormError] = useState('');

  const { data: samples = [], isLoading } = useQuery({
    queryKey: ['samples'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('samples')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Sample[];
    },
    enabled: !!user,
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return samples.filter((s) => {
      const matchQ =
        !q ||
        s.sample_code.toLowerCase().includes(q) ||
        (s.patient_code || '').toLowerCase().includes(q) ||
        (s.project || '').toLowerCase().includes(q);
      const matchStatus = !statusFilter || s.status === statusFilter;
      const matchType = !typeFilter || s.sample_type === typeFilter;
      return matchQ && matchStatus && matchType;
    });
  }, [samples, search, statusFilter, typeFilter]);

  const saveMutation = useMutation({
    mutationFn: async (data: SampleFormData) => {
      const payload = {
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
        thaw_count: 0,
        max_thaws: parseInt(data.max_thaws) || 3,
        notes: data.notes.trim() || null,
        laboratory: user!.laboratory,
        created_by: user!.id,
      };
      if (editTarget) {
        const { thaw_count: _t, created_by: _c, ...rest } = payload as any;
        const { error } = await (supabase.from('samples') as any)
          .update(rest)
          .eq('id', editTarget.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from('samples') as any).insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['samples'] });
      closeDialog();
    },
    onError: (e: any) => setFormError(e.message),
  });

  const openCreate = () => {
    setEditTarget(null);
    setForm(emptyForm);
    setFormError('');
    setShowDialog(true);
  };

  const openEdit = (s: Sample) => {
    setEditTarget(s);
    setForm({
      sample_code: s.sample_code,
      patient_code: s.patient_code || '',
      project: s.project || '',
      sample_type: s.sample_type as SampleType,
      subtype: s.subtype || '',
      volume: s.volume !== null ? String(s.volume) : '',
      units: s.units as UnitType,
      concentration: s.concentration !== null ? String(s.concentration) : '',
      status: s.status as SampleStatus,
      freeze_date: s.freeze_date || '',
      collection_date: s.collection_date || '',
      max_thaws: String(s.max_thaws),
      notes: s.notes || '',
    });
    setFormError('');
    setShowDialog(true);
  };

  const closeDialog = () => {
    setShowDialog(false);
    setEditTarget(null);
    setForm(emptyForm);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!form.sample_code.trim()) return setFormError('El código de muestra es obligatorio');
    saveMutation.mutate(form);
  };

  const f = (field: keyof SampleFormData, val: string) => setForm((prev) => ({ ...prev, [field]: val }));

  return (
    <AppLayout>
      <div className="p-8">
        {/* Toolbar */}
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por código, paciente, proyecto..."
              className="pl-9 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 bg-slate-800 border border-slate-700 text-white rounded-md text-sm"
            >
              <option value="">Todos los estados</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>

          <div className="relative">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 bg-slate-800 border border-slate-700 text-white rounded-md text-sm"
            >
              <option value="">Todos los tipos</option>
              {SAMPLE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>

          <Button
            onClick={openCreate}
            className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white"
          >
            <Plus className="w-4 h-4" /> Nueva muestra
          </Button>
        </div>

        {/* Count */}
        <p className="text-slate-500 text-xs mb-4">
          {filtered.length} muestra{filtered.length !== 1 ? 's' : ''}
          {(search || statusFilter || typeFilter) && ` (filtradas de ${samples.length})`}
        </p>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 bg-slate-800/50 animate-pulse rounded-lg border border-slate-700" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24 text-slate-500">
            <Beaker className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <p className="text-xl font-medium mb-2">Sin muestras</p>
            <p className="mb-6 text-sm">
              {search || statusFilter || typeFilter
                ? 'No se encontraron muestras con los filtros aplicados.'
                : 'Añade tu primera muestra para comenzar.'}
            </p>
            {!search && !statusFilter && !typeFilter && (
              <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white">
                <Plus className="w-4 h-4" /> Nueva muestra
              </Button>
            )}
          </div>
        ) : (
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-900/50">
                  <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">Código</th>
                  <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">Tipo</th>
                  <th className="text-left text-xs text-slate-400 font-medium px-4 py-3 hidden md:table-cell">Proyecto</th>
                  <th className="text-left text-xs text-slate-400 font-medium px-4 py-3 hidden lg:table-cell">Volumen</th>
                  <th className="text-left text-xs text-slate-400 font-medium px-4 py-3 hidden lg:table-cell">Thaws</th>
                  <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">Estado</th>
                  <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">Posición</th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, idx) => (
                  <tr
                    key={s.id}
                    className={`border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors ${
                      idx % 2 === 0 ? '' : 'bg-slate-900/20'
                    }`}
                  >
                    <td className="px-4 py-3">
                      <p className="text-white font-mono text-sm font-medium">{s.sample_code}</p>
                      {s.patient_code && (
                        <p className="text-slate-400 text-xs">P: {s.patient_code}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-slate-300 text-sm capitalize">{s.sample_type}</span>
                      {s.subtype && <p className="text-slate-500 text-xs">{s.subtype}</p>}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-slate-400 text-sm">{s.project || '—'}</span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {s.volume !== null ? (
                        <span className="text-slate-300 text-sm">{s.volume} {s.units}</span>
                      ) : (
                        <span className="text-slate-600 text-sm">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className={`text-sm font-mono ${s.thaw_count >= s.max_thaws ? 'text-red-400' : 'text-slate-300'}`}>
                        {s.thaw_count}/{s.max_thaws}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full capitalize font-medium ${STATUS_COLORS[s.status] || 'bg-slate-700 text-slate-400'}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {s.position_label ? (
                        <span className="text-slate-300 text-xs font-mono bg-slate-700 px-2 py-0.5 rounded">
                          {s.position_label}
                        </span>
                      ) : (
                        <span className="text-slate-600 text-sm">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => openEdit(s)}
                        className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-700 rounded"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Editar muestra' : 'Nueva muestra'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            {formError && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2">
                {formError}
              </p>
            )}

            {/* Identification */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <label className="text-sm text-slate-300">Código de muestra *</label>
                <Input
                  value={form.sample_code}
                  onChange={(e) => f('sample_code', e.target.value)}
                  placeholder="Ej: SMP-2024-001"
                  className="bg-slate-800 border-slate-600 text-white font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-slate-300">Código paciente</label>
                <Input
                  value={form.patient_code}
                  onChange={(e) => f('patient_code', e.target.value)}
                  placeholder="PAT-001"
                  className="bg-slate-800 border-slate-600 text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-slate-300">Proyecto</label>
                <Input
                  value={form.project}
                  onChange={(e) => f('project', e.target.value)}
                  placeholder="Proyecto-X"
                  className="bg-slate-800 border-slate-600 text-white"
                />
              </div>
            </div>

            {/* Type */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm text-slate-300">Tipo de muestra *</label>
                <select
                  value={form.sample_type}
                  onChange={(e) => f('sample_type', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-white rounded-md text-sm capitalize"
                >
                  {SAMPLE_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm text-slate-300">Subtipo</label>
                <Input
                  value={form.subtype}
                  onChange={(e) => f('subtype', e.target.value)}
                  placeholder="PBMC, plasma fresco..."
                  className="bg-slate-800 border-slate-600 text-white"
                />
              </div>
            </div>

            {/* Volume + Units */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1 col-span-2">
                <label className="text-sm text-slate-300">Volumen</label>
                <Input
                  type="number"
                  value={form.volume}
                  onChange={(e) => f('volume', e.target.value)}
                  placeholder="0.5"
                  step="0.001"
                  className="bg-slate-800 border-slate-600 text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-slate-300">Unidad</label>
                <select
                  value={form.units}
                  onChange={(e) => f('units', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-white rounded-md text-sm"
                >
                  {UNITS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Status + Max thaws */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm text-slate-300">Estado</label>
                <select
                  value={form.status}
                  onChange={(e) => f('status', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-white rounded-md text-sm capitalize"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm text-slate-300">Máx. thaws</label>
                <Input
                  type="number"
                  value={form.max_thaws}
                  onChange={(e) => f('max_thaws', e.target.value)}
                  min={1}
                  className="bg-slate-800 border-slate-600 text-white"
                />
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm text-slate-300">Fecha congelación</label>
                <Input
                  type="date"
                  value={form.freeze_date}
                  onChange={(e) => f('freeze_date', e.target.value)}
                  className="bg-slate-800 border-slate-600 text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-slate-300">Fecha extracción</label>
                <Input
                  type="date"
                  value={form.collection_date}
                  onChange={(e) => f('collection_date', e.target.value)}
                  className="bg-slate-800 border-slate-600 text-white"
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <label className="text-sm text-slate-300">Notas</label>
              <Input
                value={form.notes}
                onChange={(e) => f('notes', e.target.value)}
                placeholder="Observaciones..."
                className="bg-slate-800 border-slate-600 text-white"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={closeDialog}
                className="flex-1 border-slate-600 text-slate-300"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saveMutation.isPending}
                className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 text-white"
              >
                {saveMutation.isPending ? 'Guardando...' : editTarget ? 'Guardar cambios' : 'Crear muestra'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
