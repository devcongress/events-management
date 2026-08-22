import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const viewSource = readFileSync(
  new URL('./views/admin/AdminCommunityEventView.vue', import.meta.url),
  'utf8',
);

describe('community event monitoring actions', () => {
  it('exposes the response options beside a monitoring signal', () => {
    expect(viewSource).toContain('NEXT STEPS');
    expect(viewSource).toContain('What changed on the source page');
    expect(viewSource).toContain('Verify the source');
    expect(viewSource).toContain('Resolve the listing');
    expect(viewSource).toContain('OPEN SOURCE PAGE ↗');
    expect(viewSource).toContain('MESSAGE ORGANIZER →');
    expect(viewSource).toContain('EDIT LISTING →');
    expect(viewSource).toContain('TEMPORARILY UNPUBLISH');
    expect(viewSource).toContain('Temporarily unpublish this listing?');
  });

  it('prefills organizer outreach with the detected differences', () => {
    expect(viewSource).toContain('const organizerMailto = computed');
    expect(viewSource).toContain('pageMonitor.value?.differences.map');
    expect(viewSource).toContain('monitorDifferenceValue(difference.field, difference.expected');
    expect(viewSource).toContain('private event-management link from your approval email');
  });
});
