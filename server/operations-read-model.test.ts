import { describe, expect, it, vi } from 'vitest';
import { createOperationsReadModel } from './operations-read-model';

describe('operations read model', () => {
  it('returns audit and delivery concerns as one bounded snapshot', async () => {
    const listAudit = vi.fn(async () => [{ id: 'audit-1' }]);
    const model = createOperationsReadModel({
      listAudit,
      emailHealth: async () => ({ daily: { used: 2, limit: 100 } }),
      emailOutbox: async () => ({ pending: 1, failed: 0 }),
      recentEmailDeliveries: async () => [{ id: 'delivery-1' }],
      recentEventBlasts: async (limit: number) => [{ id: `blast-${limit}` }],
      blastCapacity: ({ health, outbox }) => ({ health, outbox, safe: 42 }),
    });

    await expect(model.load({ limit: 80, action: 'event_submission.reject' })).resolves.toEqual({
      logs: [{ id: 'audit-1' }],
      email_health: { daily: { used: 2, limit: 100 } },
      email_outbox: { pending: 1, failed: 0 },
      blast_capacity: {
        health: { daily: { used: 2, limit: 100 } },
        outbox: { pending: 1, failed: 0 },
        safe: 42,
      },
      recent_email_deliveries: [{ id: 'delivery-1' }],
      recent_event_blasts: [{ id: 'blast-10' }],
      auth_mode: 'supabase',
    });
    expect(listAudit).toHaveBeenCalledWith({ limit: 80, action: 'event_submission.reject' });
  });
});
