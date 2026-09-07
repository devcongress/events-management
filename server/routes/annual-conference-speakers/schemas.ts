import { z } from 'zod';
import {
  ANNUAL_CONFERENCE_ABSTRACT_WORD_LIMIT,
  ANNUAL_CONFERENCE_LEARNING_OUTCOME_MAX,
  ANNUAL_CONFERENCE_LEARNING_OUTCOME_MIN,
  ANNUAL_CONFERENCE_SESSION_TYPES,
  ANNUAL_CONFERENCE_TOPIC_TRACKS,
  countWords,
} from '@/lib/annual-conference-cfp';
import { safePublicResourceUrl } from '@/lib/safe-url';

export const conferenceSpeakerSubmissionDecisionSchema = z.object({
  status: z.enum(['selected', 'not_selected']),
  internal_note: z.string().trim().max(1000).optional().default(''),
}).strict();

export const conferenceSpeakerSubmissionCreateSchema = z.object({
  speaker_name: z.string().trim().min(1, 'Speaker name is required').max(120),
  speaker_email: z.string().trim().toLowerCase().email('Speaker email must be valid').max(254),
  bio: z.string().trim().min(1, 'Speaker bio is required').max(4000, 'Speaker bio is too long'),
  title: z.string().trim().min(1, 'Talk title is required').max(200),
  topic: z.enum(ANNUAL_CONFERENCE_TOPIC_TRACKS, { message: 'Choose one conference topic track' }),
  session_type: z.enum(ANNUAL_CONFERENCE_SESSION_TYPES, { message: 'Choose one conference session type' }),
  abstract: z.string().trim().min(1, 'Abstract is required')
    .refine(
      (value) => countWords(value) <= ANNUAL_CONFERENCE_ABSTRACT_WORD_LIMIT,
      `Abstract must be ${ANNUAL_CONFERENCE_ABSTRACT_WORD_LIMIT} words or fewer`,
    ),
  learning_outcomes: z.array(z.string().trim().min(1, 'Learning outcomes cannot be blank').max(300))
    .min(ANNUAL_CONFERENCE_LEARNING_OUTCOME_MIN, 'Add at least 3 learning outcomes')
    .max(ANNUAL_CONFERENCE_LEARNING_OUTCOME_MAX, 'Add no more than 5 learning outcomes'),
  turnstile_action: z.string().trim().max(80).optional(),
  turnstile_token: z.string().trim().max(4096).optional(),
}).strict();

export const conferenceSpeakerLogisticsSchema = z.object({
  slides_url: z.string().trim().max(2048)
    .refine(
      (value) => !value || Boolean(safePublicResourceUrl(value)),
      'Slides or resource link must be a secure public HTTPS URL',
    )
    .optional().default(''),
  availability_confirmed: z.boolean().nullable().optional().default(null),
  technical_requirements: z.string().trim().max(2000).optional().default(''),
  workshop_prerequisites: z.string().trim().max(2000).optional().default(''),
  required_software_equipment: z.string().trim().max(2000).optional().default(''),
  participants_need_laptops: z.boolean().nullable().optional().default(null),
  preferred_workshop_capacity: z.number().int().min(1).max(1000).nullable().optional().default(null),
}).strict();

export const conferenceSpeakerDeadlineSchema = z.object({
  deadline: z.string().datetime({ offset: true }).nullable(),
}).strict();
