import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  enabled: vi.fn(() => true),
}));

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdminClient: () => ({ from: mocks.from }),
  isSupabaseRuntimeEnabled: mocks.enabled,
}));

import {
  getSupabaseAnnualConferenceSocialCardByCapability,
  getSupabasePublicAnnualConferenceSocialCard,
} from './annual-conference-social-cards';

const cardRow = {
  id: 'card-1', edition_id: 'edition-1', subject_type: 'attendee', ticket_id: 'ticket-1', session_id: null,
  display_name: 'Ama Mensah', public_slug: 'a'.repeat(32), photo_path: null, crop_x: 0.5, crop_y: 0.5,
  crop_scale: 1, public_enabled: true, revoked_at: null,
};

function cardQuery(data: Record<string, unknown> | null) {
  const query = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), maybeSingle: vi.fn(async () => ({ data, error: null })) };

  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);

  return query;
}

function eligibilityQuery(data: unknown) {
  const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), maybeSingle: vi.fn(async () => ({ data, error: null })) };

  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);

  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled.mockReturnValue(true);
});

describe('Supabase social-card eligibility rechecks', () => {
  it('denies a capability when its attendee ticket has been cancelled', async () => {
    const card = cardQuery(cardRow);
    const ticket = eligibilityQuery(null);

    mocks.from.mockReturnValueOnce(card).mockReturnValueOnce(ticket);

    await expect(getSupabaseAnnualConferenceSocialCardByCapability('capability')).resolves.toBeNull();
    expect(ticket.in).toHaveBeenCalledWith('status', ['issued', 'checked_in']);
  });

  it('denies a public speaker card when its session is archived', async () => {
    const card = cardQuery({ ...cardRow, subject_type: 'speaker', ticket_id: null, session_id: 'session-1' });
    const session = eligibilityQuery(null);

    mocks.from.mockReturnValueOnce(card).mockReturnValueOnce(session);

    await expect(getSupabasePublicAnnualConferenceSocialCard('a'.repeat(32))).resolves.toBeNull();
    expect(session.eq).toHaveBeenCalledWith('status', 'confirmed');
  });

  it('denies a managed speaker card after proposal selection is removed', async () => {
    const card = cardQuery({ ...cardRow, subject_type: 'speaker', ticket_id: null, session_id: 'session-1' });
    const session = eligibilityQuery(null);

    mocks.from.mockReturnValueOnce(card).mockReturnValueOnce(session);

    await expect(getSupabaseAnnualConferenceSocialCardByCapability('capability')).resolves.toBeNull();
    expect(session.eq).toHaveBeenCalledWith('annual_conference_speaker_submissions.status', 'selected');
  });
});
