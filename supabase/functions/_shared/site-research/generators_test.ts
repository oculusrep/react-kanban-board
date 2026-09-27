import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  buildGeneratorsCsv, type CatalogueBrand, collapseSubEntities, dayPartNote, lastRejectedByGuards,
  type MerchantGenerator, merchantGenerators, recordGenerator, recoverBrand,
} from './generators.ts'
import { isAncillarySubListing, nameMatchesBrand } from '../merchant-brand-guards.ts'
import { generatorCallout } from '../csv.ts'

const site = { latitude: 32.880362, longitude: -83.760908 }
const geoOk = (lat: number, lng: number) =>
  // deno-lint-ignore no-explicit-any
  (_a: string) => Promise.resolve({ latitude: lat, longitude: lng, match_quality: 'exact', matched_address: 'x' } as any)
const geoNone = (_a: string) => Promise.resolve(null)

const m = (name: string, brand: string | null, street: string, category = 'grocery', lat = 32.881, lng = -83.761): MerchantGenerator => ({
  name, category, brand, street, city: 'Macon', state: 'GA', zip: '31210',
  latitude: lat, longitude: lng, distance_miles: 0.2,
})

Deno.test('a sized generator renders the callout the slide uses', async () => {
  const r = await recordGenerator({
    name: 'Eastside Baptist Church', category: 'church', size_value: 1249, size_unit: 'seats',
    street: '2450 Lower Roswell Rd', city: 'Marietta', state: 'GA', zip: '30068',
    daypart: 'Sunday 9:30 and 11:00 services', daypart_sourced: true,
    source: 'https://eastsidebaptist.org/about', notes: 'two weekend services',
  }, site, geoOk(33.98, -84.5))
  assertEquals(r.callout, 'Eastside Baptist Church (1,249 seats)')
  const rec = r.recorded as Record<string, unknown>
  assertEquals(rec.size_value, 1249)
  assert(String(rec.notes).includes('Sourced'), String(rec.notes))
  assert(!String(rec.notes).includes('INFERRED'), String(rec.notes))
})

Deno.test('daypart is marked INFERRED when no source states it', async () => {
  const r = await recordGenerator(
    { name: 'Navicent Health', category: 'hospital_medical', size_value: 637, size_unit: 'beds', source: 'https://x' },
    site, geoNone)
  const rec = r.recorded as Record<string, unknown>
  assert(String(rec.notes).includes('24hr'), String(rec.notes))
  assert(String(rec.notes).includes('INFERRED'), String(rec.notes))
  assertEquals(dayPartNote('church', null), 'daypart: weekend — INFERRED')
})

Deno.test('a size without its unit is rejected, and the row still records unsized', async () => {
  const r = await recordGenerator(
    { name: 'First Methodist', category: 'church', size_value: 800, source: 'https://x' }, site, geoNone)
  const rec = r.recorded as { size_value: number | null; size_unit: string | null }
  assertEquals(rec.size_value, null)
  assertEquals(rec.size_unit, null)
  assertEquals(r.callout, null)
  assert((r.rejected as Array<{ field: string }>).some((x) => x.field === 'size_unit'))
  assert(String(r.note).includes('may not describe how big it is'), String(r.note))
})

Deno.test('retail categories cannot be recorded by the model — they come from OVIS data', async () => {
  const r = await recordGenerator({ name: 'Kroger', category: 'grocery', source: 'https://x' }, site, geoNone)
  assertEquals(r.recorded, null)
  assertEquals((r.rejected as Array<{ field: string }>)[0].field, 'category')
})

Deno.test('the shared guards are what generators applies — same rule as ingest and map render', () => {
  assert(nameMatchesBrand('Kroger Deli', { name: 'Kroger' }))
  assert(nameMatchesBrand('bealls', { name: 'Bealls Outlet' }))
  assert(!nameMatchesBrand('Planet Fitness', { name: '24 Hour Fitness' }))
  assert(!nameMatchesBrand("Mike's Food Mart", { name: 'Apple Store' }))
  assert(!nameMatchesBrand('Ladybug\'s Flowers & Gifts', { name: 'Roses' }))
  // The ancillary list already covers the named sub-listings; the collapse covers the rest.
  assert(isAncillarySubListing('Kroger Deli', {}))
  assert(isAncillarySubListing('Walmart Garden Center', {}))
  assert(!isAncillarySubListing('Walmart Supercenter', {}))
})

