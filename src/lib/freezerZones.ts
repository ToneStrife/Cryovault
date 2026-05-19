import { supabase } from '@/lib/supabase';
import type { FreezerZone } from '@/types';

const MAX_ZONES = 20;

function clampZoneCount(zoneCount: number) {
  return Math.max(1, Math.min(MAX_ZONES, zoneCount));
}

/** Throws if racks or boxes are assigned to zones that would be removed. */
export async function assertFreezerZonesCanReduce(freezerId: string, newCount: number) {
  const count = clampZoneCount(newCount);
  const { data: racks, error: racksErr } = await (supabase.from('racks') as any)
    .select('id')
    .eq('freezer_id', freezerId)
    .gt('shelf_number', count);
  if (racksErr) throw racksErr;
  if (racks?.length) {
    throw new Error('No se puede reducir: hay racks en zonas que se eliminarían.');
  }

  const { data: boxes, error: boxesErr } = await (supabase.from('boxes') as any)
    .select('id')
    .eq('freezer_id', freezerId)
    .gt('shelf_number', count);
  if (boxesErr) throw boxesErr;
  if (boxes?.length) {
    throw new Error('No se puede reducir: hay cajas en zonas que se eliminarían.');
  }
}

export async function syncFreezerZones(freezerId: string, zoneCount: number) {
  const count = clampZoneCount(zoneCount);

  const { data: existing, error: selectError } = await (supabase.from('freezer_zones') as any)
    .select('*')
    .eq('freezer_id', freezerId);
  if (selectError) throw selectError;

  const maxExisting = (existing || []).reduce(
    (max: number, z: FreezerZone) => Math.max(max, z.zone_number),
    0,
  );
  if (count < maxExisting) {
    await assertFreezerZonesCanReduce(freezerId, count);
  }

  const existingNums = new Set((existing || []).map((z: FreezerZone) => z.zone_number));
  for (let n = 1; n <= count; n++) {
    if (!existingNums.has(n)) {
      const { error } = await (supabase.from('freezer_zones') as any).insert([{
        freezer_id: freezerId,
        zone_number: n,
        name: `Zona ${n}`,
        sort_order: n,
      }]);
      if (error) throw error;
    }
  }

  const { error: deleteError } = await (supabase.from('freezer_zones') as any)
    .delete()
    .eq('freezer_id', freezerId)
    .gt('zone_number', count);
  if (deleteError) throw deleteError;

  const { error: freezerError } = await (supabase.from('freezers') as any)
    .update({ shelf_count: count, updated_at: new Date().toISOString() })
    .eq('id', freezerId);
  if (freezerError) throw freezerError;
}

export async function fetchFreezerZones(freezerId: string): Promise<FreezerZone[]> {
  const { data, error } = await (supabase.from('freezer_zones') as any)
    .select('*')
    .eq('freezer_id', freezerId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data || []) as FreezerZone[];
}

function friendlyZoneError(err: unknown): Error {
  if (err instanceof Error) {
    const msg = err.message;
    if (msg.includes('freezer_zones') && msg.includes('does not exist')) {
      return new Error(
        'La tabla freezer_zones no existe en la base de datos. Aplica las migraciones de Supabase (009 y 013).',
      );
    }
    if (msg.includes('row-level security') || msg.includes('violates')) {
      return new Error(
        'Sin permiso para gestionar zonas. Necesitas rol admin, investigador o técnico en este laboratorio.',
      );
    }
    return err;
  }
  return new Error('Error al cargar zonas del congelador');
}

/** Ensures zones exist; backfills from shelf_count when empty. */
export async function ensureFreezerZones(freezerId: string, shelfCount: number): Promise<FreezerZone[]> {
  try {
    let zones = await fetchFreezerZones(freezerId);
    if (zones.length === 0) {
      await syncFreezerZones(freezerId, shelfCount || 3);
      zones = await fetchFreezerZones(freezerId);
    }
    return zones;
  } catch (e) {
    throw friendlyZoneError(e);
  }
}
