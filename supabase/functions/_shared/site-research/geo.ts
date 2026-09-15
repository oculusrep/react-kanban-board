/** Great-circle distance, shared by the tools and the geocoder (no imports, so no cycles). */

const R_MILES = 3958.7613;
export const toRad = (d: number) => (d * Math.PI) / 180;

export function haversineMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_MILES * Math.asin(Math.sqrt(s));
}

/** Smallest cumulative ring (1, 3, 5 mi) containing an UNROUNDED distance; null beyond 5 mi. */
export function ringFor(miles: number | null | undefined): 1 | 3 | 5 | null {
  if (typeof miles !== 'number' || !Number.isFinite(miles) || miles < 0) return null;
  return miles <= 1 ? 1 : miles <= 3 ? 3 : miles <= 5 ? 5 : null;
}

export const round1 = (n: number) => Math.round(n * 10) / 10;
