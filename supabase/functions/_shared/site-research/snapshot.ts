/**
 * Demographics and data-quality flags for the frozen site snapshot.
 *
 * Two places hold Esri demographics: site_submit.client_demographics (custom rings and drive
 * times pulled from the sidebar) and the property's Esri columns. Macon (2026-09-15) has
 * everything on the site submit and nothing on the property; reading only the property made
 * the report say the site had no demographics.
 *
 * Precedence is PER RING (decided 2026-09-15, deliberately not the sidebar's whole-source rule):
 * each radius / drive time comes from the site submit when it has that area, otherwise from the
 * property. Every area carries its own source and pull date. Site-submit pulls are often
 * 1 / 2 / 3 mi + 5 / 7 / 10 min and the property columns 1 / 3 / 5 mi + 10 min, so this recovers
 * the property's 5 mi ring for sites pulled at 1 / 2 / 3. A radius neither source has is absent,
 * never interpolated. Values inside one area are never mixed across sources.
 *
 * PULL POINT: every area also carries the coordinate its figures were pulled at and that point's
 * distance from the site coordinate, or pull_point null when none was recorded. Drive-time figures
 * move materially over a few meters (Macon: 19,845 / 24,538 / 27,599 at points within 17 m;
 * docs/ESRI_DRIVE_TIME_POINT_SENSITIVITY.md), so an unrecorded point is flagged, not hidden.
 */

export const ESRI_FIELDS = [
  'pop_1_mile', 'pop_3_mile', 'pop_5_mile',
  'households_1_mile', 'households_3_mile',
  'hh_income_median_1_mile', 'hh_income_median_3_mile', 'hh_income_median_5_mile',
  'daytime_pop_1_mile', 'daytime_pop_3_mile',
  'median_age_3_mile',
  'tapestry_segment_code', 'tapestry_segment_name',
] as const;

export type EsriStatus = 'missing' | 'partial' | 'present';

export interface EsriDataQuality {
  status: EsriStatus;
  esri_enriched_at: string | null;
  missing_fields: string[];
  note: string;
}

const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

/**
 * missing  = no enrichment date and every Esri field blank (or no property at all)
 * partial  = some Esri fields blank, or fields present with no enrichment date
 * present  = enriched and every field populated
 */
export function esriDataQuality(property: Record<string, unknown> | null | undefined): EsriDataQuality {
  const enrichedAt = property && !isBlank(property.esri_enriched_at) ? String(property.esri_enriched_at) : null;
  const missing = ESRI_FIELDS.filter((f) => !property || isBlank(property[f]));
  if (!property || (enrichedAt === null && missing.length === ESRI_FIELDS.length)) {
    return {
      status: 'missing',
      esri_enriched_at: null,
      missing_fields: [...ESRI_FIELDS],
      note: 'This property has no Esri demographic enrichment. Population, households, income, daytime population, median age and Tapestry are all empty for a data reason, not a market reason.',
    };
  }
  if (missing.length > 0 || enrichedAt === null) {
    return {
      status: 'partial',
      esri_enriched_at: enrichedAt,
      missing_fields: [...missing],
      note: enrichedAt === null
        ? 'Esri fields are present but the property has no enrichment date; the named fields are empty.'
        : 'The property is Esri-enriched but the named fields are empty.',
    };
  }
  return { status: 'present', esri_enriched_at: enrichedAt, missing_fields: [], note: 'Esri demographics present.' };
}

// ---------------------------------------------------------------------------
// Demographics block (threads created after 2026-09-15)
// ---------------------------------------------------------------------------

/** Output metric name -> Esri field prefix, as used by both sources. */
const METRICS = {
  population: 'pop',
  daytime_population: 'daytime_pop',
  households: 'households',
  hh_income_median: 'hh_income_median',
  hh_income_avg: 'hh_income_avg',
  median_age: 'median_age',
  employees: 'employees',
} as const;
type Metric = keyof typeof METRICS;
export type RingValues = Record<Metric, number | null>;

export type DemographicsSource = 'site_submit.client_demographics' | 'property';

