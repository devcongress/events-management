const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

/** Never navigate to a scanned URL. Extract only our opaque admission capability. */
export function conferenceQrToken(value: string): string | null {
  const trimmed = value.trim();

  if (TOKEN_PATTERN.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);

    if (url.protocol !== 'https:' || !['devcongress.org', 'www.devcongress.org', 'em.devcongress.org'].includes(url.hostname)) return null;
    if (url.pathname !== '/devcon26/admission/') return null;
    const token = url.hash.slice(1);

    return TOKEN_PATTERN.test(token) ? token : null;
  } catch {
    return null;
  }
}
