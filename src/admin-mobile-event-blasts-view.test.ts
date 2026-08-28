import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const viewSource = readFileSync(
  new URL('./views/admin/AdminMobileEventBlastsView.vue', import.meta.url),
  'utf8',
);

describe('phone event blasts workspace', () => {
  it('reuses the protected event blast contract', () => {
    expect(viewSource).toContain('fetchEventBlasts');
    expect(viewSource).toContain('createEventBlast');
    expect(viewSource).toContain('retryEventBlast');
    expect(viewSource).toContain('updateEventRegistrationCampaign');
    expect(viewSource).toContain('<BlastEmailPreview');
    expect(viewSource).toContain('confirmedRecipients.value <= 100');
  });

  it('keeps the complete phone compose and delivery workflow', () => {
    expect(viewSource).toContain('eventBlastStarters');
    expect(viewSource).toContain('Send later (optional)');
    expect(viewSource).toContain('Preview email');
    expect(viewSource).toContain('Recent blasts');
    expect(viewSource).toContain('Retry send');
    expect(viewSource).toContain("Allocate today's quota");
    expect(viewSource).toContain('Latest delivery');
  });

  it('keeps reserve and safe-send allocation coupled with refreshed capacity', () => {
    expect(viewSource).toContain('blastReserveSaveSummary');
    expect(viewSource).toContain('blastSafeToSend');
    expect(viewSource).toContain('allocatable_recipients_today');
    expect(viewSource).toContain('daily_quota_remaining');
    expect(viewSource).toContain('updateSafeAllocation');
    expect(viewSource).toContain('updateReserveAllocation');
    expect(viewSource).toContain('registrationQuery.refetch()');
    expect(viewSource).toContain('blastsQuery.refetch()');
    expect(viewSource).toContain('safe to send today');
    expect(viewSource).toContain('role="status"');
  });

  it('warns before abandoning a draft and preserves phone ergonomics', () => {
    expect(viewSource).toContain('<ConfirmDialog');
    expect(viewSource).toContain('title="Discard this draft?"');
    expect(viewSource).toContain('@confirm="finishPendingLeave(true)"');
    expect(viewSource).toContain('@cancel="finishPendingLeave(false)"');
    expect(viewSource).not.toContain('window.confirm(');
    expect(viewSource).toContain("window.addEventListener('beforeunload', warnBeforeBrowserExit)");
    expect(viewSource).toContain('min-height: 2.75rem');
    expect(viewSource).toContain('env(safe-area-inset-bottom)');
    expect(viewSource).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
