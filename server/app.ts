import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { compareSecretAnswer, hashSecretAnswer } from '@/lib/account-claim';
import { attendanceUploadWindowForEvent } from '@/lib/attendance-upload-window';
import { APP_BOOT_MARKUP, APP_BOOT_STYLES } from '@/lib/app-boot';
import {
  isEventFeedbackAnswerPresent,
  isEventFeedbackNotAttended,
  isEventFeedbackRating,
  normalizeEventFeedbackAnswer,
} from '@/lib/event-feedback';
import { feedbackCampaignWindow, isFeedbackCampaignOpen } from '@/lib/event-feedback-window';
import { prepareResendBroadcast, sendResendBroadcast, sendResendEmailBatch, ResendBatchError, ResendBroadcastError } from '@/lib/email/resend';
import { EMAIL_SENDERS } from '@/lib/email/scenarios';
import {
  eventRegistrationCalendarFile,
  eventRegistrationConfirmationEmail,
} from '@/lib/email/templates/event-registration-confirmation';
import { communityEventSubmissionEmail } from '@/lib/email/templates/community-event-submission';
import { monthlyArchiveRequestEmail } from '@/lib/email/templates/monthly-archive-request';
import { registrationAvailability, summarizeEventRegistrations } from '@/lib/event-registration';
import {
  cancelRegistration,
  checkInRegistration,
  createRegistrationCampaign,
  deleteRegistration,
  getEventRegistrations,
  getPendingRegistrationEmails,
  getRegistrationCampaign,
  registerForEvent,
  updateRegistrationCampaign,
  updateRegistrationEmailDelivery,
} from '@/lib/event-registration-store';
import { createEventBlast, getEventBlasts, updateEventBlast } from '@/lib/event-blast-store';
import { EventBlastStorageError } from '@/lib/supabase/event-blasts';
import {
  ANNUAL_CONFERENCE_TASK_PRIORITIES,
  ANNUAL_CONFERENCE_TASK_STATUSES,
  ANNUAL_CONFERENCE_WORKSTREAMS,
} from '@/lib/annual-conference-work-plan';
import { createEventFormSchema, toCreateEventApiPayload } from '@/src/lib/event-form';
import { safeGoogleMapsUrl } from '@/lib/location-links';
import { GooglePlacesSearchError, searchGhanaVenues } from '@/lib/google-places';
import { canChangeChecklistItemAvailability } from '@/lib/event-checklist-policy';
import { isEventSeriesType, resolveEventSeriesType } from '@/lib/event-series';
import {
  CFP_SUBMISSION_TURNSTILE_ACTION,
  EVENT_FEEDBACK_TURNSTILE_ACTION,
  EVENT_REGISTRATION_TURNSTILE_ACTION,
  EVENT_SUBMISSION_TURNSTILE_ACTION,
  ROUTE_FEEDBACK_TURNSTILE_ACTION,
  VOLUNTEER_INTAKE_TURNSTILE_ACTION,
  validateTurnstileToken,
} from '@/lib/turnstile';
import { attendanceMonthForEvent, buildAttendanceInsights, buildAttendanceLedger, buildAttendanceSummary, getAttendanceImports, getLatestAttendanceImport, removeAttendanceImport, replaceAttendanceImportFromCsv } from '@/lib/mock-db/attendance';
import { getEventChecklist, setEventChecklistItemDisabled, updateEventChecklistItem } from '@/lib/mock-db/event-checklists';
import { createEvent as createMockEvent, deleteEvent as deleteMockEvent, getAllEvents as getAllMockEvents, getEventById as getMockEventById, updateEvent as updateMockEvent } from '@/lib/mock-db/events';
import { eventTestModeEnabled, markTestEventTitle } from '@/lib/event-test-mode';
import { createDefaultFeedbackCampaign, createEventFeedbackSubmission, deleteFeedbackCampaignByEvent, getAllFeedbackCampaigns, getAllFeedbackSubmissions, getFeedbackCampaignByEvent, getFeedbackSubmissionByResponseToken, getFeedbackSubmissionsByEvent, getOrCreateFeedbackCampaign, updateFeedbackCampaign } from '@/lib/mock-db/feedback';
import { createQuestion, deleteQuestion, getQuestionById, getQuestionsBySession, reorderQuestions, updateQuestion } from '@/lib/mock-db/questions';
import { readData, writeData } from '@/lib/mock-db';
import { createQuizParticipant, getQuizParticipantById, getQuizParticipantBySessionAndUser, getQuizParticipantsBySession, mergeQuizParticipantUsers, QuizParticipantNicknameTakenError, renameQuizParticipant, updateQuizParticipant } from '@/lib/mock-db/quiz-participants';
import { createQuizSession, getAllQuizSessions, getQuizSessionByCode, getQuizSessionById, getQuizSessionsByEvent, updateQuizSession } from '@/lib/mock-db/quiz-sessions';
import { createResponse, getResponseByQuestionAndUser, getResponsesByQuestion, QuizAnswerConflictError, submitQuizAnswerAtomically } from '@/lib/mock-db/responses';
import { nextUnreleasedLearningQuestion, prepareSystemDesignPresentationRun, releaseNextSystemDesignQuestion, revealSystemDesignQuestion } from '@/lib/mock-db/system-design-learning-room';
import { claimSpeakerIntakeLink, consumeSpeakerIntakeLink, createSpeakerIntakeLink, deleteActiveSpeakerIntakeLinksBySubmission, deleteSpeakerIntakeLink, getSpeakerIntakeLinkByToken, getSpeakerIntakeLinksByEvent, releaseSpeakerIntakeLinkClaim, speakerIntakeLinkExpired, updateSpeakerIntakeLinkEmailDeliveries } from '@/lib/mock-db/speaker-intake-links';
import { createSpeakerSubmission, getSpeakerSubmissionById, getSpeakerSubmissionsByEvent, updateSpeakerSubmission } from '@/lib/mock-db/speaker-submissions';
import { createVolunteerApplication, getVolunteerApplications } from '@/lib/mock-db/volunteer-applications';
import { addSpeaker, getSpeakerByEmail, getSpeakersByEvent, removeSpeaker } from '@/lib/mock-db/speakers';
import { getSupabaseAdminClient, isSupabaseRuntimeEnabled, isSupabaseServerConfigured } from '@/lib/supabase/server';
import { completeSupabaseAdminToken, configuredFrontendOrigins, defaultAdminRedirectPath, getAdminSession, isSupabaseAdminAuthConfigured, recordAdminAudit, requireAdmin, revokeAdminSession, revokeAdminSessionsForMembership, type AdminSession } from '@/lib/supabase/admin-auth';
import { createSupabaseCommunityEvent, deleteSupabaseCommunityEvent, getSupabaseCommunityEventById, getSupabaseCommunityEventBySlug, getSupabaseCommunityEvents, getSupabasePublicEvents, getSupabasePublicMeetups, updateSupabaseCommunityEvent } from '@/lib/supabase/community-events';
import {
  approveEventSubmission,
  createEventSubmission,
  EventSubmissionStorageError,
  getPendingEventSubmissionEmails,
  listEventSubmissions,
  rejectEventSubmission,
  updateEventSubmissionEmailDelivery,
} from '@/lib/supabase/event-submissions';
import { createSupabaseEventFeedbackSubmission, createSupabaseFeedbackCampaign, deleteSupabaseFeedbackCampaignByEvent, getSupabaseFeedbackCampaignByEvent, getSupabaseFeedbackSubmissionsByEvent, updateSupabaseFeedbackCampaign } from '@/lib/supabase/feedback-campaigns';
import { uploadMeetupMedia, validateMeetupMediaContent, validateMeetupMediaFile } from '@/lib/supabase/media';
import { createTalk, deleteTalk, getAllTalks, getTalkById, getTalksByEvent, updateTalk } from '@/lib/mock-db/talks';
import { createUser, getAllUsers, getUserByDeviceId, getUserById, updateUser } from '@/lib/mock-db/users';
import { calculatePoints, calculateStreakBonus } from '@/lib/scoring';
import { consumePublicRateLimit, type PublicRateLimitResult } from '@/lib/public-rate-limit';
import {
  archiveRequestProgramItems,
  sameArchiveProgramItemIdentity,
} from '@/lib/speaker-archive-email';
import {
  SPEAKER_ARCHIVE_ABSTRACT_MAX_CHARACTERS,
  SPEAKER_ARCHIVE_BIO_MAX_CHARACTERS,
} from '@/lib/speaker-intake-limits';
import { canonicalizeSystemDesignSchedule, findSystemDesignSource } from '@/lib/system-design';
import {
  generateParticipantAlias,
  validateParticipantDisplayName,
} from '@/lib/system-design-participant-identity';
import { safeHttpUrl, safeWebsiteUrl } from '@/lib/safe-url';
import { resolveEventStatus, withResolvedEventStatus } from '@/lib/event-status';
import { adminRolesForApiRequest } from '@/server/admin-api-access';
import { createAnnualConferenceRepository } from '@/server/annual-conference-repository';
import {
  AnnualConferenceServiceError,
  annualConferenceErrorStatus,
  createAnnualConferenceService,
} from '@/server/annual-conference-service';
import { generateId, now } from '@/lib/utils';
import { envValue } from '@/server/env';
import { withRequestEnv } from '@/server/request-env';
import { safeErrorName, securitySafeRequestPath } from '@/server/security-log';
import { advanceQuizSessionState, buildQuizStateResponse } from '@/server/quiz-state';
import type { Context } from 'hono';
import crypto from 'crypto';
import type { ArchiveItemKind, Event, EventChecklistItem, EventFeedbackSubmission, EventSeriesType, EventSubmissionEmailKind, EventSubmissionReviewStatus, FeedbackAnswer, FeedbackCampaign, FeedbackCampaignStatus, FeedbackQuestion, FeedbackQuestionType, GeneratedQuizFromPaperResponse, LeaderboardEntry, PublicArchiveEvent, PublicArchiveEventResponse, PublicArchiveTalk, PublicEvent, PublicHomeResponse, PublicMeetup, PublicMeetupScheduleItem, PublicMeetupSpeaker, Question, QuizParticipant, QuizSession, Response, SpeakerIntakeLink, SpeakerSubmission, SpeakerSubmissionStatus, Talk, TalkStatus, User } from '@/types';
import type { FeedbackKind, FeedbackStatus } from '@/types/supabase';

type AppBindings = {
  Variables: {
    requestId: string;
    adminSession: AdminSession | undefined;
  };
};

const app = new Hono<AppBindings>();

app.use('*', async (c, next) => {
  return withRequestEnv(c.env as Record<string, unknown> | undefined, next);
});

app.onError((error, c) => {
  if (error instanceof HTTPException) {
    return error.getResponse();
  }

  const requestId = c.get('requestId') as string | undefined;
  console.error(JSON.stringify({
    event: 'unhandled_request_error',
    request_id: requestId ?? null,
    method: c.req.method,
    path: securitySafeRequestPath(c.req.path),
    error_name: safeErrorName(error),
  }));
  return c.json({ error: 'An unexpected error occurred. Please try again.' }, 500);
});

app.use('*', async (c, next) => {
  const requestId = c.req.header('cf-ray') ?? crypto.randomUUID();
  c.set('requestId', requestId);
  if (c.req.path.startsWith('/api/')) {
    // API responses are private by default. Purpose-built public read routes
    // may replace this with an explicit cache policy in their own handlers.
    c.header('Cache-Control', 'no-store');
  }
  await next();

  c.header('X-Request-ID', requestId);
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-Permitted-Cross-Domain-Policies', 'none');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  c.header('Cross-Origin-Opener-Policy', 'same-origin');
  c.header(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "script-src 'self' https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline' https://api.fontshare.com",
      "font-src 'self' data: https://cdn.fontshare.com",
      "img-src 'self' data: blob: https:",
      "media-src 'self' https:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://challenges.cloudflare.com",
      "frame-src https://challenges.cloudflare.com https://youtube.com https://www.youtube.com https://youtube-nocookie.com https://www.youtube-nocookie.com https://player.vimeo.com",
      "worker-src 'self' blob:",
    ].join('; '),
  );

  if (envValue('NODE_ENV', c) === 'production') {
    c.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
});

const API_BODY_MAX_BYTES = 7 * 1024 * 1024;
const PUBLIC_JSON_BODY_MAX_BYTES = 64 * 1024;
const bodyTooLarge = (c: Context) => c.json({ error: 'Request body is too large.' }, 413);

app.use('/api/*', bodyLimit({
  maxSize: API_BODY_MAX_BYTES,
  onError: bodyTooLarge,
}));

for (const publicWritePath of [
  '/api/feedback',
  '/api/feedback/events/*',
  '/api/volunteer-applications',
  '/api/cfp',
  '/api/registration/events/*',
  '/api/public/event-submissions',
  '/api/auth/admin/exchange',
  '/api/events/*/speaker-intake/*',
  '/api/quiz/join',
  '/api/quiz/answer',
  '/api/quiz/participants/*',
]) {
  app.use(publicWritePath, bodyLimit({
    maxSize: PUBLIC_JSON_BODY_MAX_BYTES,
    onError: bodyTooLarge,
  }));
}

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
const EVENT_FEEDBACK_TOKEN_MIN_CHARS = 20;
const EVENT_FEEDBACK_TOKEN_MAX_CHARS = 160;
const EVENT_FEEDBACK_COMMENT_MAX_CHARS = 1500;
const FEEDBACK_SUBMISSION_MESSAGE_MAX_CHARS = 4000;
const GOOGLE_SLIDES_MAX_TEXT_CHARS = 500_000;
const GOOGLE_SLIDES_MAX_BYTES = 1_000_000;
const GOOGLE_SLIDES_FETCH_TIMEOUT_MS = 8_000;
const FEEDBACK_CAMPAIGN_STATUSES = new Set<FeedbackCampaignStatus>(['draft', 'active', 'closed']);
const FEEDBACK_QUESTION_TYPES = new Set<FeedbackQuestionType>(['rating', 'text', 'choice', 'talk_select', 'yes_no']);
const ROUTE_FEEDBACK_STATUSES = new Set<FeedbackStatus>(['new', 'reviewing', 'done', 'wont_fix']);
const speakerIntakeSubmissionLocks = new Map<string, Promise<void>>();
const eventRegistrationSubmissionSchema = z.object({
  name: z.string().trim().min(1, 'Please enter your name.').max(120),
  email: z.string().trim().toLowerCase().email('Please enter a valid email address.').max(254),
  turnstile_action: z.string().trim().max(80).optional(),
  turnstile_token: z.string().trim().max(4096).optional(),
}).strict();
const eventRegistrationCampaignUpdateSchema = z.object({
  status: z.enum(['draft', 'open', 'closed']).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  capacity: z.coerce.number().int().min(1).max(5000).optional(),
  opens_at: z.string().datetime().nullable().optional(),
  closes_at: z.string().datetime().nullable().optional(),
}).strict().superRefine((value, ctx) => {
  if (
    value.opens_at
    && value.closes_at
    && new Date(value.closes_at).getTime() < new Date(value.opens_at).getTime()
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['closes_at'],
      message: 'Registration cannot close before it opens.',
    });
  }
});
const eventBlastRequestSchema = z.object({
  subject: z.string().trim().min(1, 'Add an email subject.').max(160),
  body: z.string().trim().min(1, 'Add a message.').max(5000),
  scheduled_for: z.string().datetime().nullable().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.scheduled_for && new Date(value.scheduled_for).getTime() < Date.now() + 60_000) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['scheduled_for'],
      message: 'Choose a send time at least one minute from now.',
    });
  }
});
const eventDateSchema = z.string().trim().max(40).refine(
  (value) => !Number.isNaN(new Date(value).getTime()),
  'Use a valid event date.',
);
const httpUrlSchema = z.string().trim().max(2048).refine(
  (value) => Boolean(safeHttpUrl(value)),
  'Use a valid http(s) URL.',
);
const websiteUrlSchema = z.string().trim().max(2048).refine(
  (value) => Boolean(safeWebsiteUrl(value)),
  'Use a valid site path or http(s) URL.',
);
const eventSubmissionUrlSchema = z.string().trim().max(2048).refine(
  (value) => Boolean(safeHttpUrl(value)),
  'Use a valid http(s) URL.',
);
const eventSubmissionOptionalUrlSchema = z.union([eventSubmissionUrlSchema, z.literal('')])
  .optional()
  .transform((value) => value || undefined);
const eventSubmissionDateSchema = z.string().datetime({ offset: true });
const eventSubmissionSchema = z.object({
  title: z.string().trim().min(3, 'Enter an event title.').max(160),
  summary: z.string().trim().min(20, 'Add a short event summary.').max(2000),
  format: z.enum(['meetup', 'conference', 'workshop', 'hackathon', 'webinar', 'other']),
  starts_at: eventSubmissionDateSchema,
  ends_at: eventSubmissionDateSchema,
  timezone: z.string().trim().min(1).max(80).refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }, 'Choose a valid time zone.'),
  location_type: z.enum(['in_person', 'online', 'hybrid']),
  venue_name: z.string().trim().max(200).optional(),
  venue_address: z.string().trim().max(300).optional(),
  online_url: eventSubmissionOptionalUrlSchema,
  registration_url: eventSubmissionOptionalUrlSchema,
  organizer_name: z.string().trim().min(2, 'Enter the organizer name.').max(160),
  organizer_email: z.string().trim().toLowerCase().email('Enter a valid organizer email.').max(254),
  organizer_website: eventSubmissionOptionalUrlSchema,
  notes: z.string().trim().max(1500).optional(),
  turnstile_action: z.string().trim().max(80),
  turnstile_token: z.string().trim().max(4096),
}).strict().superRefine((value, ctx) => {
  const startsAt = new Date(value.starts_at).getTime();
  const endsAt = new Date(value.ends_at).getTime();
  if (startsAt <= Date.now()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['starts_at'], message: 'Choose a future start time.' });
  }
  if (endsAt <= startsAt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ends_at'], message: 'End time must be after the start time.' });
  }
  if (endsAt - startsAt > 31 * 24 * 60 * 60 * 1000) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ends_at'], message: 'An event cannot span more than 31 days.' });
  }
  if ((value.location_type === 'in_person' || value.location_type === 'hybrid') && !value.venue_name) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['venue_name'], message: 'Enter the venue name.' });
  }
  if ((value.location_type === 'online' || value.location_type === 'hybrid') && !value.online_url) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['online_url'], message: 'Enter the online event link.' });
  }
  if (!value.registration_url && !value.online_url) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['registration_url'], message: 'Add a registration or online event link.' });
  }
});
const eventSubmissionListQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
}).strict();
const eventSubmissionApproveSchema = z.object({ publish: z.boolean() }).strict();
const eventSubmissionRejectionCategorySchema = z.enum([
  'calendar_fit',
  'insufficient_information',
  'duplicate',
  'event_passed',
  'other',
]);
const eventSubmissionRejectSchema = z.object({
  category: eventSubmissionRejectionCategorySchema,
  organizer_message: z.string().trim().max(1200).optional().default(''),
  internal_note: z.string().trim().max(1000).optional().default(''),
}).strict();
const eventSubmissionEmailKindSchema = z.enum(['receipt', 'approved', 'rejected']);
const eventScheduleItemSchema = z.object({
  time: z.string().trim().min(1).max(40),
  title: z.string().trim().min(1).max(200),
  type: z.enum([
    'networking',
    'talk',
    'product_demo',
    'panel',
    'workshop',
    'system_design',
    'open_discussion',
    'break',
  ]),
  lead: z.string().trim().max(120).nullable(),
  description: z.string().trim().max(2000).nullable().optional(),
  system_design_title: z.string().trim().max(200).nullable().optional(),
  resources: z.array(z.object({
    title: z.string().trim().min(1).max(120),
    url: httpUrlSchema,
  }).strict()).max(20),
  shared_links: z.array(httpUrlSchema).max(20).optional(),
}).strict();
const eventUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(10_000).nullable().optional(),
  event_date: eventDateSchema.optional(),
  end_date: eventDateSchema.nullable().optional(),
  series_type: z.enum(['monthly', 'quarterly', 'special']).nullable().optional(),
  status: z.enum(['draft', 'cfp_open', 'cfp_closed', 'upcoming', 'live', 'completed']).optional(),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80).nullable().optional(),
  cover: websiteUrlSchema.nullable().optional(),
  location: z.object({
    label: z.string().trim().max(120).optional(),
    name: z.string().trim().min(1).max(200),
    url: z.string().trim().max(2048).nullable(),
  }).strict().optional(),
  stream_url: httpUrlSchema.nullable().optional(),
  embed_stream: z.boolean().optional(),
  registration_url: websiteUrlSchema.nullable().optional(),
  schedule: z.array(eventScheduleItemSchema).max(100).optional(),
  photos: z.array(z.object({
    url: websiteUrlSchema,
    type: z.enum(['image', 'folder']),
  }).strict()).max(100).optional(),
  videos: z.array(z.object({
    title: z.string().trim().min(1).max(200),
    embed_url: httpUrlSchema,
  }).strict()).max(50).optional(),
  publish_to_website: z.boolean().optional(),
  external_source: z.string().trim().max(100).nullable().optional(),
  external_id: z.string().trim().max(255).nullable().optional(),
  external_url: httpUrlSchema.nullable().optional(),
  external_synced_at: z.string().datetime().nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'Add at least one field to update.');
const systemDesignDraftRequestSchema = z.object({
  prompt_url: z.string().trim().url(),
  title: z.string().trim().optional(),
  lead: z.string().trim().optional(),
});
const addOrganizerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  display_name: z.string().trim().min(1).max(120),
  role: z.enum(['owner', 'organizer', 'volunteer']).default('organizer'),
});
const updateOrganizerRoleSchema = z.object({
  role: z.enum(['organizer', 'volunteer']),
}).strict();
const adminTokenExchangeSchema = z.object({
  access_token: z.string().trim().min(20).max(8192),
}).strict();
const auditLogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(60),
  actor: z.string().trim().optional(),
  action: z.string().trim().optional(),
  target_type: z.string().trim().optional(),
});
const archiveItemKindSchema = z.enum(['talk', 'product_demo']);
const adminCreateTalkSchema = z.object({
  kind: archiveItemKindSchema.optional().default('talk'),
  speaker_name: z.string().trim().min(1, 'Presenter name is required').max(120),
  speaker_email: z.string().trim().toLowerCase().email('Presenter email must be valid').max(254),
  github_username: z.string().trim().max(100).optional().default(''),
  title: z.string().trim().min(1, 'Archive item title is required').max(200),
  topic: z.string().trim().max(120).optional().default('General'),
  abstract: z.string().trim().max(4000).optional().default(''),
  bio: z.string().trim().max(2000).optional().default(''),
  slides_url: z.string().trim().max(2048).optional().default(''),
  publish: z.boolean().optional().default(false),
}).strict();
const CFP_ABSTRACT_WORD_LIMIT = 120;
const CFP_BIO_WORD_LIMIT = 80;
function normalizeArchiveItemKind(value: unknown): ArchiveItemKind {
  return value === 'product_demo' ? 'product_demo' : 'talk';
}
function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}
function canOpenCfpForEvent(event: Pick<Event, 'name' | 'series_type' | 'event_date'>, nowMs = Date.now()): boolean {
  if (resolveEventSeriesType(event) !== 'monthly') return false;

  const eventDateMs = new Date(event.event_date).getTime();
  return Number.isFinite(eventDateMs) && eventDateMs > nowMs;
}
const speakerSubmissionCreateSchema = adminCreateTalkSchema
  .omit({ slides_url: true, publish: true })
  .extend({
    event_id: z.string().trim().min(1, 'Event is required'),
    topic: z.string().trim().min(1, 'Topic is required'),
    abstract: z.string().trim().min(1, 'Presentation summary is required')
      .refine((value) => countWords(value) <= CFP_ABSTRACT_WORD_LIMIT, `Presentation summary must be ${CFP_ABSTRACT_WORD_LIMIT} words or fewer`),
    bio: z.string().trim().min(1, 'Presenter bio is required')
      .refine((value) => countWords(value) <= CFP_BIO_WORD_LIMIT, `Presenter bio must be ${CFP_BIO_WORD_LIMIT} words or fewer`),
    turnstile_action: z.string().trim().max(80).optional(),
    turnstile_token: z.string().trim().max(4096).optional(),
  })
  .strict();
