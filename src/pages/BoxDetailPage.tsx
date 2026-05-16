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
import { Plus, X, Pencil, Download, Archive, Chrome as Home, UserPlus, LayoutGrid, ChevronRight } from 'lucide-react';
import type { Box, Sample, SampleType, SampleStatus, UnitType } from '@/types';

const SAMPLE_TYPES: SampleType[] = [
  'tissue', 'blood', 'serum', 'plasma', 'urine', 'csf', 'saliva', 'dna', 'rna', 'protein', 'other',
];
const UNITS: UnitType[] = ['mL', 'µL', 'mg', 'µg', 'ng', 'mol/L', '%', 'other'];
const STATUSES: SampleStatus[] = ['active', 'used', 'discarded', 'archived', 'contaminated'];

const CELL_BG: Record<string, string> = {
  empty: 'bg-white hover:bg-gray-50 border-gray-200',
  active: 'bg-green-500 hover:bg-green-600 border-green-500 cursor-pointer',
  used: 'bg-yellow-400 hover:bg-yellow-500 border-yellow-400 cursor-pointer',
  discarded: 'bg-red-500 hover:bg-red-600 border-red-500 cursor-pointer',
  archived: 'bg-gray-400 hover:bg-gray-500 border-gray-400 cursor-pointer',
  contaminated: 'bg-red-900 hover:bg-red-800 border-red-900 cursor-pointer',
};

