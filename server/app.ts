import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { SIMULATED_DELAY_MS } from '@/lib/constants';
import { compareSecretAnswer, hashSecretAnswer } from '@/lib/account-claim';
import { attendanceUploadWindowForEvent } from '@/lib/attendance-upload-window';
import { evaluateRouteFeedbackRateLimit, recordRouteFeedbackSubmission, routeFeedbackRetryMessage } from '@/lib/feedback-rate-limit';
import { createEventFormSchema, toCreateEventApiPayload } from '@/src/lib/event-form';
import { inferEventSeriesType, isEventSeriesType } from '@/lib/event-series';
import { ROUTE_FEEDBACK_TURNSTILE_ACTION, validateTurnstileToken } from '@/lib/turnstile';
import { attendanceMonthForEvent, buildAttendanceInsights, buildAttendanceLedger, buildAttendanceSummary, getAttendanceImports, getLatestAttendanceImport, removeAttendanceImport, replaceAttendanceImportFromCsv } from '@/lib/mock-db/attendance';
import { getEventChecklist, updateEventChecklistItem } from '@/lib/mock-db/event-checklists';
import { createEvent as createMockEvent, deleteEvent as deleteMockEvent, getAllEvents as getAllMockEvents, getEventById as getMockEventById, updateEvent as updateMockEvent } from '@/lib/mock-db/events';
import { createDefaultFeedbackCampaign, createEventFeedbackSubmission, getAllFeedbackCampaigns, getAllFeedbackSubmissions, getFeedbackCampaignByEvent, getFeedbackSubmissionByResponseToken, getFeedbackSubmissionsByEvent, getOrCreateFeedbackCampaign, updateFeedbackCampaign } from '@/lib/mock-db/feedback';
import { createQuestion, deleteQuestion, getQuestionById, getQuestionsBySession, reorderQuestions, updateQuestion } from '@/lib/mock-db/questions';
import { readData, writeData } from '@/lib/mock-db';
import { createQuizParticipant, getQuizParticipantBySessionAndUser, getQuizParticipantsBySession, updateQuizParticipant } from '@/lib/mock-db/quiz-participants';
import { createQuizSession, getAllQuizSessions, getQuizSessionByCode, getQuizSessionById, getQuizSessionsByEvent, updateQuizSession } from '@/lib/mock-db/quiz-sessions';
import { createResponse, getResponseByQuestionAndUser, getResponsesByQuestion } from '@/lib/mock-db/responses';
import { addSpeaker, getSpeakerByEmail, getSpeakersByEvent, removeSpeaker } from '@/lib/mock-db/speakers';
import { getSupabaseAdminClient, isSupabaseServerConfigured } from '@/lib/supabase/server';
import { completeSupabaseAdminToken, configuredFrontendOrigins, defaultAdminRedirectPath, getAdminSession, isSupabaseAdminAuthConfigured, recordAdminAudit, requireAdmin, revokeAdminSession, startLocalAdminSession } from '@/lib/supabase/admin-auth';
import { createSupabaseCommunityEvent, deleteSupabaseCommunityEvent, deleteSupabaseCommunityEventsByImportMatch, getSupabaseCommunityEventByExternalId, getSupabaseCommunityEventById, getSupabaseCommunityEventByRegistrationUrl, getSupabaseCommunityEvents, getSupabasePublicMeetups, updateSupabaseCommunityEvent } from '@/lib/supabase/community-events';
import { uploadMeetupMedia, validateMeetupMediaFile } from '@/lib/supabase/media';
import { getPublicLumaEventByUrl, type LumaImportDraft } from '@/lib/luma/events';
import { createTalk, getAllTalks, getTalkById, getTalksByEvent, updateTalk } from '@/lib/mock-db/talks';
import { createUser, getAllUsers, getUserByDeviceId, getUserById, updateUser } from '@/lib/mock-db/users';
import { calculatePoints, calculateStreakBonus } from '@/lib/scoring';
import { now } from '@/lib/utils';
import { envValue } from '@/server/env';
import { advanceQuizSessionState, buildQuizStateResponse } from '@/server/quiz-state';
import type { Context } from 'hono';
import type { Event, EventChecklistItem, EventSeriesType, FeedbackAnswer, FeedbackCampaign, FeedbackCampaignStatus, FeedbackQuestion, FeedbackQuestionType, GeneratedQuizFromPaperResponse, LeaderboardEntry, PublicMeetup, PublicMeetupScheduleItem, PublicMeetupSpeaker, Question, QuizParticipant, Response, Talk, User } from '@/types';
import type { FeedbackKind, FeedbackStatus } from '@/types/supabase';

const app = new Hono();
const PUBLIC_MEETUP_COVERS = [
  '/images/apr-meetup.jpg',
  '/images/fido-dev-0375.jpg',
  '/images/fido-dev-0539.jpg',
];
const DEFAULT_MEETUP_LOCATION = {
  label: 'Accra, Ghana',
  name: 'Accra, Ghana',
  url: null,
};
const PAPER_QUIZ_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ATTENDANCE_CSV_MAX_BYTES = 2 * 1024 * 1024;
const PAPER_QUIZ_MAX_TEXT_CHARS = 60_000;
const PAPER_QUIZ_MIN_TEXT_CHARS = 350;
const PAPER_QUIZ_DEFAULT_QUESTION_COUNT = 5;
const PAPER_QUIZ_MAX_QUESTION_COUNT = 8;
const PAPER_QUIZ_GENERATION_NOTE = 'Prototype rule-based generation from extracted PDF text. Review and edit every question before going live.';
const FEEDBACK_AUTO_OPEN_DAYS = 3;
const FEEDBACK_AUTO_OPEN_MS = FEEDBACK_AUTO_OPEN_DAYS * 24 * 60 * 60 * 1000;
const EVENT_FEEDBACK_TOKEN_MIN_CHARS = 20;
const EVENT_FEEDBACK_TOKEN_MAX_CHARS = 160;
const EVENT_FEEDBACK_COMMENT_MAX_CHARS = 1500;
const FEEDBACK_SUBMISSION_MESSAGE_MAX_CHARS = 4000;
const FEEDBACK_CAMPAIGN_STATUSES = new Set<FeedbackCampaignStatus>(['draft', 'active', 'closed']);
const FEEDBACK_QUESTION_TYPES = new Set<FeedbackQuestionType>(['rating', 'text', 'choice', 'talk_select', 'yes_no']);
const ROUTE_FEEDBACK_STATUSES = new Set<FeedbackStatus>(['new', 'reviewing', 'done', 'wont_fix']);
const lumaImportSchema = z.object({
  event_url: z.string().trim().url(),
  series_type: z.enum(['monthly', 'quarterly', 'special']).optional(),
});
const addOrganizerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  display_name: z.string().trim().optional(),
  role: z.enum(['owner', 'organizer']).default('organizer'),
});
const auditLogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(60),
  actor: z.string().trim().optional(),
  action: z.string().trim().optional(),
  target_type: z.string().trim().optional(),
});
const STOP_WORDS = new Set([
  'about',
  'above',
  'after',
  'again',
  'against',
  'also',
  'among',
  'analysis',
  'another',
  'because',
  'before',
  'being',
  'between',
  'could',
  'during',
  'example',
  'first',
  'following',
  'from',
  'have',
  'into',
  'more',
  'most',
  'other',
  'over',
  'paper',
  'resource',
  'same',
  'such',
  'than',
  'that',
  'their',
  'there',
  'these',
  'this',
  'those',
  'through',
  'under',
  'using',
  'where',
  'which',
  'while',
  'with',
  'would',
]);

async function auditAdminAction(c: Context, input: {
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const session = await getAdminSession(c);
  if (!session.authenticated) return;

  await recordAdminAudit(c, {
    actor_user_id: session.user_id,
    actor_email: session.email,
    actor_role: session.role,
    action: input.action,
    target_type: input.targetType ?? null,
    target_id: input.targetId ?? null,
    metadata: input.metadata,
  });
}

function corsOrigin(origin: string | undefined, c: Context): string | undefined {
  if (!origin) return undefined;

  const allowedOrigins = configuredFrontendOrigins(c);
  if (allowedOrigins.has(origin) || origin.startsWith('http://localhost:')) {
    return origin;
  }

  return undefined;
}

app.use('/api/public/*', cors({
  origin: '*',
  allowMethods: ['GET', 'OPTIONS'],
  maxAge: 86400,
}));

app.use('/api/*', cors({
  origin: corsOrigin,
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
  credentials: true,
  maxAge: 86400,
}));

async function getAllEvents(c?: Context): Promise<Event[]> {
  return (await getSupabaseCommunityEvents(c)) ?? getAllMockEvents();
}

async function getEventById(id: string, c?: Context): Promise<Event | undefined> {
  const event = await getSupabaseCommunityEventById(id, c);
  if (event !== null) return event;
  return getMockEventById(id);
}

async function createEvent(data: {
  name: string;
  description: string | null;
  event_date: string;
  series_type?: EventSeriesType | null;
  end_date?: string | null;
  slug?: string | null;
  cover?: string | null;
  location?: Event['location'] | null;
  registration_url?: string | null;
  stream_url?: string | null;
  embed_stream?: boolean;
  photos?: Event['photos'];
  publish_to_website?: boolean;
}, c?: Context): Promise<Event> {
  const event = await createSupabaseCommunityEvent(data, c);
  if (event) return event;
  return createMockEvent({
    name: data.name,
    description: data.description,
    event_date: data.event_date,
    series_type: data.series_type,
  });
}

async function updateEvent(id: string, updates: Partial<Omit<Event, 'id' | 'created_at'>>, c?: Context): Promise<Event> {
  const event = await updateSupabaseCommunityEvent(id, updates, c);
  if (event !== null && event !== undefined) return event;
  return updateMockEvent(id, updates);
}

async function deleteEvent(id: string, c?: Context): Promise<void> {
  const deleted = await deleteSupabaseCommunityEvent(id, c);
  if (deleted !== null) return;
  await deleteMockEvent(id);
}

async function deleteImportedEvent(event: Event, c?: Context): Promise<{ deleted_ids: string[]; deleted: boolean }> {
  const deletedIds = await deleteSupabaseCommunityEventsByImportMatch(event, c);
  if (deletedIds !== null) {
    return {
      deleted_ids: deletedIds,
      deleted: deletedIds.length > 0,
    };
  }

  await deleteMockEvent(event.id);
  return {
    deleted_ids: [event.id],
    deleted: true,
  };
}

function lumaDraftToEventInput(lumaEvent: LumaImportDraft) {
  return {
    name: lumaEvent.name,
    description: lumaEvent.description,
    event_date: lumaEvent.event_date,
    series_type: inferEventSeriesType(lumaEvent.name),
    end_date: lumaEvent.end_date,
    cover: lumaEvent.cover ?? undefined,
    registration_url: lumaEvent.registration_url,
    location: lumaEvent.location,
    publish_to_website: false,
    external_source: 'luma',
    external_id: lumaEvent.external_id,
    external_url: lumaEvent.external_url,
    external_synced_at: new Date().toISOString(),
  };
}

async function findExistingLumaEvent(lumaEvent: LumaImportDraft, c: Context): Promise<Event | undefined> {
  const existingByExternalId = await getSupabaseCommunityEventByExternalId('luma', lumaEvent.external_id, c) ?? undefined;
  if (existingByExternalId) return existingByExternalId;

  if (!lumaEvent.registration_url) {
    return undefined;
  }

  return await getSupabaseCommunityEventByRegistrationUrl(lumaEvent.registration_url, c) ?? undefined;
}

function setPublicApiCache(c: Context) {
  c.header('Cache-Control', 'no-store');
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function eventSlug(event: Event): string {
  return `${slugify(event.name)}-${event.id.slice(0, 8)}`;
}

function toWebsiteDateTime(value: string): string {
  const iso = new Date(value).toISOString();
  return `${iso.slice(0, 19)}+00:00`;
}

function meetupEndDate(start: string): string {
  const date = new Date(start);
  date.setHours(date.getHours() + 3);
  return toWebsiteDateTime(date.toISOString());
}

function publicMeetupStatus(event: Event): PublicMeetup['status'] {
  if (event.status === 'live') return 'live';
  if (event.status === 'completed') return 'past';
  return new Date(event.event_date).getTime() > Date.now() ? 'upcoming' : 'past';
}

function coverForEvent(event: Event): string {
  if (event.cover) return event.cover;
  const charTotal = [...event.id].reduce((total, char) => total + char.charCodeAt(0), 0);
  return PUBLIC_MEETUP_COVERS[charTotal % PUBLIC_MEETUP_COVERS.length];
}

function absoluteAppUrl(origin: string, path: string): string {
  return new URL(path, origin).toString();
}

function validExternalUrl(value: string | null): string | null {
  return value && URL.canParse(value) ? value : null;
}

function isWebsiteMediaUrl(value: string): boolean {
  return value.startsWith('/') || URL.canParse(value);
}

function normalizeEventPhotos(value: unknown): NonNullable<Event['photos']> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((photo) => {
    if (!photo || typeof photo !== 'object') {
      return [];
    }

    const candidate = photo as { url?: unknown; type?: unknown };
    const url = typeof candidate.url === 'string' ? candidate.url.trim() : '';

    if (!url || !isWebsiteMediaUrl(url)) {
      return [];
    }

    return [{
      url,
      type: candidate.type === 'folder' ? 'folder' : 'image',
    }];
  });
}

function scheduleForTalks(talks: Talk[]): PublicMeetupScheduleItem[] {
  const publishedTalks = talks.filter((talk) => talk.status === 'published');
  const talkItems = publishedTalks.map((talk, index) => ({
    time: `${7 + index}:00 PM`,
    title: talk.title,
    type: 'talk' as const,
    lead: talk.speaker_name,
    resources: validExternalUrl(talk.slides_url) ? [{ title: 'Slides', url: talk.slides_url as string }] : [],
  }));

  return [
    {
      time: '6:00 PM',
      title: 'Doors open and networking',
      type: 'networking',
      lead: null,
      resources: [],
    },
    ...talkItems,
  ];
}

function speakersForTalks(talks: Talk[], origin: string): PublicMeetupSpeaker[] {
  return talks
    .filter((talk) => talk.status === 'published')
    .map((talk) => ({
      name: talk.speaker_name,
      title: talk.bio ?? 'DevCongress community speaker',
      bio: talk.bio,
      image: absoluteAppUrl(origin, '/images/fido-dev-0375.jpg'),
      talk_title: talk.title,
      talk_description: talk.abstract,
      slides_url: validExternalUrl(talk.slides_url),
      recording_url: null,
      socials: talk.github_username
        ? [{ platform: 'github', url: `https://github.com/${talk.github_username}` }]
        : [],
    }));
}

function toPublicMeetup(event: Event, eventTalks: Talk[], origin: string): PublicMeetup {
  const publishedTalks = eventTalks.filter((talk) => talk.status === 'published');
  const registrationUrl = event.registration_url
    ?? (event.status === 'cfp_open' || event.status === 'upcoming'
      ? absoluteAppUrl(origin, `/cfp/${event.id}`)
      : null);

  const location = event.location ?? DEFAULT_MEETUP_LOCATION;
  const endDate = event.end_date ? toWebsiteDateTime(event.end_date) : meetupEndDate(event.event_date);
  const photos = normalizeEventPhotos(event.photos);

  const cfpUrl = event.status === 'cfp_open'
    ? absoluteAppUrl(origin, `/cfp/${event.id}`)
    : null;

  return {
    id: event.id,
    slug: eventSlug(event),
    name: event.name,
    status: publicMeetupStatus(event),
    start: toWebsiteDateTime(event.event_date),
    end: endDate,
    description: event.description ?? 'A DevCongress community meetup for talks, peer learning, and practical developer conversations.',
    cover: coverForEvent(event),
    location,
    stream_url: event.stream_url ?? null,
    embed_stream: event.embed_stream ?? false,
    registration_url: registrationUrl,
    speakers: speakersForTalks(eventTalks, origin),
    schedule: event.schedule ?? scheduleForTalks(eventTalks),
    photos,
    videos: event.videos ?? [],
    talks_count: eventTalks.length,
    published_talks_count: publishedTalks.length,
    cfp_url: cfpUrl,
    archive_url: absoluteAppUrl(origin, `/archive/${event.id}`),
    updated_at: toWebsiteDateTime(event.updated_at),
  };
}

function toPreviewPublicMeetup(
  lumaEvent: LumaImportDraft,
  origin: string,
  existingEvent?: Event,
  seriesType?: EventSeriesType,
): PublicMeetup {
  const previewEvent: Event = {
    id: existingEvent?.id ?? `preview-${lumaEvent.external_id}`,
    name: lumaEvent.name,
    description: lumaEvent.description,
    event_date: lumaEvent.event_date,
    series_type: existingEvent?.series_type ?? seriesType ?? inferEventSeriesType(lumaEvent.name),
    end_date: lumaEvent.end_date ?? undefined,
    status: existingEvent?.status ?? 'upcoming',
    created_at: existingEvent?.created_at ?? now(),
    updated_at: now(),
    slug: existingEvent?.slug ?? slugify(lumaEvent.name),
    cover: lumaEvent.cover ?? undefined,
    location: lumaEvent.location,
    registration_url: lumaEvent.registration_url,
    schedule: existingEvent?.schedule ?? [],
    photos: existingEvent?.photos ?? [],
    videos: existingEvent?.videos ?? [],
    publish_to_website: true,
    external_source: 'luma',
    external_id: lumaEvent.external_id,
    external_url: lumaEvent.external_url,
    external_synced_at: new Date().toISOString(),
  };

  return toPublicMeetup(previewEvent, [], origin);
}

async function buildPublicMeetups(origin: string, c?: Context) {
  const [events, talks] = await Promise.all([getAllEvents(c), getAllTalks()]);
  return events
    .filter((event) => event.publish_to_website ?? event.status !== 'draft')
    .map((event) => toPublicMeetup(event, talks.filter((talk) => talk.event_id === event.id), origin))
    .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());
}

