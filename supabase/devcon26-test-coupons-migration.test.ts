import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('./migrations/20261010120000_devcon26_test_checkout_coupons.sql', import.meta.url), 'utf8');

describe('test coupon migration isolation', () => {
  it('adds no dependency or mutation in the live admission, finance, or email domains', () => {
    expect(migration).not.toMatch(/public\.annual_conference_|public\.admin_|public\.email_/);
    expect(migration).toContain('devcon26_test_coupon_codes enable row level security');
    expect(migration).toContain('devcon26_test_coupon_claims enable row level security');
    expect(migration).toContain('from public, anon, authenticated');
    expect(migration).toContain('grant select on public.devcon26_test_coupon_codes, public.devcon26_test_coupon_claims to service_role');
    expect(migration).not.toContain('grant insert');
    expect(migration).not.toContain('grant update');
  });

  it('keeps quote read-only and locks redemption state in coupon-before-session order', () => {
    const quote = migration.split('create function public.quote_devcon26_test_checkout')[1].split('drop function')[0];

    expect(quote).not.toMatch(/insert into|update public|delete from/);
    expect(migration).toContain('coupon -> session -> claim');
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain("interval '15 minutes'");
    expect(migration).toContain('test_checkout_terms_immutable');
    expect(migration).toContain('test_coupon_terms_immutable');
  });

  it('preserves legacy amounts and prevents non-positive discounted payments', () => {
    expect(migration).toContain('set base_amount_minor = amount_minor');
    expect(migration).toContain('amount_minor = base_amount_minor - discount_amount_minor and amount_minor > 0');
    expect(migration).toContain('discount_value < 10000');
    expect(migration).toContain('coupon_allowance_unavailable');
    expect(migration).toContain('session.amount_minor is distinct from p_amount_minor');
  });

  it('updates the latest provider observation status and matching fingerprint atomically', () => {
    expect(migration).toMatch(/update public\.devcon26_test_payment_events set status = result_status, payload_sha256 = p_payload_sha256\s+where provider_event_id = p_event_id/);
  });
});
