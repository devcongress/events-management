import { afterEach, expect, it, vi } from 'vitest';
import type { Context } from 'hono';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), environment: {} as Record<string, string> }));

vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock('@/server/env', () => ({ envValue: (key: string) => mocks.environment[key] }));

import { dispatchTelegramPurchases, dispatchTelegramPurchasesInBackground, telegramActivationMessage, telegramLifecycleMessage } from './telegram-purchase-notifications';

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
  expect(mocks.rpc).toHaveBeenCalledWith('claim_devcon26_telegram_activation', expect.objectContaining({
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
    if (name === 'claim_devcon26_telegram_activation') return { data: 'sent', error: null };
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
  mocks.rpc.mockImplementation(async (name: string) => name === 'claim_devcon26_telegram_activation' ? { data: 'sent', error: null } : name.startsWith('claim_')
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

it('sends readiness once before claiming purchases', async () => {
  mocks.environment = { DEVCON26_TELEGRAM_PURCHASE_NOTIFICATIONS_ENABLED: 'true', DEVCON26_TELEGRAM_BOT_TOKEN: '123:abc', DEVCON26_TELEGRAM_CHAT_ID: '-123' };
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name === 'claim_devcon26_telegram_activation' ? 'claimed' : name === 'claim_devcon26_telegram_purchases' ? [] : true, error: null }));
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true, result: { message_id: 1 } }));

  vi.stubGlobal('fetch', fetchMock);
  await dispatchTelegramPurchases(context);
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).text).toBe(telegramActivationMessage());
  expect(telegramActivationMessage()).toContain('Monitoring live Paystack activity');
  expect(telegramActivationMessage()).toContain('Open Ticketing →');
  expect(mocks.rpc.mock.calls.map((call) => call[0])).toEqual(['claim_devcon26_telegram_activation', 'begin_devcon26_telegram_activation', 'finish_devcon26_telegram_activation', 'claim_devcon26_telegram_purchases']);
});

it('blocks purchases when readiness delivery is ambiguous', async () => {
  mocks.environment = { DEVCON26_TELEGRAM_PURCHASE_NOTIFICATIONS_ENABLED: 'true', DEVCON26_TELEGRAM_BOT_TOKEN: '123:abc', DEVCON26_TELEGRAM_CHAT_ID: '-123' };
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name === 'claim_devcon26_telegram_activation' ? 'claimed' : true, error: null }));
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
  await dispatchTelegramPurchases(context);
  expect(mocks.rpc).toHaveBeenLastCalledWith('finish_devcon26_telegram_activation', expect.objectContaining({ p_result: 'needs_review' }));
});