export interface PullPoint {
  latitude: number;
  longitude: number;
  /** Coordinate tier used for the pull (e.g. site_submit.verified), or how the point was recovered. */
  coordinate_source: string;
  /** Straight-line meters from the snapshot's site coordinate; null when the site is unknown. */
  distance_from_site_m: number | null;
}

type Sourced = { source: DemographicsSource; pulled_at: string | null; pull_point: PullPoint | null };

export interface DemographicsBlock {
  /** One source, both ('mixed'), or none. */
  source: DemographicsSource | 'mixed' | null;
  /** Straight-line rings that have at least one value, ascending, with their real radius, source and pull date. */
  rings: Array<{ radius_miles: number } & Sourced & RingValues>;
  /** Drive-time areas that have at least one value, ascending, with source and pull date. */
  drive_times: Array<{ minutes: number } & Sourced & RingValues>;
  tapestry: { code: string | null; name: string | null; lifemodes: string | null };
}

const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/** Every ring / drive time a flat Esri record has keys for, with its values; all-null areas dropped. */
function areasFrom(data: Record<string, unknown>) {
  const rings = new Set<number>();
  const drives = new Set<number>();
  for (const k of Object.keys(data)) {
    const m = k.match(/_(\d+(?:\.\d+)?)_mile$/);
    if (m) rings.add(Number(m[1]));
    const d = k.match(/_(\d+)min_drive$/);
    if (d) drives.add(Number(d[1]));
  }
  const values = (suffix: string): RingValues =>
    Object.fromEntries(
      (Object.entries(METRICS) as Array<[Metric, string]>).map(([name, prefix]) => [name, numOrNull(data[`${prefix}_${suffix}`])]),
    ) as RingValues;
  // Only the metric values decide whether an area has data — never its radius / minutes label.
  const hasAny = (v: RingValues) => Object.values(v).some((x) => x !== null);
  const rs: Array<{ radius_miles: number } & RingValues> = [];
  for (const r of [...rings].sort((a, b) => a - b)) {
    const v = values(`${r}_mile`);
    if (hasAny(v)) rs.push({ radius_miles: r, ...v });
  }
  const ds: Array<{ minutes: number } & RingValues> = [];
  for (const m of [...drives].sort((a, b) => a - b)) {
    const v = values(`${m}min_drive`);
    if (hasAny(v)) ds.push({ minutes: m, ...v });
  }
  return { rings: rs, drive_times: ds };
}

/**
 * Per area: the site submit's ring (or drive time) when it has one, otherwise the property's.
 * An area is taken whole from one source — values are never mixed within an area. Tapestry
 * falls back per field.
 */
