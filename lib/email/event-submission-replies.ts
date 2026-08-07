import crypto from 'crypto';

const REPLY_LOCAL_PREFIX = 's+';
const LEGACY_REPLY_LOCAL_PREFIX = 'submissions+';
const REPLY_SIGNATURE_LENGTH = 20;
const MAX_WEBHOOK_AGE_SECONDS = 5 * 60;

export type ParsedEventSubmissionReplyRecipient = {
  submissionId: string;
  signature: string;
};

function normalizedDomain(domain: string): string | null {
  const value = domain.trim().toLowerCase();
  if (!value || value.includes('@') || /\s/.test(value)) return null;
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value)) return null;
  return value;
}

function fullSubmissionSignature(submissionId: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(submissionId).digest('base64url');
}

function submissionSignature(submissionId: string, secret: string): string {
  return fullSubmissionSignature(submissionId, secret).slice(0, REPLY_SIGNATURE_LENGTH);
}

function compactSubmissionId(submissionId: string): string | null {
  if (!/^[0-9a-f-]{36}$/i.test(submissionId)) return null;
  return submissionId.replaceAll('-', '').toLowerCase();
}

function expandSubmissionId(value: string): string | null {
  if (!/^[0-9a-f]{32}$/i.test(value)) return null;
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function signaturesMatch(provided: string, expected: string): boolean {
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  return providedBytes.length === expectedBytes.length && crypto.timingSafeEqual(providedBytes, expectedBytes);
}

export function eventSubmissionReplyAddress(input: {
  submissionId: string;
  domain: string;
  secret: string;
}): string | null {
  const domain = normalizedDomain(input.domain);
  const secret = input.secret.trim();
  const submissionId = compactSubmissionId(input.submissionId.trim());
  if (!domain || !secret || !submissionId) return null;

  // The local part of an email address is limited to 64 characters. This
  // compact format is 55 characters while retaining a 120-bit HMAC token.
  return `${REPLY_LOCAL_PREFIX}${submissionId}.${submissionSignature(input.submissionId.trim(), secret)}@${domain}`;
}

export function parseEventSubmissionReplyRecipient(
  address: string,
  configuredDomain: string,
  secret: string,
): ParsedEventSubmissionReplyRecipient | null {
  const domain = normalizedDomain(configuredDomain);
  if (!domain || !secret.trim()) return null;

  const [localPart, addressDomain, ...unexpected] = address.trim().split('@');
  if (unexpected.length > 0 || addressDomain?.toLowerCase() !== domain) return null;

  if (localPart.toLowerCase().startsWith(REPLY_LOCAL_PREFIX)) {
    const encoded = localPart.slice(REPLY_LOCAL_PREFIX.length);
    const separator = encoded.lastIndexOf('.');
    if (separator <= 0 || separator === encoded.length - 1) return null;

    const submissionId = expandSubmissionId(encoded.slice(0, separator));
    const signature = encoded.slice(separator + 1);
    if (!submissionId || !/^[A-Za-z0-9_-]{20}$/.test(signature)) return null;
    if (!signaturesMatch(signature, submissionSignature(submissionId, secret))) return null;

    return { submissionId, signature };
  }

  // Keep accepting the original long format for any replies sent before the
  // compact format was deployed.
  if (!localPart.toLowerCase().startsWith(LEGACY_REPLY_LOCAL_PREFIX)) return null;
  const encoded = localPart.slice(LEGACY_REPLY_LOCAL_PREFIX.length);
  const separator = encoded.lastIndexOf('.');
  if (separator <= 0 || separator === encoded.length - 1) return null;

  const submissionId = encoded.slice(0, separator);
  const signature = encoded.slice(separator + 1);
  if (!/^[0-9a-f-]{36}$/.test(submissionId) || !/^[A-Za-z0-9_-]{40,64}$/.test(signature)) return null;

  if (!signaturesMatch(signature, fullSubmissionSignature(submissionId, secret))) return null;

  return { submissionId, signature };
}

export function verifyResendWebhookSignature(input: {
  rawBody: string;
  webhookId: string | null;
  timestamp: string | null;
  signatures: string | null;
  secret: string;
  nowMs?: number;
}): boolean {
  if (!input.webhookId || !input.timestamp || !input.signatures) return false;
  const secret = input.secret.trim();
  if (!secret.startsWith('whsec_')) return false;

  const timestampSeconds = Number(input.timestamp);
  if (!Number.isInteger(timestampSeconds)) return false;
  const age = Math.abs(Math.floor((input.nowMs ?? Date.now()) / 1000) - timestampSeconds);
  if (age > MAX_WEBHOOK_AGE_SECONDS) return false;

  let secretBytes: Buffer;
  try {
    secretBytes = Buffer.from(secret.slice('whsec_'.length), 'base64');
  } catch {
    return false;
  }
  if (secretBytes.length === 0) return false;

  const signedPayload = `${input.webhookId}.${input.timestamp}.${input.rawBody}`;
  const expected = crypto.createHmac('sha256', secretBytes).update(signedPayload).digest('base64');
  return input.signatures.split(' ').some((value) => {
    const [version, signature] = value.split(',', 2);
    if (version !== 'v1' || !signature) return false;
    const expectedBytes = Buffer.from(expected);
    const providedBytes = Buffer.from(signature);
    return providedBytes.length === expectedBytes.length && crypto.timingSafeEqual(providedBytes, expectedBytes);
  });
}

function removeHtmlBlocksRepeatedly(input: string, pattern: RegExp): string {
  let previous: string;
  let sanitized = input;
  do {
    previous = sanitized;
    sanitized = sanitized.replace(pattern, '');
  } while (sanitized !== previous);
  return sanitized;
}

export function htmlToPlainText(html: string): string {
  return removeHtmlBlocksRepeatedly(
    removeHtmlBlocksRepeatedly(html, /<style\b[^>]*>[\s\S]*?<\/style\b[^>]*>/gi),
    /<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi,
  )
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(nbsp|amp|lt|gt|quot|#39|apos);/gi, (entity) => {
      const decoded: Record<string, string> = {
        nbsp: ' ',
        amp: '&',
        lt: '<',
        gt: '>',
        quot: '"',
        '#39': "'",
        apos: "'",
      };
      return decoded[entity.slice(1, -1).toLowerCase()] ?? entity;
    })
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function boundedSlackExcerpt(body: string, maxCharacters = 1200): string {
  const normalized = body.trim();
  if (normalized.length <= maxCharacters) return normalized;
  return `${normalized.slice(0, Math.max(0, maxCharacters - 1)).trimEnd()}…`;
}
