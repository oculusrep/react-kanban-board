# Body text owed by Mike — CLEARED 2026-09-08

> **STATUS: NOTHING IS OWED.** Tranche 13 (R1) and tranche 14 (LCW0/1/2) both landed, so every item
> below is satisfied. The file is kept as the record of what was owed and why, and because the R0
> section is still live. The next milestone is the ASSEMBLER and WIZARD spec — see
> `docs/LOI_RESUME_HERE.md`.

---

## Original list (all satisfied)

Everything schema-side and assembler-side is settled or built. What remains between here and running
the Powder Springs acceptance test is **body text**, which is Mike's. This is the complete list, with
the template paragraph each comes from and what the extraction has to do to it.

Two tranches. **Tranche 13 (R1) alone unblocks the acceptance test** — Powder Springs is R1 and LCW0,
so strictly both are needed, but R1 is the one with no open questions left.

---

## Tranche 13 — R1 rent (clause `rent`)

R0 is NOT in this tranche. It is registered deferred at position level (`loi_deferred_position`), and
an R0 deal correctly halts until a worked freestanding LOI with a FILLED R0 schedule exists.

### What is NOT body text — do not extract these

- **Paras 51–59, the R1 tab-delimited rows.** These are a placeholder for a computed table. Rows come
  from the rent engine and the assembler renders them per `LOI_RENT_TABLE_RENDER_CONTRACT.md`. There is
  no canonical body here at all.
- **Para 49, the `[{R1} – TO BE USED IF…]` marker.** Instruction. Never emits.
- **Paras 36–47, the whole R0 block.** Deleted when R1 is selected.

### The ONE body owed: para 61, the remeasurement note

Markers stripped per B4 and the standing brace-code rule — the runs already separate as `[{R1}` /
body / `]`:

```
The rent schedule is based on Landlord's estimate of the ground floor area of the Premises, excluding
mezzanine, basement and storage space, if any, and the rent will be adjusted if the actual number of
square feet of the Premises is less than Landlord's estimate.
```

- No params, no blanks, no heading.
- **Emits on every R1 deal** (handbook, both editions).
- Note for the extraction: this is the clause all three worked examples dropped, so there is no fixture
  to diff it against — it is a deliberate expected diff.

### The position shape — my call, flagged so the seed matches

R1 is a position with **one canonical body (the note) plus a table-emission behaviour**. The table is
not a body. If that shape needs a marker in the seed beyond the usual fields, say so and I will add it
rather than have you guess.

---

## Tranche 14 — Landlord Work (clause `landlord_work`)

Three primaries and two add-ons. **Two of the add-on bodies are ALREADY LOADED** as position-less
orphans and need only positions — do not re-extract them:

| already loaded | segment_key | template para |
|---|---|---|
| ✔ | `drive_through_permits` | 114 |
| ✔ | `construction_schedule` | 116 |

### Owed: LCW0 (para 107), LCW1 (paras 109–110), LCW2 (para 112)

All three need, per rules already established:

1. **Heading stripped** — `LANDLORD CONTRIBUTION AND WORK:` and its tab. Headings are template-owned
   (contract B4).
2. **Marker stripped** — `[{LCW0} - IF LANDLORD IS PAYING ALLOWANCE IN ADDITION TO LANDLORD WORK]` and
   its siblings. The `[{LCWn}` marker and the instruction that follows it are both instruction.
3. **Instructions stripped** — `[ATTACH AND COMPLETE EXHIBIT]`, `[INCLUDE ANY OTHER ALLOWANCES]`, and
   for LCW2 `[NOTE: NEVER INCLUDE THE TERM "AS-IS" IN ANY LOI]`.
4. **Every blank keyed** — zero underscore runs survive, in body text OR option values. The standing
   scan is an ERROR on underscores and will reject the tranche otherwise.
5. **Watch the `a`/`an` warning** — the scan flags an article before a token. Legitimate only if every
   possible value starts with the same sound.

### The allowance sentence — the one that needs care

Template LCW0:

> *"…Landlord will also provide Tenant an improvement allowance of $\_\_\_\_ toward the cost of Tenant's
> improvements [plus a restroom allowance of $\_\_\_\_ and a sewer branch line allowance of $\_\_\_\_ as
> described in the attached Landlord Workletter [INCLUDE ANY OTHER ALLOWANCES] ([collectively] the
> "Allowance")…"*

Three separate things in one sentence, all decided:

- **The improvement allowance amount** — an ordinary param. Powder Springs: `$75,000`. The `$` stays
  fixed text outside the token (a value carrying its own currency symbol drifts).
- **The optional extra-allowances phrase** — ONE param whose value OVIS composes, per the agreed
  modelling. Not a repeating group, not a fixed restroom+sewer pair. The individual amounts are tracked
  as economic terms upstream so Phase-2 auditability survives. Powder Springs omits it entirely, so the
  param needs an omit branch — which makes it a `choose_one` with the composed phrase and an `is_omit`
  option.
- **`lcw_allowance_ref`** — the `collectively` grammar dependency, keyed as you specified: `choose_one`
  with two complete options, `"collectively the"` and `"the"`, body reading `({{param:…}} "Allowance")`.
  Powder Springs is the fixture for the one-allowance branch.

### Attachments, not body text

The Landlord Workletter reference is an **attachment obligation** → `position.attachment_requirements[]`,
the mechanism already used for U1's exclusives list and OS0's site plan. LCW0 and LCW1 both carry it.

---

## Not owed, tracked elsewhere

| item | state |
|---|---|
| R0 rent block | deferred at position level; needs a worked freestanding LOI with a filled schedule |
| `P = 0` (no extension options) | open Q4 — table shape edge case, mine to build once you confirm |
| 3-column table widths | falls out of R0; freestanding only |
| Contingency Addendum second skeleton | provenance closed; skeleton build not started |
| `future_construction` letter paragraph | pending; leaves `_unjoined_bodies` when it lands |
