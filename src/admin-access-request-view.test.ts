import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const viewSource = readFileSync(
  new URL('./views/admin/AdminAccessRequestView.vue', import.meta.url),
  'utf8',
);

describe('admin access request view', () => {
  it('keeps the public DevCongress logo as a runtime URL', () => {
    expect(viewSource).toContain("const DEVCONGRESS_LOGO_PATH = '/brand/dev-con-logo.png';");
    expect(viewSource).toContain(':src="DEVCONGRESS_LOGO_PATH"');
    expect(viewSource).not.toContain('src="/brand/dev-con-logo.png"');
  });

  it('uses the shared editorial layout, form, and action primitives', () => {
    expect(viewSource).toContain('class="editorial-page"');
    expect(viewSource).toContain('class="editorial-wrap max-w-3xl"');
    expect(viewSource).toContain('class="mb-8"');
    expect(viewSource).not.toContain('class="editorial-header"');
    expect(viewSource).toContain('class="editorial-label"');
    expect(viewSource).toContain('class="editorial-input"');
    expect(viewSource).toContain('class="editorial-action w-full sm:w-fit"');
    expect(viewSource).toContain('class="editorial-secondary-action mt-5"');
  });

  it('keeps the review policy inline with the introduction', () => {
    expect(viewSource).toContain('class="editorial-subtitle mt-2">A DevCongress owner reviews every request. Access is never automatic, and no email is sent.</p>');
    expect(viewSource).not.toContain('<aside');
    expect(viewSource).not.toContain('access-review-notice-title');
    expect(viewSource).not.toContain('Owner review required');
    expect(viewSource).not.toContain('class="editorial-panel mb-6 bg-dc-yellow p-5"');
  });

  it('does not retain the bespoke access-card or local focus styles', () => {
    expect(viewSource).not.toContain('access-card');
    expect(viewSource).not.toContain('.access-form input:focus-visible');
    expect(viewSource).not.toContain('.access-form textarea:focus-visible');
    expect(viewSource).not.toContain('.access-button:focus-visible');
    expect(viewSource).not.toContain('.access-link:focus-visible');
  });
});
