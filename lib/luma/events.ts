const PUBLIC_LUMA_HOSTS = new Set(['luma.com', 'www.luma.com', 'lu.ma', 'www.lu.ma']);
const MAX_PUBLIC_EVENT_HTML_CHARS = 500_000;
const DEFAULT_LOCATION = {
  label: 'Accra, Ghana',
  name: 'Accra, Ghana',
  url: null,
};

type RecordValue = Record<string, unknown>;

export type LumaImportDraft = {
  external_id: string;
  external_url: string | null;
  name: string;
  description: string | null;
  event_date: string;
  end_date: string | null;
  cover: string | null;
  registration_url: string | null;
  location: {
    label: string;
    name: string;
    url: string | null;
  };
};

export class LumaPageFetchError extends Error {
  constructor(readonly status: number) {
    super(`Luma page returned status ${status}.`);
    this.name = 'LumaPageFetchError';
  }
}

export function lumaImportFailure(
  error: unknown,
  fallbackMessage: string,
): { status: 429 | 502; message: string } {
  if (error instanceof LumaPageFetchError && error.status === 429) {
    return {
      status: 429,
      message: 'Luma is temporarily limiting imports from DevCongress. Please try again later.',
    };
  }

  return {
    status: 502,
    message: fallbackMessage,
  };
}

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const candidate = stringValue(value);
    if (candidate) return candidate;
  }
  return null;
}

function htmlDecode(value: string): string {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripLumaSuffix(value: string): string {
  return value.replace(/\s+[·|-]\s+Luma$/i, '').trim();
}

function normalizePublicLumaUrl(input: string): URL | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' || !PUBLIC_LUMA_HOSTS.has(url.hostname.toLowerCase())) {
    return null;
  }

  const pathParts = url.pathname.split('/').filter(Boolean);
  if (pathParts.length === 0) return null;

  url.hash = '';
  return url;
}

function lumaExternalIdFromUrl(url: string): string | null {
  const normalized = normalizePublicLumaUrl(url);
  if (!normalized) return null;

  return normalized.pathname.split('/').filter(Boolean)[0] ?? null;
}

function metaContent(html: string, attribute: 'property' | 'name', key: string): string | null {
  const pattern = new RegExp(`<meta[^>]+${attribute}=["']${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i');
  const reversePattern = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attribute}=["']${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`, 'i');
  const match = html.match(pattern) ?? html.match(reversePattern);
  return match?.[1] ? htmlDecode(match[1]) : null;
}

function findJsonLdEvents(html: string): RecordValue[] {
  const events: RecordValue[] = [];
  const scriptPattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = scriptPattern.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1] ?? '');
      collectJsonLdEvents(parsed, events);
    } catch {
      // Ignore malformed blocks; metadata fallback still gives a useful draft.
    }
  }

  return events;
}

function collectJsonLdEvents(value: unknown, output: RecordValue[]) {
  if (Array.isArray(value)) {
    for (const item of value) collectJsonLdEvents(item, output);
    return;
  }

  if (!isRecord(value)) return;

  const type = value['@type'];
  if (type === 'Event' || (Array.isArray(type) && type.includes('Event'))) {
    output.push(value);
  }

  if (Array.isArray(value['@graph'])) {
    collectJsonLdEvents(value['@graph'], output);
  }
}

function locationFromJsonLd(value: unknown): LumaImportDraft['location'] {
  if (!isRecord(value)) return DEFAULT_LOCATION;

  const address = isRecord(value.address) ? value.address : null;
  const name = firstString(value.name, address?.streetAddress);
  const city = firstString(address?.addressLocality, address?.addressRegion);
  const country = firstString(address?.addressCountry);
  const label = [name, city, country].filter(Boolean).join(', ');

  return {
    label: label || DEFAULT_LOCATION.label,
    name: name ?? label ?? DEFAULT_LOCATION.name,
    url: null,
  };
}

function imageFromJsonLd(value: unknown): string | null {
  if (Array.isArray(value)) return firstString(...value);
  return firstString(value);
}

export function parsePublicLumaEventHtml(eventUrl: string, html: string): LumaImportDraft | null {
  const url = normalizePublicLumaUrl(eventUrl);
  if (!url) return null;

  const canonicalUrl = metaContent(html, 'property', 'og:url')
    ?? html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i)?.[1]
    ?? url.toString();
  const normalizedCanonicalUrl = normalizePublicLumaUrl(htmlDecode(canonicalUrl))?.toString() ?? url.toString();
  const externalId = lumaExternalIdFromUrl(normalizedCanonicalUrl);
  if (!externalId) return null;

  const jsonLdEvent = findJsonLdEvents(html)[0];
  const metaTitle = metaContent(html, 'property', 'og:title') ?? metaContent(html, 'name', 'twitter:title');
  const metaDescription = metaContent(html, 'property', 'og:description') ?? metaContent(html, 'name', 'description');
  const metaImage = metaContent(html, 'property', 'og:image') ?? metaContent(html, 'name', 'image');
  const name = firstString(jsonLdEvent?.name, metaTitle ? stripLumaSuffix(metaTitle) : null);
  const eventDate = firstString(jsonLdEvent?.startDate);

  if (!name || !eventDate) {
    return null;
  }

  return {
    external_id: externalId,
    external_url: normalizedCanonicalUrl,
    name,
    description: firstString(jsonLdEvent?.description, metaDescription),
    event_date: eventDate,
    end_date: firstString(jsonLdEvent?.endDate),
    cover: imageFromJsonLd(jsonLdEvent?.image) ?? metaImage,
    registration_url: normalizedCanonicalUrl,
    location: locationFromJsonLd(jsonLdEvent?.location),
  };
}

export async function getPublicLumaEventByUrl(eventUrl: string): Promise<LumaImportDraft | null> {
  let url = normalizePublicLumaUrl(eventUrl);
  if (!url) {
    throw new Error('Enter a valid public Luma event URL.');
  }

  for (let redirectCount = 0; redirectCount < 3; redirectCount += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url, {
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'DevCongressCommunityImporter/1.0',
      },
    }).finally(() => clearTimeout(timeout));

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) break;

      const nextUrl = normalizePublicLumaUrl(new URL(location, url).toString());
      if (!nextUrl) {
        throw new Error('Luma redirected to an unsupported URL.');
      }
      url = nextUrl;
      continue;
    }

    if (!response.ok) {
      throw new LumaPageFetchError(response.status);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html')) {
      throw new Error('That Luma URL did not return an event page.');
    }

    const html = await response.text();
    if (html.length > MAX_PUBLIC_EVENT_HTML_CHARS) {
      throw new Error('That Luma page is too large to import safely.');
    }

    return parsePublicLumaEventHtml(url.toString(), html);
  }

  throw new Error('Unable to follow the Luma event URL.');
}
