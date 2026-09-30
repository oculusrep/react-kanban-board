/**
 * Geocoding for ORIENTATION, not for placement.
 *
 * `geocodingService` deliberately returns a single point, because its callers
 * are placing something. This module answers a different question: "how well do
 * we know where this is, and what area should I look in?" — so it keeps the two
 * things that service throws away, Google's result `types` and its `viewport`.
 *
 * An unplaced municipal_project stores only `geocoded_address` as TEXT; the
 * coordinates were discarded when the record was judged too coarse to pin. That
 * is exactly the property we want here: resolving the text at view time means
 * the coordinate lives for the life of a render and is never written, never
 * cached onto the record, and can never become the pin.
 */

/** How precisely the stored address resolves. Ordered best → worst. */
export type GeocodeGranularity =
  | 'address'       // street_address / premise — a specific building
  | 'intersection'  // two named roads crossing
  | 'road'          // a whole named route, often miles of it
  | 'zip'
  | 'city'
  | 'county';       // no better than the municipality we already knew

export interface OrientationGeocode {
  granularity: GeocodeGranularity;
  center: { lat: number; lng: number };
  /** Google's own uncertainty box for the result. */
  bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number };
  /** Radius covering that box — what gets drawn as "approximate area". */
  radiusMeters: number;
  formattedAddress: string;
}

/** Google result `types` → our granularity. First match wins, best first. */
const TYPE_RANK: [string, GeocodeGranularity][] = [
  ['street_address', 'address'],
  ['premise', 'address'],
  ['subpremise', 'address'],
  ['intersection', 'intersection'],
  ['route', 'road'],
  ['postal_code', 'zip'],
  ['neighborhood', 'city'],
  ['sublocality', 'city'],
  ['locality', 'city'],
];

/**
 * A county-level hit is worth nothing here: the municipality outline already
 * says that, and more honestly, because it's the real boundary rather than a
 * rectangle around it.
 */
function granularityFor(types: string[]): GeocodeGranularity {
  for (const [t, g] of TYPE_RANK) if (types.includes(t)) return g;
  return 'county';
}

/** Anything at or below this is worth orienting to instead of the county. */
export function isBetterThanCounty(g: GeocodeGranularity): boolean {
  return g !== 'county';
}

const EARTH_M_PER_DEG_LAT = 111_320;

/**
 * Half the diagonal of Google's viewport: a circle that covers the box it says
 * the answer lies in. Clamped so an intersection still reads as an area rather
 * than a dot, and so a sprawling route doesn't paint the whole screen.
 */
function radiusFromViewport(
  ne: { lat: number; lng: number },
  sw: { lat: number; lng: number },
  centerLat: number
): number {
  const dLat = (ne.lat - sw.lat) * EARTH_M_PER_DEG_LAT;
  const dLng =
    (ne.lng - sw.lng) * EARTH_M_PER_DEG_LAT * Math.cos((centerLat * Math.PI) / 180);
  const half = Math.sqrt(dLat * dLat + dLng * dLng) / 2;
  return Math.min(Math.max(half, 150), 6000);
}

/**
 * Session-lifetime, in memory only. The unplaced worklist badges and the
 * slideout ask about the same addresses, so this keeps that to one API call per
 * distinct address per session — and guarantees the badge in the list and the
 * circle on the map are derived from the same answer rather than two lookups
 * that could disagree. Never persisted: a cache on disk would be a written
 * coordinate by another name.
 */
const cache = new Map<string, Promise<OrientationGeocode | null>>();

export function geocodeForOrientation(
  address: string | null | undefined
): Promise<OrientationGeocode | null> {
  if (!address?.trim()) return Promise.resolve(null);
  const key = address.trim();

  const hit = cache.get(key);
  if (hit) return hit;

  const p = (async (): Promise<OrientationGeocode | null> => {
    const apiKey = import.meta.env.VITE_GOOGLE_GEOCODING_API_KEY;
    if (!apiKey) {
      console.warn('[orientation] VITE_GOOGLE_GEOCODING_API_KEY not configured');
      return null;
    }
    try {
      const res = await fetch(
        'https://maps.googleapis.com/maps/api/geocode/json?' +
          new URLSearchParams({ address: key, key: apiKey })
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.status !== 'OK' || !data.results?.[0]) {
        // ZERO_RESULTS is a fact about the address, not a failure to hide: the
        // caller falls back to the municipality outline and says so.
        console.warn('[orientation] geocode returned', data.status, 'for', key);
        return null;
      }

      const r = data.results[0];
      const loc = r.geometry?.location;
      if (typeof loc?.lat !== 'number' || typeof loc?.lng !== 'number') return null;

      const vp = r.geometry?.viewport;
      const ne = vp?.northeast ?? loc;
      const sw = vp?.southwest ?? loc;

      return {
        granularity: granularityFor(r.types ?? []),
        center: { lat: loc.lat, lng: loc.lng },
        bounds: { minLat: sw.lat, minLng: sw.lng, maxLat: ne.lat, maxLng: ne.lng },
        radiusMeters: radiusFromViewport(ne, sw, loc.lat),
        formattedAddress: r.formatted_address ?? key,
      };
    } catch (e) {
      console.warn('[orientation] geocode failed for', key, e);
      // Don't poison the cache with a transient network failure.
      cache.delete(key);
      return null;
    }
  })();

  cache.set(key, p);
  return p;
}
