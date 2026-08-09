import type { EmailDeliveryHealth, EmailOutboxSummary } from './delivery-health';

export const DEFAULT_BLAST_TRANSACTIONAL_RESERVE = 35;

export type BlastCapacity = {
  known: boolean;
  daily_limit: number;
  daily_used: number | null;
  protected_reserve: number;
  queued_transactional: number;
  safe_recipients_today: number | null;
  can_send_now: boolean;
  reason: 'capacity_unknown' | 'within_safe_capacity' | 'protect_transactional_email' | 'daily_quota_exhausted';
};

export function blastTransactionalReserve(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed < 100
    ? parsed
    : DEFAULT_BLAST_TRANSACTIONAL_RESERVE;
}

export function assessBlastCapacity(input: {
  recipientCount: number;
  health: EmailDeliveryHealth | null;
  outbox: EmailOutboxSummary | null;
  protectedReserve: number;
}): BlastCapacity {
  if (!input.health || input.health.daily_quota_used === null) {
    return {
      known: false,
      daily_limit: input.health?.daily_quota_limit ?? 100,
      daily_used: null,
      protected_reserve: input.protectedReserve,
      queued_transactional: input.outbox?.pending ?? 0,
      safe_recipients_today: null,
      can_send_now: true,
      reason: 'capacity_unknown',
    };
  }
  const queued = input.outbox?.pending ?? 0;
  const safe = Math.max(0, input.health.daily_quota_limit - input.health.daily_quota_used - input.protectedReserve - queued);
  const exhausted = input.health.daily_quota_used >= input.health.daily_quota_limit;
  return {
    known: true,
    daily_limit: input.health.daily_quota_limit,
    daily_used: input.health.daily_quota_used,
    protected_reserve: input.protectedReserve,
    queued_transactional: queued,
    safe_recipients_today: safe,
    can_send_now: input.recipientCount <= safe,
    reason: exhausted ? 'daily_quota_exhausted' : input.recipientCount <= safe ? 'within_safe_capacity' : 'protect_transactional_email',
  };
}
