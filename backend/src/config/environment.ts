const DEFAULT_PORT = 3001;

export function resolvePort(): number {
  const rawPort = process.env.PORT;

  if (!rawPort) {
    return DEFAULT_PORT;
  }

  const parsed = Number.parseInt(rawPort, 10);

  if (Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_PORT;
  }

  return parsed;
}

export function getGoogleMapsApiKey(): string {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    throw new Error('GOOGLE_MAPS_API_KEY environment variable is required');
  }

  return apiKey;
}