export function buildDemographics(
  clientDemographics: unknown,
  property: Record<string, unknown> | null | undefined,
  site: { latitude: number; longitude: number } | null = null,
): DemographicsBlock {
  const cd = clientDemographics as {
    data?: Record<string, unknown>; enriched_at?: unknown; tapestry?: Record<string, unknown>;
    pull_point?: { latitude?: unknown; longitude?: unknown; source?: unknown } | null;
  } | null;
  const point = (lat: unknown, lng: unknown, coordinateSource: string): PullPoint | null => {
    const la = numOrNull(lat), lo = numOrNull(lng);
    if (la === null || lo === null) return null;
    return {
      latitude: la, longitude: lo, coordinate_source: coordinateSource,
      distance_from_site_m: site ? Math.round(metersBetween(site.latitude, site.longitude, la, lo) * 10) / 10 : null,
    };
  };
  const tapestry = {
    code: strOrNull(cd?.tapestry?.code) ?? strOrNull(property?.tapestry_segment_code),
    name: strOrNull(cd?.tapestry?.name) ?? strOrNull(property?.tapestry_segment_name),
    lifemodes: strOrNull(cd?.tapestry?.lifemodes) ?? strOrNull(property?.tapestry_lifemodes),
  };
  const none = { rings: [], drive_times: [] } as ReturnType<typeof areasFrom>;
  const ssAreas = cd?.data && typeof cd.data === 'object' ? areasFrom(cd.data) : none;
  const pAreas = property ? areasFrom(property) : none;
  const ss: Sourced = {
    source: 'site_submit.client_demographics', pulled_at: strOrNull(cd?.enriched_at),
    pull_point: point(cd?.pull_point?.latitude, cd?.pull_point?.longitude, strOrNull(cd?.pull_point?.source) ?? 'unspecified'),
  };
  const pr: Sourced = {
    source: 'property', pulled_at: strOrNull(property?.esri_enriched_at),
    pull_point: point(property?.esri_enriched_latitude, property?.esri_enriched_longitude, 'property.esri_enriched'),
  };

  const merge = <K extends 'radius_miles' | 'minutes'>(
    key: K,
    first: Array<Record<K, number> & RingValues>,
    second: Array<Record<K, number> & RingValues>,
  ) => {
    const out = new Map<number, Record<K, number> & Sourced & RingValues>();
    for (const a of first) out.set(a[key], { ...a, ...ss });
    for (const a of second) if (!out.has(a[key])) out.set(a[key], { ...a, ...pr });
    return [...out.values()].sort((x, y) => x[key] - y[key]);
  };
  const rings = merge('radius_miles', ssAreas.rings, pAreas.rings) as DemographicsBlock['rings'];
  const driveTimes = merge('minutes', ssAreas.drive_times, pAreas.drive_times) as DemographicsBlock['drive_times'];

  const sources = new Set([...rings, ...driveTimes].map((x) => x.source));
  const source = sources.size === 0 ? null : sources.size > 1 ? 'mixed' : [...sources][0];
  return { source, rings, drive_times: driveTimes, tapestry };
}

function metersBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.sqrt(a));
}

/**
 * A pull point this far from the site (meters) is stated next to the figures it produced; at
 * FAR_PULL_METERS it is describing a different location and the report must say so. Measured:
 * 17 m moved Macon's 10-minute population by 4,693; 10 of 49 backfilled records were pulled
 * 13.5-683.6 m away (docs/ESRI_DRIVE_TIME_POINT_SENSITIVITY.md).
 */
export const OFFSET_PULL_METERS = 10;
export const FAR_PULL_METERS = 100;

/** The straight-line bands the school totals use; demographics are "complete" when each has population. */
export const SCHOOL_BAND_MILES = [1, 3, 5];

export interface DemographicsQuality {
  status: EsriStatus;
  source: DemographicsBlock['source'];
  rings_miles: number[];
  drive_times_minutes: number[];
  /** School bands (1 / 3 / 5 mi) with no population on file. Blank, not an error. */
  school_bands_without_population: number[];
  tapestry_on_file: boolean;
  /** Drive times whose pull coordinate was not recorded: their start point is unknown. */
  drive_times_without_pull_point: number[];
  /** Rings whose pull coordinate was not recorded. */
  rings_without_pull_point: number[];
  /** Areas pulled OFFSET_PULL_METERS or more from the site coordinate, furthest first. */
  areas_pulled_away_from_site: Array<{ area: string; meters: number; far: boolean }>;
  note: string;
}

/**
 * missing  = neither source has any ring or drive-time value
 * partial  = data exists, but a school band (1 / 3 / 5 mi) has no population ring
 * present  = data exists and 1, 3 and 5 mi all have population
 */
