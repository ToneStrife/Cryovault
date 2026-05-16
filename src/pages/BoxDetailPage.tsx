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
import { Plus, X, Pencil, Download, Archive, Chrome as Home, UserPlus, LayoutGrid, ChevronRight, QrCode, Upload, Printer, Check, FileText, Table2, Save } from 'lucide-react';
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

// Spreadsheet column definitions
interface SpreadsheetColumn {
  key: string;
  label: string;
  width: string;
  type: 'text' | 'select' | 'number' | 'readonly';
  options?: string[];
  optionLabels?: Record<string, string>;
}

const SHEET_COLS: SpreadsheetColumn[] = [
  { key: 'position_label', label: 'Pos.', width: 'w-14', type: 'readonly' },
  { key: 'sample_code', label: 'Código *', width: 'w-32', type: 'text' },
  { key: 'patient_code', label: 'Paciente', width: 'w-28', type: 'text' },
  { key: 'project', label: 'Proyecto', width: 'w-28', type: 'text' },
  { key: 'sample_type', label: 'Tipo', width: 'w-28', type: 'select', options: SAMPLE_TYPES },
  { key: 'subtype', label: 'Subtipo', width: 'w-24', type: 'text' },
  { key: 'status', label: 'Estado', width: 'w-32', type: 'select', options: STATUSES, optionLabels: STATUS_LABEL },
  { key: 'volume', label: 'Vol.', width: 'w-20', type: 'number' },
  { key: 'units', label: 'Unidad', width: 'w-20', type: 'select', options: UNITS },
  { key: 'notes', label: 'Notas', width: 'w-48', type: 'text' },
];

interface SpreadsheetRow {
  _id: string | null; // null = new unsaved row
  _dirty: boolean;
  _new: boolean;
  position_label: string;
  sample_code: string;
  patient_code: string;
  project: string;
  sample_type: string;
  subtype: string;
  status: string;
  volume: string;
  units: string;
  notes: string;
}

function positionLabel(row: number, col: number): string {
  return `${String.fromCharCode(64 + row)}${col}`;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function triggerDownload(content: string, filename: string, mimeType: string) {
  triggerBlobDownload(new Blob([content], { type: mimeType }), filename);
}

function parseFileToRows(file: File): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });
        // Normalize header keys to lowercase
        const normalized = raw.map((r) => {
          const out: Record<string, string> = {};
          Object.keys(r).forEach((k) => { out[k.trim().toLowerCase()] = String(r[k] ?? ''); });
          return out;
        });
        resolve(normalized);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
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

interface ImportResult {
  imported: number;
  errors: { row: number; message: string }[];
}

interface ImportPreview {
  rows: Record<string, string>[];
  file: File;
}

type ViewMode = 'grid' | 'spreadsheet';

