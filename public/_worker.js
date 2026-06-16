const WORKER_API_ORIGIN = 'https://devcongress-comm-api.elvis-yt211.workers.dev';

async function proxyApiRequest(request) {
  const incomingUrl = new URL(request.url);
  const targetUrl = new URL(incomingUrl.pathname, WORKER_API_ORIGIN);
  targetUrl.search = incomingUrl.search;

  const headers = new Headers(request.headers);
  headers.delete('host');

  return fetch(new Request(targetUrl, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'manual',
  }));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      return proxyApiRequest(request);
    }

    return env.ASSETS.fetch(request);
  },
};
