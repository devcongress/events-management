import { z } from 'zod';

export const CONFERENCE_REGISTRATION_PATH = '/api/public/annual-conference/2026/registration';
export const CONFERENCE_REGISTRATION_ACTION = 'conference_registration';
export const CONFERENCE_REGISTRATION_PREVIEW_ORIGIN = 'https://feature-devcon26-public-checkout-devcongress-website.admins-a7d.workers.dev';
export const CONFERENCE_REGISTRATION_TURNSTILE_HOSTNAMES = [
  'devcongress.org',
  'www.devcongress.org',
  'em.devcongress.org',
  new URL(CONFERENCE_REGISTRATION_PREVIEW_ORIGIN).hostname,
];

export const conferenceRegistrationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  turnstile_token: z.string().max(4096).optional(),
  turnstile_action: z.string().max(80).optional(),
}).strict();

export const conferenceRegistrationAccepted = {
  accepted: true,
  message: 'Request received. If a new registration was created, its confirmation or waitlist email will be queued. Existing registrations, including cancelled ones, are unchanged and no new email is queued for repeat submissions. Contact the event team to recover a cancelled registration.',
} as const;

export const conferenceRegistrationOverviewSchema = z.object({
  edition_id: z.string().uuid(),
  mode: z.enum(['free', 'paid']),
  status: z.enum(['draft', 'open', 'closed']),
  capacity: z.number().int(),
  reserved: z.number().int(),
  confirmed: z.number().int(),
  waitlisted: z.number().int(),
});
