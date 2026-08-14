import { isDisposableEmailDomain } from 'disposable-email-domains-js';
import { promises as nodeDns } from 'node:dns';

const DNS_TIMEOUT_MS = 2_500;
const DNS_CACHE_TTL_MS = 6 * 60 * 60 * 1_000;
const DNS_INVALID_CACHE_TTL_MS = 30 * 60 * 1_000;
const DNS_UNKNOWN_CACHE_TTL_MS = 5 * 60 * 1_000;
const MAX_DOMAIN_CACHE_ENTRIES = 2_000;

const COMMON_EMAIL_DOMAIN_TYPOS = new Map<string, string>([
  ['gmai.com', 'gmail.com'],
  ['gmail.co', 'gmail.com'],
  ['gmail.con', 'gmail.com'],
  ['gmial.com', 'gmail.com'],
  ['gmal.com', 'gmail.com'],
  ['hotmai.com', 'hotmail.com'],
  ['hotmail.co', 'hotmail.com'],
  ['icloud.co', 'icloud.com'],
  ['outlok.com', 'outlook.com'],
  ['outlook.co', 'outlook.com'],
  ['protonmai.com', 'protonmail.com'],
  ['yaho.com', 'yahoo.com'],
  ['yahoo.co', 'yahoo.com'],
  ['yahooo.com', 'yahoo.com'],
]);

type DnsRecordType = 'A' | 'AAAA' | 'MX';

interface MxRecord {
  exchange: string;
  priority: number;
}

export type PublicEmailPreflightResult =
  | {
      status: 'deliverable';
      normalizedEmail: string;
      domain: string;
      reason: 'mail_domain_available' | 'test_environment';
    }
  | {
      status: 'invalid';
      normalizedEmail: string;
      domain: string | null;
      reason: 'invalid_syntax' | 'likely_typo' | 'disposable_domain' | 'domain_not_found' | 'domain_rejects_email';
      message: string;
      suggestion?: string;
    }
  | {
      status: 'unknown';
      normalizedEmail: string;
      domain: string;
      reason: 'dns_unavailable';
    };

type DomainAssessment =
  | { status: 'deliverable'; reason: 'mail_domain_available' }
  | {
      status: 'invalid';
      reason: 'domain_not_found' | 'domain_rejects_email';
      message: string;
    }
  | { status: 'unknown'; reason: 'dns_unavailable' };

interface CachedDomainAssessment {
  expiresAt: number;
  value: DomainAssessment;
}

export interface PublicEmailPreflightOptions {
  dnsResolver?: PublicEmailDnsResolver;
  now?: () => number;
  onDnsFailure?: (failure: PublicEmailDnsFailure) => void;
  skipDomainLookup?: boolean;
  timeoutMs?: number;
}

export interface PublicEmailDnsResolver {
  resolve4(domain: string): Promise<string[]>;
  resolve6(domain: string): Promise<string[]>;
  resolveMx(domain: string): Promise<MxRecord[]>;
}

export interface PublicEmailDnsFailure {
  resolver: 'cloudflare_native';
  recordType: DnsRecordType;
  failureKind: 'dns_error' | 'invalid_response' | 'timeout';
  durationMs: number;
  errorCode?: string;
  errorName?: string;
}

type DnsQueryOutcome<T> =
  | { status: 'available'; records: T[] }
  | { status: 'absent'; errorCode: 'ENODATA' | 'ENOTFOUND' }
  | { status: 'unavailable' };

const nativeDnsResolver: PublicEmailDnsResolver = {
  resolve4: (domain) => nodeDns.resolve4(domain),
  resolve6: (domain) => nodeDns.resolve6(domain),
  resolveMx: (domain) => nodeDns.resolveMx(domain),
};

const domainAssessmentCache = new Map<string, CachedDomainAssessment>();

