# Mis-attributed merchant locations — reassignment proposal

**Status:** ALL THREE PHASES DONE 2026-09-30. Phase 1 `20260930084718`, Phase 2 `20260930092623` (+ `20260930093808`), Phase 3 in `merchantIngestService.ts`.
**Date:** 2026-09-30
**Context:** [MERCHANTS_CONTEXT.md](MERCHANTS_CONTEXT.md) · surfaced by the Piggly Wiggly Georgia run on 2026-09-29

---

## 1. The problem

`upsertMerchantLocation` looks up an existing row by **`google_place_id` alone**, ignoring `brand_id`, and its `UPDATE` never sets `brand_id`. Combined with Google's over-permissive text search — and with the name-match filter not existing until 2026-07-02 — the April/June Georgia ingestion filed thousands of locations under the wrong brand, and no later run can correct them: the place_id is already taken, so the correct brand's ingest silently *updates the wrong row* instead of inserting its own.

Discovered when Piggly Wiggly's first Georgia run reported "32 kept" but only inserted 20 rows. The other 12 were Piggly Wiggly stores sitting under Kroger, Roses, IGA, Whole Foods, Sprouts and Maple Street.

## 2. Scope

Of 25,000 eligible rows (excluding the 12 soft-deleted and the 7 hand-verified):

| | Rows |
|---|---:|
| Current brand name-matches — healthy | 18,150 |
| **Current brand does NOT match** | **6,850** |

Those 6,850 are invisible on the map today; the render-time filter rejects them.

## 3. The rule as specified is unsafe — do not apply it

Mike's rule: *reassign when exactly one active brand name-matches and the current brand does not.* Implemented literally against the shipped `nameMatchesBrand`, it proposes **2,211 reassignments** — and many are confidently wrong.

`nameMatchesBrand` matches on the full name **or** on a "brand minus last word" stem. That stem rule is safe for its designed job — *verifying* a brand you already know — but as a search key across 403 candidates every short stem becomes a wildcard:

| Brand | Stem | Swallows |
|---|---|---|
| Fitness 19 | `fitness` | every gym in the cache |
| Food Lion | `food` | Whole Foods, Flash Foods, … |
| Home Depot | `home` | every homeware store |
| Family Dollar | `family` | anything "Family" |

That produced garbage like `24 Hour Fitness → Fitness 19` (61 rows, actually Planet Fitness and LA Fitness) and `Whole Foods → Food Lion` (61 rows).

**Fix: for inference, match on the full normalized name only, minimum 5 characters — never the stem.** Keep the shipped rule (full OR stem) for deciding whether the *current* brand is wrong, so we only touch rows the live filter already hides.

## 4. Dry run under the tightened rule

| | Rows |
|---|---:|
| Mismatched (in scope) | 6,850 |
| **Reassign — exactly one candidate** | **1,291** |
| Ambiguous — 2+ candidates, left alone | 4 |
| No candidate brand — left alone | 5,555 |

604 distinct old→new pairs collapse to 51 pairs with 5+ rows. The ambiguous list is tiny and entirely sensible:

| Places name | Current brand | Candidates |
|---|---|---|
| Target Mobile | Golf Mart | T-Mobile \| Target |
| Boost Mobile | AT&T | Boost Mobile \| T-Mobile |
| T-Mobile at Costco | AT&T | Costco \| T-Mobile |

## 5. One systematic error remains, and it is the largest block

The biggest pair is **MetroPCS → T-Mobile, 193 rows**. Look at what those rows are actually called:

| Places name | Rows |
|---|---:|
| Metro by T-Mobile | 189 |
| T-Mobile | 2 |
| T-Mobile Authorized Retailer | 1 |
| T-Mobile Experience Store | 1 |

**"Metro by T-Mobile" is the rebranded MetroPCS.** Those 189 rows are filed under exactly the right brand already — they fail the name check only because the brand row still says "MetroPCS". Reassigning them to T-Mobile would take 189 correctly-filed stores and misfile them.

This is a general failure mode: **a brand whose real-world Places name embeds another brand's name.** Apple Store is the same shape — its real locations are "Apple Lenox Square", "Apple Perimeter", "Apple Mall of Georgia", none containing "applestore".

The designed mechanism for this already exists and rewrites no data: **`places_display_name`**.

## 6. Recommended sequencing

