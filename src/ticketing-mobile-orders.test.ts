import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createMemoryHistory, createRouter } from 'vue-router';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { describe, expect, it } from 'vitest';
import { defaultAnnualConferenceTicketingSettings } from '@/lib/annual-conference-ticketing';
import { queryKeys, type AnnualConferenceTicketOrderOverview } from './lib/api';
import TicketingView from './views/admin/AdminAnnualConferenceTicketingView.vue';
import { ticketOrderPageAfterResponse } from './lib/ticket-order-pagination';
import BoneyardTicketOrdersFixture from './components/ui/BoneyardTicketOrdersFixture.vue';

const order: AnnualConferenceTicketOrderOverview = {
  id: 'order-mobile', purchaser_name: 'Sample purchaser', purchaser_email: 'long.purchaser.address@example.test',
  tier_key: 'regular', quantity: 1, amount_minor: 15000, amount_paid_minor: 15000, currency: 'GHS', status: 'paid',
  payment_reference: null, paid_at: null, created_at: '2026-10-28T12:00:00Z', delivery_status: 'delivered', seats: [],
};

async function renderOrders(renderedOrder = order) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, gcTime: Infinity } } });
  const edition = { year: 2026, label: 'December 2026' };
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/organizer-console/annual-conference/:year/ticketing', component: {} },
    { path: '/:pathMatch(.*)*', component: {} },
  ] });

  queryClient.setQueryData(queryKeys.adminSession, { authenticated: true, user: { role: 'owner' } });
  queryClient.setQueryData(queryKeys.annualConferenceEditions, { editions: [edition] });
  queryClient.setQueryData(queryKeys.annualConferenceWorkPlan('2026'), { edition, permissions: { capabilities: ['ticketing.manage'] } });
  queryClient.setQueryData(queryKeys.annualConferenceTicketing('2026'), {
    settings: defaultAnnualConferenceTicketingSettings('edition'),
    inventory: { public_capacity: 200, paid_seats: 1, sponsor_seats_held: 2, checkout_seats_held: 3, remaining_public_seats: 194, reduction_floor: 6 },
  });
  queryClient.setQueryData(queryKeys.annualConferenceTicketOrders('2026', 1, 'paid'), { orders: [renderedOrder], total: 1, page: 1, page_size: 5 });
  await router.push(`/organizer-console/annual-conference/2026/ticketing?section=orders`);
  const app = createSSRApp(TicketingView, { class: 'page-view' });

  app.use(router);
  app.use(VueQueryPlugin, { queryClient });
  try {
    return await renderToString(app);
  } finally {
    queryClient.clear();
  }
}

