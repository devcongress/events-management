import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Context } from 'hono';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), send: vi.fn(), enabled: true }));

vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock('@/lib/email/resend', () => ({ sendResendAttachedEmail: mocks.send }));
vi.mock('@/server/env', () => ({ envValue: (key: string) => ({
  DEVCON26_ADMISSION_EMAILS_ENABLED: String(mocks.enabled), RESEND_API_KEY: 'fixture',
  DEVCON26_ADMISSION_EMAIL_FROM: 'events@example.test', DEVCON26_ADMISSION_EMAIL_REPLY_TO: 'help@example.test',
  PUBLIC_WEBSITE_ORIGIN: 'https://devcongress.org',
})[key] }));

import { admissionEmailContent, admissionEmailReadiness, retryAnnualConferenceAdmissionEmails } from './annual-conference-admission-email-delivery';

const delivery = {
  id: '10000000-0000-4000-8000-000000000001', recipient_name: '<Fixture>', recipient_email: 'fixture@example.test',
  kind: 'ticket_delivery' as const, payload: { qr_token: 'a'.repeat(64) }, idempotency_key: 'fixture-admission',
  first_attempt_at: new Date().toISOString(), claimed_until: new Date(Date.now() + 600000).toISOString(),
};

beforeEach(() => {
  mocks.enabled = true;
  mocks.rpc.mockReset();
  mocks.send.mockReset().mockResolvedValue('provider-fixture');
  mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => ({
    error: null,
    data: name === 'claim_annual_conference_ticket_email_outbox' ? [delivery]
      : name === 'freeze_annual_conference_admission_email' ? args.p_payload
        : name === 'complete_test_email_context' ? { is_test: false, allowed: true } : name === 'annual_conference_email_allowed' ? true : {},
  }));
});

