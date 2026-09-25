import { describe, expect, it } from 'vitest';
import { isUnauthenticatedApiRequest } from './app';

describe('public API access policy', () => {
  it('allows the public volunteer follow-up test form without opening the owner campaign API', () => {
    const testFormPath = '/api/annual-conference/2026/volunteer-follow-up/test';

    expect(isUnauthenticatedApiRequest(testFormPath, 'GET')).toBe(true);
    expect(isUnauthenticatedApiRequest(testFormPath, 'POST')).toBe(true);
    expect(isUnauthenticatedApiRequest(testFormPath, 'PATCH')).toBe(false);
    expect(
      isUnauthenticatedApiRequest('/api/annual-conference/2026/volunteer-follow-up', 'GET'),
    ).toBe(false);
  });
});
