import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assessPublicEmail,
  clearPublicEmailDomainCacheForTests,
  type PublicEmailDnsResolver,
} from './public-email-preflight';

function dnsError(code: string): Error & { code: string } {
  return Object.assign(new Error(`DNS error: ${code}`), { code });
}

function dnsResolver(overrides: Partial<PublicEmailDnsResolver> = {}): PublicEmailDnsResolver {
  return {
    resolve4: vi.fn(overrides.resolve4 ?? (async () => [])),
    resolve6: vi.fn(overrides.resolve6 ?? (async () => [])),
    resolveMx: vi.fn(overrides.resolveMx ?? (async () => [{ exchange: 'mail.example.org', priority: 10 }])),
  };
}

describe('public email preflight', () => {
  beforeEach(() => {
    clearPublicEmailDomainCacheForTests();
  });

  it('rejects malformed addresses before a DNS request', async () => {
    const resolver = dnsResolver();

    await expect(assessPublicEmail('not-an-email', { dnsResolver: resolver })).resolves.toMatchObject({
      status: 'invalid',
      reason: 'invalid_syntax',
    });
    expect(resolver.resolveMx).not.toHaveBeenCalled();
  });

  it('suggests a correction for a high-confidence provider typo', async () => {
    await expect(assessPublicEmail('Ama@GMIAL.com')).resolves.toMatchObject({
      status: 'invalid',
      reason: 'likely_typo',
      suggestion: 'ama@gmail.com',
      message: 'Did you mean ama@gmail.com?',
    });
  });

  it('rejects a known disposable email domain without a DNS request', async () => {
    const resolver = dnsResolver();

    await expect(assessPublicEmail('guest@mailinator.com', { dnsResolver: resolver })).resolves.toMatchObject({
      status: 'invalid',
      reason: 'disposable_domain',
    });
    expect(resolver.resolveMx).not.toHaveBeenCalled();
  });

  it('accepts a domain with an MX record', async () => {
    const resolver = dnsResolver();

    await expect(assessPublicEmail('guest@example.org', { dnsResolver: resolver })).resolves.toEqual({
      status: 'deliverable',
      normalizedEmail: 'guest@example.org',
      domain: 'example.org',
      reason: 'mail_domain_available',
    });
    expect(resolver.resolveMx).toHaveBeenCalledTimes(1);
    expect(resolver.resolve4).not.toHaveBeenCalled();
  });

  it('rejects a domain that explicitly publishes a null MX', async () => {
    const resolver = dnsResolver({
      resolveMx: async () => [{ exchange: '', priority: 0 }],
    });

    await expect(assessPublicEmail('guest@example.org', { dnsResolver: resolver })).resolves.toMatchObject({
      status: 'invalid',
      reason: 'domain_rejects_email',
    });
  });

  it('accepts the SMTP A-record fallback when no MX record exists', async () => {
    const resolver = dnsResolver({
      resolveMx: async () => { throw dnsError('ENODATA'); },
      resolve4: async () => ['192.0.2.1'],
      resolve6: async () => { throw dnsError('ENODATA'); },
    });

    await expect(assessPublicEmail('guest@example.org', { dnsResolver: resolver })).resolves.toMatchObject({
      status: 'deliverable',
      reason: 'mail_domain_available',
    });
    expect(resolver.resolveMx).toHaveBeenCalledTimes(1);
    expect(resolver.resolve4).toHaveBeenCalledTimes(1);
    expect(resolver.resolve6).toHaveBeenCalledTimes(1);
  });

  it('rejects a domain only when both address lookups confirm it is not found', async () => {
    const resolver = dnsResolver({
      resolveMx: async () => { throw dnsError('ENOTFOUND'); },
      resolve4: async () => { throw dnsError('ENOTFOUND'); },
      resolve6: async () => { throw dnsError('ENOTFOUND'); },
    });

    await expect(assessPublicEmail('guest@missing.example', { dnsResolver: resolver })).resolves.toMatchObject({
      status: 'invalid',
      reason: 'domain_not_found',
    });
  });

  it('fails open and reports safe diagnostics when native DNS is unavailable', async () => {
    const failures: unknown[] = [];
    const resolver = dnsResolver({
      resolveMx: async () => { throw dnsError('ESERVFAIL'); },
    });

    await expect(assessPublicEmail('guest@example.org', {
      dnsResolver: resolver,
      onDnsFailure: (failure) => failures.push(failure),
    })).resolves.toEqual({
      status: 'unknown',
      normalizedEmail: 'guest@example.org',
      domain: 'example.org',
      reason: 'dns_unavailable',
    });
    expect(failures).toEqual([expect.objectContaining({
      resolver: 'cloudflare_native',
      recordType: 'MX',
      failureKind: 'dns_error',
      errorCode: 'ESERVFAIL',
    })]);
  });

  it('fails open when native DNS returns malformed record data', async () => {
    const failures: unknown[] = [];
    const resolver = dnsResolver({
      resolveMx: async () => [null] as unknown as Array<{ exchange: string; priority: number }>,
    });

    await expect(assessPublicEmail('guest@example.org', {
      dnsResolver: resolver,
      onDnsFailure: (failure) => failures.push(failure),
    })).resolves.toMatchObject({ status: 'unknown', reason: 'dns_unavailable' });
    expect(failures).toEqual([expect.objectContaining({
      resolver: 'cloudflare_native',
      failureKind: 'invalid_response',
    })]);
  });

  it('bounds a stalled native DNS query and reports a timeout', async () => {
    const failures: unknown[] = [];
    const resolver = dnsResolver({
      resolveMx: () => new Promise(() => undefined),
    });

    await expect(assessPublicEmail('guest@example.org', {
      dnsResolver: resolver,
      timeoutMs: 1,
      onDnsFailure: (failure) => failures.push(failure),
    })).resolves.toMatchObject({ status: 'unknown', reason: 'dns_unavailable' });
    expect(failures).toEqual([expect.objectContaining({
      failureKind: 'timeout',
      errorName: 'DnsTimeoutError',
    })]);
  });

  it('does not let a diagnostics callback break fail-open validation', async () => {
    const resolver = dnsResolver({
      resolveMx: async () => { throw dnsError('ESERVFAIL'); },
    });

    await expect(assessPublicEmail('guest@example.org', {
      dnsResolver: resolver,
      onDnsFailure: () => {
        throw new Error('logging unavailable');
      },
    })).resolves.toMatchObject({
      status: 'unknown',
      reason: 'dns_unavailable',
    });
  });

  it('caches only domain-level results and preserves each normalized address', async () => {
    const resolver = dnsResolver();

    const first = await assessPublicEmail('FIRST@example.org', { dnsResolver: resolver });
    const second = await assessPublicEmail('SECOND@example.org', { dnsResolver: resolver });

    expect(first.normalizedEmail).toBe('first@example.org');
    expect(second.normalizedEmail).toBe('second@example.org');
    expect(resolver.resolveMx).toHaveBeenCalledTimes(1);
  });
});
