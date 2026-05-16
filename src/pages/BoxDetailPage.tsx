import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
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
import { ChevronLeft, Plus, X } from 'lucide-react';
import type { Box, Sample, SampleType, SampleStatus, UnitType } from '@/types';

const SAMPLE_TYPES: SampleType[] = [
  'tissue', 'blood', 'serum', 'plasma', 'urine', 'csf', 'saliva', 'dna', 'rna', 'protein', 'other',
];
const UNITS: UnitType[] = ['mL', 'µL', 'mg', 'µg', 'ng', 'mol/L', '%', 'other'];
const STATUSES: SampleStatus[] = ['active', 'used', 'discarded', 'archived', 'contaminated'];

const CELL_STATUS_COLORS: Record<string, string> = {
  empty: 'bg-slate-800 hover:bg-slate-700 border-slate-700',
  active: 'bg-green-500/30 hover:bg-green-500/40 border-green-500/50 cursor-pointer',
  used: 'bg-yellow-500/30 hover:bg-yellow-500/40 border-yellow-500/50 cursor-pointer',
  discarded: 'bg-red-500/30 hover:bg-red-500/40 border-red-500/50 cursor-pointer',
  archived: 'bg-slate-600/30 hover:bg-slate-600/40 border-slate-600/50 cursor-pointer',
  contaminated: 'bg-red-900/30 hover:bg-red-900/40 border-red-900/50 cursor-pointer',
};

function positionLabel(row: number, col: number): string {
  return `${String.fromCharCode(64 + row)}${col}`;
}

interface SampleFormData {
  sample_code: string;
  patient_code: string;
  project: string;
  sample_type: SampleType;
  subtype: string;
  volume: string;
  units: UnitType;
  status: SampleStatus;
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
  status: 'active',
  max_thaws: '3',
  notes: '',
};