**Phase 1 — `places_display_name` pre-pass (no row rewrites, fully reversible).**
Set the override on brands whose Places name differs from the brand row, then re-measure. Known candidates: MetroPCS → `Metro by T-Mobile`, Apple Store → `Apple`, Truist Bank → `Truist`, Dunkin' Donuts → `Dunkin`, Verizon Wireless → `Verizon`, Mavis Discount Tire → `Mavis`. This alone recovers ~189 MetroPCS rows **correctly** and shrinks the reassignment set before anything is rewritten.

**Phase 2 — reassignment**, re-run after Phase 1, on whatever remains.

**Phase 3 — fix `upsertMerchantLocation`** so this cannot re-accumulate.

## 7. Audit table (Phase 2)

```sql
CREATE TABLE public.merchant_location_brand_reassignment (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id     uuid NOT NULL REFERENCES public.merchant_location(id) ON DELETE CASCADE,
  old_brand_id    uuid NOT NULL REFERENCES public.merchant_brand(id),
  new_brand_id    uuid NOT NULL REFERENCES public.merchant_brand(id),
  places_name     text NOT NULL,   -- snapshot: the name the decision was made on
  reason          text NOT NULL,
  reassigned_at   timestamptz NOT NULL DEFAULT now(),
  reassigned_by   uuid REFERENCES public."user"(id)
);
```

Reversal is then a single statement:

```sql
UPDATE merchant_location l SET brand_id = r.old_brand_id
FROM merchant_location_brand_reassignment r
WHERE r.location_id = l.id AND r.reassigned_at = '<batch timestamp>';
```

Plus the standard grants block (`REVOKE ALL … FROM anon, authenticated`, `GRANT SELECT` to authenticated, full to service_role) per CLAUDE.md.

## 8. The forward fix (Phase 3)

In `upsertMerchantLocation`, the lookup stays keyed on `google_place_id` — it must, it is the unique key — but the update learns to re-point ownership:

> When an incoming result name-matches the **searching** brand and the **incumbent** brand does not, set `brand_id` to the searching brand and write an audit row. Otherwise leave `brand_id` untouched.

That lets a correct-brand search reclaim a mis-filed row, and makes the "32 kept / 20 inserted" discrepancy impossible. `verified_*` columns stay untouched, as always.

## 9. T-Mobile, before and after

| | Total rows | Visible today |
|---|---:|---:|
| T-Mobile | 144 | **137** |
| MetroPCS | 201 | **7** |

Under the naive tightened rule T-Mobile would gain 204 → but 189 of those belong to MetroPCS.

Under the recommended sequencing:

| | Visible before | Visible after |
|---|---:|---:|
| T-Mobile | 137 | ~152 (+15 genuine T-Mobile rows) |
| MetroPCS | 7 | ~196 (+189, via `places_display_name`, no rows rewritten) |

Same locations recovered, correct brands, and the large half of it costs no data mutation at all.

## 10. Reproducing the dry run

Both scripts are read-only and end in `ROLLBACK`; they live in the session scratchpad, not the repo. The v2 logic is the one to keep — see §3 for why v1's stem matching must not be used for inference.


---

# Appendix — Phase 1 applied, and the Phase 2 re-run

## Phase 1 result (migration `20260930084718`)

| Brand | Override | Visible before | Visible after |
|---|---|---:|---:|
| Mavis Discount Tire | `Mavis` | 0 | **94** |
| MetroPCS | `Metro by T-Mobile` | 7 | **189** |
| Apple Store | `Apple` | 16 | 16 |
| Dunkin' Donuts | `Dunkin` | 267 | 267 |
| Truist Bank | `Truist` | 145 | 145 |
| Verizon Wireless | `Verizon` | 134 | 134 |

**+276 rows visible, no reassignment.** Four of the six were no-ops: the "brand minus last word" stem rule that shipped 2026-07-02 already covered them, so the July candidate list was stale. They are recorded anyway to make the intended name explicit.

**Known cost:** MetroPCS *loses* 7 rows signed "Metro Pcs" / "MetroPCS Authorized Dealer", because an override is single-valued and the brand is mid-rebrand. Net +182. Using `Metro` instead captures all 196 with no loss, at the cost of making `metro` a 5-character magnet during reassignment. One-line change if wanted.

## The matching rule needed two more fixes

Phase 2's dry run was re-run post-pre-pass. MetroPCS → T-Mobile disappeared from the plan, as intended. Two further defects surfaced, both in how the candidate brand is matched:

