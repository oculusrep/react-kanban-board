# ESRI vs Sites USA — Demographic Source Comparison

**Date:** 2026-05-28
**Test property:** "Cori Cianci Pad - SBUX", 442/452 Gainesville Highway, Winder, GA 30680
**Property ID:** `ec3bdae5-0604-4d59-bc87-2c4c391dfb01`
**Point compared (identical for both sources):** `34.01162699166867, -83.70766849322969` (ESRI's stored geocode)
**ESRI enrichment date:** 2026-04-24 · **ESRI vintage:** 2025 estimates (Tapestry 2024)

## Purpose

Mike observed that a Sites USA "quick demo" returned demographics noticeably different from OVIS's stored ESRI enrichment for the same property, and wanted to know whether the gap is a data error, a methodology difference, or an apples-to-oranges comparison — before deciding which source to trust per metric.

## Headline conclusions

1. **Income: a real ~⅓ disagreement, not a labeling artifact.** Sites runs **+32% (average) to +40% (median, 1 mi)** higher than ESRI, and **+25% even at 3 miles** where geography is controlled. An initial "Sites median is really a mean" hypothesis was **refuted** (see below).
2. **1-mile population diverges ~39%** (ESRI 3,960 vs Sites 5,499) due to **small-ring apportionment** — the two converge to within 2% at 3 miles.
3. **Employees diverge ~2.3×** at 1 mile (ESRI 1,571 vs Sites 675) — a genuine difference, likely different business-establishment source databases.
4. **Geocoding and vintage are ruled out** as causes (same exact lat/long; income can't move this much on a 1-year vintage gap).
5. **Practical rule:** use the **3-mile ring** for any cross-vendor sanity check (trust converges there); tight rings diverge most. **Pick one vendor per metric and stay consistent.** The Starbucks analog finder is ESRI-only — keep it that way so z-scores stay coherent.

## Side-by-side (same point both sources)

| Metric | Geo | ESRI | Sites USA | Gap |
|---|---|---|---|---|
| Population | 1 mi | 3,960 | 5,499 | Sites +39% |
| | 3 mi | 25,801 | 26,331 | +2% (≈match) |
| | 10 min | 34,483 | 30,310 | ESRI +14% |
| Median Age | 1 mi | 42.3 | 39.5 | ESRI +2.8 yr |
| | 3 mi | 38.2 | 36.4 | ESRI +1.8 yr |
| | 10 min | 38.1 | 36.5 | ESRI +1.6 yr |
| Median HH Income | 1 mi | $56,307 | $78,758 | Sites +40% |
| | 3 mi | $58,860 | $73,489 | Sites +25% |
| | 10 min | $63,639 | $76,909 | Sites +21% |
| Total Employees | 1 mi | 1,571 | 675 | ESRI +133% |
| | 3 mi | 9,596 | 7,522 | ESRI +28% |
| | 10 min | 11,227 | 8,188 | ESRI +37% |

**Not comparable:** Sites' *5-min drive* (ESRI stores a 5-*mile ring*, not a 5-min drive); *Education %* (no education column on the `property` table — that metric exists only on the Starbucks enrichment path, and on a 25+ base vs Sites' 13+ base).

## The income investigation (and a corrected hypothesis)

ESRI exposes both statistics for the 1-mile ring in `esri_enrichment_data`:
- `MEDHINC_CY` (2025 Median Household Income) = **$56,307**
- `AVGHINC_CY` (2025 Average Household Income) = **$75,906**

**Initial (wrong) hypothesis:** Sites' "Median HH Income" ($78,758) sat within ~4% of ESRI's *average*, suggesting Sites had mislabeled a mean as a median.

**Decisive test:** pull Sites' *Average* HH Income for the same point → **$100,279**.

**Result — hypothesis refuted.** Sites' average ($100,279) sits 27% above its own median ($78,758) — a normal right-skewed spread — so Sites' "median" is a **genuine median**. Comparing like-for-like:

| Statistic (1 mi) | ESRI | Sites | Sites vs ESRI |
|---|---|---|---|
| Median HH Income | $56,307 | $78,758 | +40% |
| Average HH Income | $75,906 | $100,279 | +32% |

The earlier alignment between Sites' median and ESRI's average was a **coincidence**. The income divergence is real on both statistics.

**Causes ruled out:**
- **Labeling** — both confirmed true medians/means.
- **Vintage** — ESRI is 2025 estimates; income doesn't move ~⅓ in a year.
- **Geography** — at 3 miles, where both capture the same population within 2%, Sites' median is still +25%. Same people, different income figure.

**Remaining cause:** different income models / source data between the two vendors. Not pinned down — would require Sites' methodology documentation.

## The 1-mile population gap (small-ring apportionment)

ESRI per-ring data from `esri_enrichment_data`:

| Ring | ESRI Total Pop | ESRI Total HH | apportionmentConfidence | aggregationMethod |
|---|---|---|---|---|
| 1 mi | 3,960 | 1,632 | 2.576 | BlockApportionment:US.BlockGroups;PointsLayer:US.BlockPoints |
| 3 mi | 25,801 | 9,335 | 2.576 | (same) |
| 5 mi | 44,259 | 15,522 | 2.576 | (same) |

`apportionmentConfidence` is **constant across rings** (2.576) — it's a dataset/area-level value, **not** a per-ring quality flag, so it cannot be used to argue the 1-mile ring is "less reliable."

ESRI allocates Census **block-group** population to the ring via **block points** (population-weighted centroids). Mechanism behind the divergence:
- A 1-mile circle (~3.1 sq mi) slices through only a few block groups, so the count is dominated by **how the ring boundary cuts them** — whether each block's population point lands just inside or outside the line.
- A 3-mile circle contains many *whole* block groups, so boundary edge effects become a small fraction of the total and wash out → vendors converge.

Sites pulls ~1,540 more people into the same 1-mile circle, most likely a peripheral subdivision whose population ESRI's block points place just *outside* the ring. This also **widens the 1-mile income gap** (40%) relative to the clean, population-matched 3-mile gap (25%) — at 1 mile the two sources are describing partly different sets of people.

## Recommendations

- **Cross-vendor comparisons:** use the **3-mile ring** (or larger). Tight rings (1 mile) can swing ~40% on apportionment alone.
- **Per-metric source choice:**
  - *Income* — the two genuinely disagree by ~⅓; decide which vendor's model you trust for the markets you work, and document the choice.
  - *Employees* — treat as a separate real divergence (different business database).
  - *Population/age* — reliable at 3 mi+, diverges at 1 mi.
- **Never mix sources within one analysis.** The Starbucks analog finder standardizes (z-scores) over ESRI metrics; injecting a Sites figure would read the inter-vendor gap as a real demographic difference and corrupt the match.
- When comparing an OVIS ESRI value to a Sites figure, compare **like statistics** (median↔median, average↔average) and **like geographies** (ring↔ring, drive↔drive).

## Data provenance

- ESRI values: `property` table columns (`pop_*`, `hh_income_median_*`, `hh_income_avg_*`, `employees_*`, `median_age_*`, `daytime_pop_*`) and the raw `esri_enrichment_data` JSONB, via the `esri-geoenrich` edge function.
- Sites USA values: manual "quick demo" run by Mike at the point above (1 mi / 3 mi rings, 5 min / 10 min drive times).
