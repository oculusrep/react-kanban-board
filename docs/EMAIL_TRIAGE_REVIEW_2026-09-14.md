# Email Triage — Tier-1 Log-Only Week Review (2026-09-14)

Review of the tier-1 log-only week specified in [email-triage-spec.md §2(a)](email-triage-spec.md).
Window: `gmail-sync` v57 live **2026-09-07 21:32 UTC** → 2026-09-14 16:30 UTC (6.8 days).
**Report only. No rule flipped, nothing deployed, no data changed.**

> Correction to the spec: v57 went live at **21:32 UTC**, not "~20:00". The first v57 request is
> the forced full sync at 21:33:13. The two `Skipping previously tier1_bulk` lines at 21:05 and
> 21:10 UTC were still v56.

---

## Headline — three defects that change how to read the week

| # | Defect | Effect on the review |
|---|---|---|
| 1 | **Gemini prepaid credits depleted.** Every model call has returned `429 "Your prepayment credits are depleted"` since **2026-09-09 15:45 UTC (11:45 ET)**. Still failing at 16:15 UTC today. The error handler ([email-triage/index.ts:418](../supabase/functions/email-triage/index.ts#L418)) marks the email `ai_processed = true` "to avoid infinite retries". | **575 emails** marked processed but never classified. The IDs are in the logs (`Error processing email <id>`), so they can be re-triaged. For 4.8 of the 6.8 days the model made no links, so Q2 could only see links made without the model. Q4's model-call reduction can't be measured. No alert fired. |
| 2 | **The demote write overwrites tier-1 stubs.** `email-triage` upserts `processed_message_ids` `onConflict: 'message_id'` with `action='demoted'` ([email-triage/index.ts:187](../supabase/functions/email-triage/index.ts#L187)). Any tier-1 message that is later demoted loses its `tier1_bulk` / `tier1_personal` row. | Q1, Q2 and Q3 as written undercount. **A5 shows 0 in Q1 but fired 47 times.** Numbers below are rebuilt from the `[Tier1] WOULD FILTER` log lines. |
| 3 | **Exclusion rules match on keyword collisions.** `searchRules` ([gemini-agent.ts:501](../supabase/functions/_shared/gemini-agent.ts#L501)) fires an exclusion if any subject word of 4+ characters is a substring of the rule's text or pattern, or if the sender's domain is a substring of the pattern. Verified examples: "Atlanta" ⊂ `atlantaspeechschool.org`, "Meadow" ⊂ `highmeadows.org`, `jll.com` ⊂ `hello.jll.com`, `costar.com` ⊂ `email.costar.com`. | **184 of 320** rule-override demotions since v57 were collisions, **22 of them outbound mail from mike@ and asantos@**. Examples: starbucks.com "RE: Session 2 - Atlanta GA - GSS - Ops Area 39", barburrito.ca "Re: Tenant Rep - Atlanta", landlord replies to the Barrio Burrito blast (edens, plnms, dartretail, westbrookre, shopone, cygnetprop, partnersrealestate, bridger), ddpllc "RE: Riverdale Station", riverwoodproperties "Meadow Glen x BWW Go", and OVIS's own ingestion-alert emails. Before v84 this path hard-deleted. The rows still exist (`is_relevant = false`), so they can be recovered. This is not a tier-1 defect, but it inflates the demote counts. |

---

## Precondition — PASS

```
tier1_stubs | present_in_emails | missing_from_emails
        478 |               478 |                   0
```

A second check that could have failed: after v57 there are **0** `[Tier1] FILTERED` lines and
**0** `Skipping previously tier1_*` lines. Log-only did not filter.

Caveat: this only covers stubs that still exist (defect 2). The overwritten ones belong to emails
that are in `emails`, because demote needs the row to exist. So the conclusion holds.

---

## Q1 — Per-rule volume

**As specced** (counts only the stubs that survived):

| tier1_reason | n | senders | per_day |
|---|---|---|---|
| A1:list-unsubscribe | 470 | 193 | 67.1 |
| A4:auto-submitted | 6 | 6 | 0.9 |

**Rebuilt from log lines** (6.8 days):

| Rule | Verdicts | /day | Stubs surviving | Notes |
|---|---|---|---|---|
| **A1:list-unsubscribe** | **771** | 113 | 470 (61%) | 94% of all bulk verdicts |
| **A5:bulk-domain** | **47** | 6.9 | **0** | hello.jll.com 43 · atlantaspeechschool.org 3 · highmeadows.org 1. The other 12 A5 domains: no traffic |
| A4:auto-submitted | 24 | 3.5 | 6 | 17 are auto-replies to the 09-10 Barrio Burrito Mailchimp blast. Also a Mailchimp code, calendar acceptances (texe@theyardgym.com "Accepted: The Yard – Territory discussion"), Mike's own Mailchimp test, and a teacher's reply |
| A2:list-id | 0 | — | — | never fired |
| A3:precedence-* | 0 | — | — | never fired |
| B1:personal-domain | 4 | — | 2 | all teamsnap |

**A1 vs A5:** the header rule does nearly all the work. A5 only runs on mail without a
List-Unsubscribe header. All three domains that hit A5 are also active `agent_rules` exclusions, so
tier-1 A5 duplicates an existing rule for every domain that had traffic.

Log lines ≈ messages: every stubbed email has exactly 1 visibility row, and hello.jll.com's 43
lines match its 43 `emails` rows. The 21:32 forced full sync re-read a few pre-window messages.

---

## Q2 — False positives

### As specced — 26 rows

`n` counts link rows, not emails.

| rule | sender | n | emails | linked to |
|---|---|---|---|---|
| A1 | jason@riseprop.com | 8 | 8 | contact Jason Chaliff |
| A1 | dhunt@dg.dev | 5 | 5 | contact Daniel Hunt |
| A1 | matt.berres@nmrk.com | 4 | 4 | contact Matt Berres |
| A1 | sgouffon@seligenterprises.com | 4 | 2 | contact Shirley Gouffon; client Selig Enterprises Inc |
| A1 | scott.tiernan@srsre.com | 4 | 2 | contact Scott Tiernan; client SRS Real Estate Partners |
| A1 | daniel.duque@cbre.com | 4 | 2 | contact Daniel Duque; client CBRE |
| A1 | craige.pearson@tscg.com | 3 | 3 | contact Craige Pearson |
| A1 | choward@egsinc.com | 3 | 3 | contact Casey Howard |
| A1 | kim.dart@dartretailadvisors.ccsend.com | 3 | 1 | contacts Kimberly Heidt, Mark Hoffmann, Megann Poe |
| **A4** | aaltizer@pennhodge.com | 2 | 1 | contact Alysia Altizer; client Penn Hodge Properties ("Out of Office") |
| A1 | donotreply@cciminstitute.com | 2 | 2 | contact April Lawson (expcommercial) |
| A1 | edward.fernandez@tscg.com | 2 | 2 | contact Edward Fernandez |
| A1 | kris.murphy@tscg.com | 2 | 1 | contacts Kris Murphy, Amy Kennedy |
| A1 | luke@sullivanwickley.com | 2 | 2 | contact Luke Waters |
| A1 | sam.krueger@franklinst.com | 2 | 1 | contact Sam Krueger; client Franklin Street |
| A1 | shop@poshmark.com | 2 | 2 | contact **Bob Aiken** (see note) |
| A1 | adrienne.crawford@matthews.com | 2 | 2 | contact Adrienne Crawford |
| A1 | ncarone@gbtrealty.com | 1 | 1 | contact Nick Carone |
| A1 | no-reply@m.ouraring.com | 1 | 1 | contact **Bob Aiken** |
| A1 | paul.gaither@cbre.com | 1 | 1 | contact Paul Gaither |
| A1 | tony.tedesco@crye-leike.com | 1 | 1 | contact Tony Tedesco (residential newsletter) |
| A1 | dyi@ackermanco.net | 1 | 1 | contact Daniel Yi ("Seeking Space – The Little Gym") |
| A1 | drew.fleming@nmrk.com | 1 | 1 | contact Drew Fleming |
| A1 | cadams@olearypartners.net | 1 | 1 | contact Chris Adams |
| A1 | asadowsky@atlanticretail.com | 1 | 1 | contact Andrew Sadowsky — **Mike replied 2h19m later** |
| A1 | dawn.princehoover@tscg.com | 1 | 1 | contact Dawn Hoover |

### Hidden by defect 2 — 1 more

| rule | sender | emails | linked to |
|---|---|---|---|
| A1 | jason@riseprop.com | +4 (demoted, stub overwritten) | contact Jason Chaliff |

Three other demoted emails with links (cobbk12.org) were **not** tier-1: no `WOULD FILTER` line.

### Reading it

- **Every hit is a contact or client link. There are 0 deal, property or site_submit links.** Most
  are a broker's listing blast linked to that broker's own contact record.
- The List-Unsubscribe assumption in [tier1.ts](../supabase/functions/_shared/tier1.ts)'s header
  does not hold. Brokers (tscg, nmrk, cbre, srsre, riseprop) send their own listing blasts from
  their personal addresses with List-Unsubscribe set.
- **Strongest signal:** Mike replied to an A1 message (atlanticretail "Land Available for Lease,
  Ground Lease, and BTS"). It is the only tier-1 message in the week with an outbound reply.
- Links that are matcher errors, not tier-1 errors: poshmark and oura → contact **Bob Aiken**,
  whose `email` is `mike@mikeminihan.com`, so anything sent to that address links to him. Also
  cciminstitute → April Lawson.
- **Q2's reach this week:** with the model down from 09-09 11:45 ET, only links made without the
  model were visible (sender auto-match, inheritance, rules). A zero-hit rule is weaker evidence
  than it looks.
- **A5 zero is guaranteed, not measured.** Exclusion rules return before any linking, and every
  domain that hit A5 has an active exclusion rule. A5 could not produce a Q2 row.

### Per-rule status against the flip criteria

| Rule | Q2 | Evidence quality |
|---|---|---|
| A1 | **31 emails hit** (+1 reply) | hold per criteria |
| A2 | 0 | **no traffic** — nothing was tested |
| A3 | 0 | **no traffic** — nothing was tested |
| A4 | **1 hit** (OOO → contact + client) | hold per criteria |
| A5 hello.jll.com / atlantaspeechschool.org / highmeadows.org | 0 | zero by construction (already exclusion rules). highmeadows' one message was a human reply, "RE: Favor" |
| A5 other 12 domains | — | no traffic |
| B1/B2 | Q3 = 4 | list is still the teamsnap example, not the §7 harvest → criterion not met |

---

## Q3 — Personal

As specced: **2**. Real count: **4** (teamsnap ×4, B1). B2: 0, because the list is empty.

The two overwritten personal stubs now carry `sender_email` and `tier1_reason='agent:not-business'`.
That defeats the intent of `pmi_personal_stub_carries_no_sender`, which only checks
`action='tier1_personal'`.

---

## Q4 — Model-call reduction

As specced (UTC day of `ai_processed_at`):

| day | kept | demoted |
|---|---|---|
| 09-07 | 6 | 56 |
| 09-08 | 88 | 120 |
| 09-09 | 172 | 100 |
| 09-10 | 255 | 85 |
| 09-11 | 159 | 55 |
| 09-12 | 54 | 11 |
| 09-13 | 29 | 4 |
| 09-14 | 78 | 35 |

From the triage summary lines since v57 (these match the DB: 1,308 = 1,308):

| | count |
|---|---|
| emails triaged | 1,308 |
| rule override (returns before the model) | 320 |
| model-skipped | 154 (151 inheritance, 3 auto-match) |
| **sent toward the model** | **834** (~123/day calendar; **~168/day** across the three full weekdays) |
| of which Gemini 429 | **575** |
| successful model calls | ~259, all before 09-09 11:45 ET |

**Verdict: the reduction can't be measured this week.** Short-circuits alone take the model-bound
weekday volume from the 172/day baseline to ~168/day. The projected 55–95 depends on tier-1
enforcement, which was not active.

---

## Q5 — Auto-match short-circuit

**It fired 3 times** (09-08 14:55 UTC; once in 09-08 20:00→09-09 20:00; once in 09-10 20:00→09-11 20:00).
It is not dead code, so keep it.

**The spec's grep would have returned 0.** `sender_automatch_thread_has_deal` is the
`model_skip_reason` value and is never logged. The log text is `SHORT-CIRCUIT: Skipped model:
sender auto-matched to a known contact and the thread already carries a deal link`. Following the
spec as written would have deleted a working branch.

---

## Q6 — 404 verdicts (triage label-apply path)

| verdict | count |
|---|---|
| wrong-mailbox:resolves-in:* | **0** |
| gone:not-in-any-mailbox | **3** |
| gone:no-other-mailbox / probe-inconclusive / probe-failed | 0 |

All three are mike@ OUTBOUND with `visibility_rows=1`, so the wrong-mailbox cause could not occur.
**The week never tested the `[0]`-selection defect.** Each has a twin in `emails` with the same
thread and subject, a gmail_id ~5 minutes apart, and a slightly different body length:

| gone | twin | body len |
|---|---|---|
| 1a0872ed92fcd945 | 1a0872f28317181e | 2316 vs 2349 |
| 1a08cd0b7696cb7c | 1a08cd2326f1cee6 | 29749 vs 29532 |
| 1a091bbb5ba508cf | 1a091b48dcb508cd | 651 vs 433 |

These look like **draft revisions**: Gmail replaces the message ID on each save or send. Not
checked in Gmail itself. Draft revisions are also being ingested as separate `emails` rows.

Related, on the sync side: `gmail-sync` logged **836** `getMessage` 404s during the window
(57 / 226 / 219 / 189 / 16 / 1 / 128 per day). Those messages were skipped, not ingested. The
weekday-heavy pattern fits the same draft churn. Unverified.

---

## Demoted count and daily rate

`processed_message_ids.action='demoted'`: **471** (first 09-07 07:15 ET, latest 09-14 12:07 ET).

| ET day | rule override | model | total |
|---|---|---|---|
| 09-07 | 16 | 50 | 66 |
| 09-08 | 43 | 74 | 117 |
| 09-09 | 80 | 24 | 104 |
| 09-10 | 81 | 0 | 81 |
| 09-11 | 55 | 0 | 55 |
| 09-12 (Sat) | 9 | 0 | 9 |
| 09-13 (Sun) | 4 | 0 | 4 |
| 09-14 | 35 | 0 | 35 |

~65/day calendar · **~89/day on weekdays 09-08→09-11** · ~6.5/day on the weekend.

**Why the 09-07 count was 5, not ~84/day:**
1. The count was read at 13:05 UTC, ~15.5 h after the v84 deploy. That span was overnight into
   Labor Day (09-07) and saw little mail: 73 emails were ingested all day on 09-07 ET.
2. The log-only bug was dropping bulk mail before insert from 09-06 22:35 to 09-07 21:32 UTC. Bulk
   is exactly what gets demoted, so it never reached triage. The first demote came at 11:15 UTC.

After the fix, weekdays ran 89/day, close to the ~84 estimate (which came from 2,534 deletes / 30
calendar days). From 09-09 midday the rate is not meaningful: model demotions stopped (defect 1),
and 184 of the rule demotions are collisions (defect 3).

---

## Ingestion continuity — no stalls

- `gmail-sync` ran 288–289 times per 24 h in every window (243 in the final 20.2 h). **0**
  connection errors. `sync_error` is null on both connections. `last_sync_at` was 16:10 UTC today
  on both.
- Checked against inserted rows, not just runs: both mailboxes inserted mail every ET day. **No
  weekday business-hours gap over 90 minutes on either mailbox.** The longest gaps are overnight or
  weekend (asantos Sat 12:40 → Sun 06:05 ET, 17.4 h).
- Staleness alerts: three on 09-07 (the incident, before v57), and one 65-minute alert on 09-08
  from 07:10 to 08:15 ET that cleared 15 minutes later. **None since 09-08 08:35 ET.** Those alert
  emails were themselves demoted by defect 3, so they are hidden in the queue.
- Per-message loss that isn't a stall: 836 sync-side 404s (see Q6).

---

## Not done (per instruction)

No `TIER1_MODE` change, no rule edits, no deploys, no re-triage of the 575, no un-demoting of the
collision rows. Fix candidates for Mike to prioritise:
- restore Gemini credits and re-triage the 575
- stop the demote upsert from overwriting `tier1_*` stubs
- constrain `searchRules` to sender/domain equality
- recover the 184 collision demotes
- fix the Bob Aiken contact record

---

## Follow-up — fixes shipped and outage re-run (2026-09-14 → 09-15)

| Step | What | State |
|---|---|---|
| Classification state | Migration `20260914130150`: `classification_status` (pending/classified/failed/abandoned), outcome, attempts/backoff, tokens; `email_classifier_health()` + alert. email-triage v87, dispatcher v4 | live, verified on a live run |
| Stub overwrite | Migration `20260914175119`: tier-1 stubs moved to `email_tier1_stub` (503 rows); gmail-sync v60 writes there | live, verified: CBRE A1 stubs + model demote coexisting at 22:20 UTC |
| Re-run | 577 outage emails (rebuilt from logs; all billing 429s, 09-09 15:45 → 09-14 16:35 UTC) marked `failed`, drained by cron | done 2026-09-15 07:17 UTC |

Note on versions: every edge function's version number went up by one at ~20:40 UTC on 09-14. That was a
`supabase secrets set` (Dropbox token rotation) re-versioning all functions with unchanged code, not a deploy.

### Re-run results (from `classification_status`, not logs)

| | count |
|---|---|
| classified | **577 / 577** |
| failed / abandoned | **0 / 0** |
| retried inside the re-run and then succeeded (attempts = 3) | 4: three Gemini 503s, one `MALFORMED_FUNCTION_CALL` empty response |
| judged non-business (demoted) | **308**, all model-judged |
| linked to any CRM object | 113 (94 already had pre-model auto-match links; **35 got new links** in the re-run) |
| new links by type | 22 deal links on 10 emails · 19 property links on 12 emails · 20 client · 9 contact |
| kept, no link | 177 |

**One of the four retries is the silent-failure fix earning its keep.** Gemini returned no content
(`finishReason=MALFORMED_FUNCTION_CALL`) on attempt 2. The old code would have `break`-ed and recorded
"keep". It was recorded as failed, retried an hour later, and got a real verdict.

### `model_no_verdict` — a finding about the agent loop, not just a label

| outcome | emails | share | avg input tokens |
|---|---|---|---|
| model_done | 407 | 70.5% | 11,395 |
| **model_no_verdict** | **168** | **29.2% of the 575 model runs** | **17,140** |
| thread_inheritance | 2 | 0.3% | — |

**29.2% here, against 30% (42/140) in the pre-outage sample.** Two independent samples agree: about three
in ten model runs never call `done()`. In the same window's logs, the 170 loop-ended-without-done lines
break down as **16 "no function calls"** and the rest hitting the **5-iteration cap**. Those logs include
some organic mail alongside the 577.

These runs cost **1.5× a completed run** and account for **38% of input tokens** from 29% of emails.
Their verdict is the default "keep" with no links, so roughly three in ten model-bound emails are paying
for a full loop and getting no classification. Candidate causes to test, not yet investigated:
- the prompt's "multiple search_deals calls are OK" instruction encouraging search until the cap
- `searchDeals`' unranked ILIKE returning nothing useful, so the model keeps searching

### Tokens and cost — measured

| | input | output | cost ($0.30 / $2.50 per M) |
|---|---|---|---|
| **actual** | **7,517,268** | **495,854** | **$3.49** |
| pre-run estimate (central / conservative) | 8.4M / 13.0M | 0.47M / 0.93M | $3.70 / $6.20 |

The actual came in below the central estimate, not near the top. The no-verdict runs were long, as
expected, but the completed runs grew less per iteration than the conservative bound assumed.

### Tier-1 evidence through the re-run

Of the 577, 390 carried tier-1 stubs, snapshotted before the run. **All 390 are intact, row for row.**
235 of them were demoted during the run and now hold both a `tier1_*` stub and a `demoted` row. Under the
old write path, those 235 would have been overwritten.

### Side effects to be aware of

- **104 `activity` rows** were created: 22 for deal links on 10 emails, 82 for client/contact/property
  links. They're dated at the email's `received_at` (09-09 → 09-14). The deal board clock ignores email
  activity since `20260905172258`, so no tiles move. No duplicate activity rows.
- **The classifier backlog alert** fired at 22:32 UTC (backlog 572) and was emailed. Health is ok now;
  the alert resolves on the next check and its recovery email follows.
