import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const viewSource = readFileSync(
  new URL('./views/admin/AdminVolunteerDisplayView.vue', import.meta.url),
  'utf8',
);

describe('volunteer QR display', () => {
  it('keeps the DevCongress brand anchored beside the existing QR flow', () => {
    expect(viewSource).toContain("const DEVCONGRESS_LOGO_PATH = '/brand/dev-con-logo.png';");
    expect(viewSource).toContain('class="volunteer-display-brand"');
    expect(viewSource).toContain('class="volunteer-display-qr-frame"');
    expect(viewSource).toContain("ensureAdminShortLink({ destination: 'volunteer_intake' })");
  });
});
