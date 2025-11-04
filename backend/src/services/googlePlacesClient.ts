import { URLSearchParams } from 'node:url';
import { getGoogleMapsApiKey } from '../config/environment.js';

const GOOGLE_PLACES_AUTOCOMPLETE_URL = 'https://maps.googleapis.com/maps/api/place/autocomplete/json';
const GOOGLE_PLACE_DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';

export interface GoogleAutocompletePrediction {
  description: string;
  place_id: string;
  types: string[];
  structured_formatting?: {
    main_text: string;
    secondary_text?: string;
  };
}

export interface GoogleAutocompleteResponse {
  predictions: GoogleAutocompletePrediction[];
  status: string;
  error_message?: string;
}

export interface GooglePlaceDetailsResponse {
  result?: {
    place_id: string;
    formatted_address?: string;
    geometry?: {
      location?: {
        lat: number;
        lng: number;
      };
      viewport?: {
        northeast: { lat: number; lng: number };
        southwest: { lat: number; lng: number };
      };
    };
  };
  status: string;
  error_message?: string;
}

export async function fetchPlaceAutocomplete(params: {
  input: string;
  sessionToken?: string;
  types?: string[];
  locationBias?: string;
}): Promise<GoogleAutocompletePrediction[]> {
  const apiKey = getGoogleMapsApiKey();
  const searchParams = new URLSearchParams({
    input: params.input,
    key: apiKey,
    language: 'en',
    autocomplete: 'false'
  });

  if (params.sessionToken) {
    searchParams.set('sessiontoken', params.sessionToken);
  }

  if (params.types && params.types.length > 0) {
    for (const type of params.types) {
      searchParams.append('types', type);
    }
  } else {
    searchParams.append('types', 'address');
    searchParams.append('types', 'geocode');
  }

  if (params.locationBias) {
    searchParams.set('locationbias', params.locationBias);
  }

  const response = await fetch(`${GOOGLE_PLACES_AUTOCOMPLETE_URL}?${searchParams.toString()}`);
  const data = (await response.json()) as GoogleAutocompleteResponse;

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(data.error_message ?? `Google Places Autocomplete error (${data.status})`);
  }

  return data.predictions;
}

export async function fetchPlaceDetails(params: {
  placeId: string;
  sessionToken?: string;
}): Promise<GooglePlaceDetailsResponse['result']> {
  const apiKey = getGoogleMapsApiKey();
  const searchParams = new URLSearchParams({
    key: apiKey,
    place_id: params.placeId,
    fields: 'place_id,formatted_address,geometry',
    language: 'en'
  });

  if (params.sessionToken) {
    searchParams.set('sessiontoken', params.sessionToken);
  }

  const response = await fetch(`${GOOGLE_PLACE_DETAILS_URL}?${searchParams.toString()}`);
  const data = (await response.json()) as GooglePlaceDetailsResponse;

  if (data.status !== 'OK') {
    throw new Error(data.error_message ?? `Google Place Details error (${data.status})`);
  }

  return data.result;
}
