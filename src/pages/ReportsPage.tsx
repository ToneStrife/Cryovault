import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Download } from 'lucide-react';
import type { Sample, Freezer, Box } from '@/types';

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

  // Aggregations
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
      <div className="p-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total congeladores', value: freezers.length },
            { label: 'Total cajas', value: boxes.length },
            { label: 'Total muestras', value: samples.length },
            { label: 'Muestras activas', value: activeSamples.length },
          ].map(({ label, value }) => (
            <div key={label} className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
              <p className="text-slate-400 text-sm mb-1">{label}</p>
              <p className="text-3xl font-bold text-white">{value}</p>
            </div>
          ))}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
            <h3 className="text-white font-semibold mb-4">Muestras por tipo</h3>
            {byType.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={byType} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {byType.map((e) => <Cell key={e.name} fill={TYPE_COLORS[e.name] || '#3b82f6'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-slate-500 text-sm">Sin datos</div>
            )}
          </div>
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
            <h3 className="text-white font-semibold mb-4">Estado de muestras</h3>
            {byStatus.length > 0 ? (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width="55%" height={220}>
                  <PieChart>
                    <Pie data={byStatus} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                      {byStatus.map((e) => <Cell key={e.name} fill={STATUS_COLORS[e.name] || '#6b7280'} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 flex-1">
                  {byStatus.map((e) => (
                    <div key={e.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ background: STATUS_COLORS[e.name] || '#6b7280' }} />
                        <span className="text-slate-300 capitalize">{e.name}</span>
                      </div>
                      <span className="text-slate-400 font-mono">{e.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-slate-500 text-sm">Sin datos</div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
          <div className="flex border-b border-slate-700 bg-slate-900/50">
            {TABS.map((tab, i) => (
              <button
                key={tab}
                onClick={() => setActiveTab(i)}
                className={`px-5 py-3 text-sm font-medium transition-colors ${
                  activeTab === i
                    ? 'text-white border-b-2 border-blue-500'
                    : 'text-slate-400 hover:text-white'
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
                    className="border-slate-600 text-slate-300 hover:bg-slate-700 text-sm"
                  >
                    <Download className="w-4 h-4" /> Exportar CSV
                  </Button>
                </div>
                <p className="text-slate-400 text-sm">{samples.length} muestras en el inventario</p>
                <div className="mt-3 space-y-1.5 max-h-64 overflow-y-auto">
                  {samples.slice(0, 50).map((s) => (
                    <div key={s.id} className="flex items-center gap-4 px-3 py-2 rounded-lg bg-slate-900/50 text-sm">
                      <span className="font-mono text-white w-32 flex-shrink-0">{s.sample_code}</span>
                      <span className="text-slate-400 capitalize">{s.sample_type}</span>
                      <span className="text-slate-500">{s.project || '—'}</span>
                      <span className={`ml-auto text-xs px-2 py-0.5 rounded-full capitalize font-medium ${
                        { active: 'bg-green-500/20 text-green-400', used: 'bg-yellow-500/20 text-yellow-400', discarded: 'bg-red-500/20 text-red-400', archived: 'bg-slate-500/20 text-slate-400', contaminated: 'bg-red-700/20 text-red-500' }[s.status] || ''
                      }`}>{s.status}</span>
                    </div>
                  ))}
                  {samples.length > 50 && (
                    <p className="text-slate-500 text-xs text-center py-2">... y {samples.length - 50} más. Exportar CSV para ver todas.</p>
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
                    className="border-slate-600 text-slate-300 hover:bg-slate-700 text-sm"
                  >
                    <Download className="w-4 h-4" /> Exportar CSV
                  </Button>
                </div>
                <div className="space-y-2">
                  {byType.map((t) => (
                    <div key={t.name} className="flex items-center gap-4 px-3 py-2 rounded-lg bg-slate-900/50">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: TYPE_COLORS[t.name] || '#3b82f6' }} />
                      <span className="text-slate-300 capitalize flex-1">{t.name}</span>
                      <span className="font-mono text-white">{t.value}</span>
                      <span className="text-slate-500 text-sm w-12 text-right">
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
                    className="border-slate-600 text-slate-300 hover:bg-slate-700 text-sm"
                  >
                    <Download className="w-4 h-4" /> Exportar CSV
                  </Button>
                </div>
                <div className="space-y-2">
                  {byStatus.map((s) => (
                    <div key={s.name} className="flex items-center gap-4 px-3 py-2 rounded-lg bg-slate-900/50">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: STATUS_COLORS[s.name] || '#6b7280' }} />
                      <span className="text-slate-300 capitalize flex-1">{s.name}</span>
                      <span className="font-mono text-white">{s.value}</span>
                      <span className="text-slate-500 text-sm w-12 text-right">
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
                      auditLogs.map((l: any) => ({
                        fecha: l.created_at,
                        usuario: l.user_id,
                        entidad: l.entity_type,
                        id_entidad: l.entity_id,
                        accion: l.action,
                      })),
                      'auditoria.csv'
                    )}
                    variant="outline"
                    className="border-slate-600 text-slate-300 hover:bg-slate-700 text-sm"
                  >
                    <Download className="w-4 h-4" /> Exportar CSV
                  </Button>
                </div>
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {auditLogs.length === 0 ? (
                    <p className="text-slate-500 text-sm text-center py-4">Sin registros de auditoría</p>
                  ) : (
                    auditLogs.map((log: any) => (
                      <div key={log.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-900/50 text-sm">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          log.action === 'create' ? 'bg-green-500/20 text-green-400' :
                          log.action === 'update' ? 'bg-blue-500/20 text-blue-400' :
                          log.action === 'delete' ? 'bg-red-500/20 text-red-400' :
                          'bg-orange-500/20 text-orange-400'
                        }`}>{log.action}</span>
                        <span className="text-slate-400 capitalize">{log.entity_type}</span>
                        <span className="text-slate-500 font-mono text-xs">{log.entity_id.slice(0, 8)}...</span>
                        <span className="ml-auto text-slate-500 text-xs">{new Date(log.created_at).toLocaleString('es-ES')}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
