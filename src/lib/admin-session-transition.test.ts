import { QueryClient, QueryObserver } from '@tanstack/vue-query';
import { describe, expect, it } from 'vitest';
import {
  beginAdminSessionTransition,
  refreshAdminSessionAfterTransition,
} from './admin-session-transition';
import { queryKeys, type AdminSessionResponse } from './api';

const authenticatedSession: AdminSessionResponse = {
  authenticated: true,
  auth_mode: 'supabase',
  auth_configured: true,
  user: {
    email: 'organizer@example.com',
    display_name: 'Organizer',
    role: 'organizer',
  },
};

describe('admin session transitions', () => {
  it('keeps the mounted shell observer aligned with router reads after OAuth exchange', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const observer = new QueryObserver(queryClient, {
      queryKey: queryKeys.adminSession,
      queryFn: async () => authenticatedSession,
      enabled: false,
    });
    const seen: Array<AdminSessionResponse | undefined> = [];
    const unsubscribe = observer.subscribe((result) => seen.push(result.data));

    queryClient.setQueryData<AdminSessionResponse>(queryKeys.adminSession, {
      authenticated: false,
      auth_mode: 'supabase',
      auth_configured: true,
    });
    queryClient.setQueryData(['events'], [{ id: 'prior-user-event' }]);

    const session = await refreshAdminSessionAfterTransition(
      queryClient,
      async () => authenticatedSession,
    );

    expect(session).toEqual(authenticatedSession);
    expect(observer.getCurrentResult().data).toEqual(authenticatedSession);
    expect(queryClient.getQueryData(queryKeys.adminSession)).toEqual(
      authenticatedSession,
    );
    expect(queryClient.getQueryData(['events'])).toBeUndefined();
    expect(seen.at(-1)).toEqual(authenticatedSession);

    unsubscribe();
  });

  it('publishes an unauthenticated session for access-request outcomes', async () => {
    const queryClient = new QueryClient();

    queryClient.setQueryData(queryKeys.adminSession, authenticatedSession);
    queryClient.setQueryData(['events'], [{ id: 'prior-user-event' }]);

    await beginAdminSessionTransition(queryClient);

    expect(queryClient.getQueryData<AdminSessionResponse>(queryKeys.adminSession))
      .toMatchObject({ authenticated: false });
    expect(queryClient.getQueryData(['events'])).toBeUndefined();
  });
});
