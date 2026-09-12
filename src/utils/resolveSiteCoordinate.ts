/**
 * Site coordinate resolution — the documented OVIS precedence, in one place.
 *
 *   site_submit.verified -> property.verified -> site_submit.sf_property -> property.lat
 *
 * A verified coordinate always beats an unverified one, regardless of which
 * table it lives on. A tier only counts when BOTH lat and lng are present, so a
 * half-populated tier falls through instead of pairing one tier's latitude with
 * the next tier's longitude.
 *
 * There is deliberately NO address-string fallback. Mailing address and
 * governing jurisdiction diverge — Johnson Ferry/Shallowford is a Marietta
 * mailing address in unincorporated Cobb, with a Roswell-ZIP Publix across the
 * intersection — so geocoding a mailing address can quietly place an analysis in
 * the wrong jurisdiction.
 *
 * NOTE: ovis-site-research/index.ts carries its own copy of this precedence.
 * Deno edge functions can't import from src/, so the duplication is deliberate.
 * The edge function's copy is authoritative — this one only drives the UI gate.
 * If you change the order here, change it there too.
 */

export type CoordinateSource =
  | 'site_submit.verified'
  | 'property.verified'
  | 'site_submit.sf_property'
  | 'property.latitude';

export interface ResolvedCoordinate {
  latitude: number;
  longitude: number;
  source: CoordinateSource;
}

/** Shape-tolerant inputs: callers pass whatever slice of the record they hold. */
export interface CoordinateSiteSubmit {
  verified_latitude?: number | null;
  verified_longitude?: number | null;
  sf_property_latitude?: number | null;
  sf_property_longitude?: number | null;
}

export interface CoordinateProperty {
  verified_latitude?: number | null;
  verified_longitude?: number | null;
  latitude?: number | null;
  longitude?: number | null;
}

function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function resolveSiteCoordinate(
  siteSubmit: CoordinateSiteSubmit | null | undefined,
  property: CoordinateProperty | null | undefined,
): ResolvedCoordinate | null {
  const tiers: Array<[CoordinateSource, unknown, unknown]> = [
    ['site_submit.verified', siteSubmit?.verified_latitude, siteSubmit?.verified_longitude],
    ['property.verified', property?.verified_latitude, property?.verified_longitude],
    ['site_submit.sf_property', siteSubmit?.sf_property_latitude, siteSubmit?.sf_property_longitude],
    ['property.latitude', property?.latitude, property?.longitude],
  ];

  for (const [source, rawLat, rawLng] of tiers) {
    const latitude = num(rawLat);
    const longitude = num(rawLng);
    if (latitude !== null && longitude !== null) return { latitude, longitude, source };
  }
  return null;
}
