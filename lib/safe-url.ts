const MAX_PUBLIC_URL_LENGTH = 2048;

export function isLocalOrPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  return normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized.endsWith('.local')
    || normalized.endsWith('.internal')
    || normalized === '0.0.0.0'
    || normalized === '::1'
    || normalized.startsWith('127.')
    || normalized.startsWith('10.')
    || normalized.startsWith('192.168.')
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized)
    || normalized.startsWith('169.254.')
    || (normalized.includes(':') && normalized.startsWith('fc'))
    || (normalized.includes(':') && normalized.startsWith('fd'))
    || normalized.startsWith('fe80:');
}

export function safeHttpUrl(value: string | null | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate || candidate.length > MAX_PUBLIC_URL_LENGTH) return null;

  try {
    const url = new URL(candidate);
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:')
      || url.username
      || url.password
      || !url.hostname
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Validates a presenter-supplied public resource without allowing insecure,
 * executable, or local-network destinations into the public archive flow.
 */
export function safePublicResourceUrl(value: string | null | undefined): string | null {
  const url = safeHttpUrl(value);
  if (!url) return null;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || isLocalOrPrivateHostname(parsed.hostname)) return null;
    parsed.hostname = parsed.hostname.toLowerCase();
    return parsed.toString();
  } catch {
    return null;
  }
}

export function safeWebsiteUrl(value: string | null | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate || candidate.length > MAX_PUBLIC_URL_LENGTH) return null;

  if (candidate.startsWith('/') && !candidate.startsWith('//')) {
    return candidate;
  }

  return safeHttpUrl(candidate);
}
