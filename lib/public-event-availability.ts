export type PublicEventAvailability = {
  available: boolean;
  status: number | null;
};

type PublicEventFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

async function requestPublicEvent(url: string, method: 'HEAD' | 'GET', fetcher: PublicEventFetcher): Promise<Response> {
  return fetcher(url, {
    method,
    redirect: 'follow',
    signal: AbortSignal.timeout(5_000),
  });
}

export async function checkPublicEventAvailability(
  url: string,
  fetcher: PublicEventFetcher = fetch,
): Promise<PublicEventAvailability> {
  try {
    const head = await requestPublicEvent(url, 'HEAD', fetcher);
    if (head.status !== 405) return { available: head.ok, status: head.status };

    const get = await requestPublicEvent(url, 'GET', fetcher);
    return { available: get.ok, status: get.status };
  } catch {
    return { available: false, status: null };
  }
}
