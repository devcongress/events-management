import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const viewSource = readFileSync(
  new URL('./views/admin/AdminAnnualConferenceSpeakersView.vue', import.meta.url),
  'utf8',
);
const copyButtonSource = readFileSync(
  new URL('./components/ui/AppCopyButton.vue', import.meta.url),
  'utf8',
);
const eventSubmissionsSource = readFileSync(
  new URL('./views/admin/AdminEventSubmissionsView.vue', import.meta.url),
  'utf8',
);

const copyLinkViewSources = [
  './views/admin/AdminAnnualConferenceSpeakersView.vue',
  './views/admin/AdminAuditLogView.vue',
  './views/admin/AdminEventSubmissionsView.vue',
  './views/admin/AdminFeedbackView.vue',
  './views/admin/AdminMobileAnnualConferenceView.vue',
  './views/admin/AdminRegistrationDisplayView.vue',
  './views/admin/AdminRegistrationsView.vue',
  './views/admin/AdminTalksView.vue',
  './views/admin/AdminVolunteerView.vue',
].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'));

describe('Annual Conference speaker deadline controls', () => {
  it('uses the app date-time picker and aligns the save action with its field', () => {
    expect(viewSource).toContain("import AppDatePicker from '@/src/components/ui/AppDatePicker.vue';");
    expect(viewSource).toContain('label="Speaker logistics deadline"');
    expect(viewSource).toContain('mode="datetime"');
    expect(viewSource).toContain('sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end');
    expect(viewSource).toContain('min-h-[50px] w-full');
    expect(viewSource).not.toContain('type="datetime-local"');
  });

  it('confirms the destructive close-call action before changing its state', () => {
    expect(viewSource).toContain("speakersQuery.data.value.call.open ? 'bg-red-600' : 'bg-dc-pink'");
    expect(viewSource).toContain('closeCallConfirmationOpen = true');
    expect(viewSource).toContain('title="Close the Call for Speakers?"');
    expect(viewSource).toContain('confirm-label="Close call"');
    expect(viewSource).toContain('@confirm="callMutation.mutate(false)"');
    expect(viewSource).toContain('danger');
  });

  it('uses one accessible copy-link feedback pattern throughout the organizer app', () => {
    expect(copyButtonSource).toContain("state: 'idle' | 'copying' | 'copied'");
    expect(copyButtonSource).toContain(':disabled="disabled || state !== \'idle\'"');
    expect(copyButtonSource).toContain(':aria-label="label"');
    expect(copyButtonSource).toContain('role="status" aria-live="polite"');
    expect(copyButtonSource).toContain("data-copy-state='copied'");
    expect(copyButtonSource).toContain('@media (prefers-reduced-motion: reduce)');
    for (const source of copyLinkViewSources) {
      expect(source).toContain('<AppCopyButton');
      expect(source).toContain('copyTextToClipboard');
    }
    expect(eventSubmissionsSource).toContain('managementLinkCopySubmissionId === selectedSubmission.id');
    expect(eventSubmissionsSource).toContain('operation !== managementLinkCopyOperation');
  });
});
