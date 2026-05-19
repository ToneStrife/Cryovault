import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export type EstablishSessionResult = {
  session: Session | null;
  error: string | null;
};

function cleanAuthQueryFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('code');
  url.searchParams.delete('type');
  url.searchParams.delete('error');
  url.searchParams.delete('error_code');
  url.searchParams.delete('error_description');
  const next = url.pathname + url.search + url.hash;
  window.history.replaceState(null, '', next);
}

function cleanAuthHashFromUrl() {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return;
  const params = new URLSearchParams(hash);
  if (!params.has('access_token') && !params.has('error')) return;
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
}

/** Hash or query params from Supabase auth redirect (invite, recovery, magic link). */
export function hasAuthCallbackInUrl(): boolean {
  const search = new URLSearchParams(window.location.search);
  if (search.has('code')) return true;
  if (search.get('error')) return true;

  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return false;
  const hashParams = new URLSearchParams(hash);
  const type = hashParams.get('type');
  return (
    hashParams.has('access_token') &&
    (type === 'invite' || type === 'recovery' || type === 'signup' || type === 'magiclink')
  );
}

/** @deprecated use hasAuthCallbackInUrl */
export function hasAuthCallbackHash() {
  return hasAuthCallbackInUrl();
}

export function needsPasswordSetup(user: { user_metadata?: Record<string, unknown> } | null): boolean {
  if (!user) return false;
  const flag = user.user_metadata?.needs_password_setup;
  return flag !== false && flag !== 'false';
}

/**
 * Exchange PKCE code or consume hash tokens so getSession() returns a valid session.
 * Call on /accept-invite and /login before deciding the link is invalid.
 */
export async function establishSessionFromUrl(): Promise<EstablishSessionResult> {
  const search = new URLSearchParams(window.location.search);

  const authError = search.get('error_description') || search.get('error');
  if (authError) {
    return { session: null, error: decodeURIComponent(authError.replace(/\+/g, ' ')) };
  }

  const code = search.get('code');
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    cleanAuthQueryFromUrl();
    if (error) return { session: null, error: error.message };
    return { session: data.session, error: null };
  }

  const hash = window.location.hash.replace(/^#/, '');
  if (hash) {
    const hashParams = new URLSearchParams(hash);
    if (hashParams.get('error') || hashParams.get('error_description')) {
      const msg =
        hashParams.get('error_description') || hashParams.get('error') || 'Error de autenticación';
      cleanAuthHashFromUrl();
      return { session: null, error: decodeURIComponent(msg.replace(/\+/g, ' ')) };
    }
    if (hashParams.has('access_token')) {
      const { data, error } = await supabase.auth.getSession();
      cleanAuthHashFromUrl();
      if (error) return { session: null, error: error.message };
      if (data.session) return { session: data.session, error: null };
    }
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) return { session: null, error: error.message };
  return { session: data.session, error: null };
}
