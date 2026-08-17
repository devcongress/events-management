import { describe, expect, it } from 'vitest';

import { assertLocalAtlasRuntime, isAllowedMutation, isLoopbackHostname } from './safety';

describe('Scenario Atlas local-only boundary', () => {
  it('accepts loopback hosts and rejects non-loopback hosts', () => {
    expect(isLoopbackHostname('127.0.0.1')).toBe(true);
    expect(isLoopbackHostname('localhost')).toBe(true);
    expect(isLoopbackHostname('events.devcongress.org')).toBe(false);
  });

  it('refuses production and Cloudflare execution', () => {
    expect(() => assertLocalAtlasRuntime({ NODE_ENV: 'production' })).toThrow(/local-only/);
    expect(() => assertLocalAtlasRuntime({ CF_PAGES: '1' })).toThrow(/local-only/);
    expect(() => assertLocalAtlasRuntime({ NODE_ENV: 'development' })).not.toThrow();
  });

  it('allows mutations only from the same loopback origin', () => {
    expect(isAllowedMutation(new Request('http://127.0.0.1:4178/api/scenarios/SUB-03/status', { method: 'PUT', headers: { origin: 'http://127.0.0.1:4178' } }))).toBe(true);
    expect(isAllowedMutation(new Request('http://127.0.0.1:4178/api/scenarios/SUB-03/status', { method: 'PUT', headers: { origin: 'https://attacker.example' } }))).toBe(false);
  });
});
