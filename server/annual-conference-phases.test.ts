import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ANNUAL_CONFERENCE_2026_EDITION, ANNUAL_CONFERENCE_2026_PHASES, ANNUAL_CONFERENCE_2026_SEED_TASKS } from '@/lib/annual-conference-work-plan';

const mocks = vi.hoisted(() => ({
  sessionEmail: 'organizer@devcongress.org',
  sessionRole: 'organizer' as 'owner' | 'organizer',
  createPhase: vi.fn(),
  updateTask: vi.fn(),
  audit: vi.fn(),
}));

vi.mock('@/lib/supabase/admin-auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/supabase/admin-auth')>('@/lib/supabase/admin-auth');
  return {
    ...actual,
    getAdminSession: vi.fn(async () => ({
      authenticated: true as const,
      user_id: 'admin-1',
      email: mocks.sessionEmail,
      display_name: 'Organizer',
      role: mocks.sessionRole,
      session_id: 'session-1',
      expires_at: '2099-01-01T00:00:00.000Z',
    })),
    requireAdmin: vi.fn(async () => null),
    recordAdminAudit: mocks.audit,
  };
});

vi.mock('@/lib/supabase/annual-conference-work-plan', async () => {
  const actual = await vi.importActual<typeof import('@/lib/supabase/annual-conference-work-plan')>('@/lib/supabase/annual-conference-work-plan');
  return {
    ...actual,
    getSupabaseAnnualConferenceWorkPlan: vi.fn(async () => ({
      edition: ANNUAL_CONFERENCE_2026_EDITION,
      phases: ANNUAL_CONFERENCE_2026_PHASES,
      tasks: ANNUAL_CONFERENCE_2026_SEED_TASKS,
    })),
    createSupabaseAnnualConferencePhase: mocks.createPhase,
    updateSupabaseAnnualConferenceTask: mocks.updateTask,
  };
});

import app from './app';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sessionEmail = 'organizer@devcongress.org';
  mocks.sessionRole = 'organizer';
  mocks.createPhase.mockResolvedValue(ANNUAL_CONFERENCE_2026_PHASES[0]);
});

describe('annual conference phase API', () => {
  it('keeps phase management restricted to the edition planning owner', async () => {
    const response = await app.request('/api/annual-conference/2026/phases', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Phase 3', starts_on: '2026-12-20', ends_on: '2026-12-31' }),
    });

    expect(response.status).toBe(403);
    expect(mocks.createPhase).not.toHaveBeenCalled();
  });

  it('allows a platform owner to manage phases without being the edition planning owner', async () => {
    mocks.sessionRole = 'owner';
    mocks.sessionEmail = 'platform-owner@devcongress.org';
    const response = await app.request('/api/annual-conference/2026/phases', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Phase 3', starts_on: '2026-12-20', ends_on: '2026-12-31' }),
    });

    expect(response.status).toBe(201);
    expect(mocks.createPhase).toHaveBeenCalled();
  });

  it('rejects overlapping phase dates before persistence', async () => {
    mocks.sessionEmail = 'angelateyvi@gmail.com';
    const response = await app.request('/api/annual-conference/2026/phases', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Overlap', starts_on: '2026-08-15', ends_on: '2026-09-15' }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Phase dates cannot overlap another phase.' });
    expect(mocks.createPhase).not.toHaveBeenCalled();
  });

  it('prevents an organizer from moving a task target beyond its phase end', async () => {
    mocks.sessionEmail = 'angelateyvi@gmail.com';
    const task = ANNUAL_CONFERENCE_2026_SEED_TASKS[0];
    const response = await app.request(`/api/annual-conference/2026/work-plan/${task.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        phase_id: ANNUAL_CONFERENCE_2026_PHASES[0].id,
        target_date: '2026-09-01',
      }),
    });

    expect(response.status).toBe(400);
    expect(mocks.updateTask).not.toHaveBeenCalled();
  });
});
