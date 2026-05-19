import type { EmailOtpType, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export type EstablishSessionResult = {
  session: Session | null;
  error: string | null;
};

let establishOncePromise: Promise<EstablishSessionResult> | null = null;
let establishOnceUrl = '';

function decodeAuthError(value: string) {
  return decodeURIComponent(value.replace(/\+/g, ' '));
}

function mapOtpType(type: string): EmailOtpType {
  switch (type) {
    case 'invite':
    case 'recovery':
    case 'signup':
    case 'magiclink':
    case 'email':
      return type;
    default:
      return 'invite';
  }
}

function isPkceVerifierError(message: string) {
  return /pkce|code verifier/i.test(message);
}

function hasPkceVerifierInStorage(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.includes('code-verifier')) return true;
    }
  } catch {
    return false;
  }
  return false;
}

function cleanAuthQueryFromUrl() {
  const url = new URL(window.location.href);
  for (const key of [
    'code',
    'type',
    'token',
    'token_hash',
    'error',
    'error_code',
    'error_description',
  ]) {
    url.searchParams.delete(key);
  }
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
}

function cleanAuthHashFromUrl() {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return;
  const params = new URLSearchParams(hash);
  const hasAuth =
    params.has('access_token') ||
    params.has('error') ||
    params.has('token_hash') ||
    params.has('token');
  if (!hasAuth) return;
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
}

function readUrlAuthParams() {
  const search = new URLSearchParams(window.location.search);
  const hash = window.location.hash.replace(/^#/, '');
  const hashParams = hash ? new URLSearchParams(hash) : null;

  const authError =
    search.get('error_description') ||
    search.get('error') ||
    hashParams?.get('error_description') ||
    hashParams?.get('error');

  const tokenHash =
    search.get('token_hash') ||
    search.get('token') ||
    hashParams?.get('token_hash') ||
    hashParams?.get('token');

  const otpType = search.get('type') || hashParams?.get('type');
  const code = search.get('code');

  const accessToken = hashParams?.get('access_token');
  const refreshToken = hashParams?.get('refresh_token');

  return { authError, tokenHash, otpType, code, accessToken, refreshToken };
}

/** Hash or query params from Supabase auth redirect (invite, recovery, magic link). */
export function hasAuthCallbackInUrl(): boolean {
  const { authError, tokenHash, otpType, code, accessToken } = readUrlAuthParams();
  if (authError) return true;
  if (code) return true;
  if (tokenHash && otpType) return true;

  if (accessToken) {
    const type = otpType;
    return (
      !type ||
      type === 'invite' ||
      type === 'recovery' ||
      type === 'signup' ||
      type === 'magiclink'
    );
  }
  return false;
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

/** Dev-only: log auth redirect shape without secrets. */
export function summarizeAuthUrlForDebug(): string {
  const { tokenHash, otpType, code, accessToken } = readUrlAuthParams();
  const parts: string[] = [];
  if (code) parts.push('query:code');
  if (tokenHash) parts.push(`query/hash:token_hash (type=${otpType ?? '?'})`);
  if (accessToken) parts.push('hash:access_token');
  return parts.length ? parts.join(', ') : 'no auth params in URL';
}

async function verifyOtpFromUrl(tokenHash: string, otpType: string): Promise<EstablishSessionResult> {
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: mapOtpType(otpType),
  });
  if (error) return { session: null, error: error.message };
  cleanAuthQueryFromUrl();
  cleanAuthHashFromUrl();
  return { session: data.session, error: null };
}

async function setSessionFromHash(
  accessToken: string,
  refreshToken: string | null,
): Promise<EstablishSessionResult> {
  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken ?? '',
  });
  if (error) return { session: null, error: error.message };
  cleanAuthHashFromUrl();
  return { session: data.session, error: null };
}

async function exchangePkceCode(code: string): Promise<EstablishSessionResult> {
  if (!hasPkceVerifierInStorage()) {
    return {
      session: null,
      error: 'PKCE code verifier missing (email link opened in a different browser)',
    };
  }
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return { session: null, error: error.message };
  cleanAuthQueryFromUrl();
  return { session: data.session, error: null };
}

/**
 * Exchange PKCE code, verifyOtp, or setSession from hash so getSession() returns a valid session.
 */
export async function establishSessionFromUrl(): Promise<EstablishSessionResult> {
  const { authError, tokenHash, otpType, code, accessToken, refreshToken } = readUrlAuthParams();

  if (authError) {
    cleanAuthQueryFromUrl();
    cleanAuthHashFromUrl();
    return { session: null, error: decodeAuthError(authError) };
  }

  if (tokenHash && otpType) {
    const verified = await verifyOtpFromUrl(tokenHash, otpType);
    if (verified.session || (verified.error && !isPkceVerifierError(verified.error))) {
      return verified;
    }
  }

  if (accessToken) {
    const fromHash = await setSessionFromHash(accessToken, refreshToken ?? null);
    if (fromHash.session) return fromHash;
    if (fromHash.error) return fromHash;
  }

  if (code) {
    const fromPkce = await exchangePkceCode(code);
    if (fromPkce.session) return fromPkce;
    if (fromPkce.error && !isPkceVerifierError(fromPkce.error)) {
      return fromPkce;
    }
    if (tokenHash && otpType) {
      return verifyOtpFromUrl(tokenHash, otpType);
    }
    if (accessToken) {
      return setSessionFromHash(accessToken, refreshToken ?? null);
    }
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) return { session: null, error: error.message };
  return { session: data.session, error: null };
}

/** Single in-flight session establishment per page load (avoids StrictMode double exchange). */
export function establishSessionFromUrlOnce(): Promise<EstablishSessionResult> {
  const urlKey = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (establishOncePromise && establishOnceUrl === urlKey) {
    return establishOncePromise;
  }
  establishOnceUrl = urlKey;
  establishOncePromise = establishSessionFromUrl();
  return establishOncePromise;
}

export function resetEstablishSessionOnce() {
  establishOncePromise = null;
  establishOnceUrl = '';
}
