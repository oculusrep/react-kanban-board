/**
 * Traffic generators beyond schools and employers.
 *
 * Two sources, and the split is the whole point of the cost:
 *  - DETERMINISTIC, zero searches: grocery, big box, home improvement, drug, fitness and
 *    destination retail come from merchant_location (23,667 geocoded brand locations), the same
 *    pattern as query_nearby_starbucks.
 *  - RESEARCHED: churches, hospitals and medical, civic buildings and hotels. Places or
 *    merchant_location finds them; a web search SIZES them. Nothing sizes itself by guess — the
 *    1,249-seat church at the East Cobb corner is the case this exists for.
 *
 * Every generator carries a daypart contribution marked Sourced or Inferred. That is why they are
 * here: a church is weekend, a hospital is 24hr, and neither daypart comes from schools or offices.
 */

import {
  buildGeneratorRow, GENERATOR_SIZE_UNITS, GENERATORS_COLUMNS,
  type GeneratorsRow, generatorSort, toCsv,
} from '../csv.ts';
import { haversineMiles, round1 } from './geo.ts';
import { isAncillarySubListing, nameMatchesBrand, normalizeForMatch } from '../merchant-brand-guards.ts';
import { censusGeocode, distanceIfExact, type GeocodeMatch } from './geocode.ts';

/** Everything within this many miles is a candidate generator. */
export const GENERATOR_RADIUS_MILES = 5;

/**
 * merchant_category names -> our categories. Deliberate, not a fuzzy match: restaurants, banks,
 * wireless, car washes and the rest are daily errands, not generators worth a callout.
 */
export const MERCHANT_CATEGORY_MAP: Record<string, string> = {
  'Grocery Stores': 'grocery',
  'Wholesale': 'big_box',
  'Discount Department Stores': 'big_box',
  'Department Stores': 'big_box',
  'Home Improvement': 'home_improvement',
  'Drug Stores': 'drug',
  'Fitness': 'fitness',
  'Sporting Goods': 'destination_retail',
  'Furniture Household': 'destination_retail',
  'Entertainment': 'destination_retail',
  'Craft Fabric Stores': 'destination_retail',
  'Pet Stores': 'destination_retail',
  'Book Stores': 'destination_retail',
  'Computers Electronic': 'destination_retail',
  'Office Supply': 'destination_retail',
};

/** Daypart a category contributes when no source says otherwise. Always labelled Inferred. */
const CATEGORY_DAYPART: Record<string, string> = {
  grocery: 'all day, peaking late afternoon and weekend',
  big_box: 'midday and weekend',
  home_improvement: 'weekend morning',
  drug: 'all day',
  fitness: 'early AM and evening',
  destination_retail: 'midday and weekend',
  church: 'weekend',
  hospital_medical: '24hr, with shift changes',
  civic: 'weekday business hours',
  hotel: 'early AM checkout and evening',
};

export const dayPartNote = (category: string, sourced: string | null): string =>
  sourced ? `daypart: ${sourced} — Sourced` : `daypart: ${CATEGORY_DAYPART[category] ?? 'not determined'} — INFERRED`;

/**
 * merchant_location is a Places harvest, and it is dirty in two ways that matter here.
 *
 * MIS-BRANDED ROWS: brand comes from the Places search *query*, so a "Macy's" search at a mall
 * returned Claire's and Talbots, a "24 Hour Fitness" search returned Planet Fitness, and a "Roses"
 * search returned 395 florists. OVIS already rejects these — nameMatchesBrand and
 * isAncillarySubListing, shipped July 2026 at ingest and at map render. Every stored row predates
 * them, so this query applies the same guards rather than inventing a third rule.
 *
 * SUB-ENTITIES: one store yields several rows. The ancillary token list covers the named ones
 * (Kroger Deli, Lowe's Garden Center); collapseSubEntities below covers what it misses, such as
 * Walmart Supercenter against Walmart Business Center at one address.
 */

export interface CatalogueBrand {
  /** brand.name, for the note that says what the stored value was corrected from. */
  name: string;
  /** places_display_name when the admin set one, else name — what a Places name should start with. */
  expected: string;
  normalized: string;
  /** merchant_category.name, mapped through MERCHANT_CATEGORY_MAP when it is a generator. */
  categoryName: string;
}

