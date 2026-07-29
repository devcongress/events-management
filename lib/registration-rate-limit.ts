const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 20;

type AttemptBucket = {
  attempts: number[];
};

const buckets = new Map<string, AttemptBucket>();

export function evaluateRegistrationRateLimit(
  key: string,
  nowMs = Date.now(),
): { allowed: true } | { allowed: false; retryAfterMs: number } {
  const cutoff = nowMs - WINDOW_MS;
  const attempts = (buckets.get(key)?.attempts ?? []).filter((attempt) => attempt > cutoff);
  buckets.set(key, { attempts });

  if (attempts.length < MAX_ATTEMPTS) return { allowed: true };
  return {
    allowed: false,
    retryAfterMs: Math.max(1, attempts[0] + WINDOW_MS - nowMs),
  };
}

export function recordRegistrationAttempt(key: string, nowMs = Date.now()): void {
  const bucket = buckets.get(key) ?? { attempts: [] };
  bucket.attempts.push(nowMs);
  buckets.set(key, bucket);
}

export function resetRegistrationRateLimits(): void {
  buckets.clear();
}