export function demographicsQuality(d: DemographicsBlock): DemographicsQuality {
  const ringsMiles = d.rings.map((r) => r.radius_miles);
  const drives = d.drive_times.map((t) => t.minutes);
  const withPop = new Set(d.rings.filter((r) => r.population !== null).map((r) => r.radius_miles));
  const bandsMissing = SCHOOL_BAND_MILES.filter((b) => !withPop.has(b));
  const tapestryOnFile = !!(d.tapestry.code || d.tapestry.name);
  const label = (x: Sourced) =>
    `${x.source === 'property' ? 'property' : 'site submit'}${x.pulled_at ? ` ${x.pulled_at.slice(0, 10)}` : ''}` +
    (x.pull_point
      ? `, pulled at ${x.pull_point.coordinate_source}${x.pull_point.distance_from_site_m !== null ? ` ${x.pull_point.distance_from_site_m} m from the site` : ''}`
      : ', pull coordinate NOT RECORDED');
  const drivesNoPoint = d.drive_times.filter((t) => !t.pull_point).map((t) => t.minutes);
  const ringsNoPoint = d.rings.filter((r) => !r.pull_point).map((r) => r.radius_miles);
  const offset = [
    ...d.drive_times.map((t) => ({ area: `${t.minutes} min drive`, m: t.pull_point?.distance_from_site_m })),
    ...d.rings.map((r) => ({ area: `${r.radius_miles} mi ring`, m: r.pull_point?.distance_from_site_m })),
  ]
    .filter((x): x is { area: string; m: number } => typeof x.m === 'number' && x.m >= OFFSET_PULL_METERS)
    .sort((a, b) => b.m - a.m)
    .map((x) => ({ area: x.area, meters: x.m, far: x.m >= FAR_PULL_METERS }));
  const list = (xs: Array<Sourced & { name: string }>) => xs.length ? xs.map((x) => `${x.name} (${label(x)})`).join(', ') : 'none';

  if (!d.source) {
    return {
      status: 'missing', source: null, rings_miles: [], drive_times_minutes: [],
      school_bands_without_population: [...SCHOOL_BAND_MILES], tapestry_on_file: tapestryOnFile,
      drive_times_without_pull_point: [], rings_without_pull_point: [], areas_pulled_away_from_site: [],
      note: 'Neither the site submit nor the property has Esri demographics. Population, households, income, daytime population and median age are empty for a data reason, not a market reason.',
    };
  }
  const status: EsriStatus = bandsMissing.length ? 'partial' : 'present';
  return {
    status, source: d.source, rings_miles: ringsMiles, drive_times_minutes: drives,
    school_bands_without_population: bandsMissing, tapestry_on_file: tapestryOnFile,
    drive_times_without_pull_point: drivesNoPoint, rings_without_pull_point: ringsNoPoint,
    areas_pulled_away_from_site: offset,
    note: `Esri demographics on file. Rings: ${list(d.rings.map((r) => ({ ...r, name: `${r.radius_miles} mi` })))}. ` +
      `Drive times: ${list(d.drive_times.map((t) => ({ ...t, name: `${t.minutes} min` })))}.` +
      (bandsMissing.length ? ` No population ring at ${bandsMissing.map((b) => `${b} mi`).join(', ')} from either source: blank, not interpolated.` : '') +
      (tapestryOnFile ? '' : ' Tapestry is empty.') +
      (drivesNoPoint.length ? ` Drive-time figures with no recorded pull coordinate (${drivesNoPoint.map((m) => `${m} min`).join(', ')}): start point unknown, not precise for this site.` : '') +
      (offset.length
        ? (offset.some((o) => o.far)
            ? ` PULLED AT A DIFFERENT LOCATION: ${offset.filter((o) => o.far).map((o) => `${o.area} ${Math.round(o.meters)} m from the site`).join(', ')}. Those figures describe that point, not this corner — say so wherever you cite them, and do not present them as this site's.`
            : '') +
          (offset.some((o) => !o.far)
            ? ` Pulled away from the site coordinate: ${offset.filter((o) => !o.far).map((o) => `${o.area} ${Math.round(o.meters)} m`).join(', ')} — state the distance where you cite these.`
            : '')
        : ''),
  };
}

/**
 * The data_quality block for a pinned_context. Threads with a demographics block use it; threads
 * created before it existed fall back to the old property-only check.
 */
export function dataQualityFor(pinnedContext: unknown): { esri: DemographicsQuality | EsriDataQuality } {
  const pc = pinnedContext as { demographics?: DemographicsBlock; property?: Record<string, unknown> | null } | null;
  if (pc?.demographics) return { esri: demographicsQuality(pc.demographics) };
  return { esri: esriDataQuality(pc?.property ?? null) };
}
