import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createMemoryHistory, createRouter } from 'vue-router';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { describe, expect, it } from 'vitest';
import { defaultAnnualConferenceTicketingSettings } from '@/lib/annual-conference-ticketing';
import { queryKeys, type AnnualConferenceTicketOrderOverview } from './lib/api';
import TicketingView from './views/admin/AdminAnnualConferenceTicketingView.vue';
import BoneyardTicketOrdersFixture from './components/ui/BoneyardTicketOrdersFixture.vue';

const order: AnnualConferenceTicketOrderOverview = {
  id: 'order-mobile', purchaser_name: 'Sample purchaser', purchaser_email: 'long.purchaser.address@example.test',
  tier_key: 'regular', quantity: 1, amount_minor: 15000, currency: 'GHS', status: 'paid',
  payment_reference: null, paid_at: null, created_at: '2026-10-28T12:00:00Z', delivery_status: 'delivered', seats: [],
};

async function renderOrders() {
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
    inventory: { public_capacity: 200, paid_seats: 1, sponsor_seats_held: 0, checkout_seats_held: 0, remaining_public_seats: 199, reduction_floor: 1 },
  });
  queryClient.setQueryData(queryKeys.annualConferenceTicketOrders('2026', 1), { orders: [order], total: 1, page: 1, page_size: 5 });
  await router.push('/organizer-console/annual-conference/2026/ticketing?section=orders');
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

    for (const value of ['Sample purchaser', 'long.purchaser.address@example.test', 'Regular pass', '150.00', 'delivered', 'Pass', 'Amount', 'Delivery', 'Check-in']) {
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

  it('uses the same card geometry for loading and loaded content without inventing avatars', async () => {
    const html = await renderToString(createSSRApp(BoneyardTicketOrdersFixture, { rows: 1 }));
    const source = readFileSync(new URL('./views/admin/AdminAnnualConferenceTicketingView.vue', import.meta.url), 'utf8');
    const fixture = readFileSync(new URL('./components/ui/BoneyardTicketOrdersFixture.vue', import.meta.url), 'utf8');
    const styles = readFileSync(new URL('./styles/ticket-order-cards.css', import.meta.url), 'utf8');

    for (const value of ['ticket-order-card__email', 'ticket-order-card__facts', 'Pass', 'Amount', 'Delivery', 'Check-in', 'View order']) {
      expect(html).toContain(value);
    }
    expect(source).toContain('styles/ticket-order-cards.css');
    expect(fixture).toContain('styles/ticket-order-cards.css');
    expect(styles).toMatch(/\.ticket-order-card__open\s*\{[^}]*min-height: 44px;/s);
    expect(styles).toContain('overflow-wrap: anywhere');
    expect(html).not.toContain('avatar');
  });
});
