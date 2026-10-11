import type { AdminAuthCallbackDeadline } from './admin-auth-callback-timeout';

type FetchRequest = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/**
 * Post the temporary Supabase token without aborting a successful response
 * before its JSON body is consumed by the callback flow.
 */
export async function exchangeAdminToken(
  accessToken: string,
  callbackDeadline: AdminAuthCallbackDeadline,
  fetchRequest: FetchRequest = fetch,
): Promise<Response> {
  const controller = new AbortController();

  return callbackDeadline.run(
    () => fetchRequest('/api/auth/admin/exchange', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: accessToken }),
      signal: controller.signal,
    }),
    () => controller.abort(),
  );
}
