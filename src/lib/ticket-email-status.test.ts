import { describe, expect, it } from 'vitest';
import { ticketEmailStatusLabel } from './ticket-email-status';

describe('ticket email status labels', () => {
  it('distinguishes a scheduled retry from a parked failure', () => {
    expect(ticketEmailStatusLabel({ status: 'failed', next_attempt_at: '2026-11-10T15:00:00Z' })).toBe('Awaiting retry');
    expect(ticketEmailStatusLabel({ status: 'failed', next_attempt_at: 'infinity' })).toBe('Needs review');
  });
});