const speakerSubmissionDecisionSchema = z.object({
  status: z.enum(['selected', 'not_selected']),
  internal_note: z.string().trim().max(1000).optional().default(''),
  expires_in_days: z.coerce.number().int().min(1).max(31).optional().default(7),
});
const speakerTalkIntakeSchema = adminCreateTalkSchema.omit({ publish: true });
const selectedSpeakerSlidesSchema = z.object({
  slides_url: z.string().trim().min(1, 'Resource URL is required').max(2048)
    .refine((value) => Boolean(safeHttpUrl(value)), 'Resource URL must use http or https'),
});
const speakerIntakeLinkRequestSchema = z.object({
  kind: archiveItemKindSchema.optional().default('talk'),
  speaker_name: z.string().trim().min(1, 'Presenter name is required').max(120),
  speaker_email: z.string().trim().toLowerCase().email('Presenter email must be valid'),
  title: z.string().trim().min(1, 'Archive item title is required').max(200),
  expires_in_days: z.coerce.number().int().min(1).max(31).default(7),
}).strict();
const speakerIntakeEmailRecipientSchema = z.object({
  program_item_index: z.number().int().min(0),
  speaker_email: z.string().trim().toLowerCase().email('Presenter email must be valid').max(254),
}).strict();
const speakerIntakeEmailBatchSchema = z.object({
  recipients: z.array(speakerIntakeEmailRecipientSchema).min(1).max(100)
    .refine(
      (recipients) => new Set(recipients.map(({ program_item_index }) => program_item_index)).size === recipients.length,
      'Select each program item once',
    ),
  expires_in_days: z.coerce.number().int().min(1).max(31).default(7),
}).strict();
// The invitation decides whether this is a talk or product demo and locks its
// title. The public one-time form may provide the remaining archive content.
const speakerBackfillDetailsSchema = speakerTalkIntakeSchema.omit({
  kind: true,
  speaker_name: true,
  speaker_email: true,
  title: true,
}).extend({
  // Accepted only for compatibility with previously cached forms. These
  // invitation-locked values are stripped by the transform below.
  kind: archiveItemKindSchema.optional(),
  speaker_name: z.string().trim().max(120).optional(),
  speaker_email: z.string().trim().toLowerCase().email().max(254).optional(),
  title: z.string().trim().max(200).optional(),
  abstract: z.string().trim()
    .max(
      SPEAKER_ARCHIVE_ABSTRACT_MAX_CHARACTERS,
      `Presentation summary must be ${SPEAKER_ARCHIVE_ABSTRACT_MAX_CHARACTERS} characters or fewer`,
    )
    .optional()
    .default(''),
  bio: z.string().trim()
    .max(
      SPEAKER_ARCHIVE_BIO_MAX_CHARACTERS,
      `Presenter bio must be ${SPEAKER_ARCHIVE_BIO_MAX_CHARACTERS} characters or fewer`,
    )
    .optional()
    .default(''),
  slides_url: z.string().trim().max(2048)
    .refine((value) => !value || Boolean(safeHttpUrl(value)), 'Resource URL must use http or https')
    .optional()
    .default(''),
}).transform(({ kind: _kind, speaker_name: _speakerName, speaker_email: _speakerEmail, title: _title, ...details }) => details);
const volunteerApplicationSchema = z.object({
  name: z.string().trim().min(1, 'Please enter your name.').max(120),
  email: z.string().trim().toLowerCase().email('Please enter a valid email address.').max(254),
  x_handle: z.string().trim().min(1, 'Please enter your X handle.').max(100),
  slack_name: z.string().trim().min(1, 'Please enter your Slack name.').max(120),
  turnstile_action: z.string().trim().max(80).optional(),
  turnstile_token: z.string().trim().max(4096).optional(),
}).strict();
const routeFeedbackSubmissionSchema = z.object({
  tester_id: z.string().uuid().nullable().optional(),
  tester_name: z.string().trim().max(120).optional().default(''),
  type: z.enum(['bug', 'confusing', 'suggestion']),
  message: z.string().trim().min(1, 'Feedback message is required').max(4000, 'Feedback message is too long'),
  page_path: z.string().trim().max(2048).nullable().optional(),
  viewport_width: z.coerce.number().int().min(1).max(20000).nullable().optional(),
  viewport_height: z.coerce.number().int().min(1).max(20000).nullable().optional(),
  turnstile_action: z.string().trim().max(80).optional(),
  turnstile_token: z.string().trim().max(4096).optional(),
}).strict();
const eventFeedbackSubmissionSchema = z.object({
  response_token: z.string().trim().min(EVENT_FEEDBACK_TOKEN_MIN_CHARS).max(EVENT_FEEDBACK_TOKEN_MAX_CHARS),
  answers: z.array(z.object({
    question_id: z.string().trim().min(1).max(100),
    value: z.union([z.string().max(EVENT_FEEDBACK_COMMENT_MAX_CHARS), z.number(), z.boolean(), z.null()]),
  }).strict()).max(100),
  turnstile_action: z.string().trim().max(80).optional(),
  turnstile_token: z.string().trim().max(4096).optional(),
}).strict();
const annualConferenceTaskCreateSchema = z.object({
  title: z.string().trim().min(1, 'Task title is required.').max(160),
  details: z.string().trim().max(2000).nullable().optional(),
  internal_note: z.string().trim().max(2000).nullable().optional(),
  phase_id: z.string().uuid().nullable().optional(),
  workstream: z.enum(ANNUAL_CONFERENCE_WORKSTREAMS),
  accountable_owner: z.string().trim().min(1, 'An accountable owner is required.').max(120),
  collaborators: z.array(z.string().trim().min(1).max(120)).max(20).optional().default([]),
  priority: z.enum(ANNUAL_CONFERENCE_TASK_PRIORITIES).nullable().optional(),
  target_date: z.string().date().nullable().optional(),
  status: z.enum(ANNUAL_CONFERENCE_TASK_STATUSES).optional().default('not_started'),
  dependency_note: z.string().trim().max(2000).nullable().optional(),
}).strict();
const annualConferenceTaskUpdateSchema = z.object({
  title: z.string().trim().min(1, 'Task title is required.').max(160).optional(),
  details: z.string().trim().max(2000).nullable().optional(),
  internal_note: z.string().trim().max(2000).nullable().optional(),
  phase_id: z.string().uuid().nullable().optional(),
  workstream: z.enum(ANNUAL_CONFERENCE_WORKSTREAMS).optional(),
  accountable_owner: z.string().trim().min(1).max(120).nullable().optional(),
  collaborators: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  priority: z.enum(ANNUAL_CONFERENCE_TASK_PRIORITIES).nullable().optional(),
  target_date: z.string().date().nullable().optional(),
  status: z.enum(ANNUAL_CONFERENCE_TASK_STATUSES).optional(),
  dependency_note: z.string().trim().max(2000).nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'Provide at least one task change.',
});
const annualConferenceEditionCreateSchema = z.object({
  year: z.number().int().min(2000).max(2200),
  name: z.string().trim().min(1).max(160),
  label: z.string().trim().min(1).max(120),
  provisional_date: z.string().date(),
  task_creator_email: z.string().trim().toLowerCase().email().nullable().optional(),
}).strict();
const annualConferencePhaseCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  starts_on: z.string().date(),
  ends_on: z.string().date(),
}).strict();
const annualConferencePhaseUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  starts_on: z.string().date().optional(),
  ends_on: z.string().date().optional(),
  sort_order: z.number().int().min(0).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'Provide at least one phase change.',
});
const annualConferencePhaseOrderSchema = z.object({
  phase_ids: z.array(z.string().uuid()).min(1).max(100),
}).strict();
const quizJoinSchema = z.object({
  join_code: z.string().trim().toUpperCase().regex(/^[A-HJ-NP-Z2-9]{6}$/),
  device_id: z.string().uuid(),
  nickname: z.string().trim().max(24).optional().default(''),
  purpose: z.enum(['quiz', 'system_design_learning']).optional(),
}).strict();
const quizAnswerSchema = z.object({
  session_id: z.string().uuid(),
  user_id: z.string().uuid(),
  device_id: z.string().uuid(),
  answer_index: z.number().int().min(0).max(3),
}).strict();
const quizSessionUpdateSchema = z.object({
  status: z.enum(['draft', 'waiting', 'active', 'finished']).optional(),
  current_question_index: z.number().int().min(-1).max(500).optional(),
  question_phase: z.enum(['answering', 'revealing', 'scoreboard']).nullable().optional(),
  started_at: z.string().datetime().nullable().optional(),
  finished_at: z.string().datetime().nullable().optional(),
  question_started_at: z.string().datetime().nullable().optional(),
  phase_started_at: z.string().datetime().nullable().optional(),
  expires_at: z.string().datetime().nullable().optional(),
  released_question_ids: z.array(z.string().uuid()).max(500).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'Provide at least one session change.');
const quizParticipantNameSchema = z.object({
  device_id: z.string().uuid(),
  nickname: z.string(),
}).strict();
const quizStateQuerySchema = z.object({
  sessionId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  presenter: z.enum(['true', 'false']).optional(),
}).strict();
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
  // requireAdmin already resolved (and cached) the session for this request;
  // re-fetching it here used to cost an extra Supabase round trip per mutation.
  const session = c.get('adminSession') ?? await getAdminSession(c);
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

function internalErrorResponse(c: Context, event: string, error: unknown, publicMessage: string) {
  console.error(JSON.stringify({
    event,
    request_id: c.get('requestId') ?? null,
    method: c.req.method,
    path: securitySafeRequestPath(c.req.path),
    error_name: safeErrorName(error),
  }));
  return c.json({ error: publicMessage }, 500);
}

async function quizDeviceOwnsUser(userId: string, deviceId: string): Promise<boolean> {
  const user = await getUserById(userId);
  return Boolean(user && user.device_id === deviceId && !user.merged_into_user_id);
}

function corsOrigin(origin: string | undefined, c: Context): string | undefined {
  if (!origin) return undefined;

  const allowedOrigins = configuredFrontendOrigins(c);
  const localDevelopmentOrigin = envValue('NODE_ENV', c) === 'development'
    && origin.startsWith('http://localhost:');
  if (allowedOrigins.has(origin) || localDevelopmentOrigin) {
    return origin;
  }

  return undefined;
}

function publicClientKey(c: Context): string {
  return c.req.header('cf-connecting-ip')
    ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    ?? `unknown:${c.req.header('user-agent') ?? 'unknown'}`;
}

function publicClientIp(c: Context): string | undefined {
  const value = c.req.header('cf-connecting-ip')
    ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
  return value && value !== 'unknown' ? value : undefined;
}

function publicRateLimitError(
  c: Context,
  result: Extract<PublicRateLimitResult, { allowed: false }>,
  message: string,
): globalThis.Response {
  c.header('Retry-After', String(result.retryAfterSeconds));

  if (result.unavailable) {
    return c.json({
      error: 'This form is temporarily unavailable. Please try again shortly.',
      retry_after_seconds: result.retryAfterSeconds,
    }, 503);
  }

  console.warn(JSON.stringify({
    event: 'public_rate_limit_exceeded',
    action: securitySafeRequestPath(c.req.path),
    request_id: c.get('requestId') ?? null,
  }));
  return c.json({
    error: message,
    retry_after_seconds: result.retryAfterSeconds,
  }, 429);
}

async function enforcePublicRateLimit(
  c: Context,
  input: {
    action: string;
    clientKey: string;
    maxAttempts: number;
    windowSeconds: number;
  },
  message: string,
): Promise<globalThis.Response | null> {
  const result = await consumePublicRateLimit(c, input);
  return result.allowed ? null : publicRateLimitError(c, result, message);
}

async function requirePublicTurnstile(
  c: Context,
  input: {
    token?: string | null;
    submittedAction?: string | null;
    expectedAction: string;
    expectedHostname?: string | string[];
  },
): Promise<globalThis.Response | null> {
  const token = input.token?.trim() ?? '';
  const submittedAction = input.submittedAction?.trim() ?? '';
  const secretKey = envValue('TURNSTILE_SECRET_KEY', c)?.trim();

  if (submittedAction && submittedAction !== input.expectedAction) {
    return c.json({ error: 'Human verification did not match this form. Please try again.' }, 400);
  }

  if (!secretKey) {
    if (envValue('NODE_ENV', c) === 'production' || token || submittedAction) {
      console.error(JSON.stringify({
        event: 'turnstile_configuration_missing',
        action: input.expectedAction,
        request_id: c.get('requestId') ?? null,
      }));
      return c.json({ error: 'Human verification is temporarily unavailable. Please try again later.' }, 503);
    }

    // Local and test environments may omit Turnstile entirely.
    return null;
  }

  const result = await validateTurnstileToken({
    token,
    secretKey,
    remoteIp: publicClientIp(c),
    expectedAction: input.expectedAction,
    expectedHostname: input.expectedHostname ?? envValue('TURNSTILE_EXPECTED_HOSTNAME', c),
  });
  return result.ok ? null : c.json({ error: result.error }, result.status);
}

function eventSubmissionTurnstileHostnames(c: Context): string[] {
  return (envValue('EVENT_SUBMISSION_TURNSTILE_EXPECTED_HOSTNAMES', c) ?? '')
    .split(',')
    .map((hostname) => hostname.trim().toLowerCase())
    .filter(Boolean);
}

function isPublicFeedbackEventRequest(path: string, method: string): boolean {
  return (method === 'GET' && /^\/api\/feedback\/events\/[^/]+$/.test(path))
    || (method === 'POST' && /^\/api\/feedback\/events\/[^/]+\/submissions$/.test(path));
}

function isPublicCfpEventRequest(path: string, method: string): boolean {
  return method === 'GET' && /^\/api\/cfp\/events\/[^/]+$/.test(path);
}

function isSpeakerTalkIntakeRequest(path: string, method: string): boolean {
  return (method === 'GET' || method === 'POST') && /^\/api\/events\/[^/]+\/speaker-intake\/[^/]+$/.test(path);
}

function isPublicEventRegistrationRequest(path: string, method: string): boolean {
  const eventRegistrationPath = /^\/api\/registration\/events\/[^/]+$/;
  return (method === 'GET' && (
    eventRegistrationPath.test(path)
    || /^\/api\/registration\/events\/[^/]+\/calendar\.ics$/.test(path)
  ))
    || (method === 'POST' && eventRegistrationPath.test(path));
}

function isUnauthenticatedApiRequest(path: string, method: string): boolean {
  return (method === 'GET' && (
    path === '/api/public/meetups'
    || path.startsWith('/api/public/meetups/')
    || path === '/api/public/events'
    || path === '/api/public/archive'
    || path.startsWith('/api/public/archive/')
    || path === '/api/public/home'
    || path === '/api/health'
    || path === '/api/health/supabase'
    || path === '/api/auth/session'
    || path === '/api/auth/admin/callback'
    ))
    || (method === 'POST' && (
      path === '/api/public/event-submissions'
      || path === '/api/cfp'
      || path === '/api/feedback'
      || path === '/api/auth/admin/exchange'
      || path === '/api/volunteer-applications'
    ))
    || isPublicFeedbackEventRequest(path, method)
    || isPublicCfpEventRequest(path, method)
    || isSpeakerTalkIntakeRequest(path, method)
    || isPublicEventRegistrationRequest(path, method)
    || (method === 'GET' && /^\/api\/quiz\/state$/.test(path))
    || (method === 'POST' && (path === '/api/quiz/join' || path === '/api/quiz/answer'))
    || (method === 'PATCH' && /^\/api\/quiz\/participants\/[^/]+\/name$/.test(path));
}

function isLogoutPath(path: string): boolean {
  return path === '/api/auth/logout';
}

app.use('/api/public/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
  maxAge: 86400,
}));

const credentialedApiCors = cors({
  origin: corsOrigin,
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
  credentials: true,
  maxAge: 86400,
});

app.use('/api/*', async (c, next) => {
  if (c.req.path.startsWith('/api/public/')) {
    await next();
    return;
  }

  return credentialedApiCors(c, next);
});

app.use('/api/*', async (c, next) => {
  if (c.req.method === 'OPTIONS' || isUnauthenticatedApiRequest(c.req.path, c.req.method)) {
    await next();
    return;
  }

  const adminError = await requireAdmin(c, adminRolesForApiRequest(c.req.path, c.req.method));
  if (adminError && !(isLogoutPath(c.req.path) && adminError.status === 401)) return adminError;
  await next();
});

async function getAllEvents(c?: Context): Promise<Event[]> {
  const events = (await getSupabaseCommunityEvents(c)) ?? await getAllMockEvents();
  return events.map(canonicalizeEventSchedule);
}

async function getEventById(id: string, c?: Context): Promise<Event | undefined> {
  const event = await getSupabaseCommunityEventById(id, c);
  if (event !== null) return event ? canonicalizeEventSchedule(event) : event;
  const fallback = await getMockEventById(id);
  return fallback ? canonicalizeEventSchedule(fallback) : fallback;
}

async function getEventByRegistrationKey(key: string, c?: Context): Promise<Event | undefined> {
  const event = await getSupabaseCommunityEventBySlug(key, c);
  if (event !== null) {
    if (event) return canonicalizeEventSchedule(event);
    return getEventById(key, c);
  }

  const fallback = (await getAllMockEvents()).find((candidate) => candidate.slug === key);
  return fallback ? canonicalizeEventSchedule(fallback) : getEventById(key, c);
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
  const markedData = {
    ...data,
    name: markTestEventTitle(data.name, eventTestModeEnabled(envValue('EVENT_TEST_MODE', c))),
  };
  const event = await createSupabaseCommunityEvent(markedData, c);
  if (event) return canonicalizeEventSchedule(event);
  return canonicalizeEventSchedule(await createMockEvent({
    name: markedData.name,
    description: markedData.description,
    event_date: markedData.event_date,
    series_type: markedData.series_type,
    end_date: markedData.end_date ?? undefined,
    slug: markedData.slug ?? undefined,
    cover: markedData.cover ?? undefined,
    location: markedData.location ?? undefined,
    registration_url: markedData.registration_url ?? null,
    stream_url: markedData.stream_url ?? null,
    embed_stream: markedData.embed_stream ?? false,
    photos: markedData.photos ?? [],
    publish_to_website: markedData.publish_to_website ?? false,
  }));
}

async function updateEvent(id: string, updates: Partial<Omit<Event, 'id' | 'created_at'>>, c?: Context): Promise<Event> {
  const event = await updateSupabaseCommunityEvent(id, updates, c);
  if (event !== null && event !== undefined) return canonicalizeEventSchedule(event);
  return canonicalizeEventSchedule(await updateMockEvent(id, updates));
}

async function deleteEvent(id: string, c?: Context): Promise<void> {
  const deleted = await deleteSupabaseCommunityEvent(id, c);
  if (deleted !== null) return;
  await deleteMockEvent(id);
}

async function getFeedbackCampaignByEventStore(eventId: string, c?: Context): Promise<FeedbackCampaign | undefined> {
  const campaign = await getSupabaseFeedbackCampaignByEvent(eventId, c);
  if (campaign !== null) return campaign;
  return getFeedbackCampaignByEvent(eventId);
}

async function getOrCreateFeedbackCampaignStore(eventId: string, c?: Context): Promise<FeedbackCampaign> {
  const existing = await getSupabaseFeedbackCampaignByEvent(eventId, c);
  if (existing !== null) {
    if (existing) return existing;
    const campaign = createDefaultFeedbackCampaign(eventId);
    const created = await createSupabaseFeedbackCampaign(campaign, c);
    if (created) return created;
  }

  return getOrCreateFeedbackCampaign(eventId);
}

async function updateFeedbackCampaignStore(
  eventId: string,
  updates: Partial<Omit<FeedbackCampaign, 'id' | 'event_id' | 'created_at'>>,
  c?: Context,
): Promise<FeedbackCampaign> {
  let campaign = await updateSupabaseFeedbackCampaign(eventId, updates, c);
  if (campaign !== null) {
    if (campaign) return campaign;
    const created = await createSupabaseFeedbackCampaign(createDefaultFeedbackCampaign(eventId), c);
    if (created) {
      campaign = await updateSupabaseFeedbackCampaign(eventId, updates, c);
      if (campaign) return campaign;
    }
  }

  return updateFeedbackCampaign(eventId, updates);
}

async function deleteFeedbackCampaignByEventStore(eventId: string, c?: Context): Promise<FeedbackCampaign | null> {
  const campaign = await deleteSupabaseFeedbackCampaignByEvent(eventId, c);
  if (campaign !== null && campaign !== undefined) return campaign;
  return deleteFeedbackCampaignByEvent(eventId);
}

async function getFeedbackSubmissionsByEventStore(eventId: string, c?: Context): Promise<EventFeedbackSubmission[]> {
  const submissions = await getSupabaseFeedbackSubmissionsByEvent(eventId, c);
  if (submissions !== null) return submissions;
  return getFeedbackSubmissionsByEvent(eventId);
}

async function createEventFeedbackSubmissionStore(
  data: Omit<EventFeedbackSubmission, 'id' | 'created_at'>,
  c?: Context,
): Promise<EventFeedbackSubmission> {
  const submission = await createSupabaseEventFeedbackSubmission(data, c);
  if (submission) return submission;
  return createEventFeedbackSubmission(data);
}

async function getActiveOrganizerEmails(c: Context): Promise<string[] | null> {
  try {
    const { data, error } = await getSupabaseAdminClient(c)
      .from('admin_memberships')
      .select('email')
      .eq('status', 'active');

    if (error) return null;
    return (data ?? []).map((membership) => membership.email);
  } catch {
    return null;
  }
}

async function annualConferenceServiceForRequest(c: Context) {
  const session = c.get('adminSession') ?? await getAdminSession(c);
  if (!session.authenticated) {
    throw new AnnualConferenceServiceError('forbidden', 'Conference access required.');
  }

  return createAnnualConferenceService({
    repository: createAnnualConferenceRepository(c),
    actor: { email: session.email, role: session.role },
    activeOrganizerEmails: () => getActiveOrganizerEmails(c),
    audit: (event) => auditAdminAction(c, {
      action: event.action,
      targetType: event.targetType,
      targetId: event.targetId,
      metadata: event.metadata,
    }),
  });
}

function annualConferenceServiceErrorResponse(c: Context, error: unknown) {
  if (error instanceof AnnualConferenceServiceError) {
    return c.json({ error: error.message }, annualConferenceErrorStatus(error));
  }
  throw error;
}

function canonicalizeEventSchedule(event: Event): Event {
  const normalizedEvent = withResolvedEventStatus(event);

  if (!normalizedEvent.schedule || normalizedEvent.schedule.length === 0) {
    return normalizedEvent;
  }

  return {
    ...normalizedEvent,
    schedule: canonicalizeSystemDesignSchedule(normalizedEvent.schedule),
  };
}

function setPublicApiCache(c: Context) {
  c.header('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400');
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
  const status = resolveEventStatus(event);
  if (status === 'live') return 'live';
  if (status === 'completed') return 'past';
  return 'upcoming';
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
  return safeHttpUrl(value);
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
    const url = safeWebsiteUrl(typeof candidate.url === 'string' ? candidate.url : null);

    if (!url) {
      return [];
    }

    return [{
      url,
      type: candidate.type === 'folder' ? 'folder' : 'image',
    }];
  });
}

function normalizePublicSchedule(value: Event['schedule']): PublicMeetupScheduleItem[] {
  return canonicalizeSystemDesignSchedule(value ?? []).map((item) => ({
    ...item,
    resources: item.resources.flatMap((resource) => {
      const url = safeHttpUrl(resource.url);
      return url ? [{ ...resource, url }] : [];
    }),
    shared_links: item.shared_links?.flatMap((link) => {
      const url = safeHttpUrl(link);
      return url ? [url] : [];
    }) ?? [],
  }));
}

function normalizeEventVideos(value: unknown): NonNullable<Event['videos']> {
  if (!Array.isArray(value)) return [];

  return value.flatMap((video) => {
    if (!video || typeof video !== 'object') return [];
    const candidate = video as { title?: unknown; embed_url?: unknown };
    const embedUrl = safeHttpUrl(typeof candidate.embed_url === 'string' ? candidate.embed_url : null);
    if (!embedUrl) return [];

    return [{
      title: typeof candidate.title === 'string' && candidate.title.trim()
        ? candidate.title.trim()
        : 'Recording',
      embed_url: embedUrl,
    }];
  });
}

