import type { Context } from 'hono';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ origin: vi.fn(), drain: vi.fn() }));

vi.mock('@/server/complete-test-dispatch', () => ({ completeTestDispatchOrigin: mocks.origin }));
vi.mock('@/server/annual-conference-admission-email-delivery', () => ({ retryAnnualConferenceAdmissionEmails: mocks.drain }));

import { dispatchCompleteTestEmails, dispatchManagedConferenceEmails } from './complete-test-immediate-emails';

beforeEach(() => {
  mocks.origin.mockReset().mockReturnValue('https://preview.example');
  mocks.drain.mockReset().mockResolvedValue({ configured: true, accepted: 1, failed: 0 });
});

it('keeps delivery in the Worker lifetime without delaying payment response', async () => {
  let resolve!: () => void;

  mocks.drain.mockReturnValue(new Promise<void>((done) => { resolve = done; }));
  const waitUntil = vi.fn();

  await dispatchCompleteTestEmails({ executionCtx: { waitUntil } } as unknown as Context);
  expect(waitUntil).toHaveBeenCalledOnce();
  expect(mocks.drain).toHaveBeenCalledOnce();
  resolve();
  await waitUntil.mock.calls[0][0];
});

it('never drains the live queue', async () => {
  mocks.origin.mockReturnValue(undefined);
  await dispatchCompleteTestEmails({} as Context);
  expect(mocks.drain).not.toHaveBeenCalled();
});

it('leaves payment successful when dispatch fails, for scheduled retry', async () => {
  mocks.drain.mockRejectedValue(new Error('provider unavailable'));
  await expect(dispatchCompleteTestEmails({} as Context)).resolves.toBeUndefined();
});

it('dispatches managed test and live mail without consulting historical preview configuration', async () => {
  await dispatchManagedConferenceEmails({} as Context);
  expect(mocks.origin).not.toHaveBeenCalled();
  expect(mocks.drain).toHaveBeenCalledWith(expect.anything(), { managed: true });
});
