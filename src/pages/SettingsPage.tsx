import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Save, CircleCheck as CheckCircle, Plus, Trash2 } from 'lucide-react';
import {
  BOX_STATUS_LABEL,
  BOX_TYPE_LABEL,
  DEFAULT_BOX_STATUSES,
  DEFAULT_BOX_TYPES,
  DEFAULT_SAMPLE_STATUSES,
  DEFAULT_SAMPLE_TYPES,
  DEFAULT_UNIT_TYPES,
  SAMPLE_STATUS_LABEL,
  SAMPLE_TYPE_LABEL,
  cleanOptions,
  labelOption,
} from '@/lib/settingsOptions';
import { PAGE_HEADER, PAGE_BODY } from '@/lib/layout';
import { LabDataSection } from '@/components/settings/LabDataSection';
import type { Settings } from '@/types';

type OptionListKey = 'sample_types' | 'sample_statuses' | 'box_types' | 'box_statuses' | 'unit_types';

interface OptionListEditorProps {
  title: string;
  description: string;
  values: string[];
  labels?: Record<string, string>;
  disabled: boolean;
  onChange: (values: string[]) => void;
}

function OptionListEditor({ title, description, values, labels = {}, disabled, onChange }: OptionListEditorProps) {
  const update = (index: number, value: string) => {
    onChange(values.map((item, i) => (i === index ? value : item)));
  };

  const remove = (index: number) => {
    if (values.length <= 1) return;
    onChange(values.filter((_, i) => i !== index));
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onChange([...values, ''])}
          className="text-gray-700"
        >
          <Plus className="w-3.5 h-3.5" />
          Añadir
        </Button>
      </div>
      <div className="space-y-2">
        {values.map((value, index) => (
          <div key={`${title}-${index}`} className="flex items-center gap-2">
            <Input
              value={value}
              onChange={(e) => update(index, e.target.value)}
              placeholder="valor"
              className="bg-white border-gray-200 text-gray-900 font-mono text-sm"
              disabled={disabled}
            />
            <span className="hidden sm:block min-w-28 text-xs text-gray-500">
              {value ? labelOption(value, labels) : 'Nuevo valor'}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || values.length <= 1}
              onClick={() => remove(index)}
              className="border-gray-300 text-gray-500 hover:text-red-600"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const canEdit = user?.role === 'admin';

  const [form, setForm] = useState({
    default_sample_type: DEFAULT_SAMPLE_TYPES[0],
    default_sample_status: DEFAULT_SAMPLE_STATUSES[0],
    default_temperature: '-80',
    default_box_rows: '9',
    default_box_columns: '9',
    default_box_type: DEFAULT_BOX_TYPES[0],
    default_box_status: DEFAULT_BOX_STATUSES[0],
    default_max_thaws: '3',
    default_units: DEFAULT_UNIT_TYPES[0],
    sample_types: DEFAULT_SAMPLE_TYPES,
    sample_statuses: DEFAULT_SAMPLE_STATUSES,
    box_types: DEFAULT_BOX_TYPES,
    box_statuses: DEFAULT_BOX_STATUSES,
    unit_types: DEFAULT_UNIT_TYPES,
    language: 'es',
  });

  const { data: settings } = useQuery({
    queryKey: ['settings', user?.laboratory || 'default_lab'],
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
      const sampleTypes = cleanOptions(settings.sample_types || DEFAULT_SAMPLE_TYPES, DEFAULT_SAMPLE_TYPES);
      const sampleStatuses = cleanOptions(settings.sample_statuses || DEFAULT_SAMPLE_STATUSES, DEFAULT_SAMPLE_STATUSES);
      const boxTypes = cleanOptions(settings.box_types || DEFAULT_BOX_TYPES, DEFAULT_BOX_TYPES);
      const boxStatuses = cleanOptions(settings.box_statuses || DEFAULT_BOX_STATUSES, DEFAULT_BOX_STATUSES);
      const unitTypes = cleanOptions(settings.unit_types || DEFAULT_UNIT_TYPES, DEFAULT_UNIT_TYPES);
      setForm({
        default_sample_type: sampleTypes.includes(settings.default_sample_type) ? settings.default_sample_type : sampleTypes[0],
        default_sample_status: sampleStatuses.includes(settings.default_sample_status) ? settings.default_sample_status : sampleStatuses[0],
        default_temperature: String(settings.default_temperature || -80),
        default_box_rows: String(settings.default_box_rows || 9),
        default_box_columns: String(settings.default_box_columns || 9),
        default_box_type: boxTypes.includes(settings.default_box_type) ? settings.default_box_type : boxTypes[0],
        default_box_status: boxStatuses.includes(settings.default_box_status) ? settings.default_box_status : boxStatuses[0],
        default_max_thaws: String(settings.default_max_thaws || 3),
        default_units: unitTypes.includes(settings.default_units) ? settings.default_units : unitTypes[0],
        sample_types: sampleTypes,
        sample_statuses: sampleStatuses,
        box_types: boxTypes,
        box_statuses: boxStatuses,
        unit_types: unitTypes,
        language: settings.language || 'es',
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const sampleTypes = cleanOptions(form.sample_types, DEFAULT_SAMPLE_TYPES);
      const sampleStatuses = cleanOptions(form.sample_statuses, DEFAULT_SAMPLE_STATUSES);
      const boxTypes = cleanOptions(form.box_types, DEFAULT_BOX_TYPES);
      const boxStatuses = cleanOptions(form.box_statuses, DEFAULT_BOX_STATUSES);
      const unitTypes = cleanOptions(form.unit_types, DEFAULT_UNIT_TYPES);
      const payload = {
        laboratory: user!.laboratory,
        default_sample_type: sampleTypes.includes(form.default_sample_type) ? form.default_sample_type : sampleTypes[0],
        default_sample_status: sampleStatuses.includes(form.default_sample_status) ? form.default_sample_status : sampleStatuses[0],
        default_temperature: parseInt(form.default_temperature),
        default_box_rows: parseInt(form.default_box_rows),
        default_box_columns: parseInt(form.default_box_columns),
        default_box_type: boxTypes.includes(form.default_box_type) ? form.default_box_type : boxTypes[0],
        default_box_status: boxStatuses.includes(form.default_box_status) ? form.default_box_status : boxStatuses[0],
        default_max_thaws: parseInt(form.default_max_thaws),
        default_units: unitTypes.includes(form.default_units) ? form.default_units : unitTypes[0],
        sample_types: sampleTypes,
        sample_statuses: sampleStatuses,
        box_types: boxTypes,
        box_statuses: boxStatuses,
        unit_types: unitTypes,
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
  const setList = (key: OptionListKey, values: string[]) => setForm((prev) => ({ ...prev, [key]: values }));

  return (
    <AppLayout>
      <div className="min-h-full bg-gray-50">
        <div className={`bg-white border-b border-gray-200 ${PAGE_HEADER} py-6`}>
          <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
          <p className="text-sm text-gray-500 mt-0.5">Ajustes del laboratorio y valores por defecto</p>
        </div>

        <div className={`${PAGE_BODY} max-w-5xl`}>
          <div className="space-y-6">
            {/* Lab info */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <h2 className="text-gray-900 font-semibold mb-4">Información del laboratorio</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Laboratorio</label>
                  <p className="text-gray-900 font-mono text-sm">{user?.laboratory}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Rol actual</label>
                  <span className="text-sm px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 capitalize">
                    {user?.role}
                  </span>
                </div>
              </div>
              {!canEdit && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-4">
                  Solo los administradores pueden modificar estos valores.
                </p>
              )}
            </div>

            {/* Defaults */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <h2 className="text-gray-900 font-semibold mb-4">Valores por defecto</h2>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-700 block mb-1.5">Tipo de muestra por defecto</label>
                    <select
                      value={form.default_sample_type}
                      onChange={(e) => f('default_sample_type', e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={!canEdit}
                    >
                      {cleanOptions(form.sample_types, DEFAULT_SAMPLE_TYPES).map((t) => (
                        <option key={t} value={t}>{labelOption(t, SAMPLE_TYPE_LABEL)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm text-gray-700 block mb-1.5">Temperatura por defecto (°C)</label>
                    <Input
                      type="number"
                      value={form.default_temperature}
                      onChange={(e) => f('default_temperature', e.target.value)}
                      className="bg-white border-gray-200 text-gray-900"
                      disabled={!canEdit}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm text-gray-700 block mb-1.5">Filas de caja</label>
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={form.default_box_rows}
                      onChange={(e) => f('default_box_rows', e.target.value)}
                      className="bg-white border-gray-200 text-gray-900"
                      disabled={!canEdit}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-700 block mb-1.5">Columnas de caja</label>
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={form.default_box_columns}
                      onChange={(e) => f('default_box_columns', e.target.value)}
                      className="bg-white border-gray-200 text-gray-900"
                      disabled={!canEdit}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-700 block mb-1.5">Máx. thaws por defecto</label>
                    <Input
                      type="number"
                      min={1}
                      value={form.default_max_thaws}
                      onChange={(e) => f('default_max_thaws', e.target.value)}
                      className="bg-white border-gray-200 text-gray-900"
                      disabled={!canEdit}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-700 block mb-1.5">Estado de muestra por defecto</label>
                    <select
                      value={form.default_sample_status}
                      onChange={(e) => f('default_sample_status', e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={!canEdit}
                    >
                      {cleanOptions(form.sample_statuses, DEFAULT_SAMPLE_STATUSES).map((s) => (
                        <option key={s} value={s}>{labelOption(s, SAMPLE_STATUS_LABEL)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm text-gray-700 block mb-1.5">Unidad por defecto</label>
                    <select
                      value={form.default_units}
                      onChange={(e) => f('default_units', e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={!canEdit}
                    >
                      {cleanOptions(form.unit_types, DEFAULT_UNIT_TYPES).map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-700 block mb-1.5">Tipo de caja por defecto</label>
                    <select
                      value={form.default_box_type}
                      onChange={(e) => f('default_box_type', e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={!canEdit}
                    >
                      {cleanOptions(form.box_types, DEFAULT_BOX_TYPES).map((t) => (
                        <option key={t} value={t}>{labelOption(t, BOX_TYPE_LABEL)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm text-gray-700 block mb-1.5">Estado de caja por defecto</label>
                    <select
                      value={form.default_box_status}
                      onChange={(e) => f('default_box_status', e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={!canEdit}
                    >
                      {cleanOptions(form.box_statuses, DEFAULT_BOX_STATUSES).map((s) => (
                        <option key={s} value={s}>{labelOption(s, BOX_STATUS_LABEL)}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-700 block mb-1.5">Idioma</label>
                    <select
                      value={form.language}
                      onChange={(e) => f('language', e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={!canEdit}
                    >
                      <option value="es">Español</option>
                      <option value="en">English</option>
                      <option value="pt">Português</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <h2 className="text-gray-900 font-semibold mb-4">Listas editables</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <OptionListEditor
                  title="Tipos de muestra"
                  description="Aparecen en altas, importación, edición y búsqueda."
                  values={form.sample_types}
                  labels={SAMPLE_TYPE_LABEL}
                  disabled={!canEdit}
                  onChange={(values) => setList('sample_types', values)}
                />
                <OptionListEditor
                  title="Estados de muestra"
                  description="Estados usados para muestras y colores del grid."
                  values={form.sample_statuses}
                  labels={SAMPLE_STATUS_LABEL}
                  disabled={!canEdit}
                  onChange={(values) => setList('sample_statuses', values)}
                />
                <OptionListEditor
                  title="Tipos de caja"
                  description="Tipos disponibles al crear o editar cajas."
                  values={form.box_types}
                  labels={BOX_TYPE_LABEL}
                  disabled={!canEdit}
                  onChange={(values) => setList('box_types', values)}
                />
                <OptionListEditor
                  title="Estados de caja"
                  description="Estados disponibles para cajas."
                  values={form.box_statuses}
                  labels={BOX_STATUS_LABEL}
                  disabled={!canEdit}
                  onChange={(values) => setList('box_statuses', values)}
                />
                <OptionListEditor
                  title="Unidades"
                  description="Unidades disponibles para volumen/concentración."
                  values={form.unit_types}
                  disabled={!canEdit}
                  onChange={(values) => setList('unit_types', values)}
                />
              </div>
            </div>

            {canEdit && <LabDataSection settingsId={settings?.id} />}

            {canEdit && (
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
                  <span className="text-green-600 text-sm flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4" /> Guardado
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
