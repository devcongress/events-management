import { z } from 'zod';

const resendBatchResponseSchema = z.object({
  data: z.array(z.object({
    id: z.string().trim().min(1),
  })),
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
  ) {
    super(message);
    this.name = 'ResendBatchError';
  }
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
