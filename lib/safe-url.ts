const MAX_PUBLIC_URL_LENGTH = 2048;

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

export function safeWebsiteUrl(value: string | null | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate || candidate.length > MAX_PUBLIC_URL_LENGTH) return null;

  if (candidate.startsWith('/') && !candidate.startsWith('//')) {
    return candidate;
  }

  return safeHttpUrl(candidate);
}
