import { supabase } from '@/lib/supabase';
import { downloadWorkbook } from '@/lib/spreadsheet';
import type { Box, Freezer, Rack, Sample } from '@/types';

export const LAB_EXPORT_VERSION = 1;

export interface LabExportCounts {
  freezers: number;
  racks: number;
  boxes: number;
  samples: number;
}

export async function fetchLabExportData(laboratory: string) {
  const { data: freezers, error: fzErr } = await supabase
    .from('freezers')
    .select('*')
    .eq('laboratory', laboratory)
    .order('name');
  if (fzErr) throw fzErr;

  const freezerIds = (freezers ?? []).map((f) => f.id);
  if (freezerIds.length === 0) {
    return {
      freezers: [] as Freezer[],
      racks: [] as Rack[],
      boxes: [] as Box[],
      samples: [] as Sample[],
    };
  }

  const { data: racks, error: rackErr } = await (supabase.from('racks') as any)
    .select('*')
    .in('freezer_id', freezerIds)
    .order('shelf_number');
  if (rackErr) throw rackErr;

  const { data: boxes, error: boxErr } = await (supabase.from('boxes') as any)
    .select('*')
    .in('freezer_id', freezerIds)
    .is('deleted_at', null)
    .order('name');
  if (boxErr) throw boxErr;

  const { data: samples, error: sampleErr } = await (supabase.from('samples') as any)
    .select('*')
    .eq('laboratory', laboratory)
    .is('deleted_at', null)
    .order('sample_code');
  if (sampleErr) throw sampleErr;

  return {
    freezers: (freezers ?? []) as Freezer[],
    racks: (racks ?? []) as Rack[],
    boxes: (boxes ?? []) as Box[],
    samples: (samples ?? []) as Sample[],
  };
}

export function buildLabExportSheets(data: {
  freezers: Freezer[];
  racks: Rack[];
  boxes: Box[];
  samples: Sample[];
}) {
  const freezerNameById = Object.fromEntries(data.freezers.map((f) => [f.id, f.name]));

  return [
    {
      name: 'README',
      rows: [
        { campo: 'export_version', valor: String(LAB_EXPORT_VERSION) },
        { campo: 'generado', valor: new Date().toISOString() },
        { campo: 'nota', valor: 'Import v1 solo usa hoja Muestras en cajas existentes' },
      ],
    },
    {
      name: 'Congeladores',
      rows: data.freezers.map((f) => ({
        id: f.id,
        nombre: f.name,
        temperatura: f.temperature,
        ubicacion: f.location ?? '',
        sala: f.room ?? '',
        edificio: f.building ?? '',
        baldas: f.shelf_count,
        notas: f.notes ?? '',
      })),
    },
    {
      name: 'Racks',
      rows: data.racks.map((r) => ({
        id: r.id,
        congelador_id: r.freezer_id,
        congelador_nombre: freezerNameById[r.freezer_id] ?? '',
        nombre: r.name,
        balda: r.shelf_number,
        filas: r.rows,
        columnas: r.columns,
      })),
    },
    {
      name: 'Cajas',
      rows: data.boxes.map((b) => ({
        id: b.id,
        congelador_id: b.freezer_id,
        congelador_nombre: freezerNameById[b.freezer_id] ?? '',
        rack_id: b.rack_id ?? '',
        nombre: b.name,
        descripcion: b.description ?? '',
        filas: b.rows,
        columnas: b.columns,
        tipo: b.box_type,
        estado: b.status,
        ocupacion: b.occupancy,
      })),
    },
    {
      name: 'Muestras',
      rows: data.samples.map((s) => ({
        id: s.id,
        codigo: s.sample_code,
        caja_id: s.box_id ?? '',
        congelador_nombre: s.box_id
          ? freezerNameById[data.boxes.find((b) => b.id === s.box_id)?.freezer_id ?? ''] ?? ''
          : '',
        caja_nombre: s.box_id ? data.boxes.find((b) => b.id === s.box_id)?.name ?? '' : '',
        posicion: s.position_label ?? '',
        fila: s.position_row ?? '',
        columna: s.position_column ?? '',
        paciente: s.patient_code ?? '',
        proyecto: s.project ?? '',
        tipo: s.sample_type,
        subtipo: s.subtype ?? '',
        estado: s.status,
        volumen: s.volume ?? '',
        unidades: s.units,
        descongelaciones: s.thaw_count,
        max_descongelaciones: s.max_thaws,
        notas: s.notes ?? '',
      })),
    },
  ];
}

export async function exportLaboratoryExcel(laboratory: string) {
  const data = await fetchLabExportData(laboratory);
  const sheets = buildLabExportSheets(data);
  const safeLab = laboratory.replace(/[^a-zA-Z0-9_-]/g, '_');
  const date = new Date().toISOString().slice(0, 10);
  downloadWorkbook(sheets, `cryovault-${safeLab}-${date}.xlsx`);
  return {
    freezers: data.freezers.length,
    racks: data.racks.length,
    boxes: data.boxes.length,
    samples: data.samples.length,
  } satisfies LabExportCounts;
}

export function downloadLabImportTemplate() {
  downloadWorkbook(
    [
      {
        name: 'README',
        rows: [
          { campo: 'version', valor: '1' },
          {
            campo: 'instrucciones',
            valor: 'Rellena Muestras: congelador_nombre + caja_nombre (o caja_id). Posición opcional (ej. A1).',
          },
        ],
      },
      {
        name: 'Muestras',
        rows: [
          {
            codigo: 'SMP-001',
            congelador_nombre: 'Freezer A',
            caja_nombre: 'Caja 1',
            caja_id: '',
            posicion: 'A1',
            paciente: 'PAT-001',
            proyecto: 'Proyecto-X',
            tipo: 'blood',
            subtipo: '',
            estado: 'active',
            volumen: '0.5',
            unidades: 'mL',
            notas: '',
          },
        ],
      },
    ],
    'plantilla-import-laboratorio.xlsx',
  );
}
