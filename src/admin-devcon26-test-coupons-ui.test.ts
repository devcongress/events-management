import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { renderToString } from 'vue/server-renderer';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { describe, expect, it } from 'vitest';
import type { Devcon26TestCheckoutLedgerRow, Devcon26TestCouponsResponse } from '@/lib/devcon26-test-coupons';
import { DEVCON26_TEST_CHECKOUT_PAGE_SIZE } from './lib/api';
import Devcon26TestCoupons from './components/Devcon26TestCoupons.vue';
import OrganizerBreadcrumbs from './components/OrganizerBreadcrumbs.vue';

const source = readFileSync(new URL('./components/Devcon26TestCoupons.vue', import.meta.url), 'utf8');
const ticketing = readFileSync(new URL('./views/admin/AdminAnnualConferenceTicketingView.vue', import.meta.url), 'utf8');

function checkoutFixture(index: number, overrides: Partial<Devcon26TestCheckoutLedgerRow> = {}): Devcon26TestCheckoutLedgerRow {
  return {
    id: `checkout-${index}`,
    payment_reference: `devcon26-test-reference-${index}`,
    purchaser_name: `Test purchaser ${index}`,
    purchaser_email: `purchaser-${index}@example.test`,
    tier_key: 'team_3',
    quantity: 3,
    coupon_code: null,
    base_amount_minor: 54999,
    discount_amount_minor: 1000,
    amount_minor: 53999,
    currency: 'GHS',
    status: 'verified',
    resolution_reason: null,
    expires_at: '2026-10-10T12:15:00Z',
    verified_at: '2026-10-10T12:05:00Z',
    created_at: '2026-10-10T12:00:00Z',
    ...overrides,
  };
}

async function renderCheckouts(checkouts: Devcon26TestCheckoutLedgerRow[], total = checkouts.length) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  const data: Devcon26TestCouponsResponse = {
    coupons: [], total: 0, page: 1, page_size: 8,
    checkouts, checkout_total: total, checkout_page: 1, checkout_page_size: DEVCON26_TEST_CHECKOUT_PAGE_SIZE,
  };

  queryClient.setQueryData(['devcon26-test-coupons', '2026', 1, 1, DEVCON26_TEST_CHECKOUT_PAGE_SIZE], data);
  const app = createSSRApp(Devcon26TestCoupons, { year: '2026' });

  app.use(VueQueryPlugin, { queryClient });
  try {
    return await renderToString(app);
  } finally {
    queryClient.clear();
  }
}