function scheduleForTalks(talks: Talk[]): PublicMeetupScheduleItem[] {
  const publishedTalks = talks.filter((talk) => talk.status === 'published');
  const talkItems = publishedTalks.map((talk, index) => ({
    time: `${7 + index}:00 PM`,
    title: talk.title,
    type: normalizeArchiveItemKind(talk.kind) === 'product_demo' ? 'product_demo' as const : 'talk' as const,
    lead: talk.speaker_name,
    resources: validExternalUrl(talk.slides_url)
      ? [{
        title: normalizeArchiveItemKind(talk.kind) === 'product_demo' ? 'Demo resource' : 'Slides',
        url: talk.slides_url as string,
      }]
      : [],
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
  const schedule = normalizePublicSchedule(event.schedule ?? scheduleForTalks(eventTalks));

  const cfpUrl = event.status === 'cfp_open'
    ? absoluteAppUrl(origin, `/cfp/${event.id}`)
    : null;

  return {
    id: event.id,
    slug: eventSlug(event),
    name: event.name,
    series_type: resolveEventSeriesType(event),
    status: publicMeetupStatus(event),
    start: toWebsiteDateTime(event.event_date),
    end: endDate,
    description: event.description ?? '',
    cover: safeWebsiteUrl(coverForEvent(event)) ?? PUBLIC_MEETUP_COVERS[0],
    location: {
      ...location,
      url: safeHttpUrl(location.url),
    },
    stream_url: safeHttpUrl(event.stream_url),
    embed_stream: event.embed_stream ?? false,
    registration_url: safeWebsiteUrl(registrationUrl),
    speakers: speakersForTalks(eventTalks, origin),
    schedule,
    photos,
    videos: normalizeEventVideos(event.videos),
    talks_count: eventTalks.length,
    published_talks_count: publishedTalks.length,
    cfp_url: cfpUrl,
    archive_url: absoluteAppUrl(origin, `/archive/${event.id}`),
    updated_at: toWebsiteDateTime(event.updated_at),
  };
}

function isPublicArchiveEvent(event: Event): boolean {
  return Boolean(event.publish_to_website) && resolveEventStatus(event) === 'completed';
}

function toPublicArchiveEvent(event: Event): PublicArchiveEvent {
  return {
    id: event.id,
    name: event.name,
    description: event.description,
    event_date: event.event_date,
    series_type: resolveEventSeriesType(event),
    cover: safeWebsiteUrl(coverForEvent(event)) ?? PUBLIC_MEETUP_COVERS[0],
    schedule: normalizePublicSchedule(event.schedule),
    photos: normalizeEventPhotos(event.photos),
  };
}

function publicSlidesUrl(talk: Talk): string | null {
  if (talk.slides_type === 'file' && talk.storage_path) {
    return talk.storage_path;
  }
  if (talk.slides_type === 'url' && validExternalUrl(talk.slides_url)) {
    return talk.slides_url;
  }
  return null;
}

function toPublicArchiveTalk(talk: Talk, event: Pick<Event, 'name'>): PublicArchiveTalk {
  return {
    id: talk.id,
    event_id: talk.event_id,
    event_name: event.name,
    kind: normalizeArchiveItemKind(talk.kind),
    title: talk.title,
    speaker_name: talk.speaker_name,
    topic: talk.topic,
    abstract: talk.abstract,
    bio: talk.bio,
    slides_url: publicSlidesUrl(talk),
    updated_at: talk.updated_at,
  };
}

async function publicArchivePayload(c: Context) {
  const [events, talks] = await Promise.all([getAllEvents(c), getAllTalks()]);
  const archiveEvents = events
    .filter(isPublicArchiveEvent)
    .sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime());
  const eventById = new Map(archiveEvents.map((event) => [event.id, event]));
  const archiveItems = talks
    .filter((talk) => talk.status === 'published')
    .flatMap((talk) => {
      const event = eventById.get(talk.event_id);
      return event ? [toPublicArchiveTalk(talk, event)] : [];
    })
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  return {
    events: archiveEvents.map(toPublicArchiveEvent),
    talks: archiveItems,
    archive_items: archiveItems,
  };
}

async function publicArchiveEventPayload(eventId: string, c: Context): Promise<PublicArchiveEventResponse | null> {
  const event = await getEventById(eventId, c);
  if (!event || !isPublicArchiveEvent(event)) {
    return null;
  }

  const [talks, campaign] = await Promise.all([
    getTalksByEvent(eventId),
    getFeedbackCampaignByEventStore(eventId, c),
  ]);
  const feedbackWindow = campaign ? feedbackCampaignWindow(event, campaign) : null;
  const available = campaign ? isFeedbackCampaignOpen(event, campaign) : false;

  const archiveItems = talks
    .filter((talk) => talk.status === 'published')
    .map((talk) => toPublicArchiveTalk(talk, event))
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  return {
    event: toPublicArchiveEvent(event),
    talks: archiveItems,
    archive_items: archiveItems,
    feedback: {
      available,
      closes_at: feedbackWindow?.closes_at ?? null,
      public_url: available ? `${publicAppOrigin(c)}/feedback/${eventId}` : null,
    },
  };
}

async function publicHomePayload(c: Context): Promise<PublicHomeResponse> {
  const [events, talks] = await Promise.all([getAllEvents(c), getAllTalks()]);
  const publicEvents = events.filter((event) => Boolean(event.publish_to_website));
  const archiveEvents = publicEvents.filter(isPublicArchiveEvent);
  const eventById = new Map(publicEvents.map((event) => [event.id, event]));
  const recentTalks = talks
    .filter((talk) => talk.status === 'published')
    .flatMap((talk) => {
      const event = eventById.get(talk.event_id);
      return event ? [toPublicArchiveTalk(talk, event)] : [];
    })
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 4);
  const cfpEvent = publicEvents.find((event) => event.status === 'cfp_open') ?? null;

  return {
    completed_events_count: archiveEvents.length,
    published_talks_count: talks.filter((talk) => talk.status === 'published' && eventById.has(talk.event_id)).length,
    recent_talks: recentTalks,
    // Attendance records contain personal data and are intentionally excluded
    // from every public contract. Keep the field empty for additive consumer
    // compatibility while the public website removes the old leaderboard UI.
    regulars: [],
    cfp_event: cfpEvent ? { id: cfpEvent.id, name: cfpEvent.name } : null,
  };
}

async function buildPublicMeetups(origin: string, c?: Context) {
  const [events, talks] = await Promise.all([getAllEvents(c), getAllTalks()]);
  return events
    .filter((event) => event.ownership !== 'external' && (event.publish_to_website ?? event.status !== 'draft'))
    .map((event) => toPublicMeetup(event, talks.filter((talk) => talk.event_id === event.id), origin))
    .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());
}

async function buildPublicEvents(c?: Context): Promise<PublicEvent[]> {
  return (await getAllEvents(c))
    .filter((event) => (
      event.publication_status === 'published'
      || (event.publication_status === undefined && event.publish_to_website === true)
    ))
    .filter((event) => event.ownership !== 'external' || event.moderation_status === 'approved')
    .map((event) => ({
      id: event.id,
      slug: event.slug ?? event.id,
      title: event.name,
      summary: event.description ?? '',
      ownership: event.ownership ?? 'devcongress',
      series: event.series_type ?? null,
      format: event.format ?? 'meetup',
      source: event.submission_source ?? 'internal',
      moderation_status: event.moderation_status ?? null,
      publication_status: event.publication_status ?? 'published',
      classification: event.ownership === 'external' ? 'community' as const : 'official' as const,
      starts_at: event.event_date,
      ends_at: event.end_date ?? event.event_date,
      timezone: event.timezone ?? 'Africa/Accra',
      location_type: event.location_type ?? (event.stream_url ? 'online' : 'in_person'),
      venue_name: event.location?.name ?? null,
      venue_address: event.venue_address ?? event.location?.label ?? null,
      online_url: safeHttpUrl(event.online_url ?? event.stream_url),
      registration_url: safeWebsiteUrl(event.registration_url),
      organizer_name: event.organizer_name ?? 'DevCongress',
      organizer_website: safeHttpUrl(event.organizer_url),
      cover_url: safeWebsiteUrl(event.cover),
      updated_at: event.updated_at,
    }))
    .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime());
}

async function publicMeetupsForApi(c: Context): Promise<PublicMeetup[]> {
  return (await getSupabasePublicMeetups(publicAppOrigin(c), c)) ?? await buildPublicMeetups(publicAppOrigin(c), c);
}

function isLocalRequestOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

function publicAppOrigin(c: Context): string {
  const requestOrigin = new URL(c.req.url).origin;
  if (envValue('NODE_ENV', c) !== 'production' && isLocalRequestOrigin(requestOrigin)) {
    return requestOrigin;
  }

  return envValue('PUBLIC_APP_URL', c) ?? envValue('PUBLIC_FRONTEND_ORIGIN', c) ?? requestOrigin;
}

function publicRegistrationUrl(event: Event, c: Context): string {
  const key = event.slug?.trim() || event.id;
  return new URL(`/r/${encodeURIComponent(key)}`, publicAppOrigin(c)).toString();
}

function publicEventDetailsUrl(event: Event, c: Context): string {
  const url = new URL(publicRegistrationUrl(event, c));
  url.searchParams.set('view', 'details');
  return url.toString();
}

function publicRegistrationCalendarUrl(event: Event, c: Context): string {
  const key = event.slug?.trim() || event.id;
  return new URL(
    `/api/registration/events/${encodeURIComponent(key)}/calendar.ics`,
    publicAppOrigin(c),
  ).toString();
}

async function sendPendingRegistrationConfirmationEmails(
  event: Event,
  c: Context,
  options: {
    registrationId?: string;
    limit?: number;
    statuses?: Array<'pending' | 'failed'>;
    kinds?: Array<'confirmation' | 'promotion'>;
  } = {},
): Promise<{ configured: boolean; accepted: string[]; failed: string[] }> {
  const resendApiKey = envValue('RESEND_API_KEY', c)?.trim();
  const emailFrom = EMAIL_SENDERS.events.from;
  const emailReplyTo = envValue('REGISTRATION_EMAIL_REPLY_TO', c)?.trim();
  if (!resendApiKey || !emailReplyTo || !z.string().email().safeParse(emailReplyTo).success) {
    return { configured: false, accepted: [], failed: [] };
  }

  const pending = await getPendingRegistrationEmails(event.id, {
    limit: options.limit,
    registrationId: options.registrationId,
    statuses: options.statuses,
    kinds: options.kinds,
  }, c);
  if (pending.length === 0) {
    return { configured: true, accepted: [], failed: [] };
  }

  const emails = pending.map((delivery) => {
    const content = eventRegistrationConfirmationEmail({
      attendeeName: delivery.name,
      eventName: event.name,
      eventDate: event.event_date,
      eventEndDate: event.end_date,
      locationName: event.location?.label ?? event.location?.name ?? 'Location to be announced',
      locationUrl: event.location?.url,
      eventUrl: publicEventDetailsUrl(event, c),
      calendarDownloadUrl: publicRegistrationCalendarUrl(event, c),
      status: delivery.registration_status,
      kind: delivery.kind,
    });
    return {
      from: emailFrom,
      to: [delivery.email],
      reply_to: emailReplyTo,
      ...content,
    };
  });
  const batchDigest = crypto.createHash('sha256')
    .update(pending.map((delivery) => delivery.idempotency_key).sort().join(':'))
    .digest('hex');

  try {
    const result = await sendResendEmailBatch({
      apiKey: resendApiKey,
      idempotencyKey: `registration-${batchDigest}`,
      emails,
    });
    await Promise.all(pending.map((delivery, index) => updateRegistrationEmailDelivery(delivery.delivery_id, {
      status: 'accepted',
      provider_id: result.ids[index],
    }, c)));
    return {
      configured: true,
      accepted: pending.map((delivery) => delivery.registration_id),
      failed: [],
    };
  } catch (error) {
    const message = error instanceof ResendBatchError && error.status === 429
      ? 'Email provider daily quota reached; delivery will be retried.'
      : 'Email provider did not accept this delivery; it can be retried.';
    await Promise.all(pending.map((delivery) => updateRegistrationEmailDelivery(delivery.delivery_id, {
      status: 'failed',
      last_error: message,
    }, c)));
    console.warn(JSON.stringify({
      event: 'registration_confirmation_email_delayed',
      event_id: event.id,
      recipient_count: pending.length,
      provider_status: error instanceof ResendBatchError ? error.status : null,
    }));
    return {
      configured: true,
      accepted: [],
      failed: pending.map((delivery) => delivery.registration_id),
    };
  }
}

async function sendPendingEventSubmissionEmails(
  c: Context,
  options: {
    submissionId?: string;
    kinds?: EventSubmissionEmailKind[];
    statuses?: Array<'pending' | 'failed'>;
    limit?: number;
  } = {},
): Promise<{ configured: boolean; accepted: string[]; failed: string[] }> {
  const resendApiKey = envValue('RESEND_API_KEY', c)?.trim();
  const emailReplyTo = (
    envValue('EVENT_EMAIL_REPLY_TO', c)
    ?? envValue('REGISTRATION_EMAIL_REPLY_TO', c)
  )?.trim();
  if (!resendApiKey || !emailReplyTo || !z.string().email().safeParse(emailReplyTo).success) {
    return { configured: false, accepted: [], failed: [] };
  }

  const pending = await getPendingEventSubmissionEmails(options, c);
  if (pending.length === 0) {
    return { configured: true, accepted: [], failed: [] };
  }

  const websiteOrigin = safeHttpUrl(envValue('PUBLIC_WEBSITE_ORIGIN', c) ?? '')
    ?? 'https://devcongress.org';
  const communityCalendarUrl = new URL('/events/', websiteOrigin).toString();
  const submissionUrl = new URL('/events/submit/', websiteOrigin).toString();
  const emails = pending.map((delivery) => ({
    from: EMAIL_SENDERS.events.from,
    to: [delivery.organizer_email],
    reply_to: emailReplyTo,
    ...communityEventSubmissionEmail({
      kind: delivery.kind,
      organizerName: delivery.organizer_name,
      eventTitle: delivery.event_title,
      startsAt: delivery.starts_at,
      timezone: delivery.timezone,
      communityCalendarUrl,
      submissionUrl,
      registrationUrl: delivery.registration_url,
      rejectionCategory: delivery.rejection_category,
      organizerMessage: delivery.organizer_message,
    }),
  }));
  const batchDigest = crypto.createHash('sha256')
    .update(pending.map((delivery) => delivery.idempotency_key).sort().join(':'))
    .digest('hex');

  try {
    const result = await sendResendEmailBatch({
      apiKey: resendApiKey,
      idempotencyKey: `event-submission-${batchDigest}`,
      emails,
    });
    await Promise.all(pending.map((delivery, index) => updateEventSubmissionEmailDelivery(
      delivery.delivery_id,
      { status: 'accepted', provider_id: result.ids[index] },
      c,
    )));
    return {
      configured: true,
      accepted: pending.map((delivery) => delivery.delivery_id),
      failed: [],
    };
  } catch (error) {
    const message = error instanceof ResendBatchError && error.status === 429
      ? 'Email provider daily quota reached; delivery can be retried.'
      : 'Email provider did not accept this delivery; it can be retried.';
    await Promise.all(pending.map((delivery) => updateEventSubmissionEmailDelivery(
      delivery.delivery_id,
      { status: 'failed', last_error: message },
      c,
    )));
    console.warn(JSON.stringify({
      event: 'event_submission_email_delayed',
      submission_id: options.submissionId ?? null,
      email_kind: options.kinds?.length === 1 ? options.kinds[0] : 'batch',
      recipient_count: pending.length,
      provider_status: error instanceof ResendBatchError ? error.status : null,
    }));
    return {
      configured: true,
      accepted: [],
      failed: pending.map((delivery) => delivery.delivery_id),
    };
  }
}

async function dispatchEventSubmissionEmails(
  c: Context,
  options: Parameters<typeof sendPendingEventSubmissionEmails>[1],
): Promise<void> {
  const task = sendPendingEventSubmissionEmails(c, options).catch((error) => {
    console.error(JSON.stringify({
      event: 'event_submission_email_dispatch_failed',
      submission_id: options?.submissionId ?? null,
      error_name: safeErrorName(error),
    }));
  });

  try {
    c.executionCtx.waitUntil(task);
  } catch {
    await task;
  }
}

function feedbackActivityLabelKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function feedbackScheduleActivityLabel(item: PublicMeetupScheduleItem): string {
  const title = item.title.trim();
  const lead = item.lead?.trim();
  if (!lead || title.toLowerCase().includes(lead.toLowerCase())) {
    return title;
  }

  return `${title} by ${lead}`;
}

function isFeedbackScheduleActivity(item: PublicMeetupScheduleItem): boolean {
  const title = item.title.trim();
  if (!title) return false;
  if (item.type === 'break' || item.type === 'networking') return false;
  if (/^welcome\b/i.test(title)) return false;
  return true;
}

function feedbackActivityLabelsForEvent(event: Event, eventTalks: Talk[]): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();

  function addLabel(label: string) {
    const normalized = label.trim();
    const key = feedbackActivityLabelKey(normalized);
    if (!normalized || seen.has(key)) return;
    seen.add(key);
    labels.push(normalized);
  }

  for (const talk of eventTalks) {
    addLabel(`${talk.title} by ${talk.speaker_name}`);
  }

  for (const item of event.schedule ?? []) {
    if (isFeedbackScheduleActivity(item)) {
      addLabel(feedbackScheduleActivityLabel(item));
    }
  }

  return labels;
}

function isDefaultFeedbackCampaign(campaign: FeedbackCampaign): boolean {
  if (campaign.status !== 'draft') return false;
  if (campaign.title !== 'How was the meetup?') return false;
  if (campaign.intro !== 'Tell us what landed, what dragged, and what should change next month.') return false;

  const labels = campaign.questions.map((question) => question.label);
  return labels.length === 4
    && labels.includes('How would you rate today\'s event?')
    && labels.includes('Which talk or session was most useful?')
    && labels.includes('Would you attend the next DevCongress community event?')
    && labels.includes('Other comments');
}

function feedbackQuestionsFromActivityLabels(labels: string[]): FeedbackQuestion[] {
  return [
    ...labels.map((label, index) => ({
      id: generateId(),
      type: 'rating' as const,
      label,
      required: true,
      options: [],
      order_index: index,
    })),
    {
      id: generateId(),
      type: 'yes_no' as const,
      label: 'Would you attend another DevCongress meetup like this?',
      required: false,
      options: [],
      order_index: labels.length,
    },
    {
      id: generateId(),
      type: 'text' as const,
      label: 'Other comments',
      required: false,
      options: [],
      order_index: labels.length + 1,
    },
  ];
}

async function hydrateDefaultFeedbackCampaignFromEvent(event: Event, campaign: FeedbackCampaign, eventTalks: Talk[], c?: Context): Promise<FeedbackCampaign> {
  if (!isDefaultFeedbackCampaign(campaign)) return campaign;

  const labels = feedbackActivityLabelsForEvent(event, eventTalks);
  if (labels.length === 0) return campaign;

  return updateFeedbackCampaignStore(event.id, {
    title: `How was ${event.name}?`,
    intro: 'For sessions you attended, rate 1 (extremely unsatisfied) to 5 (extremely satisfied). Choose Did not attend for anything you missed.',
    questions: feedbackQuestionsFromActivityLabels(labels),
  }, c);
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

function normalizeFeedbackSubmissionAnswers(
  campaign: FeedbackCampaign,
  input: unknown,
): { answers: FeedbackAnswer[]; valid: boolean } {
  if (!Array.isArray(input)) {
    return { answers: [], valid: false };
  }

  const rawAnswers = new Map<string, unknown>();
  for (const item of input) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const raw = item as Partial<FeedbackAnswer>;
    const questionId = String(raw.question_id ?? '');
    if (questionId) rawAnswers.set(questionId, raw.value);
  }

  const answers: FeedbackAnswer[] = [];
  for (const question of campaign.questions) {
    const normalized = normalizeEventFeedbackAnswer(question, rawAnswers.get(question.id));
    if (!normalized.valid) {
      return { answers: [], valid: false };
    }
    answers.push({
      question_id: question.id,
      value: normalized.value,
    });
  }

  return { answers, valid: true };
}

function extractGoogleSlidesPresentationId(input: string): string | null {
  if (!URL.canParse(input)) return null;

  const url = new URL(input);
  if (url.hostname !== 'docs.google.com') return null;

  const match = url.pathname.match(/\/presentation\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)/);
  return match?.[1] ?? null;
}

function googleSlidesExportUrl(input: string): string | null {
  const presentationId = extractGoogleSlidesPresentationId(input);
  if (!presentationId) return null;
  return `https://docs.google.com/presentation/d/${presentationId}/export/txt`;
}

function googleDocumentExportUrl(input: string): string | null {
  if (!URL.canParse(input)) return null;
  const url = new URL(input);
  if (url.hostname !== 'docs.google.com') return null;
  const match = url.pathname.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  return match?.[1] ? `https://docs.google.com/document/d/${match[1]}/export?format=txt` : null;
}

