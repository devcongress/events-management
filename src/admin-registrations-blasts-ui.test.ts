import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const viewSource = readFileSync(
  new URL('./views/admin/AdminRegistrationsView.vue', import.meta.url),
  'utf8',
);
const drawerSource = readFileSync(
  new URL('./components/ui/BlastActivityDrawer.vue', import.meta.url),
  'utf8',
);
const mobileCheckInSource = readFileSync(
  new URL('./views/admin/AdminMobileCheckInView.vue', import.meta.url),
  'utf8',
);
const mobileEventSource = readFileSync(
  new URL('./views/admin/AdminMobileEventView.vue', import.meta.url),
  'utf8',
);

describe('event blast activity workspace', () => {
  it('uses a compact checkmark and secondary undo action for checked-in guests', () => {
    expect(viewSource).toContain('aria-label="Checked in"');
    expect(viewSource).toContain('UNDO CHECK-IN');
    expect(viewSource).toContain('v-if="registration.status === \'confirmed\' && registration.checked_in_at"');
    expect(viewSource).not.toContain("if (registration.checked_in_at) return 'Checked in';");
  });

  it('keeps unavailable check-in actions recognizable and labels active-list removal clearly', () => {
    for (const source of [viewSource, mobileCheckInSource, mobileEventSource]) {
      expect(source.toLowerCase()).toContain("'check in'");
      expect(source).not.toContain('Event day only');
      expect(source).not.toContain('EVENT DAY ONLY');
    }
    expect(viewSource).toContain('title="Remove registration?"');
    expect(viewSource).toContain('confirm-label="Remove registration"');
    expect(viewSource).toContain('>\n                  Remove\n');
  });

  it('separates today’s capacity overview from the allocation editor', () => {
    expect(viewSource).toContain("MANAGE TODAY\\'S ALLOCATION");
    expect(viewSource).toContain('Allocate today’s usable capacity');
    expect(viewSource).toContain('Available for blasts');
    expect(viewSource).toContain('Reserved for transactional email');
    expect(viewSource).toContain('blastAllocationEditorOpen');
  });

  it('renders paginated, selectable blast activity', () => {
    expect(viewSource).toContain('BLAST_ACTIVITY_PAGE_SIZE = 10');
    expect(viewSource).toContain('paginatedBlasts');
    expect(viewSource).toContain('Blast activity pagination');
    expect(viewSource).toContain('openBlastActivity(blast)');
    expect(viewSource).toContain('<BlastActivityDrawer');
  });

  it('keeps failures actionable in the detail drawer', () => {
    expect(drawerSource).toContain('Error details');
    expect(drawerSource).toContain('blast.preparation_error');
    expect(drawerSource).toContain('needs_capacity');
    expect(drawerSource).toContain('RETRY DELIVERY');
    expect(drawerSource).toContain('prefers-reduced-motion');
  });
});
