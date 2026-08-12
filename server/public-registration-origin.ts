const DEFAULT_PUBLIC_REGISTRATION_ORIGIN = 'https://em.devcongress.org';

function isLocalOrigin(value: string): boolean {
  try {
    const { hostname } = new URL(value);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

function safePublicOrigin(value: string | undefined): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * Registration links are stored on the shared event record and consumed by
 * devcongress.org. A local development origin is only safe while the event
 * itself is local JSON data; never persist it to Supabase.
 */
export function publicRegistrationOrigin(input: {
  requestOrigin: string;
  configuredOrigin?: string;
  usesSharedEventStorage: boolean;
}): string {
  const requestOrigin = safePublicOrigin(input.requestOrigin);
  if (!input.usesSharedEventStorage && requestOrigin && isLocalOrigin(requestOrigin)) {
    return requestOrigin;
  }

  const configuredOrigin = safePublicOrigin(input.configuredOrigin);
  if (configuredOrigin && !isLocalOrigin(configuredOrigin)) return configuredOrigin;

  return DEFAULT_PUBLIC_REGISTRATION_ORIGIN;
}
