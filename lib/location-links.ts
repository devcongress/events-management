const GOOGLE_MAPS_HOSTS = new Set([
  'google.com',
  'www.google.com',
  'maps.google.com',
  'maps.app.goo.gl',
  'goo.gl',
]);

export function safeGoogleMapsUrl(value: string | null | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate || candidate.length > 2048) return null;

  try {
    const url = new URL(candidate);
    const hostname = url.hostname.toLowerCase();
    if (
      url.protocol !== 'https:'
      || url.username
      || url.password
      || !GOOGLE_MAPS_HOSTS.has(hostname)
    ) {
      return null;
    }

    if (
      (hostname === 'google.com' || hostname === 'www.google.com')
      && url.pathname !== '/maps'
      && !url.pathname.startsWith('/maps/')
    ) {
      return null;
    }

    if (hostname === 'goo.gl' && !url.pathname.startsWith('/maps')) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}
