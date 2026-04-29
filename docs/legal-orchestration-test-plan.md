# Legal Orchestration V1 — Test Plan

**Goal:** Exercise the full V1 pipeline end-to-end against a real Starbucks LOI, surface any issues with matching / reasoning / rendering, and decide what to tune before moving to V2 polish.

**Estimated time:** 45–60 minutes for a thorough first run. Subsequent runs are 10 minutes.

**What you need:**
- A clean, recent Starbucks LOI from a real deal (counterparty redline preferred, but the master template will work for a smoke test).
- An OVIS deal record where `client_id = Starbucks`. If you don't have one, create a throwaway test deal first.
- The OVIS dev server running locally OR access to whichever environment the `feat/legal-orchestration-v1` branch is deployed to.
- Word (or Word Online) to inspect the output `.docx`.

---

## Section 0 — Pre-flight (5 min)

Confirm the basics before touching the pipeline.

**0.1 Branch + secrets**

```bash
git checkout feat/legal-orchestration-v1
git pull
```

In the Supabase dashboard for project `rqbvcvwbziilnycqtmnc`, go to **Edge Functions → Secrets** and confirm `ANTHROPIC_API_KEY` is set. Without it, `legal-decide-positions` and `legal-ingest-handbook` will return 500 with `ANTHROPIC_API_KEY env var is not set`.

**0.2 Dev server**

```bash
npm install        # only if there are uncommitted package.json changes
npm run dev
```

Open the printed `http://localhost:5173` URL and log in as your normal coach user.

**0.3 Reach the test page**