Deno.test('sub-entities of one store collapse; separate tenants at one address do not', () => {
  const rows = collapseSubEntities([
    m('Kroger', 'Kroger', '220 Tom Hill Sr Blvd'),
    m('Kroger Deli', 'Kroger', '220 Tom Hill Sr Blvd'),
    m('Kroger Pharmacy', 'Kroger', '220 Tom Hill Sr Blvd'),
    // Same store, three DIFFERENT (wrong) brands — must still collapse on the name.
    m('Walmart Supercenter', 'Golf Mart', '5955 Zebulon Rd', 'big_box'),
    m('Walmart Bakery', 'Wal-Mart', '5955 Zebulon Rd', 'big_box'),
    // Two genuinely different tenants sharing an address.
    m('bealls', 'Bealls Outlet', '1625 Bass Rd', 'big_box'),
    m('Marshalls', 'Marshalls', '1625 Bass Rd', 'big_box'),
  ])
  const names = rows.map((r) => r.name).sort()
  assertEquals(names, ['Kroger', 'Marshalls', 'Walmart Bakery', 'bealls'])
  assertEquals(rows.find((r) => r.name === 'Kroger')?.collapsed?.length, 2)
})

Deno.test('generators.csv: retail carries no size and is not flagged for it', () => {
  const built = buildGeneratorsCsv(
    [m('Kroger', 'Kroger', '220 Tom Hill Sr Blvd')], [], (lat) => (lat === 32.881 ? '5min' : null))
  const kroger = built.rows[0]
  assertEquals(kroger.flag, null, 'retail has no size anywhere; a blank size is not a CHECK')
  assertEquals(kroger.drive_time_band, '5min')
  assertEquals(kroger.size_value, null)
  assertEquals(built.flagged, 0)
  assertEquals(built.csv.split('\r\n')[0].split(',')[0], 'flag')
})

Deno.test('generators.csv: CHECK rows sort first, and nothing is filtered out', async () => {
  const sized = (await recordGenerator({
    name: 'Riverside Methodist', category: 'church', size_value: 900, size_unit: 'seats',
    street: '1 Church St', city: 'Macon', state: 'GA', zip: '31210', source: 'https://x',
  }, site, geoOk(32.9, -83.77))).recorded as never
  const unsized = (await recordGenerator(
    { name: 'County Courthouse', category: 'civic', source: 'https://x' }, site, geoNone)).recorded as never
  const built = buildGeneratorsCsv([m('Kroger', 'Kroger', '220 Tom Hill Sr Blvd')], [sized, unsized])
  assertEquals(built.rows.length, 3, 'unsized and unplaced rows are exported, never dropped')
  assertEquals(built.rows[0].name, 'County Courthouse')
  assertEquals(built.rows[0].flag, 'CHECK')
  assertEquals(generatorCallout(built.rows.find((r) => r.name === 'Riverside Methodist')!), 'Riverside Methodist (900 seats)')
  assertEquals(generatorCallout(built.rows[0]), null)
})

/** A stub service whose merchant_brand table is the catalogue and merchant_location the rows. */
// deno-lint-ignore no-explicit-any
function stubService(locations: any[], brands: Array<{ name: string; display?: string | null; cat: string }>) {
  const make = (rows: unknown[]) => {
    const chain: Record<string, unknown> = {}
    for (const k of ['select', 'is', 'in', 'gte', 'lte']) chain[k] = () => chain
    chain.limit = () => Promise.resolve({ data: rows, error: null })
    chain.range = () => Promise.resolve({ data: rows, error: null })
    return chain
  }
  return {
    from: (t: string) =>
      t === 'merchant_brand'
        ? make(brands.map((b) => ({ name: b.name, places_display_name: b.display ?? null, merchant_category: { name: b.cat } })))
        : make(locations),
  }
}
// deno-lint-ignore no-explicit-any
const loc = (name: string, brand: string, cat: string, addr = '1 A St'): any => ({
  name, latitude: 32.881, longitude: -83.761, formatted_address: `${addr}, Macon, GA 31210`,
  business_status: 'OPERATIONAL',
  merchant_brand: { name: brand, places_display_name: null, places_name_exclude: null, merchant_category: { name: cat } },
})