function normalizeSlideText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function slideTextLines(text: string): string[] {
  return normalizeSlideText(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function isLikelyPresenterLine(line: string): boolean {
  const lower = line.toLowerCase();
  return lower.includes('@') || lower.includes('linkedin') || lower.includes('twitter') || lower.includes('everywhere');
}

function titleCandidateScore(line: string, frequency: number): number {
  const wordCount = line.split(/\s+/).length;
  const hasTerminalPunctuation = /[.?!:]$/.test(line);
  const isAllCaps = line === line.toUpperCase();
  let score = frequency * 20 + Math.min(wordCount, 10) * 4 + Math.min(line.length, 90) / 6;

  if (isLikelyPresenterLine(line)) score -= 30;
  if (/^\d+$/.test(line)) score -= 40;
  if (hasTerminalPunctuation) score -= 8;
  if (isAllCaps) score -= 6;
  if (wordCount < 3) score -= 12;

  return score;
}

function inferSlidesTitle(lines: string[], fallbackTitle?: string): string {
  const frequencies = new Map<string, number>();
  for (const line of lines) {
    frequencies.set(line, (frequencies.get(line) ?? 0) + 1);
  }

  const best = [...frequencies.entries()]
    .map(([line, frequency]) => ({ line, score: titleCandidateScore(line, frequency) }))
    .sort((a, b) => b.score - a.score)[0];

  return best?.line ?? fallbackTitle?.trim() ?? 'Monthly system design scenario';
}

function summarizeList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function cleanSummaryLine(line: string): string {
  return line
    .replace(/\s+/g, ' ')
    .replace(/\bIts\b/g, "It's")
    .trim()
    .replace(/[.?!:;,]+$/, '');
}

function inferSlidesSummary(text: string, title: string, lead?: string): string {
  const lines = slideTextLines(text);
  const normalizedTitle = title.trim().toLowerCase();
  const uniqueLines = [...new Set(lines)];
  const contentLines = uniqueLines.filter((line) => {
    if (/^\d+$/.test(line)) return false;
    if (line.toLowerCase() === normalizedTitle) return false;
    if (isLikelyPresenterLine(line)) return false;
    return true;
  });

  const conceptLines = contentLines
    .filter((line) => line.length >= 18 && line.length <= 90 && !/[.?!]$/.test(line))
    .slice(0, 3)
    .map(cleanSummaryLine);
  const scenarioLine = contentLines
    .find((line) => line.length >= 70 && line.length <= 260);
  const facilitatorCopy = lead?.trim() ? ` It is facilitated by ${lead.trim()}.` : '';

  const parts = [`This month's system design session uses "${title}" as the prompt deck.${facilitatorCopy}`];

  if (conceptLines.length > 0) {
    parts.push(`The deck frames the room around ${summarizeList(conceptLines)}.`);
  }

  if (scenarioLine) {
    parts.push(`${cleanSummaryLine(scenarioLine)}.`);
  }

  if (parts.length === 1) {
    parts.push('Share the prompt deck with the room, then replace this draft after the meetup with the actual decisions, tradeoffs, and recap.');
  }

  return parts.join('\n\n');
}

async function readTextResponseWithLimit(response: globalThis.Response, maxBytes: number): Promise<string> {
  if (!response.body) return '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let receivedBytes = 0;
  let text = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    receivedBytes += value.byteLength;
    if (receivedBytes > maxBytes) {
      await reader.cancel();
      throw new Error('This Google Slides deck is too large to import safely.');
    }
    text += decoder.decode(value, { stream: true });
  }

  return text + decoder.decode();
}

async function fetchGoogleSlidesDraft(input: {
  promptUrl: string;
  fallbackTitle?: string;
  lead?: string;
}): Promise<{ title: string; content: string; summary: string; export_url: string }> {
  const exportUrl = googleSlidesExportUrl(input.promptUrl);
  if (!exportUrl) {
    throw new Error('Use a public Google Slides presentation link to generate a draft.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GOOGLE_SLIDES_FETCH_TIMEOUT_MS);
  const response = await fetch(exportUrl, {
    signal: controller.signal,
    headers: {
      Accept: 'text/plain, text/*;q=0.9, */*;q=0.1',
    },
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    throw new Error(response.status === 403
      ? 'This Google Slides deck is not publicly readable. Open sharing or use a public presentation link.'
      : 'Could not read this Google Slides deck.');
  }

  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > GOOGLE_SLIDES_MAX_TEXT_CHARS) {
    throw new Error('This Google Slides deck is too large to import safely.');
  }

  const rawText = await readTextResponseWithLimit(response, GOOGLE_SLIDES_MAX_BYTES);
  if (rawText.length > GOOGLE_SLIDES_MAX_TEXT_CHARS) {
    throw new Error('This Google Slides deck is too large to import safely.');
  }
  const text = normalizeSlideText(rawText);
  if (!text) {
    throw new Error('Google Slides returned an empty deck export.');
  }

  const lines = slideTextLines(text);
  const title = inferSlidesTitle(lines, input.fallbackTitle);

  return {
    title,
    content: text,
    summary: inferSlidesSummary(text, title, input.lead),
    export_url: exportUrl,
  };
}

async function fetchSystemDesignSourceText(promptUrl: string, fallbackTitle?: string): Promise<{ title: string; content: string }> {
  if (googleSlidesExportUrl(promptUrl)) {
    const draft = await fetchGoogleSlidesDraft({ promptUrl, fallbackTitle });
    return { title: draft.title, content: draft.content };
  }
  const exportUrl = googleDocumentExportUrl(promptUrl);
  if (!exportUrl) throw new Error('Use a public Google Slides or Google Docs link for the System Design source.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GOOGLE_SLIDES_FETCH_TIMEOUT_MS);
  const response = await fetch(exportUrl, { signal: controller.signal, headers: { Accept: 'text/plain' } }).finally(() => clearTimeout(timeout));
  if (!response.ok) throw new Error(response.status === 403 ? 'This Google Doc is not publicly readable. Open sharing first.' : 'Could not read this Google Doc.');
  const content = normalizeSlideText(await readTextResponseWithLimit(response, GOOGLE_SLIDES_MAX_BYTES));
  if (!content) throw new Error('Google Docs returned an empty document export.');
  return { title: fallbackTitle?.trim() || 'System Design source', content };
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
  let notAttendedCount = 0;

  for (const submission of submissions) {
    for (const answer of submission.answers) {
      const question = questionsById.get(answer.question_id);
      if (!question) continue;

      if (question.type === 'rating' && isEventFeedbackRating(answer.value)) {
        ratings.push(answer.value);
      }

      if (question.type === 'rating' && isEventFeedbackNotAttended(answer.value)) {
        notAttendedCount += 1;
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
    not_attended_count: notAttendedCount,
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

function eventUpdatesForCompletedChecklistItem(item: EventChecklistItem): Partial<Omit<Event, 'id' | 'created_at'>> {
  if (item.label === 'Publish archive') {
    return {
      publish_to_website: true,
      status: 'completed',
    };
  }

  if (item.label === 'Open CFP' || item.label === 'Close CFP') {
    return {};
  }

  if (item.status_on_complete) {
    return { status: item.status_on_complete };
  }

  return {};
}

function supabaseProjectRef(c?: Context): string | null {
  const supabaseUrl = envValue('VITE_SUPABASE_URL', c);
  if (!supabaseUrl) return null;

  try {
    return new URL(supabaseUrl).hostname.split('.')[0] ?? null;
  } catch {
    return null;
  }
}

async function canReachSupabaseDocumentStore(c: Context): Promise<boolean> {
  if (!isSupabaseServerConfigured(c)) return false;

  const { error } = await getSupabaseAdminClient(c)
    .from('app_json_documents')
    .select('key')
    .limit(1);

  return !error;
}

app.get('/api/health/supabase', async (c) => {
  if (!isSupabaseServerConfigured(c)) {
    return c.json({
      ok: false,
      configured: false,
    }, 503);
  }

  const supabase = getSupabaseAdminClient(c);
  const checks = await Promise.all([
    supabase.from('feedback_testers').select('id').limit(1),
    supabase.from('feedback_submissions').select('id').limit(1),
  ]);
  const error = checks.find((check) => check.error)?.error;

  if (error) {
    console.error(JSON.stringify({
      event: 'supabase_health_check_failed',
      request_id: c.get('requestId') ?? null,
      error_code: error.code ?? null,
    }));
    return c.json({
      ok: false,
      configured: true,
    }, 500);
  }

  return c.json({
    ok: true,
    configured: true,
  });
});

app.get('/api/health/data-sources', async (c) => {
  const adminError = await requireAdmin(c, ['owner']);
  if (adminError) return adminError;

  const supabaseConfigured = isSupabaseServerConfigured(c);
  const supabaseEnabled = isSupabaseRuntimeEnabled(c);
  const supabaseSource = supabaseConfigured ? 'supabase' : 'local-json';
  const documentStoreAvailable = await canReachSupabaseDocumentStore(c);
  const documentSource = documentStoreAvailable ? 'supabase-json' : 'local-json';

  return c.json({
    ok: true,
    supabase: {
      enabled: supabaseEnabled,
      configured: supabaseConfigured,
      project_ref: supabaseProjectRef(c),
      document_store_available: documentStoreAvailable,
    },
    sources: {
      community_events: supabaseSource,
      event_feedback_campaigns: supabaseSource,
      event_feedback_submissions: supabaseSource,
      route_feedback: supabaseConfigured ? 'supabase' : 'unavailable',
      talks: documentSource,
      speaker_intake_links: supabaseConfigured ? 'supabase' : 'local-json',
      speakers: documentSource,
      attendance_imports: documentSource,
      event_checklists: documentSource,
      quiz_sessions: documentSource,
      quiz_questions: documentSource,
      quiz_participants: supabaseSource,
      quiz_responses: documentSource,
      quiz_users: documentSource,
    },
  });
});

app.get('/api/health/supabase/community-events', async (c) => {
  const adminError = await requireAdmin(c, ['owner']);
  if (adminError) return adminError;

  if (!isSupabaseServerConfigured(c)) {
    return c.json({
      ok: false,
      configured: false,
    }, 503);
  }

  const { error } = await getSupabaseAdminClient(c)
    .from('community_events')
    .select('id')
    .limit(1);

  if (error) {
    console.error(JSON.stringify({
      event: 'community_events_health_check_failed',
      request_id: c.get('requestId') ?? null,
      error_code: error.code ?? null,
    }));
    return c.json({
      ok: false,
      configured: true,
    }, 500);
  }

  return c.json({
    ok: true,
    configured: true,
  });
});

app.get('/api/health/supabase/storage', async (c) => {
  const adminError = await requireAdmin(c, ['owner']);
  if (adminError) return adminError;

  if (!isSupabaseServerConfigured(c)) {
    return c.json({
      ok: false,
      configured: false,
    }, 503);
  }

  const { error } = await getSupabaseAdminClient(c)
    .storage
    .getBucket('meetup-media');

  if (error) {
    console.error(JSON.stringify({
      event: 'storage_health_check_failed',
      request_id: c.get('requestId') ?? null,
      error_name: error.name ?? null,
    }));
    return c.json({
      ok: false,
      configured: true,
    }, 500);
  }

  return c.json({
    ok: true,
    configured: true,
  });
});

app.get('/api/health', (c) => {
  return c.json({ ok: true });
});

app.get('/api/auth/session', async (c) => {
  const session = await getAdminSession(c);

  if (!session.authenticated) {
    return c.json({
      authenticated: false,
      auth_mode: 'supabase',
      auth_configured: isSupabaseAdminAuthConfigured(c),
    });
  }

  return c.json({
    authenticated: true,
    auth_mode: session.mode,
    auth_configured: true,
    expires_at: session.expires_at,
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
    return internalErrorResponse(c, 'feedback_testers_load_failed', error, 'Unable to load feedback testers.');
  }

  return c.json(data ?? []);
});

app.post('/api/feedback', async (c) => {
  if (!isSupabaseServerConfigured(c)) {
    return c.json({ error: 'Feedback is not configured' }, 503);
  }

  const parsed = routeFeedbackSubmissionSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Please check your feedback and try again.' }, 400);
  }
  const body = parsed.data;
  const type = body.type as FeedbackKind;
  const message = body.message;
  let testerId = body.tester_id ?? null;
  let testerName = body.tester_name;

  const turnstileError = await requirePublicTurnstile(c, {
    token: body.turnstile_token,
    submittedAction: body.turnstile_action,
    expectedAction: ROUTE_FEEDBACK_TURNSTILE_ACTION,
  });
  if (turnstileError) return turnstileError;

  const clientKey = publicClientKey(c);
  const cooldownError = await enforcePublicRateLimit(c, {
    action: 'route_feedback_cooldown',
    clientKey,
    maxAttempts: 1,
    windowSeconds: 10 * 60,
  }, 'Feedback was recently received from this device. Please wait before sending another note.');
  if (cooldownError) return cooldownError;

  const dailyLimitError = await enforcePublicRateLimit(c, {
    action: 'route_feedback_daily',
    clientKey,
    maxAttempts: 3,
    windowSeconds: 24 * 60 * 60,
  }, 'This device has reached the feedback limit for today.');
  if (dailyLimitError) return dailyLimitError;

  const supabase = getSupabaseAdminClient(c);

  if (testerId) {
    const { data: tester, error } = await supabase
      .from('feedback_testers')
      .select('id, display_name')
      .eq('id', testerId)
      .eq('active', true)
      .maybeSingle();

    if (error) {
      return c.json({ error: 'Unable to verify the selected tester.' }, 500);
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
      viewport_width: body.viewport_width ?? null,
      viewport_height: body.viewport_height ?? null,
    })
    .select('id')
    .single();

  if (error) {
    console.error(JSON.stringify({
      event: 'route_feedback_insert_failed',
      request_id: c.get('requestId') ?? null,
      error_code: error.code ?? null,
    }));
    return c.json({ error: 'Unable to save feedback. Please try again.' }, 500);
  }

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

  const [events, talks] = await Promise.all([
    getAllEvents(c),
    getAllTalks(),
  ]);
  const feedbackByEvent = await Promise.all(events.map(async (event) => {
    const [campaign, submissions] = await Promise.all([
      getFeedbackCampaignByEventStore(event.id, c),
      getFeedbackSubmissionsByEventStore(event.id, c),
    ]);

    return { eventId: event.id, campaign, submissions };
  }));
  const campaigns = feedbackByEvent
    .filter((item): item is typeof item & { campaign: FeedbackCampaign } => Boolean(item.campaign))
    .map((item) => item.campaign);
  const submissions = feedbackByEvent.flatMap((item) => item.submissions);
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
    not_attended_count: number;
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
      not_attended_count: 0,
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
      if (question?.type === 'rating' && isEventFeedbackRating(answer.value)) {
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
    monthBucket.not_attended_count += insights.not_attended_count;
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
        not_attended_count: month.not_attended_count,
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

  const [baseCampaign, submissions, talks] = await Promise.all([
    getOrCreateFeedbackCampaignStore(eventId, c),
    getFeedbackSubmissionsByEventStore(eventId, c),
    getTalksByEvent(eventId),
  ]);
  const visibleTalks = talks.filter((talk) => talk.status !== 'rejected');
  const campaign = await hydrateDefaultFeedbackCampaignFromEvent(event, baseCampaign, visibleTalks, c);

  return c.json({
    event,
    campaign,
    submissions: submissions.map((submission) => ({
      ...submission,
      respondent_name: null,
      respondent_email: null,
      page_path: null,
      user_agent: null,
    })),
    talks: visibleTalks,
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

  const campaign = await updateFeedbackCampaignStore(eventId, {
    title: typeof body.title === 'string' && body.title.trim() ? body.title.trim() : undefined,
    intro: typeof body.intro === 'string' ? body.intro.trim() || null : undefined,
    status,
    auto_open_on_event_completion: typeof body.auto_open_on_event_completion === 'boolean' ? body.auto_open_on_event_completion : undefined,
    opens_at: typeof body.opens_at === 'string' && body.opens_at ? body.opens_at : body.opens_at === null ? null : undefined,
    closes_at: typeof body.closes_at === 'string' && body.closes_at ? body.closes_at : body.closes_at === null ? null : undefined,
    questions,
  }, c);

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

app.delete('/api/events/:eventId/feedback-campaign', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  const eventId = c.req.param('eventId');
  const event = await getEventById(eventId, c);

  if (!event) {
    return c.json({ error: 'Event not found' }, 404);
  }

  const removedCampaign = await deleteFeedbackCampaignByEventStore(eventId, c);
  if (!removedCampaign) {
    return c.json({ error: 'Feedback form not found' }, 404);
  }

  await auditAdminAction(c, {
    action: 'feedback.campaign.delete',
    targetType: 'event',
    targetId: eventId,
    metadata: {
      campaign_id: removedCampaign.id,
      status: removedCampaign.status,
      question_count: removedCampaign.questions.length,
    },
  });

  return c.json({
    deleted: true,
    event_id: eventId,
    campaign_id: removedCampaign.id,
  });
});

app.get('/api/feedback/events/:eventId', async (c) => {
  const eventId = c.req.param('eventId');
  const event = await getEventById(eventId, c);
  const previewRequested = c.req.query('preview') === '1';

  if (!event) {
    return c.json({ error: 'Event not found' }, 404);
  }

  const campaign = await getFeedbackCampaignByEventStore(eventId, c);
  const previewAllowed = previewRequested && !(await requireAdmin(c));

  if (!campaign || (!previewAllowed && !isFeedbackCampaignOpen(event, campaign))) {
    return c.json({ error: 'Feedback is not open for this event' }, 404);
  }

  const talks = await getTalksByEvent(eventId);

  return c.json({
    event: {
      id: event.id,
      name: event.name,
      event_date: event.event_date,
    },
    campaign: {
      id: campaign.id,
      title: campaign.title,
      intro: campaign.intro,
      questions: campaign.questions,
    },
    feedback_window: feedbackCampaignWindow(event, campaign),
    talks: talks
      .filter((talk) => talk.status !== 'rejected')
      .map((talk) => ({
        id: talk.id,
        title: talk.title,
        speaker_name: talk.speaker_name,
      })),
    preview_mode: previewAllowed,
  });
});

app.get('/api/feedback/events/:eventId/status', async (c) => {
  const eventId = c.req.param('eventId');
  const event = await getEventById(eventId, c);

  if (!event) {
    return c.json({ available: false, error: 'Event not found' }, 404);
  }

  const campaign = await getFeedbackCampaignByEventStore(eventId, c);
  const available = Boolean(campaign && isFeedbackCampaignOpen(event, campaign));

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

  const campaign = await getFeedbackCampaignByEventStore(eventId, c);

  if (!campaign || !isFeedbackCampaignOpen(event, campaign)) {
    return c.json({ error: 'Feedback is not open for this event' }, 403);
  }

  const parsed = eventFeedbackSubmissionSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Please check your feedback and try again.' }, 400);
  }
  const body = parsed.data;

  const turnstileError = await requirePublicTurnstile(c, {
    token: body.turnstile_token,
    submittedAction: body.turnstile_action,
    expectedAction: EVENT_FEEDBACK_TURNSTILE_ACTION,
  });
  if (turnstileError) return turnstileError;

  const rateLimitError = await enforcePublicRateLimit(c, {
    action: `event_feedback:${eventId}`,
    clientKey: publicClientKey(c),
    maxAttempts: 5,
    windowSeconds: 60 * 60,
  }, 'This device has sent several feedback responses. Please try again later.');
  if (rateLimitError) return rateLimitError;

  const normalized = normalizeFeedbackSubmissionAnswers(campaign, body.answers);
  if (!normalized.valid) {
    return c.json({ error: 'One or more feedback answers are invalid.' }, 400);
  }

  const answers = normalized.answers;
  const answersByQuestion = new Map(answers.map((answer) => [answer.question_id, answer.value]));
  const missingRequired = campaign.questions.some((question) => {
    const value = answersByQuestion.get(question.id);
    return question.required && !isEventFeedbackAnswerPresent(value);
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

  const validTalkIds = new Set(
    (await getTalksByEvent(eventId))
      .filter((talk) => talk.status !== 'rejected')
      .map((talk) => talk.id),
  );
  const invalidTalkSelection = campaign.questions.some((question) => {
    const value = answersByQuestion.get(question.id);
    return question.type === 'talk_select'
      && typeof value === 'string'
      && value.length > 0
      && !validTalkIds.has(value);
  });

  if (invalidTalkSelection) {
    return c.json({ error: 'Please choose a talk from the available list.' }, 400);
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

  const submission = await createEventFeedbackSubmissionStore({
    campaign_id: campaign.id,
    event_id: eventId,
    respondent_name: null,
    respondent_email: null,
    answers,
    page_path: null,
    user_agent: null,
    response_token_hash: responseTokenHash,
  }, c);

  return c.json({ id: submission.id }, 201);
});

app.post('/api/volunteer-applications', async (c) => {
  const parsed = volunteerApplicationSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Please check your details and try again.' }, 400);
  }

  const turnstileError = await requirePublicTurnstile(c, {
    token: parsed.data.turnstile_token,
    submittedAction: parsed.data.turnstile_action,
    expectedAction: VOLUNTEER_INTAKE_TURNSTILE_ACTION,
  });
  if (turnstileError) return turnstileError;

  const clientKey = publicClientKey(c);
  const cooldownError = await enforcePublicRateLimit(c, {
    action: 'volunteer_application_cooldown',
    clientKey,
    maxAttempts: 1,
    windowSeconds: 10 * 60,
  }, 'A volunteer application was recently received from this device.');
  if (cooldownError) return cooldownError;

  const dailyLimitError = await enforcePublicRateLimit(c, {
    action: 'volunteer_application_daily',
    clientKey,
    maxAttempts: 2,
    windowSeconds: 24 * 60 * 60,
  }, 'This device has reached the volunteer application limit for today.');
  if (dailyLimitError) return dailyLimitError;

  const result = await createVolunteerApplication({
    name: parsed.data.name,
    email: parsed.data.email,
    x_handle: parsed.data.x_handle,
    slack_name: parsed.data.slack_name,
  });

  if (!result.created) {
    return c.json({ accepted: true }, 202);
  }

  return c.json({ accepted: true }, 202);
});

app.get('/api/admin/volunteer-applications', async (c) => {
  const applications = await getVolunteerApplications();
  return c.json({ applications });
});

app.get('/api/annual-conference/editions', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;
  const service = await annualConferenceServiceForRequest(c);
  return c.json({ editions: await service.listEditions() });
});

app.post('/api/annual-conference/editions', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;
  const parsed = annualConferenceEditionCreateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the edition details.' }, 400);

  try {
    const service = await annualConferenceServiceForRequest(c);
    return c.json(await service.createEdition(parsed.data), 201);
  } catch (error) {
    return annualConferenceServiceErrorResponse(c, error);
  }
});

app.get('/api/annual-conference/:year/work-plan', async (c) => {
  const adminError = await requireAdmin(c, ['owner', 'organizer', 'volunteer']);
  if (adminError) return adminError;

  const yearParam = c.req.param('year');
  if (!/^\d{4}$/.test(yearParam)) {
    return c.json({ error: 'Conference year must use four digits.' }, 400);
  }

  try {
    const service = await annualConferenceServiceForRequest(c);
    return c.json(await service.getWorkspace(Number(yearParam)));
  } catch (error) {
    return annualConferenceServiceErrorResponse(c, error);
  }
});

app.post('/api/annual-conference/:year/phases', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;
  const yearParam = c.req.param('year');
  if (!/^\d{4}$/.test(yearParam)) return c.json({ error: 'Conference year must use four digits.' }, 400);
  const parsed = annualConferencePhaseCreateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the phase details.' }, 400);
  try {
    const service = await annualConferenceServiceForRequest(c);
    return c.json(await service.createPhase(Number(yearParam), parsed.data), 201);
  } catch (error) {
    return annualConferenceServiceErrorResponse(c, error);
  }
});

app.put('/api/annual-conference/:year/phases/order', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;
  const yearParam = c.req.param('year');
  if (!/^\d{4}$/.test(yearParam)) return c.json({ error: 'Conference year must use four digits.' }, 400);
  const parsed = annualConferencePhaseOrderSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the phase order.' }, 400);
  try {
    const service = await annualConferenceServiceForRequest(c);
    return c.json(await service.reorderPhases(Number(yearParam), parsed.data.phase_ids));
  } catch (error) {
    return annualConferenceServiceErrorResponse(c, error);
  }
});

app.patch('/api/annual-conference/:year/phases/:phaseId', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;
  const yearParam = c.req.param('year');
  if (!/^\d{4}$/.test(yearParam)) return c.json({ error: 'Conference year must use four digits.' }, 400);
  const parsed = annualConferencePhaseUpdateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the phase changes.' }, 400);
  try {
    const service = await annualConferenceServiceForRequest(c);
    return c.json(await service.updatePhase(Number(yearParam), c.req.param('phaseId'), parsed.data));
  } catch (error) {
    return annualConferenceServiceErrorResponse(c, error);
  }
});

app.delete('/api/annual-conference/:year/phases/:phaseId', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;
  const yearParam = c.req.param('year');
  if (!/^\d{4}$/.test(yearParam)) return c.json({ error: 'Conference year must use four digits.' }, 400);
  try {
    const service = await annualConferenceServiceForRequest(c);
    return c.json(await service.deletePhase(Number(yearParam), c.req.param('phaseId')));
  } catch (error) {
    return annualConferenceServiceErrorResponse(c, error);
  }
});

app.post('/api/annual-conference/:year/work-plan', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  const yearParam = c.req.param('year');
  if (!/^\d{4}$/.test(yearParam)) {
    return c.json({ error: 'Conference year must use four digits.' }, 400);
  }

  const parsed = annualConferenceTaskCreateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the task details.' }, 400);
  }

  try {
    const service = await annualConferenceServiceForRequest(c);
    return c.json(await service.createTask(Number(yearParam), parsed.data), 201);
  } catch (error) {
    return annualConferenceServiceErrorResponse(c, error);
  }
});

app.patch('/api/annual-conference/:year/work-plan/:taskId', async (c) => {
  const adminError = await requireAdmin(c, ['owner', 'organizer', 'volunteer']);
  if (adminError) return adminError;

  const yearParam = c.req.param('year');
  if (!/^\d{4}$/.test(yearParam)) {
    return c.json({ error: 'Conference year must use four digits.' }, 400);
  }

  const parsed = annualConferenceTaskUpdateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the task changes.' }, 400);
  }

  try {
    const service = await annualConferenceServiceForRequest(c);
    return c.json(await service.updateTask(Number(yearParam), c.req.param('taskId'), parsed.data));
  } catch (error) {
    return annualConferenceServiceErrorResponse(c, error);
  }
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

  const parsed = adminTokenExchangeSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Google organizer sign-in could not be completed. Please try again.' }, 400);
  }

  const rateLimitError = await enforcePublicRateLimit(c, {
    action: 'admin_token_exchange',
    clientKey: publicClientKey(c),
    maxAttempts: 10,
    windowSeconds: 10 * 60,
  }, 'Too many sign-in attempts. Please wait a few minutes and try again.');
  if (rateLimitError) return rateLimitError;

  const result = await completeSupabaseAdminToken(c, parsed.data.access_token);
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
    return c.json({ error: 'Enter a valid email, display name, and role.' }, 400);
  }
  const email = parsed.data.email;
  const displayName = parsed.data.display_name;
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
    if (role === 'owner') {
      return c.json({ error: 'Only owners can grant owner access.' }, 403);
    }

    if (existingMembership?.role === 'owner') {
      return c.json({ error: 'Only owners can update another owner.' }, 403);
    }

    if (existingMembership && existingMembership.role !== role) {
      return c.json({ error: 'Only owners can change an existing member role.' }, 403);
    }
  }

  if (existingMembership && existingMembership.role !== role) {
    if (existingMembership.id === session.membership_id) {
      return c.json({ error: 'You cannot change your own role.' }, 400);
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
    return c.json({ error: 'Unable to save access.' }, 500);
  }

  if (
    existingMembership
    && (existingMembership.role !== data.role || existingMembership.status !== data.status)
  ) {
    try {
      await revokeAdminSessionsForMembership(c, data.id);
    } catch {
      return c.json({ error: 'Organizer access changed, but existing sessions could not be revoked.' }, 500);
    }
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

app.patch('/api/admin/organizers/:organizerId/role', async (c) => {
  const adminError = await requireAdmin(c, ['owner']);
  if (adminError) return adminError;

  if (!isSupabaseAdminAuthConfigured(c)) {
    return c.json({ error: 'Organizer email management requires Supabase auth.' }, 503);
  }

  const session = await getAdminSession(c);
  if (!session.authenticated || session.role !== 'owner') {
    return c.json({ error: 'Only owners can change member roles.' }, 403);
  }

  const organizerId = c.req.param('organizerId');
  if (organizerId === session.membership_id) {
    return c.json({ error: 'You cannot change your own role.' }, 400);
  }

  const parsed = updateOrganizerRoleSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Choose Organizer or Volunteer.' }, 400);
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
  if (existingMembership.role === 'owner') {
    return c.json({ error: 'Owner roles cannot be changed from this control.' }, 400);
  }
  if (existingMembership.role === parsed.data.role) {
    return c.json(existingMembership);
  }

  const { data, error } = await getSupabaseAdminClient(c)
    .from('admin_memberships')
    .update({ role: parsed.data.role })
    .eq('id', organizerId)
    .select('id, email, display_name, role, status, last_login_at, created_at')
    .maybeSingle();

  if (error) {
    return c.json({ error: 'Unable to change member role.' }, 500);
  }
  if (!data) {
    return c.json({ error: 'Organizer was not found.' }, 404);
  }

  try {
    await revokeAdminSessionsForMembership(c, data.id);
  } catch {
    return c.json({ error: 'The role changed, but existing sessions could not be revoked.' }, 500);
  }

  await recordAdminAudit(c, {
    actor_user_id: session.user_id,
    actor_email: session.email,
    actor_role: session.role,
    action: 'admin.organizer.role_change',
    target_type: 'admin_membership',
    target_id: data.id,
    metadata: { email: data.email, previous_role: existingMembership.role, role: data.role },
  });

  return c.json(data);
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
  try {
    await revokeAdminSessionsForMembership(c, data.id);
  } catch {
    return c.json({ error: 'Organizer access was disabled, but existing sessions could not be revoked.' }, 500);
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

app.get('/api/admin/event-submissions', async (c) => {
  const parsed = eventSubmissionListQuerySchema.safeParse({ status: c.req.query('status') });
  if (!parsed.success) return c.json({ error: 'Invalid submission status.' }, 400);

  try {
    const submissions = await listEventSubmissions(parsed.data.status as EventSubmissionReviewStatus | undefined, c);
    return c.json({ submissions });
  } catch (error) {
    if (error instanceof EventSubmissionStorageError) {
      return c.json({ error: 'Unable to load event submissions.' }, 503);
    }
    throw error;
  }
});

app.post('/api/admin/event-submissions/:submissionId/approve', async (c) => {
  const parsed = eventSubmissionApproveSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Choose whether to publish the approved event.' }, 400);
  const session = c.get('adminSession') ?? await getAdminSession(c);
  if (!session.authenticated || !session.email) return c.json({ error: 'Organizer session required.' }, 401);

  try {
    const submission = await approveEventSubmission(
      c.req.param('submissionId'),
      session.email,
      parsed.data.publish,
      c,
    );
    await auditAdminAction(c, {
      action: parsed.data.publish ? 'event_submission.approve_and_publish' : 'event_submission.approve_as_draft',
      targetType: 'event_submission',
      targetId: submission.id,
      metadata: { approved_event_id: submission.approved_event_id },
    });
    if (parsed.data.publish) {
      await dispatchEventSubmissionEmails(c, {
        submissionId: submission.id,
        kinds: ['approved'],
        statuses: ['pending', 'failed'],
        limit: 1,
      });
    }
    return c.json({ submission, event_id: submission.approved_event_id });
  } catch (error) {
    if (error instanceof EventSubmissionStorageError) {
      if (error.code === 'not_found') return c.json({ error: error.message }, 404);
      if (error.code === 'already_rejected') return c.json({ error: error.message }, 409);
      return c.json({ error: 'Unable to approve event submission.' }, 503);
    }
    throw error;
  }
});

app.post('/api/admin/event-submissions/:submissionId/reject', async (c) => {
  const parsed = eventSubmissionRejectSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'Choose a valid rejection reason and check the message lengths.' }, 400);
  const session = c.get('adminSession') ?? await getAdminSession(c);
  if (!session.authenticated || !session.email) return c.json({ error: 'Organizer session required.' }, 401);

  try {
    const submission = await rejectEventSubmission(
      c.req.param('submissionId'),
      session.email,
      parsed.data,
      c,
    );
    await auditAdminAction(c, {
      action: 'event_submission.reject',
      targetType: 'event_submission',
      targetId: submission.id,
      metadata: {
        category: submission.rejection_category,
        organizer_message_provided: Boolean(submission.organizer_message),
        internal_note_provided: Boolean(submission.internal_note),
      },
    });
    await dispatchEventSubmissionEmails(c, {
      submissionId: submission.id,
      kinds: ['rejected'],
      statuses: ['pending', 'failed'],
      limit: 1,
    });
    return c.json({ submission });
  } catch (error) {
    if (error instanceof EventSubmissionStorageError) {
      if (error.code === 'not_found') return c.json({ error: error.message }, 404);
      if (error.code === 'already_approved') return c.json({ error: error.message }, 409);
      return c.json({ error: 'Unable to reject event submission.' }, 503);
    }
    throw error;
  }
});

app.post('/api/admin/event-submissions/:submissionId/emails/:kind/retry', async (c) => {
  const parsedKind = eventSubmissionEmailKindSchema.safeParse(c.req.param('kind'));
  if (!parsedKind.success) return c.json({ error: 'Unknown submission email type.' }, 400);

  try {
    const result = await sendPendingEventSubmissionEmails(c, {
      submissionId: c.req.param('submissionId'),
      kinds: [parsedKind.data],
      statuses: ['pending', 'failed'],
      limit: 1,
    });
    if (!result.configured) {
      return c.json({ error: 'Community event email delivery is not configured.' }, 503);
    }
    if (result.accepted.length === 0 && result.failed.length === 0) {
      return c.json({ error: 'This email has already been accepted or was not queued.' }, 409);
    }
    if (result.failed.length > 0) {
      return c.json({ error: 'The email provider did not accept this delivery. It remains available to retry.' }, 502);
    }

    await auditAdminAction(c, {
      action: 'event_submission.email_retry',
      targetType: 'event_submission',
      targetId: c.req.param('submissionId'),
      metadata: { kind: parsedKind.data },
    });
    return c.json({ accepted: true, kind: parsedKind.data });
  } catch (error) {
    if (error instanceof EventSubmissionStorageError) {
      return c.json({ error: 'Unable to retry this submission email.' }, 503);
    }
    throw error;
  }
});

app.get('/api/admin/audit-log', async (c) => {
  const adminError = await requireAdmin(c, ['owner']);
  if (adminError) return adminError;

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

  function regularRank(
    a: {
      name: string;
      registered_count: number;
      checked_in_count: number;
      check_in_rate: number;
      last_seen_at: string | null;
    },
    b: {
      name: string;
      registered_count: number;
      checked_in_count: number;
      check_in_rate: number;
      last_seen_at: string | null;
    },
  ) {
    return (
      b.checked_in_count - a.checked_in_count
      || b.check_in_rate - a.check_in_rate
      || b.registered_count - a.registered_count
      || new Date(b.last_seen_at ?? 0).getTime() - new Date(a.last_seen_at ?? 0).getTime()
      || a.name.localeCompare(b.name)
    );
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
    .sort(regularRank)
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
  return c.json({
    data: await publicMeetupsForApi(c),
    meta: {
      source: 'devcongress-comm',
      version: 1,
    },
  });
});

app.get('/api/public/events', async (c) => {
  setPublicApiCache(c);
  return c.json({
    data: await getSupabasePublicEvents(c) ?? await buildPublicEvents(c),
    meta: {
      source: 'events-management',
      version: 1,
    },
  });
});

app.post('/api/public/event-submissions', async (c) => {
  const parsed = eventSubmissionSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    const fieldErrors = Object.fromEntries(
      Object.entries(parsed.error.flatten().fieldErrors)
        .flatMap(([field, messages]) => messages?.[0] ? [[field, messages[0]]] : []),
    );
    return c.json({
      error: {
        code: 'validation_failed',
        message: 'Check the event details and try again.',
        field_errors: fieldErrors,
      },
    }, 400);
  }

  const expectedHostnames = eventSubmissionTurnstileHostnames(c);
  if (envValue('NODE_ENV', c) === 'production' && expectedHostnames.length === 0) {
    console.error(JSON.stringify({
      event: 'turnstile_configuration_missing',
      action: EVENT_SUBMISSION_TURNSTILE_ACTION,
      request_id: c.get('requestId') ?? null,
    }));
    return c.json({
      error: {
        code: 'verification_unavailable',
        message: 'Human verification is temporarily unavailable. Please try again later.',
      },
    }, 503);
  }

  const turnstileSecret = envValue('TURNSTILE_SECRET_KEY', c)?.trim();
  if (!turnstileSecret) {
    if (envValue('NODE_ENV', c) === 'production' || parsed.data.turnstile_token) {
      return c.json({
        error: {
          code: 'verification_unavailable',
          message: 'Human verification is temporarily unavailable. Please try again later.',
        },
      }, 503);
    }
  } else {
    if (parsed.data.turnstile_action !== EVENT_SUBMISSION_TURNSTILE_ACTION) {
      return c.json({
        error: {
          code: 'verification_failed',
          message: 'Human verification did not match this form. Please try again.',
        },
      }, 400);
    }
    const verification = await validateTurnstileToken({
      token: parsed.data.turnstile_token,
      secretKey: turnstileSecret,
      remoteIp: publicClientIp(c),
      expectedAction: EVENT_SUBMISSION_TURNSTILE_ACTION,
      expectedHostname: expectedHostnames,
    });
    if (!verification.ok) {
      return c.json({
        error: {
          code: verification.status === 503 ? 'verification_unavailable' : 'verification_failed',
          message: verification.error,
        },
      }, verification.status);
    }
  }

  for (const limit of [
    {
      action: 'event_submission_client',
      clientKey: publicClientKey(c),
      maxAttempts: 5,
      windowSeconds: 60 * 60,
    },
    {
      action: 'event_submission_email',
      clientKey: parsed.data.organizer_email,
      maxAttempts: 3,
      windowSeconds: 24 * 60 * 60,
    },
  ]) {
    const rateLimit = await consumePublicRateLimit(c, limit);
    if (!rateLimit.allowed) {
      c.header('Retry-After', String(rateLimit.retryAfterSeconds));
      return c.json({
        error: {
          code: rateLimit.unavailable ? 'submission_unavailable' : 'rate_limited',
          message: rateLimit.unavailable
            ? 'Event submissions are temporarily unavailable. Please try again shortly.'
            : 'Too many event submissions. Please try again later.',
        },
      }, rateLimit.unavailable ? 503 : 429);
    }
  }

  try {
    const { turnstile_action: _action, turnstile_token: _token, ...input } = parsed.data;
    const submission = await createEventSubmission({
      ...input,
      title: markTestEventTitle(input.title, eventTestModeEnabled(envValue('EVENT_TEST_MODE', c))),
    }, c);
    await dispatchEventSubmissionEmails(c, {
      submissionId: submission.id,
      kinds: ['receipt'],
      statuses: ['pending', 'failed'],
      limit: 1,
    });
    return c.json({
      data: {
        id: submission.id,
        status: 'pending' as const,
        submitted_at: submission.created_at,
      },
      meta: { version: 1 as const },
    }, 202);
  } catch (error) {
    if (error instanceof EventSubmissionStorageError) {
      return c.json({
        error: {
          code: 'submission_unavailable',
          message: 'Event submissions are temporarily unavailable. Please try again later.',
        },
      }, 503);
    }
    throw error;
  }
});

app.get('/api/public/archive', async (c) => {
  setPublicApiCache(c);
  return c.json(await publicArchivePayload(c));
});

app.get('/api/public/archive/:eventId', async (c) => {
  setPublicApiCache(c);
  const payload = await publicArchiveEventPayload(c.req.param('eventId'), c);

  if (!payload) {
    return c.json({ error: 'Archive event not found' }, 404);
  }

  return c.json(payload);
});

app.get('/api/public/home', async (c) => {
  c.header('Cache-Control', 'no-store');
  return c.json(await publicHomePayload(c));
});

app.get('/api/public/meetups/:slug', async (c) => {
  setPublicApiCache(c);
  const slug = c.req.param('slug');
  const meetups = await publicMeetupsForApi(c);
  const meetup = meetups.find((item) => item.slug === slug || item.id === slug);

  if (!meetup) {
    return c.json({ error: 'Meetup not found' }, 404);
  }

  return c.json({ data: meetup });
});

app.get('/api/public/meetups/:slug/talks', async (c) => {
  setPublicApiCache(c);
  const slug = c.req.param('slug');
  const meetups = await publicMeetupsForApi(c);
  const meetup = meetups.find((item) => item.slug === slug || item.id === slug);

  if (!meetup) {
    return c.json({ error: 'Meetup not found' }, 404);
  }

  const archiveItems = (await getTalksByEvent(meetup.id))
    .filter((talk) => talk.status === 'published')
    .map((talk) => toPublicArchiveTalk(talk, meetup));

  return c.json({
    data: archiveItems,
    meta: {
      meetup_id: meetup.id,
      meetup_slug: meetup.slug,
      count: archiveItems.length,
    },
  });
});

app.get('/api/cfp/events/:eventId', async (c) => {
  c.header('Cache-Control', 'no-store');
  const event = await getEventById(c.req.param('eventId'), c);
  if (!event || event.status !== 'cfp_open' || !canOpenCfpForEvent(event)) {
    return c.json({ error: 'CFP event not found' }, 404);
  }

  return c.json({
    id: event.id,
    name: event.name,
    description: event.description,
    event_date: event.event_date,
    status: event.status,
    series_type: resolveEventSeriesType(event),
  });
});

app.get('/api/registration/events/:eventId/calendar.ics', async (c) => {
  const event = await getEventByRegistrationKey(c.req.param('eventId'), c);
  const campaign = event ? await getRegistrationCampaign(event.id, c) : undefined;
  if (!event || !campaign || campaign.status === 'draft') {
    return c.json({ error: 'Event calendar not found.' }, 404);
  }

  const calendar = eventRegistrationCalendarFile({
    eventId: event.id,
    eventName: event.name,
    eventDate: event.event_date,
    eventEndDate: event.end_date,
    locationName: event.location?.label ?? event.location?.name ?? 'Location to be announced',
    eventUrl: publicEventDetailsUrl(event, c),
    updatedAt: event.updated_at,
  });
  if (!calendar) {
    return c.json({ error: 'Event calendar not found.' }, 404);
  }

  return c.body(calendar.content, 200, {
    'Cache-Control': 'public, max-age=300',
    'Content-Disposition': `attachment; filename="${calendar.filename}"`,
    'Content-Type': 'text/calendar; charset=utf-8',
  });
});

app.get('/api/registration/events/:eventId', async (c) => {
  const event = await getEventByRegistrationKey(c.req.param('eventId'), c);
  const campaign = event ? await getRegistrationCampaign(event.id, c) : undefined;
  if (!event || !campaign || campaign.status === 'draft') {
    return c.json({ available: false, error: 'Registration is not available for this event.' }, 404);
  }

  const availability = registrationAvailability(campaign);
  return c.json({
    available: availability.available,
    unavailable_reason: availability.available ? null : availability.reason,
    event: {
      id: event.id,
      name: event.name,
      description: event.description,
      event_date: event.event_date,
      end_date: event.end_date ?? null,
      cover: event.cover ?? null,
      location: event.location ?? null,
      updated_at: event.updated_at,
    },
    campaign: {
      status: campaign.status,
      description: campaign.description,
      opens_at: campaign.opens_at,
      closes_at: campaign.closes_at,
      waitlist_enabled: campaign.waitlist_enabled,
    },
  });
});

app.post('/api/registration/events/:eventId', async (c) => {
  const parsed = eventRegistrationSubmissionSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Please check your details and try again.' }, 400);
  }

  const event = await getEventByRegistrationKey(c.req.param('eventId'), c);
  const campaign = event ? await getRegistrationCampaign(event.id, c) : undefined;
  if (!event || !campaign || campaign.status === 'draft') {
    return c.json({ error: 'Registration is not available for this event.' }, 404);
  }

  const turnstileError = await requirePublicTurnstile(c, {
    token: parsed.data.turnstile_token,
    submittedAction: parsed.data.turnstile_action,
    expectedAction: EVENT_REGISTRATION_TURNSTILE_ACTION,
  });
  if (turnstileError) return turnstileError;

  const clientKey = publicClientKey(c);
  const clientLimitError = await enforcePublicRateLimit(c, {
    action: `event_registration:${event.id}`,
    clientKey,
    maxAttempts: 5,
    windowSeconds: 10 * 60,
  }, 'Too many registration attempts. Please wait a few minutes and try again.');
  if (clientLimitError) return clientLimitError;

  const emailLimitError = await enforcePublicRateLimit(c, {
    action: `event_registration_email:${event.id}`,
    clientKey: parsed.data.email,
    maxAttempts: 3,
    windowSeconds: 24 * 60 * 60,
  }, 'Too many registration attempts. Please try again later.');
  if (emailLimitError) return emailLimitError;

  try {
    const registration = await registerForEvent({
      event_id: event.id,
      name: parsed.data.name,
      email: parsed.data.email,
    }, c);
    await sendPendingRegistrationConfirmationEmails(event, c, {
      registrationId: registration.id,
      limit: 1,
      kinds: ['confirmation'],
    });

    return c.json({
      accepted: true,
      message: 'If this email can be registered, a confirmation will be sent shortly.',
    }, 202);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('registration_duplicate')) {
      return c.json({
        accepted: true,
        message: 'If this email can be registered, a confirmation will be sent shortly.',
      }, 202);
    }
    if (message.includes('registration_closed')) {
      return c.json({ error: 'Registration is not open for this event.' }, 409);
    }
    if (message.includes('registration_full')) {
      return c.json({ error: 'This event is full and the waitlist is closed.' }, 409);
    }
    if (message.includes('registration_unavailable')) {
      return c.json({ error: 'Registration is not available for this event.' }, 404);
    }
    console.error(JSON.stringify({
      event: 'event_registration_failed',
      event_id: event.id,
      error_name: safeErrorName(error),
    }));
    return c.json({ error: 'We could not save your registration. Please try again.' }, 500);
  }
});

app.get('/api/events', async (c) => {
  return c.json(await getAllEvents(c));
});

app.get('/api/admin/venues/search', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  const queryResult = z.string().trim().min(2).max(120).safeParse(c.req.query('q'));
  if (!queryResult.success) {
    return c.json({ error: 'Enter at least two characters to search Ghana venues.' }, 400);
  }

  const rateLimitError = await enforcePublicRateLimit(c, {
    action: 'admin_venue_search',
    clientKey: publicClientIp(c) ?? 'unknown-admin-client',
    maxAttempts: 60,
    windowSeconds: 60,
  }, 'Too many venue searches. Wait a moment and try again.');
  if (rateLimitError) return rateLimitError;

  const apiKey = envValue('GOOGLE_MAPS_PLACES_API_KEY', c)?.trim();
  if (!apiKey) {
    return c.json({ error: 'Venue search is not configured.' }, 503);
  }

  try {
    const venues = await searchGhanaVenues({ query: queryResult.data, apiKey });
    return c.json({ venues });
  } catch (error) {
    console.error(JSON.stringify({
      event: 'ghana_venue_search_failed',
      provider_status: error instanceof GooglePlacesSearchError ? error.status : null,
      error_name: safeErrorName(error),
      request_id: c.get('requestId') ?? null,
    }));
    return c.json({ error: 'Venue search is temporarily unavailable.' }, 502);
  }
});

app.post('/api/events', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  const body = await c.req.json();
  const parsed = createEventFormSchema.safeParse({
    name: body.name,
    description: body.description,
    event_date: body.event_date,
    series_type: body.series_type === null ? 'none' : body.series_type,
    end_date: body.end_date ?? '',
    slug: body.slug ?? '',
    cover: body.cover ?? '',
    location_kind: body.location_kind
      ?? (body.stream_url && (body.location?.name ?? body.location?.label) === 'Online' ? 'online' : 'physical'),
    physical_location_type: body.physical_location_type ?? (body.location?.url ? 'maps' : 'name'),
    location_place_id: body.location_place_id ?? '',
    require_ghana_venue_selection: Boolean(body.require_ghana_venue_selection),
    location_name: body.location?.name ?? body.location?.label ?? '',
    location_url: body.location?.url ?? '',
    stream_url: body.stream_url ?? '',
    publish_to_website: Boolean(body.publish_to_website),
    registration_capacity: body.registration?.capacity ?? 100,
    registration_opens_at: body.registration?.opens_at ?? '',
    registration_closes_at: body.registration?.closes_at ?? '',
  });

  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Event form is invalid.' }, 400);
  }

  const payload = toCreateEventApiPayload(parsed.data);
  // Older API clients can create hybrid events without the organizer form's
  // explicit location mode. Preserve their validated conference link while
  // keeping the new organizer workflow mutually exclusive.
  if (body.location_kind === undefined && body.stream_url) {
    payload.stream_url = safeHttpUrl(body.stream_url);
  }

  let event: Event | null = null;
  try {
    event = await createEvent({
      ...payload,
      registration_url: null,
      photos: normalizeEventPhotos(body.photos),
      location: payload.location,
      series_type: payload.series_type,
    }, c);
    event = await updateEvent(event.id, {
      registration_url: publicRegistrationUrl(event, c),
      // Publication and lifecycle must not contradict each other on first load.
      // An unpublished shell can remain a planning draft; a published event is upcoming.
      status: payload.publish_to_website ? 'upcoming' : event.status,
    }, c);
    const registrationCampaign = await createRegistrationCampaign(event.id, {
      ...payload.registration,
      // Event creation is also registration publication. A future opens_at
      // can be configured later, but must not make a newly shared link look broken.
      status: 'open',
      opens_at: null,
    }, c);

    await auditAdminAction(c, {
      action: 'event.create_native',
      targetType: 'event',
      targetId: event.id,
      metadata: {
        name: event.name,
        status: event.status,
        event_date: event.event_date,
        series_type: event.series_type,
        registration_campaign_id: registrationCampaign.id,
        registration_capacity: registrationCampaign.capacity,
      },
    });

    return c.json({ event, registration_campaign: registrationCampaign }, 201);
  } catch (error) {
    if (event) {
      await deleteEvent(event.id, c).catch(() => undefined);
    }
    return internalErrorResponse(c, 'event_create_failed', error, 'Unable to create the event.');
  }
});

app.get('/api/events/:eventId', async (c) => {
  const event = await getEventById(c.req.param('eventId'), c);

  if (!event) {
    return c.json({ error: 'Event not found' }, 404);
  }

  return c.json(event);
});

app.get('/api/events/:eventId/registrations', async (c) => {
  const event = await getEventById(c.req.param('eventId'), c);
  if (!event) {
    return c.json({ error: 'Event not found.' }, 404);
  }

  const campaign = await getRegistrationCampaign(event.id, c);
  if (!campaign) {
    return c.json({
      managed_internally: false as const,
      event,
      campaign: null,
      registrations: [],
      summary: null,
      public_url: null,
    });
  }

  const registrations = await getEventRegistrations(event.id, c);
  return c.json({
    managed_internally: true as const,
    event,
    campaign,
    registrations,
    summary: summarizeEventRegistrations(campaign, registrations),
    public_url: publicRegistrationUrl(event, c),
  });
});

app.get('/api/events/:eventId/blasts', async (c) => {
  const event = await getEventById(c.req.param('eventId'), c);
  const campaign = event ? await getRegistrationCampaign(event.id, c) : undefined;
  if (!event || !campaign) return c.json({ error: 'Registration campaign not found.' }, 404);
  try {
    return c.json({ blasts: await getEventBlasts(event.id, c) });
  } catch (error) {
    if (!(error instanceof EventBlastStorageError)) throw error;
    console.error(JSON.stringify({
      event: 'event_blast_storage_unavailable',
      event_id: event.id,
      provider_code: error.code,
    }));
    return c.json({
      error: 'Blast history is unavailable. Check the event-blasts database migration, then try again.',
      code: 'blast_storage_unavailable',
    }, 503);
  }
});

app.post('/api/events/:eventId/blasts', async (c) => {
  const event = await getEventById(c.req.param('eventId'), c);
  const campaign = event ? await getRegistrationCampaign(event.id, c) : undefined;
  if (!event || !campaign) return c.json({ error: 'Registration campaign not found.' }, 404);

  const parsed = eventBlastRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the blast details.' }, 400);
  }

  const recipients = (await getEventRegistrations(event.id, c))
    .filter((registration) => registration.status === 'confirmed')
    .map((registration) => ({ email: registration.email, name: registration.name }));
  if (recipients.length === 0) {
    return c.json({ error: 'A blast needs at least one confirmed guest.' }, 409);
  }
  if (recipients.length > 100) {
    return c.json({
      error: `This event has ${recipients.length} confirmed guests. Blasts are limited to 100 recipients.`,
      code: 'recipient_limit',
    }, 409);
  }

  const scheduledFor = parsed.data.scheduled_for ?? null;
  const session = await getAdminSession(c);
  let blast;
  try {
    blast = await createEventBlast({
      event_id: event.id,
      subject: parsed.data.subject,
      body: parsed.data.body,
      status: 'preparing',
      recipient_count: recipients.length,
      scheduled_for: scheduledFor,
      sent_at: null,
      provider_broadcast_id: null,
      provider_segment_id: null,
      created_by_email: session.authenticated ? session.email : null,
    }, c);
  } catch (error) {
    if (!(error instanceof EventBlastStorageError)) throw error;
    console.error(JSON.stringify({
      event: 'event_blast_storage_unavailable',
      event_id: event.id,
      provider_code: error.code,
    }));
    return c.json({
      error: 'This blast could not be saved. Check the event-blasts database migration, then try again.',
      code: 'blast_storage_unavailable',
    }, 503);
  }

  const apiKey = envValue('RESEND_BROADCASTS_API_KEY', c)?.trim();
  const from = EMAIL_SENDERS.events.from;
  const replyTo = envValue('REGISTRATION_EMAIL_REPLY_TO', c)?.trim();
  if (!apiKey || !replyTo || !z.string().email().safeParse(replyTo).success) {
    const unavailable = await updateEventBlast(blast.id, { status: 'needs_capacity' }, c);
    await auditAdminAction(c, {
      action: 'event.blast.needs_capacity',
      targetType: 'event_blast',
      targetId: blast.id,
      metadata: { event_id: event.id, recipient_count: recipients.length, reason: 'not_configured' },
    });
    return c.json({ blast: unavailable ?? blast, delivery: 'needs_capacity' as const }, 202);
  }

  try {
    // A provider draft is persisted before it can be sent. If the final send
    // response is interrupted, a retry addresses this exact broadcast instead
    // of creating a second message for the same guests.
    const provider = await prepareResendBroadcast({
      apiKey,
      eventName: event.name,
      eventDate: event.event_date,
      eventEndDate: event.end_date,
      locationName: event.location?.label ?? event.location?.name ?? 'Location to be announced',
      locationUrl: event.location?.url,
      eventUrl: publicEventDetailsUrl(event, c),
      calendarDownloadUrl: publicRegistrationCalendarUrl(event, c),
      subject: blast.subject,
      body: blast.body,
      from,
      replyTo,
      recipients,
    });
    const prepared = await updateEventBlast(blast.id, {
      status: 'preparing',
      provider_broadcast_id: provider.broadcastId,
      provider_segment_id: provider.segmentId,
    }, c);
    if (!prepared) throw new EventBlastStorageError('blast_not_found_after_prepare');

    await sendResendBroadcast({
      apiKey,
      broadcastId: provider.broadcastId,
      scheduledFor,
    });
    const status = scheduledFor ? 'scheduled' : 'sent';
    const updated = await updateEventBlast(blast.id, {
      status,
      sent_at: scheduledFor ? null : new Date().toISOString(),
    }, c);
    await auditAdminAction(c, {
      action: scheduledFor ? 'event.blast.schedule' : 'event.blast.send',
      targetType: 'event_blast',
      targetId: blast.id,
      metadata: { event_id: event.id, recipient_count: recipients.length, scheduled_for: scheduledFor },
    });
    return c.json({ blast: updated ?? blast, delivery: status }, 201);
  } catch (error) {
    const providerStatus = error instanceof ResendBroadcastError ? error.status : null;
    const status = providerStatus === 402 || providerStatus === 403 || providerStatus === 429
      ? 'needs_capacity'
      : 'failed';
    const updated = await updateEventBlast(blast.id, { status }, c);
    await auditAdminAction(c, {
      action: status === 'needs_capacity' ? 'event.blast.needs_capacity' : 'event.blast.failed',
      targetType: 'event_blast',
      targetId: blast.id,
      metadata: { event_id: event.id, recipient_count: recipients.length, provider_status: providerStatus },
    });
    console.warn(JSON.stringify({
      event: 'event_blast_delayed',
      event_id: event.id,
      blast_id: blast.id,
      recipient_count: recipients.length,
      provider_status: providerStatus,
    }));
    return c.json({
      blast: updated ?? blast,
      delivery: status,
    }, status === 'needs_capacity' ? 202 : 502);
  }
});

