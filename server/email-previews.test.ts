import { describe, expect, it } from 'vitest';
import app from './app';

describe('owner email preview endpoint', () => {
  it('is registered as a read-only API route', () => {
    expect(app.routes).toContainEqual(expect.objectContaining({
      method: 'GET',
      path: '/api/admin/email-previews',
    }));
    expect(app.routes).toContainEqual(expect.objectContaining({
      method: 'GET',
      path: '/api/admin/email-previews/:previewId/html',
    }));
    expect(app.routes).not.toContainEqual(expect.objectContaining({
      method: 'POST',
      path: '/api/admin/email-previews',
    }));
  });

  it('rejects unauthenticated preview requests', async () => {
    const [response, documentResponse] = await Promise.all([
      app.request('/api/admin/email-previews'),
      app.request('/api/admin/email-previews/registration_confirmed/html'),
    ]);

    expect(response.status).toBe(401);
    expect(documentResponse.status).toBe(401);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      error: expect.any(String),
    }));
    expect(documentResponse.headers.get('x-frame-options')).toBe('DENY');
  });
});
