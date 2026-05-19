import type { FunctionsHttpError } from '@supabase/supabase-js';

export async function parseEdgeFunctionError(
  error: unknown,
  data: unknown,
): Promise<string> {
  if (data && typeof data === 'object' && 'error' in data) {
    const msg = (data as { error?: string }).error;
    if (msg) return msg;
  }

  if (error && typeof error === 'object' && 'context' in error) {
    const ctx = (error as FunctionsHttpError).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const body = await ctx.json();
        if (body?.error) return String(body.error);
      } catch {
        /* ignore */
      }
    }
  }

  if (error instanceof Error) return error.message;
  return 'Error en la solicitud al servidor';
}
