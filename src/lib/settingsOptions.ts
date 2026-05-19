import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Settings } from '@/types';

export const DEFAULT_SAMPLE_TYPES = ['tissue', 'blood', 'serum', 'plasma', 'urine', 'csf', 'saliva', 'dna', 'rna', 'protein', 'other'];
export const DEFAULT_SAMPLE_STATUSES = ['active', 'in_use', 'used', 'discarded', 'archived', 'contaminated'];
export const DEFAULT_BOX_TYPES = ['standard', 'microtube', 'sample_vial', 'other'];
export const DEFAULT_BOX_STATUSES = ['active', 'full', 'in_use', 'archived', 'retired'];
export const DEFAULT_UNIT_TYPES = ['mL', 'µL', 'mg', 'µg', 'ng', 'mol/L', '%', 'other'];

export const SAMPLE_STATUS_LABEL: Record<string, string> = {
  active: 'Activo',
  in_use: 'En uso',
  used: 'Usado',
  discarded: 'Descartado',
  archived: 'Archivado',
  contaminated: 'Contaminado',
};

export const SAMPLE_TYPE_LABEL: Record<string, string> = {
  tissue: 'Tejido',
  blood: 'Sangre',
  serum: 'Suero',
  plasma: 'Plasma',
  urine: 'Orina',
  csf: 'LCR',
  saliva: 'Saliva',
  dna: 'DNA',
  rna: 'RNA',
  protein: 'Proteína',
  other: 'Otro',
};

export const BOX_STATUS_LABEL: Record<string, string> = {
  active: 'Activa',
  full: 'Llena',
  in_use: 'En uso',
  archived: 'Archivada',
  retired: 'Retirada',
};

export const BOX_TYPE_LABEL: Record<string, string> = {
  standard: 'Estándar',
  microtube: 'Microtubo',
  sample_vial: 'Vial de muestra',
  other: 'Otro',
};

export function cleanOptions(values: string[], fallback: string[]) {
  const cleaned = values.map((v) => v.trim()).filter(Boolean);
  return Array.from(new Set(cleaned.length ? cleaned : fallback));
}

export function labelOption(value: string, labels: Record<string, string> = {}) {
  return labels[value] || value;
}

export function optionsFromSettings(settings?: Settings | null) {
  return {
    sampleTypes: cleanOptions(settings?.sample_types || DEFAULT_SAMPLE_TYPES, DEFAULT_SAMPLE_TYPES),
    sampleStatuses: cleanOptions(settings?.sample_statuses || DEFAULT_SAMPLE_STATUSES, DEFAULT_SAMPLE_STATUSES),
    boxTypes: cleanOptions(settings?.box_types || DEFAULT_BOX_TYPES, DEFAULT_BOX_TYPES),
    boxStatuses: cleanOptions(settings?.box_statuses || DEFAULT_BOX_STATUSES, DEFAULT_BOX_STATUSES),
    unitTypes: cleanOptions(settings?.unit_types || DEFAULT_UNIT_TYPES, DEFAULT_UNIT_TYPES),
    defaultSampleType: settings?.default_sample_type || DEFAULT_SAMPLE_TYPES[0],
    defaultSampleStatus: settings?.default_sample_status || DEFAULT_SAMPLE_STATUSES[0],
    defaultBoxType: settings?.default_box_type || DEFAULT_BOX_TYPES[0],
    defaultBoxStatus: settings?.default_box_status || DEFAULT_BOX_STATUSES[0],
    defaultUnits: settings?.default_units || DEFAULT_UNIT_TYPES[0],
    defaultMaxThaws: settings?.default_max_thaws || 3,
    defaultBoxRows: settings?.default_box_rows || 9,
    defaultBoxColumns: settings?.default_box_columns || 9,
  };
}

export function useSettingsOptions(laboratory?: string) {
  const query = useQuery({
    queryKey: ['settings', laboratory || 'default_lab'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('laboratory', laboratory || 'default_lab')
        .maybeSingle();
      if (error) throw error;
      return data as Settings | null;
    },
    enabled: !!laboratory,
  });

  return {
    ...query,
    options: optionsFromSettings(query.data),
  };
}
