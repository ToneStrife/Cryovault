import { supabase } from '@/lib/supabase';

export interface BoxSampleCounts {
  total: number;
  inUse: number;
}

export async function getBoxSampleCounts(boxId: string): Promise<BoxSampleCounts> {
  const { data, error } = await (supabase.from('samples') as any)
    .select('id, status')
    .eq('box_id', boxId)
    .is('deleted_at', null);
  if (error) throw error;
  const rows = (data || []) as { id: string; status: string }[];
  return {
    total: rows.length,
    inUse: rows.filter((s) => s.status === 'in_use').length,
  };
}

function boxStatusFromOccupancy(rows: number, columns: number, occupancy: number) {
  const total = rows * columns;
  if (total > 0 && occupancy >= total) return 'full';
  return 'active';
}

export async function archiveBox(boxId: string) {
  const { error } = await (supabase.from('boxes') as any)
    .update({
      archived: true,
      status: 'archived',
      updated_at: new Date().toISOString(),
    })
    .eq('id', boxId)
    .is('deleted_at', null);
  if (error) throw error;
}

export async function unarchiveBox(boxId: string) {
  const { data: box, error: fetchErr } = await (supabase.from('boxes') as any)
    .select('rows, columns, occupancy')
    .eq('id', boxId)
    .single();
  if (fetchErr) throw fetchErr;
  const status = boxStatusFromOccupancy(box.rows, box.columns, box.occupancy);
  const { error } = await (supabase.from('boxes') as any)
    .update({
      archived: false,
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', boxId)
    .is('deleted_at', null);
  if (error) throw error;
}

export async function softDeleteBoxWithSamples(boxId: string, userId: string) {
  const { data: samples, error: selectErr } = await (supabase.from('samples') as any)
    .select('id')
    .eq('box_id', boxId)
    .is('deleted_at', null);
  if (selectErr) throw selectErr;

  const sampleIds = ((samples || []) as { id: string }[]).map((s) => s.id);
  const now = new Date().toISOString();

  if (sampleIds.length > 0) {
    const { error: samplesErr } = await (supabase.from('samples') as any)
      .update({ deleted_at: now, deleted_by: userId })
      .in('id', sampleIds);
    if (samplesErr) throw samplesErr;
  }

  const { error: boxErr } = await (supabase.from('boxes') as any)
    .update({
      deleted_at: now,
      deleted_by: userId,
      archived: false,
      updated_at: now,
    })
    .eq('id', boxId);
  if (boxErr) throw boxErr;

  const { error: auditErr } = await (supabase.from('audit_logs') as any).insert([{
    user_id: userId,
    entity_type: 'box',
    entity_id: boxId,
    action: 'delete',
    old_values: null,
    new_values: {
      deleted_sample_ids: sampleIds,
      sample_count: sampleIds.length,
      deleted_at: now,
    },
  }]);
  if (auditErr) throw auditErr;

  return { sampleIds, sampleCount: sampleIds.length };
}

export async function restoreBoxWithSamples(boxId: string, sampleIds: string[]) {
  if (sampleIds.length > 0) {
    const { error: samplesErr } = await (supabase.from('samples') as any)
      .update({ deleted_at: null, deleted_by: null })
      .in('id', sampleIds);
    if (samplesErr) throw samplesErr;
  }

  const { data: box, error: fetchErr } = await (supabase.from('boxes') as any)
    .select('rows, columns, occupancy, archived')
    .eq('id', boxId)
    .single();
  if (fetchErr) throw fetchErr;

  const status = box.archived
    ? 'archived'
    : boxStatusFromOccupancy(box.rows, box.columns, box.occupancy);

  const { error: boxErr } = await (supabase.from('boxes') as any)
    .update({
      deleted_at: null,
      deleted_by: null,
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', boxId);
  if (boxErr) throw boxErr;
}

export function parseDeletedSampleIds(auditNewValues: unknown): string[] {
  if (!auditNewValues || typeof auditNewValues !== 'object') return [];
  const ids = (auditNewValues as { deleted_sample_ids?: unknown }).deleted_sample_ids;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
}