Deno.test('the query keeps what the guards pass, recovers what it can, drops the rest', async () => {
  const brands = [
    { name: 'Kroger', cat: 'Grocery Stores' },
    { name: 'Wal-Mart', display: 'Walmart', cat: 'Discount Department Stores' },
    { name: 'Roses', cat: 'Discount Department Stores' },
    { name: 'Golf Mart', cat: 'Sporting Goods' },
  ]
  const out = await merchantGenerators(stubService([
    loc('Kroger', 'Kroger', 'Grocery Stores', '2 B St'),                          // guards pass
    loc('Walmart Supercenter', 'Golf Mart', 'Sporting Goods', '3 C St'),          // recovered
    loc("Ladybug's Flowers & Gifts", 'Roses', 'Discount Department Stores'),      // no brand: gone
    loc('Kroger Pharmacy', 'Kroger', 'Drug Stores', '2 B St'),                    // ancillary: gone
  ], brands), site)
  assertEquals(out.map((r) => r.name).sort(), ['Kroger', 'Walmart Supercenter'])
  const wm = out.find((r) => r.name === 'Walmart Supercenter')!
  assertEquals(wm.category, 'big_box', 'category comes from the RECOVERED brand, not the stored one')
  assertEquals(wm.brand, 'Wal-Mart')
  assertEquals(wm.corrected_from, 'Golf Mart')
  assertEquals(lastRejectedByGuards, { mismatched: 1, ancillary: 1, recovered: 1 })
})

Deno.test('a row whose real brand is not a generator category is dropped, not mis-filed', async () => {
  const out = await merchantGenerators(stubService(
    [loc('Chick-fil-A at Zebulon', 'Kroger', 'Grocery Stores')],
    [{ name: 'Chick-fil-A', cat: 'Restaurant Fastfood Major' }, { name: 'Kroger', cat: 'Grocery Stores' }],
  ), site)
  assertEquals(out.length, 0)
})

Deno.test('the merchant query is bounded and paginated, never an unbounded 1000-row read', async () => {
  const calls: Array<Record<string, unknown>> = []
  let page = 0
  const chain: Record<string, unknown> = {}
  for (const k of ['select', 'is', 'in', 'gte', 'lte']) {
    chain[k] = (...a: unknown[]) => { calls.push({ [k]: a }); return chain }
  }
  chain.limit = () => Promise.resolve({ data: [], error: null }) // empty brand catalogue
  chain.range = (from: number, to: number) => {
    calls.push({ range: [from, to] })
    // First page full, second short: the loop must stop after the second.
    const rows = page++ === 0
      ? Array.from({ length: 1000 }, (_, i) => ({
        // Distinct names and addresses: the collapse must not fold unrelated stores together.
        name: `Brand${i} Market`, latitude: 32.881, longitude: -83.761, formatted_address: `${i} A St, Macon, GA 31210`,
        business_status: 'OPERATIONAL', merchant_brand: { name: `Brand${i} Market`, places_display_name: null, places_name_exclude: null, merchant_category: { name: 'Grocery Stores' } },
      }))
      : [{
        name: 'Far Away', latitude: 40.0, longitude: -83.761, formatted_address: '9 B St, Columbus, OH 43004',
        business_status: 'OPERATIONAL', merchant_brand: { name: 'Far Away', places_display_name: null, places_name_exclude: null, merchant_category: { name: 'Grocery Stores' } },
      }]
    return Promise.resolve({ data: rows, error: null })
  }
  const svc = { from: () => chain }
  const out = await merchantGenerators(svc, site)
  assertEquals(page, 2, 'a full page must be followed by another read')
  assert(calls.some((c) => 'gte' in c), 'the query is bounded by a lat/lng box')
  assertEquals(out.filter((r) => r.name === 'Far Away').length, 0, 'outside the radius, dropped')
  assertEquals(out.length, 1000)
})

// ---------------------------------------------------------------------------
// Read-side brand recovery
// ---------------------------------------------------------------------------

