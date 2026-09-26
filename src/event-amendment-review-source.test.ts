import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const organizerView = readFileSync(fileURLToPath(new URL('./views/EventAmendmentView.vue', import.meta.url)), 'utf8');
const adminView = readFileSync(fileURLToPath(new URL('./views/admin/AdminEventSubmissionsView.vue', import.meta.url)), 'utf8');

describe('event amendment review wiring', () => {
  it('reviews changed fields against the current event and resets after form edits', () => {
    expect(organizerView).toContain('compareEventAmendment(baseline, requestedEvent)');
    expect(organizerView).toContain('REVIEW CHANGES');
    expect(organizerView).toContain('v-for="change in reviewChanges"');
    expect(organizerView).toContain('watch(form, () => {');
    expect(organizerView).toContain('|| currentEvent.value?.cover_url');
    expect(organizerView).not.toContain('REVIEW TIME');
  });

  it('uses the current approved event for admin comparison and explains missing baselines', () => {
    expect(adminView).toContain('submission?.current_event');
    expect(adminView).toContain('compareEventAmendment(current, amendment)');
    expect(adminView).toContain('Current approved event details are unavailable');
  });
});
