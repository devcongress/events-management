const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TURNSTILE_VERIFY_TIMEOUT_MS = 8_000;

export const ROUTE_FEEDBACK_TURNSTILE_ACTION = 'route_feedback';
export const VOLUNTEER_INTAKE_TURNSTILE_ACTION = 'volunteer_intake';
export const EVENT_REGISTRATION_TURNSTILE_ACTION = 'event_registration';
export const CFP_SUBMISSION_TURNSTILE_ACTION = 'cfp_submission';
export const EVENT_FEEDBACK_TURNSTILE_ACTION = 'event_feedback';

type TurnstileSuccess = {
  ok: true;
};

type TurnstileFailure = {
  ok: false;
  error: string;
  status: 400 | 503;
};

type TurnstileValidationResult = TurnstileSuccess | TurnstileFailure;

type TurnstileValidationInput = {
  expectedAction?: string;
  expectedHostname?: string;
  remoteIp?: string;
  secretKey?: string;
  token: string;
};

type TurnstileSiteverifyResponse = {
  success?: boolean;
  action?: string;
  hostname?: string;
  'error-codes'?: string[];
};

export async function validateTurnstileToken({
  expectedAction,
  expectedHostname,
  remoteIp,
  secretKey,
  token,
}: TurnstileValidationInput): Promise<TurnstileValidationResult> {
  if (!secretKey) {
    return {
      ok: false,
      error: 'Human verification is temporarily unavailable. Please try again later.',
      status: 503,
    };
  }

  if (!token) {
    return {
      ok: false,
      error: 'Please complete the human check and try again.',
      status: 400,
    };
  }

  const formData = new FormData();
  formData.set('secret', secretKey);
  formData.set('response', token);

  if (remoteIp) {
    formData.set('remoteip', remoteIp);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TURNSTILE_VERIFY_TIMEOUT_MS);
  let result: TurnstileSiteverifyResponse;
  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error('Turnstile verification unavailable');
    }
    result = await response.json() as TurnstileSiteverifyResponse;
  } catch {
    return {
      ok: false,
      error: 'Human verification is temporarily unavailable. Please try again later.',
      status: 503,
    };
  } finally {
    clearTimeout(timeout);
  }

  if (!result.success) {
    return {
      ok: false,
      error: 'Please complete the human check and try again.',
      status: 400,
    };
  }

  if (expectedAction && result.action !== expectedAction) {
    return {
      ok: false,
      error: 'Human verification did not match this form. Please try again.',
      status: 400,
    };
  }

  if (expectedHostname && result.hostname !== expectedHostname) {
    return {
      ok: false,
      error: 'Human verification did not match this site. Please refresh and try again.',
      status: 400,
    };
  }

  return { ok: true };
}
