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

export { hasAuthCallbackInUrl, hasAuthCallbackHash } from '@/lib/authCallback';

export function getAuthHashType(): string | null {
  const search = new URLSearchParams(window.location.search);
  const searchType = search.get('type');
  if (searchType) return searchType;

  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return null;
  return new URLSearchParams(hash).get('type');
}
