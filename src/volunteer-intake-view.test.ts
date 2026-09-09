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

  it('shows a server-directed retry countdown in the disabled submit button', () => {
    expect(viewSource).toContain("response.headers.get('Retry-After')");
    expect(viewSource).toContain('payload.retry_after_seconds');
    expect(viewSource).toContain('Try again in {{ retryCountdownLabel }}');
    expect(viewSource).toContain(':disabled="!canSubmit || submitting"');
    expect(viewSource).toContain('onBeforeUnmount(clearRetryTimer)');
  });
});
