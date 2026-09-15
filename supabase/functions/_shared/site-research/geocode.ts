/**
 * US Census Geocoder (free, no key) for addresses the model finds by search.
 *
 * API: https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html
 *   GET /geocoder/locations/onelineaddress?address=...&benchmark=Public_AR_Current&format=json
 *   result.addressMatches[] = { coordinates: { x: lng, y: lat }, matchedAddress, tigerLine, addressComponents }
 *
 * Verified by live calls 2026-09-15, which shaped three rules here:
 *  - The JSON carries NO match-quality field or score. Quality is derived: how many
 *    candidates matched, and whether the matched house number equals the one asked for.
 *  - It matches STREET ADDRESSES only. "Wellstar Kennestone Hospital, Marietta GA" returns
 *    zero matches, so place names must be resolved to a street address first (by search).
 *  - Coordinates are interpolated along the TIGER street segment, not rooftop points:
 *    4616 Roswell Rd came back ~0.1 mi from NCES's own geocode of the same school. Fine
 *    for one-decimal distances, not for "which side of the street".
 * US, Puerto Rico and Island Areas only.
 */

import { haversineMiles, ringFor, round1 } from './geo.ts';

const CENSUS_URL = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
const BENCHMARK = 'Public_AR_Current';
const TIMEOUT_MS = 15_000;

export type MatchQuality =
  | 'exact'                 // one candidate, house number matches the input
  | 'street_number_differs' // one candidate, but Census matched a different house number
  | 'no_street_number'      // one candidate for an input with no house number (street-level at best)
  | 'ambiguous';            // several candidates; no single location

export interface GeocodeMatch {
  latitude: number;
  longitude: number;
  matched_address: string;
  match_quality: MatchQuality;
  candidates: number;
}

interface CensusMatch {
  coordinates?: { x?: number; y?: number };
  matchedAddress?: string;
}

const houseNumber = (s: string): string | null => {
  const m = s.trim().match(/^(\d+[A-Za-z]?)\b/);
  return m ? m[1].toUpperCase() : null;
};

/** Pure: classify a Census response. Exported for tests. */
export function interpretCensus(input: string, body: unknown): GeocodeMatch | null {
  const matches = ((body as { result?: { addressMatches?: CensusMatch[] } })?.result?.addressMatches ?? [])
    .filter((m) => Number.isFinite(m.coordinates?.x) && Number.isFinite(m.coordinates?.y) && typeof m.matchedAddress === 'string');
  if (matches.length === 0) return null;

  const first = matches[0];
  const wanted = houseNumber(input);
  const got = houseNumber(first.matchedAddress!);
  const quality: MatchQuality =
    matches.length > 1 ? 'ambiguous'
      : wanted === null ? 'no_street_number'
      : got === wanted ? 'exact'
      : 'street_number_differs';

  return {
    latitude: first.coordinates!.y!,
    longitude: first.coordinates!.x!,
    matched_address: first.matchedAddress!,
    match_quality: quality,
    candidates: matches.length,
  };
}

export async function censusGeocode(address: string): Promise<GeocodeMatch | null> {
  const a = (address ?? '').trim();
  if (a.length < 5 || a.length > 300) return null;
  const url = `${CENSUS_URL}?${new URLSearchParams({ address: a, benchmark: BENCHMARK, format: 'json' })}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Census geocoder HTTP ${res.status}`);
  return interpretCensus(a, await res.json());
}

/**
 * The geocode_address tool result. Distance is computed HERE from the thread's frozen
 * site coordinate, never by the model, and ONLY for an exact match: one candidate at the
 * same house number. Anything else (no match, several candidates, a different house
 * number, no house number) returns distance_miles null, and the model must say the
 * distance could not be determined rather than estimate it.
 */
export async function geocodeAddressTool(
  address: string,
  site: { latitude: number; longitude: number } | null,
): Promise<Record<string, unknown>> {
  const match = await censusGeocode(address);
  if (!match) {
    return {
      input_address: address,
      match: null,
      distance_miles: null,
      ring: null,
      note: 'The Census geocoder could not match this address. State that the distance could not be determined; do not estimate it. If you passed a place name, find its street address first.',
    };
  }
  const d = distanceIfExact(match, site);
  return {
    input_address: address,
    match,
    distance_miles: d === null ? null : round1(d),
    ring: ringFor(d),
    note: d !== null
      ? 'Straight-line miles from the site, one decimal. Census coordinates are interpolated along the street segment (typically within ~0.1 mi): good for distance, not for side of street.'
      : NOT_EXACT_NOTE[match.match_quality] ?? 'No distance: the site coordinate is unavailable. State that the distance could not be determined.',
  };
}

const NOT_EXACT_NOTE: Partial<Record<MatchQuality, string>> = {
  ambiguous: 'The geocoder found several candidate locations, so there is no single location and no distance. State that the distance could not be determined.',
  street_number_differs: 'Census matched a DIFFERENT house number than the one given, so no distance is given. State that the distance could not be determined, or confirm the street address.',
  no_street_number: 'The address has no house number, so it can only be placed somewhere along the street and no distance is given. State that the distance could not be determined.',
};

/** Unrounded straight-line miles, or null unless the match is exact and the site is known. */
export function distanceIfExact(
  match: GeocodeMatch | null,
  site: { latitude: number; longitude: number } | null,
): number | null {
  if (!match || match.match_quality !== 'exact' || !site) return null;
  if (!Number.isFinite(site.latitude) || !Number.isFinite(site.longitude)) return null;
  return haversineMiles({ lat: site.latitude, lng: site.longitude }, { lat: match.latitude, lng: match.longitude });
}
