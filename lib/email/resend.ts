import { z } from 'zod';
import { eventBlastEmail } from './templates/event-blast';

const resendBatchResponseSchema = z.object({
  data: z.array(z.object({
    id: z.string().trim().min(1),
  })),
});

const resendIdResponseSchema = z.object({ id: z.string().trim().min(1) });

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
  ) {
    super(message);
    this.name = 'ResendBatchError';
  }
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

export async function createResendBroadcast(input: {
  apiKey: string;
  eventName: string;
  subject: string;
  body: string;
  from: string;
  replyTo?: string;
  scheduledFor?: string | null;
  recipients: ResendBroadcastRecipient[];
  fetcher?: Fetcher;
}): Promise<{ broadcastId: string; segmentId: string }> {
  if (input.recipients.length < 1 || input.recipients.length > 100) {
    throw new ResendBroadcastError('Blasts must have between 1 and 100 recipients.');
  }

  const fetcher = input.fetcher ?? fetch;
  const segmentId = await requireResendId(await resendRequest(input.apiKey, '/segments', {
    method: 'POST',
    body: JSON.stringify({ name: `DevCongress · ${input.eventName}`.slice(0, 120) }),
  }, fetcher));

  for (const recipient of input.recipients) {
    const createResponse = await resendRequest(input.apiKey, '/contacts', {
      method: 'POST',
      body: JSON.stringify({
        email: recipient.email,
        ...recipientName(recipient.name),
        segments: [{ id: segmentId }],
      }),
    }, fetcher);
    if (createResponse.ok) continue;

    // Contacts are global in Resend. A duplicate is still eligible for this
    // event's new segment, so add it directly instead of failing the blast.
    if (createResponse.status === 409) {
      const addResponse = await resendRequest(
        input.apiKey,
        `/contacts/${encodeURIComponent(recipient.email)}/segments/${encodeURIComponent(segmentId)}`,
        { method: 'POST', body: JSON.stringify({}) },
        fetcher,
      );
      if (addResponse.ok || addResponse.status === 409) continue;
      throw new ResendBroadcastError('The email provider did not accept the guest list.', addResponse.status);
    }
    throw new ResendBroadcastError('The email provider did not accept the guest list.', createResponse.status);
  }

  const content = eventBlastEmail({
    subject: input.subject,
    body: input.body,
    unsubscribeUrl: '{{{RESEND_UNSUBSCRIBE_URL}}}',
  });
  const response = await resendRequest(input.apiKey, '/broadcasts', {
    method: 'POST',
    body: JSON.stringify({
      name: `DevCongress · ${input.eventName}`.slice(0, 120),
      segment_id: segmentId,
      from: input.from,
      reply_to: input.replyTo,
      subject: input.subject,
      html: content.html,
      text: content.text,
      send: true,
      ...(input.scheduledFor ? { scheduled_at: input.scheduledFor } : {}),
    }),
  }, fetcher);
  const broadcastId = await requireResendId(response);
  return { broadcastId, segmentId };
}

export async function sendResendEmailBatch(input: {
  apiKey: string;
  idempotencyKey: string;
  emails: ResendEmail[];
  fetcher?: Fetcher;
}): Promise<{ ids: string[] }> {
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
    throw new ResendBatchError('The email provider did not accept the request.', response.status);
  }

  const parsed = resendBatchResponseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success || parsed.data.data.length !== input.emails.length) {
    throw new ResendBatchError('The email provider returned an unexpected response.', response.status);
  }

  return {
    ids: parsed.data.data.map((email) => email.id),
  };
}
