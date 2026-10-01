import type { QueryClient } from '@tanstack/vue-query';
import {
  fetchAdminSession,
  queryKeys,
  type AdminSessionResponse,
} from './api';

function anonymousSession(
  previous?: AdminSessionResponse,
): AdminSessionResponse {
  return {
    authenticated: false,
    auth_mode: previous?.auth_mode ?? 'supabase',
    auth_configured: previous?.auth_configured ?? true,
  };
}

/**
 * Start an auth identity transition without replacing the session query that
 * mounted shell observers already subscribe to. Removing that query makes an
 * existing App observer stale while router guards create a new cache entry.
 */
export async function beginAdminSessionTransition(queryClient: QueryClient) {
  await queryClient.cancelQueries();

  const previous = queryClient.getQueryData<AdminSessionResponse>(
    queryKeys.adminSession,
  );

  queryClient.removeQueries({
    predicate: (query) => query.queryKey[0] !== queryKeys.adminSession[0],
  });
  queryClient.setQueryData<AdminSessionResponse>(
    queryKeys.adminSession,
    anonymousSession(previous),
  );
}

/** Refresh the existing session query after an authenticated exchange. */
export async function refreshAdminSessionAfterTransition(
  queryClient: QueryClient,
  fetchSession = fetchAdminSession,
) {
  await beginAdminSessionTransition(queryClient);

  return queryClient.fetchQuery({
    queryKey: queryKeys.adminSession,
    queryFn: fetchSession,
    staleTime: 0,
  });
}