function normalizeEmail(value: string): { normalizedEmail: string; domain: string } | null {
  const normalizedEmail = value.trim().toLowerCase();
  if (!normalizedEmail || normalizedEmail.length > 254 || /[\s\u0000-\u001f\u007f]/u.test(normalizedEmail)) {
    return null;
  }

  const atIndex = normalizedEmail.lastIndexOf('@');
  if (atIndex <= 0 || atIndex !== normalizedEmail.indexOf('@') || atIndex === normalizedEmail.length - 1) {
    return null;
  }

  const localPart = normalizedEmail.slice(0, atIndex);
  const rawDomain = normalizedEmail.slice(atIndex + 1);
  if (localPart.length > 64 || rawDomain.length > 253 || rawDomain.startsWith('.') || rawDomain.endsWith('.')) {
    return null;
  }

  let domain: string;
  try {
    domain = new URL(`https://${rawDomain}`).hostname;
  } catch {
    return null;
  }

  if (!domain || domain !== rawDomain || !domain.includes('.')) return null;
  const labels = domain.split('.');
  if (labels.some((label) => !label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(label))) {
    return null;
  }

  return { normalizedEmail, domain };
}

function emailWithDomain(normalizedEmail: string, domain: string): string {
  return `${normalizedEmail.slice(0, normalizedEmail.lastIndexOf('@') + 1)}${domain}`;
}

function cacheDomainAssessment(domain: string, value: DomainAssessment, now: number): void {
  if (domainAssessmentCache.size >= MAX_DOMAIN_CACHE_ENTRIES) {
    const oldestKey = domainAssessmentCache.keys().next().value as string | undefined;
    if (oldestKey) domainAssessmentCache.delete(oldestKey);
  }
  domainAssessmentCache.set(domain, {
    expiresAt: now + (
      value.status === 'unknown'
        ? DNS_UNKNOWN_CACHE_TTL_MS
        : value.status === 'invalid'
          ? DNS_INVALID_CACHE_TTL_MS
          : DNS_CACHE_TTL_MS
    ),
    value,
  });
}

function reportDnsFailure(
  options: PublicEmailPreflightOptions,
  failure: PublicEmailDnsFailure,
): void {
  try {
    options.onDnsFailure?.(failure);
  } catch {
    // Observability must never change whether a public submission can proceed.
  }
}

function dnsErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

function validDnsRecords(type: DnsRecordType, value: unknown): value is string[] | MxRecord[] {
  if (!Array.isArray(value)) return false;
  if (type !== 'MX') return value.every((record) => typeof record === 'string' && record.length > 0);
  return value.every((record) => {
    if (!record || typeof record !== 'object') return false;
    const mx = record as { exchange?: unknown; priority?: unknown };
    return typeof mx.exchange === 'string' && typeof mx.priority === 'number';
  });
}

