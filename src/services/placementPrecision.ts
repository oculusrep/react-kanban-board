import type { GeocodeResult, GeocodeError } from './geocodingService';

/**
 * Whether a geocode is precise enough to be written as a project's location.
 *
 * The rule this encodes: a coarse geocode is NOT a location. Writing one puts a
 * pin on a county or city centroid, which reads as a real position and is worse
 * than no pin at all — it silently poisons proximity dedupe, and (verified in
 * production before this was written) stacked four projects on the Forsyth County
 * centroid and three on Cumming's.
 *
 * Mirrors municipal_project.unplaced_reason in the database; the two must stay in
 * step or the placement CHECK constraint will reject the write.
 */
export type UnplacedReason =
  | 'admin_area_centroid'  // Google APPROXIMATE — a county / city / zip centroid
  | 'road_centroid'        // Google GEOMETRIC_CENTER — a road segment centre
  | 'geocode_failed'       // no usable result
  | 'no_address';          // nothing to geocode

export interface Placement {
  placed: boolean;
  latitude: number | null;
  longitude: number | null;
  formattedAddress: string | null;
  reason: UnplacedReason | null;
}

const UNPLACED_LABEL: Record<UnplacedReason, string> = {
  admin_area_centroid: 'Address is only a county / city — no real location',
  road_centroid: 'Address is only a road — every project on it lands on one point',
  geocode_failed: "Address couldn't be geocoded",
  no_address: 'No address to geocode',
};

/** Short, reviewer-facing explanation of why a record has no pin. */
export function unplacedLabel(reason: string | null | undefined): string {
  if (!reason) return 'Unplaced';
  return UNPLACED_LABEL[reason as UnplacedReason] ?? 'Unplaced';
}

/**
 * Classify a geocoder response into a placement.
 *
 * ROOFTOP / RANGE_INTERPOLATED are address-level and get a pin. Everything else
 * is withheld with a reason. The OSM fallback leaves location_type undefined; it
 * is treated as coarse, because an unlabelled point cannot be shown to be precise
 * and the whole point here is to stop guessing.
 */
export function classifyGeocode(
  result: GeocodeResult | GeocodeError | null,
  hadAddress: boolean,
): Placement {
  const unplaced = (reason: UnplacedReason): Placement => ({
    placed: false, latitude: null, longitude: null, formattedAddress: null, reason,
  });

  if (!hadAddress) return unplaced('no_address');
  if (!result || 'error' in result) return unplaced('geocode_failed');
  if (!('latitude' in result) || !('longitude' in result)) return unplaced('geocode_failed');

  switch (result.location_type) {
    case 'ROOFTOP':
    case 'RANGE_INTERPOLATED':
      return {
        placed: true,
        latitude: result.latitude,
        longitude: result.longitude,
        formattedAddress: result.formatted_address ?? null,
        reason: null,
      };
    case 'APPROXIMATE':
      return unplaced('admin_area_centroid');
    case 'GEOMETRIC_CENTER':
      return unplaced('road_centroid');
    default:
      // Undefined (the OSM fallback). Not demonstrably precise, so not placed.
      return unplaced('geocode_failed');
  }
}
