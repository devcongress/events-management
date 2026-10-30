import { expect, it, vi } from 'vitest';
import { sendResendAttachedEmail } from './resend';
import { resendRetryAfter } from './resend-delivery-error';

const input = { apiKey: 'synthetic', idempotencyKey: 'stable-key', email: { from: 'a@example.test', to: ['b@example.test'], subject: 'Test', html: '<p>Test</p>', text: 'Test' } };

it('retains provider backoff and distinguishes uncertain delivery', async () => {
  await expect(sendResendAttachedEmail({ ...input, fetcher: vi.fn().mockResolvedValue(Response.json({}, { status: 429, headers: { 'retry-after': '120' } })) as unknown as typeof fetch })).rejects.toMatchObject({ kind: 'throttled', retryAfterSeconds: 120 });
  await expect(sendResendAttachedEmail({ ...input, fetcher: vi.fn().mockRejectedValue(new Error('timeout')) as unknown as typeof fetch })).rejects.toMatchObject({ kind: 'ambiguous' });
  await expect(sendResendAttachedEmail({ ...input, fetcher: vi.fn().mockResolvedValue(Response.json({}, { status: 503 })) as unknown as typeof fetch })).rejects.toMatchObject({ kind: 'ambiguous' });
  await expect(sendResendAttachedEmail({ ...input, fetcher: vi.fn().mockResolvedValue(Response.json({}, { status: 422 })) as unknown as typeof fetch })).rejects.toMatchObject({ kind: 'rejected' });
  expect(resendRetryAfter('garbage')).toBe(60);
  expect(resendRetryAfter('Fri, 30 Oct 2026 21:00:10 GMT', Date.parse('2026-10-30T21:00:00Z'))).toBe(10);
});
