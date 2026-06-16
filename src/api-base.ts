const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, '');
const forceSplitApiOrigin = import.meta.env.VITE_FORCE_API_BASE_URL === 'true';

if (configuredApiBaseUrl && forceSplitApiOrigin) {
  const nativeFetch = window.fetch.bind(window);
  const withApiCredentials = (init?: RequestInit): RequestInit => ({
    ...init,
    credentials: init?.credentials ?? 'include',
  });

  const apiFetch: typeof window.fetch = ((input, init) => {
    if (typeof input === 'string' && input.startsWith('/api/')) {
      return nativeFetch(`${configuredApiBaseUrl}${input}`, withApiCredentials(init));
    }

    if (input instanceof Request) {
      const url = new URL(input.url);

      if (url.origin === window.location.origin && url.pathname.startsWith('/api/')) {
        return nativeFetch(
          new Request(`${configuredApiBaseUrl}${url.pathname}${url.search}`, input),
          withApiCredentials(init),
        );
      }
    }

    return nativeFetch(input, init);
  }) as typeof window.fetch;

  if ('preconnect' in window.fetch) {
    apiFetch.preconnect = window.fetch.preconnect;
  }

  window.fetch = apiFetch;
}