function publicAppOrigin(c: Context): string {
  return envValue('PUBLIC_APP_URL', c) ?? envValue('PUBLIC_FRONTEND_ORIGIN', c) ?? new URL(c.req.url).origin;
}

function feedbackCampaignWindow(event: Event, campaign: FeedbackCampaign): { opens_at: string | null; closes_at: string | null } {
  if (campaign.status === 'active') {
    return {
      opens_at: campaign.opens_at ?? null,
      closes_at: campaign.closes_at ?? null,
    };
  }

  const eventOpenDate = new Date(event.event_date);
  const eventOpenMs = eventOpenDate.getTime();
  const eventOpen = Number.isFinite(eventOpenMs) ? eventOpenDate : null;
  const explicitOpen = campaign.opens_at ? new Date(campaign.opens_at) : null;
  const validExplicitOpen = explicitOpen && Number.isFinite(explicitOpen.getTime()) ? explicitOpen : null;
  const opensAt = validExplicitOpen ?? eventOpen;
  const explicitClose = campaign.closes_at ? new Date(campaign.closes_at) : null;
  const validExplicitClose = explicitClose && Number.isFinite(explicitClose.getTime()) ? explicitClose : null;
  const autoClosesAt = eventOpen ? new Date(eventOpen.getTime() + FEEDBACK_AUTO_OPEN_MS) : null;
  const closesAt = validExplicitClose ?? autoClosesAt;

  return {
    opens_at: opensAt?.toISOString() ?? null,
    closes_at: closesAt?.toISOString() ?? null,
  };
}

function isFeedbackCampaignOpen(event: Event, campaign: FeedbackCampaign): boolean {
  const nowMs = Date.now();
  const window = feedbackCampaignWindow(event, campaign);
  const afterOpen = !window.opens_at || new Date(window.opens_at).getTime() <= nowMs;
  const beforeClose = !window.closes_at || new Date(window.closes_at).getTime() >= nowMs;
  const statusOpen = campaign.status === 'active'
    || (campaign.status === 'draft' && campaign.auto_open_on_event_completion && event.status === 'completed');

  return statusOpen && afterOpen && beforeClose;
}

function normalizeEventFeedbackResponseToken(input: unknown): string | null {
  if (typeof input !== 'string') return null;

  const token = input.trim();
  if (token.length < EVENT_FEEDBACK_TOKEN_MIN_CHARS || token.length > EVENT_FEEDBACK_TOKEN_MAX_CHARS) {
    return null;
  }

  return token;
}

async function hashEventFeedbackResponseToken(eventId: string, token: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`event-feedback:${eventId}:${token}`),
  );

  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function hasSupabaseFeedbackResponseToken(
  c: Context,
  eventId: string,
  campaignId: string,
  responseTokenHash: string,
): Promise<boolean> {
  if (!isSupabaseServerConfigured(c)) return false;

  const { data, error } = await getSupabaseAdminClient(c)
    .from('feedback_submissions')
    .select('id')
    .eq('event_id', eventId)
    .eq('campaign_id', campaignId)
    .eq('response_token_hash', responseTokenHash)
    .limit(1);

  if (error) return false;
  return Boolean(data?.length);
}

function normalizeFeedbackQuestions(input: unknown): FeedbackQuestion[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item, index) => {
      const raw = item as Partial<FeedbackQuestion>;
      const type = FEEDBACK_QUESTION_TYPES.has(raw.type as FeedbackQuestionType) ? raw.type as FeedbackQuestionType : 'text';
      const label = String(raw.label ?? '').trim();
      const options = Array.isArray(raw.options)
        ? raw.options.map((option) => String(option).trim()).filter(Boolean)
        : [];

      if (!label) {
        return null;
      }

      return {
        id: String(raw.id ?? crypto.randomUUID()),
        type,
        label,
        required: Boolean(raw.required),
        options,
        order_index: Number.isFinite(Number(raw.order_index)) ? Number(raw.order_index) : index,
      };
    })
    .filter((question): question is FeedbackQuestion => question !== null)
    .sort((a, b) => a.order_index - b.order_index)
    .map((question, index) => ({ ...question, order_index: index }));
}

function normalizeFeedbackAnswers(input: unknown): FeedbackAnswer[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => {
      const raw = item as Partial<FeedbackAnswer>;
      const rawValue = raw.value;
      const value = typeof rawValue === 'string' || typeof rawValue === 'number' || typeof rawValue === 'boolean' || rawValue === null
        ? rawValue
        : String(rawValue ?? '');

      return {
        question_id: String(raw.question_id ?? ''),
        value,
      };
    })
    .filter((answer) => answer.question_id);
}

function eventMonthKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 7);
  }

  return date.toISOString().slice(0, 7);
}

