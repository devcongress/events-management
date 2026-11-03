import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { AppBindings } from '@/server/http/app-bindings';

const state = vi.hoisted(() => ({
  revoked: false,
  archived: false,
  material: null as null | { id: string; session_id: string; edition_id: string; storage_path: string },
  storageFails: false,
  dbFails: false,
  operations: [] as string[],
}));

vi.mock('@/lib/annual-conference-speakers', () => ({
  getAnnualConferenceSpeakerIntakeLink: async (_edition: string, token: string) => token === 'valid' ? { id: 'link', speaker_submission_id: 'submission', workspace_session_id: 'session', revoked_at: state.revoked ? 'now' : null } : null,
  getAnnualConferenceSpeakerSubmission: async () => ({ id: 'submission', edition_id: 'edition', status: 'selected', selected_intake_link_id: 'link', selected_session_id: 'session' }),
  getAnnualConferenceSession: async () => ({ id: 'session', edition_id: 'edition', speaker_submission_id: 'submission', status: state.archived ? 'archived' : 'confirmed' }),
}));
vi.mock('@/server/annual-conference-request', () => ({
  getAnnualConferenceEditionByYear: async () => ({ id: 'edition' }),
  requireAnnualConferenceCapability: async () => null,
}));
vi.mock('@/lib/supabase/admin-auth', () => ({ requireAdmin: async () => null }));
vi.mock('@/server/http/public-intake-protection', () => ({ enforcePublicRateLimit: async () => null, publicClientKey: () => 'client' }));
vi.mock('@/lib/supabase/server', () => ({
  isSupabaseServerConfigured: () => true,
  getSupabaseAdminClient: () => ({
    from: () => {
      let deletion = false;
      const filters: Array<[string, string]> = [];
      const query = {
        select: () => query,
        delete: () => { deletion = true;

 return query; },
        eq: (field: string, value: string) => { filters.push([field, value]);

 return query; },
        maybeSingle: async () => ({
          data: state.material && filters.every(([field, value]) => state.material?.[field as keyof typeof state.material] === value) ? state.material : null,
          error: null,
        }),
        then: (resolve: (value: { error: unknown }) => void) => {
          if (deletion) {
            state.operations.push('delete');
            if (!state.dbFails && state.material && filters.every(([field, value]) => state.material?.[field as keyof typeof state.material] === value)) state.material = null;
          }
          resolve({ error: state.dbFails ? new Error('db failure') : null });
        },
      };

      return query;
    },
    storage: { from: () => ({ remove: async (paths: string[]) => {
      state.operations.push(`storage:${paths.join(',')}`);

      return { error: state.storageFails ? new Error('storage failure') : null };
    } }) },
  }),
}));

import { registerAnnualConferenceSpeakerMaterialRoutes } from './routes/annual-conference-speaker-materials';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const app = new Hono<AppBindings>();
const path = `/api/conference-speaker-materials/2026/valid/${id}`;

registerAnnualConferenceSpeakerMaterialRoutes(app);

beforeEach(() => {
  state.revoked = false;
  state.archived = false;
  state.storageFails = false;
  state.dbFails = false;
  state.operations = [];
  state.material = { id, edition_id: 'edition', session_id: 'session', storage_path: 'edition/session/object' };
});

describe('speaker material removal', () => {
  it('removes the scoped object before releasing the quota row', async () => {
    const result = await app.request(path, { method: 'DELETE' });

    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ ok: true });
    expect(state.operations).toEqual(['storage:edition/session/object', 'delete']);
    expect(state.material).toBeNull();
  });

  it('refuses invalid, revoked and archived links before storage access', async () => {
    expect((await app.request(path.replace('/valid/', '/invalid/'), { method: 'DELETE' })).status).toBe(410);
    state.revoked = true;
    expect((await app.request(path, { method: 'DELETE' })).status).toBe(410);
    state.revoked = false;
    state.archived = true;
    expect((await app.request(path, { method: 'DELETE' })).status).toBe(410);
    expect(state.operations).toEqual([]);
  });

  it('does not touch another session or edition', async () => {
    if (state.material) state.material.session_id = 'other';
    expect((await app.request(path, { method: 'DELETE' })).status).toBe(200);
    if (state.material) { state.material.session_id = 'session'; state.material.edition_id = 'other'; }
    expect((await app.request(path, { method: 'DELETE' })).status).toBe(200);
    expect(state.operations).toEqual([]);
  });

  it('returns the same success after deletion or for an unknown identifier', async () => {
    expect((await app.request(path, { method: 'DELETE' })).status).toBe(200);
    state.operations = [];
    const result = await app.request(path, { method: 'DELETE' });

    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ ok: true });
    expect(state.operations).toEqual([]);
  });

  it('keeps quota occupied when storage removal fails and supports retry', async () => {
    state.storageFails = true;
    expect((await app.request(path, { method: 'DELETE' })).status).toBe(503);
    expect(state.material).not.toBeNull();
    expect(state.operations).toEqual(['storage:edition/session/object']);
    state.storageFails = false;
    expect((await app.request(path, { method: 'DELETE' })).status).toBe(200);
    expect(state.material).toBeNull();
  });

  it('retains the row for retry if database deletion fails', async () => {
    state.dbFails = true;
    expect((await app.request(path, { method: 'DELETE' })).status).toBe(503);
    expect(state.material).not.toBeNull();
    state.dbFails = false;
    expect((await app.request(path, { method: 'DELETE' })).status).toBe(200);
    expect(state.material).toBeNull();
  });
});
