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

| | scanned | ancillary | unrecoverable | recovered | final |
|---|---|---|---|---|---|
| 5 mi of the site | 346 (all categories) | 36 dropped | 102 dropped | 12 | **50 rows, 0 flagged** |

Recovered at Macon: Walmart Supercenter (was Golf Mart), Publix at Bass Plantation (was Kroger),
Publix at Tobesofkee Crossing and The Fresh Market (both Maple Street), PetSmart (Petco), Planet
Fitness and Onelife Fitness (24 Hour Fitness), Walgreens (CVS), Barnes & Noble (Starbucks), Rooms
To Go (Mattress King). Two more were absorbed by the sub-entity collapse — Walmart Business Center
and Walmart Money Center now fold into the Supercenter row.

Table-wide: 23,667 rows → 2,003 ancillary, 6,520 mis-branded, **15,144 clean**. Ten-site sample,
junk share: 0 / 17 / 23 / 29 / 29 / 31 / 48%.

### Read-side recovery: the export corrects, the table does not change

Guards alone drop a mis-filed row rather than correcting it, so **a real store whose only row is
mis-branded disappears**. At Macon that cost 16 stores including the Walmart Supercenter at 5955
Zebulon Rd — the anchor next door to the site. A generators file missing the Walmart next door is
the failure this whole feature exists to avoid: an absence that means "we cannot see it", read as
"nothing is there".

So `merchantGenerators` recovers the brand **from the location's own name, for the export only**:

- The name must **start with** the brand, normalized, **5+ characters**, **longest match wins**.
- The recovered brand supplies the category, because the stored one came from the wrong brand.
- The row's note says what it was corrected from: *brand corrected from the stored value "Golf
  Mart" by matching the location name; merchant_location itself is unchanged*.
- A name matching **no** brand is not recovered — the florists stay gone.
- Two brands tied at the longest match in **different categories**: category left **blank** and the
  row flagged **CHECK**, with both candidates named. Never guessed.
- **Nothing is written back.** `brand_id` is untouched, so the merchant map is unaffected.

The strictness is the point. A loose "contains" match appears to recover 2,536 rows but invents
brands: "American Eagle" → American Freight, "Batteries Plus" → AT&T, "DSW Designer Shoe
Warehouse" → Shoe Carnival. The prefix rule refuses all three.

Because the stored category is unreliable, the query no longer filters by category server-side —
the Walmart filed under Golf Mart would have been excluded before it could be recovered. The
lat/lng box keeps it cheap: 346 rows at Macon across every category, plus one 401-row brand
catalogue read per run.

### Still open: re-homing the table itself (B)

Read-side recovery fixes the export, not the data. Writing the corrections back to
`merchant_location.brand_id` would make **~1,069** currently-hidden locations appear as pins on the
merchant map — a map change, scheduled on its own. The strict rule above is the one to use when it
happens. The other 5,787 mismatched rows match no brand and should be deleted, not re-homed.

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
