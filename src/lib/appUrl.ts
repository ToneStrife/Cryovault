export function getAppOrigin() {
  return window.location.origin;
}

export function appPath(path: string) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${getAppOrigin()}${base}${normalized}`;
}

export function boxPath(boxId: string) {
  return `/box/${boxId}`;
}

export function sampleSearchPath(sampleCode: string) {
  return `/search?${new URLSearchParams({ code: sampleCode }).toString()}`;
}

export async function copyAppLink(path: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(appPath(path));
    return true;
  } catch {
    return false;
  }
}

/** True when the URL hash contains an auth callback (invite, recovery, etc.). */
export function hasAuthCallbackHash() {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return false;
  const params = new URLSearchParams(hash);
  const type = params.get('type');
  return (
    params.has('access_token') &&
    (type === 'invite' || type === 'recovery' || type === 'signup')
  );
}

export function getAuthHashType(): string | null {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return null;
  return new URLSearchParams(hash).get('type');
}
