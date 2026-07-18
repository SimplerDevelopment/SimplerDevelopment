/**
 * Geocoding helper backed by the OpenStreetMap Nominatim public service.
 *
 * Usage policy reference: https://operations.osmfoundation.org/policies/nominatim/
 * - Requires an identifying User-Agent.
 * - Should be used at modest volume; consider caching upstream.
 *
 * The function is intentionally tolerant: any failure (timeout, network,
 * unparseable response, missing result, empty input) returns `null` so callers
 * can continue without geocoded coordinates.
 */

const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'SimplerDevelopmentCRM/1.0 (+https://simplerdevelopment.com)';
const REQUEST_TIMEOUT_MS = 6000;

interface NominatimResult {
  lat?: string;
  lon?: string;
}

export async function geocodeAddress(
  address: string
): Promise<{ latitude: number; longitude: number } | null> {
  const trimmed = (address ?? '').trim();
  if (!trimmed) return null;

  const url = `${NOMINATIM_ENDPOINT}?q=${encodeURIComponent(trimmed)}&format=json&limit=1`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!res.ok) return null;

    const json = (await res.json()) as unknown;
    if (!Array.isArray(json) || json.length === 0) return null;

    const first = json[0] as NominatimResult;
    if (!first || typeof first.lat !== 'string' || typeof first.lon !== 'string') {
      return null;
    }

    const latitude = Number.parseFloat(first.lat);
    const longitude = Number.parseFloat(first.lon);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    if (latitude < -90 || latitude > 90) return null;
    if (longitude < -180 || longitude > 180) return null;

    return { latitude, longitude };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
