import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { AppLayout } from '@/components/AppLayout';
import { Snowflake, Package2, FlaskConical, TrendingUp, ArrowRight, Clock, Search, X, QrCode } from 'lucide-react';
import { QrScannerDialog } from '@/components/QrScannerDialog';
import { formatAuditLog, makeUserMap } from '@/lib/auditFormat';

const TYPE_COLORS: Record<string, string> = {
  blood: '#ef4444', serum: '#f97316', plasma: '#eab308', tissue: '#22c55e',
  dna: '#06b6d4', rna: '#3b82f6', urine: '#8b5cf6', csf: '#ec4899',
  saliva: '#14b8a6', protein: '#f59e0b', other: '#6b7280',
};

const STATUS_COLORS: Record<string, string> = {
  active: '#22c55e', used: '#f59e0b', discarded: '#ef4444',
  archived: '#9ca3af', contaminated: '#dc2626',
};

const STATUS_LABEL: Record<string, string> = {
  active: 'Activo', used: 'Usado', discarded: 'Descartado',
  archived: 'Archivado', contaminated: 'Contaminado',
};

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  used: 'bg-yellow-100 text-yellow-700',
  discarded: 'bg-red-100 text-red-700',
  archived: 'bg-gray-100 text-gray-600',
  contaminated: 'bg-red-900/20 text-red-800',
};

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [quickSearch, setQuickSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const statsQuery = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const [freezersRes, boxesRes, samplesRes] = await Promise.all([
        supabase.from('freezers').select('id', { count: 'exact', head: true }),
        supabase.from('boxes').select('id', { count: 'exact', head: true }),
        supabase.from('samples').select('id, status, sample_type'),
      ]);
      const sampleData = (samplesRes.data || []) as Array<{ id: string; status: string; sample_type: string }>;
      const activeSamples = sampleData.filter((s) => s.status === 'active').length;
      const byType: Record<string, number> = {};
      const byStatus: Record<string, number> = {};
      sampleData.forEach((s) => {
        byType[s.sample_type] = (byType[s.sample_type] || 0) + 1;
        byStatus[s.status] = (byStatus[s.status] || 0) + 1;
      });
      return {
        totalFreezers: freezersRes.count || 0,
        totalBoxes: boxesRes.count || 0,
        totalSamples: sampleData.length,
        activeSamples,
        byType: Object.entries(byType).map(([name, value]) => ({ name, value })),
        byStatus: Object.entries(byStatus).map(([name, value]) => ({ name, value })),
      };
    },
    enabled: !!user,
  });

  const activityQuery = useQuery({
    queryKey: ['recent-activity'],
    queryFn: async () => {
      const { data } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(8);
      return data || [];
    },
    enabled: !!user,
  });

  const { data: auditProfiles = [] } = useQuery({
    queryKey: ['audit-profiles-dashboard'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name, email');
      return (data || []) as { id: string; full_name: string | null; email: string | null }[];
    },
    enabled: !!user,
  });

  const recentSamplesQuery = useQuery({
    queryKey: ['recent-samples'],
    queryFn: async () => {
      const { data } = await supabase
        .from('samples')
        .select('id, sample_code, sample_type, status, project, box_id, position_label, created_at')
        .order('created_at', { ascending: false })
        .limit(5);
      return (data || []) as any[];
    },
    enabled: !!user,
  });

  // Quick search results
  const quickSearchQuery = useQuery({
    queryKey: ['quick-search', quickSearch],
    queryFn: async () => {
      if (!quickSearch.trim() || quickSearch.length < 2) return [];
      const { data } = await supabase
        .from('samples')
        .select('id, sample_code, sample_type, status, project, box_id, position_label, patient_code')
        .or(`sample_code.ilike.%${quickSearch}%,patient_code.ilike.%${quickSearch}%,project.ilike.%${quickSearch}%`)
        .limit(8);
      return (data || []) as any[];
    },
    enabled: quickSearch.length >= 2 && !!user,
  });

  // Fetch box names for search results
  const boxIdsForSearch = [...new Set((quickSearchQuery.data || []).map((s: any) => s.box_id).filter(Boolean))];
  const boxNamesQuery = useQuery({
    queryKey: ['box-names-for-search', boxIdsForSearch],
    queryFn: async () => {
      if (boxIdsForSearch.length === 0) return {};
      const { data } = await supabase.from('boxes').select('id, name, freezer_id').in('id', boxIdsForSearch);
      const map: Record<string, { name: string; freezer_id: string }> = {};
      (data || []).forEach((b: any) => { map[b.id] = b; });
      return map;
    },
    enabled: boxIdsForSearch.length > 0,
  });

  const stats = statsQuery.data;
  const isLoading = statsQuery.isLoading;

  const statCards = [
    { label: 'Congeladores', value: stats?.totalFreezers ?? 0, icon: Snowflake, color: 'blue', href: '/freezers' },
    { label: 'Cajas', value: stats?.totalBoxes ?? 0, icon: Package2, color: 'cyan', href: '/boxes' },
    { label: 'Muestras totales', value: stats?.totalSamples ?? 0, icon: FlaskConical, color: 'green', href: '/search' },
    { label: 'Muestras activas', value: stats?.activeSamples ?? 0, icon: TrendingUp, color: 'orange', href: '/search' },
  ];

  const cardColors: Record<string, string> = {
    blue: 'border-blue-100 bg-gradient-to-br from-blue-50 to-white',
    cyan: 'border-cyan-100 bg-gradient-to-br from-cyan-50 to-white',
    green: 'border-green-100 bg-gradient-to-br from-green-50 to-white',
    orange: 'border-orange-100 bg-gradient-to-br from-orange-50 to-white',
  };
  const iconColors: Record<string, string> = {
    blue: 'text-blue-600 bg-blue-100',
    cyan: 'text-cyan-600 bg-cyan-100',
    green: 'text-green-600 bg-green-100',
    orange: 'text-orange-600 bg-orange-100',
  };

  return (
    <AppLayout>
      <div className="p-4 lg:p-8 space-y-6 max-w-7xl mx-auto">
        {/* Welcome + search */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Bienvenido</h2>
            <p className="text-gray-500 text-sm mt-0.5">{user?.full_name || user?.email}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Quick Search */}
            <div ref={searchRef} className="relative w-full sm:w-auto">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  ref={inputRef}
                  value={quickSearch}
                  onChange={(e) => { setQuickSearch(e.target.value); setSearchOpen(true); }}
                  onFocus={() => setSearchOpen(true)}
                  placeholder="Buscar muestra rápida..."
                  className="pl-9 pr-8 py-2 w-full sm:w-72 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
                />
                {quickSearch && (
                  <button onClick={() => { setQuickSearch(''); setSearchOpen(false); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Dropdown */}
              {searchOpen && quickSearch.length >= 2 && (
                <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
                  {quickSearchQuery.isLoading ? (
                    <div className="px-4 py-3 text-sm text-gray-400">Buscando...</div>
                  ) : (quickSearchQuery.data || []).length === 0 ? (
                    <div className="px-4 py-3 text-sm text-gray-400">Sin resultados</div>
                  ) : (
                    <div className="max-h-72 overflow-y-auto divide-y divide-gray-50">
                      {(quickSearchQuery.data || []).map((s: any) => {
                        const box = boxNamesQuery.data?.[s.box_id];
                        return (
                          <button
                            key={s.id}
                            onClick={() => {
                              setSearchOpen(false);
                              setQuickSearch('');
                              if (box) navigate(`/box/${s.box_id}`);
                              else navigate('/search');
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50 text-left transition-colors"
                          >
                            <span
                              className="w-2 h-2 rounded-full flex-shrink-0 mt-0.5"
                              style={{ background: STATUS_COLORS[s.status] || '#9ca3af' }}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-mono font-semibold text-gray-900 truncate">{s.sample_code}</p>
                              <p className="text-xs text-gray-400 truncate">
                                {s.sample_type}{s.patient_code ? ` · P: ${s.patient_code}` : ''}{box ? ` · ${box.name}` : ''}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {s.position_label && (
                                <span className="text-xs font-mono bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{s.position_label}</span>
                              )}
                              <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[s.status] || 'bg-gray-100 text-gray-500'}`}>
                                {STATUS_LABEL[s.status] || s.status}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
                    <Link
                      to={`/search?q=${encodeURIComponent(quickSearch)}`}
                      onClick={() => { setSearchOpen(false); setQuickSearch(''); }}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Ver todos los resultados en búsqueda avanzada →
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* QR Scanner button */}
            <button
              onClick={() => setQrOpen(true)}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 shadow-sm transition-colors"
            >
              <QrCode className="w-4 h-4" />
              <span className="hidden sm:inline">Escanear QR</span>
            </button>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map(({ label, value, icon: Icon, color, href }) => (
            <Link
              key={label}
              to={href}
              className={`group border rounded-xl p-5 hover:shadow-md transition-all ${cardColors[color]}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`p-2 rounded-lg ${iconColors[color]}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 transition-colors" />
              </div>
              <p className="text-2xl font-bold text-gray-900 mb-0.5">
                {isLoading ? <span className="inline-block w-10 h-7 bg-gray-200 animate-pulse rounded" /> : value.toLocaleString()}
              </p>
              <p className="text-xs font-medium text-gray-500">{label}</p>
            </Link>
          ))}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Muestras por tipo</h3>
            {stats?.byType && stats.byType.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stats.byType} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {stats.byType.map((entry) => (
                      <Cell key={entry.name} fill={TYPE_COLORS[entry.name] || '#3b82f6'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm">Sin datos aún</div>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Estado de muestras</h3>
            {stats?.byStatus && stats.byStatus.length > 0 ? (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width="55%" height={220}>
                  <PieChart>
                    <Pie data={stats.byStatus} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                      {stats.byStatus.map((entry) => (
                        <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || '#6b7280'} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 flex-1">
                  {stats.byStatus.map((entry) => (
                    <div key={entry.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: STATUS_COLORS[entry.name] || '#6b7280' }} />
                        <span className="text-gray-600 text-xs">{STATUS_LABEL[entry.name] || entry.name}</span>
                      </div>
                      <span className="text-gray-800 font-mono text-xs font-medium">{entry.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm">Sin datos aún</div>
            )}
          </div>
        </div>

        {/* Bottom row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Samples */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-700">Muestras recientes</h3>
              <Link to="/search" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                Ver todas <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="space-y-2">
              {recentSamplesQuery.isLoading
                ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-11 bg-gray-100 animate-pulse rounded-lg" />)
                : recentSamplesQuery.data?.length === 0
                ? <p className="text-gray-400 text-sm py-4 text-center">Sin muestras aún.</p>
                : recentSamplesQuery.data?.map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-gray-50 hover:bg-blue-50/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: STATUS_COLORS[s.status] || '#9ca3af' }} />
                      <div>
                        <p className="text-sm font-mono font-semibold text-gray-900">{s.sample_code}</p>
                        <p className="text-xs text-gray-400 capitalize">{s.sample_type}{s.project ? ` · ${s.project}` : ''}</p>
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[s.status] || 'bg-gray-100 text-gray-500'}`}>
                      {STATUS_LABEL[s.status] || s.status}
                    </span>
                  </div>
                ))}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-700">Actividad reciente</h3>
              <Clock className="w-4 h-4 text-gray-300" />
            </div>
            <div className="space-y-2">
              {activityQuery.isLoading
                ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-11 bg-gray-100 animate-pulse rounded-lg" />)
                : activityQuery.data?.length === 0
                ? <p className="text-gray-400 text-sm py-4 text-center">Sin actividad registrada.</p>
                : activityQuery.data?.map((log: any) => {
                  const formatted = formatAuditLog(log, makeUserMap(auditProfiles));
                  return (
                    <div key={log.id} className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-gray-50">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold mt-0.5 uppercase tracking-wide ${
                        log.action === 'create' ? 'bg-green-100 text-green-700' :
                        log.action === 'update' ? 'bg-blue-100 text-blue-700' :
                        log.action === 'delete' ? 'bg-red-100 text-red-700' :
                        'bg-orange-100 text-orange-700'
                      }`}>{log.action}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700 truncate">{formatted.title}</p>
                        <p className="text-xs text-gray-400 truncate">{formatted.subtitle}</p>
                        <p className="text-xs text-gray-400">{new Date(log.created_at).toLocaleString('es-ES')}</p>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      </div>

      <QrScannerDialog open={qrOpen} onClose={() => setQrOpen(false)} />
    </AppLayout>
  );
}
