"use client";

import { useState, useMemo, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
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
import { Plus, X, Pencil, Download, Archive, Chrome as Home, UserPlus, LayoutGrid, ChevronRight, QrCode, Printer, Check, FileText, Table2, Save, Image, FlaskConical, ClipboardPaste, Upload } from 'lucide-react';

import type { Box, Sample, SampleType, SampleStatus, UnitType, Rack } from '@/types';

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

const CELL_HEX: Record<string, { bg: string; text: string }> = {
  empty: { bg: '#f9fafb', text: '#d1d5db' },
  active: { bg: '#22c55e', text: '#ffffff' },
  used: { bg: '#facc15', text: '#78350f' },
  discarded: { bg: '#ef4444', text: '#ffffff' },
  archived: { bg: '#9ca3af', text: '#ffffff' },
  contaminated: { bg: '#7f1d1d', text: '#ffffff' },
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

// ... (Resto de funciones utilitarias: positionLabel, triggerDownload, etc. igual)

interface SpreadsheetColumn {
  key: string; label: string; minW: number; type: 'text' | 'select' | 'number' | 'readonly'; options?: string[]; optionLabels?: Record<string, string>;
}

const SHEET_COLS: SpreadsheetColumn[] = [
  { key: 'position_label', label: 'Pos.', minW: 52, type: 'readonly' },
  { key: 'sample_code', label: 'Código *', minW: 128, type: 'text' },
  { key: 'patient_code', label: 'Paciente', minW: 112, type: 'text' },
  { key: 'project', label: 'Proyecto', minW: 112, type: 'text' },
  { key: 'sample_type', label: 'Tipo', minW: 110, type: 'select', options: SAMPLE_TYPES },
  { key: 'subtype', label: 'Subtipo', minW: 96, type: 'text' },
  { key: 'status', label: 'Estado', minW: 120, type: 'select', options: STATUSES, optionLabels: STATUS_LABEL },
  { key: 'volume', label: 'Vol.', minW: 72, type: 'number' },
  { key: 'units', label: 'Unidad', minW: 80, type: 'select', options: UNITS },
  { key: 'notes', label: 'Notas', minW: 192, type: 'text' },
];

interface SpreadsheetRow {
  _id: string | null; _dirty: boolean; _new: boolean; position_label: string; sample_code: string; patient_code: string; project: string; sample_type: string; subtype: string; status: string; volume: string; units: string; notes: string;
}

function positionLabel(row: number, col: number): string { return `${String.fromCharCode(64 + row)}${col}`; }
function triggerBlobDownload(blob: Blob, filename: string) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); }
function triggerDownload(content: string, filename: string, mimeType: string) { triggerBlobDownload(new Blob([content], { type: mimeType }), filename); }
async function parseFileToRows(file: File): Promise<Record<string, string>[]> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                const wb = XLSX.read(data, { type: 'array' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const raw = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });
                resolve(raw.map((r) => { const out: Record<string, string> = {}; Object.keys(r).forEach((k) => { out[k.trim().toLowerCase()] = String(r[k] ?? ''); }); return out; }));
            } catch (err) { reject(err); }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

interface SampleFormData {
  sample_code: string; patient_code: string; project: string; sample_type: SampleType; subtype: string; volume: string; units: UnitType; status: SampleStatus; max_thaws: string; notes: string;
}

const emptyForm: SampleFormData = { sample_code: '', patient_code: '', project: '', sample_type: 'blood', subtype: '', volume: '', units: 'mL', status: 'active', max_thaws: '3', notes: '' };

interface ImportResult { imported: number; errors: { row: number; message: string }[]; }
interface ImportPreview { rows: Record<string, string>[]; file: File; }
type ViewMode = 'grid' | 'spreadsheet';