const STATUS_LABEL: Record<string, string> = {
  active: 'Activo', used: 'Usado', discarded: 'Descartado', archived: 'Archivado', contaminated: 'Contaminado',
};

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  used: 'bg-yellow-100 text-yellow-700',
  discarded: 'bg-red-100 text-red-700',
  archived: 'bg-gray-100 text-gray-600',
  contaminated: 'bg-red-900/20 text-red-800',
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

  const [largeCells, setLargeCells] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);
  const [selectedSample, setSelectedSample] = useState<Sample | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showEditBoxDialog, setShowEditBoxDialog] = useState(false);
  const [form, setForm] = useState<SampleFormData>(emptyForm);
  const [formError, setFormError] = useState('');
  const [editBoxName, setEditBoxName] = useState('');
  const [editBoxDesc, setEditBoxDesc] = useState('');
  const [editBoxError, setEditBoxError] = useState('');

  const { data: box, isLoading: boxLoading } = useQuery({
    queryKey: ['box', boxId],
    queryFn: async () => {
      const { data, error } = await supabase.from('boxes').select('*').eq('id', boxId!).single();
      if (error) throw error;
      return data as Box;
    },
    enabled: !!boxId && !!user,
  });

  const { data: samples = [] } = useQuery({
    queryKey: ['box-samples', boxId],
    queryFn: async () => {
      const { data, error } = await supabase.from('samples').select('*').eq('box_id', boxId!);
      if (error) throw error;
      return data as Sample[];
    },
    enabled: !!boxId && !!user,
  });

  const { data: freezer } = useQuery({
    queryKey: ['freezer', freezerId],
    queryFn: async () => {
      const { data, error } = await supabase.from('freezers').select('id, name').eq('id', freezerId!).single();
      if (error) throw error;
      return data as { id: string; name: string };
    },
    enabled: !!freezerId && !!user,
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
      const newOccupancy = (box?.occupancy || 0) + 1;
      await (supabase.from('boxes') as any).update({ occupancy: newOccupancy }).eq('id', boxId!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['box-samples', boxId] });
      queryClient.invalidateQueries({ queryKey: ['box', boxId] });
      queryClient.invalidateQueries({ queryKey: ['boxes', freezerId] });
      queryClient.invalidateQueries({ queryKey: ['all-boxes'] });
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
      queryClient.invalidateQueries({ queryKey: ['all-boxes'] });
      setShowDetailDialog(false);
      setSelectedSample(null);
    },
  });

  const editBoxMutation = useMutation({
    mutationFn: async ({ name, description }: { name: string; description: string }) => {
      const { error } = await (supabase.from('boxes') as any)
        .update({ name: name.trim(), description: description.trim() || null })
        .eq('id', boxId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['box', boxId] });
      queryClient.invalidateQueries({ queryKey: ['all-boxes'] });
      queryClient.invalidateQueries({ queryKey: ['boxes', freezerId] });
      setShowEditBoxDialog(false);
    },
    onError: (e: any) => setEditBoxError(e.message),
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

  const openAllocate = () => {
    if (!box) return;
    for (let r = 1; r <= box.rows; r++) {
      for (let c = 1; c <= box.columns; c++) {
        if (!sampleMap[`${r}_${c}`]) {
          setSelectedCell({ row: r, col: c });
          setForm({ ...emptyForm });
          setFormError('');
          setShowAddDialog(true);
          return;
        }
      }
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

  const openEditBox = () => {
    if (!box) return;
    setEditBoxName(box.name);
    setEditBoxDesc(box.description || '');
    setEditBoxError('');
    setShowEditBoxDialog(true);
  };

  const f = (key: keyof SampleFormData, val: string) => setForm((prev) => ({ ...prev, [key]: val }));

  if (boxLoading || !box) {
    return (
      <AppLayout>
        <div className="min-h-full bg-gray-50 p-8">
          <div className="h-12 w-64 bg-gray-200 animate-pulse rounded-xl mb-4" />
          <div className="h-32 bg-white animate-pulse rounded-xl border border-gray-200" />
        </div>
      </AppLayout>
    );
  }

  const rows = box.rows;
  const cols = box.columns;
  const total = rows * cols;
  const pct = total > 0 ? Math.round((box.occupancy / total) * 100) : 0;
  const cellSize = largeCells ? 'w-14 h-14' : 'w-10 h-10';

  return (
    <AppLayout>
      <div className="min-h-full bg-gray-50">
        {/* Page header */}
        <div className="bg-white border-b border-gray-200 px-8 py-5">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-xs text-gray-500 mb-4">
            <Link to="/dashboard" className="hover:text-gray-700 flex items-center gap-1">
              <Home className="w-3 h-3" /> Inicio
            </Link>
            <ChevronRight className="w-3 h-3" />
            <Link to="/boxes" className="hover:text-gray-700">Cajas</Link>
            <ChevronRight className="w-3 h-3" />
            {freezer && (
              <>
                <Link to={`/freezers/${freezerId}`} className="hover:text-gray-700">{freezer.name}</Link>
                <ChevronRight className="w-3 h-3" />
              </>
            )}
            <span className="text-gray-800 font-medium truncate max-w-48">{box.name}</span>
          </nav>

          {/* Title row */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">{box.name}</h1>
                <button
                  onClick={openEditBox}
                  className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                  title="Editar nombre"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <span className="text-xs px-2.5 py-1 rounded-full bg-green-100 text-green-700 font-medium">
                  {STATUS_LABEL[box.status] || box.status}
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Cuadrícula {rows}×{cols} &middot;{' '}
                <span className="font-semibold text-gray-700">{box.occupancy}</span>/{total} muestras ({pct}%)
              </p>
              {box.description && <p className="text-xs text-gray-400 mt-0.5">{box.description}</p>}
            </div>

            {/* Action bar */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                onClick={openEditBox}
                className="border-gray-300 text-gray-700 hover:bg-gray-50 text-sm"
              >
                <Pencil className="w-4 h-4" /> Editar caja
              </Button>
              <Button
                onClick={openAllocate}
                className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white text-sm"
              >
                <UserPlus className="w-4 h-4" /> Asignar muestra
              </Button>
              <Button variant="outline" disabled className="border-gray-300 text-gray-500 text-sm">
                <Download className="w-4 h-4" /> Exportar
              </Button>
              <Button variant="outline" disabled className="border-red-200 text-red-400 text-sm hover:bg-red-50">
                <Archive className="w-4 h-4" /> Archivar
              </Button>
            </div>
          </div>
        </div>

        <div className="px-8 py-6 space-y-6">
          {/* Grid panel */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <LayoutGrid className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-semibold text-gray-700">Cuadrícula {rows}×{cols}</span>
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <span className="text-sm text-gray-600">Celdas grandes</span>
                <div
                  className={`relative w-10 h-5 rounded-full transition-colors ${largeCells ? 'bg-blue-600' : 'bg-gray-200'}`}
                  onClick={() => setLargeCells(!largeCells)}
                >
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${largeCells ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
              </label>
            </div>

            <div className="overflow-auto">
              <div className="inline-block min-w-full">
                {/* Column headers */}
                <div className={`flex items-center gap-1 mb-1 ${largeCells ? 'pl-10' : 'pl-8'}`}>
                  {Array.from({ length: cols }, (_, c) => (
                    <div key={c} className={`${largeCells ? 'w-14' : 'w-10'} h-6 flex items-center justify-center text-xs text-gray-400 font-mono`}>
                      {c + 1}
                    </div>
                  ))}
                </div>
                {/* Rows */}
                {Array.from({ length: rows }, (_, r) => {
                  const rowLetter = String.fromCharCode(65 + r);
                  return (
                    <div key={r} className="flex items-center gap-1 mb-1">
                      <div className={`${largeCells ? 'w-9' : 'w-7'} ${largeCells ? 'h-14' : 'h-10'} flex items-center justify-center text-xs text-gray-400 font-mono flex-shrink-0`}>
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
                            className={`${cellSize} rounded border text-xs font-mono transition-all flex items-center justify-center overflow-hidden ${CELL_BG[cellStatus] || CELL_BG.empty}`}
                          >
                            {sample && largeCells ? (
                              <span className="text-white text-[10px] font-bold leading-tight px-0.5 text-center truncate w-full">
                                {sample.sample_code}
                              </span>
                            ) : !sample ? (
                              <Plus className="w-3 h-3 text-gray-300 opacity-0 hover:opacity-100" />
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-5 mt-5 flex-wrap border-t border-gray-100 pt-4">
              {[
                { label: 'Activo', color: 'bg-green-500' },
                { label: 'Usado', color: 'bg-yellow-400' },
                { label: 'Descartado', color: 'bg-red-500' },
                { label: 'Archivado', color: 'bg-gray-400' },
                { label: 'Vacío', color: 'bg-white border border-gray-300' },
              ].map(({ label, color }) => (
                <span key={label} className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span className={`w-3 h-3 rounded ${color}`} />
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Samples table */}
          {samples.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <div className="px-5 py-3.5 border-b border-gray-200 flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-800">Muestras en esta caja ({samples.length})</p>
                <Button variant="outline" disabled className="border-gray-300 text-gray-500 text-xs px-3 py-1.5 h-auto">
                  <Download className="w-3.5 h-3.5" /> Exportar
                </Button>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left text-xs font-semibold text-gray-500 px-4 py-2.5">Posición</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-4 py-2.5">Código</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-4 py-2.5">Tipo</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-4 py-2.5 hidden md:table-cell">Proyecto</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-4 py-2.5">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {samples
                    .filter((s) => s.position_label)
                    .sort((a, b) => (a.position_label || '').localeCompare(b.position_label || ''))
                    .map((s) => (
                      <tr
                        key={s.id}
                        className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => { setSelectedSample(s); setShowDetailDialog(true); }}
                      >
                        <td className="px-4 py-2.5 font-mono text-gray-600 text-sm">{s.position_label}</td>
                        <td className="px-4 py-2.5 font-mono text-gray-900 text-sm font-medium">{s.sample_code}</td>
                        <td className="px-4 py-2.5 text-gray-500 text-sm capitalize">{s.sample_type}</td>
                        <td className="px-4 py-2.5 text-gray-400 text-sm hidden md:table-cell">{s.project || '—'}</td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_BADGE[s.status] || 'bg-gray-100 text-gray-500'}`}>
                            {STATUS_LABEL[s.status] || s.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add Sample Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-gray-900">
              Añadir muestra en{' '}
              <span className="text-blue-600 font-mono">
                {selectedCell ? positionLabel(selectedCell.row, selectedCell.col) : ''}
              </span>
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddSubmit} className="space-y-3 mt-2">
            {formError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{formError}</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <label className="text-sm font-medium text-gray-700">Código de muestra *</label>
                <Input
                  value={form.sample_code}
                  onChange={(e) => f('sample_code', e.target.value)}
                  placeholder="SMP-2024-001"
                  className="border-gray-300 text-gray-900 font-mono"
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Código paciente</label>
                <Input
                  value={form.patient_code}
                  onChange={(e) => f('patient_code', e.target.value)}
                  placeholder="PAT-001"
                  className="border-gray-300 text-gray-900"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Proyecto</label>
                <Input
                  value={form.project}
                  onChange={(e) => f('project', e.target.value)}
                  placeholder="Proyecto-X"
                  className="border-gray-300 text-gray-900"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Tipo *</label>
                <select
                  value={form.sample_type}
                  onChange={(e) => f('sample_type', e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-300 text-gray-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {SAMPLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Estado</label>
                <select
                  value={form.status}
                  onChange={(e) => f('status', e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-300 text-gray-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s] || s}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1 col-span-2">
                <label className="text-sm font-medium text-gray-700">Volumen</label>
                <Input
                  type="number"
                  value={form.volume}
                  onChange={(e) => f('volume', e.target.value)}
                  placeholder="0.5"
                  className="border-gray-300 text-gray-900"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Unidad</label>
                <select
                  value={form.units}
                  onChange={(e) => f('units', e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-300 text-gray-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Notas</label>
              <Input
                value={form.notes}
                onChange={(e) => f('notes', e.target.value)}
                placeholder="Observaciones..."
                className="border-gray-300 text-gray-900"
              />
            </div>
            <div className="flex gap-3 pt-1">
              <Button type="button" variant="outline" onClick={closeAddDialog} className="flex-1 border-gray-300 text-gray-700">
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
        <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-gray-900">Detalle de muestra</DialogTitle>
          </DialogHeader>
          {selectedSample && (
            <div className="mt-2 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-2xl font-mono font-bold text-gray-900">{selectedSample.sample_code}</p>
                  <p className="text-gray-500 text-sm">
                    Posición: <span className="font-mono text-blue-600">{selectedSample.position_label}</span>
                  </p>
                </div>
                <span className={`text-sm px-3 py-1 rounded-full font-medium capitalize ${STATUS_BADGE[selectedSample.status] || 'bg-gray-100 text-gray-500'}`}>
                  {STATUS_LABEL[selectedSample.status] || selectedSample.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                {[
                  { label: 'Tipo', value: selectedSample.sample_type },
                  { label: 'Subtipo', value: selectedSample.subtype || '—' },
                  { label: 'Proyecto', value: selectedSample.project || '—' },
                  { label: 'Paciente', value: selectedSample.patient_code || '—' },
                  { label: 'Volumen', value: selectedSample.volume !== null ? `${selectedSample.volume} ${selectedSample.units}` : '—' },
                  { label: 'Descongelaciones', value: `${selectedSample.thaw_count} / ${selectedSample.max_thaws}` },
                  { label: 'Congelación', value: selectedSample.freeze_date || '—' },
                  { label: 'Extracción', value: selectedSample.collection_date || '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-gray-50 rounded-lg p-2.5">
                    <p className="text-gray-400 text-xs mb-0.5">{label}</p>
                    <p className="text-gray-900 capitalize font-medium text-sm">{value}</p>
                  </div>
                ))}
              </div>

              {selectedSample.notes && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-400 mb-1">Notas</p>
                  <p className="text-gray-700 text-sm">{selectedSample.notes}</p>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <Button
                  variant="outline"
                  onClick={() => setShowDetailDialog(false)}
                  className="flex-1 border-gray-300 text-gray-700"
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
                  className="flex-1 border-red-200 text-red-500 hover:bg-red-50"
                >
                  <X className="w-4 h-4" /> Quitar posición
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Box Dialog */}
      <Dialog open={showEditBoxDialog} onOpenChange={setShowEditBoxDialog}>
        <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-gray-900">Editar caja</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {editBoxError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{editBoxError}</p>
            )}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Nombre *</label>
              <Input
                value={editBoxName}
                onChange={(e) => setEditBoxName(e.target.value)}
                className="border-gray-300 text-gray-900"
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Descripción</label>
              <Input
                value={editBoxDesc}
                onChange={(e) => setEditBoxDesc(e.target.value)}
                placeholder="Descripción opcional..."
                className="border-gray-300 text-gray-900"
              />
            </div>
            <div className="flex gap-3 pt-1">
              <Button
                variant="outline"
                onClick={() => setShowEditBoxDialog(false)}
                className="flex-1 border-gray-300 text-gray-700"
              >
                Cancelar
              </Button>
              <Button
                disabled={editBoxMutation.isPending || !editBoxName.trim()}
                onClick={() => editBoxMutation.mutate({ name: editBoxName, description: editBoxDesc })}
                className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 text-white"
              >
                {editBoxMutation.isPending ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
