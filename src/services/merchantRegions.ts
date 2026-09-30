/**
 * Merchant ingestion regions.
 *
 * Geography used to be four hardcoded Georgia constants inside
 * merchantIngestService.ts (a state bbox, six metro bboxes, a 4×4 subdivider,
 * and an address string test). This module turns "where do we ingest?" into a
 * registry, so a new market is a config entry rather than a code change.
 *
 * To add a market:
 *   1. Add a MerchantRegion to MERCHANT_REGIONS below.
 *   2. That's it. The admin Ingestion tab reads the registry for its region
 *      picker, and merchant_brand_region_ingest tracks coverage per region.
 *
 * Spec: docs/MERCHANTS_LAYER_SPEC.md §4
 *       docs/MERCHANTS_COLUMBIA_SC_EXPANSION.md
 */

export interface GeoBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface NamedBounds extends GeoBounds {
  name: string;
}

/** The parts of a Places result a region needs to judge membership. */
export interface PlaceGeo {
  latitude: number;
  longitude: number;
  formatted_address: string;
}

/**
 * How a region is partitioned when a search saturates.
 *
 * 'named' — a curated list of sub-areas (Georgia's six metros), each
 *   subdivided phase3Grid × phase3Grid if it also saturates. Encodes human
 *   knowledge about where the density is. Every sub-area is searched once the
 *   region-wide search saturates, whether or not there is anything there.
 *
 * 'adaptive' — recursive quadtree. Split the region `split × split`, and
 *   recurse ONLY into children that saturate, to `maxDepth`. Costs far less
 *   than 'named' on the common case (see below) and goes deeper exactly where
 *   density warrants it. This is the approach GOOGLE_PLACES_API_STATUS.md §8
 *   recommends.
 *
 * Why adaptive matters so much here: the saturation test is
 * `results.length >= 20` on the RAW Places response, before the name-match
 * filter. Google's text search is over-permissive — a "REI" search returns
 * every outdoor shop in range — so a brand with ONE real location in the
 * region can still come back with 20 results and trip the partition. Under
 * 'named' that brand pays for all 16 sub-areas. Under 'adaptive' it pays for
 * 4, finds nothing saturated, and stops.
 */
export type SearchStrategy =
  | { kind: 'named'; subAreas: NamedBounds[]; phase3Grid: number }
  | { kind: 'adaptive'; split: number; maxDepth: number };

export interface MerchantRegion {
  /**
   * Stable key, persisted as merchant_brand_region_ingest.region_id.
   * NEVER rename one of these — it would orphan that region's ingest history.
   */
  id: string;
  /** Full name for the region picker. */
  name: string;
  /**
   * Short adjective used in admin copy, e.g. "GA locations returned by
   * Places" / "Columbia-area locations returned by Places".
   */
  locationLabel: string;
  /** Phase 1 locationRestriction — one search over the whole region. */
  bounds: GeoBounds;
  /** How to partition when a search saturates. */
  strategy: SearchStrategy;
  /**
   * Hard ceiling on Places calls for a single brand, so one pathological
   * brand cannot run away with the budget. A brand that hits it is marked
   * `truncated` in the result and can be re-run alone with a raised cap.
   */
  maxRequestsPerBrand: number;
  /**
   * Authoritative membership test, applied to every result before it is
   * cached.
   *
   * Place.searchByText's locationRestriction is a bbox, and a bbox is never
   * the actual region — Georgia's leaks into four neighbouring states, and a
   * radius is not a rectangle at all. This predicate is what actually keeps
   * out-of-region rows out of merchant_location, so it must be exact.
   */
  accept(place: PlaceGeo): boolean;
  /**
   * Mean Places calls per brand, used by the cost estimator. Depends almost
   * entirely on how often brands trip Phase 2/3, which is a function of
   * region density and subAreas.length — so it is per-region, not global.
   */
  avgRequestsPerBrand: number;
  /** Whether avgRequestsPerBrand came from a real full run or is still a guess. */
  costBasis: 'measured' | 'estimated';
}

// ---------- Geometry helpers ----------

/** Split a bbox into an N×N grid of smaller bboxes. */
export function subdivide(b: GeoBounds, n: number, namePrefix: string): NamedBounds[] {
  const latStep = (b.north - b.south) / n;
  const lngStep = (b.east - b.west) / n;
  const cells: NamedBounds[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      cells.push({
        name: `${namePrefix} ${i},${j}`,
        south: b.south + i * latStep,
        north: b.south + (i + 1) * latStep,
        west: b.west + j * lngStep,
        east: b.west + (j + 1) * lngStep,
      });
    }
  }
  return cells;
}

const EARTH_RADIUS_MILES = 3958.8;

export function haversineMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(a));
}

/**
 * Pull the USPS state code out of a Google `formattedAddress`.
 *
 * Google's US shape is "123 Peachtree St NE, Atlanta, GA 30303, USA", so the
 * state is the two-letter token immediately before the ZIP. Anchoring on the
 * ZIP matters: the naive `/\bGeorgia\b/` test this replaces matched every
 * business on a street named "Georgia Ave" and put a dozen North Augusta, SC
 * storefronts into the Georgia cache.
 *
 * Returns null when the address has no recognisable state (non-US results,
 * plus-codes, or a bare place name).
 */
export function stateFromFormattedAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const withZip = address.match(/,\s*([A-Z]{2})\s+\d{5}(?:-\d{4})?\b/);
  if (withZip) return withZip[1];
  // Fallback for the ZIP-less shape ("Atlanta, GA, USA" / "Atlanta, GA").
  const noZip = address.match(/,\s*([A-Z]{2})(?:,\s*USA)?\s*$/);
  return noZip ? noZip[1] : null;
}

