import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Save, CircleCheck as CheckCircle } from 'lucide-react';
import type { Settings } from '@/types';

export function SettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);

  const [form, setForm] = useState({
    default_sample_type: 'blood',
    default_temperature: '-80',
    default_box_rows: '9',
    default_box_columns: '9',
    default_max_thaws: '3',
    language: 'es',
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data } = await supabase
        .from('settings')
        .select('*')
        .eq('laboratory', user?.laboratory || 'default_lab')
        .maybeSingle();
      return data as Settings | null;
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (settings) {
      setForm({
        default_sample_type: settings.default_sample_type || 'blood',
        default_temperature: String(settings.default_temperature || -80),
        default_box_rows: String(settings.default_box_rows || 9),
        default_box_columns: String(settings.default_box_columns || 9),
        default_max_thaws: String(settings.default_max_thaws || 3),
        language: settings.language || 'es',
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        laboratory: user!.laboratory,
        default_sample_type: form.default_sample_type,
        default_temperature: parseInt(form.default_temperature),
        default_box_rows: parseInt(form.default_box_rows),
        default_box_columns: parseInt(form.default_box_columns),
        default_max_thaws: parseInt(form.default_max_thaws),
        language: form.language as 'es' | 'en' | 'pt',
      };
      if (settings?.id) {
        const { error } = await (supabase.from('settings') as any)
          .update(payload)
          .eq('id', settings.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from('settings') as any).insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const f = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <AppLayout>
      <div className="p-8 max-w-2xl">
        <div className="space-y-6">
          {/* Lab info */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
            <h2 className="text-white font-semibold mb-4">Información del laboratorio</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Laboratorio</label>
                <p className="text-white font-mono text-sm">{user?.laboratory}</p>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Rol actual</label>
                <span className="text-sm px-2 py-1 rounded bg-blue-500/20 text-blue-400 capitalize">
                  {user?.role}
                </span>
              </div>
            </div>
          </div>

          {/* Defaults */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
            <h2 className="text-white font-semibold mb-4">Valores por defecto</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-slate-300 block mb-1.5">Tipo de muestra por defecto</label>
                  <select
                    value={form.default_sample_type}
                    onChange={(e) => f('default_sample_type', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 text-white rounded-md text-sm"
                    disabled={user?.role === 'read_only'}
                  >
                    {['tissue', 'blood', 'serum', 'plasma', 'urine', 'csf', 'saliva', 'dna', 'rna', 'protein', 'other'].map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-slate-300 block mb-1.5">Temperatura por defecto (°C)</label>
                  <Input
                    type="number"
                    value={form.default_temperature}
                    onChange={(e) => f('default_temperature', e.target.value)}
                    className="bg-slate-900 border-slate-600 text-white"
                    disabled={user?.role === 'read_only'}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm text-slate-300 block mb-1.5">Filas de caja</label>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={form.default_box_rows}
                    onChange={(e) => f('default_box_rows', e.target.value)}
                    className="bg-slate-900 border-slate-600 text-white"
                    disabled={user?.role === 'read_only'}
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-300 block mb-1.5">Columnas de caja</label>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={form.default_box_columns}
                    onChange={(e) => f('default_box_columns', e.target.value)}
                    className="bg-slate-900 border-slate-600 text-white"
                    disabled={user?.role === 'read_only'}
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-300 block mb-1.5">Máx. thaws por defecto</label>
                  <Input
                    type="number"
                    min={1}
                    value={form.default_max_thaws}
                    onChange={(e) => f('default_max_thaws', e.target.value)}
                    className="bg-slate-900 border-slate-600 text-white"
                    disabled={user?.role === 'read_only'}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-slate-300 block mb-1.5">Idioma</label>
                  <select
                    value={form.language}
                    onChange={(e) => f('language', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 text-white rounded-md text-sm"
                    disabled={user?.role === 'read_only'}
                  >
                    <option value="es">Español</option>
                    <option value="en">English</option>
                    <option value="pt">Português</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {user?.role !== 'read_only' && (
            <div className="flex items-center gap-3">
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white"
              >
                <Save className="w-4 h-4" />
                {saveMutation.isPending ? 'Guardando...' : 'Guardar configuración'}
              </Button>
              {saved && (
                <span className="text-green-400 text-sm flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4" /> Guardado
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
