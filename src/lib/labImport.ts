import { supabase } from '@/lib/supabase';
import { parseFileSheetRows } from '@/lib/spreadsheet';
import { positionLabel } from '@/lib/positionUtils';
import type { Box, Freezer, SampleStatus, SampleType, UnitType } from '@/types';

export interface LabImportRowError {
  row: number;
  message: string;
}

export interface LabImportResult {
  imported: number;
  skipped: number;
  errors: LabImportRowError[];
}

export interface LabImportContext {
  laboratory: string;
  userId: string;
  sampleTypes: string[];
  statuses: string[];
  units: string[];
  defaultSampleType: SampleType;
  defaultStatus: SampleStatus;
  defaultUnits: UnitType;
  defaultMaxThaws: number;
}

interface BoxLookup {
  box: Box;
  occupied: Set<string>;
  freePositions: { row: number; col: number }[];
}

function parsePosition(pos: string): { row: number; col: number } | null {
  const m = pos.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!m) return null;
  const letters = m[1];
  let row = 0;
  for (let i = 0; i < letters.length; i++) {
    row = row * 26 + (letters.charCodeAt(i) - 64);
  }
  return { row, col: parseInt(m[2], 10) };
}

function buildBoxLookups(
  freezers: Freezer[],
  boxes: Box[],
  samples: { box_id: string | null; position_row: number | null; position_column: number | null }[],
): Map<string, BoxLookup> {
  const byId = new Map<string, BoxLookup>();

  for (const box of boxes) {
    const fz = freezers.find((f) => f.id === box.freezer_id);
    const keyId = box.id;
    const keyName =
      fz ? `${fz.name.toLowerCase()}::${box.name.toLowerCase()}` : box.name.toLowerCase();

    const occupied = new Set<string>();
    for (const s of samples) {
      if (s.box_id === box.id && s.position_row != null && s.position_column != null) {
        occupied.add(`${s.position_row}_${s.position_column}`);
      }
    }

    const freePositions: { row: number; col: number }[] = [];
    for (let r = 1; r <= box.rows; r++) {
      for (let c = 1; c <= box.columns; c++) {
        if (!occupied.has(`${r}_${c}`)) freePositions.push({ row: r, col: c });
      }
    }

    const entry: BoxLookup = { box, occupied, freePositions };
    byId.set(keyId, entry);
    byId.set(keyName, entry);
  }

  return byId;
}

export async function parseLabImportRows(file: File): Promise<Record<string, string>[]> {
  try {
    const fromMuestras = await parseFileSheetRows(file, 'Muestras');
    if (fromMuestras.length > 0) return fromMuestras;
  } catch {
    /* fall through */
  }
  const { parseFileToRows } = await import('@/lib/spreadsheet');
  return parseFileToRows(file);
}