describe('Ticket orders on phones', () => {
  it('renders complete buyer-first cards with a visible drawer action while retaining the desktop ledger', async () => {
    const html = await renderOrders();
    const cards = html.match(/<ul\b[^>]*aria-label="Ticket orders"[\s\S]*?<\/ul>/)?.[0] ?? '';

    for (const value of ['Sample purchaser', 'long.purchaser.address@example.test', 'Regular pass', '150.00', 'Delivered', 'Pass', 'Payment', 'Latest order email']) {
      expect(cards).toContain(value);
    }
    expect(cards).toContain('ticket-order-cards md:hidden');
    expect(cards).toContain('aria-label="View order from Sample purchaser"');
    expect(cards).toContain('View order');
    expect(html).toContain('hidden w-full min-w-[720px] text-left text-sm md:table');
    expect(cards).not.toContain('<table');
    expect(html).toMatch(/^<div\b[^>]*class="editorial-page page-view"/);
    const navigation = html.match(/<nav\b[^>]*aria-label="Ticketing sections"[\s\S]*?<\/nav>/)?.[0] ?? '';

    expect(navigation.match(/aria-current="page"/g)).toHaveLength(1);
    expect(navigation.match(/aria-current="false"/g)).toHaveLength(4);
  });

  it.each([
    ['pending_payment', '2000-01-01T00:00:00Z', 'Checkout expired'],
    ['pending_payment', null, 'Awaiting payment'],
    ['pending_payment', 'invalid', 'Awaiting payment'],
    ['pending_payment', '2999-01-01T00:00:00Z', 'Awaiting payment'],
    ['paid', null, 'Paid'],
    ['refunded', null, 'Refunded'],
    ['expired', null, 'Checkout expired'],
    ['cancelled', null, 'Cancelled'],
  ] as const)('shows %s payment status in both layouts', async (status, expiresAt, label) => {
    const html = await renderOrders({ ...order, status, expires_at: expiresAt });

    expect(html.match(new RegExp(label, 'g'))?.length).toBeGreaterThanOrEqual(2);
  });

  it('distinguishes verified charges, quotes, refunds, and test payments', async () => {
    const paid = await renderOrders({ ...order, amount_paid_minor: 16000, quoted_gross_amount_minor: 16000 });
    const quote = await renderOrders({ ...order, status: 'pending_payment', amount_paid_minor: null, quoted_gross_amount_minor: 16000 });
    const refund = await renderOrders({ ...order, status: 'expired', paid_at: '2026-10-28T12:00:00Z', amount_paid_minor: 16000, refund_status: 'required' });
    const test = await renderOrders({ ...order, payment_mode: 'test', amount_paid_minor: 16000 });

    const missingAmount = await renderOrders({ ...order, status: 'paid', amount_paid_minor: null, quoted_gross_amount_minor: 16000 });
    const missingRefundAmount = await renderOrders({ ...order, status: 'expired', paid_at: '2026-10-28T12:00:00Z', amount_paid_minor: null, refund_status: 'required' });

    expect(missingAmount).toContain('Paid amount unavailable');
    expect(missingAmount).not.toContain('160.00 quoted');
    expect(missingRefundAmount).toContain('Paid amount unavailable');
    expect(paid).toContain('160.00');
    expect(paid).not.toContain('160.00 received');
    expect(quote).toContain('160.00 quoted');
    expect(refund).toContain('Refund required');
    const partial = await renderOrders({ ...order, quantity: 2, refunded_seat_count: 1 });
    const unfulfilled = await renderOrders({ ...order, status: 'expired', paid_at: '2026-10-28T12:00:00Z' });
    const full = await renderOrders({ ...order, status: 'refunded', refunded_seat_count: 1 });

    expect(partial).toContain('Partially refunded');
    expect(full).toContain('Refunded');
    expect(unfulfilled).toContain('Payment confirmed · unfulfilled');
    expect(test).toContain('GH₵0 charged · test');
    expect(paid).not.toContain('Check-in');
  });

  it('renders page-level order controls with real buttons and no visible action heading', async () => {
    const html = await renderToString(createSSRApp(BoneyardTicketOrdersFixture, { rows: 1, panel: true }));
    const nested = await renderToString(createSSRApp(BoneyardTicketOrdersFixture, { rows: 1 }));

    for (const value of ['Ticket orders', 'Refresh', 'Paid orders', 'Checkout attempts', 'Test orders']) {
      expect(html).toContain(value);
    }
    expect(html).not.toContain('⌄');
    expect(html).toMatch(/<span class="sr-only"[^>]*>Open details<\/span>/);
    expect(nested).not.toContain('Checkout attempts');
  });

  it('uses the same card geometry for loading and loaded content without inventing avatars', async () => {
    const html = await renderToString(createSSRApp(BoneyardTicketOrdersFixture, { rows: 1 }));
    const source = readFileSync(new URL('./views/admin/AdminAnnualConferenceTicketingView.vue', import.meta.url), 'utf8');
    const fixture = readFileSync(new URL('./components/ui/BoneyardTicketOrdersFixture.vue', import.meta.url), 'utf8');
    const styles = readFileSync(new URL('./styles/ticket-order-cards.css', import.meta.url), 'utf8');

    for (const value of ['ticket-order-card__email', 'ticket-order-card__facts', 'Pass', 'Payment', 'Latest order email', 'View order']) {
      expect(html).toContain(value);
    }
    expect(source).toContain('styles/ticket-order-cards.css');
    expect(fixture).toContain('styles/ticket-order-cards.css');
    expect(styles).toMatch(/\.ticket-order-card__open\s*\{[^}]*min-height: 44px;/s);
    expect(styles).toContain('overflow-wrap: anywhere');
    expect(html).not.toContain('avatar');
  });
});

describe('order pagination after a response', () => {
  it('clamps a shrinking result set and ignores responses for a previous filter or page', () => {
    const current = { year: '2026', page: 2, view: 'attempts' };

    expect(ticketOrderPageAfterResponse(current, current, 5, 5)).toBe(1);
    expect(ticketOrderPageAfterResponse(current, current, 6, 5)).toBe(2);
    expect(ticketOrderPageAfterResponse(current, { ...current, view: 'paid' }, 0, 5)).toBe(2);
    expect(ticketOrderPageAfterResponse(current, { ...current, page: 1 }, 0, 5)).toBe(2);
    expect(ticketOrderPageAfterResponse(current, { ...current, year: '2025' }, 0, 5)).toBe(2);
  });
});