async function queryNativeDns<T extends string | MxRecord>(
  type: DnsRecordType,
  operation: () => Promise<T[]>,
  options: PublicEmailPreflightOptions,
): Promise<DnsQueryOutcome<T>> {
  const startedAt = Date.now();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    const value: unknown = await Promise.race([
      operation(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          const error = new Error('DNS query timed out.');
          error.name = 'DnsTimeoutError';
          reject(error);
        }, options.timeoutMs ?? DNS_TIMEOUT_MS);
      }),
    ]);
    if (!validDnsRecords(type, value)) {
      reportDnsFailure(options, {
        resolver: 'cloudflare_native',
        recordType: type,
        failureKind: 'invalid_response',
        durationMs: Date.now() - startedAt,
      });
      return { status: 'unavailable' };
    }
    return { status: 'available', records: value as T[] };
  } catch (error) {
    const errorCode = dnsErrorCode(error);
    if (errorCode === 'ENODATA' || errorCode === 'ENOTFOUND') {
      return { status: 'absent', errorCode };
    }
    reportDnsFailure(options, {
      resolver: 'cloudflare_native',
      recordType: type,
      failureKind: error instanceof Error && error.name === 'DnsTimeoutError' ? 'timeout' : 'dns_error',
      errorCode,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      durationMs: Date.now() - startedAt,
    });
    return { status: 'unavailable' };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function assessDomain(
  domain: string,
  options: PublicEmailPreflightOptions,
): Promise<DomainAssessment> {
  const now = options.now?.() ?? Date.now();
  const cached = domainAssessmentCache.get(domain);
  if (cached && cached.expiresAt > now) return cached.value;
  if (cached) domainAssessmentCache.delete(domain);

  const resolver = options.dnsResolver ?? nativeDnsResolver;
  const mx = await queryNativeDns('MX', () => resolver.resolveMx(domain), options);
  let assessment: DomainAssessment;
  if (mx.status === 'unavailable') {
    assessment = { status: 'unknown', reason: 'dns_unavailable' };
  } else if (mx.status === 'available' && mx.records.length > 0) {
    const nullMx = mx.records.some((record) => record.priority === 0 && record.exchange.trim() === '');
    assessment = nullMx
      ? {
          status: 'invalid',
          reason: 'domain_rejects_email',
          message: 'That email domain does not accept messages. Use another email address.',
        }
      : { status: 'deliverable', reason: 'mail_domain_available' };
  } else {
    const [a, aaaa] = await Promise.all([
      queryNativeDns('A', () => resolver.resolve4(domain), options),
      queryNativeDns('AAAA', () => resolver.resolve6(domain), options),
    ]);
    const hasAddress = (a.status === 'available' && a.records.length > 0)
      || (aaaa.status === 'available' && aaaa.records.length > 0);
    if (hasAddress) {
      assessment = { status: 'deliverable', reason: 'mail_domain_available' };
    } else if (a.status === 'unavailable' || aaaa.status === 'unavailable') {
      assessment = { status: 'unknown', reason: 'dns_unavailable' };
    } else if (a.status === 'absent' && a.errorCode === 'ENOTFOUND'
      && aaaa.status === 'absent' && aaaa.errorCode === 'ENOTFOUND') {
      assessment = {
        status: 'invalid',
        reason: 'domain_not_found',
        message: 'That email domain does not exist. Check the address and try again.',
      };
    } else {
      assessment = {
        status: 'invalid',
        reason: 'domain_rejects_email',
        message: 'That email domain does not appear to receive messages. Use another email address.',
      };
    }
  }

  cacheDomainAssessment(domain, assessment, now);
  return assessment;
}

export async function assessPublicEmail(
  email: string,
  options: PublicEmailPreflightOptions = {},
): Promise<PublicEmailPreflightResult> {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return {
      status: 'invalid',
      normalizedEmail: email.trim().toLowerCase(),
      domain: null,
      reason: 'invalid_syntax',
      message: 'Enter a valid email address.',
    };
  }

  const suggestedDomain = COMMON_EMAIL_DOMAIN_TYPOS.get(normalized.domain);
  if (suggestedDomain) {
    const suggestion = emailWithDomain(normalized.normalizedEmail, suggestedDomain);
    return {
      status: 'invalid',
      normalizedEmail: normalized.normalizedEmail,
      domain: normalized.domain,
      reason: 'likely_typo',
      suggestion,
      message: `Did you mean ${suggestion}?`,
    };
  }

  if (isDisposableEmailDomain(normalized.domain)) {
    return {
      status: 'invalid',
      normalizedEmail: normalized.normalizedEmail,
      domain: normalized.domain,
      reason: 'disposable_domain',
      message: 'Use a permanent email address so we can send your event updates.',
    };
  }

  if (options.skipDomainLookup) {
    return {
      status: 'deliverable',
      normalizedEmail: normalized.normalizedEmail,
      domain: normalized.domain,
      reason: 'test_environment',
    };
  }

  const result = await assessDomain(normalized.domain, options);
  return {
    ...result,
    normalizedEmail: normalized.normalizedEmail,
    domain: normalized.domain,
  };
}

export function clearPublicEmailDomainCacheForTests(): void {
  domainAssessmentCache.clear();
}