function eventMonthLabel(monthKey: string): string {
  const date = new Date(`${monthKey}-01T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return monthKey;
  }

  return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function formatInsightPercent(value: number | null): number | null {
  return value === null ? null : Math.round(value * 100);
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1));
}

function buildFeedbackInsights(
  campaign: FeedbackCampaign,
  submissions: Awaited<ReturnType<typeof getAllFeedbackSubmissions>>,
  talks: Talk[],
) {
  const questionsById = new Map(campaign.questions.map((question) => [question.id, question]));
  const talksById = new Map(talks.map((talk) => [talk.id, `${talk.title} · ${talk.speaker_name}`]));
  const ratings: number[] = [];
  const attendAgainValues: boolean[] = [];
  const talkCounts = new Map<string, number>();
  let commentCount = 0;

  for (const submission of submissions) {
    for (const answer of submission.answers) {
      const question = questionsById.get(answer.question_id);
      if (!question) continue;

      if (question.type === 'rating' && typeof answer.value === 'number') {
        ratings.push(answer.value);
      }

      if (question.type === 'yes_no' && typeof answer.value === 'boolean') {
        attendAgainValues.push(answer.value);
      }

      if (question.type === 'talk_select' && typeof answer.value === 'string' && answer.value.trim()) {
        talkCounts.set(answer.value, (talkCounts.get(answer.value) ?? 0) + 1);
      }

      if (question.type === 'text' && typeof answer.value === 'string' && answer.value.trim()) {
        commentCount += 1;
      }
    }
  }

  const topTalk = Array.from(talkCounts.entries()).sort((a, b) => b[1] - a[1])[0] ?? null;
  const attendAgainYesCount = attendAgainValues.filter(Boolean).length;

  return {
    average_rating: average(ratings),
    rating_count: ratings.length,
    attend_again_percent: formatInsightPercent(attendAgainValues.length === 0 ? null : attendAgainYesCount / attendAgainValues.length),
    attend_again_count: attendAgainValues.length,
    top_talk_label: topTalk ? talksById.get(topTalk[0]) ?? topTalk[0] : null,
    top_talk_count: topTalk?.[1] ?? 0,
    comment_count: commentCount,
  };
}

function checklistProgress(items: EventChecklistItem[]) {
  const completed = items.filter((item) => item.completed).length;
  const total = items.length;

  return {
    completed,
    total,
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

app.get('/api/health/supabase', async (c) => {
  if (!isSupabaseServerConfigured(c)) {
    return c.json({
      ok: false,
      configured: false,
      error: 'Supabase env is missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
    }, 503);
  }

  const supabase = getSupabaseAdminClient(c);
  const checks = await Promise.all([
    supabase.from('feedback_testers').select('id').limit(1),
    supabase.from('feedback_submissions').select('id').limit(1),
  ]);
  const error = checks.find((check) => check.error)?.error;

  if (error) {
    return c.json({
      ok: false,
      configured: true,
      error: error.message,
    }, 500);
  }

  return c.json({
    ok: true,
    configured: true,
  });
});

app.get('/api/health/supabase/community-events', async (c) => {
  if (!isSupabaseServerConfigured(c)) {
    return c.json({
      ok: false,
      configured: false,
      error: 'Supabase env is missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
    }, 503);
  }

  const { error } = await getSupabaseAdminClient(c)
    .from('community_events')
    .select('id')
    .limit(1);

  if (error) {
    return c.json({
      ok: false,
      configured: true,
      error: error.message,
    }, 500);
  }

  return c.json({
    ok: true,
    configured: true,
  });
});

app.get('/api/health/supabase/storage', async (c) => {
  if (!isSupabaseServerConfigured(c)) {
    return c.json({
      ok: false,
      configured: false,
      error: 'Supabase env is missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
    }, 503);
  }

  const { error } = await getSupabaseAdminClient(c)
    .storage
    .getBucket('meetup-media');

  if (error) {
    return c.json({
      ok: false,
      configured: true,
      error: error.message,
    }, 500);
  }

  return c.json({
    ok: true,
    configured: true,
  });
});

app.get('/api/health', (c) => {
  return c.json({
    ok: true,
    runtime: typeof Bun === 'undefined' ? 'vite-dev-server' : 'bun',
  });
});

app.get('/api/auth/session', async (c) => {
  const session = await getAdminSession(c);

  if (!session.authenticated) {
    return c.json({
      authenticated: false,
      auth_mode: isSupabaseAdminAuthConfigured(c) ? 'supabase' : 'local',
    });
  }

  return c.json({
    authenticated: true,
    auth_mode: session.mode,
    user: {
      email: session.email,
      display_name: session.display_name,
      role: session.role,
    },
  });
});

app.get('/api/feedback/testers', async (c) => {
  if (!isSupabaseServerConfigured(c)) {
    return c.json({ error: 'Feedback is not configured' }, 503);
  }

  const supabase = getSupabaseAdminClient(c);
  const { data, error } = await supabase
    .from('feedback_testers')
    .select('id, display_name')
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('display_name', { ascending: true });

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json(data ?? []);
});

app.post('/api/feedback', async (c) => {
  if (!isSupabaseServerConfigured(c)) {
    return c.json({ error: 'Feedback is not configured' }, 503);
  }

  const allowedTypes = new Set<FeedbackKind>(['bug', 'confusing', 'suggestion']);
  const body = await c.req.json();
  const type = String(body.type ?? '') as FeedbackKind;
  const message = String(body.message ?? '').trim();
  const turnstileAction = String(body.turnstile_action ?? '').trim();
  const turnstileToken = String(body.turnstile_token ?? '').trim();
  let testerId = typeof body.tester_id === 'string' && body.tester_id ? body.tester_id : null;
  let testerName = String(body.tester_name ?? '').trim();

  if (!allowedTypes.has(type)) {
    return c.json({ error: 'Invalid feedback type' }, 400);
  }

  if (!message) {
    return c.json({ error: 'Feedback message is required' }, 400);
  }

  if (message.length > 4000) {
    return c.json({ error: 'Feedback message is too long' }, 400);
  }

  const forwardedFor = c.req.header('cf-connecting-ip')
    ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'unknown';
  const userAgent = c.req.header('user-agent') ?? 'unknown';
  const turnstileSecretKey = envValue('TURNSTILE_SECRET_KEY', c);
  const turnstileHostname = envValue('TURNSTILE_EXPECTED_HOSTNAME', c);
  if (turnstileSecretKey) {
    const turnstileCheck = await validateTurnstileToken({
      token: turnstileToken,
      secretKey: turnstileSecretKey,
      remoteIp: forwardedFor !== 'unknown' ? forwardedFor : undefined,
      expectedAction: ROUTE_FEEDBACK_TURNSTILE_ACTION,
      expectedHostname: turnstileHostname,
    });

    if (!turnstileCheck.ok) {
      return c.json({ error: turnstileCheck.error }, turnstileCheck.status);
    }

    if (turnstileAction && turnstileAction !== ROUTE_FEEDBACK_TURNSTILE_ACTION) {
      return c.json({ error: 'Human verification did not match this form. Please try again.' }, 400);
    }
  } else if (turnstileToken || turnstileAction) {
    return c.json({ error: 'Human verification is temporarily unavailable. Please try again later.' }, 503);
  }
  const routeFeedbackClientKey = `${forwardedFor}::${userAgent}`;
  const rateLimit = evaluateRouteFeedbackRateLimit(routeFeedbackClientKey);
  if (!rateLimit.allowed) {
    const retryAfterSeconds = Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1000));
    c.header('Retry-After', String(retryAfterSeconds));
    return c.json({
      error: routeFeedbackRetryMessage(rateLimit),
      retry_after_seconds: retryAfterSeconds,
    }, 429);
  }

  const supabase = getSupabaseAdminClient(c);

  if (testerId) {
    const { data: tester, error } = await supabase
      .from('feedback_testers')
      .select('id, display_name')
      .eq('id', testerId)
      .eq('active', true)
      .maybeSingle();

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    if (!tester) {
      return c.json({ error: 'Selected tester was not found' }, 400);
    }

    testerName = tester.display_name;
  } else {
    testerId = null;
  }

  if (!testerName) {
    return c.json({ error: 'Tester name is required' }, 400);
  }

  const { data, error } = await supabase
    .from('feedback_submissions')
    .insert({
      tester_id: testerId,
      tester_name: testerName,
      type,
      message,
      trigger_source: 'route_feedback',
      page_path: typeof body.page_path === 'string' ? body.page_path : null,
      user_agent: c.req.header('user-agent') ?? null,
      viewport_width: Number.isFinite(Number(body.viewport_width)) ? Number(body.viewport_width) : null,
      viewport_height: Number.isFinite(Number(body.viewport_height)) ? Number(body.viewport_height) : null,
    })
    .select('id')
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  recordRouteFeedbackSubmission(routeFeedbackClientKey);
  return c.json({ id: data.id }, 201);
});

app.get('/api/feedback/inbox', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  if (!isSupabaseServerConfigured(c)) {
    return c.json({ error: 'Feedback is not configured' }, 503);
  }

  const statusParam = c.req.query('status');
  const status = ROUTE_FEEDBACK_STATUSES.has(statusParam as FeedbackStatus) ? statusParam as FeedbackStatus : null;
  const limitParam = Number(c.req.query('limit') ?? 80);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(Math.trunc(limitParam), 1), 120) : 80;

  let query = getSupabaseAdminClient(c)
    .from('feedback_submissions')
    .select('id, tester_name, type, message, trigger_source, page_path, user_agent, viewport_width, viewport_height, status, admin_note, created_at, updated_at')
    .is('event_id', null)
    .is('archived_at', null)
    .or('trigger_source.eq.route_feedback,trigger_source.is.null')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    return c.json({ error: 'Unable to load feedback inbox' }, 500);
  }

  const rows = data ?? [];
  return c.json({
    submissions: rows,
    summary: {
      total: rows.length,
      new: rows.filter((item) => item.status === 'new').length,
      reviewing: rows.filter((item) => item.status === 'reviewing').length,
      done: rows.filter((item) => item.status === 'done').length,
      wont_fix: rows.filter((item) => item.status === 'wont_fix').length,
    },
  });
});

app.patch('/api/feedback/inbox/:feedbackId', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  if (!isSupabaseServerConfigured(c)) {
    return c.json({ error: 'Feedback is not configured' }, 503);
  }

  const body = await c.req.json();
  const status = String(body.status ?? '') as FeedbackStatus;

  if (!ROUTE_FEEDBACK_STATUSES.has(status)) {
    return c.json({ error: 'Invalid feedback status' }, 400);
  }

  const { data, error } = await getSupabaseAdminClient(c)
    .from('feedback_submissions')
    .update({ status })
    .eq('id', c.req.param('feedbackId'))
    .is('event_id', null)
    .is('archived_at', null)
    .or('trigger_source.eq.route_feedback,trigger_source.is.null')
    .select('id, tester_name, type, message, trigger_source, page_path, user_agent, viewport_width, viewport_height, status, admin_note, created_at, updated_at')
    .maybeSingle();

  if (error) {
    return c.json({ error: 'Unable to update feedback status' }, 500);
  }

  if (!data) {
    return c.json({ error: 'Feedback item was not found' }, 404);
  }

  await auditAdminAction(c, {
    action: 'feedback.route.status_update',
    targetType: 'feedback_submission',
    targetId: data.id,
    metadata: { status },
  });

  return c.json(data);
});

app.post('/api/feedback/inbox/archive-resolved', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  if (!isSupabaseServerConfigured(c)) {
    return c.json({ error: 'Feedback is not configured' }, 503);
  }

  const supabase = getSupabaseAdminClient(c);
  const { data, error } = await supabase
    .from('feedback_submissions')
    .update({ archived_at: new Date().toISOString() })
    .is('event_id', null)
    .is('archived_at', null)
    .or('trigger_source.eq.route_feedback,trigger_source.is.null')
    .in('status', ['done', 'wont_fix'])
    .select('id');

  if (error) {
    return c.json({ error: 'Unable to archive resolved feedback' }, 500);
  }

  await auditAdminAction(c, {
    action: 'feedback.route.archive_resolved',
    targetType: 'feedback_submission',
    metadata: { archived_count: data?.length ?? 0 },
  });

  return c.json({ archived_count: data?.length ?? 0 });
});

app.get('/api/feedback/monthly', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  const [events, campaigns, submissions, talks] = await Promise.all([
    getAllEvents(c),
    getAllFeedbackCampaigns(),
    getAllFeedbackSubmissions(),
    getAllTalks(),
  ]);
  const campaignsByEvent = new Map(campaigns.map((campaign) => [campaign.event_id, campaign]));
  const submissionsByEvent = new Map<string, typeof submissions>();
  const talksByEvent = new Map<string, Talk[]>();

  for (const submission of submissions) {
    const eventSubmissions = submissionsByEvent.get(submission.event_id) ?? [];
    eventSubmissions.push(submission);
    submissionsByEvent.set(submission.event_id, eventSubmissions);
  }

  for (const talk of talks) {
    const eventTalks = talksByEvent.get(talk.event_id) ?? [];
    eventTalks.push(talk);
    talksByEvent.set(talk.event_id, eventTalks);
  }

  const monthMap = new Map<string, {
    month: string;
    label: string;
    events: unknown[];
    total_responses: number;
    rating_values: number[];
    attend_again_values: number[];
    comment_count: number;
    top_talk_counts: Map<string, { label: string; count: number }>;
  }>();

  for (const event of events) {
    const month = eventMonthKey(event.event_date);
    const monthBucket = monthMap.get(month) ?? {
      month,
      label: eventMonthLabel(month),
      events: [],
      total_responses: 0,
      rating_values: [],
      attend_again_values: [],
      comment_count: 0,
      top_talk_counts: new Map<string, { label: string; count: number }>(),
    };
    const existingCampaign = campaignsByEvent.get(event.id);
    const campaign = existingCampaign ?? createDefaultFeedbackCampaign(event.id);
    const eventSubmissions = submissionsByEvent.get(event.id) ?? [];
    const eventTalks = talksByEvent.get(event.id) ?? [];
    const insights = buildFeedbackInsights(campaign, eventSubmissions, eventTalks);
    const feedbackWindow = feedbackCampaignWindow(event, campaign);

    for (const answer of eventSubmissions.flatMap((submission) => submission.answers)) {
      const question = campaign.questions.find((item) => item.id === answer.question_id);
      if (question?.type === 'rating' && typeof answer.value === 'number') {
        monthBucket.rating_values.push(answer.value);
      }
      if (question?.type === 'yes_no' && typeof answer.value === 'boolean') {
        monthBucket.attend_again_values.push(answer.value ? 1 : 0);
      }
    }

    if (insights.top_talk_label) {
      const current = monthBucket.top_talk_counts.get(insights.top_talk_label) ?? { label: insights.top_talk_label, count: 0 };
      current.count += insights.top_talk_count;
      monthBucket.top_talk_counts.set(insights.top_talk_label, current);
    }

    monthBucket.total_responses += eventSubmissions.length;
    monthBucket.comment_count += insights.comment_count;
    monthBucket.events.push({
      event: {
        id: event.id,
        name: event.name,
        event_date: event.event_date,
        status: event.status,
      },
      campaign: existingCampaign ? {
        id: existingCampaign.id,
        title: existingCampaign.title,
        status: existingCampaign.status,
        auto_open_on_event_completion: existingCampaign.auto_open_on_event_completion,
      } : null,
      campaign_configured: Boolean(existingCampaign),
      response_count: eventSubmissions.length,
      feedback_window: feedbackWindow,
      is_open: isFeedbackCampaignOpen(event, campaign),
      insights,
      public_url: `${publicAppOrigin(c)}/feedback/${event.id}`,
    });
    monthMap.set(month, monthBucket);
  }

  const months = Array.from(monthMap.values())
    .sort((a, b) => b.month.localeCompare(a.month))
    .map((month) => {
      const topTalk = Array.from(month.top_talk_counts.values()).sort((a, b) => b.count - a.count)[0] ?? null;

      return {
        month: month.month,
        label: month.label,
        total_responses: month.total_responses,
        event_count: month.events.length,
        comment_count: month.comment_count,
        average_rating: average(month.rating_values),
        attend_again_percent: formatInsightPercent(month.attend_again_values.length === 0 ? null : month.attend_again_values.reduce((sum, value) => sum + value, 0) / month.attend_again_values.length),
        top_talk_label: topTalk?.label ?? null,
        top_talk_count: topTalk?.count ?? 0,
        events: month.events,
      };
    });

  return c.json({ months });
});

app.get('/api/events/:eventId/feedback-campaign', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  const eventId = c.req.param('eventId');
  const event = await getEventById(eventId, c);

  if (!event) {
    return c.json({ error: 'Event not found' }, 404);
  }

  const [campaign, submissions, talks] = await Promise.all([
    getOrCreateFeedbackCampaign(eventId),
    getFeedbackSubmissionsByEvent(eventId),
    getTalksByEvent(eventId),
  ]);

  return c.json({
    event,
    campaign,
    submissions,
    talks: talks.filter((talk) => talk.status !== 'rejected'),
    public_url: `${publicAppOrigin(c)}/feedback/${eventId}`,
    feedback_window: feedbackCampaignWindow(event, campaign),
    is_open: isFeedbackCampaignOpen(event, campaign),
  });
});

app.patch('/api/events/:eventId/feedback-campaign', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  const eventId = c.req.param('eventId');
  const event = await getEventById(eventId, c);

  if (!event) {
    return c.json({ error: 'Event not found' }, 404);
  }

  const body = await c.req.json();
  const status = body.status as FeedbackCampaignStatus | undefined;

  if (status && !FEEDBACK_CAMPAIGN_STATUSES.has(status)) {
    return c.json({ error: 'Invalid feedback campaign status' }, 400);
  }

  const questions = body.questions === undefined ? undefined : normalizeFeedbackQuestions(body.questions);

  if (questions && questions.length === 0) {
    return c.json({ error: 'Add at least one feedback question' }, 400);
  }

  const campaign = await updateFeedbackCampaign(eventId, {
    title: typeof body.title === 'string' && body.title.trim() ? body.title.trim() : undefined,
    intro: typeof body.intro === 'string' ? body.intro.trim() || null : undefined,
    status,
    auto_open_on_event_completion: typeof body.auto_open_on_event_completion === 'boolean' ? body.auto_open_on_event_completion : undefined,
    opens_at: typeof body.opens_at === 'string' && body.opens_at ? body.opens_at : body.opens_at === null ? null : undefined,
    closes_at: typeof body.closes_at === 'string' && body.closes_at ? body.closes_at : body.closes_at === null ? null : undefined,
    questions,
  });

  await auditAdminAction(c, {
    action: 'feedback.campaign.update',
    targetType: 'event',
    targetId: eventId,
    metadata: {
      changed_fields: Object.keys(body).sort(),
      status: campaign.status,
      question_count: campaign.questions.length,
    },
  });

  return c.json({
    event,
    campaign,
    talks: (await getTalksByEvent(eventId)).filter((talk) => talk.status !== 'rejected'),
    public_url: `${publicAppOrigin(c)}/feedback/${eventId}`,
    feedback_window: feedbackCampaignWindow(event, campaign),
    is_open: isFeedbackCampaignOpen(event, campaign),
  });
});

app.get('/api/feedback/events/:eventId', async (c) => {
  const eventId = c.req.param('eventId');
  const event = await getEventById(eventId, c);
  const previewRequested = c.req.query('preview') === '1';

  if (!event) {
    return c.json({ error: 'Event not found' }, 404);
  }

  const existingCampaign = await getFeedbackCampaignByEvent(eventId);
  const campaign = existingCampaign ?? (event.status === 'completed' ? await getOrCreateFeedbackCampaign(eventId) : undefined);
  const previewAllowed = previewRequested && !(await requireAdmin(c));

  if (!campaign || (!previewAllowed && !isFeedbackCampaignOpen(event, campaign))) {
    return c.json({ error: 'Feedback is not open for this event' }, 404);
  }

  const talks = await getTalksByEvent(eventId);

  return c.json({
    event,
    campaign,
    feedback_window: feedbackCampaignWindow(event, campaign),
    talks: talks.filter((talk) => talk.status !== 'rejected'),
    preview_mode: previewAllowed,
  });
});

app.get('/api/feedback/events/:eventId/status', async (c) => {
  const eventId = c.req.param('eventId');
  const event = await getEventById(eventId, c);

  if (!event) {
    return c.json({ available: false, error: 'Event not found' }, 404);
  }

  const existingCampaign = await getFeedbackCampaignByEvent(eventId);
  const campaign = existingCampaign ?? (event.status === 'completed' ? await getOrCreateFeedbackCampaign(eventId) : undefined);
  const available = campaign ? isFeedbackCampaignOpen(event, campaign) : false;

  return c.json({
    available,
    feedback_window: campaign ? feedbackCampaignWindow(event, campaign) : null,
    public_url: available ? `${publicAppOrigin(c)}/feedback/${eventId}` : null,
  });
});

app.post('/api/feedback/events/:eventId/submissions', async (c) => {
  const eventId = c.req.param('eventId');
  const event = await getEventById(eventId, c);

  if (!event) {
    return c.json({ error: 'Event not found' }, 404);
  }

  const existingCampaign = await getFeedbackCampaignByEvent(eventId);
  const campaign = existingCampaign ?? (event.status === 'completed' ? await getOrCreateFeedbackCampaign(eventId) : undefined);

  if (!campaign || !isFeedbackCampaignOpen(event, campaign)) {
    return c.json({ error: 'Feedback is not open for this event' }, 403);
  }

  const body = await c.req.json();
  const respondentName = typeof body.respondent_name === 'string' ? body.respondent_name.trim() : '';
  const respondentEmail = typeof body.respondent_email === 'string' ? body.respondent_email.trim() : '';

  if (!respondentName) {
    return c.json({ error: 'Please enter your name.' }, 400);
  }

  if (!z.string().email().safeParse(respondentEmail).success) {
    return c.json({ error: 'Please enter a valid email address.' }, 400);
  }

  const answers = normalizeFeedbackAnswers(body.answers);
  const answersByQuestion = new Map(answers.map((answer) => [answer.question_id, answer.value]));
  const missingRequired = campaign.questions.some((question) => {
    const value = answersByQuestion.get(question.id);
    return question.required && (value === undefined || value === null || String(value).trim() === '');
  });
  const textAnswerTooLong = campaign.questions.some((question) => {
    const value = answersByQuestion.get(question.id);
    return question.type === 'text' && typeof value === 'string' && value.length > EVENT_FEEDBACK_COMMENT_MAX_CHARS;
  });

  if (missingRequired) {
    return c.json({ error: 'Please answer all required questions' }, 400);
  }

  if (textAnswerTooLong) {
    return c.json({ error: `Keep each comment under ${EVENT_FEEDBACK_COMMENT_MAX_CHARS} characters.` }, 400);
  }

  const responseToken = normalizeEventFeedbackResponseToken(body.response_token);
  if (!responseToken) {
    return c.json({ error: 'Refresh this feedback form and try again.' }, 400);
  }

  const responseTokenHash = await hashEventFeedbackResponseToken(eventId, responseToken);
  const duplicateSubmission = await getFeedbackSubmissionByResponseToken(eventId, responseTokenHash)
    ?? (await hasSupabaseFeedbackResponseToken(c, eventId, campaign.id, responseTokenHash) ? { id: 'supabase' } : undefined);

  if (duplicateSubmission) {
    return c.json({
      error: 'Feedback already received for this event.',
      code: 'duplicate_feedback',
    }, 409);
  }

  const serializedAnswers = JSON.stringify(answers);
  if (serializedAnswers.length > FEEDBACK_SUBMISSION_MESSAGE_MAX_CHARS) {
    return c.json({ error: 'Your response is too long. Please shorten the written comments a little.' }, 400);
  }

  const submission = await createEventFeedbackSubmission({
    campaign_id: campaign.id,
    event_id: eventId,
    respondent_name: respondentName,
    respondent_email: respondentEmail,
    answers,
    page_path: typeof body.page_path === 'string' ? body.page_path : null,
    user_agent: c.req.header('user-agent') ?? null,
    response_token_hash: responseTokenHash,
  });

  if (isSupabaseServerConfigured(c)) {
    const supabase = getSupabaseAdminClient(c);
    await supabase.from('feedback_submissions').insert({
      event_id: eventId,
      campaign_id: campaign.id,
      tester_name: respondentName,
      tester_email: respondentEmail,
      type: 'suggestion',
      message: serializedAnswers,
      structured_answers: answers,
      response_token_hash: responseTokenHash,
      trigger_source: 'event_feedback_form',
      page_path: submission.page_path,
      user_agent: submission.user_agent,
    });
  }

  return c.json({ id: submission.id }, 201);
});

app.post('/api/auth/admin/login', async (c) => {
  const body = await c.req.json();

  if (isSupabaseAdminAuthConfigured(c)) {
    return c.json(
      { error: 'Magic-link organizer sign-in is disabled. Continue with Google instead.' },
      { status: 405 },
    );
  }

  if (!startLocalAdminSession(c, body.password)) {
    return c.json({ error: 'Invalid admin password' }, 401);
  }

  return c.json({
    authenticated: true,
    auth_mode: 'local',
  });
});

app.get('/api/auth/admin/callback', async (c) => {
  const code = String(c.req.query('code') ?? '');
  const next = String(c.req.query('next') ?? defaultAdminRedirectPath(c));
  const callbackError = String(c.req.query('error_description') ?? c.req.query('error') ?? '');
  const basePath = `/${(envValue('VITE_ADMIN_BASE_PATH', c) ?? 'organizer-console').replace(/^\/+|\/+$/g, '')}`;
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : defaultAdminRedirectPath(c);
  const clientOrigin = publicAppOrigin(c);
  const clientCallback = new URL(`${basePath}/auth/callback`, clientOrigin);
  clientCallback.searchParams.set('next', safeNext);

  if (callbackError) {
    clientCallback.searchParams.set('error', callbackError);
    return c.redirect(clientCallback.toString());
  }

  if (!code) {
    const loginUrl = new URL(`${basePath}/login`, clientOrigin);
    loginUrl.searchParams.set('error', 'Google organizer sign-in did not return a code. Please try again.');
    return c.redirect(loginUrl.toString());
  }

  clientCallback.searchParams.set('code', code);
  return c.redirect(clientCallback.toString());
});

app.post('/api/auth/admin/exchange', async (c) => {
  if (!isSupabaseAdminAuthConfigured(c)) {
    return c.json({ error: 'Supabase admin auth is not configured.' }, 503);
  }

  const body = await c.req.json();
  const accessToken = String(body.access_token ?? '');
  const result = await completeSupabaseAdminToken(c, accessToken);
  if (!result.ok) {
    return c.json({ error: result.error }, { status: result.status as 401 | 403 | 500 });
  }

  return c.json({
    authenticated: true,
    auth_mode: 'supabase',
  });
});

app.post('/api/auth/logout', async (c) => {
  await auditAdminAction(c, {
    action: 'admin.logout',
    targetType: 'admin_session',
  });
  await revokeAdminSession(c);
  return c.json({ authenticated: false });
});

app.get('/api/admin/organizers', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  if (!isSupabaseAdminAuthConfigured(c)) {
    return c.json({
      organizers: [{
        id: 'local',
        email: 'local-admin@devcongress.local',
        display_name: 'Local admin',
        role: 'owner',
        status: 'active',
        last_login_at: null,
        created_at: null,
      }],
      auth_mode: 'local',
    });
  }

  const { data, error } = await getSupabaseAdminClient(c)
    .from('admin_memberships')
    .select('id, email, display_name, role, status, last_login_at, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    return c.json({ error: 'Unable to load organizers' }, 500);
  }

  return c.json({
    organizers: data ?? [],
    auth_mode: 'supabase',
  });
});

app.post('/api/admin/organizers', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  if (!isSupabaseAdminAuthConfigured(c)) {
    return c.json({ error: 'Organizer email management requires Supabase auth.' }, 503);
  }

  const session = await getAdminSession(c);
  if (!session.authenticated) {
    return c.json({ error: 'Admin session required' }, 401);
  }
  const body = await c.req.json().catch(() => ({}));
  const parsed = addOrganizerSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Enter a valid organizer email.' }, 400);
  }
  const email = parsed.data.email;
  const displayName = parsed.data.display_name || null;
  const role = parsed.data.role;

  const { data: existingMembership, error: existingMembershipError } = await getSupabaseAdminClient(c)
    .from('admin_memberships')
    .select('id, email, role, status')
    .eq('email', email)
    .maybeSingle();

  if (existingMembershipError) {
    return c.json({ error: 'Unable to verify organizer access.' }, 500);
  }

  if (session.role !== 'owner') {
    if (role !== 'organizer') {
      return c.json({ error: 'Only owners can grant owner access.' }, 403);
    }

    if (existingMembership?.role === 'owner') {
      return c.json({ error: 'Only owners can update another owner.' }, 403);
    }
  }

  const { data, error } = await getSupabaseAdminClient(c)
    .from('admin_memberships')
    .upsert({
      email,
      display_name: displayName,
      role,
      status: 'active',
      added_by: session.user_id,
    }, { onConflict: 'email' })
    .select('id, email, display_name, role, status, last_login_at, created_at')
    .single();

  if (error) {
    return c.json({ error: 'Unable to save organizer email.' }, 500);
  }

  await recordAdminAudit(c, {
    actor_user_id: session.user_id,
    actor_email: session.email,
    actor_role: session.role,
    action: 'admin.organizer.upsert',
    target_type: 'admin_membership',
    target_id: data.id,
    metadata: { email, role },
  });

  return c.json(data, 201);
});

app.delete('/api/admin/organizers/:organizerId', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  if (!isSupabaseAdminAuthConfigured(c)) {
    return c.json({ error: 'Organizer email management requires Supabase auth.' }, 503);
  }

  const session = await getAdminSession(c);
  if (!session.authenticated) {
    return c.json({ error: 'Admin session required' }, 401);
  }
  const organizerId = c.req.param('organizerId');

  if (organizerId === session.membership_id) {
    return c.json({ error: 'You cannot disable your own organizer access.' }, 400);
  }

  const { data: existingMembership, error: existingMembershipError } = await getSupabaseAdminClient(c)
    .from('admin_memberships')
    .select('id, email, display_name, role, status, last_login_at, created_at')
    .eq('id', organizerId)
    .maybeSingle();

  if (existingMembershipError) {
    return c.json({ error: 'Unable to verify organizer access.' }, 500);
  }

  if (!existingMembership) {
    return c.json({ error: 'Organizer was not found.' }, 404);
  }

  if (existingMembership.role === 'owner' && session.role !== 'owner') {
    return c.json({ error: 'Only owners can disable another owner.' }, 403);
  }

  if (existingMembership.role === 'owner') {
    const { count: activeOwnerCount, error: ownerCountError } = await getSupabaseAdminClient(c)
      .from('admin_memberships')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'owner')
      .eq('status', 'active');

    if (ownerCountError) {
      return c.json({ error: 'Unable to verify owner coverage.' }, 500);
    }

    if ((activeOwnerCount ?? 0) <= 1) {
      return c.json({ error: 'At least one active owner must remain.' }, 400);
    }
  }

  const { data, error } = await getSupabaseAdminClient(c)
    .from('admin_memberships')
    .update({ status: 'disabled' })
    .eq('id', organizerId)
    .select('id, email, display_name, role, status, last_login_at, created_at')
    .maybeSingle();

  if (error) {
    return c.json({ error: 'Unable to disable organizer.' }, 500);
  }
  if (!data) {
    return c.json({ error: 'Organizer was not found.' }, 404);
  }
  await recordAdminAudit(c, {
    actor_user_id: session.user_id,
    actor_email: session.email,
    actor_role: session.role,
    action: 'admin.organizer.disable',
    target_type: 'admin_membership',
    target_id: data.id,
    metadata: { email: data.email },
  });

  return c.json(data);
});

app.get('/api/admin/audit-log', async (c) => {
  const adminError = await requireAdmin(c, ['owner']);
  if (adminError) return adminError;

  if (!isSupabaseAdminAuthConfigured(c)) {
    return c.json({ logs: [], auth_mode: 'local' });
  }

  const parsed = auditLogQuerySchema.safeParse({
    limit: c.req.query('limit'),
    actor: c.req.query('actor'),
    action: c.req.query('action'),
    target_type: c.req.query('target_type'),
  });

  if (!parsed.success) {
    return c.json({ error: 'Invalid audit log filters.' }, 400);
  }

  let query = getSupabaseAdminClient(c)
    .from('admin_audit_log')
    .select('id, actor_email, actor_role, action, target_type, target_id, metadata, ip_address, user_agent, request_method, request_path, created_at')
    .order('created_at', { ascending: false })
    .limit(parsed.data.limit);

  if (parsed.data.actor) {
    query = query.ilike('actor_email', `%${parsed.data.actor}%`);
  }

  if (parsed.data.action) {
    query = query.eq('action', parsed.data.action);
  }

  if (parsed.data.target_type) {
    query = query.eq('target_type', parsed.data.target_type);
  }

  const { data, error } = await query;

  if (error) {
    return c.json({ error: 'Unable to load audit log.' }, 500);
  }

  return c.json({ logs: data ?? [], auth_mode: 'supabase' });
});

app.post('/api/integrations/luma/preview', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  if (!isSupabaseServerConfigured(c)) {
    return c.json({ error: 'Supabase community events must be configured before previewing Luma imports.' }, 503);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = lumaImportSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Enter a valid public Luma event URL.' }, 400);
  }

  try {
    const lumaEvent = await getPublicLumaEventByUrl(parsed.data.event_url);
    if (!lumaEvent) {
      return c.json({ error: 'Luma event was not found.' }, 404);
    }

    const existingEvent = await findExistingLumaEvent(lumaEvent, c);
    const seriesType = isEventSeriesType(parsed.data.series_type)
      ? parsed.data.series_type
      : existingEvent?.series_type ?? inferEventSeriesType(lumaEvent.name);

    return c.json({
      preview: {
        ...lumaDraftToEventInput(lumaEvent),
        series_type: seriesType,
      },
      existing_event: existingEvent ?? null,
      already_imported: Boolean(existingEvent),
    });
  } catch {
    return c.json({ error: 'Unable to preview Luma event right now.' }, 502);
  }
});

app.post('/api/integrations/luma/public-preview', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  if (!isSupabaseServerConfigured(c)) {
    return c.json({ error: 'Supabase community events must be configured before previewing Luma imports.' }, 503);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = lumaImportSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Enter a valid public Luma event URL.' }, 400);
  }

  try {
    const lumaEvent = await getPublicLumaEventByUrl(parsed.data.event_url);
    if (!lumaEvent) {
      return c.json({ error: 'Luma event was not found.' }, 404);
    }

    const existingEvent = await findExistingLumaEvent(lumaEvent, c);
    const seriesType = isEventSeriesType(parsed.data.series_type)
      ? parsed.data.series_type
      : existingEvent?.series_type ?? inferEventSeriesType(lumaEvent.name);
    return c.json({
      data: toPreviewPublicMeetup(lumaEvent, publicAppOrigin(c), existingEvent, seriesType),
      already_imported: Boolean(existingEvent),
    });
  } catch {
    return c.json({ error: 'Unable to build the event preview right now.' }, 502);
  }
});

app.post('/api/integrations/luma/import', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  if (!isSupabaseServerConfigured(c)) {
    return c.json({ error: 'Supabase community events must be configured before importing from Luma.' }, 503);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = lumaImportSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Enter a valid public Luma event URL.' }, 400);
  }

  const session = await getAdminSession(c);
  if (!session.authenticated) {
    return c.json({ error: 'Admin session required' }, 401);
  }

  try {
    const lumaEvent = await getPublicLumaEventByUrl(parsed.data.event_url);
    if (!lumaEvent) {
      return c.json({ error: 'Luma event was not found.' }, 404);
    }

    const existingEvent = await findExistingLumaEvent(lumaEvent, c);
    const seriesType = isEventSeriesType(parsed.data.series_type)
      ? parsed.data.series_type
      : existingEvent?.series_type ?? inferEventSeriesType(lumaEvent.name);
    if (existingEvent) {
      if (existingEvent.publish_to_website) {
        return c.json({
          error: 'This Luma event is already published in community. Remove it and re-import to start a fresh draft.',
          event: existingEvent,
          already_imported: true,
          requires_reimport: true,
        }, 409);
      }

      return c.json({ event: existingEvent, already_imported: true });
    }

    const event = await createSupabaseCommunityEvent({
      ...lumaDraftToEventInput(lumaEvent),
      series_type: seriesType,
    }, c);

    if (!event) {
      return c.json({ error: 'Unable to import Luma event.' }, 500);
    }

    await recordAdminAudit(c, {
      actor_user_id: session.user_id,
      actor_email: session.email,
      actor_role: session.role,
      action: 'admin.luma.import',
      target_type: 'community_event',
      target_id: event.id,
      metadata: {
        external_id: lumaEvent.external_id,
        external_url: lumaEvent.external_url,
        series_type: seriesType,
      },
    });

    return c.json({ event, already_imported: false }, 201);
  } catch {
    return c.json({ error: 'Unable to import Luma event right now.' }, 502);
  }
});

function buildPublicAttendanceRegulars(events: Awaited<ReturnType<typeof getAllEvents>>, imports: Awaited<ReturnType<typeof getAttendanceImports>>) {
  const people = new Map<string, {
    key: string;
    name: string;
    registeredEvents: Set<string>;
    checkedInEvents: Set<string>;
    lastSeenAt: string | null;
  }>();
  const ledger = buildAttendanceLedger(events, imports);

  for (const month of ledger.filter((item) => item.has_import)) {
    for (const eventItem of month.events) {
      if (!eventItem.import) continue;

      for (const record of eventItem.import.records) {
        const key = record.email?.trim().toLowerCase() || record.guest_id;
        const existing = people.get(key) ?? {
          key,
          name: record.name || 'Community member',
          registeredEvents: new Set<string>(),
          checkedInEvents: new Set<string>(),
          lastSeenAt: null,
        };

        existing.name = existing.name || record.name || 'Community member';
        existing.registeredEvents.add(eventItem.event.id);
        if (record.checked_in_at) existing.checkedInEvents.add(eventItem.event.id);
        if (!existing.lastSeenAt || new Date(eventItem.event.event_date).getTime() > new Date(existing.lastSeenAt).getTime()) {
          existing.lastSeenAt = eventItem.event.event_date;
        }
        people.set(key, existing);
      }
    }
  }

  return Array.from(people.values())
    .map((person) => ({
      key: person.key,
      name: person.name,
      registered_count: person.registeredEvents.size,
      checked_in_count: person.checkedInEvents.size,
      check_in_rate: person.registeredEvents.size === 0 ? 0 : person.checkedInEvents.size / person.registeredEvents.size,
      last_seen_at: person.lastSeenAt,
    }))
    .filter((person) => person.checked_in_count > 1 || person.registered_count > 1)
    .sort((a, b) => b.checked_in_count - a.checked_in_count || b.registered_count - a.registered_count || a.name.localeCompare(b.name))
    .slice(0, 3);
}

app.get('/api/overview', async (c) => {
  const [events, talks, leaderboard, sessions, attendanceImports] = await Promise.all([
    getAllEvents(c),
    getAllTalks(),
    buildLeaderboard(),
    getAllQuizSessions(),
    getAttendanceImports(),
  ]);
  const activeSession = sessions.find((session) => session.status === 'waiting' || session.status === 'active') ?? null;
  const regulars = buildPublicAttendanceRegulars(events, attendanceImports);

  return c.json({ events, talks, leaderboard, regulars, activeSession });
});

app.get('/api/public/meetups', async (c) => {
  setPublicApiCache(c);
  const supabaseMeetups = await getSupabasePublicMeetups(publicAppOrigin(c), c);
  return c.json({
    data: supabaseMeetups ?? await buildPublicMeetups(publicAppOrigin(c), c),
    meta: {
      source: 'devcongress-comm',
      version: 1,
    },
  });
});

app.get('/api/public/meetups/:slug', async (c) => {
  setPublicApiCache(c);
  const slug = c.req.param('slug');
  const meetups = (await getSupabasePublicMeetups(publicAppOrigin(c), c)) ?? await buildPublicMeetups(publicAppOrigin(c), c);
  const meetup = meetups.find((item) => item.slug === slug || item.id === slug);

  if (!meetup) {
    return c.json({ error: 'Meetup not found' }, 404);
  }

  return c.json({ data: meetup });
});

app.get('/api/public/meetups/:slug/talks', async (c) => {
  setPublicApiCache(c);
  const slug = c.req.param('slug');
  const meetups = (await getSupabasePublicMeetups(publicAppOrigin(c), c)) ?? await buildPublicMeetups(publicAppOrigin(c), c);
  const meetup = meetups.find((item) => item.slug === slug || item.id === slug);

  if (!meetup) {
    return c.json({ error: 'Meetup not found' }, 404);
  }

  const talks = (await getTalksByEvent(meetup.id)).filter((talk) => talk.status === 'published');
  return c.json({
    data: talks,
    meta: {
      meetup_id: meetup.id,
      meetup_slug: meetup.slug,
      count: talks.length,
    },
  });
});

app.get('/api/events', async (c) => {
  return c.json(await getAllEvents(c));
});

app.post('/api/events', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  const body = await c.req.json();
  const parsed = createEventFormSchema.safeParse({
    name: body.name,
    description: body.description,
    event_date: body.event_date,
    series_type: body.series_type,
    end_date: body.end_date ?? '',
    slug: body.slug ?? '',
    cover: body.cover ?? '',
    registration_url: body.registration_url ?? '',
    location_name: body.location?.name ?? body.location?.label ?? '',
    location_url: body.location?.url ?? '',
    publish_to_website: Boolean(body.publish_to_website),
  });

  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Event form is invalid.' }, 400);
  }

  const payload = toCreateEventApiPayload(parsed.data);

  const event = await createEvent({
    ...payload,
    stream_url: typeof body.stream_url === 'string' ? body.stream_url : null,
    embed_stream: Boolean(body.embed_stream),
    photos: normalizeEventPhotos(body.photos),
    location: payload.location,
    series_type: payload.series_type,
  }, c);

  await auditAdminAction(c, {
    action: 'event.create',
    targetType: 'event',
    targetId: event.id,
    metadata: { name: event.name, status: event.status, event_date: event.event_date },
  });

  return c.json(event, 201);
});

app.get('/api/events/:eventId', async (c) => {
  const event = await getEventById(c.req.param('eventId'), c);

  if (!event) {
    return c.json({ error: 'Event not found' }, 404);
  }

  return c.json(event);
});

app.delete('/api/events/:eventId', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  const eventId = c.req.param('eventId');
  const event = await getEventById(eventId, c);

  if (!event) {
    return c.json({ error: 'Event not found' }, 404);
  }

  try {
    const deletion = await (event.external_source === 'luma'
      ? deleteImportedEvent(event, c)
      : deleteEvent(eventId, c).then(() => ({ deleted_ids: [eventId], deleted: true })));
    await auditAdminAction(c, {
      action: 'event.delete',
      targetType: 'event',
      targetId: eventId,
      metadata: {
        name: event.name,
        event_date: event.event_date,
        status: event.status,
        external_source: event.external_source ?? null,
        external_id: event.external_id ?? null,
        registration_url: event.registration_url ?? null,
        deleted_event_ids: deletion.deleted_ids,
      },
    });

    return c.json({ ok: true });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Failed to remove event' }, 500);
  }
});

app.get('/api/events/:eventId/checklist', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  const eventId = c.req.param('eventId');
  const event = await getEventById(eventId, c);

  if (!event) {
    return c.json({ error: 'Event not found' }, 404);
  }

  const items = await getEventChecklist(eventId, event.status);
  return c.json({
    event_status: event.status,
    progress: checklistProgress(items),
    items,
  });
});

app.patch('/api/events/:eventId/checklist/:itemId', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  const eventId = c.req.param('eventId');
  const itemId = c.req.param('itemId');
  const event = await getEventById(eventId, c);

  if (!event) {
    return c.json({ error: 'Event not found' }, 404);
  }

  const body = await c.req.json().catch(() => ({}));

  if (typeof body.completed !== 'boolean') {
    return c.json({ error: 'completed is required' }, 400);
  }

  try {
    const item = await updateEventChecklistItem(eventId, itemId, {
      completed: body.completed,
      completed_by: typeof body.completed_by === 'string' ? body.completed_by : 'Organizer',
    });
    const updatedEvent = item.completed && item.status_on_complete
      ? await updateEvent(eventId, { status: item.status_on_complete }, c)
      : event;
    const items = await getEventChecklist(eventId, updatedEvent.status);

    await auditAdminAction(c, {
      action: 'event.checklist.update',
      targetType: 'event',
      targetId: eventId,
      metadata: {
        item_id: itemId,
        completed: item.completed,
        event_status: updatedEvent.status,
      },
    });

    return c.json({
      item,
      event: updatedEvent,
      progress: checklistProgress(items),
      items,
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Failed to update checklist item' }, 400);
  }
});

app.patch('/api/events/:eventId', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  try {
    const body = await c.req.json();
    const updates = {
      ...body,
      ...(Array.isArray(body.photos) ? { photos: normalizeEventPhotos(body.photos) } : {}),
    };

    const eventId = c.req.param('eventId');
    const updatedEvent = await updateEvent(eventId, updates, c);
    await auditAdminAction(c, {
      action: 'event.update',
      targetType: 'event',
      targetId: eventId,
      metadata: {
        changed_fields: Object.keys(updates).sort(),
        status: updatedEvent.status,
      },
    });
    return c.json(updatedEvent);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Failed to update event' }, 500);
  }
});

app.post('/api/events/:eventId/media', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  const eventId = c.req.param('eventId');
  const event = await getEventById(eventId, c);
  if (!event) {
    return c.json({ error: 'Event not found' }, 404);
  }

  let formData: FormData;
  try {
    formData = await c.req.raw.formData();
  } catch {
    return c.json({ error: 'Upload must use multipart/form-data' }, 400);
  }

  const uploadedFile = formData.get('file');
  if (!(uploadedFile instanceof File)) {
    return c.json({ error: 'An image file is required' }, 400);
  }

  const purposeValue = formData.get('purpose');
  const purpose = purposeValue === 'cover' ? 'cover' : 'photo';
  const validationError = validateMeetupMediaFile(uploadedFile);
  if (validationError) {
    return c.json({ error: validationError }, 400);
  }

  try {
    const publicUrl = await uploadMeetupMedia(event.slug ?? event.id, purpose, uploadedFile, c);
    const updatedEvent = purpose === 'cover'
      ? await updateEvent(event.id, { cover: publicUrl }, c)
      : await updateEvent(event.id, {
        photos: [
          ...normalizeEventPhotos(event.photos),
          { url: publicUrl, type: 'image' },
        ],
      }, c);

    await auditAdminAction(c, {
      action: purpose === 'cover' ? 'event.media.cover_upload' : 'event.media.photo_upload',
      targetType: 'event',
      targetId: event.id,
      metadata: { purpose, file_name: uploadedFile.name || null },
    });

    return c.json({
      event: updatedEvent,
      media: {
        url: publicUrl,
        type: purpose,
      },
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Failed to upload image' }, 500);
  }
});

app.get('/api/events/:eventId/talks', async (c) => {
  return c.json(await getTalksByEvent(c.req.param('eventId')));
});

app.get('/api/events/:eventId/speakers', async (c) => {
  return c.json(await getSpeakersByEvent(c.req.param('eventId')));
});

app.get('/api/attendance/monthly', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  const [events, imports] = await Promise.all([
    getAllEvents(c),
    getAttendanceImports(),
  ]);
  const ledger = buildAttendanceLedger(events, imports);

  return c.json({
    ledger,
    insights: buildAttendanceInsights(ledger),
  });
});

app.get('/api/events/:eventId/attendance', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  const eventId = c.req.param('eventId');
  const event = await getEventById(eventId, c);

  if (!event) {
    return c.json({ error: 'Event not found' }, 404);
  }

  const attendanceImport = await getLatestAttendanceImport(eventId);
  const uploadWindow = attendanceUploadWindowForEvent(event);

  return c.json({
    event,
    import: attendanceImport,
    summary: buildAttendanceSummary(attendanceImport),
    upload_available: uploadWindow.available,
    upload_unavailable_reason: uploadWindow.reason,
    upload_unlocks_at: uploadWindow.unlocks_at,
  });
});

app.post('/api/events/:eventId/attendance/import', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  const eventId = c.req.param('eventId');
  const event = await getEventById(eventId, c);

  if (!event) {
    return c.json({ error: 'Event not found' }, 404);
  }

  const uploadWindow = attendanceUploadWindowForEvent(event);
  if (!uploadWindow.available) {
    return c.json({
      error: uploadWindow.reason ?? 'Attendance CSV upload is not open for this meetup month.',
      upload_available: false,
      upload_unlocks_at: uploadWindow.unlocks_at,
    }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const csv = typeof body.csv === 'string' ? body.csv : '';
  const csvSizeBytes = new TextEncoder().encode(csv).byteLength;

  if (!csv.trim()) {
    return c.json({ error: 'csv is required' }, 400);
  }

  if (csvSizeBytes > ATTENDANCE_CSV_MAX_BYTES) {
    return c.json({ error: 'CSV must be 2MB or smaller' }, 413);
  }

  try {
    const attendanceImport = await replaceAttendanceImportFromCsv(
      eventId,
      csv,
      typeof body.source_filename === 'string' ? body.source_filename : null,
      attendanceMonthForEvent(event),
    );
    const summary = buildAttendanceSummary(attendanceImport);

    await auditAdminAction(c, {
      action: 'attendance.csv.import',
      targetType: 'event',
      targetId: eventId,
      metadata: {
        source_filename: attendanceImport.source_filename,
        attendance_month: attendanceImport.attendance_month,
        rows: attendanceImport.records.length,
        checked_in: summary.checked_in,
      },
    });

    return c.json({
      event,
      import: attendanceImport,
      summary,
      upload_available: uploadWindow.available,
      upload_unavailable_reason: uploadWindow.reason,
      upload_unlocks_at: uploadWindow.unlocks_at,
    }, 201);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unable to import attendance CSV' }, 400);
  }
});

app.delete('/api/events/:eventId/attendance', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  const eventId = c.req.param('eventId');
  const event = await getEventById(eventId, c);

  if (!event) {
    return c.json({ error: 'Event not found' }, 404);
  }

  await removeAttendanceImport(eventId);
  const uploadWindow = attendanceUploadWindowForEvent(event);
  await auditAdminAction(c, {
    action: 'attendance.csv.remove',
    targetType: 'event',
    targetId: eventId,
    metadata: { event_name: event.name },
  });

  return c.json({
    event,
    import: null,
    summary: buildAttendanceSummary(null),
    upload_available: uploadWindow.available,
    upload_unavailable_reason: uploadWindow.reason,
    upload_unlocks_at: uploadWindow.unlocks_at,
  });
});

app.post('/api/events/:eventId/speakers', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  const body = await c.req.json();
  const { email, name } = body;

  if (!email || !name) {
    return c.json({ error: 'email and name are required' }, 400);
  }

  try {
    const speaker = await addSpeaker({
      event_id: c.req.param('eventId'),
      email,
      name,
    });
    await auditAdminAction(c, {
      action: 'speaker.allowlist.add',
      targetType: 'event_speaker',
      targetId: speaker.id,
      metadata: { event_id: c.req.param('eventId'), email: speaker.email },
    });
    return c.json(speaker, 201);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Failed to add speaker' }, 400);
  }
});

app.delete('/api/events/:eventId/speakers/:speakerId', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  try {
    const speakerId = c.req.param('speakerId');
    await removeSpeaker(speakerId);
    await auditAdminAction(c, {
      action: 'speaker.allowlist.remove',
      targetType: 'event_speaker',
      targetId: speakerId,
      metadata: { event_id: c.req.param('eventId') },
    });
    return c.json({ ok: true });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Failed to remove speaker' }, 500);
  }
});

app.post('/api/events/:eventId/validate-speaker', async (c) => {
  const { email } = await c.req.json();

  if (!email) {
    return c.json({ error: 'Email is required' }, 400);
  }

  const speaker = await getSpeakerByEmail(c.req.param('eventId'), String(email).trim());
  return c.json({
    valid: Boolean(speaker),
    speaker: speaker ?? undefined,
  });
});

app.get('/api/talks', async (c) => {
  const eventId = c.req.query('eventId');
  const talks = await getAllTalks();
  return c.json(eventId ? talks.filter((talk) => talk.event_id === eventId) : talks);
});

app.patch('/api/talks/:talkId', async (c) => {
  const body = await c.req.json();
  const updates: Record<string, unknown> = {};

  if (body.status) {
    const adminError = await requireAdmin(c);
    if (adminError) return adminError;

    updates.status = body.status;
  }

  if (body.slides_url) {
    try {
      new URL(body.slides_url);
    } catch {
      return c.json({ error: 'Invalid URL format' }, 400);
    }

    updates.slides_url = body.slides_url;
    updates.slides_type = 'url';
    updates.storage_path = null;
    updates.slides_uploaded_at = now();
    updates.status = 'slides_received';
  }

  try {
    const talkId = c.req.param('talkId');
    const updatedTalk = await updateTalk(talkId, updates);
    if (body.status) {
      await auditAdminAction(c, {
        action: 'talk.status.update',
        targetType: 'talk',
        targetId: talkId,
        metadata: { status: updatedTalk.status, event_id: updatedTalk.event_id },
      });
    }
    return c.json(updatedTalk);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Failed to update talk' }, 500);
  }
});

app.post('/api/talks/:talkId/reminder', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  const talk = await getTalkById(c.req.param('talkId'));

  if (!talk) {
    return c.json({ error: 'Talk not found' }, 404);
  }

  if (talk.status !== 'accepted' || talk.slides_uploaded_at) {
    return c.json({ error: 'Only accepted talks without slides can receive reminders' }, 400);
  }

  const updatedTalk = await updateTalk(talk.id, {
    reminder_sent_count: talk.reminder_sent_count + 1,
    last_reminder_sent_at: now(),
  });
  await auditAdminAction(c, {
    action: 'talk.slides.reminder',
    targetType: 'talk',
    targetId: talk.id,
    metadata: { event_id: talk.event_id, reminder_sent_count: updatedTalk.reminder_sent_count },
  });
  return c.json(updatedTalk);
});

app.get('/api/my-talks', async (c) => {
  const email = c.req.query('email');

  if (!email) {
    return c.json({ error: 'Email parameter required' }, 400);
  }

  const allTalks = await getAllTalks();
  const userTalks = allTalks.filter((talk) => talk.speaker_email.toLowerCase() === email.toLowerCase());
  const talksWithEvents = await Promise.all(
    userTalks.map(async (talk) => ({
      ...talk,
      event: await getEventById(talk.event_id, c),
    })),
  );

  talksWithEvents.sort((a, b) => {
    if (!a.event || !b.event) return 0;
    return new Date(b.event.event_date).getTime() - new Date(a.event.event_date).getTime();
  });

  return c.json(talksWithEvents);
});

app.post('/api/cfp', async (c) => {
  const body = await c.req.json();
  const { event_id, speaker_name, speaker_email, github_username, title, abstract, bio } = body;

  if (!event_id || !speaker_name || !speaker_email || !title) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  const event = await getEventById(event_id, c);
  if (!event) {
    return c.json({ error: 'Event not found' }, 404);
  }

  if (event.status !== 'cfp_open') {
    return c.json({ error: 'CFP is not open for this event' }, 400);
  }

  const speaker = await getSpeakerByEmail(event_id, speaker_email);
  if (!speaker) {
    return c.json({ error: 'Email not on the approved speakers list for this event' }, 403);
  }

  const talk = await createTalk({
    event_id,
    speaker_name,
    speaker_email,
    github_username: github_username || null,
    title,
    topic: body.topic || 'General',
    abstract: abstract || null,
    bio: bio || null,
    slides_url: null,
    slides_type: null,
    storage_path: null,
    slides_uploaded_at: null,
  });

  return c.json(talk, 201);
});

app.get('/api/leaderboard', async (c) => {
  const type = c.req.query('type') ?? 'all-time';
  const sessionId = c.req.query('sessionId');

  if (type === 'per-event' && sessionId) {
    return c.json(await buildSessionLeaderboard(sessionId));
  }

  if (type === 'monthly') {
    return c.json(await buildMonthlyLeaderboard());
  }

  return c.json(await buildLeaderboard());
});

app.get('/api/quiz/active', async (c) => {
  const sessions = await getAllQuizSessions();
  const active = sessions.find((session) => session.status === 'waiting' || session.status === 'active');

  return c.json({
    available: Boolean(active),
    has_active_quiz: Boolean(active),
    session: active ?? null,
  });
});

app.get('/api/quiz/sessions', async (c) => {
  const eventId = c.req.query('eventId');
  return c.json(eventId ? await getQuizSessionsByEvent(eventId) : await getAllQuizSessions());
});

app.post('/api/quiz/sessions', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  const { event_id } = await c.req.json();
  if (!event_id) {
    return c.json({ error: 'event_id is required' }, 400);
  }
  const session = await createQuizSession({ event_id });
  await auditAdminAction(c, {
    action: 'quiz.session.create',
    targetType: 'quiz_session',
    targetId: session.id,
    metadata: { event_id },
  });
  return c.json(session, 201);
});

app.get('/api/quiz/sessions/:sessionId', async (c) => {
  const session = await getQuizSessionById(c.req.param('sessionId'));
  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }
  const questions = await getQuestionsBySession(session.id);
  const participants = await getQuizParticipantsBySession(session.id);
  return c.json({
    ...session,
    session,
    questions,
    participantCount: participants.length,
  });
});

app.patch('/api/quiz/sessions/:sessionId', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  try {
    const sessionId = c.req.param('sessionId');
    const body = await c.req.json();
    const session = await updateQuizSession(sessionId, body);
    await auditAdminAction(c, {
      action: 'quiz.session.update',
      targetType: 'quiz_session',
      targetId: sessionId,
      metadata: { changed_fields: Object.keys(body).sort(), status: session.status },
    });
    return c.json(session);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Failed to update session' }, 500);
  }
});

app.post('/api/quiz/questions', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  const body = await c.req.json();
  const { quiz_session_id, question_text, options, correct_index, order_index, time_limit_seconds, points } = body;

  if (!quiz_session_id || !question_text || !Array.isArray(options) || correct_index === undefined || order_index === undefined) {
    return c.json({ error: 'quiz_session_id, question_text, options, correct_index, and order_index are required' }, 400);
  }

  const validationError = validateQuestionPayload(question_text, options, Number(correct_index));
  if (validationError) {
    return c.json({ error: validationError }, 400);
  }

  const question = await createQuestion({
    quiz_session_id,
    question_text: String(question_text).trim(),
    options: options.map((option) => String(option).trim()),
    correct_index: Number(correct_index),
    order_index,
    time_limit_seconds,
    points,
  });
  await auditAdminAction(c, {
    action: 'quiz.question.create',
    targetType: 'quiz_question',
    targetId: question.id,
    metadata: { quiz_session_id: question.quiz_session_id, order_index: question.order_index },
  });
  return c.json(question, 201);
});

app.post('/api/quiz/sessions/:sessionId/questions/from-paper', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  if (envValue('ENABLE_PDF_QUIZ_UPLOADS', c) !== 'true') {
    return c.json({ error: 'PDF quiz generation is coming soon for hosted deployments.' }, 501);
  }

  const session = await getQuizSessionById(c.req.param('sessionId'));
  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  if (session.status === 'active' || session.status === 'finished') {
    return c.json({ error: 'Paper questions can only be added before the quiz starts' }, 409);
  }

  let formData: FormData;
  try {
    formData = await c.req.raw.formData();
  } catch {
    return c.json({ error: 'Upload must use multipart/form-data' }, 400);
  }

  const uploadedFile = formData.get('file');
  if (!(uploadedFile instanceof File)) {
    return c.json({ error: 'A PDF file is required' }, 400);
  }

  const fileValidationError = validatePaperQuizFile(uploadedFile);
  if (fileValidationError) {
    return c.json({ error: fileValidationError }, 400);
  }

  const arrayBuffer = await uploadedFile.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  if (!hasPdfHeader(bytes)) {
    return c.json({ error: 'Uploaded file does not look like a valid PDF' }, 400);
  }

  const requestedQuestionCount = parseRequestedQuestionCount(formData.get('question_count'));
  let extractedText = '';

  try {
    extractedText = await extractTextFromPdf(bytes);
  } catch (error) {
    console.error('PDF extraction failed:', error);
    return c.json({ error: 'Could not extract text from this PDF. Try a text-based, non-password-protected PDF.' }, 422);
  }

  if (extractedText.length < PAPER_QUIZ_MIN_TEXT_CHARS) {
    return c.json({
      error: 'Not enough readable text was found in this PDF. Scanned/image-only PDFs are not supported by this prototype.',
    }, 422);
  }

  const drafts = generateQuestionDraftsFromText(extractedText, requestedQuestionCount);
  if (drafts.length === 0) {
    return c.json({ error: 'Could not identify enough quiz-worthy terms in this PDF. Try a longer paper or add questions manually.' }, 422);
  }

  const existingQuestions = await getQuestionsBySession(session.id);
  const firstOrderIndex = Math.max(-1, ...existingQuestions.map((question) => question.order_index)) + 1;
  const createdQuestions: Question[] = [];

  for (const [index, draft] of drafts.entries()) {
    createdQuestions.push(await createQuestion({
      quiz_session_id: session.id,
      question_text: draft.question_text,
      options: draft.options,
      correct_index: draft.correct_index,
      order_index: firstOrderIndex + index,
      time_limit_seconds: 20,
      points: 1000,
    }));
  }

  const response: GeneratedQuizFromPaperResponse = {
    session_id: session.id,
    questions: createdQuestions,
    summary: {
      source_file_name: uploadedFile.name || 'uploaded.pdf',
      extracted_character_count: extractedText.length,
      requested_question_count: requestedQuestionCount,
      created_question_count: createdQuestions.length,
      generation_note: PAPER_QUIZ_GENERATION_NOTE,
      warnings: createdQuestions.length < requestedQuestionCount
        ? ['Fewer questions were generated than requested because the extracted text had limited distinct quiz terms.']
        : [],
    },
  };

  await auditAdminAction(c, {
    action: 'quiz.question.generate_from_paper',
    targetType: 'quiz_session',
    targetId: session.id,
    metadata: {
      source_file_name: uploadedFile.name || 'uploaded.pdf',
      created_question_count: createdQuestions.length,
    },
  });

  return c.json(response, 201);
});

app.patch('/api/quiz/questions/:questionId', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  try {
    const questionId = c.req.param('questionId');
    const existingQuestion = await getQuestionById(questionId);
    if (!existingQuestion) {
      return c.json({ error: 'Question not found' }, 404);
    }

    const body = await c.req.json();
    const updates: Partial<Omit<Question, 'id' | 'created_at'>> = {};

    if (body.quiz_session_id !== undefined) updates.quiz_session_id = String(body.quiz_session_id);
    if (body.question_text !== undefined) updates.question_text = String(body.question_text).trim();
    if (body.options !== undefined) {
      if (!Array.isArray(body.options)) {
        return c.json({ error: 'options must be an array of 4 answers' }, 400);
      }
      updates.options = body.options.map((option: unknown) => String(option).trim());
    }
    if (body.correct_index !== undefined) updates.correct_index = Number(body.correct_index);
    if (body.order_index !== undefined) updates.order_index = Number(body.order_index);
    if (body.time_limit_seconds !== undefined) updates.time_limit_seconds = Number(body.time_limit_seconds);
    if (body.points !== undefined) updates.points = Number(body.points);

    if (body.question_text !== undefined || body.options !== undefined || body.correct_index !== undefined) {
      const validationError = validateQuestionPayload(
        updates.question_text ?? existingQuestion.question_text,
        updates.options ?? existingQuestion.options,
        updates.correct_index ?? existingQuestion.correct_index,
      );
      if (validationError) {
        return c.json({ error: validationError }, 400);
      }
    }

    const question = await updateQuestion(questionId, updates);
    await auditAdminAction(c, {
      action: 'quiz.question.update',
      targetType: 'quiz_question',
      targetId: questionId,
      metadata: { quiz_session_id: question.quiz_session_id, changed_fields: Object.keys(updates).sort() },
    });
    return c.json(question);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Failed to update question' }, 500);
  }
});

app.delete('/api/quiz/questions/:questionId', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  try {
    const questionId = c.req.param('questionId');
    const existingQuestion = await getQuestionById(questionId);
    await deleteQuestion(questionId);
    await auditAdminAction(c, {
      action: 'quiz.question.delete',
      targetType: 'quiz_question',
      targetId: questionId,
      metadata: { quiz_session_id: existingQuestion?.quiz_session_id ?? null },
    });
    return c.json({ ok: true });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Failed to delete question' }, 500);
  }
});

app.post('/api/quiz/questions/reorder', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  const { session_id, question_ids } = await c.req.json();
  if (!session_id || !Array.isArray(question_ids)) {
    return c.json({ error: 'session_id and question_ids are required' }, 400);
  }
  await reorderQuestions(session_id, question_ids);
  await auditAdminAction(c, {
    action: 'quiz.question.reorder',
    targetType: 'quiz_session',
    targetId: String(session_id),
    metadata: { question_count: question_ids.length },
  });
  return c.json({ ok: true });
});

app.post('/api/quiz/join', async (c) => {
  const body = await c.req.json();
  const { join_code, nickname, device_id } = body;

  if (!join_code || !nickname || !device_id) {
    return c.json({ error: 'join_code, nickname, and device_id are required' }, 400);
  }

  const session = await getQuizSessionByCode(String(join_code).toUpperCase());
  if (!session) {
    return c.json({ error: 'Invalid join code' }, 404);
  }

  if (session.status === 'finished') {
    return c.json({ error: 'This quiz has already finished' }, 400);
  }

  let user = await getUserByDeviceId(device_id);
  if (!user) {
    user = await createUser({ device_id, nickname });
  }

  const existingParticipant = await getQuizParticipantBySessionAndUser(session.id, user.id);
  if (existingParticipant) {
    return c.json({
      session_id: session.id,
      user_id: user.id,
      participant_id: existingParticipant.id,
    });
  }

  const participant = await createQuizParticipant({
    quiz_session_id: session.id,
    user_id: user.id,
    nickname_used: nickname,
  });
  await updateUser(user.id, {
    events_participated: user.events_participated + 1,
  });

  return c.json({
    session_id: session.id,
    user_id: user.id,
    participant_id: participant.id,
  });
});

app.post('/api/quiz/answer', async (c) => {
  const body = await c.req.json();
  const { session_id, user_id, answer_index } = body;

  if (!session_id || !user_id || answer_index === undefined) {
    return c.json({ error: 'session_id, user_id, and answer_index are required' }, 400);
  }

  const session = await getQuizSessionById(session_id);
  if (!session || session.status !== 'active') {
    return c.json({ error: 'Quiz is not active' }, 400);
  }

  if (session.question_phase !== 'answering') {
    return c.json({ error: 'Question is not accepting answers' }, 400);
  }

  const questions = await getQuestionsBySession(session_id);
  const currentQuestion = questions.find((question) => question.order_index === session.current_question_index);

  if (!currentQuestion) {
    return c.json({ error: 'No active question' }, 400);
  }

  const existing = await getResponseByQuestionAndUser(currentQuestion.id, user_id);
  if (existing) {
    return c.json({ error: 'Already answered this question' }, 400);
  }

  const questionStartTime = session.question_started_at ? new Date(session.question_started_at).getTime() : Date.now();
  const timeTakenMs = Date.now() - questionStartTime;
  const timeLimitMs = currentQuestion.time_limit_seconds * 1000;

  if (timeTakenMs > timeLimitMs + 2000) {
    return c.json({ error: 'Answer submitted too late' }, 400);
  }

  const isCorrect = answer_index === currentQuestion.correct_index;
  const basePoints = calculatePoints(currentQuestion.points, timeLimitMs, timeTakenMs, isCorrect);
  const participant = await getQuizParticipantBySessionAndUser(session_id, user_id);

  if (!participant) {
    return c.json({ error: 'Participant not found' }, 400);
  }

  const newStreak = isCorrect ? participant.current_streak + 1 : 0;
  const streakBonus = isCorrect ? calculateStreakBonus(newStreak) : 0;
  const totalPoints = basePoints + streakBonus;

  await createResponse({
    question_id: currentQuestion.id,
    user_id,
    answer_index,
    answered_at: now(),
    time_taken_ms: Math.round(timeTakenMs),
    points_awarded: totalPoints,
    is_correct: isCorrect,
  });

  await updateQuizParticipant(participant.id, {
    total_score: participant.total_score + totalPoints,
    current_streak: newStreak,
  });
  const user = await getUserById(user_id);
  if (user && !user.merged_into_user_id) {
    await updateUser(user.id, {
      total_points: user.total_points + totalPoints,
    });
  }

  return c.json({
    is_correct: isCorrect,
    points_awarded: totalPoints,
    correct_index: currentQuestion.correct_index,
    streak_count: newStreak,
  });
});

app.get('/api/quiz/state', async (c) => {
  const sessionId = c.req.query('sessionId');
  const userId = c.req.query('userId');

  if (!sessionId) {
    return c.json({ error: 'sessionId is required' }, 400);
  }

  const stateResponse = await buildQuizStateResponse(sessionId, userId);
  if (!stateResponse) {
    return c.json({ error: 'Session not found' }, 404);
  }

  await new Promise((resolve) => setTimeout(resolve, SIMULATED_DELAY_MS));

  return c.json(stateResponse);
});

app.post('/api/quiz/state/advance', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const sessionId = typeof body.session_id === 'string' ? body.session_id : '';

  if (!sessionId) {
    return c.json({ error: 'session_id is required' }, 400);
  }

  const result = await advanceQuizSessionState(sessionId);
  if (!result.session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  return c.json({ advanced: result.advanced });
});

app.post('/api/users/claim', async (c) => {
  const body = await c.req.json();
  const { user_id, device_id, username, email, secret_question, secret_answer } = body;

  if (!user_id || !device_id || !username || !secret_question || !secret_answer) {
    return c.json({ error: 'user_id, device_id, username, secret_question, and secret_answer are required' }, 400);
  }

  const user = await getUserById(user_id);

  if (!user || user.merged_into_user_id) {
    return c.json({ error: 'User not found' }, 404);
  }

  if (user.is_admin) {
    return c.json({ error: 'Admin users cannot be claimed from this flow' }, 400);
  }

  const trimmedUsername = String(username).trim();
  const trimmedQuestion = String(secret_question).trim();
  const trimmedAnswer = String(secret_answer).trim();
  const normalizedEmail = email ? String(email).trim().toLowerCase() : null;

  if (!trimmedUsername || !trimmedQuestion || !trimmedAnswer) {
    return c.json({ error: 'username, secret_question, and secret_answer must be non-empty' }, 400);
  }

  if (user.is_claimed && user.device_id && user.device_id !== device_id) {
    return c.json({ error: 'This profile is already claimed on another device' }, 409);
  }

  const existingDeviceUser = await getUserByDeviceId(device_id);
  if (existingDeviceUser && existingDeviceUser.id !== user.id && !existingDeviceUser.merged_into_user_id) {
    return c.json({
      error: 'This device is already linked to another profile. Merge that profile into your claimed one instead.',
      conflict_user_id: existingDeviceUser.id,
    }, 409);
  }

  const updated = await updateUser(user.id, {
    device_id,
    username: trimmedUsername,
    email: normalizedEmail,
    secret_question: trimmedQuestion,
    secret_answer_hash: hashSecretAnswer(trimmedAnswer),
    is_claimed: true,
  });

  return c.json({
    user_id: updated.id,
    username: updated.username,
    email: updated.email,
    is_claimed: updated.is_claimed,
    total_points: updated.total_points,
    events_participated: updated.events_participated,
  });
});

app.post('/api/users/merge', async (c) => {
  const body = await c.req.json();
  const { target_user_id, source_user_id, secret_answer } = body;

  if (!target_user_id || !source_user_id || !secret_answer) {
    return c.json({ error: 'target_user_id, source_user_id, and secret_answer are required' }, 400);
  }

  if (target_user_id === source_user_id) {
    return c.json({ error: 'target_user_id and source_user_id must be different users' }, 400);
  }

  const users = await readData<User>('users');
  const targetIndex = users.findIndex((user) => user.id === target_user_id);
  const sourceIndex = users.findIndex((user) => user.id === source_user_id);

  if (targetIndex === -1 || sourceIndex === -1) {
    return c.json({ error: 'Target or source user not found' }, 404);
  }

  const target = users[targetIndex];
  const source = users[sourceIndex];

  if (!target.is_claimed) {
    return c.json({ error: 'Target account must be claimed before merging' }, 400);
  }

  if (source.merged_into_user_id) {
    return c.json({ error: 'Source account has already been merged' }, 409);
  }

  if (target.merged_into_user_id) {
    return c.json({ error: 'Target account is already merged into another user' }, 409);
  }

  if (source.is_admin || target.is_admin) {
    return c.json({ error: 'Admin users cannot be merged from this flow' }, 400);
  }

  if (!compareSecretAnswer(String(secret_answer), target.secret_answer_hash)) {
    return c.json({ error: 'Secret answer does not match target account' }, 403);
  }

  target.total_points += source.total_points;
  target.events_participated += source.events_participated;
  source.merged_into_user_id = target.id;
  source.total_points = 0;
  source.events_participated = 0;

  await writeData<User>('users', users);
  await mergeParticipantRecords(target, source);
  await mergeResponseRecords(target, source);

  return c.json({
    merged_into_user_id: target.id,
    source_user_id: source.id,
    target_total_points: target.total_points,
    target_events_participated: target.events_participated,
  });
});

app.get('*', (c) => {
  const pathname = new URL(c.req.url).pathname;
  const adminBasePath = `/${(envValue('VITE_ADMIN_BASE_PATH', c) ?? 'organizer-console').replace(/^\/+|\/+$/g, '')}`;
  const isOrganizerPath = pathname === adminBasePath || pathname.startsWith(`${adminBasePath}/`);
  const pageTitle = isOrganizerPath
    ? 'DevCongress | Organizers'
    : 'DevCongress | Community';

  return c.html(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/png" sizes="16x16" href="/brand/favicon-16x16.png" />
    <link rel="icon" type="image/png" sizes="32x32" href="/brand/favicon-32x32.png" />
    <link rel="icon" type="image/png" sizes="512x512" href="/brand/favicon-rounded-512.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/brand/apple-touch-icon.png" />
    <link rel="preconnect" href="https://api.fontshare.com" />
    <link href="https://api.fontshare.com/v2/css?f[]=satoshi@300,400,500,700,900&display=swap" rel="stylesheet" />
    <title>${pageTitle}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>`);
});

