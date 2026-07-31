import { describe, expect, it, vi } from 'vitest';
import { GooglePlacesSearchError, searchGhanaVenues } from './google-places';

describe('Ghana venue search', () => {
  it('restricts Google predictions to Ghana and returns only place suggestions', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      suggestions: [
        {
          placePrediction: {
            placeId: 'ghana-place-1',
            text: { text: 'Fido, Accra, Ghana' },
            structuredFormat: {
              mainText: { text: 'Fido' },
              secondaryText: { text: 'Accra, Ghana' },
            },
          },
        },
        { queryPrediction: { text: { text: 'Fido near me' } } },
      ],
    }), { status: 200 })) as unknown as typeof fetch;

    await expect(searchGhanaVenues({ query: ' Fido ', apiKey: 'server-key', fetchImpl })).resolves.toEqual([
      {
        placeId: 'ghana-place-1',
        name: 'Fido',
        address: 'Accra, Ghana',
        label: 'Fido, Accra, Ghana',
      },
    ]);

    const [url, request] = vi.mocked(fetchImpl).mock.calls[0] ?? [];
    expect(url).toBe('https://places.googleapis.com/v1/places:autocomplete');
    expect(request?.headers).toMatchObject({ 'X-Goog-Api-Key': 'server-key' });
    expect(JSON.parse(String(request?.body))).toMatchObject({
      input: 'Fido',
      includedRegionCodes: ['gh'],
      regionCode: 'gh',
      includeQueryPredictions: false,
    });
  });

  it('does not call Google for an incomplete query', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    await expect(searchGhanaVenues({ query: 'F', apiKey: 'server-key', fetchImpl })).resolves.toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('turns an upstream rejection into a bounded provider error', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 403 })) as unknown as typeof fetch;
    await expect(searchGhanaVenues({ query: 'Fido', apiKey: 'server-key', fetchImpl }))
      .rejects.toEqual(new GooglePlacesSearchError('Google Places venue search failed.', 403));
  });
});