export function BoxDetailPage() {
  const { freezerId, boxId } = useParams<{ freezerId: string; boxId: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);
  const [selectedSample, setSelectedSample] = useState<Sample | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [form, setForm] = useState<SampleFormData>(emptyForm);
  const [formError, setFormError] = useState('');

  const { data: box } = useQuery({
    queryKey: ['box', boxId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('boxes')
        .select('*')
        .eq('id', boxId!)
        .single();
      if (error) throw error;
      return data as Box;
    },
    enabled: !!boxId && !!user,
  });

  const { data: samples = [] } = useQuery({
    queryKey: ['box-samples', boxId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('samples')
        .select('*')
        .eq('box_id', boxId!);
      if (error) throw error;
      return data as Sample[];
    },
    enabled: !!boxId && !!user,
  });

  const sampleMap = useMemo(() => {
    const m: Record<string, Sample> = {};
    samples.forEach((s) => {
      if (s.position_row !== null && s.position_column !== null) {
        m[`${s.position_row}_${s.position_column}`] = s;
      }
    });
    return m;
  }, [samples]);

  const addSampleMutation = useMutation({
    mutationFn: async (data: SampleFormData & { row: number; col: number }) => {
      const label = positionLabel(data.row, data.col);
      const samplePayload = {
        sample_code: data.sample_code.trim(),
        patient_code: data.patient_code.trim() || null,
        project: data.project.trim() || null,
        sample_type: data.sample_type,
        subtype: data.subtype.trim() || null,
        volume: data.volume ? parseFloat(data.volume) : null,
        units: data.units,
        status: data.status,
        thaw_count: 0,
        max_thaws: parseInt(data.max_thaws) || 3,
        notes: data.notes.trim() || null,
        box_id: boxId!,
        position_row: data.row,
        position_column: data.col,
        position_label: label,
        laboratory: user!.laboratory,
        created_by: user!.id,
      };
      const { error: sErr } = await (supabase.from('samples') as any).insert([samplePayload]);
      if (sErr) throw sErr;
      // Update box occupancy
      const newOccupancy = (box?.occupancy || 0) + 1;
      await (supabase.from('boxes') as any).update({ occupancy: newOccupancy }).eq('id', boxId!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['box-samples', boxId] });
      queryClient.invalidateQueries({ queryKey: ['box', boxId] });
      queryClient.invalidateQueries({ queryKey: ['boxes', freezerId] });
      closeAddDialog();
    },
    onError: (e: any) => setFormError(e.message),
  });

  const removeSampleMutation = useMutation({
    mutationFn: async (sampleId: string) => {
      const { error } = await (supabase.from('samples') as any)
        .update({ box_id: null, position_row: null, position_column: null, position_label: null })
        .eq('id', sampleId);
      if (error) throw error;
      const newOccupancy = Math.max((box?.occupancy || 0) - 1, 0);
      await (supabase.from('boxes') as any).update({ occupancy: newOccupancy }).eq('id', boxId!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['box-samples', boxId] });
      queryClient.invalidateQueries({ queryKey: ['box', boxId] });
      setShowDetailDialog(false);
      setSelectedSample(null);
    },
  });

  const handleCellClick = (row: number, col: number) => {
    const key = `${row}_${col}`;
    const existing = sampleMap[key];
    if (existing) {
      setSelectedSample(existing);
      setShowDetailDialog(true);
    } else {
      setSelectedCell({ row, col });
      setForm({ ...emptyForm });
      setFormError('');
      setShowAddDialog(true);
    }
  };

  const closeAddDialog = () => {
    setShowAddDialog(false);
    setSelectedCell(null);
    setForm(emptyForm);
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.sample_code.trim()) return setFormError('El código es obligatorio');
    if (!selectedCell) return;
    addSampleMutation.mutate({ ...form, row: selectedCell.row, col: selectedCell.col });
  };

  const f = (key: keyof SampleFormData, val: string) => setForm((prev) => ({ ...prev, [key]: val }));

  if (!box) {
    return (
      <AppLayout>
        <div className="p-8">
          <div className="h-12 w-64 bg-slate-800 animate-pulse rounded-xl" />
        </div>
      </AppLayout>
    );
  }

  const rows = box.rows;
  const cols = box.columns;

  return (
    <AppLayout>
      <div className="p-8">
        {/* Header */}
        <div className="mb-6">
          <Link
            to={`/freezers/${freezerId}`}
            className="flex items-center gap-2 text-slate-400 hover:text-white text-sm mb-4 w-fit"
          >
            <ChevronLeft className="w-4 h-4" /> Volver al congelador
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">{box.name}</h1>
              <p className="text-slate-400 text-sm mt-1">
                Cuadrícula {rows}×{cols} ·{' '}
                <span className="text-white font-medium">{box.occupancy}</span> / {rows * cols} posiciones ocupadas
              </p>
              {box.description && <p className="text-slate-500 text-xs mt-1">{box.description}</p>}
            </div>
            {/* Legend */}
            <div className="flex items-center gap-4 text-xs text-slate-400">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-700 border border-slate-600" /> Vacía</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-500/40 border border-green-500/50" /> Activa</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-yellow-500/40 border border-yellow-500/50" /> Usada</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-500/40 border border-red-500/50" /> Descartada</span>
            </div>
          </div>
        </div>

        {/* Grid */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 overflow-auto">
          <div className="inline-block min-w-full">
            {/* Column headers */}
            <div className="flex items-center gap-1 mb-1 pl-8">
              {Array.from({ length: cols }, (_, c) => (
                <div key={c} className="w-10 h-6 flex items-center justify-center text-xs text-slate-500 font-mono">
                  {c + 1}
                </div>
              ))}
            </div>
            {/* Rows */}
            {Array.from({ length: rows }, (_, r) => {
              const rowLetter = String.fromCharCode(65 + r);
              return (
                <div key={r} className="flex items-center gap-1 mb-1">
                  {/* Row label */}
                  <div className="w-7 h-10 flex items-center justify-center text-xs text-slate-500 font-mono flex-shrink-0">
                    {rowLetter}
                  </div>
                  {Array.from({ length: cols }, (_, c) => {
                    const key = `${r + 1}_${c + 1}`;
                    const sample = sampleMap[key];
                    const cellStatus = sample ? sample.status : 'empty';
                    const label = positionLabel(r + 1, c + 1);
                    return (
                      <button
                        key={c}
                        onClick={() => handleCellClick(r + 1, c + 1)}
                        title={sample ? `${sample.sample_code} | ${sample.sample_type} | ${sample.status}` : `${label} — vacío`}
                        className={`w-10 h-10 rounded border text-xs font-mono transition-all flex items-center justify-center ${CELL_STATUS_COLORS[cellStatus] || CELL_STATUS_COLORS.empty}`}
                      >
                        {!sample && (
                          <Plus className="w-3 h-3 text-slate-600 opacity-0 group-hover:opacity-100" />
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Sample list */}
        {samples.length > 0 && (
          <div className="mt-6 bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-700 bg-slate-900/40">
              <p className="text-sm font-medium text-white">Muestras en esta caja ({samples.length})</p>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left text-xs text-slate-400 px-4 py-2">Posición</th>
                  <th className="text-left text-xs text-slate-400 px-4 py-2">Código</th>
                  <th className="text-left text-xs text-slate-400 px-4 py-2">Tipo</th>
                  <th className="text-left text-xs text-slate-400 px-4 py-2 hidden md:table-cell">Proyecto</th>
                  <th className="text-left text-xs text-slate-400 px-4 py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {samples
                  .filter((s) => s.position_label)
                  .sort((a, b) => (a.position_label || '').localeCompare(b.position_label || ''))
                  .map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-slate-700/40 hover:bg-slate-700/20 transition-colors cursor-pointer"
                      onClick={() => { setSelectedSample(s); setShowDetailDialog(true); }}
                    >
                      <td className="px-4 py-2 font-mono text-slate-300 text-sm">{s.position_label}</td>
                      <td className="px-4 py-2 font-mono text-white text-sm">{s.sample_code}</td>
                      <td className="px-4 py-2 text-slate-400 text-sm capitalize">{s.sample_type}</td>
                      <td className="px-4 py-2 text-slate-500 text-sm hidden md:table-cell">{s.project || '—'}</td>
                      <td className="px-4 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full capitalize font-medium ${
                          { active: 'bg-green-500/20 text-green-400', used: 'bg-yellow-500/20 text-yellow-400', discarded: 'bg-red-500/20 text-red-400', archived: 'bg-slate-500/20 text-slate-400', contaminated: 'bg-red-700/20 text-red-500' }[s.status] || ''
                        }`}>{s.status}</span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Sample Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Añadir muestra en{' '}
              <span className="text-cyan-400 font-mono">
                {selectedCell ? positionLabel(selectedCell.row, selectedCell.col) : ''}
              </span>
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddSubmit} className="space-y-3 mt-2">
            {formError && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2">{formError}</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <label className="text-sm text-slate-300">Código de muestra *</label>
                <Input
                  value={form.sample_code}
                  onChange={(e) => f('sample_code', e.target.value)}
                  placeholder="SMP-2024-001"
                  className="bg-slate-800 border-slate-600 text-white font-mono"
                  autoFocus
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm text-slate-300">Tipo *</label>
                <select
                  value={form.sample_type}
                  onChange={(e) => f('sample_type', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-white rounded-md text-sm"
                >
                  {SAMPLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm text-slate-300">Estado</label>
                <select
                  value={form.status}
                  onChange={(e) => f('status', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-white rounded-md text-sm"
                >
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1 col-span-2">
                <label className="text-sm text-slate-300">Volumen</label>
                <Input
                  type="number"
                  value={form.volume}
                  onChange={(e) => f('volume', e.target.value)}
                  placeholder="0.5"
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
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm text-slate-300">Notas</label>
              <Input
                value={form.notes}
                onChange={(e) => f('notes', e.target.value)}
                placeholder="Observaciones..."
                className="bg-slate-800 border-slate-600 text-white"
              />
            </div>
            <div className="flex gap-3 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={closeAddDialog}
                className="flex-1 border-slate-600 text-slate-300"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={addSampleMutation.isPending}
                className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 text-white"
              >
                {addSampleMutation.isPending ? 'Guardando...' : 'Añadir muestra'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Sample Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={(open) => !open && setShowDetailDialog(false)}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle>Detalle de muestra</DialogTitle>
          </DialogHeader>
          {selectedSample && (
            <div className="mt-2 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-2xl font-mono font-bold text-white">{selectedSample.sample_code}</p>
                  <p className="text-slate-400 text-sm">Posición: <span className="font-mono text-cyan-400">{selectedSample.position_label}</span></p>
                </div>
                <span className={`text-sm px-3 py-1 rounded-full font-medium capitalize ${
                  { active: 'bg-green-500/20 text-green-400', used: 'bg-yellow-500/20 text-yellow-400', discarded: 'bg-red-500/20 text-red-400', archived: 'bg-slate-500/20 text-slate-400', contaminated: 'bg-red-700/20 text-red-500' }[selectedSample.status] || ''
                }`}>{selectedSample.status}</span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  { label: 'Tipo', value: selectedSample.sample_type },
                  { label: 'Subtipo', value: selectedSample.subtype || '—' },
                  { label: 'Proyecto', value: selectedSample.project || '—' },
                  { label: 'Paciente', value: selectedSample.patient_code || '—' },
                  { label: 'Volumen', value: selectedSample.volume !== null ? `${selectedSample.volume} ${selectedSample.units}` : '—' },
                  { label: 'Thaw count', value: `${selectedSample.thaw_count} / ${selectedSample.max_thaws}` },
                  { label: 'Congelación', value: selectedSample.freeze_date || '—' },
                  { label: 'Extracción', value: selectedSample.collection_date || '—' },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-slate-400 text-xs mb-0.5">{label}</p>
                    <p className="text-white capitalize">{value}</p>
                  </div>
                ))}
              </div>

              {selectedSample.notes && (
                <div className="bg-slate-800 rounded-lg p-3">
                  <p className="text-xs text-slate-400 mb-1">Notas</p>
                  <p className="text-slate-300 text-sm">{selectedSample.notes}</p>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <Button
                  variant="outline"
                  onClick={() => setShowDetailDialog(false)}
                  className="flex-1 border-slate-600 text-slate-300"
                >
                  Cerrar
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (confirm('¿Quitar muestra de esta posición? La muestra se mantendrá en el inventario sin posición asignada.')) {
                      removeSampleMutation.mutate(selectedSample.id);
                    }
                  }}
                  disabled={removeSampleMutation.isPending}
                  className="flex-1 border-red-500/40 text-red-400 hover:bg-red-500/10"
                >
                  <X className="w-4 h-4" /> Quitar posición
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
