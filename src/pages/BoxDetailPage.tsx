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

// Print-area hex colors for canvas export (matching CELL_BG)
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

interface SpreadsheetColumn {
  key: string;
  label: string;
  minW: number; // px
  type: 'text' | 'select' | 'number' | 'readonly';
  options?: string[];
  optionLabels?: Record<string, string>;
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
  _id: string | null;
  _dirty: boolean;
  _new: boolean; // true = no sample yet at this position
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

  // Spreadsheet state — full grid, every position
  const [sheetRows, setSheetRows] = useState<SpreadsheetRow[]>([]);
  const [savingRows, setSavingRows] = useState<Set<string>>(new Set());
  const [focusedCell, setFocusedCell] = useState<{ rowIdx: number; colIdx: number } | null>(null);
  const [pasteHighlight, setPasteHighlight] = useState<Set<string>>(new Set()); // "rowIdx_colIdx"
  const [pasteCount, setPasteCount] = useState<number | null>(null);

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
      const { data, error } = await supabase.from('freezers').select('id, name, shelf_count').eq('id', freezerId!).single();
      if (error) throw error;
      return data as { id: string; name: string; shelf_count: number };
    },
    enabled: !!freezerId && !!user,
  });

  const { data: freezerRacks = [] } = useQuery({
    queryKey: ['racks', freezerId],
    queryFn: async () => {
      const { data, error } = await (supabase.from('racks') as any).select('*').eq('freezer_id', freezerId!).order('shelf_number', { ascending: true });
      if (error) throw error;
      return data as Rack[];
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

  // Build full-box spreadsheet rows: every position, overlay samples
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
            _id: s.id, _dirty: false, _new: false,
            position_label: lbl,
            sample_code: s.sample_code,
            patient_code: s.patient_code || '',
            project: s.project || '',
            sample_type: s.sample_type,
            subtype: s.subtype || '',
            status: s.status,
            volume: s.volume !== null ? String(s.volume) : '',
            units: s.units || 'mL',
            notes: s.notes || '',
          });
        } else {
          result.push({
            _id: null, _dirty: false, _new: true,
            position_label: lbl,
            sample_code: '', patient_code: '', project: '',
            sample_type: 'blood', subtype: '', status: 'active',
            volume: '', units: 'mL', notes: '',
          });
        }
      }
    }
    return result;
  }, []);

  const handleSetViewMode = (mode: ViewMode) => {
    if (mode === 'spreadsheet' && box) {
      setSheetRows(buildSheetRows(box, samples));
    }
    setViewMode(mode);
  };

  // --- Mutations ---

  const updateSampleMutation = useMutation({
    mutationFn: async (updatedData: Partial<Sample>) => {
      if (!selectedSample) throw new Error('No hay muestra seleccionada');
      const { error } = await (supabase.from('samples') as any)
        .update({
          ...updatedData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedSample.id);
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

  const sacarMuestraMutation = useMutation({
    mutationFn: async (s: Sample) => {
      const newThaws = s.thaw_count + 1;
      const { error } = await (supabase.from('samples') as any)
        .update({ status: 'used', thaw_count: newThaws })
        .eq('id', s.id);
      if (error) throw error;
      return { newThaws, maxThaws: s.max_thaws };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['box-samples', boxId] });
      setShowDetailDialog(false);
      if (result.newThaws >= result.maxThaws) {
        setTimeout(() => alert(`Advertencia: la muestra ha alcanzado el máximo de descongelaciones (${result.maxThaws}).`), 100);
      }
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
      const { error } = await (supabase.from('boxes') as any)
        .update({ name: name.trim(), description: description.trim() || null, shelf_number, rack_id, rows, columns, image_url: imageUrl })
        .eq('id', boxId!);
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

  // --- Spreadsheet save ---

  const saveSheetRow = async (sr: SpreadsheetRow) => {
    if (!sr.sample_code.trim()) return;
    const key = sr._id ?? sr.position_label;
    setSavingRows((prev) => new Set(prev).add(key));
    try {
      const label = sr.position_label;
      const rowNum = label.charCodeAt(0) - 64;
      const colNum = parseInt(label.slice(1));

      if (sr._new && !sr._id) {
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
          .insert([payload]).select().single();
        if (error) throw error;
        await (supabase.from('boxes') as any)
          .update({ occupancy: (box?.occupancy || 0) + 1 }).eq('id', boxId!);
        setSheetRows((prev) =>
          prev.map((r) =>
            r._new && r._id === null && r.position_label === label
              ? { ...r, _id: inserted.id, _new: false, _dirty: false }
              : r
          )
        );
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

  // Editable columns (skip position_label which is readonly)
  const EDITABLE_COLS = SHEET_COLS.filter((c) => c.type !== 'readonly');

  const handleTablePaste = (e: React.ClipboardEvent<HTMLTableSectionElement>) => {
    if (!focusedCell) return;
    const text = e.clipboardData.getData('text/plain');
    if (!text.trim()) return;
    e.preventDefault();

    // Parse TSV (Excel / Sheets copy format)
    const pastedRows = text
      .split(/\r?\n/)
      .map((line) => line.split('\t'))
      .filter((row) => row.some((cell) => cell.trim() !== ''));

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
          // Validate select values; fall back to current value if invalid
          if (colDef.type === 'select' && colDef.options && val && !colDef.options.includes(val)) {
            val = (updated[targetRowIdx] as any)[colKey];
          }
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

  // --- Grid actions ---

  const handleCellClick = (row: number, col: number) => {
    const existing = sampleMap[`${row}_${col}`];
    if (existing) {
      setSelectedSample(existing);
      setEditForm({
        sample_code: existing.sample_code,
        patient_code: existing.patient_code || '',
        project: existing.project || '',
        sample_type: existing.sample_type as SampleType,
        subtype: existing.subtype || '',
        volume: existing.volume !== null ? String(existing.volume) : '',
        units: (existing.units as UnitType) || 'mL',
        status: existing.status as SampleStatus,
        max_thaws: String(existing.max_thaws),
        notes: existing.notes || '',
      });
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
    setEditBoxShelf(box.shelf_number ? String(box.shelf_number) : '');
    setEditBoxRack(box.rack_id || '');
    setEditBoxRows(String(box.rows));
    setEditBoxCols(String(box.columns));
    setEditBoxImageFile(null);
    setEditBoxImagePreview(box.image_url || null);
    setEditBoxError('');
    setShowEditBoxDialog(true);
  };

  // --- Export image (canvas) ---
  const handleExportImage = () => {
    if (!box) return;
    const CELL = 56;
    const HEADER = 24;
    const PAD = 16;
    const LABEL_W = 28;
    const canvasW = PAD * 2 + LABEL_W + cols * CELL;
    const canvasH = PAD * 2 + HEADER + rows * CELL + 48;

    const canvas = document.createElement('canvas');
    canvas.width = canvasW * 2; // 2x for retina
    canvas.height = canvasH * 2;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(2, 2);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Title
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.fillText(box.name, PAD, PAD + 13);
    ctx.fillStyle = '#9ca3af';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText(`${freezer?.name || ''} · ${rows}×${cols} · ${box.occupancy}/${rows * cols}`, PAD, PAD + 26);

    // Col numbers
    ctx.fillStyle = '#9ca3af';
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    for (let c = 0; c < cols; c++) {
      ctx.fillText(String(c + 1), PAD + LABEL_W + c * CELL + CELL / 2, PAD + HEADER + 14);
    }

    // Rows
    for (let r = 0; r < rows; r++) {
      const rowLetter = String.fromCharCode(65 + r);
      const y = PAD + HEADER + 24 + r * CELL;
      ctx.fillStyle = '#9ca3af';
      ctx.textAlign = 'center';
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText(rowLetter, PAD + LABEL_W / 2, y + CELL / 2 + 4);

      for (let c = 0; c < cols; c++) {
        const sample = sampleMap[`${r + 1}_${c + 1}`];
        const status = sample ? sample.status : 'empty';
        const colors = CELL_HEX[status] || CELL_HEX.empty;
        const x = PAD + LABEL_W + c * CELL;
        const radius = 4;

        // Rounded rect
        ctx.fillStyle = colors.bg;
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + CELL - 2 - radius, y);
        ctx.arcTo(x + CELL - 2, y, x + CELL - 2, y + radius, radius);
        ctx.lineTo(x + CELL - 2, y + CELL - 2 - radius);
        ctx.arcTo(x + CELL - 2, y + CELL - 2, x + CELL - 2 - radius, y + CELL - 2, radius);
        ctx.lineTo(x + radius, y + CELL - 2);
        ctx.arcTo(x, y + CELL - 2, x, y + CELL - 2 - radius, radius);
        ctx.lineTo(x, y + radius);
        ctx.arcTo(x, y, x + radius, y, radius);
        ctx.closePath();
        ctx.fill();

        if (!sample) {
          ctx.strokeStyle = '#e5e7eb';
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Text
        ctx.fillStyle = colors.text;
        ctx.textAlign = 'center';
        if (sample) {
          ctx.font = 'bold 8px ui-monospace, monospace';
          const lbl = positionLabel(r + 1, c + 1);
          ctx.fillText(lbl, x + CELL / 2 - 1, y + CELL / 2 - 4);
          ctx.font = '8px ui-monospace, monospace';
          const code = sample.sample_code.length > 8 ? sample.sample_code.slice(0, 7) + '…' : sample.sample_code;
          ctx.fillText(code, x + CELL / 2 - 1, y + CELL / 2 + 6);
        } else {
          ctx.font = '9px ui-monospace, monospace';
          ctx.fillText(positionLabel(r + 1, c + 1), x + CELL / 2 - 1, y + CELL / 2 + 3);
        }
      }
    }

    // Footer
    ctx.fillStyle = '#9ca3af';
    ctx.textAlign = 'left';
    ctx.font = '9px ui-monospace, monospace';
    ctx.fillText(`Generado: ${new Date().toLocaleString('es-ES')}`, PAD, canvasW - 10);

    canvas.toBlob((blob) => {
      if (blob) triggerBlobDownload(blob, `${box.name}-grid.png`);
    }, 'image/png');
  };

  // --- Export CSV / XLSX ---
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
        Posicion: s.position_label, Codigo: s.sample_code, Paciente: s.patient_code || '',
        Proyecto: s.project || '', Tipo: s.sample_type, Subtipo: s.subtype || '',
        Estado: s.status, Volumen: s.volume ?? '', Unidades: s.units,
        Descongelaciones: s.thaw_count, Notas: s.notes || '',
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
        sample_code: code, patient_code: row['paciente'] || null, project: row['proyecto'] || null,
        sample_type: sampleType, subtype: row['subtipo'] || null,
        volume: row['volumen'] ? parseFloat(row['volumen']) : null, units, status,
        thaw_count: 0, max_thaws: 3, notes: row['notas'] || null,
        box_id: boxId!, position_row: pos.row, position_column: pos.col,
        position_label: positionLabel(pos.row, pos.col),
        laboratory: user!.laboratory, created_by: user!.id,
      }]);
      if (error) errors.push({ row: rowNum, message: error.message });
      else imported++;
    }

    if (imported > 0) {
      await (supabase.from('boxes') as any).update({ occupancy: (box.occupancy || 0) + imported }).eq('id', boxId!);
      queryClient.invalidateQueries({ queryKey: ['box-samples', boxId] });
      queryClient.invalidateQueries({ queryKey: ['box', boxId] });
      queryClient.invalidateQueries({ queryKey: ['all-boxes'] });
    }

    setImportResult({ imported, errors });
    setImportLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // --- Print ---
  const handlePrint = () => {
    const style = document.createElement('style');
    style.id = 'cryo-print-style';
    style.textContent = `@media print { body > * { display: none !important; } #cryo-print-area { display: block !important; position: fixed; top: 0; left: 0; width: 100%; } }`;
    document.head.appendChild(style);
    const area = document.getElementById('cryo-print-area');
    if (area) area.style.display = 'block';
    window.print();
    setTimeout(() => { style.remove(); if (area) area.style.display = 'none'; }, 500);
  };

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
  const dirtyCount = sheetRows.filter((r) => r._dirty || (r._new && r.sample_code.trim())).length;
  const sortedSamples = [...samples]
    .filter((s) => s.position_label)
    .sort((a, b) => (a.position_label || '').localeCompare(b.position_label || ''));

  return (
    <AppLayout>
      {/* Hidden print area */}
      <div id="cryo-print-area" style={{ display: 'none' }} className="p-8 bg-white">
        <div className="mb-4 pb-3 border-b border-gray-300">
          <h1 className="text-xl font-bold text-gray-900">{box.name}</h1>
          <p className="text-sm text-gray-500">{freezer?.name} &middot; Cuadrícula {rows}×{cols} &middot; {box.occupancy}/{total} ({pct}%)</p>
        </div>
        <div ref={gridExportRef} className="overflow-auto">
          <div className="inline-block">
            <div className="flex gap-0.5 mb-0.5 pl-7">
              {Array.from({ length: cols }, (_, c) => (
                <div key={c} className="w-14 h-5 flex items-center justify-center text-xs text-gray-400 font-mono">{c + 1}</div>
              ))}
            </div>
            {Array.from({ length: rows }, (_, r) => (
              <div key={r} className="flex gap-0.5 mb-0.5">
                <div className="w-6 h-14 flex items-center justify-center text-xs text-gray-400 font-mono">{String.fromCharCode(65 + r)}</div>
                {Array.from({ length: cols }, (_, c) => {
                  const s = sampleMap[`${r + 1}_${c + 1}`];
                  return (
                    <div key={c} className={`w-14 h-14 border rounded text-[9px] font-mono flex flex-col items-center justify-center overflow-hidden ${s ? 'bg-green-100 border-green-400 text-green-900' : 'bg-gray-50 border-gray-200 text-gray-300'}`}>
                      {s ? (<><span className="font-bold leading-tight">{positionLabel(r + 1, c + 1)}</span><span className="leading-tight truncate max-w-full px-0.5">{s.sample_code}</span></>) : <span>{positionLabel(r + 1, c + 1)}</span>}
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
            <Link to="/dashboard" className="hover:text-gray-700 flex items-center gap-1"><Home className="w-3 h-3" /> Inicio</Link>
            <ChevronRight className="w-3 h-3" />
            <Link to="/boxes" className="hover:text-gray-700">Cajas</Link>
            <ChevronRight className="w-3 h-3" />
            {freezer && (<><Link to={`/freezers/${freezerId}`} className="hover:text-gray-700">{freezer.name}</Link><ChevronRight className="w-3 h-3" /></>)}
            <span className="text-gray-800 font-medium truncate max-w-48">{box.name}</span>
          </nav>

          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">{box.name}</h1>
                <button onClick={openEditBox} className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"><Pencil className="w-4 h-4" /></button>
                <span className="text-xs px-2.5 py-1 rounded-full bg-green-100 text-green-700 font-medium">{STATUS_LABEL[box.status] || box.status}</span>
              </div>
              <p className="text-sm text-gray-500 mt-1">Cuadrícula {rows}×{cols} &middot; <span className="font-semibold text-gray-700">{box.occupancy}</span>/{total} muestras ({pct}%)</p>
              {box.description && <p className="text-xs text-gray-400 mt-0.5">{box.description}</p>}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" onClick={() => setShowQrDialog(true)} className="border-gray-300 text-gray-700 hover:bg-gray-50 text-sm"><QrCode className="w-4 h-4" /> Ver QR</Button>
              <Button onClick={openAllocate} className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white text-sm">
                <UserPlus className="w-4 h-4" /> Asignar muestra
              </Button>
              <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
                <button onClick={handleExportCSV} disabled={samples.length === 0} className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40 border-r border-gray-300"><Download className="w-4 h-4" /> CSV</button>
                <button onClick={handleExportXLSX} disabled={samples.length === 0} className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"><Download className="w-4 h-4" /> Excel</button>
              </div>
              <Button variant="outline" disabled className="border-red-200 text-red-400 text-sm hover:bg-red-50"><Archive className="w-4 h-4" /> Archivar</Button>
            </div>
          </div>
        </div>

        <div className="px-8 py-6 space-y-6">
          {/* View toggle + inline edit box button */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
              <button onClick={() => handleSetViewMode('grid')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'grid' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                <LayoutGrid className="w-4 h-4" /> Cuadrícula
              </button>
              <button onClick={() => handleSetViewMode('spreadsheet')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'spreadsheet' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                <Table2 className="w-4 h-4" /> Hoja de datos
              </button>
            </div>
            <button onClick={openEditBox} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-white transition-colors bg-gray-100">
              <Pencil className="w-3.5 h-3.5" /> Editar caja
            </button>
          </div>

          {/* ── GRID VIEW ── */}
          {viewMode === 'grid' && (
            <>
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <LayoutGrid className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-semibold text-gray-700">Cuadrícula {rows}×{cols}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={handlePrint} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 transition-colors">
                      <Printer className="w-3.5 h-3.5" /> Imprimir
                    </button>
                    <button onClick={handleExportImage} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 transition-colors">
                      <Image className="w-3.5 h-3.5" /> Exportar imagen
                    </button>
                  </div>
                </div>

                <div className="overflow-auto">
                  <div className="inline-block">
                    {/* Column headers */}
                    <div className="flex items-center gap-1 mb-1 pl-10">
                      {Array.from({ length: cols }, (_, c) => (
                        <div key={c} className="w-14 h-6 flex items-center justify-center text-xs text-gray-400 font-mono">{c + 1}</div>
                      ))}
                    </div>
                    {Array.from({ length: rows }, (_, r) => (
                      <div key={r} className="flex items-center gap-1 mb-1">
                        <div className="w-9 h-14 flex items-center justify-center text-xs text-gray-400 font-mono flex-shrink-0">{String.fromCharCode(65 + r)}</div>
                        {Array.from({ length: cols }, (_, c) => {
                          const sample = sampleMap[`${r + 1}_${c + 1}`];
                          const cellStatus = sample ? sample.status : 'empty';
                          const label = positionLabel(r + 1, c + 1);
                          return (
                            <button
                              key={c}
                              onClick={() => handleCellClick(r + 1, c + 1)}
                              title={sample ? `${sample.sample_code} | ${sample.sample_type} | ${sample.status}` : `${label} — vacío`}
                              className={`w-16 h-16 rounded border text-xs font-mono transition-all flex flex-col items-center justify-center gap-0.5 overflow-hidden ${CELL_BG[cellStatus] || CELL_BG.empty}`}
                            >
                              {sample ? (
                                <span className="text-white text-[9px] font-semibold leading-tight px-0.5 text-center break-all">{sample.sample_code}</span>
                              ) : (
                                <Plus className="w-4 h-4 text-gray-200" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Legend */}
                <div className="flex items-center gap-5 mt-5 flex-wrap border-t border-gray-100 pt-4">
                  {[
                    { label: 'Activo', color: 'bg-green-500' },
                    { label: 'Usado', color: 'bg-yellow-400' },
                    { label: 'Descartado', color: 'bg-red-500' },
                    { label: 'Archivado', color: 'bg-gray-400' },
                    { label: 'Contaminado', color: 'bg-red-900' },
                    { label: 'Vacío', color: 'bg-white border border-gray-300' },
                  ].map(({ label, color }) => (
                    <span key={label} className="flex items-center gap-1.5 text-xs text-gray-500">
                      <span className={`w-3 h-3 rounded ${color}`} /> {label}
                    </span>
                  ))}
                </div>
              </div>

              {/* ── SAMPLES TABLE BELOW GRID ── */}
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FlaskConical className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-semibold text-gray-700">Muestras en esta caja</span>
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{sortedSamples.length}</span>
                  </div>
                </div>
                {sortedSamples.length === 0 ? (
                  <div className="px-6 py-12 text-center">
                    <FlaskConical className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">No hay muestras en esta caja aún.</p>
                    <button onClick={openAllocate} className="mt-3 text-sm text-blue-600 hover:underline font-medium">Asignar primera muestra</button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50/60">
                          {['Posición', 'Código', 'Paciente', 'Proyecto', 'Tipo', 'Estado', 'Volumen'].map((h) => (
                            <th key={h} className="text-left text-xs font-semibold text-gray-500 px-4 py-2.5 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedSamples.map((s) => (
                          <tr
                            key={s.id}
                            onClick={() => { setSelectedSample(s); setShowDetailDialog(true); }}
                            className="border-b border-gray-50 hover:bg-blue-50/30 cursor-pointer transition-colors"
                          >
                            <td className="px-4 py-2.5">
                              <span className="font-mono text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{s.position_label}</span>
                            </td>
                            <td className="px-4 py-2.5 font-mono text-sm text-gray-900 font-medium">{s.sample_code}</td>
                            <td className="px-4 py-2.5 text-sm text-gray-600">{s.patient_code || <span className="text-gray-300">—</span>}</td>
                            <td className="px-4 py-2.5 text-sm text-gray-600">{s.project || <span className="text-gray-300">—</span>}</td>
                            <td className="px-4 py-2.5 text-sm text-gray-600 capitalize">{s.sample_type}</td>
                            <td className="px-4 py-2.5">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[s.status] || 'bg-gray-100 text-gray-500'}`}>
                                {STATUS_LABEL[s.status] || s.status}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-sm text-gray-600">
                              {s.volume !== null ? `${s.volume} ${s.units}` : <span className="text-gray-300">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── SPREADSHEET VIEW ── */}
          {viewMode === 'spreadsheet' && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between bg-gray-50/60">
                <div className="flex items-center gap-2">
                  <Table2 className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-semibold text-gray-700">Hoja de datos — {rows}×{cols} posiciones</span>
                  {dirtyCount > 0 && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                      {dirtyCount} cambio{dirtyCount !== 1 ? 's' : ''} sin guardar
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {pasteCount !== null && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium animate-pulse">
                      {pasteCount} celda{pasteCount !== 1 ? 's' : ''} pegada{pasteCount !== 1 ? 's' : ''}
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <ClipboardPaste className="w-3 h-3" /> Tab · Intro · Ctrl+V desde Excel
                  </span>
                  {dirtyCount > 0 && (
                    <button onClick={saveAllDirty} className="flex items-center gap-1.5 text-sm font-medium bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors">
                      <Save className="w-3.5 h-3.5" /> Guardar todo
                    </button>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {SHEET_COLS.map((col) => (
                        <th key={col.key} style={{ minWidth: col.minW }} className="text-left text-xs font-semibold text-gray-500 px-3 py-2.5 border-r border-gray-100 last:border-r-0 whitespace-nowrap">
                          {col.label}
                        </th>
                      ))}
                      <th className="w-10 border-r-0" />
                    </tr>
                  </thead>
                  <tbody onPaste={handleTablePaste}>
                    {sheetRows.map((sr, idx) => {
                      const key = sr._id ?? sr.position_label;
                      const isSaving = savingRows.has(key);
                      const isNew = sr._new;
                      const isDirty = sr._dirty;
                      return (
                        <tr
                          key={sr.position_label}
                          className={`border-b border-gray-100 transition-colors ${isNew && !isDirty ? 'bg-gray-50/40 hover:bg-gray-50' : isDirty ? 'bg-amber-50/40' : 'hover:bg-blue-50/20'}`}
                        >
                          {SHEET_COLS.map((col, colIdx) => {
                            const val = (sr as any)[col.key] as string;
                            // editable column index among editable cols (excluding readonly)
                            const editableColIdx = EDITABLE_COLS.findIndex((c) => c.key === col.key);
                            const isHighlighted = editableColIdx >= 0 && pasteHighlight.has(`${idx}_${editableColIdx}`);
                            const cellClass = isHighlighted ? 'bg-blue-100' : '';
                            if (col.type === 'readonly') {
                              return (
                                <td key={col.key} style={{ minWidth: col.minW }} className={`px-3 py-1 border-r border-gray-100 ${cellClass}`}>
                                  <span className={`font-mono text-xs px-1.5 py-0.5 rounded ${isNew ? 'text-gray-400 bg-gray-100' : 'text-blue-600 bg-blue-50'}`}>{val}</span>
                                </td>
                              );
                            }
                            if (col.type === 'select') {
                              return (
                                <td key={col.key} style={{ minWidth: col.minW }} className={`px-1 py-0.5 border-r border-gray-100 transition-colors ${cellClass}`}>
                                  <select
                                    value={val}
                                    onChange={(e) => updateSheetCell(idx, col.key, e.target.value)}
                                    onFocus={() => setFocusedCell({ rowIdx: idx, colIdx: editableColIdx })}
                                    onBlur={() => { if ((sr._dirty || sr._new) && sr.sample_code.trim()) saveSheetRow(sr); }}
                                    disabled={isSaving || (isNew && !sr.sample_code.trim())}
                                    className="w-full px-2 py-1.5 text-xs bg-transparent border-0 text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded cursor-pointer hover:bg-gray-50 disabled:opacity-40"
                                  >
                                    {col.options?.map((o) => <option key={o} value={o}>{col.optionLabels?.[o] ?? o}</option>)}
                                  </select>
                                </td>
                              );
                            }
                            void colIdx;
                            return (
                              <td key={col.key} style={{ minWidth: col.minW }} className={`px-1 py-0.5 border-r border-gray-100 transition-colors ${cellClass}`}>
                                <input
                                  type={col.type === 'number' ? 'number' : 'text'}
                                  value={val}
                                  onChange={(e) => updateSheetCell(idx, col.key, e.target.value)}
                                  onFocus={() => setFocusedCell({ rowIdx: idx, colIdx: editableColIdx })}
                                  onBlur={() => { if ((sr._dirty || sr._new) && sr.sample_code.trim()) saveSheetRow(sr); }}
                                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget as HTMLInputElement).blur(); } }}
                                  disabled={isSaving}
                                  placeholder={isNew && col.key === 'sample_code' ? 'Nuevo…' : ''}
                                  className={`w-full px-2 py-1.5 text-xs bg-transparent border-0 text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded ${isNew && !sr.sample_code && col.key === 'sample_code' ? 'placeholder:text-gray-300' : ''}`}
                                />
                              </td>
                            );
                          })}
                          <td className="w-10 px-2 py-1 text-center">
                            {isSaving ? (
                              <div className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin mx-auto" />
                            ) : isDirty && sr.sample_code.trim() ? (
                              <button onClick={() => saveSheetRow(sr)} className="p-0.5 text-blue-500 hover:bg-blue-50 rounded" title="Guardar">
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
                  {samples.length} muestras &middot; {total - (box?.occupancy || 0)} posiciones libres
                </span>
                <span className="text-xs text-gray-400">Los cambios se guardan automáticamente al salir de cada celda</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── ADD SAMPLE DIALOG ── */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-md max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-gray-900">
              Añadir muestra en{' '}
              <span className="text-blue-600 font-mono">{selectedCell ? positionLabel(selectedCell.row, selectedCell.col) : ''}</span>
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

      {/* ── SAMPLE DETAIL DIALOG ── */}
      <Dialog open={showDetailDialog} onOpenChange={(open) => !open && setShowDetailDialog(false)}>
        <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-gray-900 text-xl font-bold">Editar Muestra</DialogTitle>
          </DialogHeader>
          {selectedSample && (
            <div className="mt-2 space-y-6">
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Código</p>
                  <Input value={editForm.sample_code} onChange={(e) => setEditForm(p => ({...p, sample_code: e.target.value}))} className="text-2xl font-mono font-bold mt-1" />
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Estado</p>
                  <select value={editForm.status} onChange={(e) => setEditForm(p => ({...p, status: e.target.value as SampleStatus}))} className="text-sm border rounded-full px-3 py-1 mt-1 bg-white">
                    {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                </div>
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Tipo', key: 'sample_type', type: 'select', options: SAMPLE_TYPES },
                  { label: 'Subtipo', key: 'subtype', type: 'text' },
                  { label: 'Paciente', key: 'patient_code', type: 'text' },
                  { label: 'Proyecto', key: 'project', type: 'text' },
                  { label: 'Volumen', key: 'volume', type: 'number' },
                  { label: 'Unidad', key: 'units', type: 'select', options: UNITS },
                  { label: 'Máx. descongelaciones', key: 'max_thaws', type: 'number' },
                ].map(({ label, key, type, options }) => (
                  <div key={label} className="space-y-1">
                    <p className="text-xs text-gray-500 font-medium">{label}</p>
                    {type === 'select' ? (
                      <select
                        value={(editForm as any)[key]}
                        onChange={(e) => setEditForm(p => ({...p, [key]: e.target.value}))}
                        className="w-full text-sm bg-white border border-gray-300 rounded-lg p-2 focus:ring-1 focus:ring-blue-500"
                      >
                        {options?.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <Input
                        value={(editForm as any)[key]}
                        onChange={(e) => setEditForm(p => ({...p, [key]: e.target.value}))}
                        type={type === 'number' ? 'number' : 'text'}
                        className="text-sm bg-white h-9"
                      />
                    )}
                  </div>
                ))}
              </div>

              <div className="space-y-1">
                <p className="text-xs text-gray-500 font-medium">Notas</p>
                <textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm(p => ({...p, notes: e.target.value}))}
                  className="w-full rounded-lg p-3 text-sm border-gray-300 min-h-[80px] focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100">
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowDetailDialog(false)} className="px-4">Cancelar</Button>
                  <Button onClick={() => updateSampleMutation.mutate({
                    sample_code: editForm.sample_code,
                    patient_code: editForm.patient_code,
                    project: editForm.project,
                    sample_type: editForm.sample_type,
                    subtype: editForm.subtype,
                    volume: editForm.volume ? parseFloat(editForm.volume) : null,
                    units: editForm.units,
                    status: editForm.status,
                    max_thaws: parseInt(editForm.max_thaws),
                    notes: editForm.notes,
                  })} className="px-6 bg-blue-600 hover:bg-blue-700">Guardar</Button>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => { if (confirm('¿Sacar muestra?')) sacarMuestraMutation.mutate(selectedSample); }} className="text-blue-600 hover:text-blue-700 text-sm">Sacar</Button>
                  <Button variant="ghost" onClick={() => { if (confirm('¿Quitar?')) removeSampleMutation.mutate(selectedSample.id); }} className="text-red-500 hover:text-red-600 text-sm">Quitar</Button>
                </div>
              </div>
            </div>
          )}

        </DialogContent>
      </Dialog>

      {/* ── EDIT BOX DIALOG ── */}
      <Dialog open={showEditBoxDialog} onOpenChange={setShowEditBoxDialog}>
        <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-gray-900">Editar caja</DialogTitle></DialogHeader>
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Balda</label>
                <select value={editBoxShelf} onChange={(e) => { setEditBoxShelf(e.target.value); setEditBoxRack(''); }} className="w-full px-3 py-2 bg-white border border-gray-300 text-gray-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Sin asignar</option>
                  {Array.from({ length: freezer?.shelf_count || 3 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>Balda {i + 1}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Rack</label>
                <select
                  value={editBoxRack}
                  onChange={(e) => setEditBoxRack(e.target.value)}
                  disabled={!editBoxShelf || freezerRacks.filter((r) => r.shelf_number === parseInt(editBoxShelf)).length === 0}
                  className="w-full px-3 py-2 bg-white border border-gray-300 text-gray-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40"
                >
                  <option value="">En la balda</option>
                  {freezerRacks.filter((r) => r.shelf_number === parseInt(editBoxShelf)).map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Filas</label>
                <Input type="number" value={editBoxRows} onChange={(e) => setEditBoxRows(e.target.value)} min={1} max={20} className="border-gray-300 text-gray-900" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Columnas</label>
                <Input type="number" value={editBoxCols} onChange={(e) => setEditBoxCols(e.target.value)} min={1} max={20} className="border-gray-300 text-gray-900" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Foto (opcional)</label>
              <input ref={editBoxImageRef} type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; setEditBoxImageFile(f); setEditBoxImagePreview(URL.createObjectURL(f)); }} className="hidden" />
              <div className="flex items-center gap-3">
                {editBoxImagePreview && (
                  <div className="relative flex-shrink-0">
                    <img src={editBoxImagePreview} alt="preview" className="w-14 h-14 rounded-lg object-cover border border-gray-200" />
                    <button type="button" onClick={() => { setEditBoxImageFile(null); setEditBoxImagePreview(null); }} className="absolute -top-1 -right-1 bg-red-500 rounded-full p-0.5"><X className="w-3 h-3 text-white" /></button>
                  </div>
                )}
                <button type="button" onClick={() => editBoxImageRef.current?.click()} className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-100 transition-colors">
                  <Upload className="w-3.5 h-3.5" /> {editBoxImagePreview ? 'Cambiar foto' : 'Subir foto'}
                </button>
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <Button variant="outline" onClick={() => setShowEditBoxDialog(false)} className="flex-1 border-gray-300 text-gray-700">Cancelar</Button>
              <Button
                disabled={editBoxMutation.isPending || !editBoxName.trim()}
                onClick={() => editBoxMutation.mutate({
                  name: editBoxName,
                  description: editBoxDesc,
                  shelf_number: editBoxShelf ? parseInt(editBoxShelf) : null,
                  rack_id: editBoxRack || null,
                  rows: parseInt(editBoxRows) || (box?.rows ?? 9),
                  columns: parseInt(editBoxCols) || (box?.columns ?? 9),
                })}
                className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 text-white"
              >
                {editBoxMutation.isPending ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── QR DIALOG ── */}
      <Dialog open={showQrDialog} onOpenChange={setShowQrDialog}>
        <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-xs text-center">
          <DialogHeader><DialogTitle className="text-gray-900">Código QR — {box.name}</DialogTitle></DialogHeader>
          <div className="mt-4 space-y-4">
            <div className="flex justify-center">
              <div className="p-3 bg-white border border-gray-200 rounded-xl shadow-sm inline-block">
                <img src={qrUrl} alt={`QR ${box.name}`} className="w-48 h-48" loading="lazy" />
              </div>
            </div>
            <p className="text-xs text-gray-400 font-mono break-all">{boxId}</p>
            <p className="text-xs text-gray-500">Al escanear este código accedes directamente a esta caja.</p>
            <div className="flex gap-2">
              <a href={qrUrl} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium border border-gray-300 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors text-gray-700">
                <Download className="w-4 h-4" /> Descargar
              </a>
              <Button variant="outline" onClick={() => setShowQrDialog(false)} className="flex-1 border-gray-300 text-gray-700">Cerrar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── IMPORT DIALOG ── */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-gray-900">Importar muestras</DialogTitle></DialogHeader>
          <div className="flex border-b border-gray-200 mt-2">
            <button onClick={() => setImportTab('upload')} className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${importTab === 'upload' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Cargar archivo</button>
            <button onClick={() => setImportTab('template')} className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${importTab === 'template' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Plantilla</button>
          </div>

          <div className="mt-4 space-y-4">
            {importTab === 'template' ? (
              <>
                <p className="text-sm text-gray-600">Descarga la plantilla Excel, rellénala y vuelve a importarla.</p>
                <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                  <table className="w-full text-xs font-mono">
                    <thead><tr className="border-b border-gray-200 bg-gray-100">{['codigo', 'paciente', 'proyecto', 'tipo', 'subtipo', 'estado', 'volumen', 'unidades', 'notas'].map((h) => (<th key={h} className="px-3 py-2 text-left font-semibold text-gray-600">{h}</th>))}</tr></thead>
                    <tbody><tr>{['SMP-001', 'PAT-001', 'Proyecto-X', 'blood', '', 'active', '0.5', 'mL', ''].map((v, i) => (<td key={i} className="px-3 py-2 text-gray-500">{v || '—'}</td>))}</tr></tbody>
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
                  <p className="font-semibold text-gray-800">{importResult.imported} muestra{importResult.imported !== 1 ? 's' : ''} importada{importResult.imported !== 1 ? 's' : ''} correctamente</p>
                  {importResult.errors.length > 0 && <p className="text-sm text-red-600 mt-0.5">{importResult.errors.length} error{importResult.errors.length !== 1 ? 'es' : ''}</p>}
                </div>
                {importResult.errors.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1 max-h-32 overflow-y-auto">
                    {importResult.errors.map((e, i) => <p key={i} className="text-xs text-red-700">Fila {e.row}: {e.message}</p>)}
                  </div>
                )}
                <button onClick={() => { setImportResult(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="w-full py-2 text-sm text-blue-600 hover:text-blue-700 font-medium">Importar otro archivo</button>
              </div>
            ) : importPreview ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                  <div><p className="text-sm font-medium text-blue-800">{importPreview.file.name}</p><p className="text-xs text-blue-600">Vista previa</p></div>
                </div>
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50"><tr>{Object.keys(importPreview.rows[0] || {}).map((h) => (<th key={h} className="px-3 py-2 text-left font-semibold text-gray-500 border-b border-gray-200">{h}</th>))}</tr></thead>
                    <tbody>{importPreview.rows.map((row, i) => (<tr key={i} className="border-b border-gray-100">{Object.values(row).map((v, j) => (<td key={j} className="px-3 py-2 text-gray-700 font-mono">{String(v) || '—'}</td>))}</tr>))}</tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-500 text-center">Posiciones libres se asignarán desde A1.</p>
                <div className="flex gap-3">
                  <button onClick={() => { setImportPreview(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="flex-1 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">Cancelar</button>
                  <button onClick={confirmImport} disabled={importLoading} className="flex-1 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-60">{importLoading ? 'Importando...' : 'Confirmar importación'}</button>
                </div>
              </div>
            ) : (
              <>
                <div className="text-sm text-gray-600 space-y-1">
                  <p>Soporta <strong>.xlsx</strong>, <strong>.xls</strong> y <strong>.csv</strong>.</p>
                  <p>Posiciones libres: <span className="font-semibold text-gray-800">{total - (box?.occupancy || 0)}</span></p>
                </div>
                <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleImportFileSelect} className="hidden" />
                <button onClick={() => fileInputRef.current?.click()} disabled={importLoading} className="w-full border-2 border-dashed border-gray-300 rounded-xl p-10 flex flex-col items-center gap-3 text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/30 transition-all disabled:opacity-50">
                  <Upload className="w-10 h-10" />
                  <div className="text-center">
                    <p className="text-sm font-medium">Haz clic para seleccionar un archivo</p>
                    <p className="text-xs text-gray-400 mt-0.5">Excel (.xlsx, .xls) o CSV (.csv)</p>
                  </div>
                </button>
                <p className="text-xs text-gray-400 text-center">¿No tienes el formato? <button onClick={() => setImportTab('template')} className="text-blue-600 hover:underline">Descarga la plantilla</button></p>
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