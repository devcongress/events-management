import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { admissionEmailContent } from './annual-conference-admission-email-delivery';

const delivery = {
  id: '10000000-0000-4000-8000-000000000001', recipient_name: 'Ama <Mensah>', recipient_email: 'ama@example.test',
  kind: 'flexible_admission_delivery' as const,
  payload: { email_version: 2, badge_included: true, seat_number: 3, qr_token: 'a'.repeat(64), capability: 'b'.repeat(64) },
  idempotency_key: 'fixture', first_attempt_at: new Date().toISOString(), claimed_until: new Date(Date.now() + 600000).toISOString(),
};
const origin = 'https://preview.account.workers.dev';
const badge = `${origin}/devcon26/social-card/#buyer_grant=fixture`;

describe('combined preview ticket email', () => {
  it('attaches a readable PDF and keeps QR codes out of HTML', async () => {
    const email = await admissionEmailContent(delivery, 'events@example.test', 'help@example.test', origin, true, badge);
    const attachment = email.attachments![0];
    const bytes = Buffer.from(attachment.content, 'base64');

    expect(attachment.content_type).toBe('application/pdf');
    expect(attachment.filename).toMatch(/\.pdf$/);
    expect(attachment.content_id).toBeUndefined();
    expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
    expect((await PDFDocument.load(bytes)).getPages()).toHaveLength(1);
    expect(email.html).not.toContain('cid:');
    expect(email.html).not.toContain(delivery.payload.qr_token);
    expect(email.html).toContain('Ama &lt;Mensah&gt;');
    expect(email.text).toContain(badge);
    expect(email.text).toContain(`/tickets/manage/#key=${delivery.payload.capability}`);
    expect(email.html).toContain('/brand/dev-con-logo.png');
    expect(email.html).toContain('prefers-color-scheme: dark');
    expect(email.html).toContain('[data-ogsc]');
    expect(email.subject.match(/\[TEST\]/g)).toHaveLength(1);
  });

  it('fails closed without the combined badge and never adds purchaser access to a gift ticket', async () => {
    await expect(admissionEmailContent(delivery, 'from', 'reply', origin, true)).rejects.toThrow('badge unavailable');
    const { capability: _capability, ...payload } = delivery.payload;
    const email = await admissionEmailContent({ ...delivery, payload }, 'from', 'reply', origin, true, badge);

    expect(email.html).not.toContain('/tickets/manage/');
    expect(email.text).toContain(badge);
  });

  it('leaves gift-only purchaser mail without a QR or badge belonging to someone else', async () => {
    const email = await admissionEmailContent({ ...delivery, kind: 'flexible_order_management',
      payload: { email_version: 2, capability: delivery.payload.capability } }, 'from', 'reply', origin, true);

    expect(email.attachments).toBeUndefined();
    expect(email.text).toContain('/tickets/manage/');
    expect(email.text).not.toContain('buyer_grant');
  });
});
