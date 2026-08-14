import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assessPublicEmail,
  clearPublicEmailDomainCacheForTests,
  type PublicEmailPreflightFetcher,
} from './public-email-preflight';

function dnsResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/dns-json' },
  });
}

describe('public email preflight', () => {
  beforeEach(() => {
    clearPublicEmailDomainCacheForTests();
  });

  it('rejects malformed addresses before a DNS request', async () => {
    const fetcher = vi.fn();

    await expect(assessPublicEmail('not-an-email', { fetcher: fetcher as PublicEmailPreflightFetcher })).resolves.toMatchObject({
      status: 'invalid',
      reason: 'invalid_syntax',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('suggests a correction for a high-confidence provider typo', async () => {
    await expect(assessPublicEmail('Ama@GMIAL.com')).resolves.toMatchObject({
      status: 'invalid',
      reason: 'likely_typo',
      suggestion: 'ama@gmail.com',
      message: 'Did you mean ama@gmail.com?',
    });
  });

  it('rejects a known disposable email domain without a network request', async () => {
    const fetcher = vi.fn();

    await expect(assessPublicEmail('guest@mailinator.com', { fetcher: fetcher as PublicEmailPreflightFetcher })).resolves.toMatchObject({
      status: 'invalid',
      reason: 'disposable_domain',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('accepts a domain with an MX record', async () => {
    const fetcher = vi.fn(async () => dnsResponse({
      Status: 0,
      Answer: [{ type: 15, data: '10 mail.example.org.' }],
    }));

    await expect(assessPublicEmail('guest@example.org', { fetcher: fetcher as PublicEmailPreflightFetcher })).resolves.toEqual({
      status: 'deliverable',
      normalizedEmail: 'guest@example.org',
      domain: 'example.org',
      reason: 'mail_domain_available',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects a domain that explicitly publishes a null MX', async () => {
    const fetcher = vi.fn(async () => dnsResponse({
      Status: 0,
      Answer: [{ type: 15, data: '0 .' }],
    }));

    await expect(assessPublicEmail('guest@example.org', { fetcher: fetcher as PublicEmailPreflightFetcher })).resolves.toMatchObject({
      status: 'invalid',
      reason: 'domain_rejects_email',
    });
  });

  it('accepts the SMTP A-record fallback when no MX record exists', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const recordType = new URL(String(input)).searchParams.get('type');
      if (recordType === 'MX') return dnsResponse({ Status: 0, Answer: [] });
      if (recordType === 'A') return dnsResponse({ Status: 0, Answer: [{ type: 1, data: '192.0.2.1' }] });
      return dnsResponse({ Status: 0, Answer: [] });
    });

    await expect(assessPublicEmail('guest@example.org', { fetcher: fetcher as PublicEmailPreflightFetcher })).resolves.toMatchObject({
      status: 'deliverable',
      reason: 'mail_domain_available',
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('rejects a domain that does not exist', async () => {
    const fetcher = vi.fn(async () => dnsResponse({ Status: 3 }));

    await expect(assessPublicEmail('guest@missing.example', { fetcher: fetcher as PublicEmailPreflightFetcher })).resolves.toMatchObject({
      status: 'invalid',
      reason: 'domain_not_found',
    });
  });

  it('fails open when DNS is temporarily unavailable', async () => {
    const fetcher = vi.fn(async () => dnsResponse({}, 503));

    await expect(assessPublicEmail('guest@example.org', { fetcher: fetcher as PublicEmailPreflightFetcher })).resolves.toEqual({
      status: 'unknown',
      normalizedEmail: 'guest@example.org',
      domain: 'example.org',
      reason: 'dns_unavailable',
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('uses the secondary resolver when the primary resolver is unavailable', async () => {
    const failures: unknown[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL) => (
      new URL(String(input)).hostname === 'cloudflare-dns.com'
        ? dnsResponse({}, 403)
        : dnsResponse({ Status: 0, Answer: [{ type: 15, data: '10 mail.example.org.' }] })
    ));

    await expect(assessPublicEmail('guest@example.org', {
      fetcher: fetcher as PublicEmailPreflightFetcher,
      onDnsFailure: (failure) => failures.push(failure),
    })).resolves.toMatchObject({
      status: 'deliverable',
      reason: 'mail_domain_available',
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(failures).toEqual([expect.objectContaining({
      resolver: 'cloudflare',
      recordType: 'MX',
      failureKind: 'http_status',
      httpStatus: 403,
    })]);
  });

  it('uses the secondary resolver when the primary returns malformed JSON data', async () => {
    const failures: unknown[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL) => (
      new URL(String(input)).hostname === 'cloudflare-dns.com'
        ? dnsResponse({ Status: 0, Answer: [null] })
        : dnsResponse({ Status: 3 })
    ));

    await expect(assessPublicEmail('guest@missing.example', {
      fetcher: fetcher as PublicEmailPreflightFetcher,
      onDnsFailure: (failure) => failures.push(failure),
    })).resolves.toMatchObject({
      status: 'invalid',
      reason: 'domain_not_found',
    });
    expect(failures).toEqual([expect.objectContaining({
      resolver: 'cloudflare',
      failureKind: 'invalid_response',
    })]);
  });

  it('does not let a diagnostics callback break fail-open validation', async () => {
    const fetcher = vi.fn(async () => dnsResponse({}, 503));

    await expect(assessPublicEmail('guest@example.org', {
      fetcher: fetcher as PublicEmailPreflightFetcher,
      onDnsFailure: () => {
        throw new Error('logging unavailable');
      },
    })).resolves.toMatchObject({
      status: 'unknown',
      reason: 'dns_unavailable',
    });
  });

  it('caches only domain-level results and preserves each normalized address', async () => {
    const fetcher = vi.fn(async () => dnsResponse({
      Status: 0,
      Answer: [{ type: 15, data: '10 mail.example.org.' }],
    }));

    const first = await assessPublicEmail('FIRST@example.org', { fetcher: fetcher as PublicEmailPreflightFetcher });
    const second = await assessPublicEmail('SECOND@example.org', { fetcher: fetcher as PublicEmailPreflightFetcher });

    expect(first.normalizedEmail).toBe('first@example.org');
    expect(second.normalizedEmail).toBe('second@example.org');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
