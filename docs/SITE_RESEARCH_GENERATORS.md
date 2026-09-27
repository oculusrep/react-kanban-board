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

## merchant_location data quality — and the guards that handle it

**OVIS already solved this, in July 2026, and site research did not know.** Two guards ship at
ingest time and at map render time:

- `nameMatchesBrand` (`92459b3f`, 2026-07-02) — Places Text Search is over-permissive: a
  "24 Hour Fitness" search returns Anytime Fitness and dance studios, a "Roses" search returned
  **395 florists**, and "Walmart Supercenter" is filed under brand *Golf Mart*.
- `isAncillarySubListing` (`684f513f`, 2026-07-07) — Kroger Pharmacy, Wells Fargo ATM, Lowe's
  Garden Center: sub-services at one storefront, listed by Places as separate places.

**Every row in the table predates both.** Ingestion ran 2026-04 (21,108 rows) and 2026-06 (2,559);
the guards landed in July. Ingest is upsert-only and never deletes, and **no cron re-ingests
locations** — the only merchant cron is `merchant-logo-refresh-daily`, which touches
`merchant_brand` logos alone. Ingestion is manual, from the admin Ingestion tab. So the pre-guard
rows stay until someone cleans them, and every reader has to filter.

The map has been filtering at render all along ([MerchantLayer.tsx:459-461](../src/components/mapping/layers/MerchantLayer.tsx#L459-L461)),
which is why the junk was invisible. The first generators build read the raw table and picked up
all of it: 54% of rows within 5 mi of Macon.

### One definition, three callers

The guards were two hand-synced copies with "KEEP IN SYNC" comments, which is precisely how site
research missed the contract. They now live once, in
[supabase/functions/_shared/merchant-brand-guards.ts](../supabase/functions/_shared/merchant-brand-guards.ts),
imported by ingest, map render and generators. It is dependency-free so Vite and Deno both take it;
`supabase functions deploy` uploads it as a function asset.

### What the guards do at Macon

| | raw | ancillary | mis-branded | after collapse |
|---|---|---|---|---|
| 5 mi of the site | 120 | 22 dropped | 47 dropped | **43 rows, 0 flagged** |

Table-wide: 23,667 rows → 2,003 ancillary, 6,520 mis-branded, **15,144 clean**. Ten-site sample,
junk share: 0 / 17 / 23 / 29 / 29 / 31 / 48%.

### The cost of filtering without re-homing

A mis-filed row is dropped, not corrected, so **a real store whose only row is mis-branded
disappears from the export**. At Macon that costs 16 stores, including Walmart Supercenter (filed
under Golf Mart), Publix Super Market at Bass Plantation (under Kroger), PetSmart (under Petco),
Planet Fitness and Onelife Fitness (under 24 Hour Fitness), and Walgreens (under CVS). The Walmart
row that survives is "Walmart Money Center", because that one happens to be filed correctly.

Re-homing those rows to the brand their name actually matches is the fix, and it is **deliberately
not done here**: it would make ~1,069 currently-hidden locations appear as pins on the merchant
map, which is a map change, not a site-research one. Scheduled separately.

A strict matcher is required for it — the location name must *start with* the brand (normalized,
≥5 chars, longest match wins). A loose substring match looks like it recovers 2,536 rows but
produces false re-homes: "American Eagle" → American Freight, "Batteries Plus" → AT&T, "DSW
Designer Shoe Warehouse" → Shoe Carnival. The strict rule recovers **1,069**, and the remaining
5,787 match no brand at all — those are the florists, and dropping them is correct.

### Sub-entity collapse

Kept alongside the guards for what the token list misses: "Walmart Supercenter" against "Walmart
Business Center", where neither word is an ancillary token. Rows at the same street address merge
when their names share a leading word, or when both genuinely match a shared brand. Within a group
the representative is the name closest to the brand, and a name that *looks* ancillary once its
spaces are removed ("Lowe's ProServices") ranks last — a ranking rule only, local to generators,
because widening the shared token list would change which pins the map draws.

## Code

- `supabase/functions/_shared/site-research/generators.ts` — `merchantGenerators` (bounded by a
  lat/lng box and paginated: the mapped categories hold ~7,700 rows statewide),
  `collapseSubEntities`, `nameMatchesBrand`, `RECORD_GENERATOR_TOOL`, `recordGenerator`,
  `fetchDriveBands`, `buildGeneratorsCsv`
- `supabase/functions/_shared/csv.ts` — `GENERATORS_COLUMNS`, `buildGeneratorRow`, `generatorSort`,
  `generatorCallout` ("Eastside Baptist (1,249 seats)")
- `supabase/migrations/20260927092248_site_drive_time_bands.sql`
- `supabase/functions/_shared/site-research/generators_test.ts`
