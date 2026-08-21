import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const viewSource = readFileSync(
  new URL('./views/VolunteerIntakeView.vue', import.meta.url),
  'utf8',
);

describe('volunteer intake view', () => {
  it('keeps the public DevCongress logo as a runtime URL', () => {
    expect(viewSource).toContain("const DEVCONGRESS_LOGO_PATH = '/brand/dev-con-logo.png';");
    expect(viewSource).toContain(':src="DEVCONGRESS_LOGO_PATH"');
    expect(viewSource).not.toContain('src="/brand/dev-con-logo.png"');
  });
});
