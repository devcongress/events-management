import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ticketingSource = readFileSync(
  new URL('./views/admin/AdminAnnualConferenceTicketingView.vue', import.meta.url),
  'utf8',
);
const navSource = readFileSync(
  new URL('./components/AnnualConferenceNav.vue', import.meta.url),
  'utf8',
);

describe('annual conference ticketing operations UI', () => {
  it('reconciles every seat reservation in the inventory ledger', () => {
    expect(ticketingSource).toContain("['Capacity', ticketing.inventory.public_capacity");
    expect(ticketingSource).toContain("['Reserved', ticketing.inventory.reduction_floor");
    expect(ticketingSource).toContain("['Available', ticketing.inventory.remaining_public_seats");
    expect(ticketingSource).toContain("['Active checkout holds', ticketing.value.inventory.checkout_seats_held]");
  });

  it('requires a changed, valid capacity before saving', () => {
    expect(ticketingSource).toContain('Current capacity:');
    expect(ticketingSource).toContain('New capacity');
    expect(ticketingSource).toContain('capacityHasChanged');
    expect(ticketingSource).toContain('capacityCanSave');
    expect(ticketingSource).toContain("capacity.value > 5000");
    expect(ticketingSource).toContain("'Saving…'");
  });

  it('keeps sponsor errors local, named, and announced', () => {
    expect(ticketingSource).toContain('const capacityError = ref');
    expect(ticketingSource).toContain('const sponsorStatus = ref');
    expect(ticketingSource).toContain('name="sponsor_name"');
    expect(ticketingSource).toContain('autocomplete="organization"');
    expect(ticketingSource).toContain('spellcheck="false"');
    expect(ticketingSource).toContain('focusFirstSponsorFormError');
    expect(ticketingSource).toContain('aria-live="polite"');
  });

  it('keeps sponsor inventory primary across desktop and mobile layouts', () => {
    expect(ticketingSource).toContain('<table class="hidden w-full text-left text-sm md:table">');
    expect(ticketingSource).toContain('md:hidden');
    expect(ticketingSource).toContain('<details');
    expect(ticketingSource).toContain('Public passes');
    expect(ticketingSource).toContain('Activation status');
  });

  it('keeps pricing editable only while sales are draft, behind an accessible drawer', () => {
    expect(ticketingSource).toContain("ticketing.value?.settings.ticket_sales_status === 'draft'");
    expect(ticketingSource).toContain('openPricingEditor');
    expect(ticketingSource).toContain('closePricingEditor');
    expect(ticketingSource).toContain('Set draft prices');
    expect(ticketingSource).toContain('Save prices');
    expect(ticketingSource).toContain('first checkout hold exists');
    expect(ticketingSource).toContain('ticket-prices-error');
    expect(ticketingSource).toContain('<Teleport to="body">');
    expect(ticketingSource).toContain('pricing-drawer-enter-active');
    expect(ticketingSource).toContain('handlePricingDrawerKeydown');
    expect(ticketingSource).toContain("app?.setAttribute('inert', '')");
    expect(ticketingSource).toContain('pricingDrawerTrigger?.focus()');
  });

  it('keeps currency context in labels without an overlapping input prefix', () => {
    expect(ticketingSource).toContain('{{ tier.label }} (GHS)');
    expect(ticketingSource).not.toContain('pointer-events-none absolute inset-y-0 left-3');
    expect(ticketingSource).not.toContain('class="editorial-input pl-12"');
  });

  it('renders sponsor fetch failures separately and protects narrow allocation rows', () => {
    expect(ticketingSource).toContain('sponsorQuery.isError.value');
    expect(ticketingSource).toContain('Sponsor allocations could not be loaded.');
    expect(ticketingSource).toContain('break-words');
    expect(ticketingSource).toContain('break-all');
    expect(ticketingSource).toContain('shrink-0');
  });

  it('keeps the phone overflow cue scoped to the tab viewport and reveals deep-linked tabs', () => {
    expect(navSource).toContain('annual-conference-nav-viewport');
    expect(navSource).toContain('.annual-conference-nav-viewport::after');
    expect(navSource).toContain('pointer-events: none');
    expect(navSource).toContain('scrollIntoView');
    expect(navSource).toContain("behavior: 'auto'");
  });

  it('returns from an out-of-range filtered delivery page after a retry changes the result set', () => {
    expect(ticketingSource).toContain('refreshEmailDeliveriesAfterRetry');
    expect(ticketingSource).toContain('const finalPage = Math.max(1, Math.ceil((refreshed.data?.total ?? 0) / 8));');
    expect(ticketingSource).toContain('emailDeliveryPage.value = finalPage');
    expect(ticketingSource).toContain('await emailDeliveryQuery.refetch();');
  });
});