// ---------- Region definitions ----------

const GEORGIA_BOUNDS: GeoBounds = {
  north: 35.01,
  south: 30.35,
  east: -80.75,
  west: -85.61,
};

/**
 * GA metro bboxes. Generous on purpose (metro + inner suburbs + outer ring) so
 * the Phase 3 subdivision still catches outer-ring stores.
 */
const GEORGIA_METROS: NamedBounds[] = [
  { name: 'Atlanta', north: 34.35, south: 33.25, east: -83.8, west: -85.05 },
  { name: 'Savannah', north: 32.3, south: 31.8, east: -80.95, west: -81.5 },
  { name: 'Augusta', north: 33.75, south: 33.15, east: -81.7, west: -82.4 },
  { name: 'Columbus', north: 32.8, south: 32.3, east: -84.55, west: -85.2 },
  { name: 'Macon', north: 33.05, south: 32.45, east: -83.35, west: -83.9 },
  { name: 'Athens', north: 34.15, south: 33.7, east: -83.15, west: -83.6 },
];

const GEORGIA: MerchantRegion = {
  id: 'georgia',
  name: 'Georgia (statewide)',
  locationLabel: 'GA',
  bounds: GEORGIA_BOUNDS,
  // Georgia keeps the curated-metro strategy it was ingested under. Switching
  // it to adaptive would be cheaper, but it is a shipped market with 23k rows
  // already paid for, and changing its search shape invalidates the measured
  // calibration below. Migrate it deliberately, not as a side effect.
  strategy: { kind: 'named', subAreas: GEORGIA_METROS, phase3Grid: 4 },
  // Full tree is 1 + 6 + 6×16 = 103, so this never binds — present only so
  // every region has a ceiling.
  maxRequestsPerBrand: 110,
  // A bbox test would be wrong here: GEORGIA_BOUNDS also covers east Alabama,
  // the Florida panhandle above 30.35 (Tallahassee included), and slivers of
  // SC/NC/TN. The state code is the real boundary.
  accept: (p) => stateFromFormattedAddress(p.formatted_address) === 'GA',
  // Measured on the April 2026 full run: $124.58 across 401 brands at 2¢/call.
  avgRequestsPerBrand: 15.5,
  costBasis: 'measured',
};

// Columbia SC — State House, the centre of the 50-mile scope.
const COLUMBIA_CENTER = { lat: 34.0007, lng: -81.0348 };
const COLUMBIA_RADIUS_MILES = 50;

/**
 * Search bbox for the Columbia region. Deliberately wider than the 50-mile
 * circle's own bbox (N 34.725 / S 33.277 / E -80.163 / W -81.907) so the
 * grid sweeps whole edge counties rather than clipping them; `accept` trims
 * the corners back to the true radius.
 */
const COLUMBIA_BOUNDS: GeoBounds = {
  north: 34.8,
  south: 33.2,
  east: -80.05,
  west: -82.0,
};

const COLUMBIA_SC: MerchantRegion = {
  id: 'columbia-sc-50mi',
  name: 'Columbia SC (50-mile radius)',
  locationLabel: 'Columbia-area',
  bounds: COLUMBIA_BOUNDS,
  // One real metro, so there are no named sub-markets to enumerate the way
  // Georgia does — and a fixed 4×4 grid would bill all 16 cells for every
  // brand Google merely returns 20 loose matches for. Quadtree instead:
  // 2×2 = 4 cells at depth 1 (~55 mi), recursing only where saturated, to
  // ~14 mi cells at depth 3.
  strategy: { kind: 'adaptive', split: 2, maxDepth: 3 },
  // 25 calls = $0.50. The full depth-3 tree would be 85; a brand that needs
  // more than 25 is either genuinely enormous here or is matching junk, and
  // either way it should surface as truncated rather than quietly bill.
  maxRequestsPerBrand: 25,
  // Radius, not state code: the circle lies entirely inside South Carolina
  // (nearest GA point ≈ 62 mi, nearest NC ≈ 80 mi), so distance alone is both
  // exact and immune to malformed addresses.
  accept: (p) =>
    haversineMiles(p.latitude, p.longitude, COLUMBIA_CENTER.lat, COLUMBIA_CENTER.lng) <=
    COLUMBIA_RADIUS_MILES,
  // Measured on the 2026-09-30 OREP run: 401 calls across 209 brands = 1.92
  // calls/brand ($8.02). Across everything ingested for this region so far
  // (the 4-brand probe, Burritos, OREP) it is 444 calls / 220 brands = 2.02.
  //
  // Both earlier figures here were far too high — 4.5, then 8.5 — because
  // they extrapolated Georgia's saturation rate onto a region with a tenth
  // of the population. What actually happened: only 48 of 209 brands (23%)
  // saturated region-wide, and of the 192 child cells those 48 splits
  // produced, NOT ONE saturated. So the quadtree never reached depth 2 and
  // nothing hit the per-brand ceiling.
  //
  // Caveat kept deliberately: OREP is restaurant-weighted and excludes the
  // dollar stores. Dollar General alone spent 25 calls in the probe, so the
  // 184 non-OREP brands will pull this average up somewhat. 2.0 is the
  // all-Columbia figure and the conservative pick between the two.
  avgRequestsPerBrand: 2.0,
  costBasis: 'measured',
};

export const MERCHANT_REGIONS: MerchantRegion[] = [GEORGIA, COLUMBIA_SC];

/** The region assumed when a caller doesn't name one. */
export const DEFAULT_REGION_ID = GEORGIA.id;

export function getRegion(id: string): MerchantRegion {
  const region = MERCHANT_REGIONS.find((r) => r.id === id);
  if (!region) throw new Error(`Unknown merchant region "${id}"`);
  return region;
}