Navigate manually to **`/legal/test`** (no nav link yet — that's intentional; the proper Legal nav is Week 5–6).

You should see:
- "Legal Orchestration — Test Driver" header
- A "Step 1 — Pick a deal" dropdown that, when opened, lists Starbucks deals
- Steps 2 / 3 / 4 stubs and an Activity log

If the dropdown is empty or you see auth errors, you're either logged out or the deal table query failed. Hard-refresh once; check the browser console.

**0.4 Sanity-check the database**

In Supabase Studio (Table Editor), confirm:

| Table | Should contain |
|---|---|
| `clause_type` | 35 rows |
| `legal_playbook` | ≥10 rows for `client_id = 39933b5b-3e8c-438d-be2f-e48cd9228c00` |
| `legal_playbook_position` | ~28 rows tied to those playbook entries |
| `legal_loi_session` | empty (or has prior test runs) |
| `legal_loi_round` | empty (or has prior test runs) |
| `legal_loi_decision` | empty (or has prior test runs) |

Quick SQL check (Supabase SQL Editor):

```sql
SELECT
  (SELECT count(*) FROM clause_type)                   AS clause_types,
  (SELECT count(*) FROM legal_playbook
     WHERE client_id = '39933b5b-3e8c-438d-be2f-e48cd9228c00') AS sbux_playbook_entries,
  (SELECT count(*) FROM legal_playbook_position)       AS positions,
  (SELECT count(*) FROM legal_loi_session)             AS sessions,
  (SELECT count(*) FROM legal_loi_round)               AS rounds,
  (SELECT count(*) FROM legal_loi_decision)            AS decisions;
```

Expect: 35 / 10 / 28 / X / X / X (X = whatever prior test runs have left).

---

## Section 1 — Happy path (20 min)

The canonical end-to-end test. Use a real landlord redline if you have one; if not, the Starbucks master template at `Screen Shots/8.18.25 SDRC and Mike P Edits - Starbucks Letter of Intent - MASTER.docx` works as a stand-in (it already has tracked changes from "Palmer Bayless" so the parser sees real `<w:ins>` / `<w:del>` markers).

### 1.1 Pick a deal + upload

1. On `/legal/test`, select a deal from **Step 1** dropdown. Either pick a real one or use a throwaway test deal.
2. In **Step 2**, click **Choose file** and select your `.docx`. The filename + size should appear below the input.
3. Click **Upload + Ingest**.
4. Watch the Activity log on the left. You should see:
   - `Creating legal_loi_session…` (only on first run for this deal)
   - `Uploading to assets/legal/<deal>/<session>/…`
   - `attachment row <uuid> created.`
   - `Invoking legal-ingest-loi…`
   - `Ingest complete: {…}` with a `round_id`, `clauses_identified`, `matched_count`

**Expected counts** (using the master LOI):
- `clauses_identified`: ~58 (the master has multiple variants per clause; a real landlord redline will be ~25–35)
- `matched_count`: at least 8–12 of the 10 seeded playbook entries should match

If `matched_count` is much lower than `clauses_identified`, the matcher is missing things — note which clauses didn't match by querying the database (Section 4).

### 1.2 Run the reasoning layer

1. The "Active round" dropdown in **Step 3** auto-selects the round that just got created. Confirm it shows `Round 0 — inbound` (or `Round N — inbound` for repeat runs).
2. Click **Run Decide Positions**.
3. The Activity log should show `Invoking legal-decide-positions for round <uuid>…`.
4. **This is the slow step** — Claude is processing every matched clause. Expect 30–90 seconds. Don't refresh.
5. When complete, the right-hand "Decisions" panel should populate with grouped status sections: 🚨 Escalated / ⚠️ Needs Review / ✓ Auto-Applied / ⏸ Silent Acceptances.

**What "good output" looks like:**
- Each decision has a clause name, position rank (P1/P2/P3), confidence (0.0–1.0), and a model badge (`sonnet-4-6` or `opus-4-7`)
- Rationales reference both the landlord's text and the playbook's positions
- HIGH-stakes clauses (Use, Exclusive Use, Term, Rent, Rent Commencement, Continuous Operations, Early Termination, Co-Tenancy, Landlord Work, Percentage Rent) should mostly be `Opus` — that's the escalation rule firing
- MEDIUM/LOW clauses should mostly be `Sonnet`
- Most picks should be P1 (the playbook's preferred position) on a master template; a real redline will see more P2/P3 picks

**Smell tests:**
- Any decision with confidence < 0.3 deserves a hard look — the AI was unsure
- Any decision in 🚨 Escalated needs a manual review (`is_floor` position picked, no playbook entry, or AI returned an out-of-taxonomy answer)
- If 🚨 Escalated has more entries than ⚠️ Needs Review + ✓ Auto-Applied combined, something's wrong with the playbook or the matcher

### 1.3 Generate the counter-redline

1. In **Step 4**, click **Generate Counter-Redline**.
2. Activity log: `Invoking legal-generate-counter for round <uuid>…` → `Counter-redline generated: {…}`.
3. A **⬇ Download Round N counter.docx** link appears below the button. Click it.
4. Open the downloaded `.docx` in Word.

**What you should see in Word:**
- Original landlord redline intact (Palmer Bayless's tracked changes still visible if you used the master template)
- Bold marker text `[OVIS Counter — Position 1 — <Clause Name>]` followed by your preferred clause text, shown as **inserted** by `OVIS Tenant Counter` (review pane > tracked changes)
- Word comments on the heading paragraphs, anchored to the clause names, with rationale text like `[USE] Maximum flexibility for product innovation and assignment…`
- Tracked-change author panel shows both `Palmer Bayless` and `OVIS Tenant Counter`

**V1 limitation reminder:** the inserted paragraphs are **appended** to the existing clause body, not replacing it. The clause body still contains the landlord's text. To finalize for sending: in Word, manually accept the inserted paragraph and reject the landlord's lines (or vice versa), then save.

### 1.4 Round-trip sanity

1. Re-load `/legal/test` (don't navigate away — just refresh).
2. Pick the same deal again.
3. The "Active round" dropdown should now show **two** rounds: `Round 0 — inbound` and `Round 1 — outbound`.
4. Optional: upload the counter-redline you just downloaded as if it were a "new landlord response" (closing the loop) — `Upload + Ingest` again. This time, with a `prior_round_id` available, the silent-acceptance detector runs.

---

## Section 2 — Quality review (15 min)

Open the OVIS Storage browser and the Supabase SQL Editor side by side. For each of these clauses (assuming they were in your test doc), check the AI's decision quality:

| Clause | What to verify |
|---|---|
| **Term** | AI should pick P1 (10 + 4×5 with 90-day notice) unless landlord proposed something materially different. P2 if landlord wants 120-day notice. P3 (no options) is the floor — should always escalate. |
| **Rent** | AI should pick P1 (fixed annual) unless landlord aggressively pushed psf. Rationale should mention the specific landlord text it's reacting to. |
| **Use** | P1 (broad retail) is preferred. P2 (coffee + retail w/ carve-outs) is acceptable when landlord supplies an exclusives list. |
| **Exclusive Use** | P1 (full coffee/tea/espresso lock) is preferred. P2/P3 trade in carve-outs for non-gourmet brewed coffee or pre-bottled tea. |
| **Continuous Operations** | P1 (None) is non-negotiable per the handbook. Any drop to P2 or P3 should auto-flag as escalated because P3 requires VP/RE Committee approval. |
| **Early Termination** | P1 (month-36 ongoing) preferred. The "no ETR" floor (P4) should always escalate. |

Quick SQL to inspect what the AI did:

```sql
SELECT
  ct.display_name AS clause,
  d.ai_position_rank AS pos,
  ROUND(d.ai_confidence::numeric, 2) AS conf,
  d.ai_model AS model,
  d.status,
  d.severity,
  LEFT(d.ai_rationale, 200) AS rationale
FROM legal_loi_decision d
LEFT JOIN clause_type ct ON ct.id = d.clause_type_id
WHERE d.round_id = '<paste round_id from the test page>'
ORDER BY ct.sort_order;
```

Things to flag for follow-up:
- A pick that contradicts the handbook's clear preference
- A rationale that doesn't reference the landlord's actual text (sign the AI didn't read it carefully)
- Confidence > 0.9 on a clause where you'd want a human eyeball
- Any clause you would have escalated that the AI auto-applied

---

## Section 3 — Edge cases (10 min, optional)

Probe the rough edges. Each of these should fail gracefully — no 500s, no broken state.

### 3.1 Re-ingest the same file

Click **Upload + Ingest** twice in a row with the same file. The second run should produce a new round (`Round 1`, then `Round 2`, etc.) — not error or duplicate the first round.

### 3.2 Decide positions with no pending decisions

Click **Run Decide Positions** twice in a row. The second invocation should return `No pending decisions on this round` without erroring (all decisions already moved past `pending`/`escalated` after the first run).

### 3.3 Generate counter on a round with no decisions

If a round somehow has zero decisions with `final_text` (e.g., everything escalated), **Generate Counter-Redline** should return `No applicable decisions to apply` rather than producing an empty `.docx` or 500ing.

### 3.4 Unmatched heading

If your doc has a section like "RIDER" or "RIGHT OF FIRST REFUSAL" that isn't in the canonical taxonomy, it should appear in the decisions panel with `(unmapped)` and `status = escalated`. Generation should skip it (no insertion or comment), not fail.

### 3.5 Bad upload

Try uploading a non-`.docx` file (e.g., a `.pdf`). The pipeline should fail at parse time with a clean error message in the Activity log; the `legal_loi_round` row should not be created.

---

## Section 4 — Database deep-dive (5 min)

Useful queries when something looks wrong:

**4.1 What did the matcher pick for each clause?**

```sql
SELECT
  d.doc_anchor,
  ct.display_name AS canonical_match,
  LEFT(d.ai_rationale, 100) AS matcher_note,
  d.ai_confidence
FROM legal_loi_decision d
LEFT JOIN clause_type ct ON ct.id = d.clause_type_id
WHERE d.round_id = '<round_id>'
ORDER BY d.doc_anchor;
```

If `canonical_match` is `null` for clauses you'd expect to map, the matcher's three tiers all failed. Consider adding the heading text to `legal_playbook.display_heading` for the relevant client+clause_type pair.

**4.2 What does the playbook actually look like?**

```sql
SELECT
  ct.name,
  pb.display_heading,
  pb.confidence_tier,
  count(p.id) AS positions
FROM legal_playbook pb
JOIN clause_type ct ON ct.id = pb.clause_type_id
LEFT JOIN legal_playbook_position p ON p.legal_playbook_id = pb.id
WHERE pb.client_id = '39933b5b-3e8c-438d-be2f-e48cd9228c00'
GROUP BY ct.sort_order, ct.name, pb.display_heading, pb.confidence_tier
ORDER BY ct.sort_order;
```

If the count is 10 (only the seeded clauses), the long tail is missing. To populate it, run `legal-ingest-handbook` against the LOI Handbook PDF — sample curl is in [docs/legal-orchestration-spec.md](legal-orchestration-spec.md).

**4.3 Storage cleanup — find orphaned uploads**

```sql
-- Files uploaded for the legal pipeline that aren't tied to a round yet
SELECT a.id, a.file_name, a.file_url, a.created_at
FROM attachment a
LEFT JOIN legal_loi_round r ON r.attachment_id = a.id
WHERE a.file_url LIKE '%/legal/%'
  AND r.id IS NULL
ORDER BY a.created_at DESC
LIMIT 20;
```

---

## Section 5 — Cleanup (2 min)

When you're done testing, you can clear out test data without touching real deal records:

```sql
-- Delete test sessions for a specific deal (cascades to rounds + decisions)
DELETE FROM legal_loi_session WHERE deal_id = '<your test deal id>';

-- Storage cleanup is manual: in Supabase Studio go to Storage > assets > legal/<deal_id>/
-- and delete the test session folders.
```

---

## What to bring back to me after the test

1. **The numbers**: `clauses_identified`, `matched_count`, breakdown of escalated/pending/auto-applied decisions, total cost (Anthropic console > Usage for the test window).
2. **Mismatches**: any clause where the AI picked a position you'd disagree with — paste the rationale and your preferred call.
3. **Rendering**: how does the counter-redline look in Word? Specifically:
   - Are the tracked changes attributed correctly to "OVIS Tenant Counter"?
   - Are comments anchored on the right paragraphs?
   - Anything visually broken (missing text, garbled formatting, Word repair prompts)?
4. **Smell-test failures**: any 500s, broken auth, hung uploads, etc. — copy the request-id from the network panel if available.

That's the input that drives the next decision: do we polish the V1 writer (full reject-and-replace), capture overrides, build Function B (outbound generator), or replace `/legal/test` with the real Legal module UI.
