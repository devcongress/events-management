import { describe, expect, it } from 'vitest';
import { assertSafeStagingTarget, PRODUCTION_HOSTNAMES } from './deployed-security';

describe('staging DAST target guard', () => {
  it.each([...PRODUCTION_HOSTNAMES])('rejects production hostname %s', (hostname) => {
    expect(() => assertSafeStagingTarget(`https://${hostname}`, hostname)).toThrow(/production hostname/);
  });

  it('requires an exact non-production hostname confirmation', () => {
    expect(() => assertSafeStagingTarget('https://preview.example.net', undefined)).toThrow(
      'DAST_CONFIRM_NON_PRODUCTION=preview.example.net',
    );
    expect(() => assertSafeStagingTarget('https://preview.example.net', 'staging.example.net')).toThrow(
      'DAST_CONFIRM_NON_PRODUCTION=preview.example.net',
    );
  });

  it('requires HTTPS for remote staging targets', () => {
    expect(() => assertSafeStagingTarget('http://preview.example.net', 'preview.example.net')).toThrow(/requires HTTPS/);
  });

  it('allows an explicitly confirmed HTTPS staging target and localhost', () => {
    expect(assertSafeStagingTarget('https://preview.example.net', 'preview.example.net').origin).toBe('https://preview.example.net');
    expect(assertSafeStagingTarget('http://localhost:4173', 'localhost').origin).toBe('http://localhost:4173');
  });
});
