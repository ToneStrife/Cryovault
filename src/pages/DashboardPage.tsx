import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { AppLayout } from '@/components/AppLayout';
import { Snowflake, Box, Beaker, TrendingUp, ArrowRight, Clock } from 'lucide-react';

const SAMPLE_TYPE_COLORS: Record<string, string> = {
  blood: '#ef4444',
  serum: '#f97316',
  plasma: '#eab308',
  tissue: '#22c55e',
  dna: '#06b6d4',
  rna: '#3b82f6',
  urine: '#a855f7',
  csf: '#ec4899',
  saliva: '#14b8a6',
  protein: '#f59e0b',
  other: '#6b7280',
};

const STATUS_COLORS: Record<string, string> = {
  active: '#22c55e',
  used: '#f59e0b',
  discarded: '#ef4444',
  archived: '#6b7280',
  contaminated: '#dc2626',
};

export function DashboardPage() {
  const { user } = useAuth();

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

      // group by type
      const byType: Record<string, number> = {};
      sampleData.forEach((s) => {
        byType[s.sample_type] = (byType[s.sample_type] || 0) + 1;
      });

      // group by status
      const byStatus: Record<string, number> = {};
      sampleData.forEach((s) => {
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
      const { data } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(8);
      return data || [];
    },
    enabled: !!user,
  });

  const recentSamplesQuery = useQuery({
    queryKey: ['recent-samples'],
    queryFn: async () => {
      const { data } = await supabase
        .from('samples')
        .select('id, sample_code, sample_type, status, project, created_at')
        .order('created_at', { ascending: false })
        .limit(5);
      return (data || []) as Array<{ id: string; sample_code: string; sample_type: string; status: string; project: string | null; created_at: string }>;
    },
    enabled: !!user,
  });

  const stats = statsQuery.data;
  const isLoading = statsQuery.isLoading;

  const statCards = [
    {
      label: 'Congeladores',
      value: stats?.totalFreezers ?? 0,
      icon: Snowflake,
      color: 'blue',
      href: '/freezers',
    },
    {
      label: 'Cajas de muestras',
      value: stats?.totalBoxes ?? 0,
      icon: Box,
      color: 'cyan',
      href: '/freezers',
    },
    {
      label: 'Muestras totales',
      value: stats?.totalSamples ?? 0,
      icon: Beaker,
      color: 'green',
      href: '/samples',
    },
    {
      label: 'Muestras activas',
      value: stats?.activeSamples ?? 0,
      icon: TrendingUp,
      color: 'orange',
      href: '/samples',
    },
  ];

  const colorMap: Record<string, string> = {
    blue: 'from-blue-500/20 to-blue-600/10 border-blue-500/20 text-blue-400',
    cyan: 'from-cyan-500/20 to-cyan-600/10 border-cyan-500/20 text-cyan-400',
    green: 'from-green-500/20 to-green-600/10 border-green-500/20 text-green-400',
    orange: 'from-orange-500/20 to-orange-600/10 border-orange-500/20 text-orange-400',
  };

  return (
    <AppLayout>
      <div className="p-8 space-y-8">
        {/* Welcome */}
        <div>
          <p className="text-slate-400 text-sm">
            Bienvenido,{' '}
            <span className="text-white font-medium">{user?.full_name || user?.email}</span>
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map(({ label, value, icon: Icon, color, href }) => (
            <Link
              key={label}
              to={href}
              className={`group bg-gradient-to-br ${colorMap[color]} border rounded-xl p-5 hover:scale-[1.02] transition-transform`}
            >
              <div className="flex items-start justify-between mb-3">
                <p className="text-slate-400 text-sm font-medium">{label}</p>
                <Icon className={`w-5 h-5 ${colorMap[color].split(' ')[3]}`} />
              </div>
              <p className="text-3xl font-bold text-white">
                {isLoading ? (
                  <span className="inline-block w-12 h-8 bg-slate-700 animate-pulse rounded" />
                ) : (
                  value.toLocaleString()
                )}
              </p>
            </Link>
          ))}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* By Type */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
            <h3 className="text-white font-semibold mb-4">Muestras por tipo</h3>
            {stats?.byType && stats.byType.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stats.byType} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                    labelStyle={{ color: '#e2e8f0' }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {stats.byType.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={SAMPLE_TYPE_COLORS[entry.name] || '#3b82f6'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-slate-500 text-sm">
                Sin datos aún
              </div>
            )}
          </div>

          {/* By Status */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
            <h3 className="text-white font-semibold mb-4">Estado de muestras</h3>
            {stats?.byStatus && stats.byStatus.length > 0 ? (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width="55%" height={220}>
                  <PieChart>
                    <Pie
                      data={stats.byStatus}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {stats.byStatus.map((entry) => (
                        <Cell
                          key={entry.name}
                          fill={STATUS_COLORS[entry.name] || '#6b7280'}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                      labelStyle={{ color: '#e2e8f0' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 flex-1">
                  {stats.byStatus.map((entry) => (
                    <div key={entry.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ background: STATUS_COLORS[entry.name] || '#6b7280' }}
                        />
                        <span className="text-slate-300 capitalize">{entry.name}</span>
                      </div>
                      <span className="text-slate-400 font-mono">{entry.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-slate-500 text-sm">
                Sin datos aún
              </div>
            )}
          </div>
        </div>

        {/* Bottom Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Samples */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Muestras recientes</h3>
              <Link to="/samples" className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
                Ver todas <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="space-y-3">
              {recentSamplesQuery.isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-12 bg-slate-700/50 animate-pulse rounded-lg" />
                ))
              ) : recentSamplesQuery.data?.length === 0 ? (
                <p className="text-slate-500 text-sm py-4 text-center">
                  No hay muestras aún.{' '}
                  <Link to="/samples" className="text-cyan-400">
                    Añadir primera muestra
                  </Link>
                </p>
              ) : (
                recentSamplesQuery.data?.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-slate-900/50 hover:bg-slate-700/40 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: STATUS_COLORS[s.status] || '#6b7280' }}
                      />
                      <div>
                        <p className="text-white text-sm font-mono">{s.sample_code}</p>
                        <p className="text-slate-400 text-xs capitalize">{s.sample_type} · {s.project || 'Sin proyecto'}</p>
                      </div>
                    </div>
                    <span
                      className="text-xs px-2 py-1 rounded capitalize"
                      style={{
                        background: `${STATUS_COLORS[s.status]}20`,
                        color: STATUS_COLORS[s.status] || '#6b7280',
                      }}
                    >
                      {s.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Actividad reciente</h3>
              <Clock className="w-4 h-4 text-slate-400" />
            </div>
            <div className="space-y-3">
              {activityQuery.isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-12 bg-slate-700/50 animate-pulse rounded-lg" />
                ))
              ) : activityQuery.data?.length === 0 ? (
                <p className="text-slate-500 text-sm py-4 text-center">
                  No hay actividad registrada aún.
                </p>
              ) : (
                activityQuery.data?.map((log: any) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-slate-900/50"
                  >
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded font-medium mt-0.5 ${
                        log.action === 'create'
                          ? 'bg-green-500/20 text-green-400'
                          : log.action === 'update'
                          ? 'bg-blue-500/20 text-blue-400'
                          : log.action === 'delete'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-orange-500/20 text-orange-400'
                      }`}
                    >
                      {log.action}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-300 text-sm capitalize">
                        {log.entity_type}{' '}
                        <span className="text-slate-500 font-mono text-xs">
                          {log.entity_id.slice(0, 8)}...
                        </span>
                      </p>
                      <p className="text-slate-500 text-xs">
                        {new Date(log.created_at).toLocaleString('es-ES')}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
