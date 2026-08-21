import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const detailSource = readFileSync(
  new URL('./views/admin/AdminMobileEventView.vue', import.meta.url),
  'utf8',
);
const listSource = readFileSync(
  new URL('./views/admin/AdminMobileEventsView.vue', import.meta.url),
  'utf8',
);

describe('phone event workspace', () => {
  it('gives organizers focused event, guest, and submission views', () => {
    expect(detailSource).toContain('Overview');
    expect(detailSource).toContain('Guests');
    expect(detailSource).toContain('Submissions');
    expect(detailSource).toContain('fetchEventRegistrations');
    expect(detailSource).toContain('fetchEventSpeakerSubmissions');
    expect(detailSource).toContain('Speaker and demo inbox');
    expect(detailSource).toContain('Product demo');
  });

  it('keeps phone actions focused and confirmation-safe', () => {
    expect(detailSource).toContain('Check in');
    expect(detailSource).toContain('Undo check-in?');
    expect(detailSource).toContain('Select proposal');
    expect(detailSource).toContain('Mark this proposal as not selected?');
    expect(detailSource).toContain('Open supporting link');
  });

  it('uses one consistent arrow across the quick-action rows', () => {
    expect(detailSource).toContain('Guest check-in mode <span aria-hidden="true">→</span>');
    expect(detailSource).toContain('Open registration page <span aria-hidden="true">→</span>');
    expect(detailSource).toContain('Show registration QR <span aria-hidden="true">→</span>');
    expect(detailSource).toContain('Open submission form <span aria-hidden="true">→</span>');
    expect(detailSource).toContain('Open source event <span aria-hidden="true">→</span>');
    expect(detailSource).toContain('Email guests <span aria-hidden="true">→</span>');
  });

  it('meets the phone touch-target and reduced-motion baseline', () => {
    expect(detailSource).toContain('min-height: 2.75rem');
    expect(detailSource).toContain('@media (prefers-reduced-motion: reduce)');
    expect(detailSource).toContain('env(safe-area-inset-bottom)');
  });

  it('uses the branded pink count badges with white text', () => {
    expect(detailSource).toMatch(/\.mobile-event-tabs button > span \{[^}]*background: #e8117f;[^}]*color: #fff;/);
  });

  it('links every event card into the phone workspace', () => {
    expect(listSource).toContain("label: 'Manage event'");
    expect(listSource).toContain('organizerPhoneEventPath(event.id)');
  });
});
