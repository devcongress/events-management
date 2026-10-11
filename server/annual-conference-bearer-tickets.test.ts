import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationSource = readFileSync(
  new URL('../supabase/migrations/20261011130000_annual_conference_bearer_ticket_issuance.sql', import.meta.url),
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
const viewSource = readFileSync(
  new URL('../src/views/admin/AdminAnnualConferenceTicketingView.vue', import.meta.url),
  'utf8',
);
const apiSource = readFileSync(
  new URL('../src/lib/api.ts', import.meta.url),
  'utf8',
);

describe('annual conference bearer ticket operations', () => {
  it('issues an independently hashed bearer capability for every paid seat and queues one buyer bundle', () => {
    expect(migrationSource).toContain('add column is_bearer_ticket boolean not null default false');
    expect(migrationSource).toContain("qr_token := encode(gen_random_bytes(32), 'hex')");
    expect(migrationSource).toContain("'ticket_bundle_delivery'");
    expect(migrationSource).toContain("'tickets', bundle_payload");
    expect(migrationSource).toContain("concat('annual-conference-ticket-bundle-delivery:', ticket_order.id)");
  });

  it('removes all QR capabilities after provider acceptance and preserves only definite pre-acceptance retries', () => {
    expect(migrationSource).toContain("kind in ('ticket_delivery', 'ticket_bundle_delivery') then payload - 'qr_token' - 'tickets'");
    expect(migrationSource).toContain("p_status = 'accepted' and nullif(btrim(p_provider_email_id), '') is null");
  });

  it('makes check-in atomic and neutral to unknown or stale QR capabilities', () => {
    expect(migrationSource).toContain('check_in_annual_conference_bearer_ticket');
    expect(migrationSource).toContain("return query select 'invalid'::text, null::uuid, null::uuid, null::integer");
    expect(migrationSource).toContain("set status = 'checked_in'");
    expect(migrationSource).toContain("'already_checked_in'::text");
    expect(migrationSource).toContain('grant execute on function public.check_in_annual_conference_bearer_ticket(uuid, text, text) to service_role;');
  });

  it('keeps check-in Owner-gated, validated, and audited without recording QR credentials', () => {
    expect(routeSource).toContain("/ticketing/check-in'");
    expect(routeSource).toContain("requireAdmin(c, ['owner'])");
    expect(routeSource).toContain("qr_token: z.string().regex(/^[0-9a-f]{64}$/");
    expect(routeSource).toContain("annual_conference.ticketing.ticket_check_in");
    expect(routeSource).not.toContain('metadata: { qr_token');
    expect(adapterSource).toContain("'check_in_annual_conference_bearer_ticket'");
  });

  it('keeps real order operations distinct from test checkout and opens five-row pages in a right drawer', () => {
    expect(viewSource).toContain('Admissions operations');
    expect(viewSource).toContain('Ticket orders');
    expect(viewSource).toContain('Test checkout activity remains in its separate sandbox section.');
    expect(apiSource).toContain('ANNUAL_CONFERENCE_TICKET_ORDER_PAGE_SIZE = 5');
    expect(viewSource).toContain('openTicketOrder');
    expect(viewSource).toContain('ticket-order-drawer-title');
    expect(viewSource).toContain('5 per page');
  });
});
