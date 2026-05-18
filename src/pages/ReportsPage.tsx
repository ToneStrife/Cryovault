import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Download } from 'lucide-react';
import type { Sample, Freezer, Box } from '@/types';
import { formatAuditLog, makeUserMap } from '@/lib/auditFormat';

const TABS = ['Inventario', 'Por tipo', 'Por estado', 'Auditoría'];

const STATUS_COLORS: Record<string, string> = {
  active: '#22c55e',
  used: '#f59e0b',
  discarded: '#ef4444',
  archived: '#6b7280',
  contaminated: '#dc2626',
};

const TYPE_COLORS: Record<string, string> = {
  blood: '#ef4444', serum: '#f97316', plasma: '#eab308', tissue: '#22c55e',
  dna: '#06b6d4', rna: '#3b82f6', urine: '#a855f7', csf: '#ec4899',
  saliva: '#14b8a6', protein: '#f59e0b', other: '#6b7280',
};

function downloadCSV(rows: any[], filename: string) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const csv = [
    keys.join(','),
    ...rows.map((r) => keys.map((k) => JSON.stringify(r[k] ?? '')).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ReportsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState(0);

  const { data: samples = [] } = useQuery({
    queryKey: ['samples-report'],
    queryFn: async () => {
      const { data } = await supabase.from('samples').select('*').order('created_at', { ascending: false });
      return (data || []) as Sample[];
    },
    enabled: !!user,
  });

  const { data: freezers = [] } = useQuery({
    queryKey: ['freezers-report'],
    queryFn: async () => {
      const { data } = await supabase.from('freezers').select('*').order('name');
      return (data || []) as Freezer[];
    },
    enabled: !!user,
  });

  const { data: boxes = [] } = useQuery({
    queryKey: ['boxes-report'],
    queryFn: async () => {
      const { data } = await supabase.from('boxes').select('*').order('name');
      return (data || []) as Box[];
    },
    enabled: !!user,
  });

  const { data: auditLogs = [] } = useQuery({
    queryKey: ['audit-report'],
    queryFn: async () => {
      const { data } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      return (data || []) as any[];
    },
    enabled: !!user,
  });

  const { data: auditProfiles = [] } = useQuery({
    queryKey: ['audit-profiles-report'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name, email');
      return (data || []) as { id: string; full_name: string | null; email: string | null }[];
    },
    enabled: !!user,
  });

  const auditUserMap = makeUserMap(auditProfiles);

  const byType = Object.entries(
    samples.reduce((acc, s) => {
      acc[s.sample_type] = (acc[s.sample_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  const byStatus = Object.entries(
    samples.reduce((acc, s) => {
      acc[s.status] = (acc[s.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name, value }));

  const activeSamples = samples.filter((s) => s.status === 'active');

  return (
    <AppLayout>
      <div className="min-h-full bg-gray-50">
        <div className="bg-white border-b border-gray-200 px-8 py-6">
          <h1 className="text-2xl font-bold text-gray-900">Informes</h1>
          <p className="text-sm text-gray-500 mt-0.5">Estadísticas e informes del inventario</p>
        </div>

        <div className="px-8 py-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Total congeladores', value: freezers.length, color: 'from-blue-500 to-cyan-500' },
              { label: 'Total cajas', value: boxes.length, color: 'from-teal-500 to-emerald-500' },
              { label: 'Total muestras', value: samples.length, color: 'from-orange-500 to-amber-500' },
              { label: 'Muestras activas', value: activeSamples.length, color: 'from-green-500 to-emerald-600' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <p className="text-gray-500 text-sm mb-1">{label}</p>
                <p className={`text-3xl font-bold bg-gradient-to-r ${color} bg-clip-text text-transparent`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <h3 className="text-gray-900 font-semibold mb-4">Muestras por tipo</h3>
              {byType.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={byType} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, color: '#111827' }} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {byType.map((e) => <Cell key={e.name} fill={TYPE_COLORS[e.name] || '#3b82f6'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm">Sin datos</div>
              )}
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <h3 className="text-gray-900 font-semibold mb-4">Estado de muestras</h3>
              {byStatus.length > 0 ? (
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width="55%" height={220}>
                    <PieChart>
                      <Pie data={byStatus} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                        {byStatus.map((e) => <Cell key={e.name} fill={STATUS_COLORS[e.name] || '#6b7280'} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, color: '#111827' }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 flex-1">
                    {byStatus.map((e) => (
                      <div key={e.name} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full" style={{ background: STATUS_COLORS[e.name] || '#6b7280' }} />
                          <span className="text-gray-600 capitalize">{e.name}</span>
                        </div>
                        <span className="text-gray-500 font-mono">{e.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm">Sin datos</div>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <div className="flex border-b border-gray-200 bg-gray-50">
              {TABS.map((tab, i) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(i)}
                  className={`px-5 py-3 text-sm font-medium transition-colors ${
                    activeTab === i
                      ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="p-4">
              {activeTab === 0 && (
                <div>
                  <div className="flex justify-end mb-4">
                    <Button
                      onClick={() => downloadCSV(
                        samples.map((s) => ({
                          codigo: s.sample_code,
                          paciente: s.patient_code || '',
                          proyecto: s.project || '',
                          tipo: s.sample_type,
                          estado: s.status,
                          volumen: s.volume || '',
                          unidades: s.units,
                          thaws: s.thaw_count,
                          max_thaws: s.max_thaws,
                          fecha_congelacion: s.freeze_date || '',
                          posicion: s.position_label || '',
                          notas: s.notes || '',
                        })),
                        'inventario_muestras.csv'
                      )}
                      variant="outline"
                      className="border-gray-200 text-gray-600 hover:bg-gray-50 text-sm"
                    >
                      <Download className="w-4 h-4" /> Exportar CSV
                    </Button>
                  </div>
                  <p className="text-gray-500 text-sm">{samples.length} muestras en el inventario</p>
                  <div className="mt-3 space-y-1.5 max-h-64 overflow-y-auto">
                    {samples.slice(0, 50).map((s) => (
                      <div key={s.id} className="flex items-center gap-4 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100 text-sm">
                        <span className="font-mono text-gray-900 w-32 flex-shrink-0">{s.sample_code}</span>
                        <span className="text-gray-600 capitalize">{s.sample_type}</span>
                        <span className="text-gray-400">{s.project || '—'}</span>
                        <span className={`ml-auto text-xs px-2 py-0.5 rounded-full capitalize font-medium ${
                          { active: 'bg-green-100 text-green-700', used: 'bg-yellow-100 text-yellow-700', discarded: 'bg-red-100 text-red-700', archived: 'bg-gray-100 text-gray-500', contaminated: 'bg-red-100 text-red-700' }[s.status] || ''
                        }`}>{s.status}</span>
                      </div>
                    ))}
                    {samples.length > 50 && (
                      <p className="text-gray-400 text-xs text-center py-2">... y {samples.length - 50} más. Exportar CSV para ver todas.</p>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 1 && (
                <div>
                  <div className="flex justify-end mb-4">
                    <Button
                      onClick={() => downloadCSV(byType, 'muestras_por_tipo.csv')}
                      variant="outline"
                      className="border-gray-200 text-gray-600 hover:bg-gray-50 text-sm"
                    >
                      <Download className="w-4 h-4" /> Exportar CSV
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {byType.map((t) => (
                      <div key={t.name} className="flex items-center gap-4 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: TYPE_COLORS[t.name] || '#3b82f6' }} />
                        <span className="text-gray-700 capitalize flex-1">{t.name}</span>
                        <span className="font-mono text-gray-900">{t.value}</span>
                        <span className="text-gray-400 text-sm w-12 text-right">
                          {samples.length ? Math.round((t.value / samples.length) * 100) : 0}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 2 && (
                <div>
                  <div className="flex justify-end mb-4">
                    <Button
                      onClick={() => downloadCSV(byStatus, 'muestras_por_estado.csv')}
                      variant="outline"
                      className="border-gray-200 text-gray-600 hover:bg-gray-50 text-sm"
                    >
                      <Download className="w-4 h-4" /> Exportar CSV
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {byStatus.map((s) => (
                      <div key={s.name} className="flex items-center gap-4 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: STATUS_COLORS[s.name] || '#6b7280' }} />
                        <span className="text-gray-700 capitalize flex-1">{s.name}</span>
                        <span className="font-mono text-gray-900">{s.value}</span>
                        <span className="text-gray-400 text-sm w-12 text-right">
                          {samples.length ? Math.round((s.value / samples.length) * 100) : 0}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 3 && (
                <div>
                  <div className="flex justify-end mb-4">
                    <Button
                      onClick={() => downloadCSV(
                        auditLogs.map((l: any) => {
                          const formatted = formatAuditLog(l, auditUserMap);
                          return {
                          fecha: l.created_at,
                          usuario: formatted.actor,
                          entidad: formatted.entity,
                          nombre: formatted.name,
                          id_entidad: l.entity_id,
                          accion: l.action,
                          cambios: formatted.changes.join(' | '),
                        };
                        }),
                        'auditoria.csv'
                      )}
                      variant="outline"
                      className="border-gray-200 text-gray-600 hover:bg-gray-50 text-sm"
                    >
                      <Download className="w-4 h-4" /> Exportar CSV
                    </Button>
                  </div>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {auditLogs.length === 0 ? (
                      <p className="text-gray-400 text-sm text-center py-4">Sin registros de auditoría</p>
                    ) : (
                      auditLogs.map((log: any) => {
                        const formatted = formatAuditLog(log, auditUserMap);
                        return (
                          <div key={log.id} className="flex items-start gap-3 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100 text-sm">
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium mt-0.5 ${
                              log.action === 'create' ? 'bg-green-100 text-green-700' :
                              log.action === 'update' ? 'bg-blue-100 text-blue-700' :
                              log.action === 'delete' ? 'bg-red-100 text-red-700' :
                              'bg-orange-100 text-orange-700'
                            }`}>{log.action}</span>
                            <div className="min-w-0 flex-1">
                              <p className="text-gray-700 font-medium truncate">{formatted.title}</p>
                              <p className="text-gray-400 text-xs truncate">{formatted.subtitle}</p>
                            </div>
                            <span className="text-gray-400 text-xs whitespace-nowrap">{new Date(log.created_at).toLocaleString('es-ES')}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
