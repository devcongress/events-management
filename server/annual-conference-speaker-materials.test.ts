import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { AppBindings } from '@/server/http/app-bindings';
import { registerAnnualConferenceSpeakerMaterialRoutes, validateSpeakerMaterial } from './routes/annual-conference-speaker-materials';

const state = vi.hoisted(() => ({ revoked: false, expired: false, token: 'valid', capabilityDenied: false, submissionEdition: 'edition', queries: 0 }));

vi.mock('@/lib/annual-conference-speakers', () => ({
  getAnnualConferenceSpeakerIntakeLink: async (_edition: string, token: string) => token === state.token ? { id: 'link', speaker_submission_id: 'submission', workspace_session_id: 'session', revoked_at: state.revoked ? 'now' : null, expires_at: state.expired ? '2020-01-01' : '2100-01-01' } : null,
  getAnnualConferenceSpeakerSubmission: async () => ({ id: 'submission', edition_id: state.submissionEdition, status: 'selected', selected_intake_link_id: 'link', selected_session_id: 'session' }),
  getAnnualConferenceSession: async () => ({ id: 'session', edition_id: 'edition', speaker_submission_id: 'submission', status: 'confirmed' }),
}));
vi.mock('@/server/annual-conference-request', () => ({
  getAnnualConferenceEditionByYear: async () => ({ id: 'edition', speaker_logistics_deadline: null }),
  requireAnnualConferenceCapability: async () => state.capabilityDenied ? new Response('Forbidden', { status: 403 }) : null,
}));
vi.mock('@/lib/supabase/admin-auth', () => ({ requireAdmin: async () => null }));
vi.mock('@/server/http/public-intake-protection', () => ({ enforcePublicRateLimit: async () => null, publicClientKey: () => 'client' }));
vi.mock('@/lib/supabase/server', () => ({
  isSupabaseServerConfigured: () => true,
  getSupabaseAdminClient: () => ({
    from: () => {
      state.queries++;

      return { select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) };
    },
  }),
}));

const app = new Hono<AppBindings>();

registerAnnualConferenceSpeakerMaterialRoutes(app);

beforeEach(() => {
  state.revoked = false;
  state.expired = false;
  state.capabilityDenied = false;
  state.submissionEdition = 'edition';
  state.queries = 0;
});

function minimalPresentationZip(): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let position = 0;

  for (const name of ['[Content_Types].xml', 'ppt/presentation.xml']) {
    const encoded = encoder.encode(name);
    const local = new Uint8Array(31 + encoded.length);
    const localView = new DataView(local.buffer);

    localView.setUint32(0, 0x04034b50, true);
    localView.setUint32(18, 1, true);
    localView.setUint32(22, 1, true);
    localView.setUint16(26, encoded.length, true);
    local.set(encoded, 30);
    local[local.length - 1] = 1;
    const central = new Uint8Array(46 + encoded.length);
    const centralView = new DataView(central.buffer);

    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint32(20, 1, true);
    centralView.setUint32(24, 1, true);
    centralView.setUint16(28, encoded.length, true);
    centralView.setUint32(42, position, true);
    central.set(encoded, 46);
    parts.push(local);
    directory.push(central);
    position += local.length;
  }
  const directorySize = directory.reduce((sum, entry) => sum + entry.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);

  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, 2, true);
  endView.setUint16(10, 2, true);
  endView.setUint32(12, directorySize, true);
  endView.setUint32(16, position, true);
  const result = new Uint8Array(position + directorySize + end.length);
  let offset = 0;

  for (const part of [...parts, ...directory, end]) {
    result.set(part, offset);
    offset += part.length;
  }

  return result;
}

describe('speaker material validation', () => {
  it('accepts a PDF signature and rejects mismatched, empty, and fake PPTX files', async () => {
    expect(await validateSpeakerMaterial(new File(['%PDF-1.7'], 'talk.pdf', { type: 'application/pdf' }))).toBe('application/pdf');
    expect(await validateSpeakerMaterial(new File([minimalPresentationZip()], 'talk.pptx'))).toBe('application/vnd.openxmlformats-officedocument.presentationml.presentation');
    expect(await validateSpeakerMaterial(new File([minimalPresentationZip().slice(0, -1)], 'talk.pptx'))).toBeNull();
    expect(await validateSpeakerMaterial(new File([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])], 'talk.ppt'))).toBe('application/vnd.ms-powerpoint');
    expect(await validateSpeakerMaterial(new File(['not a PDF'], 'talk.pdf', { type: 'application/pdf' }))).toBeNull();
    expect(await validateSpeakerMaterial(new File([], 'talk.ppt'))).toBeNull();
    expect(await validateSpeakerMaterial(new File(['PK\x03\x04[Content_Types].xml ppt/presentation.xml'], 'talk.pptx'))).toBeNull();
    expect(await validateSpeakerMaterial(new File(['%PDF-1.7'], 'talk.pdf', { type: 'image/png' }))).toBeNull();
  });
});

describe('private speaker materials routes', () => {
  it('checks the active token and allows access after the due date', async () => {
    for (const condition of ['invalid', 'revoked'] as const) {
      state.revoked = condition === 'revoked';
      const response = await app.request(`/api/conference-speaker-materials/2026/${condition === 'invalid' ? 'bad' : 'valid'}`);

      expect(response.status).toBe(410);
      expect(state.queries).toBe(0);
    }
    state.revoked = false;
    state.expired = true;
    const response = await app.request('/api/conference-speaker-materials/2026/valid');

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(state.queries).toBe(1);
  });

  it('denies organizer downloads before storage access without the capability or matching edition', async () => {
    const path = '/api/annual-conference/2026/speaker-submissions/submission/materials/material';

    state.capabilityDenied = true;
    expect((await app.request(path)).status).toBe(403);
    state.capabilityDenied = false;
    state.submissionEdition = 'other';
    expect((await app.request(path)).status).toBe(404);
    expect(state.queries).toBe(0);
  });
});
