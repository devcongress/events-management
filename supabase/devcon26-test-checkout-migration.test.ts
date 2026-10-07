import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { DEVCON26_TICKET_TIERS } from '@/lib/annual-conference-ticketing';

const migration = await readFile(new URL('./migrations/20261007050000_devcon26_test_checkout.sql', import.meta.url), 'utf8');

describe('isolated DevCon26 test persistence contract', () => {
  it('cannot mutate live tickets, seats, revenue, refunds, or email outboxes', () => {
    expect(migration).not.toMatch(/public\.annual_conference_/);
    expect(migration).toContain('devcon26_test_checkout_sessions');
    expect(migration).toContain('devcon26_test_payment_events');
    expect(migration).toContain('enable row level security');
    expect(migration).toContain('from public, anon, authenticated');
    expect(migration).toContain('to service_role');
  });

  it('locks initialization and confirmation, binds retries, and deduplicates provider events', () => {
    expect(migration.match(/for update/g)).toHaveLength(2);
    expect(migration).toContain('checkout_request_key uuid not null unique');
    expect(migration).toContain('payment_reference text not null unique');
    expect(migration).toContain('provider_event_id text primary key');
    expect(migration).toContain('test_checkout_cart_conflict');
    expect(migration).toContain('test_checkout_in_progress');
    expect(migration).toContain('test_checkout_event_conflict');
    expect(migration).toContain("p_domain is distinct from 'test'");
    expect(migration).toContain('session.amount_minor = p_amount_minor and session.currency = p_currency');

    for (const tier of DEVCON26_TICKET_TIERS) {
      expect(migration).toContain(`when '${tier.key}' then price := ${tier.price_minor}; seats := ${tier.quantity};`);
    }
  });
});