describe('conference admission delivery', () => {
  it('reports readiness without exposing sender secrets', () => {
    expect(admissionEmailReadiness({} as Context)).toEqual({ enabled: true, configured: true, ready: true });
    mocks.enabled = false;
    expect(admissionEmailReadiness({} as Context)).toEqual({ enabled: false, configured: true, ready: false });
  });

  it('creates a private PNG attachment without exposing a raw token or unescaped name in HTML', async () => {
    const email = await admissionEmailContent(delivery, 'events@example.test', 'help@example.test');

    expect(email.attachments).toHaveLength(1);
    expect(Buffer.from(email.attachments![0].content, 'base64').subarray(1, 4).toString()).toBe('PNG');
    expect(email.html).toContain('&lt;Fixture&gt;');
    expect(email.html).not.toContain(delivery.payload.qr_token);
    const waitlist = await admissionEmailContent({ ...delivery, kind: 'waitlist_notice', payload: {} }, 'events@example.test', 'help@example.test');

    expect(waitlist.attachments).toBeUndefined();
    expect(waitlist.text).toContain('not a confirmed place');
  });

  it('renders management and gift capabilities as private fragment links, not admission QR codes', async () => {
    const capability = 'b'.repeat(64);

    for (const kind of ['flexible_order_management', 'flexible_gift_claim'] as const) {
      const email = await admissionEmailContent({ ...delivery, kind, payload: { capability } },
        'events@example.test', 'help@example.test', 'https://devcongress.org');

      expect(email.attachments).toBeUndefined();
      expect(email.text).toContain(`#key=${capability}`);
      expect(email.text).not.toContain(`?key=${capability}`);
      expect(email.html).toContain('not an admission QR');
    }
  });

  it('renders a bounded sponsor QR chunk as individual attachments', async () => {
    const tickets = Array.from({ length: 20 }, (_, index) => ({
      ticket_id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      order_seat_number: index + 1,
      qr_token: String(index + 1).padStart(64, 'a'),
    }));
    const email = await admissionEmailContent({
      ...delivery,
      kind: 'flexible_buyer_bundle_delivery',
      payload: { chunk_index: 1, chunk_count: 2, tickets },
    }, 'events@example.test', 'help@example.test');

    expect(email.subject).toContain('part 1 of 2');
    expect(email.attachments).toHaveLength(20);
    expect(email.attachments?.[0].filename).toBe('devcon26-admission-seat-1.png');
    expect(email.attachments?.[19].filename).toBe('devcon26-admission-seat-20.png');
    expect(email.html).not.toContain(tickets[0].qr_token);

    await expect(admissionEmailContent({
      ...delivery,
      kind: 'flexible_buyer_bundle_delivery',
      payload: { chunk_index: 1, chunk_count: 2, tickets: [...tickets, tickets[0]] },
    }, 'events@example.test', 'help@example.test')).rejects.toThrow();
  });

  it('does not claim or send when disabled', async () => {
    mocks.enabled = false;
    expect(await retryAnnualConferenceAdmissionEmails({} as Context)).toMatchObject({ configured: false });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('freezes the provider payload and acknowledges acceptance with the same idempotency key', async () => {
    expect(await retryAnnualConferenceAdmissionEmails({} as Context)).toMatchObject({ accepted: 1, failed: 0 });
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'fixture-admission' }));
    expect(mocks.rpc).toHaveBeenLastCalledWith('finalize_annual_conference_ticket_email_outbox', expect.objectContaining({ p_status: 'accepted', p_provider_email_id: 'provider-fixture' }));
  });

  it('does not turn an ambiguous accepted acknowledgement into a new failed delivery', async () => {
    mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => ({
      error: name === 'finalize_annual_conference_ticket_email_outbox' ? { message: 'unavailable' } : null,
      data: name === 'claim_annual_conference_ticket_email_outbox' ? [delivery] : name === 'complete_test_email_context' ? { is_test: false, allowed: true } : name === 'annual_conference_email_allowed' ? true : args.p_payload,
    }));
    await expect(retryAnnualConferenceAdmissionEmails({} as Context)).rejects.toThrow('acknowledgement');
    expect(mocks.rpc.mock.calls.filter(([name]) => name === 'finalize_annual_conference_ticket_email_outbox')).toHaveLength(1);
  });
});

describe('test admission artifacts', () => {
  it('sends a marked, still-decodable PNG without claiming event admission', async () => {
    const content = await admissionEmailContent(delivery, 'events@example.test', 'help@example.test', 'https://preview.account.workers.dev', true);
    const attachment = content.attachments![0];
    const image = PNG.sync.read(Buffer.from(attachment.content, 'base64'));

    expect(attachment.filename).toContain('TEST-NOT-VALID-FOR-ADMISSION');
    expect([image.width, image.height]).toEqual([600, 720]);
    expect(jsQR(new Uint8ClampedArray(image.data), image.width, image.height)?.data).toBe(delivery.payload.qr_token);
    for (const [start, end] of [[0, 60], [660, 720]]) {
      const band = image.data.subarray(start * 600 * 4, end * 600 * 4);
      const colors = new Set(Array.from(band).filter((_v, index) => index % 4 !== 3));

      expect(colors).toEqual(new Set([0, 255]));
    }
    expect(content.text).toContain('cannot be used to check in');
    expect(content.text).not.toMatch(/place.*confirmed|Show.*entrance|admits one person/);
  });

  it('uses preview payment and claim wording instead of live admission promises', async () => {
    for (const kind of ['flexible_order_management', 'flexible_gift_claim', 'payment_receipt'] as const) {
      const content = await admissionEmailContent({ ...delivery, kind, payload: { capability: 'b'.repeat(64) } },
        'events@example.test', 'help@example.test', 'https://preview.account.workers.dev', true);

      expect(content.text).toMatch(/test|preview/);
      expect(content.text).not.toContain('Your DevCon26 payment is confirmed');
      if (kind !== 'payment_receipt') expect(content.text).toContain('https://preview.account.workers.dev/');
    }
  });
});
