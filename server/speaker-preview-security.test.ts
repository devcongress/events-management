import { describe, expect, it, vi } from 'vitest';
import type { Hono } from 'hono';
import type { AppBindings } from '@/server/http/app-bindings';

vi.mock('@/lib/supabase/admin-auth', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/supabase/admin-auth')>(),
  requireAdmin: async () => null,
}));

vi.mock('./routes/annual-conference-speakers/updates', () => ({
  registerSpeakerUpdateRoutes(app: Hono<AppBindings>) {
    app.get('/api/annual-conference/:year/speaker-updates/:id/previews/:previewId/recipients/:recipientId/html', (c) => c.req.query('error') ? c.json({ error: 'Unavailable' }, 409) : c.html('<p>Frozen</p>'));
    app.get('/api/annual-conference/:year/speaker-updates/:id/previews/:previewId/recipients/:recipientId/other', (c) => c.html('<p>Other</p>'));
  },
}));

describe('speaker preview document security headers', () => {
  it('only relaxes framing and styles for successful HTML at the exact document path', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { default: app } = await import('./app');
    const id = '00000000-0000-4000-8000-000000000001';
    const base = `/api/annual-conference/2026/speaker-updates/${id}/previews/${id}/recipients/${id}`;
    const response = await app.request(`${base}/html`);
    const policy = response.headers.get('content-security-policy');

    expect(response.status).toBe(200);
    expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("script-src 'none'");
    expect(policy).toContain("form-action 'none'");
    expect(policy).toContain("frame-ancestors 'self'");
    expect(policy).toContain("style-src 'unsafe-inline'");
    for (const path of [`${base}/html?error=1`, `${base}/other`]) {
      const rejected = await app.request(path);

      expect(rejected.headers.get('x-frame-options')).toBe('DENY');
      expect(rejected.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
      expect(rejected.headers.get('content-security-policy')).toContain("style-src-attr 'none'");
    }
    vi.unstubAllEnvs();
  });
});