const cat = (name: string, categoryName: string, display?: string): CatalogueBrand => ({
  name, expected: display ?? name, normalized: (display ?? name).toLowerCase().replace(/[^a-z0-9]/g, ''), categoryName,
})
const CATALOGUE: CatalogueBrand[] = [
  cat('Wal-Mart', 'Discount Department Stores', 'Walmart'),
  cat('Publix', 'Grocery Stores'),
  cat('PetsMart', 'Pet Stores', 'PetSmart'),
  cat('Planet Fitness', 'Fitness'),
  cat('Planet Smoothie', 'Restaurant Ice Cream Smoothie'),
  cat('Walgreens', 'Drug Stores'),
  cat('Onelife Fitness', 'Fitness'),
  cat('American Freight', 'Furniture Household'),
  cat('Shoe Carnival', 'Shoes Footwear'),
  cat('Chick-fil-A', 'Restaurant Fastfood Major'),
]

Deno.test('recovery finds the real brand of a mis-filed row', () => {
  assertEquals(recoverBrand('Walmart Supercenter', CATALOGUE)?.brand, 'Wal-Mart')
  assertEquals(recoverBrand('Walmart Supercenter', CATALOGUE)?.category, 'big_box')
  assertEquals(recoverBrand('Publix Super Market at Bass Plantation', CATALOGUE)?.category, 'grocery')
  assertEquals(recoverBrand('PetSmart', CATALOGUE)?.brand, 'PetsMart')
  assertEquals(recoverBrand('Onelife Fitness - Macon', CATALOGUE)?.category, 'fitness')
})

Deno.test('recovery rejects the substring matches that invented brands', () => {
  // These are the false re-homes a "contains" rule produced. A prefix rule must refuse them.
  assertEquals(recoverBrand('American Eagle', CATALOGUE), null)
  assertEquals(recoverBrand('DSW Designer Shoe Warehouse', CATALOGUE), null)
  assertEquals(recoverBrand("Mike's Food Mart", CATALOGUE), null)
  // The florists a "Roses" search returned: no brand, correctly gone.
  assertEquals(recoverBrand("Ladybug's Flowers & Gifts", CATALOGUE), null)
})

Deno.test('longest match wins, and a non-generator brand is recovered but not exported', () => {
  // "Planet Fitness" must not lose to "Planet" — and must not be taken for Planet Smoothie.
  assertEquals(recoverBrand('Planet Fitness Macon', CATALOGUE)?.brand, 'Planet Fitness')
  // Correctly identified, simply not a generator: the caller drops it.
  assertEquals(recoverBrand('Chick-fil-A at Zebulon', CATALOGUE)?.category, null)
})

Deno.test('two brands tied on the longest match in different categories: CHECK, never a guess', () => {
  const tied: CatalogueBrand[] = [cat('Summit Foods', 'Grocery Stores'), cat('Summit Foods', 'Fitness')]
  const r = recoverBrand('Summit Foods of Macon', tied)!
  assertEquals(r.category, null)
  assertEquals(r.ambiguous?.length, 2)
  const built = buildGeneratorsCsv([{
    name: 'Summit Foods of Macon', category: '', brand: 'Summit Foods', street: '1 A St', city: 'Macon',
    state: 'GA', zip: '31210', latitude: 32.9, longitude: -83.75, distance_miles: 1.1,
    corrected_from: 'Kroger', ambiguous: r.ambiguous!,
  }], [])
  assertEquals(built.rows[0].flag, 'CHECK')
  assertEquals(built.rows[0].category, null, 'category is left blank rather than guessed')
  assert(String(built.rows[0].notes).includes('candidates:'), String(built.rows[0].notes))
})

Deno.test('a recovered row says what it was corrected from, and that the table is unchanged', () => {
  const built = buildGeneratorsCsv([{
    name: 'Walmart Supercenter', category: 'big_box', brand: 'Wal-Mart', street: '5955 Zebulon Rd',
    city: 'Macon', state: 'GA', zip: '31210', latitude: 32.883, longitude: -83.76, distance_miles: 0.2,
    corrected_from: 'Golf Mart',
  }], [])
  const notes = String(built.rows[0].notes)
  assertEquals(built.rows[0].flag, null)
  assert(notes.includes('corrected from the stored value "Golf Mart"'), notes)
  assert(notes.includes('merchant_location itself is unchanged'), notes)
})