function validatePaperQuizFile(file: File): string | null {
  const isPdfType = file.type === 'application/pdf' || file.type === 'application/x-pdf' || file.type === '';
  const isPdfName = file.name.toLowerCase().endsWith('.pdf');

  if (!isPdfType || !isPdfName) {
    return 'File must be a PDF';
  }

  if (file.size <= 0) {
    return 'Uploaded PDF is empty';
  }

  if (file.size > PAPER_QUIZ_MAX_FILE_SIZE_BYTES) {
    return 'PDF must be 5MB or smaller';
  }

  return null;
}

function hasPdfHeader(bytes: Uint8Array): boolean {
  return bytes.length >= 5
    && bytes[0] === 0x25
    && bytes[1] === 0x50
    && bytes[2] === 0x44
    && bytes[3] === 0x46
    && bytes[4] === 0x2d;
}

function parseRequestedQuestionCount(value: FormDataEntryValue | null): number {
  const parsed = Number(value ?? PAPER_QUIZ_DEFAULT_QUESTION_COUNT);
  if (!Number.isFinite(parsed)) {
    return PAPER_QUIZ_DEFAULT_QUESTION_COUNT;
  }

  return Math.min(PAPER_QUIZ_MAX_QUESTION_COUNT, Math.max(1, Math.floor(parsed)));
}

