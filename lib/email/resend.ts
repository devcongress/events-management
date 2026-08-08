import { z } from 'zod';
import { emailSubjects } from '@/lib/email/scenarios';
import { parseResendQuotaUsage, type EmailQuotaUsage } from '@/lib/email/delivery-health';
import { eventBlastEmail } from './templates/event-blast';

const resendBatchResponseSchema = z.object({
  data: z.array(z.object({
    id: z.string().trim().min(1),
  })),
});

const resendIdResponseSchema = z.object({ id: z.string().trim().min(1) });

const resendErrorResponseSchema = z.object({
  message: z.string().trim().min(1).max(500).optional(),
}).passthrough();

const resendReceivedEmailSchema = z.object({
  id: z.string().trim().min(1),
  to: z.array(z.string().trim().min(1)).default([]),
  from: z.string().trim().min(1).max(320),
  created_at: z.string().trim().min(1),
  subject: z.string().max(500).default(''),
  html: z.string().nullable().default(null),
  text: z.string().nullable().default(null),
  headers: z.record(z.string(), z.string()).nullable().default(null),
  message_id: z.string().nullable().default(null),
  attachments: z.array(z.object({
    filename: z.string().trim().min(1).max(255).default('attachment'),
    content_type: z.string().max(200).nullable().default(null),
    size: z.number().int().nonnegative().nullable().default(null),
  })).max(50).default([]),
});

export type ResendEmail = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  reply_to?: string;
};

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class ResendBatchError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
    readonly providerMessage?: string,
  ) {
    super(message);
    this.name = 'ResendBatchError';
  }
}

function safeProviderMessage(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return undefined;
  return normalized
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\b(?:re|sk|key)_[A-Za-z0-9_-]+\b/gi, '[redacted]')
    .slice(0, 240);
}

export class ResendBroadcastError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'ResendBroadcastError';
  }
}

export type ResendBroadcastRecipient = {
  email: string;
  name: string;
};

export type PreparedResendBroadcast = {
  broadcastId: string;
  segmentId: string;
};

