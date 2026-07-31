const GOOGLE_PLACES_AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete';

export interface GhanaVenueSuggestion {
  placeId: string;
  name: string;
  address: string;
  label: string;
}

interface GooglePlacePrediction {
  placeId?: unknown;
  text?: { text?: unknown };
  structuredFormat?: {
    mainText?: { text?: unknown };
    secondaryText?: { text?: unknown };
  };
}

interface GooglePlacesAutocompleteResponse {
  suggestions?: Array<{ placePrediction?: GooglePlacePrediction }>;
}

export class GooglePlacesSearchError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'GooglePlacesSearchError';
  }
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export async function searchGhanaVenues(input: {
  query: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}): Promise<GhanaVenueSuggestion[]> {
  const query = input.query.trim();
  const apiKey = input.apiKey.trim();
  if (query.length < 2 || query.length > 120 || !apiKey) return [];

  const response = await (input.fetchImpl ?? fetch)(GOOGLE_PLACES_AUTOCOMPLETE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': [
        'suggestions.placePrediction.placeId',
        'suggestions.placePrediction.text.text',
        'suggestions.placePrediction.structuredFormat.mainText.text',
        'suggestions.placePrediction.structuredFormat.secondaryText.text',
      ].join(','),
    },
    body: JSON.stringify({
      input: query,
      includedRegionCodes: ['gh'],
      regionCode: 'gh',
      languageCode: 'en',
      includeQueryPredictions: false,
      includePureServiceAreaBusinesses: false,
    }),
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) {
    throw new GooglePlacesSearchError('Google Places venue search failed.', response.status);
  }

  const payload = await response.json() as GooglePlacesAutocompleteResponse;
  return (payload.suggestions ?? []).flatMap((suggestion) => {
    const prediction = suggestion.placePrediction;
    const placeId = textValue(prediction?.placeId);
    const label = textValue(prediction?.text?.text);
    const name = textValue(prediction?.structuredFormat?.mainText?.text) || label;
    const address = textValue(prediction?.structuredFormat?.secondaryText?.text);
    return placeId && label && name ? [{ placeId, name, address, label }] : [];
  }).slice(0, 8);
}
