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

/* ------------------------------------------------------------------------- */
/* Precision badge                                                            */
/* ------------------------------------------------------------------------- */

/**
 * How well-located a record is, at a glance — the thing you want to know BEFORE
 * deciding whether to go hunting for it.
 *
 * Deliberately not derived from `unplaced_reason`. That column records why the
 * geocode was rejected for PLACEMENT, which is a different question from how
 * useful it is for ORIENTATION, and measured against the live geocode it is
 * wrong for 4 of the 14 unplaced records: "The Hills at Cedar Creek" is tagged
 * `road_centroid` but resolves only to a 7-mile locality, while three
 * `admin_area_centroid` rows resolve to a 4-mile ZIP or city, which is a great
 * deal better than their county. The live granularity is the honest signal.
 */
export type PrecisionTier =
  | 'parcel'   // parcel IDs in a county we have an adapter for — fetchable
  | 'road'     // a geocode tighter than the municipality to orient from
  | 'county'   // nothing better than the municipality; read the hint instead
  | 'placed';  // already on the map — show where it came from

export interface PrecisionBadge {
  tier: PrecisionTier;
  /** Short text on the badge itself. */
  label: string;
  /** The specific thing behind the tier, e.g. 'intersection', '2 parcels'. */
  detail?: string;
  /** Longer explanation, for a title attribute. */
  hint: string;
}

/** Granularity strings from orientationGeocode, kept loose to avoid a cycle. */
type Granularity = 'address' | 'intersection' | 'road' | 'zip' | 'city' | 'county';

const GRANULARITY_DETAIL: Record<Granularity, string> = {
  address: 'street address',
  intersection: 'intersection',
  road: 'road',
  zip: 'ZIP code',
  city: 'city',
  county: 'county',
};

export interface PrecisionInput {
  isUnplaced: boolean;
  /** Parcel IDs on the record AND a county adapter that can fetch them. */
  parcelFetchable: boolean;
  parcelCount: number;
  /** Live geocode granularity, or null while loading / if it failed. */
  granularity: Granularity | null;
  geometrySource?: 'hand_drawn' | 'parcel_fetch' | 'parcel_fetch_adjusted' | null;
  centroidSource?: 'address_geocode' | 'polygon' | 'manual_pin' | null;
  hasGeometry: boolean;
}

/**
 * Placed records report provenance rather than precision — the question has
 * already been answered, and how it was answered is what determines how much
 * you trust it.
 */
function placedBadge(i: PrecisionInput): PrecisionBadge {
  if (i.hasGeometry) {
    switch (i.geometrySource) {
      case 'parcel_fetch':
        return { tier: 'placed', label: 'Parcel boundary', detail: 'fetched',
          hint: 'Boundary fetched from the county parcel map.' };
      case 'parcel_fetch_adjusted':
        return { tier: 'placed', label: 'Parcel boundary', detail: 'adjusted',
          hint: 'Fetched from the county parcel map, then adjusted by hand.' };
      default:
        return { tier: 'placed', label: 'Drawn', detail: 'by hand',
          hint: 'Boundary drawn by hand.' };
    }
  }
  if (i.centroidSource === 'manual_pin') {
    return { tier: 'placed', label: 'Pin dropped', detail: 'by hand',
      hint: 'Someone placed this pin by hand.' };
  }
  return { tier: 'placed', label: 'Geocoded pin', detail: 'from address',
    hint: 'Pin came from geocoding the address, with no boundary.' };
}

export function precisionBadge(i: PrecisionInput): PrecisionBadge {
  if (!i.isUnplaced) return placedBadge(i);

  if (i.parcelFetchable) {
    return {
      tier: 'parcel',
      label: 'Parcel',
      detail: `${i.parcelCount} parcel${i.parcelCount === 1 ? '' : 's'}`,
      hint: 'Has parcel IDs in a county we can query — fetch the boundary rather than drawing it.',
    };
  }

  if (i.granularity && i.granularity !== 'county') {
    return {
      tier: 'road',
      label: 'Intersection / road',
      detail: GRANULARITY_DETAIL[i.granularity],
      hint: `Geocodes to a ${GRANULARITY_DETAIL[i.granularity]} — the map is framed on that approximate area. Not precise enough to be the pin.`,
    };
  }

  return {
    tier: 'county',
    label: 'County only',
    detail: undefined,
    hint: 'Nothing better than the municipality. Don’t go hunting — read the pin placement hint and place it by hand.',
  };
}

/** Brand-palette colors per tier. Terracotta is the warning tone. */
export const TIER_COLORS: Record<PrecisionTier, { bg: string; fg: string; border: string }> = {
  parcel: { bg: '#002147', fg: '#FFFFFF', border: '#002147' },
  road:   { bg: '#FFFFFF', fg: '#4A6B94', border: '#8FA9C8' },
  county: { bg: '#FFFFFF', fg: '#A27B5C', border: '#A27B5C' },
  placed: { bg: '#F8FAFC', fg: '#4A6B94', border: '#8FA9C8' },
};
