import { afterEach, expect, it, vi } from 'vitest';
import type { Context } from 'hono';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), environment: {} as Record<string, string> }));

vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock('@/server/env', () => ({ envValue: (key: string) => mocks.environment[key] }));

import { dispatchTelegramPurchases, dispatchTelegramPurchasesInBackground, telegramLifecycleMessage } from './telegram-purchase-notifications';

const context = { env: { CF_VERSION_METADATA: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', timestamp: '2026-11-13T00:00:00Z' } } } as unknown as Context;
const order = '00000000-0000-4000-8000-000000000001';
const event = { id: order, event_type: 'payment_succeeded' as const, tier_key: 'regular_flexible', quantity: 2,
  subtotal_minor: 30000, total_minor: 31000, paid_ticket_count: 7, detail_code: 'paid' as const, occurred_at: '2026-11-13T14:32:00Z' };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
  mocks.environment = {};
});

it('does nothing while delivery is disabled', async () => {
  await dispatchTelegramPurchases(context);
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it('persists the deployment boundary before Telegram credentials are ready', async () => {
  mocks.environment = { DEVCON26_TELEGRAM_PURCHASE_NOTIFICATIONS_ENABLED: 'true' };
  mocks.rpc.mockResolvedValue({ data: 'claimed', error: null });

  await dispatchTelegramPurchases(context);

  expect(mocks.rpc).toHaveBeenCalledOnce();
  expect(mocks.rpc).toHaveBeenCalledWith('ensure_devcon26_telegram_activation', expect.objectContaining({
    p_version_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    p_version_at: '2026-11-13T00:00:00Z',
  }));
  expect(mocks.rpc).not.toHaveBeenCalledWith('begin_devcon26_telegram_activation', expect.anything());
});

it('fails closed without valid deployment metadata', async () => {
  mocks.environment = { DEVCON26_TELEGRAM_PURCHASE_NOTIFICATIONS_ENABLED: 'true' };

  await dispatchTelegramPurchases({ env: { CF_VERSION_METADATA: { id: 'invalid', timestamp: 'now' } } } as unknown as Context);

  expect(mocks.rpc).not.toHaveBeenCalled();
});

it('does not wait for a pending claim when no execution context is available', async () => {
  mocks.environment = {
    DEVCON26_TELEGRAM_PURCHASE_NOTIFICATIONS_ENABLED: 'true', DEVCON26_TELEGRAM_BOT_TOKEN: '123:abc',
    DEVCON26_TELEGRAM_CHAT_ID: '-123',
  };
  let finish!: (value: { data: never[]; error: null }) => void;

  mocks.rpc.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  await expect(dispatchTelegramPurchasesInBackground(context)).resolves.toBeUndefined();
  finish({ data: [], error: null });
});

it('sends only the minimal snapshot and parks ambiguous delivery', async () => {
  mocks.environment = {
    DEVCON26_TELEGRAM_PURCHASE_NOTIFICATIONS_ENABLED: 'true', DEVCON26_TELEGRAM_BOT_TOKEN: '123:abc',
    DEVCON26_TELEGRAM_CHAT_ID: '-123',
  };
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === 'ensure_devcon26_telegram_activation') return { data: 'sent', error: null };
    if (name.startsWith('claim_')) return { data: [event], error: null };

    return { data: true, error: null };
  });
  const fetchMock = vi.fn().mockRejectedValue(new Error('network'));

  vi.stubGlobal('fetch', fetchMock);
  await dispatchTelegramPurchases(context);
  const request = fetchMock.mock.calls[0][1];

  expect(request.redirect).toBe('manual');
  expect(JSON.parse(request.body).text).toContain('2 seats');
  expect(JSON.parse(request.body)).toMatchObject({ parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
  expect(JSON.parse(request.body).text).not.toContain(order);
  expect(mocks.rpc).toHaveBeenLastCalledWith('finish_devcon26_telegram_purchase', expect.objectContaining({ p_result: 'needs_review' }));
});

it('retries only a definite rate limit with a bounded provider delay', async () => {
  mocks.environment = {
    DEVCON26_TELEGRAM_PURCHASE_NOTIFICATIONS_ENABLED: 'true', DEVCON26_TELEGRAM_BOT_TOKEN: '123:abc',
    DEVCON26_TELEGRAM_CHAT_ID: '-123',
  };
  mocks.rpc.mockImplementation(async (name: string) => name === 'ensure_devcon26_telegram_activation' ? { data: 'sent', error: null } : name.startsWith('claim_')
    ? { data: [{ ...event, tier_key: 'regular', quantity: 1, subtotal_minor: 100, total_minor: 100 }], error: null }
    : { data: true, error: null });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ok: false, parameters: { retry_after: 30 } }, { status: 429 })));
  await dispatchTelegramPurchases(context);
  expect(mocks.rpc).toHaveBeenLastCalledWith('finish_devcon26_telegram_purchase', expect.objectContaining({ p_result: 'retry', p_retry_seconds: 30 }));
});

