import { afterEach, expect, it, vi } from 'vitest';
import type { Context } from 'hono';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), environment: {} as Record<string, string> }));

vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock('@/server/env', () => ({ envValue: (key: string) => mocks.environment[key] }));

import { dispatchTelegramPurchases, dispatchTelegramPurchasesInBackground, telegramLifecycleMessage } from './telegram-purchase-notifications';

const context = {} as Context;
const order = '00000000-0000-4000-8000-000000000001';
const event = { id: order, event_type: 'payment_succeeded' as const, tier_key: 'regular_flexible', quantity: 2,
  subtotal_minor: 30000, total_minor: 31000, paid_ticket_count: 7, detail_code: 'paid' as const, occurred_at: '2026-11-13T14:32:00Z' };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
  mocks.environment = {};
});

it('fails closed without complete configuration', async () => {
  await dispatchTelegramPurchases(context);
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it('does not wait for a pending claim when no execution context is available', async () => {
  mocks.environment = {
    DEVCON26_TELEGRAM_PURCHASE_NOTIFICATIONS_ENABLED: 'true', DEVCON26_TELEGRAM_BOT_TOKEN: '123:abc',
    DEVCON26_TELEGRAM_CHAT_ID: '-123', DEVCON26_TELEGRAM_PURCHASE_NOTIFICATIONS_START_AT: '2026-11-13T00:00:00Z',
  };
  let finish!: (value: { data: never[]; error: null }) => void;

  mocks.rpc.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  await expect(dispatchTelegramPurchasesInBackground(context)).resolves.toBeUndefined();
  finish({ data: [], error: null });
});

it('sends only the minimal snapshot and parks ambiguous delivery', async () => {
  mocks.environment = {
    DEVCON26_TELEGRAM_PURCHASE_NOTIFICATIONS_ENABLED: 'true', DEVCON26_TELEGRAM_BOT_TOKEN: '123:abc',
    DEVCON26_TELEGRAM_CHAT_ID: '-123', DEVCON26_TELEGRAM_PURCHASE_NOTIFICATIONS_START_AT: '2026-11-13T00:00:00Z',
  };
  mocks.rpc.mockImplementation(async (name: string) => {
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
    DEVCON26_TELEGRAM_CHAT_ID: '-123', DEVCON26_TELEGRAM_PURCHASE_NOTIFICATIONS_START_AT: '2026-11-13T00:00:00Z',
  };
  mocks.rpc.mockImplementation(async (name: string) => name.startsWith('claim_')
    ? { data: [{ ...event, tier_key: 'regular', quantity: 1, subtotal_minor: 100, total_minor: 100 }], error: null }
    : { data: true, error: null });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ok: false, parameters: { retry_after: 30 } }, { status: 429 })));
  await dispatchTelegramPurchases(context);
  expect(mocks.rpc).toHaveBeenLastCalledWith('finish_devcon26_telegram_purchase', expect.objectContaining({ p_result: 'retry', p_retry_seconds: 30 }));
});

it('builds controlled, event-specific messages without arbitrary tier markup', () => {
  expect(telegramLifecycleMessage(event)).toContain('<b>GH₵310.00 paid</b>');
  expect(telegramLifecycleMessage(event)).toContain('Paid tickets so far · 7');
  expect(telegramLifecycleMessage({ ...event, event_type: 'refund_completed', detail_code: 'seat_refund', paid_ticket_count: null })).not.toContain('Paid tickets so far');
  expect(telegramLifecycleMessage({ ...event, event_type: 'checkout_incomplete', detail_code: 'expired', tier_key: '<b>unsafe</b>' }))
    .toContain('Ticket pass\n2 seats · GH₵310.00 quoted\nCheckout hold expired');
  expect(telegramLifecycleMessage({ ...event, event_type: 'checkout_incomplete', detail_code: 'customer_cancelled' }))
    .toContain('Customer cancelled payment');
  expect(telegramLifecycleMessage({ ...event, event_type: 'refund_required', detail_code: 'required' }))
    .toContain('Payment received, but tickets were not issued');
  expect(telegramLifecycleMessage({ ...event, event_type: 'refund_completed', detail_code: 'seat_refund', quantity: 1 }))
    .toContain('1 seat · <b>GH₵310.00 refund</b>');
  expect(telegramLifecycleMessage(event)).toContain('<i>13 Nov 2026 · 14:32 GMT</i>');
  expect(telegramLifecycleMessage(event)).not.toContain(order);
});
