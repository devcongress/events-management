import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const mobileHomeSource = readFileSync(
  new URL('./views/admin/AdminMobileOrganizerView.vue', import.meta.url),
  'utf8',
);
const mobileConferenceSource = readFileSync(
  new URL('./views/admin/AdminMobileAnnualConferenceView.vue', import.meta.url),
  'utf8',
);
const desktopConferenceSource = readFileSync(
  new URL('./views/admin/AdminAnnualConferenceView.vue', import.meta.url),
  'utf8',
);
const conferenceNavSource = readFileSync(
  new URL('./components/AnnualConferenceNav.vue', import.meta.url),
  'utf8',
);

describe('mobile organizer entry points', () => {
  it('turns the organizer home into two direct, thumb-sized workspace choices', () => {
    expect(mobileHomeSource).toContain(':to="ORGANIZER_PHONE_EVENTS_ROUTE_PATH"');
    expect(mobileHomeSource).toContain(':to="mobileAnnualConferencePath()"');
    expect(mobileHomeSource).toContain('Guest lists, check-in, proposals');
    expect(mobileHomeSource).toContain('Open conference');
    expect(mobileHomeSource).toContain('min-height: 13.5rem');
    expect(mobileHomeSource).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('shows edition management only after an organizer role is confirmed', () => {
    expect(mobileConferenceSource).toContain("return role === 'owner' || role === 'organizer'");
    expect(mobileConferenceSource).toContain('enabled: canManageEditions');
    expect(mobileConferenceSource).toContain('v-if="canManageEditions" class="conference-mobile__edition-bar"');
    expect(conferenceNavSource).toContain('v-if="canManageEditions" class="min-w-44 max-w-56');
    expect(conferenceNavSource).toContain('{{ currentEdition?.label ?? `December ${year}` }}');
  });

  it('keeps the volunteer conference overview focused and removes organizer navigation', () => {
    expect(mobileConferenceSource).toContain('v-if="!isVolunteer" :to="ORGANIZER_PHONE_ROUTE_PATH"');
    expect(mobileConferenceSource).toContain("'conference-mobile__header--volunteer': isVolunteer");
    expect(mobileConferenceSource).toContain('assignedAccess && summary.total === 0');
    expect(mobileConferenceSource).toContain('No tasks assigned yet');
    expect(mobileConferenceSource).toContain('You do not need to do anything right now.');
    expect(mobileConferenceSource).toContain('position: sticky; top: calc(4.15rem + env(safe-area-inset-top))');
  });

  it('gives desktop volunteers the same focused zero-assignment state', () => {
    expect(desktopConferenceSource).toContain("'conference-brief--volunteer': assignedAccess");
    expect(desktopConferenceSource).toContain('assignedAccess && summary.total === 0');
    expect(desktopConferenceSource).toContain('No tasks assigned yet');
    expect(desktopConferenceSource).toContain('No action required');
    expect(desktopConferenceSource).toContain('font-family: var(--font-sans), system-ui, sans-serif');
  });
});
