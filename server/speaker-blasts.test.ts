import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Hono } from 'hono';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import type { AppBindings } from './http/app-bindings';
import type { Event } from '@/types';
import type { SpeakerBlastAudience } from '@/lib/speaker-blasts';

const actor = vi.hoisted(() => ({ email: 'owner@example.com', allowed: true }));

vi.mock('@/lib/supabase/admin-auth', () => ({
  getAdminSession: async () => ({ authenticated: true, email: actor.email, role: 'owner' }),
  requireAdmin: async () => actor.allowed ? null : new Response('Forbidden', { status: 403 }),
}));
vi.mock('@/lib/email/delivery-health', async () => ({
  ...await vi.importActual<typeof import('@/lib/email/delivery-health')>('@/lib/email/delivery-health'),
  getEmailDeliveryHealth: async () => null,
  getEmailOutboxSummary: async () => null,
  recordResendEmailHealth: async () => undefined,
}));
const initialCwd = process.cwd();
let temporary: string;
let app: Hono<AppBindings>;
let audience: SpeakerBlastAudience;
let provider: ReturnType<typeof vi.fn>;
const event = { id: 'monthly', name: 'Monthly meetup', event_date: '2099-10-31', series_type: 'monthly' } as Event;
const url = '/api/events/monthly/speaker-blasts';

beforeEach(async () => {
  temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'speaker-blasts-'));
  process.chdir(temporary);
  vi.resetModules();
  vi.stubEnv('APP_DATA_SOURCE', 'local-json');
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('RESEND_API_KEY', 'fixture-key');
  vi.stubEnv('SPEAKER_EMAIL_REPLY_TO', 'speakers@example.com');
  actor.email = 'owner@example.com';
  actor.allowed = true;
  audience = { recipients: [{ email: 'ama@example.com', name: 'Ama', sessions: [{ id: 'talk-a', title: 'Systems', url: 'https://go.devcongress.org/P_fixture', deadline: '2099-10-31T23:59:59Z' }] }], excluded: [] };
  provider = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'provider-1' }] }), { status: 200 }));
  vi.stubGlobal('fetch', provider);
  const { registerSpeakerBlastRoutes } = await import('./routes/speaker-blasts');

  app = new Hono<AppBindings>();
  registerSpeakerBlastRoutes(app, { getEvent: async (id) => id === event.id ? event : undefined, audience: async () => audience, audit: async () => undefined });
});

afterEach(async () => {
  process.chdir(initialCwd);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await fs.rm(temporary, { recursive: true, force: true });
});

async function preview() {
  const response = await app.request(`${url}/preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ intent: 'slides_reminder', subject: 'Share slides', message: 'Please share your slides.' }) });

  expect(response.status).toBe(200);

  return await response.json() as { id: string; previews: Array<{ to: string; text: string }> };
}

describe('monthly speaker blast delivery', () => {
  it('sends an unchanged preview after database-style object key reordering', async () => {
    const draft = await preview();
    const { getSpeakerBlast, replaceSpeakerBlast } = await import('@/lib/speaker-blast-store');
    const row = (await getSpeakerBlast(draft.id, event.id))!;
    const recipients = row.payload.recipients.map((recipient) => ({
      sessions: recipient.sessions.map((session) => ({
        deadline: session.deadline, url: session.url, title: session.title, id: session.id,
      })),
      name: recipient.name,
      email: recipient.email,
    }));

    await replaceSpeakerBlast(row, { ...row.payload, recipients });
    const result = await app.request(`${url}/${draft.id}/send`, { method: 'POST' });

    expect(result.status).toBe(200);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it('previews the exact private email without sending, then sends once despite repeated confirmation', async () => {
    const draft = await preview();

    expect(provider).not.toHaveBeenCalled();
    expect(draft.previews[0].text).toContain('https://go.devcongress.org/P_fixture');
    const result = await app.request(`${url}/${draft.id}/send`, { method: 'POST' });

    expect(result.status).toBe(200);
    expect(provider).toHaveBeenCalledTimes(1);
    const repeat = await app.request(`${url}/${draft.id}/send`, { method: 'POST' });

    expect(repeat.status).toBe(200);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(provider.mock.calls[0][1].body))[0].to).toEqual(['ama@example.com']);
  });

  it('blocks changed audiences and private links before any send', async () => {
    const draft = await preview();

    audience.recipients[0].sessions[0].url = null;
    const result = await app.request(`${url}/${draft.id}/send`, { method: 'POST' });

    expect(result.status).toBe(409);
    expect(provider).not.toHaveBeenCalled();
  });

  it('protects organizer roles, preview ownership and event scope', async () => {
    actor.allowed = false;
    expect((await app.request(url)).status).toBe(403);
    actor.allowed = true;
    const draft = await preview();

    actor.email = 'another@example.com';
    expect((await app.request(`${url}/${draft.id}/send`, { method: 'POST' })).status).toBe(404);
    expect((await app.request(`/api/events/other/speaker-blasts/${draft.id}/send`, { method: 'POST' })).status).toBe(404);
    expect(provider).not.toHaveBeenCalled();
  });

  it('retries the identical provider payload and idempotency key after uncertain acceptance', async () => {
    provider.mockRejectedValueOnce(new Error('network disconnected'));
    const draft = await preview();

    expect((await app.request(`${url}/${draft.id}/send`, { method: 'POST' })).status).toBe(502);
    expect((await app.request(`${url}/${draft.id}/send`, { method: 'POST' })).status).toBe(200);
    expect(provider.mock.calls[0][1].body).toBe(provider.mock.calls[1][1].body);
    expect(provider.mock.calls[0][1].headers['Idempotency-Key']).toBe(provider.mock.calls[1][1].headers['Idempotency-Key']);
  });

  it('claims delivery atomically so simultaneous confirmations cannot both send', async () => {
    const draft = await preview();
    const results = await Promise.all([
      app.request(`${url}/${draft.id}/send`, { method: 'POST' }),
      app.request(`${url}/${draft.id}/send`, { method: 'POST' }),
    ]);

    expect(results.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it('rejects expired previews and limits retry to the provider idempotency window', async () => {
    const draft = await preview();
    const { getSpeakerBlast, replaceSpeakerBlast } = await import('@/lib/speaker-blast-store');
    const row = (await getSpeakerBlast(draft.id, event.id))!;

    await replaceSpeakerBlast(row, { ...row.payload, expires_at: '2000-01-01T00:00:00Z' });
    expect((await app.request(`${url}/${draft.id}/send`, { method: 'POST' })).status).toBe(409);
    const expired = (await getSpeakerBlast(draft.id, event.id))!;

    await replaceSpeakerBlast(expired, { ...expired.payload, status: 'failed', first_attempt_at: '2000-01-01T00:00:00Z' });
    expect((await app.request(`${url}/${draft.id}/send`, { method: 'POST' })).status).toBe(409);
    expect(provider).not.toHaveBeenCalled();
  });
});