async function resendRequest(
  apiKey: string,
  path: string,
  init: RequestInit,
  fetcher: Fetcher,
): Promise<Response> {
  try {
    return await fetcher(`https://api.resend.com${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ResendBroadcastError('The email provider could not be reached.');
  }
}

async function requireResendId(response: Response): Promise<string> {
  const parsed = resendIdResponseSchema.safeParse(await response.json().catch(() => null));
  if (!response.ok || !parsed.success) {
    throw new ResendBroadcastError('The email provider did not accept the blast.', response.status);
  }
  return parsed.data.id;
}

function recipientName(name: string): { first_name?: string; last_name?: string } {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return {};
  return { first_name: words[0], last_name: words.slice(1).join(' ') || undefined };
}

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item) await worker(item);
    }
  });
  await Promise.all(workers);
}

export async function prepareResendBroadcast(input: {
  apiKey: string;
  eventName: string;
  eventDate: string;
  eventEndDate?: string | null;
  locationName: string;
  locationUrl?: string | null;
  eventUrl?: string | null;
  calendarDownloadUrl?: string | null;
  subject: string;
  body: string;
  from: string;
  replyTo?: string;
  recipients: ResendBroadcastRecipient[];
  fetcher?: Fetcher;
}): Promise<PreparedResendBroadcast> {
  if (input.recipients.length < 1 || input.recipients.length > 100) {
    throw new ResendBroadcastError('Blasts must have between 1 and 100 recipients.');
  }

  const fetcher = input.fetcher ?? fetch;
  const segmentId = await requireResendId(await resendRequest(input.apiKey, '/segments', {
    method: 'POST',
    body: JSON.stringify({ name: `DevCongress · ${input.eventName}`.slice(0, 120) }),
  }, fetcher));

  await runWithConcurrency(input.recipients, 8, async (recipient) => {
    const createResponse = await resendRequest(input.apiKey, '/contacts', {
      method: 'POST',
      body: JSON.stringify({
        email: recipient.email,
        ...recipientName(recipient.name),
        segments: [{ id: segmentId }],
      }),
    }, fetcher);
    if (createResponse.ok) return;

    // Contacts are global in Resend. A duplicate is still eligible for this
    // event's new segment, so add it directly instead of failing the blast.
    if (createResponse.status === 409) {
      const addResponse = await resendRequest(
        input.apiKey,
        `/contacts/${encodeURIComponent(recipient.email)}/segments/${encodeURIComponent(segmentId)}`,
        { method: 'POST', body: JSON.stringify({}) },
        fetcher,
      );
      if (addResponse.ok || addResponse.status === 409) return;
      throw new ResendBroadcastError('The email provider did not accept the guest list.', addResponse.status);
    }
    throw new ResendBroadcastError('The email provider did not accept the guest list.', createResponse.status);
  });

  const subject = emailSubjects.customEventBlast(input.subject);
  const content = eventBlastEmail({
    subject,
    body: input.body,
    unsubscribeUrl: '{{{RESEND_UNSUBSCRIBE_URL}}}',
    eventName: input.eventName,
    eventDate: input.eventDate,
    eventEndDate: input.eventEndDate,
    locationName: input.locationName,
    locationUrl: input.locationUrl,
    eventUrl: input.eventUrl,
    calendarDownloadUrl: input.calendarDownloadUrl,
  });
  const response = await resendRequest(input.apiKey, '/broadcasts', {
    method: 'POST',
    body: JSON.stringify({
      name: `DevCongress · ${input.eventName}`.slice(0, 120),
      segment_id: segmentId,
      from: input.from,
      reply_to: input.replyTo,
      subject,
      html: content.html,
      text: content.text,
      send: false,
    }),
  }, fetcher);
  const broadcastId = await requireResendId(response);
  return { broadcastId, segmentId };
}

export async function sendResendBroadcast(input: {
  apiKey: string;
  broadcastId: string;
  scheduledFor?: string | null;
  fetcher?: Fetcher;
}): Promise<void> {
  const response = await resendRequest(input.apiKey, `/broadcasts/${encodeURIComponent(input.broadcastId)}/send`, {
    method: 'POST',
    body: JSON.stringify(input.scheduledFor ? { scheduled_at: input.scheduledFor } : {}),
  }, input.fetcher ?? fetch);
  await requireResendId(response);
}

export async function sendResendEmailBatch(input: {
  apiKey: string;
  idempotencyKey: string;
  emails: ResendEmail[];
  fetcher?: Fetcher;
}): Promise<{ ids: string[]; quota: EmailQuotaUsage }> {
  if (input.emails.length < 1 || input.emails.length > 100) {
    throw new ResendBatchError('Email batches must contain between 1 and 100 emails.');
  }

  const fetcher = input.fetcher ?? fetch;
  let response: Response;

  try {
    response = await fetcher('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotencyKey,
      },
      body: JSON.stringify(input.emails),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ResendBatchError('The email provider could not be reached.');
  }

  if (!response.ok) {
    const body = resendErrorResponseSchema.safeParse(await response.json().catch(() => null));
    throw new ResendBatchError(
      'The email provider did not accept the request.',
      response.status,
      body.success ? safeProviderMessage(body.data.message) : undefined,
    );
  }

  const parsed = resendBatchResponseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success || parsed.data.data.length !== input.emails.length) {
    throw new ResendBatchError('The email provider returned an unexpected response.', response.status);
  }

  return {
    ids: parsed.data.data.map((email) => email.id),
    quota: {
      dailyUsed: parseResendQuotaUsage(response.headers.get('x-resend-daily-quota')),
      monthlyUsed: parseResendQuotaUsage(response.headers.get('x-resend-monthly-quota')),
    },
  };
}

export type ResendReceivedEmail = z.infer<typeof resendReceivedEmailSchema>;

export class ResendReceivingEmailError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'ResendReceivingEmailError';
  }
}

export async function retrieveResendReceivedEmail(input: {
  apiKey: string;
  emailId: string;
  fetcher?: Fetcher;
}): Promise<ResendReceivedEmail> {
  let response: Response;
  try {
    response = await (input.fetcher ?? fetch)(
      `https://api.resend.com/emails/receiving/${encodeURIComponent(input.emailId)}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${input.apiKey}` },
        signal: AbortSignal.timeout(15_000),
      },
    );
  } catch {
    throw new ResendReceivingEmailError('The email provider could not be reached.');
  }

  const parsed = resendReceivedEmailSchema.safeParse(await response.json().catch(() => null));
  if (!response.ok || !parsed.success) {
    throw new ResendReceivingEmailError('The received email could not be retrieved.', response.status);
  }
  return parsed.data;
}
