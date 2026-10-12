import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { AppBindings } from '@/server/http/app-bindings';

const mocks = vi.hoisted(() => ({
  cardByCapability: vi.fn(),
  publicCard: vi.fn(),
  issueDelivery: vi.fn(),
  download: vi.fn(),
  collection: vi.fn(),
  collectionCard: vi.fn(),
}));

vi.mock('@/lib/supabase/annual-conference-social-cards', () => ({
  getSupabaseAnnualConferenceSocialCardByCapability: mocks.cardByCapability,
  getSupabaseAnnualConferenceSocialCardByCollectionCapability: mocks.collectionCard,
  getSupabaseAnnualConferenceSocialCardCollection: mocks.collection,
  getSupabasePublicAnnualConferenceSocialCard: mocks.publicCard,
  issueSupabaseAnnualConferenceSocialCardDelivery: mocks.issueDelivery,
  updateSupabaseAnnualConferenceSocialCard: vi.fn(),
  uploadSupabaseAnnualConferenceSocialCardPhoto: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdminClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({ download: mocks.download })),
    },
  })),
}));

vi.mock('@/lib/supabase/admin-auth', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/server/annual-conference-request', () => ({ getAnnualConferenceEditionByYear: vi.fn() }));
vi.mock('@/server/protected-mutation', () => ({ recordProtectedMutationAudit: vi.fn() }));

import { registerAnnualConferenceSocialCardRoutes } from './annual-conference-social-cards';

const managementPhotoPath = '/api/public/annual-conference/2026/social-cards/manage/photo';

function app() {
  const instance = new Hono<AppBindings>();

  registerAnnualConferenceSocialCardRoutes(instance);

  return instance;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cardByCapability.mockResolvedValue({
    id: '10000000-0000-4000-8000-000000000001',
    photo_path: '10000000-0000-4000-8000-000000000001/source.png',
  });
  mocks.download.mockResolvedValue({
    data: new Blob(['private photo'], { type: 'image/png' }),
    error: null,
  });
  mocks.collection.mockResolvedValue([{ seat_number: 1, display_name: 'Ticket 1', crop_x: 0.5, crop_y: 0.5, crop_scale: 1, public_enabled: false, public_slug: 'public-slug-1234567890123456', photo_available: false }]);
  mocks.collectionCard.mockResolvedValue({
    id: '10000000-0000-4000-8000-000000000001',
    edition_id: 'edition-id',
    role: 'attendee',
    display_name: 'Ticket 1',
    public_slug: 'public-slug-1234567890123456',
    photo_path: null,
    crop_x: 0.5,
    crop_y: 0.5,
    crop_scale: 1,
    public_enabled: false,
    revoked_at: null,
    ticket_id: 'ticket-id',
    session_id: null,
  });
});

describe('Annual Conference social-card routes', () => {
  it('proxies the managed private photo only for a valid capability', async () => {
    const response = await app().request(`http://localhost${managementPhotoPath}`, {
      headers: { 'X-Social-Card-Capability': 'valid-capability' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toBe('image/png');
    await expect(response.text()).resolves.toBe('private photo');
    expect(mocks.download).toHaveBeenCalledWith('10000000-0000-4000-8000-000000000001/source.png');
  });

  it('does not access private media when the management capability is invalid', async () => {
    mocks.cardByCapability.mockResolvedValue(null);

    const response = await app().request(`http://localhost${managementPhotoPath}`, {
      headers: { 'X-Social-Card-Capability': 'replaced-capability' },
    });

    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('returns no-store 404 for an unknown or revoked public card', async () => {
    mocks.publicCard.mockResolvedValue(null);

    const response = await app().request(`http://localhost/api/public/annual-conference/2026/social-cards/${'a'.repeat(32)}`);

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('reports a disabled Supabase runtime as unavailable instead of a missing card', async () => {
    mocks.publicCard.mockResolvedValue(undefined);

    const response = await app().request(`http://localhost/api/public/annual-conference/2026/social-cards/${'a'.repeat(32)}`);

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('returns safe card slots only through the paid-buyer collection capability', async () => {
    const response = await app().request('http://localhost/api/public/annual-conference/2026/social-cards/collection', {
      headers: { 'X-Social-Card-Collection-Capability': 'buyer-collection-capability' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      seats: [{ seat_number: 1, card: {
        display_name: 'Ticket 1',
        role: 'attendee',
        crop: { x: 0.5, y: 0.5, scale: 1 },
        public_enabled: false,
        public_slug: 'public-slug-1234567890123456',
        photo_available: false,
      } }],
    });
  });

  it('does not resolve buyer collection data without a collection capability', async () => {
    const response = await app().request('http://localhost/api/public/annual-conference/2026/social-cards/collection');

    expect(response.status).toBe(401);
    expect(mocks.collection).not.toHaveBeenCalled();
  });

  it('does not issue an outbox row while the dedicated sender is disabled', async () => {
    const response = await app().request('http://localhost/api/annual-conference/2026/social-cards/deliveries', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subject_type: 'attendee', subject_id: '10000000-0000-4000-8000-000000000001' }),
    });

    expect(response.status).toBe(503);
    expect(mocks.issueDelivery).not.toHaveBeenCalled();
  });
});
