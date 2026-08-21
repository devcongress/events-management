import { safePublicResourceUrl } from './safe-url';

export const EVENT_PAGE_MONITOR_MAX_REDIRECTS = 3;
export const EVENT_PAGE_MONITOR_MAX_BYTES = 256 * 1024;
export const EVENT_PAGE_MONITOR_MANUAL_COOLDOWN_MS = 5 * 60 * 1000;

export type EventPageMonitorSnapshot = {
  source_url: string;
  final_url: string | null;
  name: string | null;
  starts_at: string | null;
  ends_at: string | null;
  location: string | null;
  event_status: string | null;
  registration_url: string | null;
};

export type EventPageMonitorDifference = {
  field: keyof EventPageMonitorSnapshot;
  expected: string | null;
  observed: string | null;
};

export type EventPageInspection = {
  ok: boolean;
  kind: 'observed' | 'unavailable' | 'unmonitorable';
  http_status: number | null;
  error: string | null;
  snapshot: EventPageMonitorSnapshot | null;
};

export type MonitorableEvent = {
  name: string;
  event_date: string;
  end_date?: string | null;
  registration_url?: string | null;
  location?: { name?: string | null; label?: string | null } | null;
  venue_address?: string | null;
};

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return clean ? clean.slice(0, 500) : null;
}

function absolutePublicUrl(value: unknown, base: string): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    return safePublicResourceUrl(new URL(value, base).toString());
  } catch {
    return null;
  }
}

function normalizedDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function jsonLdEvent(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = jsonLdEvent(item);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const type = record['@type'];
  if (type === 'Event' || (Array.isArray(type) && type.includes('Event'))) return record;
  return jsonLdEvent(record['@graph']);
}

function eventLocation(value: unknown): string | null {
  if (typeof value === 'string') return cleanText(value);
  if (!value || typeof value !== 'object') return null;
  const location = value as Record<string, unknown>;
  const address = location.address;
  const addressText = typeof address === 'string'
    ? address
    : address && typeof address === 'object'
      ? Object.values(address as Record<string, unknown>).filter((item) => typeof item === 'string').join(', ')
      : '';
  return cleanText([location.name, addressText].filter(Boolean).join(', '));
}

function eventRegistrationUrl(value: Record<string, unknown>, base: string): string | null {
  const offers = Array.isArray(value.offers) ? value.offers[0] : value.offers;
  if (offers && typeof offers === 'object') {
    const offerUrl = absolutePublicUrl((offers as Record<string, unknown>).url, base);
    if (offerUrl) return offerUrl;
  }
  return null;
}

function metaContent(html: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i'),
  ];
  for (const pattern of patterns) {
    const value = html.match(pattern)?.[1];
    if (value) return cleanText(value);
  }
  return null;
}

function structuredEvent(html: string): Record<string, unknown> | null {
  const scripts = html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of scripts) {
    try {
      const found = jsonLdEvent(JSON.parse(match[1] ?? ''));
      if (found) return found;
    } catch {
      // Ignore malformed third-party metadata and continue to safe fallbacks.
    }
  }
  return null;
}

export function baselineForEvent(event: MonitorableEvent): EventPageMonitorSnapshot | null {
  const sourceUrl = safePublicResourceUrl(event.registration_url);
  if (!sourceUrl) return null;
  return {
    source_url: sourceUrl,
    final_url: sourceUrl,
    name: cleanText(event.name),
    starts_at: normalizedDate(event.event_date),
    ends_at: normalizedDate(event.end_date),
    location: cleanText([event.location?.name ?? event.location?.label, event.venue_address].filter(Boolean).join(', ')),
    event_status: null,
    registration_url: sourceUrl,
  };
}

export function nextEventPageCheckAt(eventStart: string, eventEnd: string | null | undefined, now = new Date()): string | null {
  const startsAt = Date.parse(eventStart);
  const endsAt = Date.parse(eventEnd || eventStart);
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= now.getTime()) return null;
  const remaining = startsAt - now.getTime();
  const day = 24 * 60 * 60 * 1000;
  const interval = remaining > 30 * day
    ? 14 * day
    : remaining > 7 * day
      ? 3 * day
      : remaining > day
        ? 12 * 60 * 60 * 1000
        : 2 * 60 * 60 * 1000;
  return new Date(now.getTime() + interval).toISOString();
}

function comparable(value: string | null): string | null {
  if (!value) return null;
  return value.trim().replace(/\s+/g, ' ').replace(/\/+$/, '').toLowerCase();
}

