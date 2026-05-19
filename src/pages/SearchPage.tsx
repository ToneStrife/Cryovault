import { useState, useMemo, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { AppLayout } from '@/components/AppLayout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, Filter, X, ArrowRight, ChevronDown, Thermometer, Trash2, RotateCcw, Pencil, MapPin, ArrowUpFromLine, ArrowDownToLine, Link2 } from 'lucide-react';
import { SAMPLE_STATUS_LABEL, SAMPLE_TYPE_LABEL, labelOption, useSettingsOptions } from '@/lib/settingsOptions';
import { useSampleCheckout } from '@/hooks/useSampleCheckout';
import { PlaceSampleDialog } from '@/components/PlaceSampleDialog';
import { ReturnSampleDialog } from '@/components/ReturnSampleDialog';
import type { Sample, SampleType, SampleStatus, UnitType, Freezer } from '@/types';
import { PAGE_HEADER, PAGE_BODY } from '@/lib/layout';
import { formFooterClass, selectClass } from '@/lib/formStyles';
import { FormField } from '@/components/ui/FormField';
import { Textarea } from '@/components/ui/textarea';
import { boxPath, copyAppLink, sampleSearchPath } from '@/lib/appUrl';

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  in_use: 'bg-amber-100 text-amber-800',
  used: 'bg-yellow-100 text-yellow-700',
  discarded: 'bg-red-100 text-red-700',
  archived: 'bg-gray-100 text-gray-500',
  contaminated: 'bg-red-900/10 text-red-800',
};

const TEMP_OPTIONS = [
  { value: '-196', label: '-196°C (LN)' },
  { value: '-80', label: '-80°C' },
  { value: '-20', label: '-20°C' },
  { value: '4', label: '4°C' },
];

