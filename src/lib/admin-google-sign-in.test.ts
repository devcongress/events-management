import { afterEach, describe, expect, it, vi } from 'vitest';

const signInWithOAuth = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase/browser', () => ({
  getSupabaseBrowserClient: () => ({ auth: { signInWithOAuth } }),
}));

import { startAdminGoogleSignIn } from './admin-google-sign-in';

describe('organizer Google sign-in', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    signInWithOAuth.mockReset();
  });

  it('keeps fresh sign-in account selection and a safe callback target', async () => {
    vi.stubGlobal('window', {
      location: { origin: 'https://events.example', hostname: 'events.example' },
      sessionStorage: { setItem: vi.fn() },
    });
    signInWithOAuth.mockResolvedValue({ error: null });

    await startAdminGoogleSignIn({ redirectTo: '//evil.example' });

    expect(signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({
        redirectTo: expect.stringContaining('next=%2Forganizer-console%2Fevents'),
        queryParams: { prompt: 'select_account' },
      }),
    }));
  });

  it('lets a denied organizer explicitly choose another account', async () => {
    vi.stubGlobal('window', {
      location: { origin: 'https://events.example', hostname: 'events.example' },
      sessionStorage: { setItem: vi.fn() },
    });
    signInWithOAuth.mockResolvedValue({ error: null });

    await startAdminGoogleSignIn({ redirectTo: '/organizer-console/events', recovery: true, chooseAccount: true, loginHint: 'old@example.com' });

    expect(signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({ queryParams: { prompt: 'select_account' } }),
    }));
  });

  it('does not put the recovery target in the OAuth redirect', async () => {
    vi.stubGlobal('window', {
      location: { origin: 'https://events.example', hostname: 'events.example' },
      sessionStorage: { setItem: vi.fn() },
    });
    signInWithOAuth.mockResolvedValue({ error: null });

    await startAdminGoogleSignIn({
      redirectTo: '/organizer-console/annual-conference/2026/volunteers?volunteerView=reviews',
      recovery: true,
      loginHint: 'organizer@example.com',
    });

    expect(signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({
        redirectTo: 'https://events.example/api/auth/admin/callback',
        queryParams: { login_hint: 'organizer@example.com' },
      }),
    }));
  });
});