export function BoxDetailPage() {
  const { freezerId, boxId } = useParams<{ freezerId: string; boxId: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editBoxImageRef = useRef<HTMLInputElement>(null);
  const gridExportRef = useRef<HTMLDivElement>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);
  const [selectedSample, setSelectedSample] = useState<Sample | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showEditBoxDialog, setShowEditBoxDialog] = useState(false);
  const [showQrDialog, setShowQrDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importTab, setImportTab] = useState<'upload' | 'template'>('upload');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [form, setForm] = useState<SampleFormData>(emptyForm);
  const [formError, setFormError] = useState('');
  const [editBoxName, setEditBoxName] = useState('');
  const [editBoxDesc, setEditBoxDesc] = useState('');
  const [editBoxShelf, setEditBoxShelf] = useState('');
  const [editBoxRack, setEditBoxRack] = useState('');
  const [editBoxRows, setEditBoxRows] = useState('9');
  const [editBoxCols, setEditBoxCols] = useState('9');
  const [editBoxImageFile, setEditBoxImageFile] = useState<File | null>(null);
  const [editBoxImagePreview, setEditBoxImagePreview] = useState<string | null>(null);
  const [editBoxError, setEditBoxError] = useState('');
  const [editForm, setEditForm] = useState<SampleFormData>(emptyForm);
  const [sheetRows, setSheetRows] = useState<SpreadsheetRow[]>([]);
  const [savingRows, setSavingRows] = useState<Set<string>>(new Set());
  const [focusedCell, setFocusedCell] = useState<{ rowIdx: number; colIdx: number } | null>(null);
  const [pasteHighlight, setPasteHighlight] = useState<Set<string>>(new Set());
  const [pasteCount, setPasteCount] = useState<number | null>(null);

  const { data: box, isLoading: boxLoading } = useQuery({
    queryKey: ['box', boxId],
    queryFn: async () => { const { data, error } = await supabase.from('boxes').select('*').eq('id', boxId!).single(); if (error) throw error; return data as Box; },
    enabled: !!boxId && !!user,
  });

  const { data: samples = [] } = useQuery({
    queryKey: ['box-samples', boxId],
    queryFn: async () => { const { data, error } = await supabase.from('samples').select('*').eq('box_id', boxId!); if (error) throw error; return data as Sample[]; },
    enabled: !!boxId && !!user,
  });

  const { data: freezer } = useQuery({
    queryKey: ['freezer', freezerId],
    queryFn: async () => { const { data, error } = await supabase.from('freezers').select('id, name, shelf_count').eq('id', freezerId!).single(); if (error) throw error; return data as { id: string; name: string; shelf_count: number }; },
    enabled: !!freezerId && !!user,
  });

  const { data: freezerRacks = [] } = useQuery({
    queryKey: ['racks', freezerId],
    queryFn: async () => { const { data, error } = await (supabase.from('racks') as any).select('*').eq('freezer_id', freezerId!).order('shelf_number', { ascending: true }); if (error) throw error; return data as Rack[]; },
    enabled: !!freezerId && !!user,
  });

  const sampleMap = useMemo(() => {
    const m: Record<string, Sample> = {};
    samples.forEach((s) => { if (s.position_row !== null && s.position_column !== null) m[`${s.position_row}_${s.position_column}`] = s; });
    return m;
  }, [samples]);

  const buildSheetRows = useCallback((boxData: Box, sampleList: Sample[]): SpreadsheetRow[] => {
    const byLabel: Record<string, Sample> = {};
    sampleList.forEach((s) => { if (s.position_label) byLabel[s.position_label] = s; });
    const result: SpreadsheetRow[] = [];
    for (let r = 1; r <= boxData.rows; r++) {
      for (let c = 1; c <= boxData.columns; c++) {
        const lbl = positionLabel(r, c);
        const s = byLabel[lbl];
        if (s) {
          result.push({
            _id: s.id, _dirty: false, _new: false, position_label: lbl, sample_code: s.sample_code, patient_code: s.patient_code || '', project: s.project || '', sample_type: s.sample_type, subtype: s.subtype || '', status: s.status, volume: s.volume !== null ? String(s.volume) : '', units: s.units || 'mL', notes: s.notes || '',
          });
        } else {
          result.push({
            _id: null, _dirty: false, _new: true, position_label: lbl, sample_code: '', patient_code: '', project: '', sample_type: 'blood', subtype: '', status: 'active', volume: '', units: 'mL', notes: '',
          });
        }
      }
    }
    return result;
  }, []);

  const handleSetViewMode = (mode: ViewMode) => {
    if (mode === 'spreadsheet' && box) setSheetRows(buildSheetRows(box, samples));
    setViewMode(mode);
  };

  const updateSampleMutation = useMutation({
    mutationFn: async (updatedData: Partial<Sample>) => {
      if (!selectedSample) throw new Error('No hay muestra seleccionada');
      const { error } = await (supabase.from('samples') as any).update({ ...updatedData, updated_at: new Date().toISOString() }).eq('id', selectedSample.id);
      if (error) throw error;
      return updatedData;
    },
    onSuccess: (updatedData) => {
      queryClient.invalidateQueries({ queryKey: ['box-samples', boxId] });
      setSelectedSample(prev => prev ? { ...prev, ...updatedData as Sample } : null);
      setShowDetailDialog(false);
    },
  });

  const addSampleMutation = useMutation({
    mutationFn: async (data: SampleFormData & { row: number; col: number }) => {
      const label = positionLabel(data.row, data.col);
      const payload = {
        sample_code: data.sample_code.trim(), patient_code: data.patient_code.trim() || null, project: data.project.trim() || null, sample_type: data.sample_type, subtype: data.subtype.trim() || null, volume: data.volume ? parseFloat(data.volume) : null, units: data.units, status: data.status, thaw_count: 0, max_thaws: parseInt(data.max_thaws) || 3, notes: data.notes.trim() || null, box_id: boxId!, position_row: data.row, position_column: data.col, position_label: label, laboratory: user!.laboratory, created_by: user!.id,
      };
      const { error } = await (supabase.from('samples') as any).insert([payload]);
      if (error) throw error;
      await (supabase.from('boxes') as any).update({ occupancy: (box?.occupancy || 0) + 1 }).eq('id', boxId!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['box-samples', boxId] });
      queryClient.invalidateQueries({ queryKey: ['box', boxId] });
      queryClient.invalidateQueries({ queryKey: ['all-boxes'] });
      closeAddDialog();
    },
    onError: (e: any) => setFormError(e.message),
  });

  const removeSampleMutation = useMutation({
    mutationFn: async (sampleId: string) => {
      const { error } = await (supabase.from('samples') as any).update({ box_id: null, position_row: null, position_column: null, position_label: null }).eq('id', sampleId);
      if (error) throw error;
      await (supabase.from('boxes') as any).update({ occupancy: Math.max((box?.occupancy || 0) - 1, 0) }).eq('id', boxId!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['box-samples', boxId] });
      queryClient.invalidateQueries({ queryKey: ['box', boxId] });
      queryClient.invalidateQueries({ queryKey: ['all-boxes'] });
      setShowDetailDialog(false);
      setSelectedSample(null);
    },
  });

  const sacarMuestraMutation = useMutation({
    mutationFn: async (s: Sample) => {
      const newThaws = s.thaw_count + 1;
      const { error } = await (supabase.from('samples') as any).update({ status: 'used', thaw_count: newThaws }).eq('id', s.id);
      if (error) throw error;
      return { newThaws, maxThaws: s.max_thaws };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['box-samples', boxId] });
      setShowDetailDialog(false);
      if (result.newThaws >= result.maxThaws) setTimeout(() => alert(`Advertencia: la muestra ha alcanzado el máximo de descongelaciones (${result.maxThaws}).`), 100);
    },
  });

  const editBoxMutation = useMutation({
    mutationFn: async ({ name, description, shelf_number, rack_id, rows, columns }: { name: string; description: string; shelf_number: number | null; rack_id: string | null; rows: number; columns: number }) => {
        let imageUrl = box?.image_url ?? null;
        if (editBoxImageFile) {
            const ext = editBoxImageFile.name.split('.').pop();
            const path = `boxes/${boxId}.${ext}`;
            const { error: upErr } = await supabase.storage.from('cryo-images').upload(path, editBoxImageFile, { upsert: true });
            if (upErr) throw upErr;
            const { data: urlData } = supabase.storage.from('cryo-images').getPublicUrl(path);
            imageUrl = urlData.publicUrl;
        }
        const { error } = await (supabase.from('boxes') as any).update({ name: name.trim(), description: description.trim() || null, shelf_number, rack_id, rows, columns, image_url: imageUrl }).eq('id', boxId!);
        if (error) throw error;
    },
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['box', boxId] });
        queryClient.invalidateQueries({ queryKey: ['all-boxes'] });
        queryClient.invalidateQueries({ queryKey: ['boxes', freezerId] });
        setShowEditBoxDialog(false);
        setEditBoxImageFile(null);
    },
    onError: (e: any) => setEditBoxError(e.message),
  });

  const saveSheetRow = async (sr: SpreadsheetRow) => {
    if (!sr.sample_code.trim()) return;
    const key = sr._id ?? sr.position_label;
    setSavingRows((prev) => new Set(prev).add(key));
    try {
      const label = sr.position_label;
      const rowNum = label.charCodeAt(0) - 64;
      const colNum = parseInt(label.slice(1));
      if (sr._new && !sr._id) {
        const payload = { sample_code: sr.sample_code.trim(), patient_code: sr.patient_code.trim() || null, project: sr.project.trim() || null, sample_type: sr.sample_type, subtype: sr.subtype.trim() || null, volume: sr.volume ? parseFloat(sr.volume) : null, units: sr.units, status: sr.status, thaw_count: 0, max_thaws: 3, notes: sr.notes.trim() || null, box_id: boxId!, position_row: rowNum, position_column: colNum, position_label: label, laboratory: user!.laboratory, created_by: user!.id, };
        const { data: inserted, error } = await (supabase.from('samples') as any).insert([payload]).select().single();
        if (error) throw error;
        await (supabase.from('boxes') as any).update({ occupancy: (box?.occupancy || 0) + 1 }).eq('id', boxId!);
        setSheetRows((prev) => prev.map((r) => r._new && r._id === null && r.position_label === label ? { ...r, _id: inserted.id, _new: false, _dirty: false } : r));
        queryClient.invalidateQueries({ queryKey: ['box', boxId] });
      } else if (sr._id) {
        const { error } = await (supabase.from('samples') as any).update({ sample_code: sr.sample_code.trim(), patient_code: sr.patient_code.trim() || null, project: sr.project.trim() || null, sample_type: sr.sample_type, subtype: sr.subtype.trim() || null, volume: sr.volume ? parseFloat(sr.volume) : null, units: sr.units, status: sr.status, notes: sr.notes.trim() || null, }).eq('id', sr._id);
        if (error) throw error;
        setSheetRows((prev) => prev.map((r) => r._id === sr._id ? { ...r, _dirty: false } : r));
      }
      queryClient.invalidateQueries({ queryKey: ['box-samples', boxId] });
    } finally {
      setSavingRows((prev) => { const next = new Set(prev); next.delete(key); return next; });
    }
  };

  const saveAllDirty = async () => {
    const dirty = sheetRows.filter((r) => r._dirty || (r._new && r.sample_code.trim()));
    for (const r of dirty) await saveSheetRow(r);
  };

  const updateSheetCell = (idx: number, col: string, val: string) => {
    setSheetRows((prev) => { const updated = [...prev]; updated[idx] = { ...updated[idx], [col]: val, _dirty: true }; return updated; });
  };

  const handleTablePaste = (e: React.ClipboardEvent<HTMLTableSectionElement>) => {
    if (!focusedCell) return;
    const text = e.clipboardData.getData('text/plain');
    if (!text.trim()) return;
    e.preventDefault();
    const pastedRows = text.split(/\r?\n/).map((line) => line.split('\t')).filter((row) => row.some((cell) => cell.trim() !== ''));
    if (pastedRows.length === 0) return;
    const { rowIdx: startRow, colIdx: startCol } = focusedCell;
    const highlights = new Set<string>();
    let filled = 0;
    setSheetRows((prev) => {
      const updated = [...prev];
      for (let pr = 0; pr < pastedRows.length; pr++) {
        const targetRowIdx = startRow + pr;
        if (targetRowIdx >= updated.length) break;
        for (let pc = 0; pc < pastedRows[pr].length; pc++) {
          const targetColIdx = startCol + pc;
          if (targetColIdx >= EDITABLE_COLS.length) break;
          const colKey = EDITABLE_COLS[targetColIdx].key;
          const colDef = EDITABLE_COLS[targetColIdx];
          let val = pastedRows[pr][pc].trim();
          if (colDef.type === 'select' && colDef.options && val && !colDef.options.includes(val)) val = (updated[targetRowIdx] as any)[colKey];
          updated[targetRowIdx] = { ...updated[targetRowIdx], [colKey]: val, _dirty: true };
          highlights.add(`${targetRowIdx}_${targetColIdx}`);
          filled++;
        }
      }
      return updated;
    });
    setPasteCount(filled);
    setPasteHighlight(highlights);
    setTimeout(() => { setPasteHighlight(new Set()); setPasteCount(null); }, 1200);
  };

  const handleCellClick = (row: number, col: number) => {
    const existing = sampleMap[`${row}_${col}`];
    if (existing) {
      setSelectedSample(existing);
      setEditForm({ sample_code: existing.sample_code, patient_code: existing.patient_code || '', project: existing.project || '', sample_type: existing.sample_type as SampleType, subtype: existing.subtype || '', volume: existing.volume !== null ? String(existing.volume) : '', units: (existing.units as UnitType) || 'mL', status: existing.status as SampleStatus, max_thaws: String(existing.max_thaws), notes: existing.notes || '', });
      setShowDetailDialog(true);
    } else {
      setSelectedCell({ row, col });
      setForm({ ...emptyForm }); setFormError(''); setShowAddDialog(true);
    }
  };

  const openAllocate = () => {
    if (!box) return;
    for (let r = 1; r <= box.rows; r++) {
      for (let c = 1; c <= box.columns; c++) {
        if (!sampleMap[`${r}_${c}`]) {
          setSelectedCell({ row: r, col: c });
          setForm({ ...emptyForm }); setFormError(''); setShowAddDialog(true);
          return;
        }
      }
    }
  };

  const closeAddDialog = () => { setShowAddDialog(false); setSelectedCell(null); setForm(emptyForm); };
  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.sample_code.trim()) return setFormError('El código es obligatorio');
    if (!selectedCell) return;
    addSampleMutation.mutate({ ...form, row: selectedCell.row, col: selectedCell.col });
  };

  const openEditBox = () => {
    if (!box) return;
    setEditBoxName(box.name); setEditBoxDesc(box.description || ''); setEditBoxShelf(box.shelf_number ? String(box.shelf_number) : ''); setEditBoxRack(box.rack_id || ''); setEditBoxRows(String(box.rows)); setEditBoxCols(String(box.columns)); setEditBoxImageFile(null); setEditBoxImagePreview(box.image_url || null); setEditBoxError(''); setShowEditBoxDialog(true);
  };

  const handlePrint = () => {
    const style = document.createElement('style'); style.id = 'cryo-print-style'; style.textContent = `@media print { body > * { display: none !important; } #cryo-print-area { display: block !important; position: fixed; top: 0; left: 0; width: 100%; } }`; document.head.appendChild(style);
    const area = document.getElementById('cryo-print-area'); if (area) area.style.display = 'block'; window.print();
    setTimeout(() => { style.remove(); if (area) area.style.display = 'none'; }, 500);
  };

  const qrUrl = boxId ? `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(boxId)}&size=200x200&margin=10&format=png` : '';
  const sortedSamples = [...samples].filter((s) => s.position_label).sort((a, b) => (a.position_label || '').localeCompare(b.position_label || ''));
  const EDITABLE_COLS = SHEET_COLS.filter((c) => c.type !== 'readonly');

  return (
    <AppLayout>
      {/* ... (Print area y resto de JSX igual, salvo que en Dialogs añadimos clases estéticas) */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="bg-white border-none rounded-3xl p-0 overflow-hidden shadow-2xl">
          <div className="px-6 pt-6 pb-2">
            <DialogHeader>
                <DialogTitle className="text-xl font-bold tracking-tight text-gray-900">
                    Añadir muestra en <span className="text-blue-600 font-mono">{selectedCell ? positionLabel(selectedCell.row, selectedCell.col) : ''}</span>
                </DialogTitle>
            </DialogHeader>
          </div>
          <form onSubmit={handleAddSubmit} className="px-6 pb-6 pt-2 space-y-4">
            {/* Campos del formulario */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5 col-span-2">
                <label className="text-xs font-semibold uppercase text-gray-400 tracking-wider">Código *</label>
                <Input value={form.sample_code} onChange={(e) => f('sample_code', e.target.value)} placeholder="SMP-2024-001" className="border-gray-200 rounded-xl" autoFocus />
              </div>
              {/* Resto de campos con rounded-xl y border-gray-200 */}
            </div>
            {/* ... */}
          </form>
        </DialogContent>
      </Dialog>
      {/* (Aplicar cambios similares a los otros diálogos) */}
    </AppLayout>
  );
}