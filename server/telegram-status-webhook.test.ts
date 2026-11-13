import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), environment: {} as Record<string, string> }));

vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock('@/server/env', () => ({ envValue: (key: string) => mocks.environment[key] }));

import app, { isUnauthenticatedApiRequest } from './app';

const path = '/api/webhooks/telegram/devcon26-tickets';
const secret = 'a'.repeat(40);

async function request(body: string, token = secret) {
  return app.request(path, { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': token, 'content-type': 'application/json' }, body });
}

function update(text: string, id = -123, type = 'group') {
  return JSON.stringify({ message: { text, chat: { id, type }, from: { first_name: 'PRIVATE_NAME' } } });
}

afterEach(() => {
  mocks.environment = {};
  vi.resetAllMocks();
});

describe('Telegram status webhook', () => {
  it('allowlists only exact POST paths and authenticates before parsing', async () => {
    mocks.environment = { DEVCON26_TELEGRAM_WEBHOOK_SECRET: secret };
    expect(isUnauthenticatedApiRequest(path, 'POST')).toBe(true);
    expect(isUnauthenticatedApiRequest(path + '/other', 'POST')).toBe(false);
    expect(isUnauthenticatedApiRequest(path, 'GET')).toBe(false);
    expect((await request('{', '')).status).toBe(404);
    expect((await request('x'.repeat(20_000), 'wrong')).status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('bounds authenticated webhook bodies before parsing', async () => {
    mocks.environment = { DEVCON26_TELEGRAM_WEBHOOK_SECRET: secret };

    expect((await request('x'.repeat(16_385))).status).toBe(413);
    expect(await (await request('{')).json()).toEqual({ ok: true });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('only responds to the configured group and exact commands', async () => {
    mocks.environment = { DEVCON26_TELEGRAM_WEBHOOK_SECRET: secret, DEVCON26_TELEGRAM_CHAT_ID: '-123', DEVCON26_TELEGRAM_BOT_USERNAME: 'devcon_26_ticket_bot' };
    mocks.rpc.mockResolvedValue({ data: [{ pending_count: 2, needs_review_count: 1, confirmed_count: 0, last_sent_at: null }], error: null });
    for (const body of [update('/status', -124), update('/status', -123, 'private'), update('/status@other'), update('/status please'), JSON.stringify({ edited_message: { text: '/status', chat: { id: -123, type: 'group' } } })]) {
      expect(await (await request(body)).json()).toEqual({ ok: true });
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
    for (const command of ['/status', '/status@devcon_26_ticket_bot']) {
      const response = await (await request(update(command))).json();

      expect(response).toMatchObject({ method: 'sendMessage', chat_id: '-123', parse_mode: 'HTML' });
      expect(response.text).toContain('Delivery · Disabled');
      expect(response.text).toContain('Pending or in flight · <b>2</b>');
      expect(response.text).toContain('Last successful alert · Never');
      expect(response.text).not.toContain('PRIVATE_NAME');
    }
  });

  it('distinguishes historical confirmed sends without fabricated timestamps', async () => {
    mocks.environment = { DEVCON26_TELEGRAM_WEBHOOK_SECRET: secret, DEVCON26_TELEGRAM_CHAT_ID: '-123' };
    mocks.rpc.mockResolvedValue({ data: [{ pending_count: 0, needs_review_count: 1, confirmed_count: 2, last_sent_at: null }], error: null });
    const response = await (await request(update('/status'))).json();

    expect(response.text).toContain('Needs review · <b>1</b>');
    expect(response.text).toContain('Last successful alert · Time unavailable');
    expect(response.text).not.toContain('Last successful alert · Never');
  });

  it('reports database errors as unavailable, not an empty queue', async () => {
    mocks.environment = { DEVCON26_TELEGRAM_WEBHOOK_SECRET: secret, DEVCON26_TELEGRAM_CHAT_ID: '-123', DEVCON26_TELEGRAM_PURCHASE_NOTIFICATIONS_ENABLED: 'true' };
    mocks.rpc.mockResolvedValue({ data: null, error: {} });
    const response = await (await request(update('/status'))).json();

    expect(response.text).toContain('Delivery · Enabled');
    expect(response.text).toContain('unavailable');
    expect(response.text).not.toContain(': 0');
  });
});