describe('Owner test coupon interface boundary', () => {
  it('keeps coupon operations on the 2026 Owner Ticketing page with test-only copy', () => {
    expect(ticketing).toContain('<div v-if="!restricted && year === \'2026\' && testingVisited" v-show="activeSection === \'testing\'" class="min-w-0">');
    expect(ticketing).toContain('<Devcon26TestCoupons :year="year" :active="activeSection === \'testing\'" />');
    expect(source).toContain("watch(() => props.active");
    expect(source).toContain('if (!active) closeCheckoutDetails(false)');
    expect(source).toContain(':key="`discount-type-${active}`"');
    expect(source).toContain(':key="`expiry-${active}`"');
    expect(source).toContain('Test checkout coupons');
    expect(source).toContain('These checkouts do not issue admission tickets.');
    expect(source).not.toMatch(/deleteDevcon26|updateDevcon26.*Discount|PAYSTACK_SECRET_KEY|sk_test_/);
  });

  it('labels every coupon input, announces outcomes, and focuses the invalid field', () => {
    for (const id of ['discount', 'max']) {
      expect(source).toContain(`for="test-coupon-${id}"`);
      expect(source).toContain(`id="test-coupon-${id}"`);
    }
    expect(source).toContain('<legend class="editorial-label">Eligible passes</legend>');
    expect(source).toContain('role="alert"');
    expect(source).toContain('role="status"');
    expect(source).toContain('?.focus()');
    expect(source).toContain('[data-coupon-field="${field}"] button');
    expect(source).toContain('label="Discount type"');
    expect(source).toContain('label="Expiry (local time)"');
    expect(source).toContain(':error="expiryError"');
  });

  it('uses shared app controls and generates codes on creation rather than accepting manual entry', () => {
    expect(source).toContain('<AppDropdown');
    expect(source).toContain('<AppDatePicker');
    expect(source).toContain('mode="datetime"');
    expect(source).not.toContain('<select');
    expect(source).not.toContain('datetime-local');
    expect(source).not.toContain('form.code');
    expect(source).not.toContain('name="code"');
    expect(source).toContain('generated automatically when you create');
    expect(source).toContain('createdCoupon.value = coupon');
    expect(source).toContain('Latest coupon code');
    expect(source).toContain('<AppCopyButton');
    expect(source).toContain('copyTextToClipboard(code)');
    expect(source).toContain('copyCoupon(selectedCoupon.code)');
    expect(source).toContain('onBeforeUnmount(() => {');
    expect(source).toContain('resetCopyStates();');
    expect(source).toContain(':aria-busy="createMutation.isPending.value"');
    expect(source.match(/:disabled="createMutation.isPending.value"/g)?.length).toBe(4);
  });

  it('uses consistent local field spacing and keeps related settings paired in a responsive grid', async () => {
    const html = await renderCheckouts([]);
    const form = html.match(/<form\b[\s\S]*?<\/form>/)?.[0] ?? '';

    expect(form).toContain('items-start gap-x-4 gap-y-5 md:grid-cols-2');
    expect(form.match(/class="[^"]*\bcoupon-term-field\b/g)).toHaveLength(4);
    const labels = ['Discount type', 'Discount (GHS)', 'Maximum completed uses', 'Expiry (local time)'];
    const positions = labels.map((label) => form.indexOf(label));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(source).toMatch(/\.coupon-term-field\s*\{[^}]*display: grid;[^}]*align-content: start;[^}]*gap: 0\.5rem;/);
    expect(source).toMatch(/\.coupon-term-field :deep\(> \.editorial-label\),[\s\S]*:deep\(> \.app-form-control\)\s*\{\s*margin: 0;/);
    expect(form).toContain('aria-describedby="test-coupon-discount-help"');
    expect(form).toMatch(/id="test-coupon-discount-help" class="mt-1 block text-xs text-dc-gray"/);
  });

  it('shows frozen terms, redemption health, and a paginated private checkout drawer', () => {
    for (const label of ['Terms cannot be edited', 'Completed / maximum', 'Active holds', 'Remaining uses', 'Needs attention', 'Private checkout details']) {
      expect(source).toContain(label);
    }
    expect(source).toContain('checkoutPageCount');
    expect(source).toContain('pageCount');
    expect(source).toContain('toggleDevcon26TestCoupon(props.year, coupon.id, !coupon.enabled)');
  });

  it('paints eligible passes with app styling while retaining labeled, independently selectable checkboxes', async () => {
    const html = await renderCheckouts([]);
    const controls = Array.from(html.matchAll(/<label\b[^>]*>[\s\S]*?<\/label>/g), ([control]) => control)
      .filter((control) => control.includes('name="eligible_tiers"'));

    expect(controls).toHaveLength(1);
    for (const [index, value] of ['regular'].entries()) {
      const control = controls[index];

      expect(control).toContain('min-h-11');
      expect(control).toContain('type="checkbox"');
      expect(control).toContain(`value="${value}"`);
      expect(control).toMatch(/<input\b[^>]*\bchecked\b/);
      expect(control).toContain('appearance-none');
      expect(control).toContain('checked:bg-dc-pink');
      expect(control).toContain('focus-visible:ring-2');
      expect(control).toContain('focus-visible:ring-dc-pink');
      expect(control).toContain('disabled:cursor-not-allowed');
      expect(control).toMatch(/<svg\b[^>]*aria-hidden="true"/);
      expect(control).not.toContain('role="checkbox"');
    }
    for (const label of ['Individual ticket']) {
      expect(controls.some((control) => control.includes(label))).toBe(true);
    }
    expect(source).toContain('v-model="form.eligible_tiers"');
    expect(source).toContain('eligible_tiers: form.eligible_tiers');
    expect(source).toContain('peer-checked:opacity-100');
    expect(source).toContain('motion-colors');
    expect(source).toContain("'cursor-not-allowed opacity-60'");
    expect(source).toMatch(/@media \(forced-colors: active\)[\s\S]*appearance: auto;[\s\S]*\.coupon-pass-check[\s\S]*display: none;/);
  });

  it('renders app-owned, labeled triggers and copy actions instead of native select/date controls', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });

    queryClient.setQueryData(['devcon26-test-coupons', '2026', 1, 1, DEVCON26_TEST_CHECKOUT_PAGE_SIZE], {
      coupons: [{
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        code: 'TEST-ABCD-EFGH-JKLM-NPQR',
        discount_type: 'fixed_minor',
        discount_value: 1000,
        eligible_tiers: ['regular'],
        expires_at: '2099-12-19T23:00:00Z',
        max_completed: 5,
        enabled: true,
        completed: 0,
        active_holds: 0,
        remaining: 5,
        exceptions: 0,
      }],
      total: 1, checkouts: [], checkout_total: 0,
    });
    const app = createSSRApp(Devcon26TestCoupons, { year: '2026' });

    app.use(VueQueryPlugin, { queryClient });
    try {
      const html = await renderToString(app);

      expect(html).toContain('aria-haspopup="listbox"');
      expect(html).toContain('aria-haspopup="dialog"');
      expect(html).toContain('Discount type');
      expect(html).toContain('Expiry (local time)');
      expect(html).toContain('aria-label="Details for TEST-ABCD-EFGH-JKLM-NPQR"');
      expect(html).not.toContain('<select');
      expect(html).not.toContain('type="datetime-local"');
      expect(html).not.toContain('name="code"');
    } finally {
      queryClient.clear();
    }
  });
});

