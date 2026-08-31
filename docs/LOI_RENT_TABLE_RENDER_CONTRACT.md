# LOI Rent-Table Render Contract (end-cap drive-thru)

**Written from the verified spike, not the plan.** The end-cap emission spike
(`supabase/seeds/loi/emit_rent_table.py`) created a computed Powder Springs schedule as an 11×4 Word
table in the real blank template (`templates/LOI_US_7_30_2026.docx`) and diffed **zero differences**
against the worked ECDT deliverable. This document is that contract.

Scope: **end-cap drive-thru (R1 / per-SF) only.** Freestanding (R0 / annual) renders differently
(the worked Freestanding LOI has no rent table) and gets its own contract when that deal type is in
scope. Do not generalize this shape across both.

## Inputs
- Rows come from the OVIS **rent engine** (`rent_engine.py`), which owns the byte-exact rounding
  convention. **The assembler does zero math** — it renders finished rows.
- Terms → rows: `Terms(measurement_basis='per_sqft', base=$/SF, escalation_rate, escalation_period,
  term_length, sqft)`, plus `base_term_years` (the initial term before options; Powder Springs = 10).

## Template skeleton
- `templates/LOI_US_7_30_2026.docx` — confirmed byte-identical to the extraction source
  `LOI US (2).docx` (236 paragraphs, 0 tables, 0 text diffs). Treat as the SAME skeleton version the
  clause library was extracted against, not a new drop.

## Insertion point (table CREATION, not editing — template has 0 tables)
- **Anchor:** the paragraph containing `TIED TO SQUARE FOOTAGE` (the `[{R1} …]` instruction).
- **Replace:** every paragraph strictly between the anchor and the R1 note (the paragraph containing
  `based on Landlord` — "The rent schedule is based on Landlord's estimate…"). That block is the
  tab-delimited R1 header + placeholder rows; it is removed.
- **Insert:** the table immediately after the anchor (`anchor._p.addnext(table._tbl)`).
- The R1 note and `PERCENTAGE RENT:` below it are preserved, with their paragraph styles intact.
- (Assembly-time, out of scope here: selecting R1 also strips the R0/annual tab block above. The
  spike leaves R0 in place — it is not part of the render contract.)

## Table format (matched to worked ECDT)
- **11 rows × 4 columns**, style **"Normal Table"**, `autofit = False`.
- **No borders** (no `w:tblBorders`; the "Normal Table" style is borderless).
- **Column widths (twips): `[2080, 1380, 1500, 1660]`** — set on both `w:tblGrid/w:gridCol` and each
  cell's `w:tcW` (dxa).
- **Fonts inherited** from the Normal paragraph style (no explicit run font); cell paragraph style
  `Normal`.

## Row structure
| row | content |
|-----|---------|
| 0 | header: `Years` \| `Monthly` \| `Yearly` \| `Per Square Foot` |
| 1..k | base-term rows (`end_year <= base_term_years`) |
| k+1 | blank spacer row (all four cells empty) |
| k+2 | label row: `Extension Options:` in col 0, cols 1–3 empty |
| k+3.. | option-period rows (`start_year > base_term_years`) |

## Cell formatting
- Years: `"{start}-{end}"` (e.g. `1-5`).
- Monthly / Yearly / Per Square Foot: `"${x:,.2f}"` (e.g. `$10,545.00`, `$126,540.00`, `$60.00`).

## Verification (all must hold; any difference is a bug, not a cosmetic)
Emitted table vs worked ECDT `LOI US - ECDT (072025).orep.docx` table 0:
- dimensions 11×4 ✓
- every cell text equal (all 8 data rows + header + spacer + label) ✓
- column widths equal ✓
- table style equal ✓
- borders equal (none) ✓
- data-cell font equal (inherited) ✓
- placement: R1 instruction → **table** → R1 note → `PERCENTAGE RENT` ✓
- surrounding paragraph styles unchanged ✓

## Acceptance artifact
`supabase/seeds/loi/fixtures/SPIKE_powder_springs_emitted.docx` — open in Word to confirm visual
alignment. Regenerate with `python3 emit_rent_table.py` from `supabase/seeds/loi/`.