app.post('/api/events/:eventId/blasts/:blastId/retry', async (c) => {
  const event = await getEventById(c.req.param('eventId'), c);
  const campaign = event ? await getRegistrationCampaign(event.id, c) : undefined;
  if (!event || !campaign) return c.json({ error: 'Registration campaign not found.' }, 404);

  const blast = (await getEventBlasts(event.id, c)).find((item) => item.id === c.req.param('blastId'));
  if (!blast) return c.json({ error: 'Blast not found.' }, 404);
  if (!blast.provider_broadcast_id || blast.status !== 'failed') {
    return c.json({ error: 'Only a prepared blast that needs attention can be retried.' }, 409);
  }

  const apiKey = envValue('RESEND_BROADCASTS_API_KEY', c)?.trim();
  if (!apiKey) return c.json({ error: 'Email broadcasts are not configured.' }, 503);

  try {
    await sendResendBroadcast({
      apiKey,
      broadcastId: blast.provider_broadcast_id,
      scheduledFor: blast.scheduled_for,
    });
    const status = blast.scheduled_for ? 'scheduled' : 'sent';
    const updated = await updateEventBlast(blast.id, {
      status,
      sent_at: blast.scheduled_for ? null : new Date().toISOString(),
    }, c);
    await auditAdminAction(c, {
      action: 'event.blast.retry',
      targetType: 'event_blast',
      targetId: blast.id,
      metadata: { event_id: event.id, recipient_count: blast.recipient_count },
    });
    return c.json({ blast: updated ?? blast, delivery: status }, 201);
  } catch (error) {
    const providerStatus = error instanceof ResendBroadcastError ? error.status : null;
    const updated = await updateEventBlast(blast.id, { status: 'failed' }, c);
    console.warn(JSON.stringify({
      event: 'event_blast_retry_delayed',
      event_id: event.id,
      blast_id: blast.id,
      provider_status: providerStatus,
    }));
    return c.json({ blast: updated ?? blast, delivery: 'failed' as const }, 502);
  }
});

