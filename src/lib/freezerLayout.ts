import { supabase } from '@/lib/supabase';

/** Move boxes to "sin zona asignada" (keeps freezer_id). */
export async function unassignBoxesInFreezerZone(freezerId: string, zoneNumber: number) {
  const { data: racks, error: racksErr } = await (supabase.from('racks') as any)
    .select('id')
    .eq('freezer_id', freezerId)
    .eq('shelf_number', zoneNumber);
  if (racksErr) throw racksErr;

  const rackIds = (racks || []).map((r: { id: string }) => r.id);
  const payload = {
    shelf_number: null,
    rack_id: null,
    rack_shelf_number: null,
  };

  if (rackIds.length > 0) {
    const { error } = await (supabase.from('boxes') as any)
      .update(payload)
      .eq('freezer_id', freezerId)
      .or(`shelf_number.eq.${zoneNumber},rack_id.in.(${rackIds.join(',')})`);
    if (error) throw error;
  } else {
    const { error } = await (supabase.from('boxes') as any)
      .update(payload)
      .eq('freezer_id', freezerId)
      .eq('shelf_number', zoneNumber);
    if (error) throw error;
  }
}

export async function unassignBoxesOnRack(rackId: string) {
  const { error } = await (supabase.from('boxes') as any)
    .update({
      shelf_number: null,
      rack_id: null,
      rack_shelf_number: null,
    })
    .eq('rack_id', rackId);
  if (error) throw error;
}

export async function deleteRack(rackId: string) {
  await unassignBoxesOnRack(rackId);
  const { error } = await (supabase.from('racks') as any).delete().eq('id', rackId);
  if (error) throw error;
}

export async function deleteFreezerZone(
  freezerId: string,
  zoneId: string,
  zoneNumber: number,
  totalZoneCount: number,
) {
  if (totalZoneCount <= 1) {
    throw new Error('Debe quedar al menos una zona en el congelador.');
  }

  const { data: racks, error: racksSelectErr } = await (supabase.from('racks') as any)
    .select('id')
    .eq('freezer_id', freezerId)
    .eq('shelf_number', zoneNumber);
  if (racksSelectErr) throw racksSelectErr;

  await unassignBoxesInFreezerZone(freezerId, zoneNumber);

  if (racks?.length) {
    const rackIds = racks.map((r: { id: string }) => r.id);
    const { error: delRacksErr } = await (supabase.from('racks') as any).delete().in('id', rackIds);
    if (delRacksErr) throw delRacksErr;
  }

  const { error: delZoneErr } = await (supabase.from('freezer_zones') as any)
    .delete()
    .eq('id', zoneId);
  if (delZoneErr) throw delZoneErr;

  const newCount = totalZoneCount - 1;
  const { error: freezerErr } = await (supabase.from('freezers') as any)
    .update({ shelf_count: newCount, updated_at: new Date().toISOString() })
    .eq('id', freezerId);
  if (freezerErr) throw freezerErr;
}
