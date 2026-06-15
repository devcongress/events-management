import type { Context } from 'hono';
import { getSupabaseAdminClient, isSupabaseServerConfigured } from './server';
import type { Event, EventStatus, PublicMeetup, PublicMeetupScheduleItem, PublicMeetupSpeaker } from '@/types';
import type { CommunityEventStatus, Database, Json } from '@/types/supabase';

type CommunityEventRow = Database['public']['Tables']['community_events']['Row'];
type CommunityEventInsert = Database['public']['Tables']['community_events']['Insert'];
type CommunityEventUpdate = Database['public']['Tables']['community_events']['Update'];

const DEFAULT_COVER = '/images/apr-meetup.jpg';
const DEFAULT_LOCATION = {
  label: 'Accra, Ghana',
  name: 'Accra, Ghana',
  url: null,
};

export type CreateCommunityEventInput = {
  name: string;
  description: string | null;
  event_date: string;
  end_date?: string | null;
  slug?: string | null;
  cover?: string | null;
  location?: {
    label?: string | null;
    name?: string | null;
    url?: string | null;
  } | null;
  registration_url?: string | null;
  stream_url?: string | null;
  embed_stream?: boolean;
  publish_to_website?: boolean;
};

export function canUseSupabaseCommunityEvents(c?: Context): boolean {
  return isSupabaseServerConfigured(c);
}

export async function getSupabaseCommunityEvents(c?: Context): Promise<Event[] | null> {
  if (!canUseSupabaseCommunityEvents(c)) return null;

  const { data, error } = await getSupabaseAdminClient(c)
    .from('community_events')
    .select('*')
    .order('starts_at', { ascending: false });

  if (error) return null;
  return data.map(toEvent);
}

export async function getSupabaseCommunityEventById(id: string, c?: Context): Promise<Event | null | undefined> {
  if (!canUseSupabaseCommunityEvents(c)) return null;

  const { data, error } = await getSupabaseAdminClient(c)
    .from('community_events')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) return null;
  return data ? toEvent(data) : undefined;
}

export async function createSupabaseCommunityEvent(input: CreateCommunityEventInput, c?: Context): Promise<Event | null> {
  if (!canUseSupabaseCommunityEvents(c)) return null;

  const startsAt = new Date(input.event_date);
  const endsAt = input.end_date ? new Date(input.end_date) : defaultEndDate(startsAt);
  const location = input.location ?? DEFAULT_LOCATION;
  const insert: CommunityEventInsert = {
    slug: input.slug?.trim() || uniqueSlug(slugify(input.name)),
    name: input.name,
    description: input.description,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    status: 'draft',
    cover_url: input.cover || DEFAULT_COVER,
    location_label: location.label ?? location.name ?? DEFAULT_LOCATION.label,
    location_name: location.name ?? DEFAULT_LOCATION.name,
    location_url: location.url ?? null,
    registration_url: input.registration_url ?? null,
    stream_url: input.stream_url ?? null,
    embed_stream: input.embed_stream ?? false,
    publish_to_website: input.publish_to_website ?? false,
  };

  const { data, error } = await getSupabaseAdminClient(c)
    .from('community_events')
    .insert(insert)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return toEvent(data);
}

export async function updateSupabaseCommunityEvent(
  id: string,
  input: Partial<Event> & Record<string, unknown>,
  c?: Context,
): Promise<Event | null | undefined> {
  if (!canUseSupabaseCommunityEvents(c)) return null;

  const update: CommunityEventUpdate = {};

  if (typeof input.name === 'string') update.name = input.name;
  if ('description' in input) update.description = typeof input.description === 'string' ? input.description : null;
  if (typeof input.event_date === 'string') update.starts_at = new Date(input.event_date).toISOString();
  if (typeof input.end_date === 'string') update.ends_at = new Date(input.end_date).toISOString();
  if (typeof input.status === 'string') update.status = input.status as CommunityEventStatus;
  if (typeof input.slug === 'string') update.slug = input.slug;
  if (typeof input.cover === 'string') update.cover_url = input.cover;
  if (typeof input.stream_url === 'string' || input.stream_url === null) update.stream_url = input.stream_url ?? null;
  if (typeof input.embed_stream === 'boolean') update.embed_stream = input.embed_stream;
  if (typeof input.registration_url === 'string' || input.registration_url === null) update.registration_url = input.registration_url ?? null;
  if (typeof input.publish_to_website === 'boolean') update.publish_to_website = input.publish_to_website;
  if (input.location && typeof input.location === 'object') {
    const location = input.location as Event['location'];
    update.location_label = location?.label ?? null;
    update.location_name = location?.name ?? DEFAULT_LOCATION.name;
    update.location_url = location?.url ?? null;
  }
  if (Array.isArray(input.schedule)) update.schedule = input.schedule as unknown as Json[];
  if (Array.isArray(input.photos)) update.photos = input.photos as Json[];
  if (Array.isArray(input.videos)) update.videos = input.videos as Json[];

  const { data, error } = await getSupabaseAdminClient(c)
    .from('community_events')
    .update(update)
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? toEvent(data) : undefined;
}

export async function getSupabasePublicMeetups(origin: string, c?: Context): Promise<PublicMeetup[] | null> {
  if (!canUseSupabaseCommunityEvents(c)) return null;

  const { data, error } = await getSupabaseAdminClient(c)
    .from('community_events')
    .select('*')
    .eq('publish_to_website', true)
    .order('starts_at', { ascending: false });

  if (error) return null;
  return data.map((row) => toPublicMeetup(row, origin));
}