/** All 401 brands, for read-side recovery. One query per run. */
// deno-lint-ignore no-explicit-any
export async function fetchBrandCatalogue(service: any): Promise<CatalogueBrand[]> {
  const { data, error } = await service
    .from('merchant_brand')
    .select('name, places_display_name, merchant_category!inner(name)')
    .limit(2000);
  if (error) throw new Error(`merchant_brand lookup failed: ${error.message}`);
  const out: CatalogueBrand[] = [];
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const name = String(row.name ?? '').trim();
    const expected = String(row.places_display_name ?? '').trim() || name;
    const normalized = normalizeForMatch(expected);
    // 5+ characters, or "Ross" and "Shoe" prefix-match half the mall.
    if (!name || normalized.length < 5) continue;
    out.push({
      name, expected, normalized,
      categoryName: String((row.merchant_category as { name?: string } | null)?.name ?? ''),
    });
  }
  return out;
}

export interface Recovery {
  brand: string;
  /** Our generator category, or null when the candidates disagree. */
  category: string | null;
  /** Set when 2+ brands tie at the longest match and map to different categories. */
  ambiguous: string[] | null;
}

/**
 * Recover a mis-filed row's real brand from its NAME, for the export only.
 *
 * merchant_location.brand_id comes from the Places search *query*, so "Walmart Supercenter" is
 * stored under Golf Mart and "Publix Super Market at Bass Plantation" under Kroger. Dropping those
 * rows (which is what the guards alone do) removes the Walmart next door from the file, and an
 * absence that means "we cannot see it" reads as "nothing is there".
 *
 * The rule is deliberately strict, because a loose substring match invents brands: it claimed
 * "American Eagle" was American Freight, "Batteries Plus" was AT&T, and "DSW Designer Shoe
 * Warehouse" was Shoe Carnival. The name must START WITH the brand, normalized, 5+ characters,
 * longest match wins. A name matching no brand is not recovered — the 395 florists a "Roses"
 * search returned are correctly gone.
 *
 * NOTHING IS WRITTEN BACK. merchant_location keeps its stored brand_id, so the merchant map is
 * untouched; re-homing the rows for real is a separate, scheduled decision.
 */
export function recoverBrand(locationName: string, catalogue: CatalogueBrand[]): Recovery | null {
  const n = normalizeForMatch(locationName);
  if (!n) return null;
  const hits = catalogue.filter((b) => n.startsWith(b.normalized));
  if (hits.length === 0) return null;
  const longest = Math.max(...hits.map((b) => b.normalized.length));
  const top = hits.filter((b) => b.normalized.length === longest);
  const categories = [...new Set(top.map((b) => MERCHANT_CATEGORY_MAP[b.categoryName] ?? `other:${b.categoryName}`))];
  if (categories.length > 1) {
    return { brand: top[0].name, category: null, ambiguous: top.map((b) => `${b.name} (${b.categoryName})`) };
  }
  return { brand: top[0].name, category: MERCHANT_CATEGORY_MAP[top[0].categoryName] ?? null, ambiguous: null };
}

export interface MerchantGenerator {
  name: string;
  category: string;
  brand: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number;
  longitude: number;
  distance_miles: number;
  /** Sub-entity rows folded into this one ("Kroger Deli", "Kroger Pharmacy", ...). */
  collapsed?: string[];
  /** Stored brand this row was filed under, when the export corrected it from the name. */
  corrected_from?: string;
  /** Brands that tied on the longest match but disagree on category: category left blank, CHECK. */
  ambiguous?: string[];
}

/**
 * Brand locations within GENERATOR_RADIUS_MILES, straight from merchant_location. No search, no
 * model involvement: the export never depends on anything having been asked for.
 *
 * The mapped categories hold ~7,700 rows statewide, so the query is bounded by a lat/lng box (the
 * indexed columns) and paginated — an unbounded select would silently stop at Supabase's 1,000.
 */
