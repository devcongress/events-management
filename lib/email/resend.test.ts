import { describe, expect, it, vi } from 'vitest';
import { ResendBatchError, sendResendEmailBatch } from './resend';

const email = {
  from: 'DevCongress <speakers@updates.devcongress.org>',
  to: ['ama@example.com'],
  reply_to: 'hello@devcongress.org',
  subject: 'Archive request',
  html: '<p>Open it</p>',
  text: 'Open it',
};

describe('Resend batch client', () => {
  it('sends the idempotency key and returns provider ids in request order', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      data: [{ id: 'email-1' }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    await expect(sendResendEmailBatch({
      apiKey: 're_test',
      idempotencyKey: 'speaker-archive-test',
      emails: [email],
      fetcher,
    })).resolves.toEqual({ ids: ['email-1'] });

    expect(fetcher).toHaveBeenCalledWith(
      'https://api.resend.com/emails/batch',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer re_test',
          'Idempotency-Key': 'speaker-archive-test',
        }),
      }),
    );
  });

  it('returns a safe provider error without exposing the response body', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      message: 'sensitive provider details',
    }), { status: 429 }));

    await expect(sendResendEmailBatch({
      apiKey: 're_test',
      idempotencyKey: 'speaker-archive-test',
      emails: [email],
      fetcher,
    })).rejects.toEqual(new ResendBatchError('The email provider did not accept the request.', 429));
  });
});