app.patch('/api/events/:eventId/registrations', async (c) => {
  const eventId = c.req.param('eventId');
  const event = await getEventById(eventId, c);
  const campaign = event ? await getRegistrationCampaign(event.id, c) : undefined;
  if (!event || !campaign) {
    return c.json({ error: 'Registration campaign not found.' }, 404);
  }

  const parsed = eventRegistrationCampaignUpdateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the registration settings.' }, 400);
  }

  if (parsed.data.capacity !== undefined) {
    const registrations = await getEventRegistrations(eventId, c);
    const confirmed = registrations.filter((registration) => registration.status === 'confirmed').length;
    if (parsed.data.capacity < confirmed) {
      return c.json({ error: `Capacity cannot be lower than the ${confirmed} confirmed guests.` }, 409);
    }
  }

  const updated = await updateRegistrationCampaign(eventId, parsed.data, c);
  if (!updated) {
    return c.json({ error: 'Registration campaign not found.' }, 404);
  }
  await auditAdminAction(c, {
    action: 'event.registration_campaign.update',
    targetType: 'event',
    targetId: eventId,
    metadata: parsed.data,
  });
  return c.json(updated);
});

app.post('/api/events/:eventId/registrations/:registrationId/check-in', async (c) => {
  const eventId = c.req.param('eventId');
  const registrations = await getEventRegistrations(eventId, c);
  const registration = registrations.find((item) => item.id === c.req.param('registrationId'));
  if (!registration) {
    return c.json({ error: 'Guest registration not found.' }, 404);
  }
  if (registration.status !== 'confirmed') {
    return c.json({ error: 'Only confirmed guests can be checked in.' }, 409);
  }

  const session = await getAdminSession(c);
  const checkedInAt = await checkInRegistration(
    registration.id,
    session.authenticated ? session.email : null,
    c,
  );
  if (!checkedInAt) {
    return c.json({ error: 'Guest registration not found.' }, 404);
  }
  await auditAdminAction(c, {
    action: 'event.registration.check_in',
    targetType: 'event_registration',
    targetId: registration.id,
    metadata: { event_id: eventId },
  });
  return c.json({ checked_in_at: checkedInAt });
});

app.post('/api/events/:eventId/registrations/:registrationId/cancel', async (c) => {
  const eventId = c.req.param('eventId');
  const event = await getEventById(eventId, c);
  if (!event) {
    return c.json({ error: 'Event not found.' }, 404);
  }
  const registrations = await getEventRegistrations(eventId, c);
  const registration = registrations.find((item) => item.id === c.req.param('registrationId'));
  if (!registration) {
    return c.json({ error: 'Guest registration not found.' }, 404);
  }

  const result = await cancelRegistration(registration.id, c);
  if (!result.cancelled) {
    return c.json({ error: 'Guest registration not found.' }, 404);
  }
  if (result.promotedRegistrationId) {
    await sendPendingRegistrationConfirmationEmails(event, c, {
      registrationId: result.promotedRegistrationId,
      limit: 1,
      kinds: ['promotion'],
    });
  }
  await auditAdminAction(c, {
    action: 'event.registration.cancel',
    targetType: 'event_registration',
    targetId: registration.id,
    metadata: {
      event_id: eventId,
      promoted_registration_id: result.promotedRegistrationId,
    },
  });
  return c.json({
    ok: true,
    promoted_registration_id: result.promotedRegistrationId,
  });
});

app.delete('/api/events/:eventId/registrations/:registrationId', async (c) => {
  const runtime = envValue('NODE_ENV', c)?.trim().toLowerCase();
  if (runtime !== 'development' && runtime !== 'test') {
    return c.json({ error: 'Not found.' }, 404);
  }

  const eventId = c.req.param('eventId');
  const registrations = await getEventRegistrations(eventId, c);
  const registration = registrations.find((item) => item.id === c.req.param('registrationId'));
  if (!registration) {
    return c.json({ error: 'Guest registration not found.' }, 404);
  }

  const deleted = await deleteRegistration(registration.id, c);
  if (!deleted) {
    return c.json({ error: 'Guest registration not found.' }, 404);
  }
  await auditAdminAction(c, {
    action: 'event.registration.dev_delete',
    targetType: 'event_registration',
    targetId: registration.id,
    metadata: { event_id: eventId },
  });
  return c.json({ ok: true });
});

app.post('/api/events/:eventId/registration-emails/process', async (c) => {
  const event = await getEventById(c.req.param('eventId'), c);
  if (!event) {
    return c.json({ error: 'Event not found.' }, 404);
  }
  const result = await sendPendingRegistrationConfirmationEmails(event, c, {
    statuses: ['failed'],
  });
  if (!result.configured) {
    return c.json({ error: 'Registration email sending is not configured.' }, 503);
  }
  await auditAdminAction(c, {
    action: 'event.registration_email.process',
    targetType: 'event',
    targetId: event.id,
    metadata: { accepted_count: result.accepted.length, delayed_count: result.failed.length },
  });
  return c.json({
    accepted_count: result.accepted.length,
    delayed_count: result.failed.length,
  });
});

app.post('/api/events/:eventId/system-design/draft', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  const event = await getEventById(c.req.param('eventId'), c);
  if (!event) {
    return c.json({ error: 'Event not found' }, 404);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = systemDesignDraftRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'A valid prompt_url is required.' }, 400);
  }

  try {
    const draft = await fetchGoogleSlidesDraft({
      promptUrl: parsed.data.prompt_url,
      fallbackTitle: parsed.data.title,
      lead: parsed.data.lead,
    });

    await auditAdminAction(c, {
      action: 'event.system_design.generate_draft',
      targetType: 'event',
      targetId: event.id,
      metadata: {
        prompt_url: parsed.data.prompt_url,
        generated_title: draft.title,
      },
    });

    return c.json(draft);
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : 'Unable to generate a draft from this prompt deck.',
    }, 422);
  }
});

app.post('/api/events/:eventId/system-design/learning-room/questions/generate', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;
  const event = await getEventById(c.req.param('eventId'), c);
  if (!event) return c.json({ error: 'Event not found' }, 404);
  const body = await c.req.json().catch(() => ({}));
  const sessionId = typeof body.session_id === 'string' ? body.session_id : '';
  if (!/^[a-f0-9-]{36}$/i.test(sessionId)) return c.json({ error: 'A valid learning room is required.' }, 400);
  const session = await getQuizSessionById(sessionId);
  if (!session || session.event_id !== event.id || session.purpose !== 'system_design_learning') {
    return c.json({ error: 'This learning room does not belong to the selected System Design session.' }, 409);
  }
  if (session.status === 'waiting' || session.status === 'active') {
    return c.json({ error: 'Finish the current presentation before changing its question set.' }, 409);
  }
  const source = findSystemDesignSource(event.schedule ?? []);
  if (!source) return c.json({ error: 'Add the related System Design prompt link first.' }, 422);

  try {
    const existing = await getQuestionsBySession(session.id);
    const remainingCount = Math.max(0, 5 - existing.length);
    if (remainingCount === 0) return c.json({ questions: [], source_title: source.title });
    const existingText = new Set(existing.map((question) => question.question_text.trim().toLowerCase()));
    const draft = await fetchSystemDesignSourceText(source.url, source.title);
    const questions = generateQuestionDraftsFromText(draft.content, 8)
      .filter((question) => !existingText.has(question.question_text.trim().toLowerCase()))
      .slice(0, remainingCount);
    if (questions.length < remainingCount) return c.json({ error: 'The linked prompt did not contain enough distinct concepts to complete this five-question set.' }, 422);
    const created = await Promise.all(questions.map((question, index) => createQuestion({
      quiz_session_id: session.id,
      question_text: question.question_text,
      options: question.options,
      correct_index: question.correct_index,
      explanation: question.explanation,
      source_url: source.url,
      order_index: existing.length + index,
      time_limit_seconds: 20,
      points: 1000,
    })));
    await auditAdminAction(c, { action: 'system_design.learning_room.generate_questions', targetType: 'quiz_session', targetId: session.id, metadata: { source_url: source.url, created_question_count: created.length } });
    return c.json({ questions: created, source_title: source.title }, 201);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Could not read the related System Design source.' }, 422);
  }
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
    await deleteEvent(eventId, c);
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
        deleted_event_ids: [eventId],
      },
    });

    return c.json({ ok: true });
  } catch (error) {
    return internalErrorResponse(c, 'event_delete_failed', error, 'Unable to remove the event.');
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

  const items = await getEventChecklist(eventId, event.status, event);
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

  try {
    if (typeof body.disabled === 'boolean') {
      const existingItems = await getEventChecklist(eventId, event.status, event);
      const existingItem = existingItems.find((item) => item.id === itemId);

      if (!existingItem) {
        return c.json({ error: 'Checklist item not found' }, 404);
      }

      if (
        event.publish_to_website
        && !canChangeChecklistItemAvailability(existingItem, true)
      ) {
        return c.json({ error: 'Published event checklists cannot be changed this way' }, 409);
      }

      const item = await setEventChecklistItemDisabled(
        eventId,
        itemId,
        body.disabled,
        typeof body.disabled_by === 'string' ? body.disabled_by : 'Organizer',
      );
      const items = await getEventChecklist(eventId, event.status, event);

      await auditAdminAction(c, {
        action: 'event.checklist.disable',
        targetType: 'event',
        targetId: eventId,
        metadata: {
          item_id: itemId,
          label: item.label,
          disabled: Boolean(item.disabled_at),
          event_status: event.status,
        },
      });

      return c.json({
        item,
        event,
        progress: checklistProgress(items),
        items,
      });
    }

    if (typeof body.completed !== 'boolean') {
      return c.json({ error: 'completed is required' }, 400);
    }

    const item = await updateEventChecklistItem(eventId, itemId, {
      completed: body.completed,
      completed_by: typeof body.completed_by === 'string' ? body.completed_by : 'Organizer',
    });
    const eventUpdates = item.completed ? eventUpdatesForCompletedChecklistItem(item) : {};
    const updatedEvent = Object.keys(eventUpdates).length > 0
      ? await updateEvent(eventId, eventUpdates, c)
      : event;
    const items = await getEventChecklist(eventId, updatedEvent.status, updatedEvent);

    await auditAdminAction(c, {
      action: 'event.checklist.update',
      targetType: 'event',
      targetId: eventId,
      metadata: {
        item_id: itemId,
        completed: item.completed,
        changed_event_fields: Object.keys(eventUpdates).sort(),
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
    const parsed = eventUpdateSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid event update.' }, 400);
    }

    const body = parsed.data;
    const eventId = c.req.param('eventId');
    const event = await getEventById(eventId, c);

    if (!event) {
      return c.json({ error: 'Event not found' }, 404);
    }

    if (body.status === 'cfp_open' && !canOpenCfpForEvent(event)) {
      return c.json({ error: 'CFP can only be opened for upcoming monthly events.' }, 409);
    }

    let normalizedLocation = body.location;
    if (body.location) {
      const locationInput = body.location;
      if (Object.prototype.hasOwnProperty.call(locationInput, 'url')) {
        const rawLocationUrl = locationInput.url;
        const locationUrl = rawLocationUrl === null || rawLocationUrl === ''
          ? null
          : safeGoogleMapsUrl(rawLocationUrl);
        if (rawLocationUrl !== null && rawLocationUrl !== '' && !locationUrl) {
          return c.json({ error: 'Location URL must be an HTTPS Google Maps link.' }, 400);
        }
        normalizedLocation = {
          ...locationInput,
          url: locationUrl,
        };
      }
    }

    const updates = {
      ...body,
      ...(body.location ? { location: normalizedLocation } : {}),
      ...(body.cover !== undefined ? { cover: safeWebsiteUrl(body.cover) } : {}),
      ...(body.stream_url !== undefined ? { stream_url: safeHttpUrl(body.stream_url) } : {}),
      ...(body.registration_url !== undefined ? { registration_url: safeWebsiteUrl(body.registration_url) } : {}),
      ...(body.external_url !== undefined ? { external_url: safeHttpUrl(body.external_url) } : {}),
      ...(body.schedule ? { schedule: normalizePublicSchedule(body.schedule) } : {}),
      ...(body.photos ? { photos: normalizeEventPhotos(body.photos) } : {}),
      ...(body.videos ? { videos: normalizeEventVideos(body.videos) } : {}),
    };

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
    return internalErrorResponse(c, 'event_update_failed', error, 'Unable to update the event.');
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
    const contentValidationError = await validateMeetupMediaContent(uploadedFile);
    if (contentValidationError) {
      return c.json({ error: contentValidationError }, 400);
    }

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
  } catch {
    return c.json({ error: 'Failed to upload image' }, 500);
  }
});

type SpeakerTalkIntakeInput = z.infer<typeof speakerTalkIntakeSchema>;

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function speakerIntakeLinkStatus(link: Pick<SpeakerIntakeLink, 'used_at' | 'expires_at'>): 'active' | 'used' | 'expired' {
  if (link.used_at) return 'used';
  return speakerIntakeLinkExpired(link) ? 'expired' : 'active';
}

function speakerIntakeLinkDurationDays(link: Pick<SpeakerIntakeLink, 'created_at' | 'expires_at'>): number | null {
  const createdAt = new Date(link.created_at).getTime();
  const expiresAt = new Date(link.expires_at).getTime();
  if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt)) return null;

  const durationDays = Math.round((expiresAt - createdAt) / (24 * 60 * 60 * 1000));
  return durationDays > 0 ? durationDays : null;
}

function serializeSpeakerIntakeLink(link: Pick<
  SpeakerIntakeLink,
  | 'id'
  | 'event_id'
  | 'event_month'
  | 'kind'
  | 'purpose'
  | 'speaker_submission_id'
  | 'speaker_name'
  | 'speaker_email'
  | 'talk_title'
  | 'email_status'
  | 'email_provider_id'
  | 'email_sent_at'
  | 'email_last_attempt_at'
  | 'email_last_error'
  | 'expires_at'
  | 'used_at'
  | 'used_talk_id'
  | 'created_at'
  | 'updated_at'
>) {
  return {
    id: link.id,
    event_id: link.event_id,
    event_month: link.event_month,
    kind: normalizeArchiveItemKind(link.kind),
    purpose: link.purpose ?? 'archive_backfill',
    speaker_submission_id: link.speaker_submission_id ?? null,
    speaker_name: link.speaker_name ?? null,
    speaker_email: link.speaker_email ?? null,
    talk_title: link.talk_title ?? null,
    token: null,
    email_status: link.email_status ?? null,
    email_provider_id: link.email_provider_id ?? null,
    email_sent_at: link.email_sent_at ?? null,
    email_last_attempt_at: link.email_last_attempt_at ?? null,
    email_last_error: link.email_last_error ?? null,
    expires_at: link.expires_at,
    used_at: link.used_at,
    used_talk_id: link.used_talk_id,
    created_at: link.created_at,
    updated_at: link.updated_at,
    status: speakerIntakeLinkStatus(link),
  };
}

function speakerIntakeLinkError(link: SpeakerIntakeLink | undefined): { error: string; status: 404 | 410 } | null {
  if (!link) {
    return { error: 'Archive request link is invalid', status: 404 };
  }

  if (link.used_at) {
    return { error: 'Archive request link has already been used', status: 410 };
  }

  if (speakerIntakeLinkExpired(link)) {
    return { error: 'Archive request link has expired', status: 410 };
  }

  if (
    (link.purpose ?? 'archive_backfill') === 'archive_backfill'
    && (!link.speaker_name || !link.speaker_email || !link.talk_title?.trim())
  ) {
    return { error: 'This older archive request link cannot verify the invited presentation. Ask an organizer to issue a new link.', status: 410 };
  }

  return null;
}

