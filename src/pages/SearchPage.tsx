import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { AppLayout } from '@/components/AppLayout';
import { Input } from '@/components/ui/input';
import { Search, Filter, X, ArrowRight, ChevronDown } from 'lucide-react';
import type { Sample, SampleType, SampleStatus } from '@/types';

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

export function SearchPage() {
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minThaws, setMinThaws] = useState('');
  const [maxThaws, setMaxThaws] = useState('');

  const { data: samples = [], isLoading } = useQuery({
    queryKey: ['samples-search'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('samples')
        .select('*, box_id')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Sample[];
    },
    enabled: !!user,
  });

  const { data: boxes = [] } = useQuery({
    queryKey: ['boxes-search'],
    queryFn: async () => {
      const { data } = await supabase
        .from('boxes')
        .select('id, name, freezer_id');
      return (data || []) as { id: string; name: string; freezer_id: string }[];
    },
    enabled: !!user,
  });

  const boxMap = useMemo(() => {
    const m: Record<string, { name: string; freezer_id: string }> = {};
    boxes.forEach((b) => { m[b.id] = { name: b.name, freezer_id: b.freezer_id }; });
    return m;
  }, [boxes]);

  const projects = useMemo(() => {
    const ps = new Set<string>();
    samples.forEach((s) => { if (s.project) ps.add(s.project); });
    return Array.from(ps).sort();
  }, [samples]);

  const filtered = useMemo(() => {
    const lq = q.toLowerCase();
    return samples.filter((s) => {
      if (q && !(
        s.sample_code.toLowerCase().includes(lq) ||
        (s.patient_code || '').toLowerCase().includes(lq) ||
        (s.subject_code || '').toLowerCase().includes(lq) ||
        (s.project || '').toLowerCase().includes(lq)
      )) return false;
      if (statusFilter && s.status !== statusFilter) return false;
      if (typeFilter && s.sample_type !== typeFilter) return false;
      if (projectFilter && s.project !== projectFilter) return false;
      if (dateFrom && s.freeze_date && s.freeze_date < dateFrom) return false;
      if (dateTo && s.freeze_date && s.freeze_date > dateTo) return false;
      if (minThaws && s.thaw_count < parseInt(minThaws)) return false;
      if (maxThaws && s.thaw_count > parseInt(maxThaws)) return false;
      return true;
    });
  }, [samples, q, statusFilter, typeFilter, projectFilter, dateFrom, dateTo, minThaws, maxThaws]);

  const hasFilters = q || statusFilter || typeFilter || projectFilter || dateFrom || dateTo || minThaws || maxThaws;

  const clearFilters = () => {
    setQ('');
    setStatusFilter('');
    setTypeFilter('');
    setProjectFilter('');
    setDateFrom('');
    setDateTo('');
    setMinThaws('');
    setMaxThaws('');
  };

  return (
    <AppLayout>
      <div className="p-8">
        {/* Main Search */}
        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por código de muestra, paciente, sujeto, proyecto..."
            className="pl-12 pr-12 py-4 text-lg bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 rounded-xl"
            autoFocus
          />
          {q && (
            <button
              onClick={() => setQ('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-slate-400" />
            <span className="text-sm text-slate-400 font-medium">Filtros avanzados</span>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="ml-auto text-xs text-slate-400 hover:text-white flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Limpiar filtros
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {/* Status */}
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full appearance-none pl-3 pr-7 py-2 bg-slate-900 border border-slate-700 text-white rounded-lg text-sm"
              >
                <option value="">Estado</option>
                {(['active', 'used', 'discarded', 'archived', 'contaminated'] as SampleStatus[]).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
            </div>

            {/* Type */}
            <div className="relative">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full appearance-none pl-3 pr-7 py-2 bg-slate-900 border border-slate-700 text-white rounded-lg text-sm"
              >
                <option value="">Tipo</option>
                {SAMPLE_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
            </div>

            {/* Project */}
            <div className="relative">
              <select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="w-full appearance-none pl-3 pr-7 py-2 bg-slate-900 border border-slate-700 text-white rounded-lg text-sm"
              >
                <option value="">Proyecto</option>
                {projects.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
            </div>

            {/* Date from */}
            <div>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                placeholder="Fecha desde"
                className="bg-slate-900 border-slate-700 text-white text-sm py-2"
              />
            </div>

            {/* Date to */}
            <div>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                placeholder="Fecha hasta"
                className="bg-slate-900 border-slate-700 text-white text-sm py-2"
              />
            </div>

            {/* Thaw range */}
            <div className="flex gap-2">
              <Input
                type="number"
                value={minThaws}
                onChange={(e) => setMinThaws(e.target.value)}
                placeholder="Thaw min"
                className="bg-slate-900 border-slate-700 text-white text-sm py-2"
              />
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-slate-400 text-sm">
            {isLoading
              ? 'Cargando...'
              : `${filtered.length} resultado${filtered.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 bg-slate-800/50 animate-pulse rounded-xl border border-slate-700" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Sin resultados</p>
            <p className="text-sm mt-1">Prueba con otros criterios de búsqueda</p>
          </div>
        ) : (
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-900/50">
                  <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">Código</th>
                  <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">Tipo</th>
                  <th className="text-left text-xs text-slate-400 font-medium px-4 py-3 hidden md:table-cell">Proyecto</th>
                  <th className="text-left text-xs text-slate-400 font-medium px-4 py-3 hidden lg:table-cell">Caja</th>
                  <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">Posición</th>
                  <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">Estado</th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const box = s.box_id ? boxMap[s.box_id] : null;
                  return (
                    <tr
                      key={s.id}
                      className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <p className="text-white font-mono text-sm font-medium">{s.sample_code}</p>
                        {s.patient_code && (
                          <p className="text-slate-400 text-xs">P: {s.patient_code}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 capitalize text-slate-300 text-sm">{s.sample_type}</td>
                      <td className="px-4 py-3 hidden md:table-cell text-slate-400 text-sm">{s.project || '—'}</td>
                      <td className="px-4 py-3 hidden lg:table-cell text-slate-400 text-sm">
                        {box ? box.name : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {s.position_label ? (
                          <span className="font-mono text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded">
                            {s.position_label}
                          </span>
                        ) : (
                          <span className="text-slate-600 text-sm">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full capitalize font-medium ${STATUS_COLORS[s.status] || 'bg-slate-700 text-slate-400'}`}>
                          {s.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {box && (
                          <Link
                            to={`/freezers/${box.freezer_id}/box/${s.box_id}`}
                            className="p-1.5 text-slate-400 hover:text-cyan-400 rounded inline-flex"
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
    </AppLayout>
  );
}
