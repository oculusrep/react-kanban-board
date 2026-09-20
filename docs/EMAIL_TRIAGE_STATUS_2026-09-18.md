# Email Triage — where this stands, 2026-09-18

Pick-up note. Detail lives in [EMAIL_TRIAGE_REVIEW_2026-09-14.md](EMAIL_TRIAGE_REVIEW_2026-09-14.md)
(the log-only week review + outage re-run) and [email-triage-spec.md](email-triage-spec.md)
(the spec; §15 holds the working-practice lessons).

Everything below is **live in production and on `main`**. Nothing is sitting on an unmerged branch.

---

## Shipped since 09-14

| Date | Change | Live as |
|---|---|---|
| 09-14 | `emails.classification_status` (pending/classified/failed/abandoned) + outcome, attempts/backoff, token columns. A failed model call no longer writes the same row state as a verdict. Migration `20260914130150` | email-triage v87 |
| 09-14 | `email_classifier_health()` + `email_classifier_alert` + 15-min cron, dispatched via Resend. Ingestion can be healthy while classification is dead — this watches classification's own output | dispatch v4 |
| 09-14 | Tier-1 stubs moved to `email_tier1_stub` so a later demote can't overwrite them. Migration `20260914175119` | gmail-sync v60 |
| 09-15 | 577 outage emails re-run: 577 classified, 0 failed, 0 abandoned, $3.49 | — |
| 09-17 | Branch merged to `main`, Vercel prod deploy (no frontend change) | `416dd940` |
| 09-18 | **Exclusion rules match sender identity only** (`ruleMatchesSender`): address equality, or domain equality / anchored suffix. Subject keywords and rule_text no longer match anything | email-triage v89 |
| 09-18 | **Reverted** same-day "abandon content blocks on attempt 1" → retry with a 3-attempt cap (~75 min). Transport failures keep 6 | email-triage v90 |

---

## Running right now (started 13:30 UTC 09-18)

**Recovery of 297 collision-demoted emails.** They were demoted by exclusion rules that would not
fire under sender-identity matching ("Atlanta" ⊂ atlantaspeechschool.org, jll.com ⊂ hello.jll.com).
Set back to `is_relevant = true` and re-queued for a real classification; their `agent:rule-override`
stubs in `processed_message_ids` were deleted. Tier-1 stubs untouched (44 of the 297 have one).

Progress at 13:57 UTC: **35 classified, 262 remaining, 18 judged non-business by the model, 8 linked,
0 re-demoted by a rule.** Drains at 5 per 5 minutes — expect completion ~18:30 UTC. A watcher aborts
if any recovered email is rule-demoted again.

The classifier **backlog alert is open and expected** (it fired on the 297). It resolves itself when
the queue empties, and sends a recovery email.

### What to check when it finishes
```sql
-- final counts for the recovered set (ids: scratch file recover_ids.txt, or rebuild:
-- rule-override demotions since 09-06 whose sender no longer matches any active rule)
select classification_status, classification_outcome, count(*) from emails
where id in (...) group by 1,2;
-- the one that matters: must stay 0
select count(*) from emails where id in (...) and classification_outcome = 'rule_exclusion';
```

---

## Open, in the order I'd take them

| # | Item | State | Next step |
|---|---|---|---|
| 1 | **Tier-1 flip** | waiting on data, review date **09-21** | Re-run Q1–Q6 (§2a) on a clean 7 days, decide per rule. A5 and A3 are visible for the first time now that stubs survive |
| 2 | **`model_no_verdict` ≈ 26–30%** of model runs, 1.5× tokens, no verdict | diagnose, **does not block** | Read 10 capped runs. Suspects: the prompt inviting repeated `search_deals`, and `searchDeals`' unranked ILIKE returning nothing useful |
| 3 | **Content blocks: transient or permanent?** | measuring | Count `content-block` lines in the triage logs after a few weeks, then set the cap on evidence |
| 4 | **(f) Gmail 404s** | measured | Q6 said "gone", not wrong-mailbox, and they look like draft revisions. Likely record "no retry queue" and close |
| 5 | gmail-sync `getMessage` 404s, 137–261/day | open | Messages skipped at ingest, still unverified as drafts |
| 6 | `searchDeals` unranked ILIKE; the seed bug; Lost/Closed Paid unmatchable | open (§2c) | Root cause behind Barrio Burrito → Poke House |
| 7 | Bob Aiken contact record (`email = mike@mikeminihan.com`) | open | Anything sent to that address links to him |
| 8 | §7 VA label harvest | not started | Blocks the B (personal) tier-1 ladder; needs literal Gmail label IDs |
| 9 | §4 commitment table | not started | The point of the project; §2 was the prerequisite |
| 10 | §11 kill switch | not built | No flag can stop triage today |

---

## Facts worth not rediscovering

- **`supabase secrets set` re-versions every edge function** with unchanged code. A version jump is
  not a deploy; check `updated_at`.
- **One prod DB, no staging.** Both 09-14 migrations were applied by psql and recorded by filename
  version, per CLAUDE.md.
- **`processed_message_ids` is keyed on `message_id` alone** and is shared by triage and two UI
  pages. That is why tier-1 stubs had to move tables rather than change the key.
- **The 503 pre-fix tier-1 stubs are preserved** at `docs/data/email_tier1_stub_prefix_2026-09-14.csv`.
  Survivorship-biased: use the log-rebuilt Q1 counts for volume.