function selectedSpeakerIntakeLinkError(
  link: SpeakerIntakeLink,
  submission: SpeakerSubmission | null | undefined,
  eventId: string,
): { error: string; status: 410 } | null {
  if (link.purpose !== 'selected_speaker_confirmation') return null;

  const valid = Boolean(
    submission
    && submission.status === 'selected'
    && submission.event_id === eventId
    && submission.selected_intake_link_id === link.id
    && normalizeArchiveItemKind(submission.kind) === normalizeArchiveItemKind(link.kind)
  );

  return valid
    ? null
    : { error: 'This archive completion link is no longer available.', status: 410 };
}

async function acquireSpeakerIntakeSubmissionLock(key: string): Promise<() => void> {
  const previous = speakerIntakeSubmissionLocks.get(key) ?? Promise.resolve();
  let releaseCurrent!: () => void;
  const current = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });
  const queued = previous.then(() => current);
  speakerIntakeSubmissionLocks.set(key, queued);
  await previous;

  return () => {
    releaseCurrent();
    if (speakerIntakeSubmissionLocks.get(key) === queued) {
      speakerIntakeSubmissionLocks.delete(key);
    }
  };
}

function validateSlidesUrl(slidesUrl: string | null): void {
  if (!slidesUrl) return;

  if (!validExternalUrl(slidesUrl)) {
    throw new Error('Resource URL must use http or https');
  }
}

async function createBackfilledTalkForEvent(
  eventId: string,
  data: SpeakerTalkIntakeInput & { publish?: boolean },
): Promise<{ talk: Talk; speakerCreated: boolean }> {
  const slidesUrl = data.slides_url || null;
  validateSlidesUrl(slidesUrl);

  const existingTalks = await getTalksByEvent(eventId);
  const duplicate = existingTalks.find((talk) => (
    normalizeArchiveItemKind(talk.kind) === normalizeArchiveItemKind(data.kind)
    && talk.speaker_email.toLowerCase() === data.speaker_email.toLowerCase()
    && talk.title.trim().toLowerCase() === data.title.toLowerCase()
  ));

  if (duplicate) {
    throw new Error('This archive item already exists for this event');
  }

  let speaker = await getSpeakerByEmail(eventId, data.speaker_email);
  let speakerCreated = false;

  if (!speaker) {
    try {
      speaker = await addSpeaker({
        event_id: eventId,
        email: data.speaker_email,
        name: data.speaker_name,
      });
      speakerCreated = true;
    } catch (error) {
      speaker = await getSpeakerByEmail(eventId, data.speaker_email);
      if (!speaker) throw error;
    }
  }

  const talk = await createTalk({
    event_id: eventId,
    kind: normalizeArchiveItemKind(data.kind),
    speaker_name: data.speaker_name,
    speaker_email: data.speaker_email,
    github_username: data.github_username || null,
    title: data.title,
    topic: data.topic || 'General',
    abstract: data.abstract || null,
    bio: data.bio || null,
    slides_url: slidesUrl,
    slides_type: slidesUrl ? 'url' : null,
    storage_path: null,
    slides_uploaded_at: slidesUrl ? now() : null,
  });
  const status: TalkStatus = data.publish ? 'published' : slidesUrl ? 'slides_received' : 'accepted';

  return {
    talk: await updateTalk(talk.id, { status }),
    speakerCreated,
  };
}

async function createSelectedSpeakerTalkForEvent(
  eventId: string,
  submission: SpeakerSubmission,
  slidesUrl: string,
  linkKind?: ArchiveItemKind,
): Promise<{ talk: Talk; speakerCreated: boolean }> {
  return createBackfilledTalkForEvent(eventId, {
    kind: normalizeArchiveItemKind(linkKind ?? submission.kind),
    speaker_name: submission.speaker_name,
    speaker_email: submission.speaker_email,
    github_username: submission.github_username ?? '',
    title: submission.title,
    topic: submission.topic || 'General',
    abstract: submission.abstract ?? '',
    bio: submission.bio ?? '',
    slides_url: slidesUrl,
  });
}

function serializeSpeakerSubmission(submission: SpeakerSubmission) {
  return {
    ...submission,
    kind: normalizeArchiveItemKind(submission.kind),
  };
}

function speakerSubmissionCounts(submissions: SpeakerSubmission[]): Record<SpeakerSubmissionStatus, number> {
  return submissions.reduce<Record<SpeakerSubmissionStatus, number>>((counts, submission) => {
    counts[submission.status] += 1;
    return counts;
  }, {
    submitted: 0,
    selected: 0,
    not_selected: 0,
    withdrawn: 0,
  });
}

async function createSelectedSpeakerLinkForSubmission(
  submission: SpeakerSubmission,
  expiresInDays: number,
  c: Context,
): Promise<{ link: SpeakerIntakeLink; token: string }> {
  const event = await getEventById(submission.event_id, c);

  if (!event) {
    throw new Error('Event not found');
  }

  return createSpeakerIntakeLink({
    event_id: submission.event_id,
    event_month: eventMonthKey(event.event_date),
    expires_at: addDays(new Date(), expiresInDays).toISOString(),
    kind: normalizeArchiveItemKind(submission.kind),
    purpose: 'selected_speaker_confirmation',
    speaker_submission_id: submission.id,
    speaker_name: submission.speaker_name,
    speaker_email: submission.speaker_email,
    talk_title: submission.title,
  });
}

app.get('/api/events/:eventId/talks', async (c) => {
  return c.json(await getTalksByEvent(c.req.param('eventId')));
});

app.get('/api/events/:eventId/speaker-submissions', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  const eventId = c.req.param('eventId');
  const event = await getEventById(eventId, c);

  if (!event) {
    return c.json({ error: 'Event not found' }, 404);
  }

  const submissions = await getSpeakerSubmissionsByEvent(eventId);

  return c.json({
    event_id: eventId,
    counts: speakerSubmissionCounts(submissions),
    submissions: submissions.map(serializeSpeakerSubmission),
  });
});

app.patch('/api/speaker-submissions/:submissionId', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  const body = await c.req.json().catch(() => ({}));
  const parsed = speakerSubmissionDecisionSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the proposal decision' }, 400);
  }

  const existing = await getSpeakerSubmissionById(c.req.param('submissionId'));

  if (!existing) {
    return c.json({ error: 'Presentation proposal not found' }, 404);
  }

  try {
    let selectedLink: SpeakerIntakeLink | null = null;
    let token: string | null = null;

    if (parsed.data.status === 'selected') {
      const result = await createSelectedSpeakerLinkForSubmission(existing, parsed.data.expires_in_days, c);
      selectedLink = result.link;
      token = result.token;
    }

    const submission = await updateSpeakerSubmission(existing.id, {
      status: parsed.data.status,
      internal_note: parsed.data.internal_note || null,
      selected_intake_link_id: parsed.data.status === 'selected' ? selectedLink?.id ?? null : null,
    });
    await deleteActiveSpeakerIntakeLinksBySubmission(
      existing.event_id,
      existing.id,
      submission.selected_intake_link_id,
    );

    await auditAdminAction(c, {
      action: 'speaker_submission.decision',
      targetType: 'speaker_submission',
      targetId: submission.id,
      metadata: {
        event_id: submission.event_id,
        kind: normalizeArchiveItemKind(submission.kind),
        status: submission.status,
        selected_intake_link_id: submission.selected_intake_link_id,
      },
    });

    return c.json({
      submission: serializeSpeakerSubmission(submission),
      link: selectedLink ? {
        ...serializeSpeakerIntakeLink(selectedLink),
        token,
      } : null,
      token,
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Failed to update presentation proposal' }, 400);
  }
});

app.get('/api/events/:eventId/speaker-intake-links', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  const eventId = c.req.param('eventId');
  const event = await getEventById(eventId, c);

  if (!event) {
    return c.json({ error: 'Event not found' }, 404);
  }

  const links = await getSpeakerIntakeLinksByEvent(eventId);
  return c.json({
    event_month: eventMonthKey(event.event_date),
    links: links.map((link) => serializeSpeakerIntakeLink(link)),
  });
});

app.post('/api/events/:eventId/speaker-intake-links', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  const eventId = c.req.param('eventId');
  const event = await getEventById(eventId, c);

  if (!event) {
    return c.json({ error: 'Event not found' }, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = speakerIntakeLinkRequestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the link expiry' }, 400);
  }

  const existingLinks = await getSpeakerIntakeLinksByEvent(eventId);
  const duplicateActiveSpeaker = existingLinks.some((link) => (
    (link.purpose ?? 'archive_backfill') === 'archive_backfill'
    && speakerIntakeLinkStatus(link) === 'active'
    && normalizeArchiveItemKind(link.kind) === parsed.data.kind
    && link.speaker_email?.toLowerCase() === parsed.data.speaker_email
  ));

  if (duplicateActiveSpeaker) {
    const itemLabel = parsed.data.kind === 'product_demo' ? 'product demo' : 'talk';
    return c.json({
      error: `An active ${itemLabel} archive request already exists for ${parsed.data.speaker_email}.`,
    }, 409);
  }

  const { link, token } = await createSpeakerIntakeLink({
    event_id: eventId,
    event_month: eventMonthKey(event.event_date),
    expires_at: addDays(new Date(), parsed.data.expires_in_days).toISOString(),
    kind: parsed.data.kind,
    speaker_name: parsed.data.speaker_name,
    speaker_email: parsed.data.speaker_email,
    talk_title: parsed.data.title,
  });

  await auditAdminAction(c, {
    action: 'speaker_intake_link.create',
    targetType: 'speaker_intake_link',
    targetId: link.id,
    metadata: {
      event_id: eventId,
      event_month: link.event_month,
      kind: normalizeArchiveItemKind(link.kind),
      speaker_email: link.speaker_email,
      expires_at: link.expires_at,
    },
  });

  return c.json({
    link: {
      ...serializeSpeakerIntakeLink(link),
      token,
    },
    token,
  }, 201);
});

app.post('/api/events/:eventId/speaker-intake-emails', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  const resendApiKey = envValue('RESEND_API_KEY', c)?.trim();
  const emailFrom = EMAIL_SENDERS.speakers.from;
  const emailReplyTo = envValue('SPEAKER_EMAIL_REPLY_TO', c)?.trim();
  if (!resendApiKey || !emailReplyTo || !z.string().email().safeParse(emailReplyTo).success) {
    return c.json({ error: 'Speaker email sending is not configured.' }, 503);
  }

  const eventId = c.req.param('eventId');
  const event = await getEventById(eventId, c);
  if (!event) {
    return c.json({ error: 'Event not found' }, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = speakerIntakeEmailBatchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the selected speakers' }, 400);
  }

  const releaseEmailSendLock = await acquireSpeakerIntakeSubmissionLock(`archive-email:${eventId}`);
  try {
    const existingLinks = await getSpeakerIntakeLinksByEvent(eventId);
    const programItemsByIndex = new Map(
      archiveRequestProgramItems(event.schedule).map((item) => [item.index, item]),
    );
    const recipients = parsed.data.recipients.map((recipient) => {
      const item = programItemsByIndex.get(recipient.program_item_index);
      if (!item) {
        return {
          index: recipient.program_item_index,
          item: null,
          speakerEmail: recipient.speaker_email,
        };
      }

      return {
        index: recipient.program_item_index,
        item,
        speakerEmail: recipient.speaker_email,
      };
    });
    const invalidProgramItem = recipients.find((recipient) => !recipient.item);
    if (invalidProgramItem) {
      return c.json({ error: 'One of the selected program items is no longer available.' }, 400);
    }

    const workingLinks = [...existingLinks];
    const pendingSends: {
      link: SpeakerIntakeLink;
      token: string;
      item: NonNullable<(typeof recipients)[number]['item']>;
    }[] = [];
    const alreadyAccepted: SpeakerIntakeLink[] = [];

    for (const recipient of recipients) {
      const item = recipient.item!;
      const speakerEmail = recipient.speakerEmail;
      const matchingItemLinks = workingLinks.filter((link) => (
        (link.purpose ?? 'archive_backfill') === 'archive_backfill'
        && sameArchiveProgramItemIdentity(link, {
          kind: item.kind,
          speakerName: item.speakerName,
          title: item.title,
        })
      ));
      const acceptedLink = matchingItemLinks.find((link) => link.email_status === 'accepted');
      if (acceptedLink) {
        alreadyAccepted.push(acceptedLink);
        continue;
      }

      for (const failedLink of matchingItemLinks.filter((link) => link.email_status === 'failed' && !link.used_at)) {
        await deleteSpeakerIntakeLink(eventId, failedLink.id);
      }

      const created = await createSpeakerIntakeLink({
        event_id: eventId,
        event_month: eventMonthKey(event.event_date),
        expires_at: addDays(new Date(), parsed.data.expires_in_days).toISOString(),
        kind: item.kind,
        purpose: 'archive_backfill',
        speaker_name: item.speakerName,
        speaker_email: speakerEmail,
        talk_title: item.title,
      });
      workingLinks.push(created.link);
      pendingSends.push({ link: created.link, token: created.token, item });
    }

    if (pendingSends.length === 0) {
      return c.json({
        sent_count: 0,
        already_sent_count: alreadyAccepted.length,
        links: alreadyAccepted.map((link) => serializeSpeakerIntakeLink(link)),
      });
    }

    const linkIds = pendingSends.map(({ link }) => link.id).sort();
    const idempotencyDigest = crypto.createHash('sha256')
      .update(`${eventId}:${linkIds.join(':')}`)
      .digest('hex');
    const idempotencyKey = `speaker-archive-${idempotencyDigest}`;
    await updateSpeakerIntakeLinkEmailDeliveries(eventId, pendingSends.map(({ link }) => ({
      id: link.id,
      status: 'pending',
      idempotency_key: idempotencyKey,
    })));

    const emails = pendingSends.map(({ link, token, item }) => {
      const privateUrl = new URL(
        `/speaker-talks/${encodeURIComponent(eventId)}/${encodeURIComponent(token)}`,
        publicAppOrigin(c),
      ).toString();
      const content = monthlyArchiveRequestEmail({
        eventName: event.name,
        speakerName: item.speakerName,
        talkTitle: item.title,
        privateUrl,
        expiresAt: link.expires_at,
      });

      return {
        from: emailFrom,
        to: [link.speaker_email!],
        reply_to: emailReplyTo,
        ...content,
      };
    });

    let providerIds: string[];
    try {
      const result = await sendResendEmailBatch({
        apiKey: resendApiKey,
        idempotencyKey,
        emails,
      });
      providerIds = result.ids;
    } catch (error) {
      await updateSpeakerIntakeLinkEmailDeliveries(eventId, pendingSends.map(({ link }) => ({
        id: link.id,
        status: 'failed',
        idempotency_key: idempotencyKey,
        error: 'Resend did not accept this email.',
      })));
      console.warn(JSON.stringify({
        event: 'speaker_archive_email_failed',
        event_id: eventId,
        recipient_count: pendingSends.length,
        provider_status: error instanceof ResendBatchError ? error.status : null,
      }));
      return c.json({
        error: 'The email provider did not accept the request. No successful send was recorded; you can retry.',
        sent_count: 0,
        already_sent_count: alreadyAccepted.length,
      }, 502);
    }

    const acceptedLinks = await updateSpeakerIntakeLinkEmailDeliveries(eventId, pendingSends.map(({ link }, index) => ({
      id: link.id,
      status: 'accepted',
      provider_id: providerIds[index],
      idempotency_key: idempotencyKey,
    })));
    await auditAdminAction(c, {
      action: 'speaker_intake_email.batch_send',
      targetType: 'event',
      targetId: eventId,
      metadata: {
        event_month: eventMonthKey(event.event_date),
        accepted_count: acceptedLinks.length,
        already_sent_count: alreadyAccepted.length,
      },
    });

    return c.json({
      sent_count: acceptedLinks.length,
      already_sent_count: alreadyAccepted.length,
      links: acceptedLinks.map((link) => serializeSpeakerIntakeLink(link)),
    });
  } finally {
    releaseEmailSendLock();
  }
});

app.delete('/api/events/:eventId/speaker-intake-links/:linkId', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  const eventId = c.req.param('eventId');
  const linkId = c.req.param('linkId');
  const event = await getEventById(eventId, c);

  if (!event) {
    return c.json({ error: 'Event not found' }, 404);
  }

  try {
    const link = await deleteSpeakerIntakeLink(eventId, linkId);
    await auditAdminAction(c, {
      action: 'speaker_intake_link.delete',
      targetType: 'speaker_intake_link',
      targetId: link.id,
      metadata: {
        event_id: eventId,
        event_month: link.event_month,
        status: speakerIntakeLinkStatus(link),
      },
    });

    return c.json({ deleted: true });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Failed to remove archive request link' }, 404);
  }
});

app.get('/api/events/:eventId/speaker-intake/:token', async (c) => {
  const eventId = c.req.param('eventId');
  const token = c.req.param('token');
  const event = await getEventById(eventId, c);

  if (!event) {
    return c.json({ error: 'Event not found' }, 404);
  }

  const link = await getSpeakerIntakeLinkByToken(eventId, token);
  const linkError = speakerIntakeLinkError(link);

  if (linkError) {
    return c.json({ error: linkError.error }, linkError.status);
  }

  const submission = link!.speaker_submission_id
    ? await getSpeakerSubmissionById(link!.speaker_submission_id)
    : null;
  const selectedLinkError = selectedSpeakerIntakeLinkError(link!, submission, eventId);

  if (selectedLinkError) {
    return c.json({ error: selectedLinkError.error }, selectedLinkError.status);
  }

  return c.json({
    event: {
      id: event.id,
      name: event.name,
      description: event.description,
      event_date: event.event_date,
      status: event.status,
    },
    link: serializeSpeakerIntakeLink(link!),
    prefill: {
      speaker_name: submission?.speaker_name ?? link!.speaker_name ?? '',
      speaker_email: submission?.speaker_email ?? link!.speaker_email ?? '',
      github_username: submission?.github_username ?? '',
      title: submission?.title ?? link!.talk_title ?? '',
      topic: submission?.topic ?? '',
      abstract: submission?.abstract ?? '',
      bio: submission?.bio ?? '',
    },
  });
});

app.post('/api/events/:eventId/speaker-intake/:token', async (c) => {
  const eventId = c.req.param('eventId');
  const token = c.req.param('token');
  const rateLimitError = await enforcePublicRateLimit(c, {
    action: `speaker_intake:${eventId}`,
    clientKey: `${publicClientKey(c)}:${token}`,
    maxAttempts: 10,
    windowSeconds: 60 * 60,
  }, 'This private form has received several attempts. Please try again later.');
  if (rateLimitError) return rateLimitError;

  const event = await getEventById(eventId, c);

  if (!event) {
    return c.json({ error: 'Event not found' }, 404);
  }

  const releaseSubmissionLock = await acquireSpeakerIntakeSubmissionLock(`${eventId}:${token}`);
  try {
    const link = await getSpeakerIntakeLinkByToken(eventId, token);
    const linkError = speakerIntakeLinkError(link);

    if (linkError) {
      return c.json({ error: linkError.error }, linkError.status);
    }

    const activeLink = link!;
    const body = await c.req.json().catch(() => ({}));
    const selectedSpeakerLink = activeLink.purpose === 'selected_speaker_confirmation';
    const selectedSubmission = selectedSpeakerLink && activeLink.speaker_submission_id
      ? await getSpeakerSubmissionById(activeLink.speaker_submission_id)
      : null;
    const selectedLinkError = selectedSpeakerIntakeLinkError(activeLink, selectedSubmission, eventId);

    if (selectedLinkError) {
      return c.json({ error: selectedLinkError.error }, selectedLinkError.status);
    }

    let claimId: string | null = null;
    try {
      const claim = await claimSpeakerIntakeLink(eventId, token);
      claimId = claim.claimId;
      let talk: Talk;

      if (selectedSpeakerLink) {
        const parsed = selectedSpeakerSlidesSchema.safeParse(body);
        if (!parsed.success) {
          return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the resource link' }, 400);
        }

        const result = await createSelectedSpeakerTalkForEvent(
          eventId,
          selectedSubmission!,
          parsed.data.slides_url,
          normalizeArchiveItemKind(activeLink.kind),
        );
        talk = result.talk;
      } else {
        const parsed = speakerBackfillDetailsSchema.safeParse(body);
        if (!parsed.success) {
          return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the archive item details' }, 400);
        }

        if (!activeLink.speaker_name || !activeLink.speaker_email || !activeLink.talk_title?.trim()) {
          return c.json({ error: 'This archive request link cannot verify the invited presentation. Ask an organizer to issue a new link.' }, 410);
        }

        const result = await createBackfilledTalkForEvent(eventId, {
          ...parsed.data,
          kind: normalizeArchiveItemKind(activeLink.kind),
          speaker_name: activeLink.speaker_name,
          speaker_email: activeLink.speaker_email,
          title: activeLink.talk_title,
        });
        talk = result.talk;
      }

      try {
        await consumeSpeakerIntakeLink(eventId, token, talk.id, claimId);
      } catch (error) {
        await deleteTalk(talk.id);
        throw error;
      }
      claimId = null;
      if (selectedSubmission) {
        await updateSpeakerSubmission(selectedSubmission.id, {
          selected_talk_id: talk.id,
        });
      }
      return c.json(talk, 201);
    } catch (error) {
      await releaseSpeakerIntakeLinkClaim(eventId, token, claimId);
      const message = error instanceof Error ? error.message : 'Failed to submit archive item details';
      const status = message.includes('already been submitted') || message.includes('already exists')
        ? 409
        : message.includes('already been used') || message.includes('expired')
          ? 410
          : message.includes('already being submitted')
            ? 409
          : 400;
      return c.json({
        error: status === 400 ? 'Unable to submit archive item details. Please check the form and try again.' : message,
      }, status);
    }
  } finally {
    releaseSubmissionLock();
  }
});

