import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ dispatch: vi.fn() }));

vi.mock('@/server/telegram-purchase-notifications', () => ({ dispatchTelegramPurchases: mocks.dispatch, dispatchTelegramPurchasesInBackground: vi.fn() }));

import app, { isUnauthenticatedApiRequest } from './app';

it('authenticates the exact retry route without an organizer session', async () => {
  const path = '/api/internal/telegram-purchases/retry';
  const secret = 's'.repeat(40);
  const env = { SLACK_EVENTS_RETRY_SECRET: secret, MANAGED_PAYMENT_RECOVERY_OWNER_ENABLED: 'true' };
  const send = (value?: string) => app.request(path, { method: 'POST', headers: value ? { 'x-scheduled-job-secret': value } : {} }, env);

  expect(isUnauthenticatedApiRequest(path, 'POST')).toBe(true);
  expect(isUnauthenticatedApiRequest(path + '/other', 'POST')).toBe(false);
  expect((await send()).status).toBe(404);
  expect((await send('wrong')).status).toBe(404);
  expect(mocks.dispatch).not.toHaveBeenCalled();
  expect((await send(secret)).status).toBe(200);
  expect(mocks.dispatch).toHaveBeenCalledOnce();
});