export function BoxDetailPage() {
  const { freezerId, boxId } = useParams<{ freezerId: string; boxId: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [largeCells, setLargeCells] = useState(false);
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
  const [editBoxError, setEditBoxError] = useState('');

  // Spreadsheet state
  const [sheetRows, setSheetRows] = useState<SpreadsheetRow[]>([]);
  const [savingRows, setSavingRows] = useState<Set<string>>(new Set());

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

  // Build all grid positions, overlay existing samples, append empty new rows
  const buildSheetRows = useCallback((boxData: Box, sampleList: Sample[]): SpreadsheetRow[] => {
    const existing = sampleList
      .filter((s) => s.position_label)
      .sort((a, b) => (a.position_label || '').localeCompare(b.position_label || ''))
      .map((s): SpreadsheetRow => ({
        _id: s.id,
        _dirty: false,
        _new: false,
        position_label: s.position_label || '',
        sample_code: s.sample_code,
        patient_code: s.patient_code || '',
        project: s.project || '',
        sample_type: s.sample_type,
        subtype: s.subtype || '',
        status: s.status,
        volume: s.volume !== null ? String(s.volume) : '',
        units: s.units || 'mL',
        notes: s.notes || '',
      }));

    // Compute next free position for the empty new row
    const occupied = new Set(existing.map((r) => r.position_label));
    let nextPos = '';
    outer: for (let r = 1; r <= boxData.rows; r++) {
      for (let c = 1; c <= boxData.columns; c++) {
        const lbl = positionLabel(r, c);
        if (!occupied.has(lbl)) { nextPos = lbl; break outer; }
      }
    }

    const emptyRow: SpreadsheetRow = {
      _id: null,
      _dirty: false,
      _new: true,
      position_label: nextPos,
      sample_code: '',
      patient_code: '',
      project: '',
      sample_type: 'blood',
      subtype: '',
      status: 'active',
      volume: '',
      units: 'mL',
      notes: '',
    };

    return [...existing, emptyRow];
  }, []);

  // Sync sheet rows when switching to spreadsheet view
  const handleSetViewMode = (mode: ViewMode) => {
    if (mode === 'spreadsheet' && box) {
      setSheetRows(buildSheetRows(box, samples));
    }
    setViewMode(mode);
  };

  const addSampleMutation = useMutation({
    mutationFn: async (data: SampleFormData & { row: number; col: number }) => {
      const label = positionLabel(data.row, data.col);
      const payload = {
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
      const { error } = await (supabase.from('samples') as any).insert([payload]);
      if (error) throw error;
      await (supabase.from('boxes') as any).update({ occupancy: (box?.occupancy || 0) + 1 }).eq('id', boxId!);
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
      await (supabase.from('boxes') as any)
        .update({ occupancy: Math.max((box?.occupancy || 0) - 1, 0) })
        .eq('id', boxId!);
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

  // --- Spreadsheet row save ---
  const saveSheetRow = async (sr: SpreadsheetRow) => {
    if (!sr.sample_code.trim()) return;
    const key = sr._id ?? sr.position_label;
    setSavingRows((prev) => new Set(prev).add(key));

    try {
      if (sr._new && !sr._id) {
        // Resolve position_label to row/col
        const label = sr.position_label;
        const rowNum = label.charCodeAt(0) - 64;
        const colNum = parseInt(label.slice(1));
        const payload = {
          sample_code: sr.sample_code.trim(),
          patient_code: sr.patient_code.trim() || null,
          project: sr.project.trim() || null,
          sample_type: sr.sample_type,
          subtype: sr.subtype.trim() || null,
          volume: sr.volume ? parseFloat(sr.volume) : null,
          units: sr.units,
          status: sr.status,
          thaw_count: 0,
          max_thaws: 3,
          notes: sr.notes.trim() || null,
          box_id: boxId!,
          position_row: rowNum,
          position_column: colNum,
          position_label: label,
          laboratory: user!.laboratory,
          created_by: user!.id,
        };
        const { data: inserted, error } = await (supabase.from('samples') as any)
          .insert([payload])
          .select()
          .single();
        if (error) throw error;
        await (supabase.from('boxes') as any)
          .update({ occupancy: (box?.occupancy || 0) + 1 })
          .eq('id', boxId!);

        setSheetRows((prev) => {
          const idx = prev.findIndex((r) => r._new && r._id === null && r.position_label === label);
          if (idx === -1) return prev;
          const updated = [...prev];
          updated[idx] = { ...updated[idx], _id: inserted.id, _new: false, _dirty: false };
          // Add a new empty row at the end
          const occupied2 = new Set(updated.filter((r) => !r._new).map((r) => r.position_label));
          let nextPos = '';
          if (box) {
            outer2: for (let r = 1; r <= box.rows; r++) {
              for (let c = 1; c <= box.columns; c++) {
                const lbl = positionLabel(r, c);
                if (!occupied2.has(lbl)) { nextPos = lbl; break outer2; }
              }
            }
          }
          if (nextPos) {
            updated.push({ _id: null, _dirty: false, _new: true, position_label: nextPos, sample_code: '', patient_code: '', project: '', sample_type: 'blood', subtype: '', status: 'active', volume: '', units: 'mL', notes: '' });
          }
          return updated;
        });
        queryClient.invalidateQueries({ queryKey: ['box', boxId] });
      } else if (sr._id) {
        const { error } = await (supabase.from('samples') as any)
          .update({
            sample_code: sr.sample_code.trim(),
            patient_code: sr.patient_code.trim() || null,
            project: sr.project.trim() || null,
            sample_type: sr.sample_type,
            subtype: sr.subtype.trim() || null,
            volume: sr.volume ? parseFloat(sr.volume) : null,
            units: sr.units,
            status: sr.status,
            notes: sr.notes.trim() || null,
          })
          .eq('id', sr._id);
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
    setSheetRows((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [col]: val, _dirty: true };
      return updated;
    });
  };

  // --- Actions ---

  const handleCellClick = (row: number, col: number) => {
    const existing = sampleMap[`${row}_${col}`];
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

  // --- Export ---
  const handleExportCSV = () => {
    if (!box || samples.length === 0) return;
    const header = 'posicion,codigo,paciente,proyecto,tipo,subtipo,estado,volumen,unidades,descongelaciones,notas';
    const rows = samples
      .filter((s) => s.position_label)
      .sort((a, b) => (a.position_label || '').localeCompare(b.position_label || ''))
      .map((s) =>
        [s.position_label, s.sample_code, s.patient_code || '', s.project || '', s.sample_type, s.subtype || '', s.status, s.volume ?? '', s.units, s.thaw_count, s.notes || ''].join(',')
      );
    triggerDownload([header, ...rows].join('\n'), `${box.name}-muestras.csv`, 'text/csv');
  };

  const handleExportXLSX = () => {
    if (!box || samples.length === 0) return;
    const data = samples
      .filter((s) => s.position_label)
      .sort((a, b) => (a.position_label || '').localeCompare(b.position_label || ''))
      .map((s) => ({
        Posicion: s.position_label,
        Codigo: s.sample_code,
        Paciente: s.patient_code || '',
        Proyecto: s.project || '',
        Tipo: s.sample_type,
        Subtipo: s.subtype || '',
        Estado: s.status,
        Volumen: s.volume ?? '',
        Unidades: s.units,
        Descongelaciones: s.thaw_count,
        Notas: s.notes || '',
      }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [8, 16, 12, 14, 10, 10, 12, 8, 8, 14, 20].map((w) => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Muestras');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    triggerBlobDownload(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${box.name}-muestras.xlsx`);
  };

  const handleDownloadTemplate = () => {
    const data = [{ codigo: 'SMP-001', paciente: 'PAT-001', proyecto: 'Proyecto-X', tipo: 'blood', subtipo: '', estado: 'active', volumen: '0.5', unidades: 'mL', notas: '' }];
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [14, 12, 14, 10, 10, 12, 8, 8, 20].map((w) => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    triggerBlobDownload(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'plantilla-muestras.xlsx');
  };

  // --- Import ---
  const handleImportFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rows = await parseFileToRows(file);
      setImportPreview({ rows: rows.slice(0, 5), file });
    } catch {
      setImportResult({ imported: 0, errors: [{ row: 1, message: 'No se pudo leer el archivo. Usa formato .xlsx, .xls o .csv' }] });
    }
  };

  const confirmImport = async () => {
    if (!importPreview || !box) return;
    setImportLoading(true);
    setImportPreview(null);
    const rows = await parseFileToRows(importPreview.file);
    const errors: { row: number; message: string }[] = [];
    let imported = 0;

    const freePositions: { row: number; col: number }[] = [];
    for (let r = 1; r <= box.rows; r++) {
      for (let c = 1; c <= box.columns; c++) {
        if (!sampleMap[`${r}_${c}`]) freePositions.push({ row: r, col: c });
      }
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      const code = row['codigo']?.trim();
      if (!code) { errors.push({ row: rowNum, message: 'Código vacío' }); continue; }
      const pos = freePositions[imported];
      if (!pos) { errors.push({ row: rowNum, message: 'No hay posiciones libres' }); continue; }

      const sampleType = (SAMPLE_TYPES.includes(row['tipo'] as SampleType) ? row['tipo'] : 'other') as SampleType;
      const status = (STATUSES.includes(row['estado'] as SampleStatus) ? row['estado'] : 'active') as SampleStatus;
      const units = (UNITS.includes(row['unidades'] as UnitType) ? row['unidades'] : 'mL') as UnitType;

      const { error } = await (supabase.from('samples') as any).insert([{
        sample_code: code,
        patient_code: row['paciente'] || null,
        project: row['proyecto'] || null,
        sample_type: sampleType,
        subtype: row['subtipo'] || null,
        volume: row['volumen'] ? parseFloat(row['volumen']) : null,
        units,
        status,
        thaw_count: 0,
        max_thaws: 3,
        notes: row['notas'] || null,
        box_id: boxId!,
        position_row: pos.row,
        position_column: pos.col,
        position_label: positionLabel(pos.row, pos.col),
        laboratory: user!.laboratory,
        created_by: user!.id,
      }]);

      if (error) errors.push({ row: rowNum, message: error.message });
      else imported++;
    }

    if (imported > 0) {
      await (supabase.from('boxes') as any)
        .update({ occupancy: (box.occupancy || 0) + imported })
        .eq('id', boxId!);
      queryClient.invalidateQueries({ queryKey: ['box-samples', boxId] });
      queryClient.invalidateQueries({ queryKey: ['box', boxId] });
      queryClient.invalidateQueries({ queryKey: ['all-boxes'] });
    }

    setImportResult({ imported, errors });
    setImportLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // --- Print grid ---
  const handlePrint = () => {
    const style = document.createElement('style');
    style.id = 'cryo-print-style';
    style.textContent = `
      @media print {
        body > * { display: none !important; }
        #cryo-print-area { display: block !important; }
        #cryo-print-area { position: fixed; top: 0; left: 0; width: 100%; }
      }
    `;
    document.head.appendChild(style);
    const area = document.getElementById('cryo-print-area');
    if (area) area.style.display = 'block';
    window.print();
    setTimeout(() => {
      style.remove();
      if (area) area.style.display = 'none';
    }, 500);
  };

  // --- QR ---
  const qrUrl = boxId
    ? `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(boxId)}&size=200x200&margin=10&format=png`
    : '';

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
  const dirtyCount = sheetRows.filter((r) => r._dirty || (r._new && r.sample_code.trim())).length;

  return (
    <AppLayout>
      {/* Hidden print area */}
      <div id="cryo-print-area" style={{ display: 'none' }} className="p-8 bg-white">
        <div className="mb-4 pb-3 border-b border-gray-300">
          <h1 className="text-xl font-bold text-gray-900">{box.name}</h1>
          <p className="text-sm text-gray-500">
            {freezer?.name} &middot; Cuadrícula {rows}×{cols} &middot; {box.occupancy}/{total} ({pct}%)
          </p>
        </div>
        <div ref={gridRef} className="overflow-auto">
          <div className="inline-block">
            <div className="flex gap-0.5 mb-0.5 pl-7">
              {Array.from({ length: cols }, (_, c) => (
                <div key={c} className="w-12 h-5 flex items-center justify-center text-xs text-gray-400 font-mono">{c + 1}</div>
              ))}
            </div>
            {Array.from({ length: rows }, (_, r) => (
              <div key={r} className="flex gap-0.5 mb-0.5">
                <div className="w-6 h-12 flex items-center justify-center text-xs text-gray-400 font-mono">{String.fromCharCode(65 + r)}</div>
                {Array.from({ length: cols }, (_, c) => {
                  const s = sampleMap[`${r + 1}_${c + 1}`];
                  return (
                    <div key={c} className={`w-12 h-12 border rounded text-[9px] font-mono flex flex-col items-center justify-center overflow-hidden ${s ? 'bg-green-100 border-green-400 text-green-900' : 'bg-gray-50 border-gray-200 text-gray-300'}`}>
                      {s ? (
                        <>
                          <span className="font-bold leading-tight">{positionLabel(r + 1, c + 1)}</span>
                          <span className="leading-tight truncate max-w-full px-0.5">{s.sample_code}</span>
                        </>
                      ) : (
                        <span>{positionLabel(r + 1, c + 1)}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-4 text-xs text-gray-400">Impreso: {new Date().toLocaleString('es-ES')}</div>
      </div>

      <div className="min-h-full bg-gray-50">
        {/* Page header */}
        <div className="bg-white border-b border-gray-200 px-8 py-5">
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

          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">{box.name}</h1>
                <button onClick={openEditBox} className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors">
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

            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" onClick={() => setShowQrDialog(true)} className="border-gray-300 text-gray-700 hover:bg-gray-50 text-sm">
                <QrCode className="w-4 h-4" /> Ver QR
              </Button>
              <Button
                variant="outline"
                onClick={() => { setImportTab('upload'); setImportResult(null); setImportPreview(null); setShowImportDialog(true); }}
                className="border-gray-300 text-gray-700 hover:bg-gray-50 text-sm"
              >
                <Upload className="w-4 h-4" /> Importar
              </Button>
              <Button
                onClick={openAllocate}
                className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white text-sm"
              >
                <UserPlus className="w-4 h-4" /> Asignar muestra
              </Button>
              <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
                <button
                  onClick={handleExportCSV}
                  disabled={samples.length === 0}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40 border-r border-gray-300"
                >
                  <Download className="w-4 h-4" /> CSV
                </button>
                <button
                  onClick={handleExportXLSX}
                  disabled={samples.length === 0}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
                >
                  <Download className="w-4 h-4" /> Excel
                </button>
              </div>
              <Button variant="outline" disabled className="border-red-200 text-red-400 text-sm hover:bg-red-50">
                <Archive className="w-4 h-4" /> Archivar
              </Button>
            </div>
          </div>
        </div>

        <div className="px-8 py-6 space-y-6">
          {/* View mode toggle */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
            <button
              onClick={() => handleSetViewMode('grid')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'grid' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <LayoutGrid className="w-4 h-4" /> Cuadrícula
            </button>
            <button
              onClick={() => handleSetViewMode('spreadsheet')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'spreadsheet' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Table2 className="w-4 h-4" /> Hoja de datos
            </button>
          </div>

          {viewMode === 'grid' && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <LayoutGrid className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-semibold text-gray-700">Cuadrícula {rows}×{cols}</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handlePrint}
                    className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 transition-colors"
                  >
                    <Printer className="w-3.5 h-3.5" /> Imprimir
                  </button>
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
              </div>

              <div className="overflow-auto">
                <div className="inline-block min-w-full">
                  <div className={`flex items-center gap-1 mb-1 ${largeCells ? 'pl-10' : 'pl-8'}`}>
                    {Array.from({ length: cols }, (_, c) => (
                      <div key={c} className={`${largeCells ? 'w-14' : 'w-10'} h-6 flex items-center justify-center text-xs text-gray-400 font-mono`}>{c + 1}</div>
                    ))}
                  </div>
                  {Array.from({ length: rows }, (_, r) => (
                    <div key={r} className="flex items-center gap-1 mb-1">
                      <div className={`${largeCells ? 'w-9' : 'w-7'} ${largeCells ? 'h-14' : 'h-10'} flex items-center justify-center text-xs text-gray-400 font-mono flex-shrink-0`}>
                        {String.fromCharCode(65 + r)}
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
                  ))}
                </div>
              </div>

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
          )}

          {viewMode === 'spreadsheet' && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              {/* Spreadsheet toolbar */}
              <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between bg-gray-50/60">
                <div className="flex items-center gap-2">
                  <Table2 className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-semibold text-gray-700">Hoja de datos</span>
                  {dirtyCount > 0 && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                      {dirtyCount} cambio{dirtyCount !== 1 ? 's' : ''} sin guardar
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Tab para moverse entre celdas · Intro para confirmar</span>
                  {dirtyCount > 0 && (
                    <button
                      onClick={saveAllDirty}
                      className="flex items-center gap-1.5 text-sm font-medium bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Save className="w-3.5 h-3.5" /> Guardar todo
                    </button>
                  )}
                </div>
              </div>

              {/* Spreadsheet table */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {SHEET_COLS.map((col) => (
                        <th key={col.key} className={`${col.width} text-left text-xs font-semibold text-gray-500 px-3 py-2.5 border-r border-gray-100 last:border-r-0 whitespace-nowrap`}>
                          {col.label}
                        </th>
                      ))}
                      <th className="w-10 border-r-0" />
                    </tr>
                  </thead>
                  <tbody>
                    {sheetRows.map((sr, idx) => {
                      const key = sr._id ?? sr.position_label;
                      const isSaving = savingRows.has(key);
                      const isNew = sr._new;
                      const isDirty = sr._dirty;
                      return (
                        <tr
                          key={idx}
                          className={`border-b border-gray-100 transition-colors ${isNew ? 'bg-blue-50/30' : isDirty ? 'bg-amber-50/40' : 'hover:bg-gray-50/60'}`}
                        >
                          {SHEET_COLS.map((col) => {
                            const val = (sr as any)[col.key] as string;
                            if (col.type === 'readonly') {
                              return (
                                <td key={col.key} className={`${col.width} px-3 py-1 border-r border-gray-100`}>
                                  <span className="font-mono text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{val}</span>
                                </td>
                              );
                            }
                            if (col.type === 'select') {
                              return (
                                <td key={col.key} className={`${col.width} px-1 py-0.5 border-r border-gray-100`}>
                                  <select
                                    value={val}
                                    onChange={(e) => updateSheetCell(idx, col.key, e.target.value)}
                                    onBlur={() => { if (sr._dirty && sr.sample_code.trim()) saveSheetRow(sr); }}
                                    disabled={isSaving}
                                    className="w-full px-2 py-1.5 text-xs bg-transparent border-0 text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded cursor-pointer hover:bg-gray-50"
                                  >
                                    {col.options?.map((o) => (
                                      <option key={o} value={o}>{col.optionLabels?.[o] ?? o}</option>
                                    ))}
                                  </select>
                                </td>
                              );
                            }
                            return (
                              <td key={col.key} className={`${col.width} px-1 py-0.5 border-r border-gray-100`}>
                                <input
                                  type={col.type === 'number' ? 'number' : 'text'}
                                  value={val}
                                  onChange={(e) => updateSheetCell(idx, col.key, e.target.value)}
                                  onBlur={() => { if (sr._dirty && sr.sample_code.trim()) saveSheetRow(sr); }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      (e.currentTarget as HTMLInputElement).blur();
                                    }
                                  }}
                                  disabled={isSaving}
                                  placeholder={isNew && col.key === 'sample_code' ? 'Nueva muestra...' : ''}
                                  className={`w-full px-2 py-1.5 text-xs bg-transparent border-0 text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded ${isNew && !sr.sample_code ? 'placeholder:text-gray-300' : ''}`}
                                />
                              </td>
                            );
                          })}
                          <td className="w-10 px-2 py-1 text-center">
                            {isSaving ? (
                              <div className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin mx-auto" />
                            ) : isDirty && sr.sample_code.trim() ? (
                              <button
                                onClick={() => saveSheetRow(sr)}
                                className="p-0.5 text-blue-500 hover:bg-blue-50 rounded"
                                title="Guardar fila"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            ) : !isNew ? (
                              <span className="w-2 h-2 rounded-full bg-green-400 block mx-auto" title="Guardado" />
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="px-5 py-2.5 border-t border-gray-100 bg-gray-50/40 flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  {sheetRows.filter((r) => !r._new).length} muestras &middot; {total - (box?.occupancy || 0)} posiciones libres
                </span>
                <span className="text-xs text-gray-400">Los cambios se guardan automáticamente al salir de cada celda</span>
              </div>
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
            {formError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{formError}</p>}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <label className="text-sm font-medium text-gray-700">Código de muestra *</label>
                <Input value={form.sample_code} onChange={(e) => f('sample_code', e.target.value)} placeholder="SMP-2024-001" className="border-gray-300 text-gray-900 font-mono" autoFocus />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Código paciente</label>
                <Input value={form.patient_code} onChange={(e) => f('patient_code', e.target.value)} placeholder="PAT-001" className="border-gray-300 text-gray-900" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Proyecto</label>
                <Input value={form.project} onChange={(e) => f('project', e.target.value)} placeholder="Proyecto-X" className="border-gray-300 text-gray-900" />
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
                  {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s] || s}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1 col-span-2">
                <label className="text-sm font-medium text-gray-700">Volumen</label>
                <Input type="number" value={form.volume} onChange={(e) => f('volume', e.target.value)} placeholder="0.5" className="border-gray-300 text-gray-900" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Unidad</label>
                <select value={form.units} onChange={(e) => f('units', e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-300 text-gray-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Notas</label>
              <Input value={form.notes} onChange={(e) => f('notes', e.target.value)} placeholder="Observaciones..." className="border-gray-300 text-gray-900" />
            </div>
            <div className="flex gap-3 pt-1">
              <Button type="button" variant="outline" onClick={closeAddDialog} className="flex-1 border-gray-300 text-gray-700">Cancelar</Button>
              <Button type="submit" disabled={addSampleMutation.isPending} className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 text-white">
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
                  <p className="text-gray-500 text-sm">Posición: <span className="font-mono text-blue-600">{selectedSample.position_label}</span></p>
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
                <Button variant="outline" onClick={() => setShowDetailDialog(false)} className="flex-1 border-gray-300 text-gray-700">Cerrar</Button>
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
            {editBoxError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{editBoxError}</p>}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Nombre *</label>
              <Input value={editBoxName} onChange={(e) => setEditBoxName(e.target.value)} className="border-gray-300 text-gray-900" autoFocus />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Descripción</label>
              <Input value={editBoxDesc} onChange={(e) => setEditBoxDesc(e.target.value)} placeholder="Descripción opcional..." className="border-gray-300 text-gray-900" />
            </div>
            <div className="flex gap-3 pt-1">
              <Button variant="outline" onClick={() => setShowEditBoxDialog(false)} className="flex-1 border-gray-300 text-gray-700">Cancelar</Button>
              <Button disabled={editBoxMutation.isPending || !editBoxName.trim()} onClick={() => editBoxMutation.mutate({ name: editBoxName, description: editBoxDesc })} className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 text-white">
                {editBoxMutation.isPending ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* QR Dialog */}
      <Dialog open={showQrDialog} onOpenChange={setShowQrDialog}>
        <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-xs text-center">
          <DialogHeader>
            <DialogTitle className="text-gray-900">Código QR — {box.name}</DialogTitle>
          </DialogHeader>
          <div className="mt-4 space-y-4">
            <div className="flex justify-center">
              <div className="p-3 bg-white border border-gray-200 rounded-xl shadow-sm inline-block">
                <img src={qrUrl} alt={`QR ${box.name}`} className="w-48 h-48" loading="lazy" />
              </div>
            </div>
            <p className="text-xs text-gray-400 font-mono break-all">{boxId}</p>
            <p className="text-xs text-gray-500">Al escanear este código accedes directamente a esta caja. Úsalo para etiquetar la caja física.</p>
            <div className="flex gap-2">
              <a href={qrUrl} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium border border-gray-300 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors text-gray-700">
                <Download className="w-4 h-4" /> Descargar
              </a>
              <Button variant="outline" onClick={() => setShowQrDialog(false)} className="flex-1 border-gray-300 text-gray-700">Cerrar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-gray-900">Importar muestras</DialogTitle>
          </DialogHeader>

          <div className="flex border-b border-gray-200 mt-2">
            <button onClick={() => setImportTab('upload')} className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${importTab === 'upload' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              Cargar archivo
            </button>
            <button onClick={() => setImportTab('template')} className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${importTab === 'template' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              Plantilla
            </button>
          </div>

          <div className="mt-4 space-y-4">
            {importTab === 'template' ? (
              <>
                <p className="text-sm text-gray-600">Descarga la plantilla Excel, rellénala y vuelve a importarla. Las posiciones se asignan automáticamente.</p>
                <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-100">
                        {['codigo', 'paciente', 'proyecto', 'tipo', 'subtipo', 'estado', 'volumen', 'unidades', 'notas'].map((h) => (
                          <th key={h} className="px-3 py-2 text-left font-semibold text-gray-600">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        {['SMP-001', 'PAT-001', 'Proyecto-X', 'blood', '', 'active', '0.5', 'mL', ''].map((v, i) => (
                          <td key={i} className="px-3 py-2 text-gray-500 border-b border-gray-100">{v || '—'}</td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="text-xs text-gray-500 space-y-1 bg-gray-50 rounded-lg p-3">
                  <p><strong>tipo</strong>: tissue, blood, serum, plasma, urine, csf, saliva, dna, rna, protein, other</p>
                  <p><strong>estado</strong>: active, used, discarded, archived, contaminated</p>
                  <p><strong>unidades</strong>: mL, µL, mg, µg, ng, mol/L, %, other</p>
                </div>
                <button onClick={handleDownloadTemplate} className="w-full flex items-center justify-center gap-2 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors font-medium">
                  <FileText className="w-4 h-4" /> Descargar plantilla Excel (.xlsx)
                </button>
              </>
            ) : importResult ? (
              <div className="space-y-3">
                <div className={`rounded-xl p-4 border ${importResult.imported > 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                  <p className="font-semibold text-gray-800">
                    {importResult.imported} muestra{importResult.imported !== 1 ? 's' : ''} importada{importResult.imported !== 1 ? 's' : ''} correctamente
                  </p>
                  {importResult.errors.length > 0 && <p className="text-sm text-red-600 mt-0.5">{importResult.errors.length} error{importResult.errors.length !== 1 ? 'es' : ''}</p>}
                </div>
                {importResult.errors.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1 max-h-32 overflow-y-auto">
                    {importResult.errors.map((e, i) => (
                      <p key={i} className="text-xs text-red-700">Fila {e.row}: {e.message}</p>
                    ))}
                  </div>
                )}
                <button onClick={() => { setImportResult(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="w-full py-2 text-sm text-blue-600 hover:text-blue-700 font-medium">
                  Importar otro archivo
                </button>
              </div>
            ) : importPreview ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-blue-800">{importPreview.file.name}</p>
                    <p className="text-xs text-blue-600">Vista previa de las primeras filas</p>
                  </div>
                </div>
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        {Object.keys(importPreview.rows[0] || {}).map((h) => (
                          <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500 border-b border-gray-200">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.rows.map((row, i) => (
                        <tr key={i} className="border-b border-gray-100">
                          {Object.values(row).map((v, j) => (
                            <td key={j} className="px-3 py-2 text-gray-700 font-mono">{String(v) || '—'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-500 text-center">
                  Mostrando {importPreview.rows.length} de las primeras filas. Las posiciones libres se asignarán en orden desde A1.
                </p>
                <div className="flex gap-3">
                  <button onClick={() => { setImportPreview(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="flex-1 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">
                    Cancelar
                  </button>
                  <button onClick={confirmImport} disabled={importLoading} className="flex-1 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-60">
                    {importLoading ? 'Importando...' : 'Confirmar importación'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="text-sm text-gray-600 space-y-1">
                  <p>Soporta archivos <strong>.xlsx</strong>, <strong>.xls</strong> y <strong>.csv</strong>.</p>
                  <p>Posiciones libres disponibles: <span className="font-semibold text-gray-800">{total - (box?.occupancy || 0)}</span></p>
                </div>
                <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={handleImportFileSelect} className="hidden" />
                <button onClick={() => fileInputRef.current?.click()} disabled={importLoading} className="w-full border-2 border-dashed border-gray-300 rounded-xl p-10 flex flex-col items-center gap-3 text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/30 transition-all disabled:opacity-50">
                  <Upload className="w-10 h-10" />
                  <div className="text-center">
                    <p className="text-sm font-medium">Haz clic para seleccionar un archivo</p>
                    <p className="text-xs text-gray-400 mt-0.5">Excel (.xlsx, .xls) o CSV (.csv)</p>
                  </div>
                </button>
                <p className="text-xs text-gray-400 text-center">
                  ¿No tienes el formato correcto?{' '}
                  <button onClick={() => setImportTab('template')} className="text-blue-600 hover:underline">Descarga la plantilla</button>
                </p>
              </>
            )}

            <div className="flex justify-end pt-1">
              <Button variant="outline" onClick={() => setShowImportDialog(false)} className="border-gray-300 text-gray-700">Cerrar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
