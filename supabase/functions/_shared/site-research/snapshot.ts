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
type Sourced = { source: DemographicsSource; pulled_at: string | null };

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
): DemographicsBlock {
  const cd = clientDemographics as { data?: Record<string, unknown>; enriched_at?: unknown; tapestry?: Record<string, unknown> } | null;
  const tapestry = {
    code: strOrNull(cd?.tapestry?.code) ?? strOrNull(property?.tapestry_segment_code),
    name: strOrNull(cd?.tapestry?.name) ?? strOrNull(property?.tapestry_segment_name),
    lifemodes: strOrNull(cd?.tapestry?.lifemodes) ?? strOrNull(property?.tapestry_lifemodes),
  };
  const none = { rings: [], drive_times: [] } as ReturnType<typeof areasFrom>;
  const ssAreas = cd?.data && typeof cd.data === 'object' ? areasFrom(cd.data) : none;
  const pAreas = property ? areasFrom(property) : none;
  const ss: Sourced = { source: 'site_submit.client_demographics', pulled_at: strOrNull(cd?.enriched_at) };
  const pr: Sourced = { source: 'property', pulled_at: strOrNull(property?.esri_enriched_at) };

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
  const label = (x: Sourced) => `${x.source === 'property' ? 'property' : 'site submit'}${x.pulled_at ? ` ${x.pulled_at.slice(0, 10)}` : ''}`;
  const list = (xs: Array<Sourced & { name: string }>) => xs.length ? xs.map((x) => `${x.name} (${label(x)})`).join(', ') : 'none';

  if (!d.source) {
    return {
      status: 'missing', source: null, rings_miles: [], drive_times_minutes: [],
      school_bands_without_population: [...SCHOOL_BAND_MILES], tapestry_on_file: tapestryOnFile,
      note: 'Neither the site submit nor the property has Esri demographics. Population, households, income, daytime population and median age are empty for a data reason, not a market reason.',
    };
  }
  const status: EsriStatus = bandsMissing.length ? 'partial' : 'present';
  return {
    status, source: d.source, rings_miles: ringsMiles, drive_times_minutes: drives,
    school_bands_without_population: bandsMissing, tapestry_on_file: tapestryOnFile,
    note: `Esri demographics on file. Rings: ${list(d.rings.map((r) => ({ ...r, name: `${r.radius_miles} mi` })))}. ` +
      `Drive times: ${list(d.drive_times.map((t) => ({ ...t, name: `${t.minutes} min` })))}.` +
      (bandsMissing.length ? ` No population ring at ${bandsMissing.map((b) => `${b} mi`).join(', ')} from either source: blank, not interpolated.` : '') +
      (tapestryOnFile ? '' : ' Tapestry is empty.'),
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