describe('Coupon monitoring and sandbox activity', () => {
  it('renders the activity trail with a navigable parent and current page', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] });
    const client = new QueryClient();
    const app = createSSRApp(OrganizerBreadcrumbs, { role: 'owner', embedded: true, localTrail: ['Coupons', 'Test checkout activity'] });

    app.use(router);
    app.use(VueQueryPlugin, { queryClient: client });
    await router.push('/');
    await router.isReady();
    try {
      const html = await renderToString(app);

      expect(html).toMatch(/<nav[^>]*aria-label="Breadcrumb"/);
      expect(html).toMatch(/<button[^>]*>.*Coupons.*<\/button>/);
      expect(html).toMatch(/aria-current="page"[^>]*>Test checkout activity<\/span>/);
    } finally {
      client.clear();
    }
  });

  it('keeps the main empty state focused on coupons while exposing sandbox activity', async () => {
    const html = await renderCheckouts([checkoutFixture(1)]);

    expect(html).toContain('No test coupons yet.');
    expect(html).toContain('Test checkout activity');
    expect(html).not.toContain('Test purchaser 1');
    expect(html).not.toContain('devcon26-test-reference-1');
    expect(html).not.toContain('<table');
  });

  it('keeps the global five-row activity ledger in the page and private details in the drawer', () => {
    expect(source).toContain('checkouts.slice(0, DEVCON26_TEST_CHECKOUT_PAGE_SIZE)');
    expect(source).toContain('Sandbox checkout activity only.');
    expect(source).toContain('Checkout pagination');
    expect(source).toContain('openCheckoutDetails(checkout, $event)');
    expect(source).toContain("<OrganizerBreadcrumbs role=\"owner\" embedded :local-trail=\"['Coupons', 'Test checkout activity']\" @navigate=\"showCoupons\" />");
    expect(source).toContain('activityHeading.value?.focus()');
    expect(source).toContain('activityButton.value?.focus()');
    expect(source).toContain('v-if="activityOpen"');
    expect(source).toContain('Test checkout activity could not be loaded.');
    expect(source).toContain('Loading test checkout activity…');
    expect(source).toContain("selectedCheckout.purchaser_name ?? 'Legacy test checkout'");
    expect(source).toContain("selectedCheckout.purchaser_email ?? 'Purchaser not collected'");
    expect(source).toContain('Payment reference');
    expect(source).toContain('Checkout ID');
  });

  it('provides a dismissible, focus-managed drawer and preserves the form when sections change', () => {
    expect(source).toContain('role="dialog" aria-modal="true"');
    expect(source).toContain('checkoutDrawerCloseButton.value?.focus()');
    expect(source).toContain('checkoutDrawerTrigger?.focus()');
    expect(source).toContain("if (event.key === 'Escape')");
    expect(source).toContain("app?.setAttribute('inert', '')");
    expect(source).toContain("document.body.style.overflow = 'hidden'");
    expect(source).toContain('if (!active) closeCheckoutDetails(false)');
    expect(source).toContain('v-show="creationOpen"');
    expect(source).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
