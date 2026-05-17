import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { AppLayout } from '@/components/AppLayout';
import { Input } from '@/components/ui/input';
import { Search, Filter, X, ArrowRight, ChevronDown, Thermometer } from 'lucide-react';
import type { Sample, SampleType, SampleStatus, Freezer } from '@/types';

const STATUS_LABEL: Record<string, string> = {
  active: 'Activo',
  used: 'Usado',
  discarded: 'Descartado',
  archived: 'Archivado',
  contaminated: 'Contaminado',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  used: 'bg-yellow-100 text-yellow-700',
  discarded: 'bg-red-100 text-red-700',
  archived: 'bg-gray-100 text-gray-500',
  contaminated: 'bg-red-900/10 text-red-800',
};

const TYPE_LABEL: Record<string, string> = {
  tissue: 'Tejido', blood: 'Sangre', serum: 'Suero', plasma: 'Plasma',
  urine: 'Orina', csf: 'LCR', saliva: 'Saliva', dna: 'DNA', rna: 'RNA',
  protein: 'Proteína', other: 'Otro',
};

const SAMPLE_TYPES: SampleType[] = [
  'tissue', 'blood', 'serum', 'plasma', 'urine', 'csf', 'saliva', 'dna', 'rna', 'protein', 'other',
];

const TEMP_OPTIONS = [
  { value: '-196', label: '-196°C (LN)' },
  { value: '-80', label: '-80°C' },
  { value: '-20', label: '-20°C' },
  { value: '4', label: '4°C' },
];

export function SearchPage() {
  const { user } = useAuth();
  const [q, setQ] = useState('');
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
  }, [samples, q, patientFilter, statusFilter, typeFilter, projectFilter, boxFilter, freezerFilter, tempFilter, dateFrom, dateTo, minThaws, maxThaws, showDeleted, boxMap, freezerMap]);

  const activeFilterCount = [statusFilter, typeFilter, projectFilter, patientFilter, freezerFilter, boxFilter, tempFilter, dateFrom, dateTo, minThaws, maxThaws, showDeleted ? '1' : ''].filter(Boolean).length;

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
    setShowDeleted(false);
  };

  const selectClass = 'w-full appearance-none pl-3 pr-7 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <AppLayout>
      <div className="min-h-full bg-gray-50">
        <div className="bg-white border-b border-gray-200 px-4 lg:px-8 py-6">
          <h1 className="text-2xl font-bold text-gray-900">Búsqueda avanzada</h1>
          <p className="text-sm text-gray-500 mt-0.5">Busca muestras por cualquier criterio</p>
        </div>

        <div className="px-4 lg:px-8 py-6">
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
                      <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={selectClass}>
                        <option value="">Todos los tipos</option>
                        {SAMPLE_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t] || t}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-500">Estado</label>
                    <div className="relative">
                      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectClass}>
                        <option value="">Todos los estados</option>
                        {(['active', 'used', 'discarded', 'archived', 'contaminated'] as SampleStatus[]).map((s) => (
                          <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-500">Proyecto</label>
                    <div className="relative">
                      <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className={selectClass}>
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
                        className={selectClass}
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
                      <select value={boxFilter} onChange={(e) => setBoxFilter(e.target.value)} className={selectClass}>
                        <option value="">Todas las cajas</option>
                        {filteredBoxOptions.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-500 flex items-center gap-1"><Thermometer className="w-3 h-3" /> Temperatura</label>
                    <div className="relative">
                      <select value={tempFilter} onChange={(e) => setTempFilter(e.target.value)} className={selectClass}>
                        <option value="">Cualquier temperatura</option>
                        {TEMP_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* Row 3: dates, thaws, deleted */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
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
          <div className="flex items-center justify-between mb-3">
            <p className="text-gray-500 text-sm">
              {isLoading ? 'Cargando...' : `${filtered.length} resultado${filtered.length !== 1 ? 's' : ''}`}
            </p>
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
                    <th className="text-left text-xs text-gray-500 font-semibold px-4 py-3">Código</th>
                    <th className="text-left text-xs text-gray-500 font-semibold px-4 py-3">Tipo</th>
                    <th className="text-left text-xs text-gray-500 font-semibold px-4 py-3 hidden sm:table-cell">Proyecto</th>
                    <th className="text-left text-xs text-gray-500 font-semibold px-4 py-3 hidden md:table-cell">Congelador</th>
                    <th className="text-left text-xs text-gray-500 font-semibold px-4 py-3 hidden lg:table-cell">Caja</th>
                    <th className="text-left text-xs text-gray-500 font-semibold px-4 py-3">Posición</th>
                    <th className="text-left text-xs text-gray-500 font-semibold px-4 py-3 hidden xl:table-cell">Descong.</th>
                    <th className="text-left text-xs text-gray-500 font-semibold px-4 py-3">Estado</th>
                    <th className="px-4 py-3 w-10"></th>
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
                        className={`border-b border-gray-100 hover:bg-blue-50/30 transition-colors ${isDeleted ? 'opacity-50' : ''}`}
                      >
                        <td className="px-4 py-3">
                          <p className="text-gray-900 font-mono text-sm font-medium">{s.sample_code}</p>
                          {s.patient_code && <p className="text-gray-400 text-xs">P: {s.patient_code}</p>}
                          {isDeleted && <p className="text-red-400 text-[10px] font-medium">Eliminada</p>}
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-sm">{TYPE_LABEL[s.sample_type] || s.sample_type}</td>
                        <td className="px-4 py-3 hidden sm:table-cell text-gray-500 text-sm">{s.project || '—'}</td>
                        <td className="px-4 py-3 hidden md:table-cell text-gray-500 text-sm">
                          {fz ? (
                            <span className="flex items-center gap-1">
                              {fz.name}
                              <span className="text-xs text-blue-500 font-mono ml-1">{fz.temperature}°C</span>
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell text-gray-500 text-sm">{boxEntry ? boxEntry.name : '—'}</td>
                        <td className="px-4 py-3">
                          {s.position_label ? (
                            <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{s.position_label}</span>
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
                            {STATUS_LABEL[s.status] || s.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {boxEntry && !isDeleted && (
                            <Link
                              to={`/freezers/${boxEntry.freezer_id}/box/${s.box_id}`}
                              className="p-1.5 text-gray-400 hover:text-blue-600 rounded inline-flex"
                              title="Ir a la caja"
                            >
                              <ArrowRight className="w-4 h-4" />
                            </Link>
                          )}
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
    </AppLayout>
  );
}
