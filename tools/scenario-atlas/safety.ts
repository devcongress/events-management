const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

export function assertLocalAtlasRuntime(environment: Record<string, string | undefined>): void {
  if (environment.NODE_ENV === 'production' || environment.CF_PAGES === '1' || environment.CF_WORKER === '1') {
    throw new Error('Scenario Atlas is local-only and refuses to run in a production environment.');
  }
}

export function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

export function isAllowedMutation(request: Request): boolean {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get('origin');
  return isLoopbackHostname(requestUrl.hostname) && origin === requestUrl.origin;
}
