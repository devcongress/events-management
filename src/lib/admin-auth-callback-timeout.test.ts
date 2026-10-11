import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AdminAuthCallbackTimeoutError,
  createAdminAuthCallbackDeadline,
  waitForAdminAuthCallbackStep,
} from './admin-auth-callback-timeout';

describe('admin auth callback timeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects a hanging callback step instead of leaving the sign-in surface busy', async () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const callback = waitForAdminAuthCallbackStep(
      () => new Promise<never>(() => undefined),
      5_000,
      onTimeout,
    );
    const rejected = expect(callback).rejects.toBeInstanceOf(AdminAuthCallbackTimeoutError);

    await vi.advanceTimersByTimeAsync(5_000);

    await rejected;
    expect(onTimeout).toHaveBeenCalledOnce();
  });

  it('returns a completed callback result without firing its timeout handler', async () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const callback = waitForAdminAuthCallbackStep(
      async () => 'completed',
      5_000,
      onTimeout,
    );

    await expect(callback).resolves.toBe('completed');
    await vi.advanceTimersByTimeAsync(5_000);

    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('still rejects with a timeout when cleanup throws', async () => {
    vi.useFakeTimers();
    const callback = waitForAdminAuthCallbackStep(
      () => new Promise<never>(() => undefined),
      5_000,
      () => { throw new Error('abort failed'); },
    );
    const rejected = expect(callback).rejects.toBeInstanceOf(AdminAuthCallbackTimeoutError);

    await vi.advanceTimersByTimeAsync(5_000);

    await rejected;
  });

  it('uses one deadline for all callback steps instead of extending every step', async () => {
    vi.useFakeTimers();
    const callback = createAdminAuthCallbackDeadline(5_000);

    await vi.advanceTimersByTimeAsync(3_000);
    const hangingSecondStep = callback.run(() => new Promise<never>(() => undefined));

    await vi.advanceTimersByTimeAsync(1_999);
    await expect(Promise.race([
      hangingSecondStep.then(() => 'settled', () => 'settled'),
      Promise.resolve('pending'),
    ])).resolves.toBe('pending');
    const rejected = expect(hangingSecondStep).rejects.toBeInstanceOf(AdminAuthCallbackTimeoutError);

    await vi.advanceTimersByTimeAsync(1);

    await rejected;
  });
});
