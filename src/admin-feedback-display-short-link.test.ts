import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const viewSource = readFileSync(
  new URL('./views/admin/AdminFeedbackDisplayView.vue', import.meta.url),
  'utf8',
);

describe('feedback QR display', () => {
  it('uses the managed event feedback short link before the direct URL fallback', () => {
    expect(viewSource).toContain("ensureAdminShortLink({ destination: 'event_feedback', event_id: eventId.value })");
    expect(viewSource).toContain('let qrDestination = statusPayload.public_url;');
    expect(viewSource).toContain('await buildQrCode(qrDestination);');
  });

  it('keeps the DevCongress brand visible on the public display', () => {
    expect(viewSource).toContain("const DEVCONGRESS_LOGO_PATH = '/brand/dev-con-logo.png';");
    expect(viewSource).toContain('class="feedback-display-brand"');
  });
});
