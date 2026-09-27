# Site Story — traffic generators (generators.csv)

Schools and employers were never the whole story. At the East Cobb site a 125,000 SF church with
1,249 seats sits at the subject corner; a deep pass that reports only schools and offices misses
the argument. `generators.csv` is the third category, built in two halves that cost very
differently.

## The two halves

| Half | Categories | Source | Searches |
|---|---|---|---|
| Deterministic | grocery, big_box, home_improvement, drug, fitness, destination_retail | `merchant_location` joined to `merchant_brand` / `merchant_category` | 0 |
| Researched | church, hospital_medical, civic, hotel | model finds it, a web search sizes it, `record_generator` records it | ~6 |

The deterministic half is written whether or not the model mentions it — same guarantee as Atlas
coffee in `competitors.csv`. The export never depends on a tool having been called.

The search budget moved 30 → 36 for the researched half (`DEEP_PASS_SEARCH_BUDGET`).

## Columns

`flag, name, category, size_value, size_unit, street, city, state, zip, lat, lng, distance_mi,
drive_time_band, source, notes`

`size_unit` is one of `seats, beds, rooms, sf, headcount` — each generator in its own unit. A church
in seats, a hospital in beds, a hotel in rooms. **Sizes are never estimated and never converted**:
`record_generator` rejects a size without a unit, and a blank `size_value` is exported as blank.
An unsized generator is still exported and still mapped; it just cannot be a callout, and the tool
tells the model so in its result.

`drive_time_band` (`5min` / `10min`) comes from `site_drive_time_bands`, which selects the cached
isochrone exactly as `site_pipeline_matrix` does — nearest pull first, then newest, within 50 m —
so generators and `pipeline.csv` agree about what "10 minutes" means at this site.

Conventions are the same as the other exports: CRLF, formula-injection guard, blanks mean unknown,
CHECK rows sorted to the top, **nothing filtered**.

## Daypart

Every row carries its daypart in `notes`, marked `Sourced` or `INFERRED`:

- **Sourced** when the model passed `daypart` with `daypart_sourced: true` — service times, a shift
  pattern, opening hours.
- **INFERRED** otherwise, from the category: a church is weekend, a hospital 24hr with shift
  changes, a courthouse weekday business hours, a gym early AM and evening.

The daypart is the point. A generator whose peak misses the morning daypart is a weaker Starbucks
argument than its size suggests.

## What flag=CHECK means here

Not "missing size" for retail — Places carries no size for any store, so flagging all of them would
make the column noise. A generator row is CHECK when:

1. a **researched** generator has no sourced size, or
2. it could not be placed on the map (no geocode), or
3. its Places **name does not match its brand**.

## merchant_location data quality — read this before trusting a category

Two defects, both handled, neither fixed at source:

**Sub-entities.** One store yields several Places rows: `Kroger`, `Kroger Bakery`, `Kroger Deli`,
`Kroger Pharmacy`, `Kroger Fuel Center` at 220 Tom Hill Sr Blvd; six rows for one Home Depot.
`collapseSubEntities` merges rows at the same street address whose names share a leading word, or
whose names both genuinely match a shared brand. The collapsed names are kept in `notes`. At Macon
this took 120 rows to 87.

**Mis-branded rows.** `brand` comes from the Places *search query*, so a "Macy's" search at a mall
returned Claire's, Talbots and American Eagle; a "24 Hour Fitness" search returned Planet Fitness;
"Walmart Supercenter" is filed under brand *Golf Mart* and "Mike's Food Mart" under *Apple Store*.
**31% of all 23,667 `merchant_location` rows have a name that does not match their brand** (54% of
the generator-category rows within 5 mi of Macon).

This matters beyond the name: **the category is derived from the brand**, so a mis-branded row has
an unreliable category too. Those rows stay in the export — filtering is the mapping step's call —
flagged CHECK with a note saying both are unverified, and deep_pass v11 forbids citing a flagged
retail row as fact without verifying it.

Fixing this properly means classifying on the location name rather than the brand, which is a
separate piece of work on `merchant_location` itself, not on site research.

## Code

- `supabase/functions/_shared/site-research/generators.ts` — `merchantGenerators` (bounded by a
  lat/lng box and paginated: the mapped categories hold ~7,700 rows statewide),
  `collapseSubEntities`, `nameMatchesBrand`, `RECORD_GENERATOR_TOOL`, `recordGenerator`,
  `fetchDriveBands`, `buildGeneratorsCsv`
- `supabase/functions/_shared/csv.ts` — `GENERATORS_COLUMNS`, `buildGeneratorRow`, `generatorSort`,
  `generatorCallout` ("Eastside Baptist (1,249 seats)")
- `supabase/migrations/20260927092248_site_drive_time_bands.sql`
- `supabase/functions/_shared/site-research/generators_test.ts`
