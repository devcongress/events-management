import { isDisposableEmailDomain } from 'disposable-email-domains-js';

const DNS_RESOLVERS = [
  { name: 'cloudflare', endpoint: 'https://cloudflare-dns.com/dns-query' },
  { name: 'google', endpoint: 'https://dns.google/resolve' },
] as const;
const DNS_TIMEOUT_MS = 1_500;
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

interface DnsJsonAnswer {
  type?: number;
  data?: string;
}

interface DnsJsonResponse {
  Status?: number;
  Answer?: DnsJsonAnswer[];
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
  fetcher?: PublicEmailPreflightFetcher;
  now?: () => number;
  onDnsFailure?: (failure: PublicEmailDnsFailure) => void;
  skipDomainLookup?: boolean;
  timeoutMs?: number;
}

export type PublicEmailPreflightFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface PublicEmailDnsFailure {
  resolver: (typeof DNS_RESOLVERS)[number]['name'];
  recordType: DnsRecordType;
  failureKind: 'dns_status' | 'http_status' | 'invalid_response' | 'request_error';
  durationMs: number;
  dnsStatus?: number;
  httpStatus?: number;
  errorName?: string;
}

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

function validDnsResponse(value: unknown): value is DnsJsonResponse & { Status: number } {
  if (!value || typeof value !== 'object') return false;
  const response = value as { Status?: unknown; Answer?: unknown };
  if (!Number.isInteger(response.Status) || (response.Status as number) < 0) return false;
  if (response.Answer === undefined) return true;
  return Array.isArray(response.Answer) && response.Answer.every((answer) => {
    if (!answer || typeof answer !== 'object') return false;
    const record = answer as { type?: unknown; data?: unknown };
    return (record.type === undefined || typeof record.type === 'number')
      && (record.data === undefined || typeof record.data === 'string');
  });
}

async function queryDnsResolver(
  domain: string,
  type: DnsRecordType,
  resolver: (typeof DNS_RESOLVERS)[number],
  fetcher: PublicEmailPreflightFetcher,
  options: PublicEmailPreflightOptions,
): Promise<DnsJsonResponse | null> {
  const url = new URL(resolver.endpoint);
  url.searchParams.set('name', domain);
  url.searchParams.set('type', type);
  const controller = new AbortController();
  const startedAt = Date.now();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DNS_TIMEOUT_MS);

  try {
    const response = await fetcher(url.toString(), {
      headers: { Accept: 'application/dns-json' },
      redirect: 'error',
      signal: controller.signal,
    });
    const durationMs = Date.now() - startedAt;
    if (!response.ok) {
      reportDnsFailure(options, {
        resolver: resolver.name,
        recordType: type,
        failureKind: 'http_status',
        httpStatus: response.status,
        durationMs,
      });
      return null;
    }

    const value: unknown = await response.json();
    if (!validDnsResponse(value)) {
      reportDnsFailure(options, {
        resolver: resolver.name,
        recordType: type,
        failureKind: 'invalid_response',
        durationMs,
      });
      return null;
    }
    if (value.Status !== 0 && value.Status !== 3) {
      reportDnsFailure(options, {
        resolver: resolver.name,
        recordType: type,
        failureKind: 'dns_status',
        dnsStatus: value.Status,
        durationMs,
      });
      return null;
    }
    return value;
  } catch (error) {
    reportDnsFailure(options, {
      resolver: resolver.name,
      recordType: type,
      failureKind: 'request_error',
      errorName: error instanceof Error ? error.name : 'UnknownError',
      durationMs: Date.now() - startedAt,
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function queryDns(
  domain: string,
  type: DnsRecordType,
  fetcher: PublicEmailPreflightFetcher,
  options: PublicEmailPreflightOptions,
): Promise<DnsJsonResponse> {
  for (const resolver of DNS_RESOLVERS) {
    const response = await queryDnsResolver(domain, type, resolver, fetcher, options);
    if (response) return response;
  }
  throw new Error('dns_resolvers_unavailable');
}

function hasDnsAnswer(response: DnsJsonResponse, type: number): boolean {
  return response.Answer?.some((answer) => answer.type === type && Boolean(answer.data?.trim())) ?? false;
}

async function assessDomain(
  domain: string,
  options: PublicEmailPreflightOptions,
): Promise<DomainAssessment> {
  const now = options.now?.() ?? Date.now();
  const cached = domainAssessmentCache.get(domain);
  if (cached && cached.expiresAt > now) return cached.value;
  if (cached) domainAssessmentCache.delete(domain);

  const fetcher = options.fetcher ?? fetch;
  let assessment: DomainAssessment;
  try {
    const mx = await queryDns(domain, 'MX', fetcher, options);
    if (mx.Status === 3) {
      assessment = {
        status: 'invalid',
        reason: 'domain_not_found',
        message: 'That email domain does not exist. Check the address and try again.',
      };
    } else if (mx.Status !== 0) {
      assessment = { status: 'unknown', reason: 'dns_unavailable' };
    } else {
      const mxAnswers = mx.Answer?.filter((answer) => answer.type === 15 && Boolean(answer.data?.trim())) ?? [];
      const nullMx = mxAnswers.some((answer) => /^0\s+\.$/u.test(answer.data!.trim()));
      if (nullMx) {
        assessment = {
          status: 'invalid',
          reason: 'domain_rejects_email',
          message: 'That email domain does not accept messages. Use another email address.',
        };
      } else if (mxAnswers.length > 0) {
        assessment = { status: 'deliverable', reason: 'mail_domain_available' };
      } else {
        const [a, aaaa] = await Promise.all([
          queryDns(domain, 'A', fetcher, options),
          queryDns(domain, 'AAAA', fetcher, options),
        ]);
        if (hasDnsAnswer(a, 1) || hasDnsAnswer(aaaa, 28)) {
          assessment = { status: 'deliverable', reason: 'mail_domain_available' };
        } else if (a.Status === 3 && aaaa.Status === 3) {
          assessment = {
            status: 'invalid',
            reason: 'domain_not_found',
            message: 'That email domain does not exist. Check the address and try again.',
          };
        } else if (a.Status !== 0 || aaaa.Status !== 0) {
          assessment = { status: 'unknown', reason: 'dns_unavailable' };
        } else {
          assessment = {
            status: 'invalid',
            reason: 'domain_rejects_email',
            message: 'That email domain does not appear to receive messages. Use another email address.',
          };
        }
      }
    }
  } catch {
    assessment = { status: 'unknown', reason: 'dns_unavailable' };
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
