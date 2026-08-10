import { afterEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());

vi.mock('./server', () => ({
  isSupabaseServerConfigured: () => true,
  getSupabaseAdminClient: () => ({ rpc }),
}));

import { ensureActiveShortLink, regenerateActiveShortLink } from './short-links';

const sessionMembershipId = '11111111-1111-4111-8111-111111111111';
const eventId = '22222222-2222-4222-8222-222222222222';
const linkId = '33333333-3333-4333-8333-333333333333';

afterEach(() => rpc.mockReset());

describe('canonical short-link storage', () => {
  it('retries a generated code collision and returns the database-owned canonical link', async () => {
    rpc
      .mockResolvedValueOnce({ data: null, error: { code: '23505' } })
      .mockResolvedValueOnce({
        data: [{
          id: linkId,
          code: '8B8TH',
          destination: 'event_registration',
          event_id: eventId,
          conference_edition_id: null,
          status: 'active',
          created_by_membership_id: sessionMembershipId,
          redirect_count: 0,
          last_redirected_at: null,
          created_at: '2026-08-10T00:00:00.000Z',
          updated_at: '2026-08-10T00:00:00.000Z',
        }],
        error: null,
      });

    await expect(ensureActiveShortLink({
      destination: 'event_registration',
      eventId,
      createdByMembershipId: sessionMembershipId,
    })).resolves.toMatchObject({
      created: false,
      link: { id: linkId, code: '8B8TH', destination: 'event_registration' },
    });

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(1, 'ensure_active_short_link', expect.objectContaining({
      input_destination: 'event_registration',
      input_event_id: eventId,
      input_conference_edition_id: null,
      input_created_by_membership_id: sessionMembershipId,
      input_code: expect.stringMatching(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}$/),
    }));
  });

  it('uses the transactional regeneration RPC instead of attempting an application-side replacement', async () => {
    rpc.mockResolvedValueOnce({
      data: [{
        id: linkId,
        code: '6Q972',
        destination: 'event_registration',
        event_id: eventId,
        conference_edition_id: null,
        status: 'active',
        created_by_membership_id: sessionMembershipId,
        redirect_count: 0,
        last_redirected_at: null,
        created_at: '2026-08-10T00:00:00.000Z',
        updated_at: '2026-08-10T00:00:00.000Z',
      }],
      error: null,
    });

    await expect(regenerateActiveShortLink({ linkId, createdByMembershipId: sessionMembershipId })).resolves.toMatchObject({
      id: linkId,
      code: '6Q972',
    });
    expect(rpc).toHaveBeenCalledWith('regenerate_active_short_link', expect.objectContaining({
      input_link_id: linkId,
      input_created_by_membership_id: sessionMembershipId,
      input_code: expect.stringMatching(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}$/),
    }));
  });
});
