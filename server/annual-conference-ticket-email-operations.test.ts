import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ticketEmailDeliveryForOperator } from '@/lib/supabase/annual-conference-ticketing';

const migrationSource = readFileSync(
  new URL('../supabase/migrations/20261006170000_annual_conference_ticket_email_delivery_operations.sql', import.meta.url),
  'utf8',
);
const routeSource = readFileSync(
  new URL('./routes/annual-conference-ticketing.ts', import.meta.url),
  'utf8',
);
const adapterSource = readFileSync(
  new URL('../lib/supabase/annual-conference-ticketing.ts', import.meta.url),
  'utf8',
);

describe('annual conference ticket email delivery operations', () => {
  it('bounds claims and retries to definite pre-acceptance failures', () => {
    expect(migrationSource).toContain('annual_conference_ticket_email_outbox_attempt_limit check (attempt_count <= 5)');
    expect(migrationSource).toContain("and provider_email_id is null");
    expect(migrationSource).toContain("and accepted_at is null");
    expect(migrationSource).toContain("ticket_email_retry_provider_ambiguous");
    expect(migrationSource).toContain("ticket_email_retry_limit_reached");
  });

  it('keeps the retry command service-role-only', () => {
    expect(migrationSource).toContain('revoke all on function public.retry_annual_conference_ticket_email_outbox(uuid, uuid) from public, anon, authenticated;');
    expect(migrationSource).toContain('grant execute on function public.retry_annual_conference_ticket_email_outbox(uuid, uuid) to service_role;');
  });

  it('offers Owner-only, edition-scoped delivery operations', () => {
    expect(routeSource).toContain("/ticketing/email-deliveries'");
    expect(routeSource).toContain("/ticketing/email-deliveries/:deliveryId/retry'");
    expect(routeSource).toContain("requireAdmin(c, ['owner'])");
    expect(routeSource).toContain("annual_conference.ticketing.email_delivery_retry");
  });

  it('never selects private delivery payloads or claim capabilities for the operator list', () => {
    expect(adapterSource).toContain(".eq('edition_id', input.editionId)");
    expect(adapterSource).toContain("Never expose the email payload, idempotency key, QR capability, or claim lease.");
    expect(adapterSource).not.toContain(".select('*').eq('edition_id', input.editionId)");
  });

  it('redacts sender capabilities from a retry response even when the RPC returns the full outbox row', () => {
    const delivery = ticketEmailDeliveryForOperator({
      id: 'delivery-1',
      order_id: 'order-1',
      kind: 'ticket_delivery',
      recipient_name: 'Ada Lovelace',
      recipient_email: 'ada@example.test',
      status: 'queued',
      attempt_count: 2,
      provider_email_id: null,
      last_error: null,
      next_attempt_at: '2026-10-06T10:00:00.000Z',
      accepted_at: null,
      delivered_at: null,
      created_at: '2026-10-06T09:00:00.000Z',
      updated_at: '2026-10-06T10:00:00.000Z',
      payload: { ticket_qr_token: 'secret-qr-token' },
      idempotency_key: 'secret-idempotency-key',
      claim_token: 'secret-claim-token',
      claimed_until: '2026-10-06T10:10:00.000Z',
      qr_token: 'secret-qr-token',
      qr_token_hash: 'secret-qr-token-hash',
    });

    const serialized = JSON.stringify({ delivery });

    expect(serialized).not.toContain('secret-qr-token');
    expect(serialized).not.toContain('secret-idempotency-key');
    expect(serialized).not.toContain('secret-claim-token');
    expect(serialized).not.toContain('claimed_until');
    expect(delivery).toMatchObject({ id: 'delivery-1', status: 'queued', attempt_count: 2 });
  });
});