app.post('/api/events/:eventId/talks', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  const eventId = c.req.param('eventId');
  const event = await getEventById(eventId, c);

  if (!event) {
    return c.json({ error: 'Event not found' }, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = adminCreateTalkSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the archive item details' }, 400);
  }

  try {
    const { talk: updatedTalk, speakerCreated } = await createBackfilledTalkForEvent(eventId, parsed.data);

    await auditAdminAction(c, {
      action: 'talk.manual.create',
      targetType: 'talk',
      targetId: updatedTalk.id,
      metadata: {
        event_id: eventId,
        kind: normalizeArchiveItemKind(updatedTalk.kind),
        status: updatedTalk.status,
        speaker_email: updatedTalk.speaker_email,
        speaker_allowlist_created: speakerCreated,
        slides_url_present: Boolean(updatedTalk.slides_url),
      },
    });

    return c.json(updatedTalk, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to add archive item';
    return c.json({
      error: message,
    }, message.includes('already been submitted') || message.includes('already exists') ? 409 : 400);
  }
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
    return internalErrorResponse(c, 'event_speaker_remove_failed', error, 'Unable to remove the speaker.');
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
  const talkId = c.req.param('talkId');
  const requestedStatus = typeof body.status === 'string' ? body.status : null;

  if (requestedStatus) {
    const adminError = await requireAdmin(c);
    if (adminError) return adminError;

    if (!['accepted', 'rejected', 'slides_received', 'published'].includes(requestedStatus)) {
      return c.json({ error: 'Unsupported talk status' }, 400);
    }

    updates.status = requestedStatus;
  }

  if (body.slides_url) {
    if (typeof body.slides_url !== 'string' || !validExternalUrl(body.slides_url)) {
      return c.json({ error: 'Resource URL must use http or https' }, 400);
    }

    updates.slides_url = body.slides_url;
    updates.slides_type = 'url';
    updates.storage_path = null;
    updates.slides_uploaded_at = now();
    if (!requestedStatus) {
      const existingTalk = await getTalkById(talkId);
      if (!existingTalk) return c.json({ error: 'Talk not found' }, 404);
      if (!['accepted', 'slides_received', 'published'].includes(existingTalk.status)) {
        return c.json({ error: 'Slides can only be updated for accepted or published talks' }, 400);
      }
      updates.status = existingTalk.status === 'published' ? 'published' : 'slides_received';
    }
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ error: 'No supported talk updates provided' }, 400);
  }

  try {
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
    return internalErrorResponse(c, 'talk_update_failed', error, 'Unable to update the archive item.');
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

app.post('/api/cfp', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = speakerSubmissionCreateSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the presentation proposal' }, 400);
  }

  const turnstileError = await requirePublicTurnstile(c, {
    token: parsed.data.turnstile_token,
    submittedAction: parsed.data.turnstile_action,
    expectedAction: CFP_SUBMISSION_TURNSTILE_ACTION,
  });
  if (turnstileError) return turnstileError;

  const rateLimitError = await enforcePublicRateLimit(c, {
    action: `cfp_submission:${parsed.data.event_id}`,
    clientKey: publicClientKey(c),
    maxAttempts: 5,
    windowSeconds: 60 * 60,
  }, 'This device has sent several proposals. Please try again later.');
  if (rateLimitError) return rateLimitError;

  const event = await getEventById(parsed.data.event_id, c);
  if (!event) {
    return c.json({ error: 'Event not found' }, 404);
  }

  if (event.status !== 'cfp_open') {
    return c.json({ error: 'CFP is not open for this event' }, 400);
  }

  if (!canOpenCfpForEvent(event)) {
    return c.json({ error: 'CFP is only available for upcoming monthly events' }, 400);
  }

  try {
    await createSpeakerSubmission({
      event_id: parsed.data.event_id,
      kind: parsed.data.kind,
      speaker_name: parsed.data.speaker_name,
      speaker_email: parsed.data.speaker_email,
      github_username: parsed.data.github_username || null,
      title: parsed.data.title,
      topic: parsed.data.topic || 'General',
      abstract: parsed.data.abstract || null,
      bio: parsed.data.bio || null,
    });

    return c.json({
      accepted: true,
      message: 'If this proposal is eligible, it has been added for organizer review.',
    }, 202);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to submit presentation proposal';
    if (message.includes('already been submitted')) {
      return c.json({
        accepted: true,
        message: 'If this proposal is eligible, it has been added for organizer review.',
      }, 202);
    }
    return c.json({ error: 'The proposal could not be submitted. Please check the form and try again.' }, 400);
  }
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

async function expireQuizSessionIfNeeded(session: QuizSession, c: Context) {
  if (session.purpose === 'system_design_learning' || session.status === 'finished' || !session.expires_at || new Date(session.expires_at).getTime() > Date.now()) {
    return session;
  }

  return updateQuizSession(session.id, {
    status: 'finished',
    question_phase: null,
    finished_at: new Date().toISOString(),
  });
}

app.get('/api/quiz/sessions', async (c) => {
  const eventId = c.req.query('eventId');
  const purpose = c.req.query('purpose');
  const sessions = eventId ? await getQuizSessionsByEvent(eventId) : await getAllQuizSessions();
  return c.json(sessions.filter((session) => purpose === 'system_design_learning'
    ? session.purpose === 'system_design_learning'
    : session.purpose !== 'system_design_learning'));
});

app.post('/api/quiz/sessions', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  const { event_id, purpose } = await c.req.json();
  if (!event_id) {
    return c.json({ error: 'event_id is required' }, 400);
  }
  const event = await getEventById(String(event_id), c);
  if (!event) return c.json({ error: 'Event not found' }, 404);
  const sessionPurpose = purpose === 'system_design_learning' ? 'system_design_learning' : 'quiz';
  if (sessionPurpose === 'system_design_learning') {
    const systemDesignSource = findSystemDesignSource(event.schedule ?? []);
    if (!systemDesignSource) {
      return c.json({ error: 'Add the related System Design prompt link before creating the learning room.' }, 422);
    }
  }
  const session = await createQuizSession({
    event_id,
    expires_at: sessionPurpose === 'system_design_learning' ? null : event.end_date ?? null,
    purpose: sessionPurpose,
  });
  await auditAdminAction(c, {
    action: 'quiz.session.create',
    targetType: 'quiz_session',
    targetId: session.id,
    metadata: { event_id },
  });
  return c.json(session, 201);
});

app.get('/api/quiz/sessions/:sessionId', async (c) => {
  const existing = await getQuizSessionById(c.req.param('sessionId'));
  const session = existing ? await expireQuizSessionIfNeeded(existing, c) : undefined;
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
    const parsed = quizSessionUpdateSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid quiz session update.' }, 400);
    }
    const session = await updateQuizSession(sessionId, parsed.data);
    await auditAdminAction(c, {
      action: 'quiz.session.update',
      targetType: 'quiz_session',
      targetId: sessionId,
      metadata: { changed_fields: Object.keys(parsed.data).sort(), status: session.status },
    });
    return c.json(session);
  } catch (error) {
    return internalErrorResponse(c, 'quiz_session_update_failed', error, 'Unable to update the quiz session.');
  }
});

app.post('/api/quiz/sessions/:sessionId/presentation', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  const session = await getQuizSessionById(c.req.param('sessionId'));
  if (!session) return c.json({ error: 'Session not found' }, 404);
  if (session.purpose !== 'system_design_learning') {
    return c.json({ error: 'Only System Design learning rooms can use this presentation flow.' }, 409);
  }

  const questions = await getQuestionsBySession(session.id);
  if (questions.length !== 5) {
    return c.json({ error: 'Review a complete set of five questions before opening the presentation view.' }, 409);
  }

  if (session.status === 'waiting' || session.status === 'active') {
    return c.json(session);
  }

  const prepared = await prepareSystemDesignPresentationRun(session, questions);
  await auditAdminAction(c, {
    action: 'system_design.learning_room.open_presentation',
    targetType: 'quiz_session',
    targetId: session.id,
    metadata: { removed_participant_count: prepared.removedParticipants, removed_response_count: prepared.removedResponses },
  });
  return c.json(prepared.session);
});

app.post('/api/quiz/sessions/:sessionId/release', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  const existing = await getQuizSessionById(c.req.param('sessionId'));
  if (!existing) return c.json({ error: 'Session not found' }, 404);
  const session = await expireQuizSessionIfNeeded(existing, c);
  if (session.status === 'finished') return c.json({ error: 'This live session has ended.' }, 409);

  try {
    const hostedSession = session.purpose === 'system_design_learning'
      ? await releaseNextSystemDesignQuestion(session.id)
      : null;
    if (hostedSession) {
      const latestQuestionId = hostedSession.released_question_ids?.at(-1) ?? null;
      await auditAdminAction(c, {
        action: 'quiz.question.release', targetType: 'quiz_session', targetId: session.id,
        metadata: { question_id: latestQuestionId, released_count: hostedSession.released_question_ids?.length ?? 0 },
      });
      return c.json(hostedSession);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('all_questions_released')) {
      return c.json({ error: 'All prepared questions have been released.' }, 409);
    }
    if (message.includes('session_finished')) {
      return c.json({ error: 'This live session has ended.' }, 409);
    }
    throw error;
  }

  const questions = await getQuestionsBySession(session.id);
  const releasedQuestionIds = session.released_question_ids ?? [];
  const question = nextUnreleasedLearningQuestion(questions, releasedQuestionIds);
  if (!question) return c.json({ error: 'All prepared questions have been released.' }, 409);

  const updated = await updateQuizSession(session.id, {
    status: 'active',
    current_question_index: question.order_index,
    question_phase: 'answering',
    question_started_at: new Date().toISOString(),
    phase_started_at: new Date().toISOString(),
    started_at: session.started_at ?? new Date().toISOString(),
    released_question_ids: [...releasedQuestionIds, question.id],
  });
  await auditAdminAction(c, {
    action: 'quiz.question.release', targetType: 'quiz_session', targetId: session.id,
    metadata: { question_id: question.id, released_count: updated.released_question_ids?.length ?? 0 },
  });
  return c.json(updated);
});

app.post('/api/quiz/sessions/:sessionId/reveal', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;
  const existing = await getQuizSessionById(c.req.param('sessionId'));
  if (!existing) return c.json({ error: 'Session not found' }, 404);
  const session = await expireQuizSessionIfNeeded(existing, c);
  if (session.status !== 'active' || session.question_phase !== 'answering') {
    return c.json({ error: 'There is no question ready to reveal.' }, 409);
  }
  try {
    const hostedSession = session.purpose === 'system_design_learning'
      ? await revealSystemDesignQuestion(session.id)
      : null;
    if (hostedSession) return c.json(hostedSession);
  } catch (error) {
    if (error instanceof Error && error.message.includes('question_not_ready_to_reveal')) {
      return c.json({ error: 'There is no question ready to reveal.' }, 409);
    }
    throw error;
  }
  return c.json(await updateQuizSession(session.id, { question_phase: 'revealing', phase_started_at: new Date().toISOString() }));
});

app.post('/api/quiz/questions', async (c) => {
  const adminError = await requireAdmin(c);
  if (adminError) return adminError;

  const body = await c.req.json();
  const { quiz_session_id, question_text, explanation, options, correct_index, order_index, time_limit_seconds, points } = body;

  if (!quiz_session_id || !question_text || !Array.isArray(options) || correct_index === undefined || order_index === undefined) {
    return c.json({ error: 'quiz_session_id, question_text, options, correct_index, and order_index are required' }, 400);
  }

  const targetSession = await getQuizSessionById(String(quiz_session_id));
  if (!targetSession) return c.json({ error: 'Session not found' }, 404);
  const explanationRequired = targetSession.purpose === 'system_design_learning';
  const validationError = validateQuestionPayload(
    question_text,
    options,
    Number(correct_index),
    explanation,
    explanationRequired,
  );
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
    explanation: explanation === undefined ? null : String(explanation).trim(),
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
    console.error(JSON.stringify({
      event: 'pdf_extraction_failed',
      error_name: safeErrorName(error),
    }));
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
    const targetSession = await getQuizSessionById(existingQuestion.quiz_session_id);
    const explanationRequired = targetSession?.purpose === 'system_design_learning';

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
    if (body.time_limit_seconds !== undefined) {
      const timeLimitSeconds = Number(body.time_limit_seconds);
      if (!Number.isInteger(timeLimitSeconds) || timeLimitSeconds < 5 || timeLimitSeconds > 300) {
        return c.json({ error: 'time_limit_seconds must be a whole number between 5 and 300' }, 400);
      }
      if (targetSession?.status === 'active') {
        return c.json({ error: 'Question timers cannot be changed after the presentation starts.' }, 409);
      }
      updates.time_limit_seconds = timeLimitSeconds;
    }
    if (body.points !== undefined) updates.points = Number(body.points);
    if (body.explanation !== undefined) updates.explanation = String(body.explanation).trim();

    if (body.question_text !== undefined || body.options !== undefined || body.correct_index !== undefined || body.explanation !== undefined) {
      const validationError = validateQuestionPayload(
        updates.question_text ?? existingQuestion.question_text,
        updates.options ?? existingQuestion.options,
        updates.correct_index ?? existingQuestion.correct_index,
        updates.explanation ?? existingQuestion.explanation,
        explanationRequired,
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
    return internalErrorResponse(c, 'quiz_question_update_failed', error, 'Unable to update the quiz question.');
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
    return internalErrorResponse(c, 'quiz_question_delete_failed', error, 'Unable to remove the quiz question.');
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
  const parsed = quizJoinSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'A valid join code and device are required' }, 400);
  }
  const { join_code, device_id, nickname, purpose } = parsed.data;

  const clientRateLimitError = await enforcePublicRateLimit(c, {
    action: 'quiz_join_client',
    clientKey: publicClientKey(c),
    maxAttempts: 240,
    windowSeconds: 60,
  }, 'Too many room joins were attempted from this network. Please wait a moment.');
  if (clientRateLimitError) return clientRateLimitError;

  const deviceRateLimitError = await enforcePublicRateLimit(c, {
    action: 'quiz_join_device',
    clientKey: `${device_id}:${join_code}`,
    maxAttempts: 12,
    windowSeconds: 60,
  }, 'Too many room joins were attempted from this device. Please wait a moment.');
  if (deviceRateLimitError) return deviceRateLimitError;

  const foundSession = await getQuizSessionByCode(join_code);
  const session = foundSession ? await expireQuizSessionIfNeeded(foundSession, c) : undefined;
  if (!session) {
    return c.json({ error: 'Invalid join code' }, 404);
  }

  if (session.status === 'finished') {
    return c.json({ error: 'This quiz has already finished' }, 400);
  }

  if (purpose === 'system_design_learning' && session.purpose !== 'system_design_learning') {
    return c.json({ error: 'This code is not for a System Design learning room.' }, 404);
  }

  const systemDesignLearningRoom = session.purpose === 'system_design_learning';
  const requestedNickname = nickname.slice(0, 20);
  if (!systemDesignLearningRoom && !requestedNickname) {
    return c.json({ error: 'Enter a nickname to join this quiz.', code: 'nickname_required' }, 400);
  }

  let user = await getUserByDeviceId(device_id);
  const existingParticipant = user
    ? await getQuizParticipantBySessionAndUser(session.id, user.id)
    : undefined;
  if (existingParticipant && user) {
    return c.json({
      session_id: session.id,
      user_id: user.id,
      participant_id: existingParticipant.id,
      purpose: session.purpose ?? 'quiz',
      display_name: existingParticipant.nickname_used,
      avatar_seed: existingParticipant.id,
    });
  }

  const participants = systemDesignLearningRoom
    ? await getQuizParticipantsBySession(session.id)
    : [];
  let participantNickname = requestedNickname;

  if (systemDesignLearningRoom) {
    participantNickname = generateParticipantAlias(participants.map((participant) => participant.nickname_used));
  }

  if (!user) {
    user = await createUser({ device_id, nickname: participantNickname });
  }

  let participant: QuizParticipant | undefined;
  if (systemDesignLearningRoom) {
    const maxAliasAttempts = 8;
    for (let attempt = 0; attempt < maxAliasAttempts; attempt += 1) {
      try {
        participant = await createQuizParticipant({
          quiz_session_id: session.id,
          user_id: user.id,
          nickname_used: participantNickname,
        }, { enforceUniqueName: true });
        break;
      } catch (error) {
        if (!(error instanceof QuizParticipantNicknameTakenError)) throw error;
        const latestParticipants = await getQuizParticipantsBySession(session.id);
        participantNickname = generateParticipantAlias(
          latestParticipants.map((roomParticipant) => roomParticipant.nickname_used),
        );
      }
    }

  } else {
    participant = await createQuizParticipant({
      quiz_session_id: session.id,
      user_id: user.id,
      nickname_used: participantNickname,
    });
  }
  if (!participant) {
    return c.json({ error: 'We could not reserve a unique room name. Please try joining again.' }, 409);
  }
  await updateUser(user.id, {
    events_participated: user.events_participated + 1,
  });

  return c.json({
    session_id: session.id,
    user_id: user.id,
    participant_id: participant.id,
    purpose: session.purpose ?? 'quiz',
    display_name: participant.nickname_used,
    avatar_seed: participant.id,
  });
});

app.patch('/api/quiz/participants/:participantId/name', async (c) => {
  const participantId = c.req.param('participantId');
  const parsed = quizParticipantNameSchema.safeParse(await c.req.json().catch(() => null));
  const deviceId = parsed.success ? parsed.data.device_id : '';
  const nickname = parsed.success ? validateParticipantDisplayName(parsed.data.nickname) : null;

  if (!/^[a-f0-9-]{36}$/i.test(participantId) || !/^[a-f0-9-]{36}$/i.test(deviceId)) {
    return c.json({ error: 'A valid participant and device are required.' }, 400);
  }
  if (!nickname) {
    return c.json({ error: 'Use 1–24 letters, numbers, spaces, apostrophes, periods, or hyphens.', code: 'invalid_nickname' }, 400);
  }

  const rateLimitError = await enforcePublicRateLimit(c, {
    action: 'system-design-participant-name',
    clientKey: `${participantId}:${deviceId}`,
    maxAttempts: 12,
    windowSeconds: 60,
  }, 'Too many name changes. Please wait a moment and try again.');
  if (rateLimitError) return rateLimitError;

  const participant = await getQuizParticipantById(participantId);
  if (!participant) return c.json({ error: 'Participant not found.' }, 404);

  const [session, user] = await Promise.all([
    getQuizSessionById(participant.quiz_session_id),
    getUserById(participant.user_id),
  ]);
  if (!session || session.purpose !== 'system_design_learning') {
    return c.json({ error: 'Participant not found.' }, 404);
  }
  if (!user || user.device_id !== deviceId) {
    return c.json({ error: 'This participant belongs to another device.' }, 403);
  }
  if (session.status !== 'waiting' && session.status !== 'draft') {
    return c.json({ error: 'Names can only be edited before the presentation starts.', code: 'name_edit_closed' }, 409);
  }

  const result = await renameQuizParticipant(participant.id, session.id, nickname);
  if (result.nicknameTaken) {
    return c.json({ error: 'That name is already in use in this room.', code: 'nickname_taken' }, 409);
  }
  if (!result.participant) return c.json({ error: 'Participant not found.' }, 404);

  return c.json({
    display_name: result.participant.nickname_used,
    avatar_seed: result.participant.id,
  });
});

app.post('/api/quiz/answer', async (c) => {
  const parsed = quizAnswerSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'A valid session, participant device, and answer are required' }, 400);
  }
  const { session_id, user_id, device_id, answer_index } = parsed.data;

  const rateLimitError = await enforcePublicRateLimit(c, {
    action: 'quiz_answer',
    clientKey: `${session_id}:${user_id}:${device_id}`,
    maxAttempts: 12,
    windowSeconds: 60,
  }, 'Too many answers were submitted. Please wait a moment.');
  if (rateLimitError) return rateLimitError;

  if (!await quizDeviceOwnsUser(user_id, device_id)) {
    return c.json({ error: 'This participant belongs to another device.' }, 403);
  }

  const foundSession = await getQuizSessionById(session_id);
  const session = foundSession ? await expireQuizSessionIfNeeded(foundSession, c) : undefined;
  if (!session || session.status !== 'active') {
    return c.json({ error: 'Quiz is not active' }, 400);
  }

  if (session.question_phase !== 'answering') {
    return c.json({ error: 'Question is not accepting answers' }, 400);
  }

  try {
    const atomicResult = await submitQuizAnswerAtomically(session_id, user_id, answer_index);
    if (atomicResult) {
      const user = await getUserById(user_id);
      if (user && !user.merged_into_user_id) {
        await updateUser(user.id, { total_points: user.total_points + atomicResult.points_awarded });
      }
      return c.json(session.purpose === 'system_design_learning'
        ? { accepted: true }
        : atomicResult);
    }
  } catch (error) {
    if (error instanceof QuizAnswerConflictError) {
      const messageByReason = {
        already_answered: 'Already answered this question',
        not_accepting: 'Question is not accepting answers',
        too_late: 'Answer submitted too late',
        participant_missing: 'Participant not found',
      } as const;
      return c.json({ error: messageByReason[error.reason] }, 400);
    }
    throw error;
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

  return c.json(session.purpose === 'system_design_learning'
    ? { accepted: true }
    : {
      is_correct: isCorrect,
      points_awarded: totalPoints,
      correct_index: currentQuestion.correct_index,
      streak_count: newStreak,
    });
});

app.get('/api/quiz/state', async (c) => {
  const parsed = quizStateQuerySchema.safeParse({
    sessionId: c.req.query('sessionId'),
    userId: c.req.query('userId'),
    presenter: c.req.query('presenter'),
  });
  if (!parsed.success) {
    return c.json({ error: 'A valid session and participant device are required.' }, 400);
  }
  const { sessionId, userId } = parsed.data;
  const presenterStateRequested = parsed.data.presenter === 'true';
  const deviceId = z.string().uuid().safeParse(c.req.header('x-quiz-device-id'));

  if (presenterStateRequested) {
    const adminError = await requireAdmin(c);
    if (adminError) return adminError;
  } else if (userId && (
    !deviceId.success
    || !await quizDeviceOwnsUser(userId, deviceId.data)
  )) {
    return c.json({ error: 'This participant belongs to another device.' }, 403);
  }

  const foundSession = await getQuizSessionById(sessionId);
  if (!foundSession) return c.json({ error: 'Session not found' }, 404);
  await expireQuizSessionIfNeeded(foundSession, c);
  const stateResponse = await buildQuizStateResponse(sessionId, userId, {
    includeAnswerDistribution: presenterStateRequested,
    includePresenterLeaderboard: presenterStateRequested,
  });
  if (!stateResponse) {
    return c.json({ error: 'Session not found' }, 404);
  }

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
    <style>${APP_BOOT_STYLES}</style>
  </head>
  <body>
    <div id="app">${APP_BOOT_MARKUP}</div>
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

type QuestionDraft = Pick<Question, 'question_text' | 'options' | 'correct_index' | 'explanation'>;

function generateQuestionDraftsFromText(text: string, requestedCount: number): QuestionDraft[] {
  const drafts = generateSystemDesignConceptDrafts(text).slice(0, requestedCount);
  const terms = extractTerms(text, 80);
  const sentences = splitCandidateSentences(text)
    .map((sentence) => ({
      sentence,
      score: scoreSentence(sentence),
      terms: extractTerms(sentence, 8),
    }))
    .filter((candidate) => candidate.terms.length > 0)
    .sort((a, b) => b.score - a.score);

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
      question_text: `Which concept best completes this statement? "${blankSentence(candidate.sentence, answer)}"`,
      options,
      correct_index: correctIndex,
      explanation: `${answer} is the concept identified in the source material: ${truncateText(candidate.sentence, 240)}`,
    });
    usedAnswers.add(normalizeTermKey(answer));
  }

  return drafts;
}

function generateSystemDesignConceptDrafts(text: string): QuestionDraft[] {
  const source = text.toLowerCase();
  const drafts: QuestionDraft[] = [];
  const isVcbcScenario = source.includes('vcbc')
    || (source.includes('student') && source.includes('slot') && source.includes('booking'))
    || (source.includes('for update') && source.includes('ephemeral'));
  const add = (when: boolean, question_text: string, options: string[], correct_index: number, explanation: string) => {
    if (when) drafts.push({ question_text, options, correct_index, explanation });
  };

  add(source.includes('schema vs schema-less') || isVcbcScenario,
    'VCBC has students, courses, faculties, slots, and bookings with clear relationships. What is the strongest starting point?',
    ['A relational schema with explicit relationships', 'A single unstructured text field', 'One spreadsheet per student', 'No stored data'], 0,
    'The source describes stable entities and relationships. An explicit schema makes constraints and joins enforceable.');
  add((source.includes('10 seats') && source.includes('4800 students')) || isVcbcScenario,
    '4,800 students try to claim a favourite slot with only 10 seats. What must the booking write guarantee?',
    ['The seat count cannot go below zero', 'Every student sees the same cached page', 'Faculty names are hidden', 'Slots are created monthly'], 0,
    'The scarce resource is the seat count. The write must be atomic so concurrent requests cannot oversell a slot.');
  add(source.includes('select') && source.includes('for update'),
    'Which database tool from the deck is most relevant when two students try to take the final seat at once?',
    ['SELECT … FOR UPDATE', 'A read replica', 'A longer cache TTL', 'A full-text search index'], 0,
    'A row lock lets the booking transaction serialize access to the scarce slot before it confirms a seat.');
  add(source.includes('ephemeral or persistent'),
    'A student starts selecting a slot but has not confirmed it. How should that temporary choice be treated?',
    ['Ephemeral until a confirmed booking is made', 'A permanent booking immediately', 'A faculty profile', 'A deleted record'], 0,
    'A temporary selection should not consume a real seat permanently; persistence belongs to the confirmed booking.');
  add(source.includes('students don’t pick a faculty') || isVcbcScenario,
    'Students choose a time, then discover the faculty. Which model best matches that rule?',
    ['Store the booking against a scheduled slot, which links to its faculty', 'Store only the faculty on the student', 'Store the time as free text on the faculty', 'Remove the faculty from the model'], 0,
    'The chosen unit is the scheduled slot. Its relationship to faculty can be resolved after the student selects the time.');
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

function validateQuestionPayload(
  questionText: unknown,
  options: unknown[],
  correctIndex: number,
  explanation?: unknown,
  explanationRequired = false,
): string | null {
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

  if (explanationRequired && (!String(explanation ?? '').trim() || String(explanation).trim().length > 800)) {
    return 'Add a concise reveal explanation (up to 800 characters)';
  }

  if (!explanationRequired && explanation !== undefined && String(explanation).trim().length > 800) {
    return 'Reveal explanations cannot exceed 800 characters';
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
  await mergeQuizParticipantUsers(target.id, source.id);
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
