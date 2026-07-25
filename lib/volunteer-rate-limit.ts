const VOLUNTEER_COOLDOWN_MS = 10 * 60 * 1000;
const VOLUNTEER_DAILY_LIMIT = 2;
const VOLUNTEER_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

type VolunteerRateLimitState = {
  timestamps: number[];
};

export type VolunteerRateLimitResult =
  | { allowed: true }
  | { allowed: false; reason: 'cooldown' | 'daily_limit'; retryAfterMs: number };

const volunteerSubmissions = new Map<string, VolunteerRateLimitState>();

function recentTimestamps(state: VolunteerRateLimitState | undefined, currentTime: number): number[] {
  if (!state) return [];

  return state.timestamps
    .filter((timestamp) => Number.isFinite(timestamp) && currentTime - timestamp < VOLUNTEER_DAILY_WINDOW_MS)
    .sort((a, b) => b - a);
}

function persistState(key: string, timestamps: number[]) {
  if (timestamps.length === 0) {
    volunteerSubmissions.delete(key);
    return;
  }

  volunteerSubmissions.set(key, { timestamps });
}

export function evaluateVolunteerRateLimit(key: string, currentTime = Date.now()): VolunteerRateLimitResult {
  const timestamps = recentTimestamps(volunteerSubmissions.get(key), currentTime);
  persistState(key, timestamps);

  const cooldownRemaining = (timestamps[0] ?? 0) + VOLUNTEER_COOLDOWN_MS - currentTime;
  if (cooldownRemaining > 0) {
    return { allowed: false, reason: 'cooldown', retryAfterMs: cooldownRemaining };
  }

  if (timestamps.length >= VOLUNTEER_DAILY_LIMIT) {
    const windowRemaining = (timestamps[timestamps.length - 1] ?? currentTime) + VOLUNTEER_DAILY_WINDOW_MS - currentTime;
    return { allowed: false, reason: 'daily_limit', retryAfterMs: Math.max(windowRemaining, 1000) };
  }

  return { allowed: true };
}

export function recordVolunteerSubmission(key: string, currentTime = Date.now()) {
  const timestamps = recentTimestamps(volunteerSubmissions.get(key), currentTime);
  persistState(key, [currentTime, ...timestamps]);
}

export function volunteerRetryMessage(result: Extract<VolunteerRateLimitResult, { allowed: false }>): string {
  if (result.reason === 'daily_limit') {
    return 'This device has reached the volunteer sign-up limit for today.';
  }

  return 'This device has already sent a volunteer sign-up. Please wait a few minutes before trying again.';
}
