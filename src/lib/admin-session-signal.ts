export const ADMIN_SESSION_REQUIRED_EVENT = 'admin-session-required';

export interface AdminSessionRequiredDetail {
  sessionInstanceId: string | null;
}

let currentSessionInstanceId: string | null = null;

export function setCurrentAdminSessionInstanceId(id: string | null): void {
  currentSessionInstanceId = id;
}

/** Preserve the response body for callers while recognizing the protected-session signal. */
export async function protectedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const sessionInstanceId = currentSessionInstanceId;
  const response = await fetch(input, init);

  if (response.status === 401) {
    const body = await response.clone().json().catch(() => null) as { code?: unknown } | null;

    if (body?.code === 'ADMIN_SESSION_REQUIRED') {
      window.dispatchEvent(new CustomEvent<AdminSessionRequiredDetail>(ADMIN_SESSION_REQUIRED_EVENT, {
        detail: { sessionInstanceId },
      }));
    }
  }

  return response;
}