// deno-lint-ignore no-explicit-any
export async function merchantGenerators(service: any, site: { latitude: number; longitude: number }): Promise<MerchantGenerator[]> {
  // No server-side category filter: a row's STORED category is unreliable, and the one we want
  // most — the Walmart filed under Golf Mart — would be filtered out before we could recover it.
  // The lat/lng box keeps this small (346 rows at Macon across every category).
  const catalogue = await fetchBrandCatalogue(service);
  // Pad the box: verified_* coordinates can sit a little outside a box drawn on the raw ones.
  const dLat = GENERATOR_RADIUS_MILES / 69 + 0.01;
  const dLng = GENERATOR_RADIUS_MILES / (69 * Math.max(0.2, Math.cos(site.latitude * Math.PI / 180))) + 0.01;
  const PAGE = 1000;
  const pt = { lat: site.latitude, lng: site.longitude };
  const out: MerchantGenerator[] = [];
  const rejected = { mismatched: 0, ancillary: 0, recovered: 0 };

  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await service
      .from('merchant_location')
      .select('name, latitude, longitude, verified_latitude, verified_longitude, formatted_address, business_status, merchant_brand!inner(name, places_display_name, places_name_exclude, merchant_category!inner(name))')
      .is('excluded_at', null)
      .gte('latitude', site.latitude - dLat).lte('latitude', site.latitude + dLat)
      .gte('longitude', site.longitude - dLng).lte('longitude', site.longitude + dLng)
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`merchant_location lookup failed: ${error.message}`);
    const rows = (data ?? []) as Array<Record<string, unknown>>;

    for (const row of rows) {
      const lat = Number(row.verified_latitude ?? row.latitude);
      const lng = Number(row.verified_longitude ?? row.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      if (String(row.business_status ?? '').toUpperCase() === 'CLOSED_PERMANENTLY') continue;
      const d = haversineMiles(pt, { lat, lng });
      if (d > GENERATOR_RADIUS_MILES) continue;
      const brand = (row.merchant_brand as
        { name?: string; places_display_name?: string | null; places_name_exclude?: string | null; merchant_category?: { name?: string } }
        | null) ?? null;
      const guardBrand = { name: brand?.name ?? '', places_display_name: brand?.places_display_name, places_name_exclude: brand?.places_name_exclude };
      const placesName = String(row.name ?? '');
      // Ancillary first: a sub-listing is never a generator, whoever it is filed under.
      if (isAncillarySubListing(placesName, guardBrand)) { rejected.ancillary++; continue; }

      let category: string | null;
      let brandName = brand?.name ?? null;
      let correctedFrom: string | undefined;
      let ambiguous: string[] | undefined;
      if (nameMatchesBrand(placesName, guardBrand)) {
        // Stored brand is trustworthy: this row is what it says it is.
        category = MERCHANT_CATEGORY_MAP[brand?.merchant_category?.name ?? ''] ?? null;
        if (!category) continue; // a real location, just not a generator category
      } else {
        // Mis-filed. Recover from the name or drop it — never keep the stored brand.
        const rec = recoverBrand(placesName, catalogue);
        if (!rec) { rejected.mismatched++; continue; }
        if (!rec.ambiguous && !rec.category) { rejected.mismatched++; continue; } // recovered, but not a generator
        rejected.recovered++;
        category = rec.category;
        brandName = rec.brand;
        correctedFrom = brand?.name ?? 'unknown';
        ambiguous = rec.ambiguous ?? undefined;
      }
      // formatted_address is "street, city, state zip" from Places; split without inventing parts.
      const parts = String(row.formatted_address ?? '').split(',').map((x) => x.trim());
      const stateZip = (parts[2] ?? '').split(' ').filter(Boolean);
      out.push({
        name: placesName.trim() || (brandName ?? 'unnamed'),
        category: category ?? '', brand: brandName,
        corrected_from: correctedFrom, ambiguous,
        street: parts[0] || null, city: parts[1] || null,
        state: stateZip[0] ?? null, zip: stateZip[1] ?? null,
        latitude: lat, longitude: lng, distance_miles: d,
      });
    }
    if (rows.length < PAGE) break;
  }
  lastRejectedByGuards = rejected;
  return collapseSubEntities(out).sort((a, b) => a.distance_miles - b.distance_miles);
}

/** What the last merchantGenerators call dropped, for the run log. Not part of the export. */
export let lastRejectedByGuards = { mismatched: 0, ancillary: 0, recovered: 0 };

/**
 * One store per physical location, however many Places rows it has.
 *
 * Two rows at the same street address are the same store when their names share a leading word
 * ("Walmart Supercenter" / "Walmart Bakery") or when both names genuinely match a shared brand
 * ("Kroger" / "Kroger Deli"). The name test comes first because brand is often wrong — the Walmart
 * at 5955 Zebulon Rd carries the brands Wal-Mart, Golf Mart and Office Depot across its three rows.
 * A shared address alone is not enough: a shopping centre's tenants share one.
 */
