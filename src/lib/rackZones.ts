import { supabase } from '@/lib/supabase';
import type { RackZone } from '@/types';

export async function syncRackZones(rackId: string, shelfCount: number) {
  const count = Math.max(1, Math.min(20, shelfCount));
  const { data: existing, error: selectError } = await (supabase.from('rack_zones') as any)
    .select('*')
    .eq('rack_id', rackId);
  if (selectError) throw selectError;

  const existingNums = new Set((existing || []).map((z: RackZone) => z.zone_number));
  for (let n = 1; n <= count; n++) {
    if (!existingNums.has(n)) {
      const { error } = await (supabase.from('rack_zones') as any).insert([{
        rack_id: rackId,
        zone_number: n,
        name: `Zona ${n}`,
        sort_order: n,
      }]);
      if (error) throw error;
    }
  }

  const { error: deleteError } = await (supabase.from('rack_zones') as any)
    .delete()
    .eq('rack_id', rackId)
    .gt('zone_number', count);
  if (deleteError) throw deleteError;
}
