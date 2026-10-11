export const ADMIN_AUTH_CALLBACK_STEP_TIMEOUT_MS = 15_000;

export class AdminAuthCallbackTimeoutError extends Error {
  constructor() {
    super('Organizer sign-in timed out.');
    this.name = 'AdminAuthCallbackTimeoutError';
  }
}

export interface AdminAuthCallbackDeadline {
  run<T>(operation: () => Promise<T>, onTimeout?: () => void): Promise<T>;
}

/**
 * Bound browser-only callback work so an unavailable provider or network
 * request cannot leave the organizer sign-in surface permanently busy.
 */
export function waitForAdminAuthCallbackStep<T>(
  operation: () => Promise<T>,
  timeoutMs = ADMIN_AUTH_CALLBACK_STEP_TIMEOUT_MS,
  onTimeout?: () => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const settle = (callback: () => void) => {
      if (settled) return;

      settled = true;
      globalThis.clearTimeout(timeoutId);
      callback();
    };

    const timeoutId = globalThis.setTimeout(() => {
      settle(() => {
        try {
          onTimeout?.();
        } catch {
          // Recovery must still settle when best-effort cancellation fails.
        }

        reject(new AdminAuthCallbackTimeoutError());
      });
    }, timeoutMs);

    Promise.resolve()
      .then(operation)
      .then(
        (value) => settle(() => resolve(value)),
        (error: unknown) => settle(() => reject(error)),
      );
  });
}

/**
 * Keep the complete callback within one recovery window instead of granting
 * every individual provider or browser operation a full timeout period.
 */
export function createAdminAuthCallbackDeadline(
  timeoutMs = ADMIN_AUTH_CALLBACK_STEP_TIMEOUT_MS,
  now = () => Date.now(),
): AdminAuthCallbackDeadline {
  const deadlineAt = now() + timeoutMs;

  return {
    run<T>(operation: () => Promise<T>, onTimeout?: () => void): Promise<T> {
      return waitForAdminAuthCallbackStep(
        operation,
        Math.max(0, deadlineAt - now()),
        onTimeout,
      );
    },
  };
}