function toEvent(row: CommunityEventRow): Event {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    event_date: row.starts_at,
    end_date: row.ends_at,
    status: row.status as EventStatus,
    cover: row.cover_url,
    location: {
      label: row.location_label ?? undefined,
      name: row.location_name,
      url: row.location_url,
    },
    stream_url: row.stream_url,
    embed_stream: row.embed_stream,
    registration_url: row.registration_url,
    schedule: normalizeSchedule(row.schedule),
    photos: normalizePhotos(row.photos),
    videos: normalizeVideos(row.videos),
    publish_to_website: row.publish_to_website,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toPublicMeetup(row: CommunityEventRow, origin: string): PublicMeetup {
  const schedule = normalizeSchedule(row.schedule);
  const speakers = normalizeSpeakers(row.speakers);

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: publicMeetupStatus(row.starts_at, row.ends_at),
    start: toWebsiteDateTime(row.starts_at),
    end: toWebsiteDateTime(row.ends_at),
    description: row.description ?? 'A DevCongress community meetup.',
    cover: row.cover_url,
    location: {
      label: row.location_label ?? undefined,
      name: row.location_name,
      url: row.location_url,
    },
    stream_url: row.stream_url,
    embed_stream: row.embed_stream,
    registration_url: row.registration_url,
    speakers,
    schedule,
    photos: normalizePhotos(row.photos),
    videos: normalizeVideos(row.videos),
    talks_count: schedule.filter((item) => item.type === 'talk').length,
    published_talks_count: speakers.length,
    cfp_url: row.status === 'cfp_open' ? absoluteAppUrl(origin, `/cfp/${row.id}`) : null,
    archive_url: absoluteAppUrl(origin, `/archive/${row.id}`),
    updated_at: toWebsiteDateTime(row.updated_at),
  };
}

function normalizeSchedule(value: Json[]): PublicMeetupScheduleItem[] {
  return value
    .filter(isRecord)
    .map((item) => ({
      time: stringValue(item.time, 'TBD'),
      title: stringValue(item.title, 'Untitled session'),
      type: scheduleType(item.type),
      lead: typeof item.lead === 'string' ? item.lead : null,
      resources: Array.isArray(item.resources)
        ? item.resources.filter(isRecord).map((resource) => ({
          title: stringValue(resource.title, 'Resource'),
          url: stringValue(resource.url, '#'),
        }))
        : [],
    }));
}

function normalizeSpeakers(value: Json[]): PublicMeetupSpeaker[] {
  return value
    .filter(isRecord)
    .map((speaker) => ({
      name: stringValue(speaker.name, 'Speaker'),
      title: stringValue(speaker.title, 'DevCongress community speaker'),
      bio: typeof speaker.bio === 'string' ? speaker.bio : null,
      image: stringValue(speaker.image, '/images/logo.png'),
      talk_title: stringValue(speaker.talk_title, 'Community talk'),
      talk_description: typeof speaker.talk_description === 'string' ? speaker.talk_description : null,
      slides_url: typeof speaker.slides_url === 'string' ? speaker.slides_url : null,
      recording_url: typeof speaker.recording_url === 'string' ? speaker.recording_url : null,
      socials: Array.isArray(speaker.socials)
        ? speaker.socials.filter(isRecord).flatMap((social) => {
          const platform = social.platform === 'github' || social.platform === 'website' ? social.platform : null;
          return platform && typeof social.url === 'string' ? [{ platform, url: social.url }] : [];
        })
        : [],
    }));
}

function normalizePhotos(value: Json[]): PublicMeetup['photos'] {
  return value
    .filter(isRecord)
    .map((photo) => ({
      url: stringValue(photo.url, ''),
      type: (photo.type === 'folder' ? 'folder' : 'image') as 'folder' | 'image',
    }))
    .filter((photo) => photo.url.length > 0);
}

function normalizeVideos(value: Json[]): PublicMeetup['videos'] {
  return value
    .filter(isRecord)
    .map((video) => ({
      title: stringValue(video.title, 'Recording'),
      embed_url: stringValue(video.embed_url, ''),
    }))
    .filter((video) => video.embed_url.length > 0);
}

function isRecord(value: Json): value is Record<string, Json> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stringValue(value: Json | undefined, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function scheduleType(value: Json | undefined): PublicMeetupScheduleItem['type'] {
  if (
    value === 'networking'
    || value === 'talk'
    || value === 'panel'
    || value === 'workshop'
    || value === 'open_discussion'
    || value === 'break'
  ) {
    return value;
  }

  return 'talk';
}

function publicMeetupStatus(startsAt: string, endsAt: string): PublicMeetup['status'] {
  const now = Date.now();
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  if (now < start) return 'upcoming';
  if (now <= end) return 'live';
  return 'past';
}

function toWebsiteDateTime(value: string): string {
  const iso = new Date(value).toISOString();
  return `${iso.slice(0, 19)}+00:00`;
}

function absoluteAppUrl(origin: string, path: string): string {
  return new URL(path, origin).toString();
}

function defaultEndDate(startsAt: Date): Date {
  const end = new Date(startsAt);
  end.setHours(end.getHours() + 5);
  return end;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function uniqueSlug(slug: string): string {
  return `${slug}-${Date.now().toString(36)}`;
}
