import type { Context } from 'hono';
import { assessPublicEmail, type PublicEmailPreflightResult } from '@/lib/email/public-email-preflight';
import { consumePublicRateLimit, type PublicRateLimitResult } from '@/lib/public-rate-limit';
import { validateTurnstileToken } from '@/lib/turnstile';
import { envValue } from '@/server/env';
import { securitySafeRequestPath } from '@/server/security-log';

export function publicClientKey(c: Context): string {
  return c.req.header('cf-connecting-ip')
    ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    ?? `unknown:${c.req.header('user-agent') ?? 'unknown'}`;
}

export function publicClientIp(c: Context): string | undefined {
  const value = c.req.header('cf-connecting-ip')
    ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim();

  return value && value !== 'unknown' ? value : undefined;
}

function publicRateLimitError(
  c: Context,
  result: Extract<PublicRateLimitResult, { allowed: false }>,
  message: string,
): globalThis.Response {
  c.header('Retry-After', String(result.retryAfterSeconds));

  if (result.unavailable) {
    return c.json({
      error: 'This form is temporarily unavailable. Please try again shortly.',
      retry_after_seconds: result.retryAfterSeconds,
    }, 503);
  }

  console.warn(JSON.stringify({
    event: 'public_rate_limit_exceeded',
    action: securitySafeRequestPath(c.req.path),
    request_id: c.get('requestId') ?? null,
  }));

  return c.json({
    error: message,
    retry_after_seconds: result.retryAfterSeconds,
  }, 429);
}

export async function enforcePublicRateLimit(
  c: Context,
  input: {
    action: string;
    clientKey: string;
    maxAttempts: number;
    windowSeconds: number;
  },
  message: string,
): Promise<globalThis.Response | null> {
  const result = await consumePublicRateLimit(c, input);

  return result.allowed ? null : publicRateLimitError(c, result, message);
}

export async function assessPublicSubmissionEmail(
  c: Context,
  email: string,
): Promise<PublicEmailPreflightResult> {
  return assessPublicEmail(email, {
    // Unit and route tests use reserved example domains and must not depend on
    // external DNS. Production and local development exercise the real check.
    skipDomainLookup: envValue('NODE_ENV', c) === 'test',
    onDnsFailure: (failure) => {
      console.warn(JSON.stringify({
        event: 'public_email_dns_resolver_failed',
        request_id: c.get('requestId') ?? null,
        resolver: failure.resolver,
        record_type: failure.recordType,
        failure_kind: failure.failureKind,
        duration_ms: failure.durationMs,
        ...(failure.errorCode === undefined ? {} : { error_code: failure.errorCode }),
        ...(failure.errorName === undefined ? {} : { error_name: failure.errorName }),
      }));
    },
  });
}

export function publicEmailErrorPayload(
  result: Extract<PublicEmailPreflightResult, { status: 'invalid' }>,
) {
  return {
    error: result.message,
    code: result.reason,
    ...(result.suggestion ? { suggestion: result.suggestion } : {}),
  };
}

export async function requirePublicTurnstile(
  c: Context,
  input: {
    token?: string | null;
    submittedAction?: string | null;
    expectedAction: string;
    expectedHostname?: string | string[];
  },
): Promise<globalThis.Response | null> {
  const token = input.token?.trim() ?? '';
  const submittedAction = input.submittedAction?.trim() ?? '';
  const secretKey = envValue('TURNSTILE_SECRET_KEY', c)?.trim();

  if (submittedAction && submittedAction !== input.expectedAction) {
    return c.json({ error: 'Human verification did not match this form. Please try again.' }, 400);
  }

  if (!secretKey) {
    if (envValue('NODE_ENV', c) === 'production' || token || submittedAction) {
      console.error(JSON.stringify({
        event: 'turnstile_configuration_missing',
        action: input.expectedAction,
        request_id: c.get('requestId') ?? null,
      }));

      return c.json({ error: 'Human verification is temporarily unavailable. Please try again later.' }, 503);
    }

    // Local and test environments may omit Turnstile entirely.
    return null;
  }

  const result = await validateTurnstileToken({
    token,
    secretKey,
    remoteIp: publicClientIp(c),
    expectedAction: input.expectedAction,
    expectedHostname: input.expectedHostname ?? envValue('TURNSTILE_EXPECTED_HOSTNAME', c),
  });

  return result.ok ? null : c.json({ error: result.error }, result.status);
}
