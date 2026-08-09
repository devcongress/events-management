import { describe, expect, it } from 'vitest';
import { assessBlastCapacity, blastTransactionalReserve } from './blast-capacity';

describe('blast capacity policy', () => {
  it('protects the transactional reserve and queued delivery work', () => {
    expect(assessBlastCapacity({ recipientCount: 46, protectedReserve: 35, outbox: { pending: 4, failed: 0 }, health: { provider: 'resend', daily_quota_used: 15, daily_quota_limit: 100, monthly_quota_used: 10, monthly_quota_limit: 3000, daily_level: 'healthy', monthly_level: 'healthy', last_provider_response_at: null, updated_at: '2026-08-09T00:00:00Z' } })).toMatchObject({ safe_recipients_today: 46, can_send_now: true });
    expect(assessBlastCapacity({ recipientCount: 47, protectedReserve: 35, outbox: { pending: 4, failed: 0 }, health: { provider: 'resend', daily_quota_used: 15, daily_quota_limit: 100, monthly_quota_used: 10, monthly_quota_limit: 3000, daily_level: 'healthy', monthly_level: 'healthy', last_provider_response_at: null, updated_at: '2026-08-09T00:00:00Z' } })).toMatchObject({ can_send_now: false, reason: 'protect_transactional_email' });
  });

  it('allows a send when provider usage has not been observed yet', () => {
    expect(assessBlastCapacity({ recipientCount: 100, protectedReserve: 35, outbox: null, health: null })).toMatchObject({ known: false, can_send_now: true });
  });

  it('uses a bounded configured reserve', () => {
    expect(blastTransactionalReserve('20')).toBe(20);
    expect(blastTransactionalReserve('100')).toBe(35);
  });
});
