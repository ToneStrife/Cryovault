/** Restore URL after GitHub Pages 404 → index redirect (see public/404.html). */
export function restoreSpaRedirect() {
  const redirect = sessionStorage.getItem('spa-redirect');
  if (!redirect) return;
  sessionStorage.removeItem('spa-redirect');
  if (redirect === window.location.href) return;
  const path = redirect.replace(window.location.origin, '');
  window.history.replaceState(null, '', path);
}
