const DEFAULT_BASE_URL = 'http://localhost:3000';
const baseUrl = (process.env.PUBLIC_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '');
const origin = process.env.PUBLIC_API_TEST_ORIGIN ?? 'http://localhost:4321';

type PublicMeetup = {
  id: unknown;
  slug: unknown;
  name: unknown;
  status: unknown;
  start: unknown;
  end: unknown;
  description: unknown;
  cover: unknown;
  location: unknown;
  stream_url: unknown;
  embed_stream: unknown;
  registration_url: unknown;
  speakers: unknown;
  schedule: unknown;
  photos: unknown;
  videos: unknown;
  talks_count: unknown;
  published_talks_count: unknown;
  cfp_url: unknown;
  archive_url: unknown;
  updated_at: unknown;
};

type JsonResponse<T> = {
  data?: T;
  meta?: Record<string, unknown>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertString(value: unknown, field: string) {
  assert(typeof value === 'string' && value.length > 0, `${field} must be a non-empty string`);
}

function assertNullableString(value: unknown, field: string) {
  assert(value === null || typeof value === 'string', `${field} must be null or a string`);
}

function assertIsoDate(value: unknown, field: string) {
  assertString(value, field);
  assert(!Number.isNaN(Date.parse(value)), `${field} must be an ISO date string`);
}

function assertWebsiteDateTime(value: unknown, field: string) {
  assertIsoDate(value, field);
  assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(value), `${field} must match the Astro meetup datetime format`);
}

function assertNullableUrl(value: unknown, field: string) {
  assertNullableString(value, field);
  assert(value === null || URL.canParse(value), `${field} must be null or a full URL`);
}

function assertUrl(value: unknown, field: string) {
  assertString(value, field);
  assert(URL.canParse(value), `${field} must be a full URL`);
}

function assertMeetup(value: unknown, label: string): asserts value is PublicMeetup {
  assert(value && typeof value === 'object', `${label} must be an object`);
  const meetup = value as PublicMeetup;

  assertString(meetup.id, `${label}.id`);
  assertString(meetup.slug, `${label}.slug`);
  assertString(meetup.name, `${label}.name`);
  assert(['upcoming', 'live', 'past'].includes(String(meetup.status)), `${label}.status must be upcoming, live, or past`);
  assertWebsiteDateTime(meetup.start, `${label}.start`);
  assertWebsiteDateTime(meetup.end, `${label}.end`);
  assertString(meetup.description, `${label}.description`);
  assertString(meetup.cover, `${label}.cover`);
  assert(meetup.location && typeof meetup.location === 'object', `${label}.location must be an object`);
  assertString((meetup.location as { name?: unknown }).name, `${label}.location.name`);
  assertNullableUrl((meetup.location as { url?: unknown }).url ?? null, `${label}.location.url`);
  assertNullableUrl(meetup.stream_url, `${label}.stream_url`);
  assert(typeof meetup.embed_stream === 'boolean', `${label}.embed_stream must be a boolean`);
  assertNullableUrl(meetup.registration_url, `${label}.registration_url`);
  assert(Array.isArray(meetup.speakers), `${label}.speakers must be an array`);
  meetup.speakers.forEach((speaker, index) => {
    assert(speaker && typeof speaker === 'object', `${label}.speakers[${index}] must be an object`);
    assertUrl((speaker as { image?: unknown }).image, `${label}.speakers[${index}].image`);
  });
  assert(Array.isArray(meetup.schedule), `${label}.schedule must be an array`);
  meetup.schedule.forEach((item, index) => {
    assert(item && typeof item === 'object', `${label}.schedule[${index}] must be an object`);
    const resources = (item as { resources?: unknown }).resources;
    assert(Array.isArray(resources), `${label}.schedule[${index}].resources must be an array`);
    resources.forEach((resource, resourceIndex) => {
      assert(resource && typeof resource === 'object', `${label}.schedule[${index}].resources[${resourceIndex}] must be an object`);
      assertUrl((resource as { url?: unknown }).url, `${label}.schedule[${index}].resources[${resourceIndex}].url`);
    });
  });
  assert(Array.isArray(meetup.photos), `${label}.photos must be an array`);
  assert(Array.isArray(meetup.videos), `${label}.videos must be an array`);
  assert(typeof meetup.talks_count === 'number', `${label}.talks_count must be a number`);
  assert(typeof meetup.published_talks_count === 'number', `${label}.published_talks_count must be a number`);
  assertNullableUrl(meetup.cfp_url, `${label}.cfp_url`);
  assertUrl(meetup.archive_url, `${label}.archive_url`);
  assertWebsiteDateTime(meetup.updated_at, `${label}.updated_at`);
}

async function getJson<T>(route: string): Promise<{ response: globalThis.Response; payload: JsonResponse<T> }> {
  const response = await fetch(`${baseUrl}${route}`, {
    headers: { Origin: origin },
  });
  const payload = await response.json() as JsonResponse<T>;
  return { response, payload };
}

function assertPublicHeaders(response: globalThis.Response, label: string) {
  assert(response.status === 200, `${label} returned HTTP ${response.status}`);
  assert(response.headers.get('cache-control')?.includes('public'), `${label} must send public cache headers`);
  assert(response.headers.get('access-control-allow-origin') === '*', `${label} must allow cross-origin reads`);
}

const list = await getJson<PublicMeetup[]>('/api/public/meetups');
assertPublicHeaders(list.response, 'GET /api/public/meetups');
assert(Array.isArray(list.payload.data), 'meetups response data must be an array');
assert(list.payload.data.length > 0, 'meetups response must include at least one meetup');
assert(list.payload.meta?.source === 'devcongress-comm', 'meetups meta.source must be devcongress-comm');
assert(list.payload.meta?.version === 1, 'meetups meta.version must be 1');

const firstMeetup = list.payload.data[0];
assertMeetup(firstMeetup, 'meetups[0]');

const detail = await getJson<PublicMeetup>(`/api/public/meetups/${firstMeetup.slug}`);
assertPublicHeaders(detail.response, 'GET /api/public/meetups/:slug');
assertMeetup(detail.payload.data, 'meetup detail');
assert(detail.payload.data.id === firstMeetup.id, 'meetup detail must match list item id');

const talks = await getJson<unknown[]>(`/api/public/meetups/${firstMeetup.slug}/talks`);
assertPublicHeaders(talks.response, 'GET /api/public/meetups/:slug/talks');
assert(Array.isArray(talks.payload.data), 'meetup talks data must be an array');
talks.payload.data.forEach((item, index) => {
  assert(item && typeof item === 'object', `meetup talks data[${index}] must be an object`);
  const archiveItem = item as Record<string, unknown>;
  assert(
    archiveItem.kind === 'talk' || archiveItem.kind === 'product_demo',
    `meetup talks data[${index}].kind must be talk or product_demo`,
  );
  assertString(archiveItem.event_name, `meetup talks data[${index}].event_name`);
  assert(!('speaker_email' in archiveItem), `meetup talks data[${index}] must not expose speaker_email`);
});
assert(talks.payload.meta?.meetup_id === firstMeetup.id, 'talks meta.meetup_id must match meetup id');
assert(talks.payload.meta?.meetup_slug === firstMeetup.slug, 'talks meta.meetup_slug must match meetup slug');

console.log(JSON.stringify({
  ok: true,
  baseUrl,
  origin,
  meetups: list.payload.data.length,
  checked_slug: firstMeetup.slug,
  talks: talks.payload.data.length,
}, null, 2));
