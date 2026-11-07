import { supabase } from '@/lib/supabase';

const PAGE_SIZE = 1000;

/** Fetch all rows from a Supabase query, bypassing the default 1000-row limit. */
export async function fetchAllSamples<T>(
  select: string,
  options?: {
    includeDeleted?: boolean;
    /** Filtrar por laboratorio (el RLS ya lo limita, pero mantiene la semántica de las llamadas). */
    laboratory?: string;
    /** Columna de orden; por defecto created_at descendente. */
    orderBy?: { column: string; ascending?: boolean };
  },
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  const orderColumn = options?.orderBy?.column ?? 'created_at';
  const ascending = options?.orderBy?.ascending ?? false;

  while (true) {
    let query = supabase.from('samples')
      .select(select)
      // Orden secundario por id para que la paginación sea estable con valores repetidos.
      .order(orderColumn, { ascending })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (!options?.includeDeleted) {
      query = query.is('deleted_at', null);
    }
    if (options?.laboratory) {
      query = query.eq('laboratory', options.laboratory);
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
