const ROUTE_FEEDBACK_COOLDOWN_MS = 10 * 60 * 1000;
const ROUTE_FEEDBACK_DAILY_LIMIT = 3;
const ROUTE_FEEDBACK_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

type FeedbackRateLimitState = {
  timestamps: number[];
};

type FeedbackRateLimitResult =
  | { allowed: true }
  | { allowed: false; reason: 'cooldown' | 'daily_limit'; retryAfterMs: number };

const routeFeedbackSubmissions = new Map<string, FeedbackRateLimitState>();

function recentTimestamps(state: FeedbackRateLimitState | undefined, now: number): number[] {
  if (!state) return [];

  return state.timestamps
    .filter((timestamp) => Number.isFinite(timestamp) && now - timestamp < ROUTE_FEEDBACK_DAILY_WINDOW_MS)
    .sort((a, b) => b - a);
}

function persistState(key: string, timestamps: number[]) {
  if (timestamps.length === 0) {
    routeFeedbackSubmissions.delete(key);

    return;
  }

  routeFeedbackSubmissions.set(key, { timestamps });
}

export function evaluateRouteFeedbackRateLimit(key: string, now = Date.now()): FeedbackRateLimitResult {
  const timestamps = recentTimestamps(routeFeedbackSubmissions.get(key), now);

  persistState(key, timestamps);

  const latest = timestamps[0] ?? 0;
  const cooldownRemaining = latest + ROUTE_FEEDBACK_COOLDOWN_MS - now;

  if (cooldownRemaining > 0) {
    return { allowed: false, reason: 'cooldown', retryAfterMs: cooldownRemaining };
  }

  if (timestamps.length >= ROUTE_FEEDBACK_DAILY_LIMIT) {
    const windowRemaining = timestamps[timestamps.length - 1] + ROUTE_FEEDBACK_DAILY_WINDOW_MS - now;

    return { allowed: false, reason: 'daily_limit', retryAfterMs: Math.max(windowRemaining, 1000) };
  }

  return { allowed: true };
}

export function recordRouteFeedbackSubmission(key: string, now = Date.now()) {
  const timestamps = recentTimestamps(routeFeedbackSubmissions.get(key), now);

  persistState(key, [now, ...timestamps]);
}

export function routeFeedbackRetryMessage(result: Extract<FeedbackRateLimitResult, { allowed: false }>): string {
  if (result.reason === 'daily_limit') {
    return 'Thanks for the notes. This device has reached the route-feedback limit for the last 24 hours.';
  }

  const minutes = Math.max(1, Math.ceil(result.retryAfterMs / 60000));

  return `Feedback received. You can send another note in about ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}