it('formats each lifecycle alert in three groups with one protected link', () => {
  const cases = [
    { row: event, heading: '✅ <b>Payment successful</b>', context: 'Regular pass · 2 seats', amount: '<b>GH₵310.00 paid</b>\nSubtotal · GH₵300.00\nPaid tickets so far · 7', action: 'View in Ticketing' },
    { row: { ...event, event_type: 'checkout_incomplete', detail_code: 'expired', tier_key: '<b>unsafe</b>', paid_ticket_count: null }, heading: '⚠️ <b>Checkout incomplete</b>', context: 'Ticket pass · 2 seats', amount: '<b>GH₵310.00 quoted</b>\nCheckout hold expired', action: 'Review checkout' },
    { row: { ...event, event_type: 'refund_required', detail_code: 'required', paid_ticket_count: null }, heading: '🚨 <b>Refund required</b>', context: 'Regular pass · 2 seats', amount: '<b>GH₵310.00 refund</b>\nPayment received, but tickets were not issued', action: 'View in Ticketing' },
    { row: { ...event, event_type: 'refund_completed', detail_code: 'seat_refund', quantity: 1, paid_ticket_count: null }, heading: '↩️ <b>Refund completed</b>', context: 'Regular pass · 1 seat', amount: '<b>GH₵310.00 refund</b>\nSeat refund confirmed', action: 'View in Ticketing' },
    { row: { ...event, event_type: 'refund_needs_attention', detail_code: 'needs_attention', paid_ticket_count: null }, heading: '🛠 <b>Refund needs attention</b>', context: 'Regular pass · 2 seats', amount: '<b>GH₵310.00 refund</b>\nProvider follow-up required', action: 'View in Ticketing' },
  ] as const;

  for (const { row, heading, context: messageContext, amount, action } of cases) {
    const message = telegramLifecycleMessage(row);

    expect(message).toBe(`${heading}\nDevCon26 · ${messageContext}\n\n${amount}\n\n<i>13 Nov 2026 · 14:32 GMT</i>\n<a href="https://em.devcongress.org/organizer-console/annual-conference/2026/ticketing?section=orders">${action} →</a>`);
    expect(message).not.toContain(order);
    expect(message).not.toContain('<b>unsafe</b>');
  }

  expect(telegramLifecycleMessage({ ...event, event_type: 'checkout_incomplete', detail_code: 'customer_cancelled', paid_ticket_count: null }))
    .toContain('Customer cancelled payment');
});

it('claims purchases without sending a readiness message', async () => {
  mocks.environment = { DEVCON26_TELEGRAM_PURCHASE_NOTIFICATIONS_ENABLED: 'true', DEVCON26_TELEGRAM_BOT_TOKEN: '123:abc', DEVCON26_TELEGRAM_CHAT_ID: '-123' };
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name === 'claim_devcon26_telegram_purchases' ? [] : true, error: null }));
  const fetchMock = vi.fn();

  vi.stubGlobal('fetch', fetchMock);
  await dispatchTelegramPurchases(context);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(mocks.rpc.mock.calls.map((call) => call[0])).toEqual(['ensure_devcon26_telegram_activation', 'claim_devcon26_telegram_purchases']);
});