/**
 * Ranking only, never dropping: the ancillary tokens with their spaces removed, so "ProServices"
 * ranks below "Home Improvement" the way "Pro Services" already would. The shared guard keeps its
 * own spelling — widening it would change which pins the merchant map draws, which is a map
 * decision, not a generators one.
 */
const ANCILLARY_ISH = /(atm|pharmacy|fuelcenter|fuelkiosk|fuelingcenter|deli|bakery|floral|moneyservices|moneycenter|advisors|clicklist|gardencenter|proservices|procenter|prodesk|toolrental|autocenter|visioncenter|opticalcenter|photolab|customerservice|curbside|pickup)/i;
const looksAncillary = (name: string) => ANCILLARY_ISH.test(name.toLowerCase().replace(/[^a-z0-9]/g, ''));

/** First meaningful word of a store name: "walmart" from "Walmart Business Center". */
const leadWord = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\b(the|at|of)\b/g, ' ').trim().split(/\s+/)[0] ?? '';

export function collapseSubEntities(rows: MerchantGenerator[]): MerchantGenerator[] {
  const streetKey = (r: MerchantGenerator) =>
    r.street ? r.street.toLowerCase().replace(/\s+(ste|suite|unit|#|spc)\s*\S+$/i, '').trim() : null;
  const byStreet = new Map<string, MerchantGenerator[]>();
  const out: MerchantGenerator[] = [];
  for (const r of rows) {
    const k = streetKey(r);
    if (!k) { out.push(r); continue; } // no address: nothing to compare
    const g = byStreet.get(k);
    if (g) g.push(r); else byStreet.set(k, [r]);
  }

  const sameStore = (a: MerchantGenerator, b: MerchantGenerator) =>
    (leadWord(a.name) !== '' && leadWord(a.name) === leadWord(b.name)) ||
    (!!a.brand && a.brand === b.brand &&
      nameMatchesBrand(a.name, { name: a.brand }) && nameMatchesBrand(b.name, { name: b.brand! }));

  for (const group of byStreet.values()) {
    const clusters: MerchantGenerator[][] = [];
    for (const r of group) {
      const hit = clusters.find((c) => c.some((x) => sameStore(x, r)));
      if (hit) hit.push(r); else clusters.push([r]);
    }
    for (const c of clusters) {
      if (c.length === 1) { out.push(c[0]); continue; }
      // Keep the row whose name is closest to the brand — "Kroger", not "Kroger Fuel Center".
      const best = [...c].sort((a, b) =>
        (nameMatchesBrand(b.name, { name: b.brand ?? '' }) ? 1 : 0) - (nameMatchesBrand(a.name, { name: a.brand ?? '' }) ? 1 : 0) ||
        (looksAncillary(a.name) ? 1 : 0) - (looksAncillary(b.name) ? 1 : 0) ||
        a.name.length - b.name.length)[0];
      out.push({ ...best, collapsed: c.filter((r) => r !== best).map((r) => r.name) });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// record_generator — the researched half
// ---------------------------------------------------------------------------

/** The four the model researches; the rest come from merchant_location with no searches. */
export const RESEARCHED_CATEGORIES = ['church', 'hospital_medical', 'civic', 'hotel'];

export const RECORD_GENERATOR_TOOL = {
  name: 'record_generator',
  description:
    'Record one traffic generator that is NOT a school, an employer or a coffee competitor: a church, ' +
    'a hospital or medical campus, a civic building (courthouse, government centre, library, rec ' +
    'centre) or a hotel. Grocery, big box, home improvement, drug, fitness and destination retail are ' +
    'already in the export from OVIS data — do not record those. Size it in ITS OWN unit as the source ' +
    'states it: a church in seats, a hospital in beds, a hotel in rooms, a building in sf, a workplace ' +
    'in headcount. If no source states a size, leave it out: a blank size is honest, an estimate is ' +
    'not. daypart says when this generator puts people at the corner, and daypart_sourced is true only ' +
    'when a source states it (service times, shift pattern, opening hours) — otherwise it is inferred ' +
    'from the category and labelled so.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      category: { type: 'string', enum: ['church', 'hospital_medical', 'civic', 'hotel'] },
      size_value: { type: 'number', minimum: 0, description: 'Only when a source states it.' },
      size_unit: { type: 'string', enum: [...GENERATOR_SIZE_UNITS] },
      street: { type: 'string' },
      city: { type: 'string' },
      state: { type: 'string' },
      zip: { type: 'string' },
      daypart: { type: 'string', description: 'When it generates traffic, e.g. "Sunday 9am and 11am services", "24hr with 7am and 7pm shift change".' },
      daypart_sourced: { type: 'boolean', description: 'True only when a source states the times.' },
      source: { type: 'string' },
      notes: { type: 'string', description: 'Weekend service count, shift pattern, residential vs commuter, anything the size alone does not say.' },
    },
    required: ['name', 'category', 'source'],
  },
};

export interface RecordedGenerator {
  name: string;
  category: string;
  size_value: number | null;
  size_unit: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  distance_miles_unrounded: number | null;
  source: string;
  notes: string | null;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const clip = (s: string, n: number) => s.trim().slice(0, n);
const STREET_WITH_NUMBER = /^\d+[A-Za-z]?(-\d+)?\s+\S/;

export async function recordGenerator(
  input: Record<string, unknown>,
  site: { latitude: number; longitude: number } | null,
  geocode: (address: string) => Promise<GeocodeMatch | null> = censusGeocode,
): Promise<Record<string, unknown>> {
  const rejected: Array<{ field: string; reason: string }> = [];
  const name = str(input.name);
  const source = str(input.source);
  const category = str(input.category);
  if (!name || !source) return { recorded: null, rejected: [{ field: !name ? 'name' : 'source', reason: 'required' }] };
  // Only the researched half. The retail categories are already in the export from OVIS data, so a
  // model-recorded "grocery" would duplicate a row that is there whether it was asked for or not.
  if (!category || !RESEARCHED_CATEGORIES.includes(category)) {
    return { recorded: null, rejected: [{ field: 'category', reason: 'must be church, hospital_medical, civic or hotel; retail categories come from OVIS data automatically' }] };
  }

  // Size only as stated, and only with a unit that fits.
  let sizeValue: number | null = null;
  let sizeUnit: string | null = null;
  if (input.size_value !== undefined && input.size_value !== null) {
    const v = typeof input.size_value === 'number' ? input.size_value : Number(input.size_value);
    const unit = str(input.size_unit);
    if (!Number.isFinite(v) || v < 0) rejected.push({ field: 'size_value', reason: 'must be a number a source states' });
    else if (!unit || !(GENERATOR_SIZE_UNITS as readonly string[]).includes(unit)) {
      rejected.push({ field: 'size_unit', reason: `a size needs its unit: ${GENERATOR_SIZE_UNITS.join(', ')}` });
    } else { sizeValue = v; sizeUnit = unit; }
  }

  let street = str(input.street);
  if (street && !STREET_WITH_NUMBER.test(street)) { rejected.push({ field: 'street', reason: 'must begin with the street number the source states' }); street = null; }
  const city = str(input.city), state = str(input.state), zip = str(input.zip);

  const notes: string[] = [dayPartNote(category, str(input.daypart) && input.daypart_sourced === true ? str(input.daypart) : null)];
  if (str(input.daypart) && input.daypart_sourced !== true) notes.push(`daypart as described: ${clip(str(input.daypart)!, 200)}`);
  const given = str(input.notes);
  if (given) notes.push(clip(given, 500));

  let match: GeocodeMatch | null = null;
  let distance: number | null = null;
  if (street && (city || zip)) {
    const oneLine = [street, city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    try {
      match = await geocode(oneLine);
      distance = distanceIfExact(match, site);
      if (!match) notes.push('Census geocoder found no match; not placed on the map');
      else if (distance === null) notes.push(`Census geocoder match was ${match.match_quality}; not placed on the map`);
    } catch (e) {
      notes.push(`Census geocoder unavailable (${e instanceof Error ? e.message : String(e)})`);
    }
  } else {
    notes.push('no street address with a city or zip; not placed on the map');
  }

  const recorded: RecordedGenerator = {
    name: clip(name, 200), category, size_value: sizeValue, size_unit: sizeUnit,
    street: street ? clip(street, 200) : null, city: city ? clip(city, 100) : null,
    state: state ? clip(state, 50) : null, zip: zip ? clip(zip, 20) : null,
    latitude: distance !== null && match ? match.latitude : null,
    longitude: distance !== null && match ? match.longitude : null,
    distance_miles_unrounded: distance, source: clip(source, 2000), notes: notes.join('; '),
  };
  return {
    recorded,
    distance_miles: distance === null ? null : round1(distance),
    callout: sizeValue !== null && sizeUnit ? `${recorded.name} (${sizeValue.toLocaleString('en-US')} ${sizeUnit})` : null,
    rejected,
    note: sizeValue === null
      ? 'Recorded without a size: it is exported and mapped, but it cannot be a callout and you may not describe how big it is.'
      : 'Recorded. The callout form above is what goes on the slide.',
  };
}

/**
 * Drive-time band per point, from the SAME cached isochrone the pipeline count used — generators
 * and pipeline.csv must agree about what "10 minutes" means at this site.
 */
// deno-lint-ignore no-explicit-any
export async function fetchDriveBands(
  rpc: { rpc: (fn: string, args?: Record<string, unknown>) => any },
  site: { latitude: number; longitude: number },
  points: Array<{ id: string; lat: number; lng: number }>,
): Promise<{ bands: Map<string, string>; isochronesFrom: string | null }> {
  if (points.length === 0) return { bands: new Map(), isochronesFrom: null };
  const { data, error } = await rpc.rpc('site_drive_time_bands', {
    p_latitude: site.latitude, p_longitude: site.longitude, p_points: points,
  });
  if (error) throw new Error(`site_drive_time_bands failed: ${error.message}`);
  const out = (data ?? {}) as { bands?: Record<string, string>; isochrones_from?: string | null };
  return { bands: new Map(Object.entries(out.bands ?? {})), isochronesFrom: out.isochrones_from ?? null };
}

export function buildGeneratorsCsv(
  merchants: MerchantGenerator[],
  recorded: RecordedGenerator[],
  driveBand: (lat: number, lng: number) => string | null = () => null,
): { csv: string; rows: GeneratorsRow[]; flagged: number } {
  const rows: GeneratorsRow[] = [];
  const seen = new Set<string>();
  const push = (r: GeneratorsRow) => {
    const key = `${String(r.name ?? '').toLowerCase()}|${String(r.street ?? '').toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(r);
  };
  for (const m of merchants) {
    push(buildGeneratorRow({
      name: m.name, category: m.category, size_value: null, size_unit: null,
      street: m.street, city: m.city, state: m.state, zip: m.zip,
      latitude: m.latitude, longitude: m.longitude, distance_miles: m.distance_miles,
      drive_time_band: driveBand(m.latitude, m.longitude),
      source: 'OVIS merchant_location (Google Places)',
      // Retail has no size on file anywhere, so a blank size is not a CHECK for these rows.
      size_expected: false,
      check_reason: m.ambiguous?.length
        ? `name matches ${m.ambiguous.length} brands in different categories — category left blank rather than guessed`
        : null,
      notes: [
        m.brand ? `brand: ${m.brand}` : null,
        m.corrected_from
          ? `brand corrected from the stored value "${m.corrected_from}" by matching the location name; merchant_location itself is unchanged`
          : null,
        m.ambiguous?.length ? `candidates: ${m.ambiguous.join(' | ')}` : null,
        m.category ? dayPartNote(m.category, null) : 'daypart not determined — category unresolved',
        m.collapsed?.length ? `one store; Places also lists ${m.collapsed.join(', ')}` : null,
      ].filter(Boolean).join('; '),
    }));
  }
  for (const g of recorded) {
    push(buildGeneratorRow({
      name: g.name, category: g.category, size_value: g.size_value, size_unit: g.size_unit,
      street: g.street, city: g.city, state: g.state, zip: g.zip,
      latitude: g.latitude, longitude: g.longitude, distance_miles: g.distance_miles_unrounded,
      drive_time_band: g.latitude !== null && g.longitude !== null ? driveBand(g.latitude, g.longitude) : null,
      source: g.source, notes: g.notes,
    }));
  }
  rows.sort(generatorSort);
  return { csv: toCsv(GENERATORS_COLUMNS, rows), rows, flagged: rows.filter((r) => r.flag === 'CHECK').length };
}