export async function runLabImport(
  rows: Record<string, string>[],
  ctx: LabImportContext,
  options: { dryRun?: boolean } = {},
): Promise<LabImportResult> {
  const { data: freezers, error: fzErr } = await supabase
    .from('freezers')
    .select('id, name')
    .eq('laboratory', ctx.laboratory);
  if (fzErr) throw fzErr;

  const freezerIds = (freezers ?? []).map((f) => f.id);
  if (freezerIds.length === 0) {
    return { imported: 0, skipped: 0, errors: [{ row: 0, message: 'No hay congeladores en el laboratorio' }] };
  }

  const { data: boxes, error: boxErr } = await (supabase.from('boxes') as any)
    .select('*')
    .in('freezer_id', freezerIds)
    .is('deleted_at', null);
  if (boxErr) throw boxErr;

  const { data: existingSamples, error: sampErr } = await (supabase.from('samples') as any)
    .select('sample_code, box_id, position_row, position_column')
    .eq('laboratory', ctx.laboratory)
    .is('deleted_at', null);
  if (sampErr) throw sampErr;

  const existingCodes = new Set((existingSamples ?? []).map((s: { sample_code: string }) => s.sample_code.toLowerCase()));
  const lookups = buildBoxLookups(
    (freezers ?? []) as Freezer[],
    (boxes ?? []) as Box[],
    (existingSamples ?? []) as { box_id: string | null; position_row: number | null; position_column: number | null }[],
  );

  const errors: LabImportRowError[] = [];
  const toInsert: Record<string, unknown>[] = [];
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    const code = (row['codigo'] || row['sample_code'] || '').trim();
    if (!code) {
      skipped++;
      continue;
    }

    if (existingCodes.has(code.toLowerCase())) {
      errors.push({ row: rowNum, message: `Código ya existe: ${code}` });
      continue;
    }

    const boxId = (row['caja_id'] || row['box_id'] || '').trim();
    const fzName = (row['congelador_nombre'] || row['freezer_name'] || '').trim().toLowerCase();
    const boxName = (row['caja_nombre'] || row['box_name'] || '').trim().toLowerCase();
    const lookupKey = boxId || (fzName && boxName ? `${fzName}::${boxName}` : boxName);
    if (!lookupKey) {
      errors.push({ row: rowNum, message: 'Falta caja_id o congelador_nombre + caja_nombre' });
      continue;
    }

    const lookup = lookups.get(boxId) ?? lookups.get(lookupKey);
    if (!lookup) {
      errors.push({ row: rowNum, message: 'Caja no encontrada en el laboratorio' });
      continue;
    }

    if (lookup.box.status === 'in_use') {
      errors.push({ row: rowNum, message: 'La caja está «en uso»; no se pueden añadir muestras' });
      continue;
    }

    let pos: { row: number; col: number } | undefined;
    const posStr = (row['posicion'] || row['position'] || '').trim();
    if (posStr) {
      const parsed = parsePosition(posStr);
      if (!parsed) {
        errors.push({ row: rowNum, message: `Posición inválida: ${posStr}` });
        continue;
      }
      if (parsed.row < 1 || parsed.row > lookup.box.rows || parsed.col < 1 || parsed.col > lookup.box.columns) {
        errors.push({ row: rowNum, message: 'Posición fuera de la cuadrícula' });
        continue;
      }
      if (lookup.occupied.has(`${parsed.row}_${parsed.col}`)) {
        errors.push({ row: rowNum, message: 'Celda ocupada' });
        continue;
      }
      pos = parsed;
    } else {
      const next = lookup.freePositions.shift();
      if (!next) {
        errors.push({ row: rowNum, message: 'No hay posiciones libres en la caja' });
        continue;
      }
      pos = next;
    }

    lookup.occupied.add(`${pos.row}_${pos.col}`);
    existingCodes.add(code.toLowerCase());

    const sampleType = ctx.sampleTypes.includes(row['tipo'])
      ? row['tipo']
      : ctx.defaultSampleType;
    const status = ctx.statuses.includes(row['estado']) ? row['estado'] : ctx.defaultStatus;
    const units = ctx.units.includes(row['unidades']) ? row['unidades'] : ctx.defaultUnits;

    toInsert.push({
      sample_code: code,
      patient_code: row['paciente'] || null,
      project: row['proyecto'] || null,
      sample_type: sampleType,
      subtype: row['subtipo'] || null,
      volume: row['volumen'] ? parseFloat(row['volumen']) : null,
      units,
      status,
      thaw_count: 0,
      max_thaws: ctx.defaultMaxThaws,
      notes: row['notas'] || null,
      box_id: lookup.box.id,
      position_row: pos.row,
      position_column: pos.col,
      position_label: positionLabel(pos.row, pos.col),
      laboratory: ctx.laboratory,
      created_by: ctx.userId,
    });
  }

  if (options.dryRun) {
    return { imported: toInsert.length, skipped, errors };
  }

  const BATCH = 50;
  let imported = 0;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH);
    const { error } = await (supabase.from('samples') as any).insert(batch);
    if (error) {
      errors.push({ row: 0, message: `Error en lote ${i / BATCH + 1}: ${error.message}` });
      break;
    }
    imported += batch.length;
  }

  return { imported, skipped, errors };
}
