const ADMIN_OTP_COOLDOWN_MS = 60 * 1000;
const ADMIN_OTP_IP_WINDOW_SHORT_MS = 10 * 60 * 1000;
const ADMIN_OTP_IP_WINDOW_LONG_MS = 60 * 60 * 1000;
const ADMIN_OTP_IP_LIMIT_SHORT = 5;
const ADMIN_OTP_IP_LIMIT_LONG = 20;

type RequestSeriesState = {
  timestamps: number[];
};

type AdminOtpRateLimitInput = {
  email: string;
  ip: string | null;
};

type AdminOtpRateLimitResult =
  | { allowed: true; retryAfterMs: number }
  | { allowed: false; retryAfterMs: number };

const adminOtpRequestsByEmail = new Map<string, RequestSeriesState>();
const adminOtpRequestsByIp = new Map<string, RequestSeriesState>();
const adminOtpRequestsByIpAndEmail = new Map<string, RequestSeriesState>();

function recentTimestamps(store: Map<string, RequestSeriesState>, key: string, windowMs: number, now: number): number[] {
  return (store.get(key)?.timestamps ?? [])
    .filter((timestamp) => Number.isFinite(timestamp) && now - timestamp < windowMs)
    .sort((a, b) => b - a);
}

function persistState(store: Map<string, RequestSeriesState>, key: string, timestamps: number[]) {
  if (timestamps.length === 0) {
    store.delete(key);
    return;
  }

  store.set(key, { timestamps });
}

function pairKey(email: string, ip: string | null): string | null {
  return ip ? `${ip}::${email}` : null;
}

export function evaluateAdminOtpRateLimit(input: AdminOtpRateLimitInput, now = Date.now()): AdminOtpRateLimitResult {
  const emailTimestamps = recentTimestamps(adminOtpRequestsByEmail, input.email, ADMIN_OTP_IP_WINDOW_LONG_MS, now);
  persistState(adminOtpRequestsByEmail, input.email, emailTimestamps);

  const latestEmailRequest = emailTimestamps[0];
  if (latestEmailRequest !== undefined) {
    const retryAfterMs = latestEmailRequest + ADMIN_OTP_COOLDOWN_MS - now;
    if (retryAfterMs > 0) {
      return { allowed: false, retryAfterMs };
    }
  }

  const ipEmailKey = pairKey(input.email, input.ip);
  if (ipEmailKey) {
    const pairTimestamps = recentTimestamps(adminOtpRequestsByIpAndEmail, ipEmailKey, ADMIN_OTP_IP_WINDOW_LONG_MS, now);
    persistState(adminOtpRequestsByIpAndEmail, ipEmailKey, pairTimestamps);

    const latestPairRequest = pairTimestamps[0];
    if (latestPairRequest !== undefined) {
      const retryAfterMs = latestPairRequest + ADMIN_OTP_COOLDOWN_MS - now;
      if (retryAfterMs > 0) {
        return { allowed: false, retryAfterMs };
      }
    }
  }

  if (input.ip) {
    const shortWindowTimestamps = recentTimestamps(adminOtpRequestsByIp, input.ip, ADMIN_OTP_IP_WINDOW_SHORT_MS, now);
    persistState(adminOtpRequestsByIp, input.ip, shortWindowTimestamps);
    if (shortWindowTimestamps.length >= ADMIN_OTP_IP_LIMIT_SHORT) {
      const retryAfterMs = shortWindowTimestamps[shortWindowTimestamps.length - 1] + ADMIN_OTP_IP_WINDOW_SHORT_MS - now;
      return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 1000) };
    }

    const longWindowTimestamps = recentTimestamps(adminOtpRequestsByIp, input.ip, ADMIN_OTP_IP_WINDOW_LONG_MS, now);
    persistState(adminOtpRequestsByIp, input.ip, longWindowTimestamps);
    if (longWindowTimestamps.length >= ADMIN_OTP_IP_LIMIT_LONG) {
      const retryAfterMs = longWindowTimestamps[longWindowTimestamps.length - 1] + ADMIN_OTP_IP_WINDOW_LONG_MS - now;
      return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 1000) };
    }
  }

  return { allowed: true, retryAfterMs: ADMIN_OTP_COOLDOWN_MS };
}

export function recordAdminOtpRequest(input: AdminOtpRateLimitInput, now = Date.now()) {
  const emailTimestamps = recentTimestamps(adminOtpRequestsByEmail, input.email, ADMIN_OTP_IP_WINDOW_LONG_MS, now);
  persistState(adminOtpRequestsByEmail, input.email, [now, ...emailTimestamps]);

  if (input.ip) {
    const ipTimestamps = recentTimestamps(adminOtpRequestsByIp, input.ip, ADMIN_OTP_IP_WINDOW_LONG_MS, now);
    persistState(adminOtpRequestsByIp, input.ip, [now, ...ipTimestamps]);

    const ipEmailKey = pairKey(input.email, input.ip);
    if (ipEmailKey) {
      const pairTimestamps = recentTimestamps(adminOtpRequestsByIpAndEmail, ipEmailKey, ADMIN_OTP_IP_WINDOW_LONG_MS, now);
      persistState(adminOtpRequestsByIpAndEmail, ipEmailKey, [now, ...pairTimestamps]);
    }
  }
}

export function adminOtpRetryMessage(retryAfterMs: number): string {
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return `Please wait about ${seconds} second${seconds === 1 ? '' : 's'} before trying again.`;
}
