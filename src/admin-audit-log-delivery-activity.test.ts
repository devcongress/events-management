import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const viewSource = readFileSync(
  new URL('./views/admin/AdminAuditLogView.vue', import.meta.url),
  'utf8',
);

describe('Audit Log delivery activity', () => {
  it('keeps message and blast history inside one switchable container', () => {
    expect(viewSource).toContain("type DeliveryActivityView = 'messages' | 'blasts'");
    expect(viewSource).toContain('deliveryActivityView');
    expect(viewSource).toContain('>\n                      Messages\n                    </button>');
    expect(viewSource).toContain('>\n                      Event blasts\n                    </button>');
    expect(viewSource).not.toContain('audit-log-delivery-history audit-log-broadcast-history');
  });

  it('paginates each delivery history independently', () => {
    expect(viewSource).toContain('const blastDeliveryPage = ref(1)');
    expect(viewSource).toContain('paginatedRecentEventBlasts');
    expect(viewSource).toContain('aria-label="Event blast pagination"');
  });

  it('keeps a fixed-height context strip so switching views does not shift the table', () => {
    expect(viewSource).toContain('audit-log-delivery-history__context');
    expect(viewSource).toContain('min-height: 2.75rem');
    expect(viewSource).not.toContain('audit-log-delivery-history-view-enter-active');
    expect(viewSource).toContain('prefers-reduced-motion');
  });
});
