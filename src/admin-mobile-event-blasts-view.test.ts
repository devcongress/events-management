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
    expect(viewSource).toContain('<BlastEmailPreview');
    expect(viewSource).toContain('confirmedRecipients.value <= 100');
  });

  it('keeps the complete phone compose and delivery workflow', () => {
    expect(viewSource).toContain('eventBlastStarters');
    expect(viewSource).toContain('Send later (optional)');
    expect(viewSource).toContain('Preview email');
    expect(viewSource).toContain('Recent blasts');
    expect(viewSource).toContain('Retry send');
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