export function SearchPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { options: settingsOptions } = useSettingsOptions(user?.laboratory);
  const { checkoutSample, checkoutSamplesAsync, isCheckingOutSamples } = useSampleCheckout();
  const sampleTypes = settingsOptions.sampleTypes;
  const statuses = settingsOptions.sampleStatuses;
  const units = settingsOptions.unitTypes;
  const [placeTarget, setPlaceTarget] = useState<Sample | null>(null);
  const [showPlaceDialog, setShowPlaceDialog] = useState(false);
  const [returnTarget, setReturnTarget] = useState<Sample | null>(null);
  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [locationFilter, setLocationFilter] = useState('');
  const [q, setQ] = useState('');
  const [copiedSampleId, setCopiedSampleId] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');
    if (code) setQ(code);
  }, [searchParams]);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [patientFilter, setPatientFilter] = useState('');
  const [freezerFilter, setFreezerFilter] = useState('');
  const [boxFilter, setBoxFilter] = useState('');
  const [tempFilter, setTempFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minThaws, setMinThaws] = useState('');
  const [maxThaws, setMaxThaws] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editTarget, setEditTarget] = useState<(Sample & { deleted_at?: string | null }) | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [formError, setFormError] = useState('');
  const [editForm, setEditForm] = useState({
    sample_code: '', patient_code: '', subject_code: '', project: '', sample_type: 'blood' as SampleType,
    subtype: '', volume: '', units: 'mL' as UnitType, concentration: '', status: 'active' as SampleStatus,
    freeze_date: '', collection_date: '', max_thaws: '3', notes: '',
  });
  const [bulkApply, setBulkApply] = useState<Record<string, boolean>>({});
  const [bulkForm, setBulkForm] = useState({
    patient_code: '', subject_code: '', project: '', sample_type: 'blood' as SampleType,
    subtype: '', volume: '', units: 'mL' as UnitType, concentration: '', status: 'active' as SampleStatus,
    freeze_date: '', collection_date: '', max_thaws: '', notes: '',
  });

  const { data: samples = [], isLoading } = useQuery({
    queryKey: ['samples-search'],
    queryFn: async () => {
      const { data, error } = await (supabase.from('samples') as any)
        .select('*, box_id, deleted_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as (Sample & { deleted_at: string | null })[];
    },
    enabled: !!user,
  });

  const { data: freezers = [] } = useQuery({
    queryKey: ['freezers-search'],
    queryFn: async () => {
      const { data } = await supabase.from('freezers').select('id, name, temperature').order('name');
      return (data || []) as Pick<Freezer, 'id' | 'name' | 'temperature'>[];
    },
    enabled: !!user,
  });

  const { data: boxes = [] } = useQuery({
    queryKey: ['boxes-search'],
    queryFn: async () => {
      const { data } = await supabase.from('boxes').select('id, name, freezer_id').order('name');
      return (data || []) as { id: string; name: string; freezer_id: string }[];
    },
    enabled: !!user,
  });

  const freezerMap = useMemo(() => {
    const m: Record<string, Pick<Freezer, 'id' | 'name' | 'temperature'>> = {};
    freezers.forEach((f) => { m[f.id] = f; });
    return m;
  }, [freezers]);

  const boxMap = useMemo(() => {
    const m: Record<string, { name: string; freezer_id: string }> = {};
    boxes.forEach((b) => { m[b.id] = { name: b.name, freezer_id: b.freezer_id }; });
    return m;
  }, [boxes]);

  // Boxes available for selection (filter by chosen freezer)
  const filteredBoxOptions = useMemo(() => {
    if (!freezerFilter) return boxes;
    return boxes.filter((b) => b.freezer_id === freezerFilter);
  }, [boxes, freezerFilter]);

  const projects = useMemo(() => {
    const ps = new Set<string>();
    samples.forEach((s) => { if (s.project) ps.add(s.project); });
    return Array.from(ps).sort();
  }, [samples]);

  const filtered = useMemo(() => {
    const lq = q.toLowerCase();
    const lp = patientFilter.toLowerCase();
    return samples.filter((s) => {
      // Soft-delete filter
      const isDeleted = !!(s as any).deleted_at;
      if (!showDeleted && isDeleted) return false;

      if (q && !(
        s.sample_code.toLowerCase().includes(lq) ||
        (s.patient_code || '').toLowerCase().includes(lq) ||
        (s.subject_code || '').toLowerCase().includes(lq) ||
        (s.project || '').toLowerCase().includes(lq) ||
        (s.notes || '').toLowerCase().includes(lq)
      )) return false;
      if (patientFilter && !(
        (s.patient_code || '').toLowerCase().includes(lp) ||
        (s.subject_code || '').toLowerCase().includes(lp)
      )) return false;
      if (statusFilter && s.status !== statusFilter) return false;
      if (locationFilter === 'unplaced' && s.box_id) return false;
      if (locationFilter === 'in_use' && s.status !== 'in_use') return false;
      if (typeFilter && s.sample_type !== typeFilter) return false;
      if (projectFilter && s.project !== projectFilter) return false;
      if (boxFilter && s.box_id !== boxFilter) return false;
      if (freezerFilter && s.box_id) {
        const boxEntry = boxMap[s.box_id];
        if (!boxEntry || boxEntry.freezer_id !== freezerFilter) return false;
      } else if (freezerFilter && !s.box_id) {
        return false;
      }
      if (tempFilter && s.box_id) {
        const boxEntry = boxMap[s.box_id];
        const fz = boxEntry ? freezerMap[boxEntry.freezer_id] : null;
        if (!fz || String(fz.temperature) !== tempFilter) return false;
      }
      if (dateFrom && s.freeze_date && s.freeze_date < dateFrom) return false;
      if (dateTo && s.freeze_date && s.freeze_date > dateTo) return false;
      if (minThaws && s.thaw_count < parseInt(minThaws)) return false;
      if (maxThaws && s.thaw_count > parseInt(maxThaws)) return false;
      return true;
    });
  }, [samples, q, patientFilter, statusFilter, typeFilter, projectFilter, boxFilter, freezerFilter, tempFilter, dateFrom, dateTo, minThaws, maxThaws, showDeleted, locationFilter, boxMap, freezerMap]);

  const activeFilterCount = [statusFilter, typeFilter, projectFilter, patientFilter, freezerFilter, boxFilter, tempFilter, dateFrom, dateTo, minThaws, maxThaws, locationFilter, showDeleted ? '1' : ''].filter(Boolean).length;

  const clearFilters = () => {
    setQ('');
    setStatusFilter('');
    setTypeFilter('');
    setProjectFilter('');
    setPatientFilter('');
    setFreezerFilter('');
    setBoxFilter('');
    setTempFilter('');
    setDateFrom('');
    setDateTo('');
    setMinThaws('');
    setMaxThaws('');
    setLocationFilter('');
    setShowDeleted(false);
  };

  const openEdit = (s: Sample & { deleted_at?: string | null }) => {
    setEditTarget(s);
    setEditForm({
      sample_code: s.sample_code,
      patient_code: s.patient_code || '',
      subject_code: s.subject_code || '',
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
    setShowEditDialog(true);
  };

  const closeEdit = () => { setShowEditDialog(false); setEditTarget(null); setFormError(''); };
  const f = (field: keyof typeof editForm, val: string) => setEditForm((prev) => ({ ...prev, [field]: val }));
  const bf = (field: keyof typeof bulkForm, val: string) => setBulkForm((prev) => ({ ...prev, [field]: val }));

  const handleCopySampleLink = async (sample: Sample) => {
    const ok = await copyAppLink(sampleSearchPath(sample.sample_code));
    if (ok) {
      setCopiedSampleId(sample.id);
      window.setTimeout(() => setCopiedSampleId(null), 2000);
    }
  };
  const toggleBulkField = (field: string) => setBulkApply((prev) => ({ ...prev, [field]: !prev[field] }));
  const selectedIds = Array.from(selected);
  const toggleSelect = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const selectAllFiltered = () => setSelected(new Set(filtered.map((s) => s.id)));
  const clearSelect = () => setSelected(new Set());

  const handleBulkCheckout = async () => {
    const targets = filtered.filter(
      (s) => selected.has(s.id) && !(s as { deleted_at?: string | null }).deleted_at && s.status !== 'in_use',
    );
    if (targets.length === 0) {
      alert('No hay muestras activas seleccionadas que se puedan sacar.');
      return;
    }
    if (!confirm(`¿Sacar ${targets.length} muestra${targets.length !== 1 ? 's' : ''}? (+1 descongelación cada una, deja hueco en la caja)`)) {
      return;
    }
    try {
      await checkoutSamplesAsync(targets);
      clearSelect();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error al sacar muestras');
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!editTarget) throw new Error('No hay muestra seleccionada');
      const payload = {
        sample_code: editForm.sample_code.trim(),
        patient_code: editForm.patient_code.trim() || null,
        subject_code: editForm.subject_code.trim() || null,
        project: editForm.project.trim() || null,
        sample_type: editForm.sample_type,
        subtype: editForm.subtype.trim() || null,
        volume: editForm.volume ? parseFloat(editForm.volume) : null,
        units: editForm.units,
        concentration: editForm.concentration ? parseFloat(editForm.concentration) : null,
        status: editForm.status,
        freeze_date: editForm.freeze_date || null,
        collection_date: editForm.collection_date || null,
        max_thaws: parseInt(editForm.max_thaws) || 3,
        notes: editForm.notes.trim() || null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await (supabase.from('samples') as any).update(payload).eq('id', editTarget.id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['samples-search'] }); closeEdit(); },
    onError: (e: any) => setFormError(e.message),
  });

  const softDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await (supabase.from('samples') as any)
        .update({ deleted_at: new Date().toISOString(), deleted_by: user!.id })
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['samples-search'] }); clearSelect(); },
  });

  const restoreMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await (supabase.from('samples') as any)
        .update({ deleted_at: null, deleted_by: null })
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['samples-search'] }); clearSelect(); },
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, any> = { updated_at: new Date().toISOString() };
      if (bulkApply.patient_code) payload.patient_code = bulkForm.patient_code.trim() || null;
      if (bulkApply.subject_code) payload.subject_code = bulkForm.subject_code.trim() || null;
      if (bulkApply.project) payload.project = bulkForm.project.trim() || null;
      if (bulkApply.sample_type) payload.sample_type = bulkForm.sample_type;
      if (bulkApply.subtype) payload.subtype = bulkForm.subtype.trim() || null;
      if (bulkApply.volume) payload.volume = bulkForm.volume ? parseFloat(bulkForm.volume) : null;
      if (bulkApply.units) payload.units = bulkForm.units;
      if (bulkApply.concentration) payload.concentration = bulkForm.concentration ? parseFloat(bulkForm.concentration) : null;
      if (bulkApply.status) payload.status = bulkForm.status;
      if (bulkApply.freeze_date) payload.freeze_date = bulkForm.freeze_date || null;
      if (bulkApply.collection_date) payload.collection_date = bulkForm.collection_date || null;
      if (bulkApply.max_thaws) payload.max_thaws = parseInt(bulkForm.max_thaws) || 3;
      if (bulkApply.notes) payload.notes = bulkForm.notes.trim() || null;
      if (Object.keys(payload).length === 1) throw new Error('Selecciona al menos un campo');
      const { error } = await (supabase.from('samples') as any).update(payload).in('id', selectedIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['samples-search'] });
      setShowBulkDialog(false);
      setBulkApply({});
      clearSelect();
    },
    onError: (e: any) => setFormError(e.message),
  });

  const filterSelectClass = `${selectClass} pl-3 pr-7 py-2 text-gray-700`;

  return (
    <AppLayout>
      <div className="min-h-full bg-gray-50">
        <div className={`bg-white border-b border-gray-200 ${PAGE_HEADER} py-6`}>
          <h1 className="text-2xl font-bold text-gray-900">Búsqueda avanzada</h1>
          <p className="text-sm text-gray-500 mt-0.5">Busca muestras por cualquier criterio</p>
        </div>

        <div className={PAGE_BODY}>
          {/* Main Search */}
          <div className="relative mb-4">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Código de muestra, paciente, sujeto, proyecto, notas..."
              className="pl-12 pr-12 py-4 text-base bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 rounded-xl shadow-sm"
              autoFocus
            />
            {q && (
              <button onClick={() => setQ('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Filters panel */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm mb-6">
            <button
              className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-50 transition-colors rounded-xl"
              onClick={() => setShowFilters((v) => !v)}
            >
              <Filter className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-600">Filtros avanzados</span>
              {activeFilterCount > 0 && (
                <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full">{activeFilterCount}</span>
              )}
              {activeFilterCount > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); clearFilters(); }}
                  className="ml-auto text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1"
                >
                  <X className="w-3 h-3" /> Limpiar
                </button>
              )}
              <ChevronDown className={`w-4 h-4 text-gray-400 ml-auto transition-transform ${showFilters ? 'rotate-180' : ''} ${activeFilterCount > 0 ? 'ml-2' : 'ml-auto'}`} />
            </button>

            {showFilters && (
              <div className="px-4 pb-4 pt-1 border-t border-gray-100 space-y-3">
                {/* Row 1: type, status, project, patient */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-500">Tipo de muestra</label>
                    <div className="relative">
                      <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={filterSelectClass}>
                        <option value="">Todos los tipos</option>
                        {sampleTypes.map((t) => <option key={t} value={t}>{labelOption(t, SAMPLE_TYPE_LABEL)}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-500">Estado</label>
                    <div className="relative">
                      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={filterSelectClass}>
                        <option value="">Todos los estados</option>
                        {statuses.map((s) => (
                          <option key={s} value={s}>{labelOption(s, SAMPLE_STATUS_LABEL)}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-500">Proyecto</label>
                    <div className="relative">
                      <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className={filterSelectClass}>
                        <option value="">Todos los proyectos</option>
                        {projects.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-500">Paciente / Sujeto</label>
                    <Input
                      value={patientFilter}
                      onChange={(e) => setPatientFilter(e.target.value)}
                      placeholder="Código paciente..."
                      className="bg-white border-gray-200 text-gray-700 text-sm py-2 h-[38px]"
                    />
                  </div>
                </div>

                {/* Row 2: freezer, box, temperature */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-500">Congelador</label>
                    <div className="relative">
                      <select
                        value={freezerFilter}
                        onChange={(e) => { setFreezerFilter(e.target.value); setBoxFilter(''); }}
                        className={filterSelectClass}
                      >
                        <option value="">Todos los congeladores</option>
                        {freezers.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-500">Caja</label>
                    <div className="relative">
                      <select value={boxFilter} onChange={(e) => setBoxFilter(e.target.value)} className={filterSelectClass}>
                        <option value="">Todas las cajas</option>
                        {filteredBoxOptions.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-500 flex items-center gap-1"><Thermometer className="w-3 h-3" /> Temperatura</label>
                    <div className="relative">
                      <select value={tempFilter} onChange={(e) => setTempFilter(e.target.value)} className={filterSelectClass}>
                        <option value="">Cualquier temperatura</option>
                        {TEMP_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* Row 3: dates, thaws, ubicación, deleted */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3 items-end">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-500">Fecha congelación desde</label>
                    <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="bg-white border-gray-200 text-gray-700 text-sm py-2 h-[38px]" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-500">Hasta</label>
                    <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="bg-white border-gray-200 text-gray-700 text-sm py-2 h-[38px]" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-500">Descongelaciones mín.</label>
                    <Input type="number" min={0} value={minThaws} onChange={(e) => setMinThaws(e.target.value)} placeholder="0" className="bg-white border-gray-200 text-gray-700 text-sm py-2 h-[38px]" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-500">Descongelaciones máx.</label>
                    <Input type="number" min={0} value={maxThaws} onChange={(e) => setMaxThaws(e.target.value)} placeholder="∞" className="bg-white border-gray-200 text-gray-700 text-sm py-2 h-[38px]" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-500">Ubicación</label>
                    <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className={filterSelectClass}>
                      <option value="">Todas</option>
                      <option value="unplaced">Sin caja</option>
                      <option value="in_use">En uso</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2 pb-1">
                    <input
                      type="checkbox"
                      id="showDeleted"
                      checked={showDeleted}
                      onChange={(e) => setShowDeleted(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="showDeleted" className="text-sm text-gray-600 select-none cursor-pointer">Mostrar eliminadas</label>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Results header */}
          <div className="flex items-center justify-between mb-3 gap-3">
            <p className="text-gray-500 text-sm">
              {isLoading ? 'Cargando...' : `${filtered.length} resultado${filtered.length !== 1 ? 's' : ''}`}
            </p>
            {selected.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-blue-700 font-medium">{selected.size} seleccionada{selected.size !== 1 ? 's' : ''}</span>
                <button onClick={clearSelect} className="text-xs text-gray-400 hover:text-gray-700">Limpiar</button>
                <Button onClick={() => { setFormError(''); setShowBulkDialog(true); }} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                  <Pencil className="w-3.5 h-3.5" /> Editar grupo
                </Button>
                {!showDeleted && (
                  <Button
                    onClick={handleBulkCheckout}
                    disabled={isCheckingOutSamples}
                    size="sm"
                    variant="outline"
                    className="text-amber-700 border-amber-200 hover:bg-amber-50"
                  >
                    <ArrowUpFromLine className="w-3.5 h-3.5" /> Sacar
                  </Button>
                )}
                {!showDeleted ? (
                  <Button onClick={() => softDeleteMutation.mutate(selectedIds)} size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50">
                    <Trash2 className="w-3.5 h-3.5" /> Eliminar
                  </Button>
                ) : (
                  <Button onClick={() => restoreMutation.mutate(selectedIds)} size="sm" variant="outline" className="text-green-600 border-green-200 hover:bg-green-50">
                    <RotateCcw className="w-3.5 h-3.5" /> Restaurar
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Results table */}
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-14 bg-white animate-pulse rounded-xl border border-gray-200" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium text-gray-500">Sin resultados</p>
              <p className="text-sm mt-1">Prueba con otros criterios de búsqueda</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={filtered.length > 0 && selected.size === filtered.length}
                        onChange={(e) => e.target.checked ? selectAllFiltered() : clearSelect()}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600"
                      />
                    </th>
                    <th className="text-left text-xs text-gray-500 font-semibold px-4 py-3">Código</th>
                    <th className="text-left text-xs text-gray-500 font-semibold px-4 py-3">Tipo</th>
                    <th className="text-left text-xs text-gray-500 font-semibold px-4 py-3 hidden sm:table-cell">Proyecto</th>
                    <th className="text-left text-xs text-gray-500 font-semibold px-4 py-3 hidden md:table-cell">Congelador</th>
                    <th className="text-left text-xs text-gray-500 font-semibold px-4 py-3 hidden lg:table-cell">Caja</th>
                    <th className="text-left text-xs text-gray-500 font-semibold px-4 py-3">Posición</th>
                    <th className="text-left text-xs text-gray-500 font-semibold px-4 py-3 hidden xl:table-cell">Descong.</th>
                    <th className="text-left text-xs text-gray-500 font-semibold px-4 py-3">Estado</th>
                    <th className="px-4 py-3 w-28"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => {
                    const boxEntry = s.box_id ? boxMap[s.box_id] : null;
                    const fz = boxEntry ? freezerMap[boxEntry.freezer_id] : null;
                    const isDeleted = !!(s as any).deleted_at;
                    return (
                      <tr
                        key={s.id}
                        onClick={() => !isDeleted && openEdit(s)}
                        className={`border-b border-gray-100 hover:bg-blue-50/30 transition-colors cursor-pointer ${isDeleted ? 'opacity-50' : ''}`}
                      >
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selected.has(s.id)}
                            onChange={() => toggleSelect(s.id)}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-gray-900 font-mono text-sm font-medium">{s.sample_code}</p>
                          {s.patient_code && <p className="text-gray-400 text-xs">P: {s.patient_code}</p>}
                          {isDeleted && <p className="text-red-400 text-[10px] font-medium">Eliminada</p>}
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-sm">{labelOption(s.sample_type, SAMPLE_TYPE_LABEL)}</td>
                        <td className="px-4 py-3 hidden sm:table-cell text-gray-500 text-sm">{s.project || '—'}</td>
                        <td className="px-4 py-3 hidden md:table-cell text-gray-500 text-sm">
                          {fz ? (
                            <span className="flex items-center gap-1">
                              {fz.name}
                              <span className="text-xs text-blue-500 font-mono ml-1">{fz.temperature}°C</span>
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell text-gray-500 text-sm">
                          {!s.box_id ? (
                            <span className="text-xs text-orange-600 font-medium">Sin ubicar</span>
                          ) : boxEntry ? boxEntry.name : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {s.position_label ? (
                            <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{s.position_label}</span>
                          ) : s.status === 'in_use' && s.box_id ? (
                            <span className="text-xs text-amber-600 italic">En uso</span>
                          ) : (
                            <span className="text-gray-300 text-sm">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden xl:table-cell text-gray-500 text-sm">
                          <span className={`text-xs font-mono ${s.thaw_count >= s.max_thaws ? 'text-red-500 font-semibold' : 'text-gray-500'}`}>
                            {s.thaw_count}/{s.max_thaws}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[s.status] || 'bg-gray-100 text-gray-500'}`}>
                            {labelOption(s.status, SAMPLE_STATUS_LABEL)}
                          </span>
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-0.5 justify-end">
                            <button
                              type="button"
                              onClick={() => handleCopySampleLink(s)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded inline-flex"
                              title={copiedSampleId === s.id ? 'Enlace copiado' : 'Copiar enlace a esta muestra'}
                            >
                              <Link2 className="w-4 h-4" />
                            </button>
                            {!isDeleted && !s.box_id && (
                              <button
                                type="button"
                                onClick={() => { setPlaceTarget(s); setShowPlaceDialog(true); }}
                                className="p-1.5 text-orange-500 hover:text-orange-700 hover:bg-orange-50 rounded inline-flex"
                                title="Colocar en caja"
                              >
                                <MapPin className="w-4 h-4" />
                              </button>
                            )}
                            {!isDeleted && s.status === 'in_use' && s.box_id && (
                              <button
                                type="button"
                                onClick={() => { setReturnTarget(s); setShowReturnDialog(true); }}
                                className="p-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded inline-flex"
                                title="Devolver a la caja"
                              >
                                <ArrowDownToLine className="w-4 h-4" />
                              </button>
                            )}
                            {!isDeleted && s.status !== 'in_use' && s.box_id && (
                              <button
                                type="button"
                                onClick={() => { if (confirm('¿Sacar muestra? (+1 descongelación)')) checkoutSample(s); }}
                                className="p-1.5 text-amber-500 hover:text-amber-700 hover:bg-amber-50 rounded inline-flex"
                                title="Sacar muestra"
                              >
                                <ArrowUpFromLine className="w-4 h-4" />
                              </button>
                            )}
                            {boxEntry && !isDeleted && (
                              <Link
                                to={boxPath(s.box_id!)}
                                className="p-1.5 text-gray-400 hover:text-blue-600 rounded inline-flex"
                                title="Ir a la caja"
                              >
                                <ArrowRight className="w-4 h-4" />
                              </Link>
                            )}
                          </div>
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

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar muestra</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            {formError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{formError}</p>}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <label className="text-sm font-medium text-gray-700">Código</label>
                <Input value={editForm.sample_code} onChange={(e) => f('sample_code', e.target.value)} className="font-mono" />
              </div>
              <div className="space-y-1"><label className="text-sm font-medium text-gray-700">Paciente</label><Input value={editForm.patient_code} onChange={(e) => f('patient_code', e.target.value)} /></div>
              <div className="space-y-1"><label className="text-sm font-medium text-gray-700">Sujeto</label><Input value={editForm.subject_code} onChange={(e) => f('subject_code', e.target.value)} /></div>
              <div className="space-y-1"><label className="text-sm font-medium text-gray-700">Proyecto</label><Input value={editForm.project} onChange={(e) => f('project', e.target.value)} /></div>
              <div className="space-y-1"><label className="text-sm font-medium text-gray-700">Subtipo</label><Input value={editForm.subtype} onChange={(e) => f('subtype', e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><label className="text-sm font-medium text-gray-700">Tipo</label><select value={editForm.sample_type} onChange={(e) => f('sample_type', e.target.value)} className={selectClass}>{sampleTypes.map((t) => <option key={t} value={t}>{labelOption(t, SAMPLE_TYPE_LABEL)}</option>)}</select></div>
              <div className="space-y-1"><label className="text-sm font-medium text-gray-700">Estado</label><select value={editForm.status} onChange={(e) => f('status', e.target.value)} className={selectClass}>{statuses.map((s) => <option key={s} value={s}>{labelOption(s, SAMPLE_STATUS_LABEL)}</option>)}</select></div>
              <div className="space-y-1"><label className="text-sm font-medium text-gray-700">Volumen</label><Input type="number" step="0.001" value={editForm.volume} onChange={(e) => f('volume', e.target.value)} /></div>
              <div className="space-y-1"><label className="text-sm font-medium text-gray-700">Unidades</label><select value={editForm.units} onChange={(e) => f('units', e.target.value)} className={selectClass}>{units.map((u) => <option key={u} value={u}>{u}</option>)}</select></div>
              <div className="space-y-1"><label className="text-sm font-medium text-gray-700">Concentración</label><Input type="number" step="0.001" value={editForm.concentration} onChange={(e) => f('concentration', e.target.value)} /></div>
              <div className="space-y-1"><label className="text-sm font-medium text-gray-700">Máx. descong.</label><Input type="number" min={1} value={editForm.max_thaws} onChange={(e) => f('max_thaws', e.target.value)} /></div>
              <div className="space-y-1"><label className="text-sm font-medium text-gray-700">Fecha congelación</label><Input type="date" value={editForm.freeze_date} onChange={(e) => f('freeze_date', e.target.value)} /></div>
              <div className="space-y-1"><label className="text-sm font-medium text-gray-700">Fecha extracción</label><Input type="date" value={editForm.collection_date} onChange={(e) => f('collection_date', e.target.value)} /></div>
            </div>
            <FormField label="Notas">
              <Textarea value={editForm.notes} onChange={(e) => f('notes', e.target.value)} placeholder="Observaciones..." rows={3} />
            </FormField>
            <div className={formFooterClass}>
              <Button type="button" variant="outline" onClick={closeEdit} className="flex-1 border-gray-200">Cancelar</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">Guardar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showBulkDialog} onOpenChange={setShowBulkDialog}>
        <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar {selected.size} muestras</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            {formError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{formError}</p>}
            <p className="text-sm text-gray-500">Marca los campos que quieres aplicar. El código de muestra no se edita en grupo.</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                ['patient_code', 'Paciente', 'text'],
                ['subject_code', 'Sujeto', 'text'],
                ['project', 'Proyecto', 'text'],
                ['subtype', 'Subtipo', 'text'],
                ['volume', 'Volumen', 'number'],
                ['concentration', 'Concentración', 'number'],
                ['freeze_date', 'Fecha congelación', 'date'],
                ['collection_date', 'Fecha extracción', 'date'],
                ['max_thaws', 'Máx. descong.', 'number'],
                ['notes', 'Notas', 'text'],
              ].map(([key, label, type]) => (
                <label key={key} className="space-y-1">
                  <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <input type="checkbox" checked={!!bulkApply[key]} onChange={() => toggleBulkField(key)} className="rounded border-gray-300 text-blue-600" />
                    {label}
                  </span>
                  <Input type={type} value={(bulkForm as any)[key]} onChange={(e) => bf(key as keyof typeof bulkForm, e.target.value)} disabled={!bulkApply[key]} className="disabled:opacity-40" />
                </label>
              ))}
              <label className="space-y-1">
                <span className="flex items-center gap-2 text-sm font-medium text-gray-700"><input type="checkbox" checked={!!bulkApply.sample_type} onChange={() => toggleBulkField('sample_type')} className="rounded border-gray-300 text-blue-600" />Tipo</span>
                <select value={bulkForm.sample_type} onChange={(e) => bf('sample_type', e.target.value)} disabled={!bulkApply.sample_type} className={`${selectClass} disabled:opacity-40`}>{sampleTypes.map((t) => <option key={t} value={t}>{labelOption(t, SAMPLE_TYPE_LABEL)}</option>)}</select>
              </label>
              <label className="space-y-1">
                <span className="flex items-center gap-2 text-sm font-medium text-gray-700"><input type="checkbox" checked={!!bulkApply.status} onChange={() => toggleBulkField('status')} className="rounded border-gray-300 text-blue-600" />Estado</span>
                <select value={bulkForm.status} onChange={(e) => bf('status', e.target.value)} disabled={!bulkApply.status} className={`${selectClass} disabled:opacity-40`}>{statuses.map((s) => <option key={s} value={s}>{labelOption(s, SAMPLE_STATUS_LABEL)}</option>)}</select>
              </label>
              <label className="space-y-1">
                <span className="flex items-center gap-2 text-sm font-medium text-gray-700"><input type="checkbox" checked={!!bulkApply.units} onChange={() => toggleBulkField('units')} className="rounded border-gray-300 text-blue-600" />Unidades</span>
                <select value={bulkForm.units} onChange={(e) => bf('units', e.target.value)} disabled={!bulkApply.units} className={`${selectClass} disabled:opacity-40`}>{units.map((u) => <option key={u} value={u}>{u}</option>)}</select>
              </label>
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowBulkDialog(false)} className="flex-1 border-gray-300">Cancelar</Button>
              <Button onClick={() => bulkUpdateMutation.mutate()} disabled={bulkUpdateMutation.isPending} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">Aplicar cambios</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <PlaceSampleDialog
        sample={placeTarget}
        open={showPlaceDialog}
        onClose={() => { setShowPlaceDialog(false); setPlaceTarget(null); }}
      />
      <ReturnSampleDialog
        sample={returnTarget}
        open={showReturnDialog}
        onClose={() => { setShowReturnDialog(false); setReturnTarget(null); }}
      />
    </AppLayout>
  );
}
