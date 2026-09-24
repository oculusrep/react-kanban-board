# Email Triage — Tier-1 Review, Clean Window (2026-09-21)

Second tier-1 log-only review against [email-triage-spec.md §2(a)](email-triage-spec.md). Follows
[EMAIL_TRIAGE_REVIEW_2026-09-14.md](EMAIL_TRIAGE_REVIEW_2026-09-14.md) and
[EMAIL_TRIAGE_STATUS_2026-09-18.md](EMAIL_TRIAGE_STATUS_2026-09-18.md).
**Report only. No rule flipped, nothing deployed, no data changed.** Every query ran in a psql
session with `default_transaction_read_only = on`, and a test write was refused.

**Clean window: 2026-09-14 21:53:04 UTC → 2026-09-21 14:42 UTC (6.70 days).** The start is when
tier-1 stubs moved to `email_tier1_stub` (migration `20260914175119`, gmail-sync v60). A stub
recorded before then survived only if its email was never demoted, so pre-v60 counts are
survivorship-biased. They appear below only where marked "prefix".

---

## ⚠ The Q0 precondition query in the handoff is stale

The review handoff used the pre-v60 query. It reads `processed_message_ids`, which holds **no**
tier-1 stubs since v60, so it returns `0 / 0`. That looks like an empty result, not a failure.

```sql
-- STALE — do not use. Returns 0/0 since gmail-sync v60 (2026-09-14 21:53 UTC).
select count(*) tier1_stubs,
       count(*) filter (where exists (
         select 1 from emails e where e.message_id = p.message_id)) present
from processed_message_ids p
where p.action in ('tier1_bulk','tier1_personal');
```

**Corrected** (same as spec §2(a)):

```sql
select count(*) tier1_stubs,
       count(*) filter (where exists (
         select 1 from emails e where e.message_id = p.message_id)) present_in_emails,
       count(*) filter (where not exists (
         select 1 from emails e where e.message_id = p.message_id)) missing_from_emails
from email_tier1_stub p
where p.action in ('tier1_bulk','tier1_personal');
```

