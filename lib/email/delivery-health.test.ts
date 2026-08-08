import { describe, expect, it } from 'vitest';
import { emailHealthLevel, parseResendQuotaUsage, sortRecentEmailDeliveries } from './delivery-health';

describe('email delivery health', () => {
  it('parses the numeric usage component from Resend quota headers', () => {
    expect(parseResendQuotaUsage('83')).toBe(83);
    expect(parseResendQuotaUsage('83 / 100')).toBe(83);
    expect(parseResendQuotaUsage(null)).toBeNull();
    expect(parseResendQuotaUsage('unknown')).toBeNull();
  });

  it('uses calm, escalating quota states', () => {
    expect(emailHealthLevel(69, 100)).toBe('healthy');
    expect(emailHealthLevel(70, 100)).toBe('warning');
    expect(emailHealthLevel(85, 100)).toBe('high');
    expect(emailHealthLevel(100, 100)).toBe('exhausted');
  });

  it('keeps the delivery history ordered by its most recent provider activity', () => {
    const ordered = sortRecentEmailDeliveries([
      {
        id: 'older',
        source: 'registration',
        label: 'Registration confirmation',
        status: 'accepted',
        attempts: 1,
        occurred_at: '2026-08-08T09:00:00.000Z',
        last_error: null,
      },
      {
        id: 'newer',
        source: 'speaker_archive',
        label: 'Archive request',
        status: 'failed',
        attempts: 2,
        occurred_at: '2026-08-08T10:00:00.000Z',
        last_error: 'Provider unavailable',
      },
    ]);

    expect(ordered.map((delivery) => delivery.id)).toEqual(['newer', 'older']);
  });
});
