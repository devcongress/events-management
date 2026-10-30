export class ResendDeliveryError extends Error {
  constructor(
    public readonly kind: 'throttled' | 'rejected' | 'ambiguous',
    public readonly retryAfterSeconds = 60,
  ) {
    super('Admission email was not accepted.');
  }
}

export function resendRetryAfter(value: string | null, now = Date.now()): number {
  const seconds = value && /^\d+$/.test(value) ? Number(value) : value ? (Date.parse(value) - now) / 1000 : 60;

  return Number.isFinite(seconds) ? Math.min(86400, Math.max(1, Math.ceil(seconds))) : 60;
}