**1. Substring matching is not word matching.** v2 matched normalized substrings, so `Del Taco` (`deltaco`) claimed **"Delta Community Credit Union"**, and `Apple` claimed **"Onelife Fitness - Crabapple"** and **"Pineapple Park"**. Requires a word-boundary anchor.

**2. Punctuation differs in both directions.** A boundary regex built by tokenising the brand on its own punctuation breaks asymmetrically — brand `Wendy's` vs place `Wendys`, and brand `Ollies` / `TJ Maxx` vs place `Ollie's` / `T.J. Maxx`. Tokenising on whitespace dropped 44 legitimate Wendy's rows.

**Final rule:** strip the brand name to alphanumerics, allow `[^a-zA-Z0-9]*` between **every character**, and anchor the whole thing with `\y … \y`. That keeps `Wendy's`, `Ollie's`, `T.J. Maxx`, `Scooter's`, `Freddy's`, `Sam's Club`, and rejects `Crabapple`, `Delta Community`, `Jackson`, `Marlowe's`, `Ingleside`, `Pineapple`, `Target Mobile`, `ACF-Ground-1`.

## Phase 2 plan as it now stands

| | Rows |
|---|---:|
| Mismatched, in scope | 6,575 |
| **Reassign — one candidate** | **1,132** |
| Ambiguous — leave alone | 4 |
| No candidate — leave alone | 5,439 |

All 27 pairs the boundary rule removed were verified false positives. The 4 ambiguous rows are all T-Mobile-family and stay put per Mike's instruction:

| Places name | Current brand | Candidates |
|---|---|---|
| Metro by T-Mobile | AT&T (×2), Boost Mobile (×1) | MetroPCS \| T-Mobile |
| T-Mobile at Costco | AT&T | Costco \| T-Mobile |

No further Metro-style rebrand cases remain. A concentration test (old brands losing rows, scored by destinations ÷ rows) shows every remaining high-volume donor scattering across many destination brands and many distinct place names — the signature of Places garbage, not of a rebrand. `Jacks` sheds 156 rows across 16 destinations; `Golf Mart` 123 across 14; `24 Hour Fitness` 115 across 13. All three are brands with little or no Georgia presence whose searches returned other chains.


---

# Appendix 2 — Phase 2 and Phase 3 applied

## Phase 2 (migration `20260930092623`)

**1,132 rows reassigned.** Verified in the same transaction before applying: 0 verified-or-excluded rows touched, and the 4 ambiguous T-Mobile-family rows still on AT&T / Boost Mobile.

Top 10 receiving brands, visible rows before → after:

| Brand | Rows received | Visible before | Visible after |
|---|---:|---:|---:|
| Wal-Mart | 187 | 145 | **316** |
| Wendy's | 57 | 167 | 224 |
| Walgreens | 55 | 163 | 216 |
| McDonald's | 54 | 287 | 341 |
| Zaxby's | 41 | 159 | 200 |
| Planet Fitness | 38 | 3 | **41** |
| Publix | 36 | 160 | 196 |
| Target | 31 | 80 | 111 |
| Anytime Fitness | 30 | 17 | **47** |
| Mavis Discount Tire | 30 | 94 | 124 |

Gains exceed rows received where a reclaimed row also stopped being filtered for another reason. Planet Fitness (3 → 41) and Anytime Fitness (17 → 47) were the most broken: almost every Georgia location of both was filed under 24 Hour Fitness, a brand with no Georgia presence.

Reversal, if ever needed:

```sql
UPDATE merchant_location l SET brand_id = r.old_brand_id
FROM merchant_location_brand_reassignment r
WHERE r.location_id = l.id AND r.reason LIKE 'bulk-2026-09-30:%';
```

## Phase 3 — the forward fix

`upsertMerchantLocation` still keys on `google_place_id` (it must — it is the unique column), but the update now reclaims ownership under the same rule: **if the incoming result name-matches the searching brand and the incumbent brand does NOT match the name it is already holding, the row moves and an audit row is written.** Ambiguity resolves in favour of leaving things alone.

Migration `20260930093808` adds the INSERT grant and an admin policy, because ingestion runs in the browser as an authenticated admin while the bulk pass ran as `postgres`. Without it every reclaim would have moved a row with no audit trail — the one outcome the audit table exists to prevent.

`IngestBrandResult.reclaimedLocations` and `IngestAllProgress.totalReclaimed` surface the count in the admin tab.
