import { supabase } from '@/lib/supabase';

const PAGE_SIZE = 1000;

/** Fetch all rows from a Supabase query, bypassing the default 1000-row limit. */
export async function fetchAllSamples<T>(
  select: string,
  options?: { includeDeleted?: boolean },
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;

  while (true) {
    let query = (supabase.from('samples') as any)
      .select(select)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (!options?.includeDeleted) {
      query = query.is('deleted_at', null);
    }

    const { data, error } = await query;
    if (error) throw error;

    const page = (data || []) as T[];
    all.push(...page);

    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return all;
}
