import { describe, expect, it } from 'vitest';
import { safePublicResourceUrl } from './safe-url';

describe('safePublicResourceUrl', () => {
  it.each([
    ['https://example.com/slides', 'https://example.com/slides'],
    [' https://github.com/devcongress/demo ', 'https://github.com/devcongress/demo'],
    ['https://fdroid.example/demo', 'https://fdroid.example/demo'],
  ])('accepts a public HTTPS resource: %s', (value, expected) => {
    expect(safePublicResourceUrl(value)).toBe(expected);
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'http://example.com/slides',
    'https://user:password@example.com/slides',
    'https://localhost/slides',
    'https://127.0.0.1/slides',
    'https://10.0.0.4/slides',
  ])('rejects an unsafe presenter resource: %s', (value) => {
    expect(safePublicResourceUrl(value)).toBeNull();
  });
});