export function compareEventPageSnapshots(
  expected: EventPageMonitorSnapshot,
  observed: EventPageMonitorSnapshot,
): EventPageMonitorDifference[] {
  const fields: Array<keyof EventPageMonitorSnapshot> = ['final_url', 'name', 'starts_at', 'ends_at', 'location', 'registration_url'];
  const differences = fields.flatMap((field) => {
    if (!observed[field] || comparable(expected[field]) === comparable(observed[field])) return [];
    return [{ field, expected: expected[field], observed: observed[field] }];
  });
  if (observed.event_status && /(cancel|postpon)/i.test(observed.event_status)) {
    differences.push({ field: 'event_status', expected: expected.event_status, observed: observed.event_status });
  }
  return differences;
}

async function limitedHtml(response: Response): Promise<string> {
  if (!response.body) return (await response.text()).slice(0, EVENT_PAGE_MONITOR_MAX_BYTES);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let html = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > EVENT_PAGE_MONITOR_MAX_BYTES) {
      await reader.cancel();
      throw new Error('The page is too large to inspect safely.');
    }
    html += decoder.decode(value, { stream: true });
  }
  return html + decoder.decode();
}

export async function inspectEventPage(source: string, fetcher: typeof fetch = fetch): Promise<EventPageInspection> {
  const sourceUrl = safePublicResourceUrl(source);
  if (!sourceUrl) return { ok: false, kind: 'unmonitorable', http_status: null, error: 'Registration page must be a public HTTPS URL.', snapshot: null };

  let current = sourceUrl;
  for (let redirects = 0; redirects <= EVENT_PAGE_MONITOR_MAX_REDIRECTS; redirects += 1) {
    let response: Response;
    try {
      response = await fetcher(current, {
        method: 'GET',
        redirect: 'manual',
        headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'DevCongress-Event-Monitor/1.0' },
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      return { ok: false, kind: 'unavailable', http_status: null, error: 'The registration page could not be reached.', snapshot: null };
    }

    if (response.status >= 300 && response.status < 400) {
      if (redirects === EVENT_PAGE_MONITOR_MAX_REDIRECTS) return { ok: false, kind: 'unmonitorable', http_status: response.status, error: 'The registration page redirects too many times.', snapshot: null };
      const location = response.headers.get('location');
      const next = absolutePublicUrl(location, current);
      if (!next) return { ok: false, kind: 'unmonitorable', http_status: response.status, error: 'The registration page redirects to an unsafe or invalid URL.', snapshot: null };
      current = next;
      continue;
    }

    if (!response.ok) return { ok: false, kind: 'unavailable', http_status: response.status, error: `The registration page returned HTTP ${response.status}.`, snapshot: null };
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      return { ok: false, kind: 'unmonitorable', http_status: response.status, error: 'The registration URL did not return an HTML page.', snapshot: null };
    }

    let html: string;
    try {
      html = await limitedHtml(response);
    } catch (error) {
      return { ok: false, kind: 'unmonitorable', http_status: response.status, error: error instanceof Error ? error.message : 'The page could not be inspected.', snapshot: null };
    }
    const structured = structuredEvent(html);
    const title = structured ? cleanText(structured.name) : metaContent(html, 'og:title');
    const rawStatus = structured ? cleanText(structured.eventStatus) : null;
    const pageTitle = cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
    const cancellation = rawStatus || (/(cancelled|canceled|postponed)/i.test(`${title ?? ''} ${pageTitle ?? ''}`)
      ? `${title ?? pageTitle ?? 'Event'} appears cancelled or postponed`
      : null);
    return {
      ok: true,
      kind: 'observed',
      http_status: response.status,
      error: null,
      snapshot: {
        source_url: sourceUrl,
        final_url: current,
        name: title,
        starts_at: structured ? normalizedDate(structured.startDate) : normalizedDate(metaContent(html, 'event:start_time')),
        ends_at: structured ? normalizedDate(structured.endDate) : normalizedDate(metaContent(html, 'event:end_time')),
        location: structured ? eventLocation(structured.location) : metaContent(html, 'event:location'),
        event_status: cancellation,
        registration_url: structured ? eventRegistrationUrl(structured, current) : null,
      },
    };
  }
  return { ok: false, kind: 'unmonitorable', http_status: null, error: 'The registration page could not be inspected.', snapshot: null };
}

export function monitorDifferenceFingerprint(differences: EventPageMonitorDifference[]): string | null {
  if (differences.length === 0) return null;
  const serialized = JSON.stringify([...differences].sort((a, b) => a.field.localeCompare(b.field)));
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `v1-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