The same stale table appears in the spec's §15 check at
[email-triage-spec.md:738](email-triage-spec.md#L738) (`from processed_message_ids p where p.action like 'tier1_%'`).
It has not been edited yet.

---

## Summary

| Check | Result |
|---|---|
| **0. Precondition** | **PASS — 1199 / 1199** in `email_tier1_stub` (stale query: 0 / 0) |
| **Q1 volume** (clean) | A1 **645** (96.3/day, 247 senders) · A5 **41** (6.1/day, 8 senders) · A4 9 · A3 1 · A2 0 |
| **Q2 false positives** (clean) | A1 **66 emails / 36 senders** · A4 **4** · A3 **1** · A5 **0** |
| **Q3 personal** | **0** in the clean window (2 before it) |
| **Q4 model reduction** | 580 / 831 model runs carried a tier-1 stub: **69.8% of runs, 68.0% of input tokens** |
| **Q5 auto-match short-circuit** | **4** (09-16 ×2, 09-19, 09-21) |
| **Q6 404 causes** | **Not measured.** The verdicts are only in the function logs, which this session could not reach |
| **7. Demotes** | 1218 total, latest 2026-09-21 14:40 UTC |
| **8. Ingestion** | Fresh. Both mailboxes are within 8 min, all 5 email crons succeeded, 0 failures in 24h |

---

## Q1 — Per-rule volume (clean window)

| action | tier1_reason | n | senders | per_day |
|---|---|---|---|---|
| tier1_bulk | A1:list-unsubscribe | 645 | 247 | 96.3 |
| tier1_bulk | A5:bulk-domain | 41 | 8 | 6.1 |
| tier1_bulk | A4:auto-submitted | 9 | 8 | 1.3 |
| tier1_bulk | A3:precedence-bulk | 1 | 1 | 0.1 |

A1 dominates. A5 is a small fallback, as designed. A3 fired for the first time (an out-of-office
reply). A2 has still never fired.

**A5 by domain:** hello.jll.com 28 · atlantaspeechschool.org 11 · franchise.org 1 ·
message.att-mail.com 1. The other 11 A5 domains had no traffic.

---

## Q2 — False positives (clean window)

A row here is an email that tier 1 would have filtered and that the agent then linked to a CRM
object. Every link was created by the agent (`link_source = ai_agent`).

| rule | emails | senders | link rows | deal | property | site_submit | client | contact |
|---|---|---|---|---|---|---|---|---|
| A1:list-unsubscribe | **66** | 36 | 85 | 0 | 8 | 0 | 8 | 65 |
| A4:auto-submitted | **4** | 4 | 10 | 2 | 0 | 0 | 3 | 4 |
| A3:precedence-bulk | **1** | 1 | 3 | 0 | 0 | 0 | 1 | 1 |
| A5:bulk-domain | **0** | — | — | — | — | — | — | — |

The deal/property/client/site_submit columns count emails per object type, so one email can
appear under several types. Of the 66 A1 emails, 56 are still relevant and 10 were demoted even
though they carry a link. For comparison, the prefix window gave A1 56 and A4 5.

### Deal / property / client links (the highest-value offenders)

| rule | sender | subject | linked to |
|---|---|---|---|
| A4 | mike@oculusrep.com | Canceled event with note: SBUX/Oculus Coastal GA Cadence Call | deals **Starbucks - JW (Coastal GA) - Culpepper Aiken Development**, **Publix OP - Village at the Green**; client |
| A4 | justin@dinermangroup.com | Accepted: Hawaiian Bros - Chamblee former Arby's meeting | deal **HB - Dark Arby's - Chamblee** |
| A4 | amit60540@gmail.com | Accepted: Hawaiian Bros - Chamblee former Arby's meeting | client Hawaiian Bros |
| A4 | asantos@oculusrep.com | Accepted: SBUX GA Cadence Call | client Starbucks |
| A3 | john.featherston.jr@gmail.com | Out of Office Re: East Cobb - Starbucks Work Letter | client Starbucks |
| A1 | jason@riseprop.com | Eagle Village \| Retail for Lease | property Eagle Village |
| A1 | anna.crist@bridger-properties.com | 1,200 SF \| Walmart Shadow Retail - Kennesaw, GA | property Village Grand (+ Village Grand Shopping Center) |
| A1 | olivia.arnold@cbre.com | Retail Space Catty Corner to Ponce City Market! | property Ponce City Market |
| A1 | pgreen@ackermanco.net | Restaurant Endcap \| Uptown Square \| Fayetteville, GA | property Uptown Square |
| A1 | amy.kennedy@tscg.com | Denmark Station | property Denmark Station-Alpharetta-Pet Concepts; client TSCG |
| A1 | no-reply@dropbox.com | Last week's updates in your shared folders | property Southlake Festival (matcher error) |
| A1 | brad@westbrookre.com | Seymour, TN: Outparcel to New Walmart Neighborhood Market | client Developers in ATL |
| A1 | scott.tiernan@srsre.com | Prime Pad Site / Former Dental Space | client SRS Real Estate Partners |
| A1 | brett.fuller@tscg.com | Junior Anchor Space Available \| Walmart Shadow Anchor | client TSCG |
| A1 | lesliemintz@regencycenters.com | Woody's BBQ and Cap't Loui Just Signed in Tucker | client Regency Centers Corp |

### A1 contact-link offenders, top senders

jason@riseprop.com 6 · matt.berres@nmrk.com 4 · max@sullivanwickley.com 4 ·
anna.crist@bridger-properties.com 4 · rlanham@twdre.com 3 · harrison.norman@srsre.com 3 ·
craige.pearson@tscg.com 3 · scott.tiernan@srsre.com 2 · shop@poshmark.com 2 · kathy.dennis@tscg.com 2 ·
amy.kennedy@tscg.com 2 · edward.fernandez@tscg.com 2 · lily.heimburger@matthews.com 2 ·
bill@sullivanwickley.com 2 · choward@egsinc.com 2 · olivia.arnold@cbre.com 2 · brett.fuller@tscg.com 2 ·
noreply@supabase.com 1 · pgreen@ackermanco.net 1 · stewart.preston@srsre.com 1.

The pattern from 09-14 holds. Brokers send listing blasts from their personal addresses with
List-Unsubscribe set, so A1 alone can't separate them from true bulk. Some links are matcher errors,
not tier-1 errors: poshmark and dropbox, and noreply@supabase.com.

### Outbound replies to tier-1 mail (clean)

- **A1: 2.** Both personal: automaticmembership.com "Automatic Southeast Tickets are LIVE" and
  atlantamagazine.com. Neither is business.
- **A5: 5, all atlantaspeechschool.org.** This is 1:1 mail from the school, e.g. "Re: Fall
  Parent-Teacher Conference", "Re: Conference Conflict". The agent linked none of it, but it is
  personal correspondence, not bulk. It belongs on the B (personal) list, not in A5.

---

## Q3 — Personal

**0** in the clean window. The CHECK constraint forbids any detail, so this is a count only. The
prefix window had 2 (teamsnap). Ladder B still has no list from the §7 harvest.

---

## Q4 — Model-call reduction (measured)

Emails created in the clean window, by `classification_outcome`:

| outcome | emails | input tokens |
|---|---|---|
| model_done | 553 | 6,753,496 |
| model_no_verdict | 278 | 5,326,987 |
| thread_inheritance | 138 | 0 |
| rule_exclusion | 116 | 0 |
| sender_automatch | 4 | 0 |
| abandoned | 1 | 3,780 |

The model worked for the whole window: no outage, and 1 abandoned email.

| | value |
|---|---|
| model runs | 831 |
| …carrying a tier-1 bulk stub | **580 (69.8%)**: A1 570 · A4 8 · A5 1 · A3 1 |
| input tokens on those runs | 8,215,630 of 12,080,483 (**68.0%**) |

Per day (ET), model runs vs. would-skip: 09-15 197/149 · 09-16 191/140 · 09-17 187/131 ·
09-18 127/70 · 09-19 36/28 · 09-20 23/17 · 09-21 56/35 (partial).

**If every tier-1 rule were enforced, the measured cut would be ~70%, above the 45–68% estimate.**
Weekday model runs would drop from ~190 to ~55. Nearly all of that is A1, which Q2 blocks. Enforcing
only the rules that are clean today (the A5 domains) saves **1 model run** in 6.7 days, because A5
senders are mostly caught earlier by exclusion rules.

`model_no_verdict` is 278 / 831 = **33%** of model runs, up from 29–30%. That is still open item 2
on the 09-18 list.

---

## Q5 — Auto-match short-circuit

Counted from `emails.classification_outcome = 'sender_automatch'` rather than a log grep:
**4** (09-16 ×2, 09-19, 09-21). It is live, so keep the branch.

---

## Q6 — 404 causes: not measured

The verdicts (`wrong-mailbox:resolves-in:*`, `gone:*`, `probe-*`) are written only to the
email-triage function logs ([email-triage/index.ts:441-459](../supabase/functions/email-triage/index.ts#L441-L459)).
This session had no Management API access to the logs. To run it, open Dashboard → Logs Explorer,
set the range to start 2026-09-14 21:53 UTC, and query:

```sql
select timestamp, event_message from function_logs
where event_message like '%gone:%' or event_message like '%wrong-mailbox%' or event_message like '%probe-%'
```

For the prefix week (09-14 review), the result was 3 × `gone:not-in-any-mailbox`, 0 wrong-mailbox.
They looked like draft revisions.

---

## 7. Demote health

`count(*) filter (where not is_relevant)` = **1218**, `max(demoted_at)` = **2026-09-21 14:40:08 UTC**.

Demoted per day (ET), with the outcome that did it:

| day | demoted | rule_exclusion | model | other/null |
|---|---|---|---|---|
| 09-07 | 53 | 0 | 0 | 53 |
| 09-08 | 100 | 0 | 0 | 100 |
| 09-09 | 61 | 0 | 0 | 61 |
| 09-10 | 36 | 0 | 0 | 36 |
| 09-11 | 17 | 0 | 0 | 17 |
| 09-12 | 3 | 0 | 0 | 3 |
| 09-14 | 268 | 7 | 232 | 29 |
| 09-15 | 204 | 22 | 182 | 0 |
| 09-16 | 104 | 26 | 78 | 0 |
| 09-17 | 91 | 28 | 63 | 0 |
| 09-18 | 193 | 24 | 169 | 0 |
| 09-19 | 30 | 5 | 25 | 0 |
| 09-20 | 22 | 0 | 22 | 0 |
| 09-21 | 36 | 10 | 26 | 0 (partial) |

"other/null" before 09-14 means the row predates `classification_outcome` (migration `20260914130150`).

**Why the first week ran far below the ~84/day estimate:** the model was down from 09-09
11:45 ET (Gemini credits depleted), so only exclusion rules could demote. Daily counts collapsed
from 100 to 3. Since the fix, weekdays run 91–204/day, and the 7-day average of about 97/day is
*above* the estimate. 09-14/15 are inflated by the 577-email outage re-run, and 09-18 by the
297-email collision recovery.

---

## 8. Ingestion health (checked 2026-09-21 14:42 UTC)

| mailbox | last received_at | last ingested | last_sync_at | sync_error |
|---|---|---|---|---|
| asantos@oculusrep.com | 14:36:16 | 14:40:03 | 14:40:03 | — |
| mike@oculusrep.com | 14:34:04 | 14:35:01 | 14:40:02 | — |

| cron job | last succeeded | failures 24h |
|---|---|---|
| gmail-sync-job | 14:40:00 | 0 |
| email-triage-job | 14:37:00 | 0 |
| email-ingestion-staleness-check | 14:30:00 | 0 |
| email-ingestion-alert-dispatch | 14:35:00 | 0 |
| email-classifier-health-check | 14:32:00 | 0 |

**Nothing stale over 6h.** One caveat: cron "succeeded" only means `net.http_post` was queued.
In the last 6h, 17 of about 1,032 pg_net responses were client-side 5-second timeouts (status
null). The function keeps running server-side, and ingestion is fresh, so the timeouts are harmless
today. It is still the silent-failure shape: a cron success does not prove the function ran. The
staleness check (job 15) is what catches a real failure.

---

## Per-rule recommendation — nothing flipped

Flip criteria from spec §2(a): enforce a rule only when Q2 returns zero rows for it (per domain for A5).

| Rule | Q2 (clean) | Recommendation |
|---|---|---|
| A1:list-unsubscribe | 66 | **STAY LOG-ONLY.** Measure a sender exemption (CRM contact or previously mailed) next |
| A2:list-id | 0, no traffic | **STAY LOG-ONLY** (never tested) |
| A3:precedence-bulk | 1 | **STAY LOG-ONLY** |
| A4:auto-submitted | 4 (2 deal links) | **STAY LOG-ONLY** |
| A5 hello.jll.com | 0 / 28 | **ENFORCE** |
| A5 franchise.org | 0 / 1 | **ENFORCE** |
| A5 message.att-mail.com | 0 / 1 | **ENFORCE** |
| A5 atlantaspeechschool.org | 0 / 11 | Clean by the criteria, but the mail is personal 1:1 correspondence with replies. **Move to the B (personal) list** rather than enforce as bulk |
| A5 other 11 domains | no traffic | nothing to decide |
| B1/B2 personal | Q3 = 0 | **STAY LOG-ONLY.** The list is not from the §7 harvest |

---

## Addendum (2026-09-21) — A1 sender-exemption measurement

Measured after the review, read-only, same clean window. The exemption tested: **do not stub if the
sender is a CRM contact (`contact.email` or `contact.personal_email`) OR mike@/asantos@ has ever
sent mail to that address.**

| | Before | With exemption |
|---|---|---|
| A1 stubs | 651 | **582 (89.4%)**, 217 senders |
| A1 false positives | 66 | **11** |
| Model runs A1 would skip | 577 / 840 | **509 / 840 — 60.6% of runs, 58.5% of input tokens** (~76/day) |
| Plus the three clean A5 domains | — | 510 / 840 |

58 stubs were exempted by the contact test and 39 by the sent-to test; 69 distinct after overlap.
Restricting the sent-to test to mail sent *before* the stub changes the exemption by one stub and
does not change the false-positive count. The exemption is **not circular**: none of the 28 contacts
behind it was created after that sender's first A1 email.

### The 66, split

| group | emails | note |
|---|---|---|
| Broker listing blasts, exempted | **55** (25 senders) | Covers every property and client link: Eagle Village, Village Grand, Ponce City Market, Uptown Square, Denmark Station |
| Broker listing blasts, **not** exempted | **3** | info@halpernent.com → contact Dan Gagne · doug.holtzman@tscg.com → Jeremy Kral · michelle.lawrence@colliers.com → Tyler Mouchet. Sender not in the CRM; each linked to a *different* contact, probably a co-listing broker |
| Matcher errors / not business | **7** | poshmark ×2 and oura → Bob Aiken (whose contact record carried `mike@mikeminihan.com`) · dropbox → property Southlake Festival · supabase → Noree Corias · cciminstitute → April Lawson · connect.media news digest → two people named in the article |
| Unclear | **1** | fred@fireflies.ai "Your meeting recap – Mike and Noree" → contact Noree Corias. The link is plausibly right, but it is a generated summary, not correspondence |

**Conclusion: the exemption does not qualify A1 for enforcement** — 11 ≠ 0 — though the 3 real
misses are all contact-level, never deal-level.

### Superseded 2026-09-24 — the requirement changed

**A1 is not going to be enforced, with or without the exemption.** Broker property blasts are how
new sites are found: they must be **kept and routed**, not excluded. A1 can only report that a
message was mass-sent; it cannot tell a property blast from a newsletter. Tier 1 was designed to
exclude on a cheap header signal, and what is now needed is routing on content. That is a design
change, not a tuning change, and it belongs in the §4 / §6 work rather than in `TIER1_MODE`.

The measurement above stands as evidence of the split (about 88% of A1's Q2 hits are broker
listing blasts — exactly the mail that must be kept), not as a flip recommendation.

The three clean A5 domains (hello.jll.com, franchise.org, message.att-mail.com) remain safe to
enforce: they are pure junk, and none produced a link.
