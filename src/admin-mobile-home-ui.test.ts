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
const desktopVolunteerSource = readFileSync(
  new URL('./views/admin/AdminVolunteerView.vue', import.meta.url),
  'utf8',
);
const globalStylesSource = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

describe('mobile organizer entry points', () => {
  it('turns the organizer home into permission-aware next actions', () => {
    expect(mobileHomeSource).toContain('mobileOrganizerNextActions');
    expect(mobileHomeSource).toContain('enabled: canSeeEvents');
    expect(mobileHomeSource).toContain('enabled: authenticated');
    expect(mobileHomeSource).toContain('Next actions');
    expect(mobileHomeSource).toContain('Loading your work');
    expect(mobileHomeSource).toContain('Some actions could not load');
    expect(mobileHomeSource).toContain('You are clear for now');
    expect(mobileHomeSource).toContain("section: 'tasks'");
    expect(mobileHomeSource).toContain("phase: 'all'");
    expect(mobileHomeSource).toContain('task: action.target.taskId');
    expect(mobileHomeSource).toContain(':to="ORGANIZER_PHONE_EVENTS_ROUTE_PATH"');
    expect(mobileHomeSource).toContain(':to="mobileAnnualConferencePath()"');
    expect(mobileHomeSource).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('shows edition management only after an organizer role is confirmed', () => {
    expect(mobileConferenceSource).toContain("return role === 'owner' || role === 'organizer'");
    expect(mobileConferenceSource).toContain('enabled: canManageEditions');
    expect(mobileConferenceSource).toContain('v-if="canManageEditions" class="conference-mobile__edition-bar"');
    expect(conferenceNavSource).toContain('v-if="canManageEditions" class="min-w-44 max-w-56');
    expect(conferenceNavSource).toContain('{{ currentEdition?.label ?? `December ${year}` }}');
    expect(conferenceNavSource).toContain('class="mt-4 flex flex-wrap items-start justify-between gap-4 pt-4"');
    expect(conferenceNavSource).not.toContain('gap-4 border-t border-dc-border pt-4');
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

  it('keeps mobile volunteer actions and directory filters together while scrolling', () => {
    expect(mobileConferenceSource).toContain('class="volunteer-directory-sticky"');
    expect(mobileConferenceSource).toContain('.volunteer-directory-sticky { position: sticky;');
    expect(mobileConferenceSource).not.toContain('.volunteer-directory-tools { position: sticky;');
  });

  it('removes the volunteer panel shadow without suppressing application scrollbars', () => {
    expect(desktopVolunteerSource).toContain('class="editorial-panel volunteer-directory-panel overflow-hidden"');
    expect(desktopVolunteerSource).toContain('.volunteer-directory-panel {\n  box-shadow: none;');
    expect(globalStylesSource).not.toContain('.app-main::-webkit-scrollbar');
  });
});
