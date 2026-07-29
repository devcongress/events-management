import type { Context } from 'hono';
import { getSupabaseAdminClient, isSupabaseServerConfigured } from '@/lib/supabase/server';
import { envValue } from '@/server/env';

type LocalBucket = {
  attemptCount: number;
  windowStartedAt: number;
};

const localBuckets = new Map<string, LocalBucket>();

export type PublicRateLimitInput = {
  action: string;
  clientKey: string;
  maxAttempts: number;
  windowSeconds: number;
};

export type PublicRateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number; unavailable?: false }
  | { allowed: false; retryAfterSeconds: number; unavailable: true };

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function consumeLocalRateLimit(input: PublicRateLimitInput, nowMs = Date.now()): PublicRateLimitResult {
  const key = `${input.action}:${input.clientKey}`;
  const windowMs = input.windowSeconds * 1000;
  const existing = localBuckets.get(key);
  const bucket = !existing || existing.windowStartedAt + windowMs <= nowMs
    ? { attemptCount: 0, windowStartedAt: nowMs }
    : existing;

  bucket.attemptCount += 1;
  localBuckets.set(key, bucket);

  if (bucket.attemptCount <= input.maxAttempts) {
    return { allowed: true };
  }

  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.windowStartedAt + windowMs - nowMs) / 1000)),
  };
}

export async function consumePublicRateLimit(
  c: Context,
  input: PublicRateLimitInput,
): Promise<PublicRateLimitResult> {
  if (!isSupabaseServerConfigured(c)) {
    if (envValue('NODE_ENV', c) === 'production') {
      console.error(JSON.stringify({
        event: 'public_rate_limit_unavailable',
        action: input.action,
        error_code: 'supabase_not_configured',
      }));
      return {
        allowed: false,
        retryAfterSeconds: 60,
        unavailable: true,
      };
    }

    return consumeLocalRateLimit(input);
  }

  const keyHash = await sha256Hex(`${input.action}:${input.clientKey}`);
  const { data, error } = await getSupabaseAdminClient(c)
    .rpc('consume_public_rate_limit', {
      p_action: input.action,
      p_key_hash: keyHash,
      p_max_attempts: input.maxAttempts,
      p_window_seconds: input.windowSeconds,
    });

  if (error || !data?.[0]) {
    console.error(JSON.stringify({
      event: 'public_rate_limit_unavailable',
      action: input.action,
      error_code: error?.code ?? null,
    }));
    return {
      allowed: false,
      retryAfterSeconds: 60,
      unavailable: true,
    };
  }

  return data[0].allowed
    ? { allowed: true }
    : {
      allowed: false,
      retryAfterSeconds: Math.max(1, data[0].retry_after_seconds),
    };
}

export function resetLocalPublicRateLimits(): void {
  localBuckets.clear();
}