async function extractTextFromPdf(bytes: Uint8Array): Promise<string> {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({
    data: bytes,
    useWorkerFetch: false,
    useSystemFonts: true,
    stopAtErrors: false,
  });

  try {
    const result = await parser.getText({
      first: 40,
      pageJoiner: '\n\n',
      parseHyperlinks: false,
    });

    return normalizeExtractedText(result.text).slice(0, PAPER_QUIZ_MAX_TEXT_CHARS);
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

function normalizeExtractedText(text: string): string {
  return text
    .replace(/\u0000/g, ' ')
    .replace(/-\s*\n\s*/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

type QuestionDraft = Pick<Question, 'question_text' | 'options' | 'correct_index'>;

function generateQuestionDraftsFromText(text: string, requestedCount: number): QuestionDraft[] {
  const terms = extractTerms(text, 80);
  const sentences = splitCandidateSentences(text)
    .map((sentence) => ({
      sentence,
      score: scoreSentence(sentence),
      terms: extractTerms(sentence, 8),
    }))
    .filter((candidate) => candidate.terms.length > 0)
    .sort((a, b) => b.score - a.score);

  const drafts: QuestionDraft[] = [];
  const usedAnswers = new Set<string>();

  for (const candidate of sentences) {
    if (drafts.length >= requestedCount) {
      break;
    }

    const answer = candidate.terms.find((term) => !usedAnswers.has(normalizeTermKey(term)));
    if (!answer) {
      continue;
    }

    const distractors = terms
      .filter((term) => normalizeTermKey(term) !== normalizeTermKey(answer))
      .filter((term) => !candidate.sentence.toLowerCase().includes(term.toLowerCase()))
      .slice(0, 12);
    const options = pickOptions(answer, distractors);

    if (options.length !== 4) {
      continue;
    }

    const correctIndex = options.findIndex((option) => normalizeTermKey(option) === normalizeTermKey(answer));
    if (correctIndex < 0) {
      continue;
    }

    drafts.push({
      question_text: `Prototype from paper: which term best completes this statement? "${blankSentence(candidate.sentence, answer)}"`,
      options,
      correct_index: correctIndex,
    });
    usedAnswers.add(normalizeTermKey(answer));
  }

  return drafts;
}

function splitCandidateSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 80 && sentence.length <= 280)
    .filter((sentence) => !/^(references|bibliography|appendix|acknowledg)/i.test(sentence))
    .filter((sentence) => !/(https?:\/\/|www\.|@)/i.test(sentence));
}

function scoreSentence(sentence: string): number {
  const terms = extractTerms(sentence, 12);
  let score = terms.length * 3;

  if (/\b(is|are|was|were|means|refers|defines|enables|supports|uses|provides|requires|improves|reduces|increases)\b/i.test(sentence)) {
    score += 8;
  }

  if (/[A-Z]{2,}/.test(sentence)) {
    score += 4;
  }

  if (sentence.length >= 110 && sentence.length <= 220) {
    score += 4;
  }

  if (/\b(table|figure|fig\.|et al\.|copyright|license)\b/i.test(sentence)) {
    score -= 8;
  }

  return score;
}

function extractTerms(text: string, limit: number): string[] {
  const counts = new Map<string, { term: string; count: number; score: number }>();
  const matches = text.match(/\b[A-Za-z][A-Za-z0-9+#./-]{2,}\b/g) ?? [];

  for (const rawTerm of matches) {
    const term = normalizeDisplayTerm(rawTerm);
    const key = normalizeTermKey(term);

    if (!isUsableTerm(term, key)) {
      continue;
    }

    const current = counts.get(key) ?? { term, count: 0, score: termScore(term) };
    current.count += 1;
    current.score += 1;
    counts.set(key, current);
  }

  return [...counts.values()]
    .sort((a, b) => (b.score + b.count) - (a.score + a.count))
    .map((entry) => entry.term)
    .slice(0, limit);
}

function normalizeDisplayTerm(term: string): string {
  return term.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9+#./-]+$/g, '');
}

function normalizeTermKey(term: string): string {
  return term.toLowerCase().replace(/[^a-z0-9+#]+/g, '');
}

function isUsableTerm(term: string, key: string): boolean {
  return key.length >= 3
    && key.length <= 28
    && !STOP_WORDS.has(key)
    && !/^\d+$/.test(key)
    && !/^(doi|isbn|http|https|www|com|org|edu|page|pages|figure|table|chapter|section)$/.test(key);
}

function termScore(term: string): number {
  let score = Math.min(term.length, 14);
  if (/[A-Z]/.test(term.slice(1))) score += 4;
  if (/[0-9+#./-]/.test(term)) score += 3;
  if (term.length >= 8) score += 2;
  return score;
}

function pickOptions(answer: string, distractors: string[]): string[] {
  const unique = [answer];
  const seen = new Set([normalizeTermKey(answer)]);

  for (const distractor of distractors) {
    const key = normalizeTermKey(distractor);
    if (!seen.has(key)) {
      unique.push(distractor);
      seen.add(key);
    }

    if (unique.length === 4) {
      break;
    }
  }

  return stableShuffle(unique);
}

function stableShuffle(options: string[]): string[] {
  return [...options].sort((a, b) => hashString(a) - hashString(b));
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function blankSentence(sentence: string, answer: string): string {
  const escaped = answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const blanked = sentence.replace(new RegExp(`\\b${escaped}\\b`, 'i'), '_____');
  return truncateText(blanked, 210);
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3).trim()}...`;
}

function validateQuestionPayload(questionText: unknown, options: unknown[], correctIndex: number): string | null {
  if (!String(questionText ?? '').trim()) {
    return 'Question text is required';
  }

  if (options.length !== 4) {
    return 'Exactly 4 options are required';
  }

  if (options.some((option) => !String(option ?? '').trim())) {
    return 'All options are required';
  }

  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
    return 'correct_index must be between 0 and 3';
  }

  return null;
}

async function buildLeaderboard(): Promise<(LeaderboardEntry & { events_participated: number; is_claimed: boolean; device_id: string | null })[]> {
  const users = await getAllUsers();

  return users
    .filter((user) => !user.is_admin && !user.merged_into_user_id && user.total_points > 0)
    .sort((a, b) => b.total_points - a.total_points)
    .map((user, index) => ({
      rank: index + 1,
      nickname: user.username || user.nickname || 'Anonymous',
      total_score: user.total_points,
      events_participated: user.events_participated,
      is_claimed: user.is_claimed,
      user_id: user.id,
      device_id: user.device_id,
      streak_count: 0,
    }));
}

async function buildSessionLeaderboard(sessionId: string): Promise<LeaderboardEntry[]> {
  const participants = await getQuizParticipantsBySession(sessionId);

  return participants
    .sort((a, b) => b.total_score - a.total_score)
    .map((participant, index) => ({
      user_id: participant.user_id,
      nickname: participant.nickname_used,
      total_score: participant.total_score,
      rank: index + 1,
      streak_count: participant.current_streak,
    }));
}

async function buildMonthlyLeaderboard(): Promise<(LeaderboardEntry & { events_participated: number; is_claimed: boolean; device_id: string | null })[]> {
  const [users, responses] = await Promise.all([
    getAllUsers(),
    readData<Response>('responses'),
  ]);
  const userById = new Map(users.map((user) => [user.id, user]));
  const nowDate = new Date();
  const monthStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1).getTime();
  const totals = new Map<string, number>();

  for (const response of responses) {
    if (new Date(response.created_at).getTime() < monthStart || !response.points_awarded) {
      continue;
    }
    totals.set(response.user_id, (totals.get(response.user_id) ?? 0) + response.points_awarded);
  }

  return [...totals.entries()]
    .map(([userId, score]) => ({ user: userById.get(userId), score }))
    .filter((entry): entry is { user: User; score: number } => Boolean(entry.user && !entry.user.is_admin && !entry.user.merged_into_user_id))
    .sort((a, b) => b.score - a.score)
    .map(({ user, score }, index) => ({
      rank: index + 1,
      nickname: user.username || user.nickname || 'Anonymous',
      total_score: score,
      events_participated: user.events_participated,
      is_claimed: user.is_claimed,
      user_id: user.id,
      device_id: user.device_id,
      streak_count: 0,
    }));
}

async function mergeParticipantRecords(target: User, source: User) {
  const participants = await readData<QuizParticipant>('quiz-participants');
  const participantBySession = new Map<string, QuizParticipant>();
  const participantIndexesToDelete: number[] = [];

  for (const participant of participants) {
    if (participant.user_id === target.id) {
      participantBySession.set(participant.quiz_session_id, participant);
    }
  }

  for (let index = 0; index < participants.length; index += 1) {
    const participant = participants[index];
    if (participant.user_id !== source.id) {
      continue;
    }

    const targetParticipant = participantBySession.get(participant.quiz_session_id);

    if (!targetParticipant) {
      participant.user_id = target.id;
      participantBySession.set(participant.quiz_session_id, participant);
      continue;
    }

    targetParticipant.total_score += participant.total_score;
    targetParticipant.current_streak = Math.max(targetParticipant.current_streak, participant.current_streak);
    participantIndexesToDelete.push(index);
  }

  if (participantIndexesToDelete.length > 0) {
    const removeSet = new Set(participantIndexesToDelete);
    await writeData<QuizParticipant>('quiz-participants', participants.filter((_, index) => !removeSet.has(index)));
    return;
  }

  await writeData<QuizParticipant>('quiz-participants', participants);
}

async function mergeResponseRecords(target: User, source: User) {
  const responses = await readData<Response>('responses');
  for (const response of responses) {
    if (response.user_id === source.id) {
      response.user_id = target.id;
    }
  }
  await writeData<Response>('responses', responses);
}

export default app;
