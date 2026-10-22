# Intel: prefill "Create contact" from the person's email signature — PLAN

**Status (2026-10-22):** LIVE in production for Mike's account only. Merged to main (`62439125`) after Mike's browser test; edge function `ovis-knowledge-capture` v13 deployed from main. Migration `20261022090213_intel_email_lookup` applied + recorded. To enable another user, add their `user.id` to `app_settings.intel_email_lookup_user_ids`. See [Build notes](#build-notes-2026-10-22).

When Intel can't find a person and offers **Create contact**, look the person up in the logged-in user's own stored Gmail and prefill the contact form from the signature in their most recent email — so the signature doesn't have to be pasted. Builds on the paste flow described in [KNOWLEDGE_CAPTURE.md](KNOWLEDGE_CAPTURE.md#detail-extraction--only-what-the-note-says).

## What the data looks like (measured 2026-10-22)

- `emails`: 30,824 rows (24,314 inbound), 2025-12-11 → today. `body_text` populated on all but 52.
- Mailboxes: two Gmail connections — Mike (21,342 visible emails) and Arty (14,622), both syncing. 5,140 emails are visible to both (same message in both inboxes).
- Ownership is `email_visibility (email_id, user_id)`, not a column on `emails`.
- 234 sender names map to more than one address; 249 addresses appear under more than one display name.

## 1. Finding the right person

**Both, in this order:**

1. **The note gave an email address** → exact, case-insensitive match on `sender_email`. Unambiguous.
2. **Name only** (the usual case) → match the normalised `sender_name` (case, whitespace, punctuation, "Last, First" flipped), inbound only, excluding `@oculusrep.com` and the user's own address.

**Never auto-pick when it's ambiguous.** If the name matches more than one sender address, Intel shows the choices — address, company domain, date of last email, e.g. *"Paul Rutledge · paul.rutledge@certifiedcre.com · last email Oct 19"* — and the user picks one or chooses "None of these". This covers two different people with the same name *and* one person with a work and a personal address. Zero matches → the form opens as it does today.

Fuzzy matching (nicknames, "Bob" vs "Robert") is out of scope for v1: a wrong guess puts a stranger's phone number on a contact.

## 2. Most recent email, literal details only, verified server-side

- Take the **single most recent inbound email** from the chosen address in the user's mailbox.
- **Strip quoted history first.** A reply's `body_text` usually contains the earlier thread, including *our own* signatures. Without stripping, "literally in the email" would pass Mike's own phone number from the quoted text. Extraction and verification both run against the sender's own new text only (cut at `On … wrote:`, `-----Original Message-----`, `From:/Sent:` blocks and `>` lines).
- Extraction uses the same model call and prompt rule as the paste flow, and **every field goes through the existing `verifyDetails()`** against that stripped text, with the same rules (literal email, digit-run phones with the 7-digit floor, word-boundary short fields). Anything not found is dropped. No new verification logic, so the existing tests keep covering it.
- The form says where the values came from (*"From Paul's email of Oct 19"*), and the user still reviews before saving. Nothing is written until they click Save.

**Known weakness:** the most recent email is often a one-line reply sent from a phone with no signature. Under the "most recent only" rule the form then opens with just the name. See decision A.

## 3. Whose mailbox — the logged-in user's only

**Don't rely on RLS for this — it's not strict enough.** The `emails_select` policy also lets any internal user read an email that's linked to a CRM object (`email_object_link`), whichever mailbox it came from. A lookup that just queried `emails` as the user would include Arty's linked emails when Mike searches.

So the lookup filters explicitly:

```sql
... FROM emails e
JOIN email_visibility v ON v.email_id = e.id
JOIN "user" u ON u.id = v.user_id
WHERE u.auth_user_id = auth.uid()          -- the caller, from their JWT
  AND e.direction = 'INBOUND' ...
```

- `user_id` comes from the caller's JWT on the server, never from the request body, so the browser can't ask for someone else's mailbox.
- An email that's in both inboxes (one of the 5,140) is legitimately in yours, so it counts for you.
- A per-persona test (Mike, Arty, VA with no mailbox) in a rolled-back transaction will prove Mike can't reach an email that's only in Arty's inbox, including a linked one. A user with no Gmail connection gets "no match", never someone else's mail.

## 4. Internal-only

Yes. It becomes a third action (`lookup_signature`) on the existing `ovis-knowledge-capture` edge function, behind the same `is_internal_user()` gate, which returns 403. The button only appears inside the Intel panel, which already hides itself from portal and coach users. No new table or grant is needed. If a helper RPC is added, it gets `REVOKE … FROM PUBLIC, anon` from the start.

## 5. Email triage classifier

**Not broken now.** In the last 14 days all 2,549 emails received are classified, with no classification errors in the last 7 days. The model still runs on Gemini (`_shared/gemini-agent.ts`): 1,187 `model_done` runs used ~14.8M input tokens, so billing is working again.

**It doesn't matter for this feature anyway.** The lookup reads `emails`, which `gmail-sync` fills whether or not the classifier runs. Classification only drives labels and CRM links. The one upstream thing that matters is tier-1 filtering in `gmail-sync`: mail it filters out is never stored, which could hide a sender who only ever sent bulk mail. That's an edge case for real people.

## 6. Effort

About **1–1.5 days** of build, plus a browser test session with you:

| piece | est. |
|---|---|
| `lookup_signature` action: mailbox-scoped query, candidate list, most-recent fetch | 2–3 h |
| Quoted-history stripper (Deno side) + tests on real reply shapes | 2–3 h |
| Extraction reusing the prompt + `verifyDetails()`; tests incl. "our own quoted signature must not leak" | 2 h |
| UI: "Look up in my email" on the Create contact row, candidate picker, source label | 2–3 h |
| Per-persona mailbox isolation test (rolled back) + docs | 1–2 h |

Model cost is one Sonnet call per lookup, well under a cent.

## Decisions needed before building

- **A. When the most recent email has no signature:** (a) strict — prefill only the name and say so; or (b) fall back to the most recent email from that sender *whose own text contains a signature*. Same verification either way. Recommendation: **(b)**, because (a) will often produce nothing. Your instruction was (a), though, so it's your call.
- **B. Automatic or on request:** run the lookup automatically when Create contact opens, or only when the user clicks "Look up in my email"? Recommendation: **on click** — it costs nothing until used, and the user sees exactly when their inbox is being read.

---

## Build notes (2026-10-22)

Decisions as approved: (A) fall back to the most recent email whose **own** text has a signature, within 12 months, else name only + "No signature found in the last 12 months."; (B) on click only. Then narrowed: **Mike's account only.**

### Access — two gates, both server-side
- **Allowlist:** `app_settings.intel_email_lookup_user_ids` — a JSON array of `"user".id`. Starts as Mike's only. To enable someone: append their `user.id` (no code change, no deploy). Must also pass `is_internal_user()`.
- `intel_email_lookup_allowed()` (definer) answers it; the UI uses it only to show the button. The edge action returns **403** when it's false, and every mailbox function re-checks and raises `42501` (also mapped to 403).
- **Mailbox scope:** `intel_mailbox_senders` / `intel_mailbox_emails_from` (invoker) join `email_visibility → "user"` on `auth_user_id = auth.uid()`. Required because the `emails_select` RLS policy lets internal users read CRM-linked emails from *another* mailbox (the test shows this loophole is live).

### Rolled-back test — `scripts/intel_email_lookup_mailbox_test.sql`
22 checks, all PASS against prod (2026-10-22), ending in ROLLBACK:
- Mike can plainly `SELECT` an Arty-only CRM-linked email (loophole real), but the lookup functions return 0 rows for it and its sender; positive control returns Mike's own mail, all of it in his inbox.
- Arty and the VA are internal, but the gate is false and all three functions refuse with 42501 (→ 403).
- Arty switched on inside the transaction still can't reach a Mike-only CRM-linked email, but does get his own.
- **Not done:** a live HTTP 403 as Arty/the VA (needs their sessions). The 403 mapping is unit-tested in `emailText_test.ts`.

### Stripping — `_shared/knowledge-capture/emailText.ts`
Cuts at Gmail/Apple `On … wrote:` (incl. wrapped), forwarded/original-message markers, Outlook `From:/Sent:` blocks (with or without an address), and `>` lines — matched mid-line too, because ~25% of long inbound bodies are flattened HTML on one line. Keeps a `-- ` signature Gmail puts *below* a `>` quote. Unit tests use three real stored emails (third parties redacted): a reply with Mike's signature quoted, a phone one-liner (Apple quote, no `>`), a flattened forward.

**Measured on 1,500 of Mike's inbound emails:** 126 contain his mobile; after stripping 11 still do — all automated mail (QuickBooks ×8, Mailchimp, a hotel booking, a helpdesk thread) that prints *our* details as the customer's with nothing to strip. Hence the last guard: `intel_internal_contact_points()` + `dropOurOwnDetails()` drop any Oculus email/company or internal user's phone from every result. 630/1,500 emails (42%) had a signature in their own text.

### Behaviour notes
- Name match = first AND last token after normalising ("Rutledge, Paul" flipped, ", CCIM" suffix dropped, middle initials ignored). A first name alone isn't searched. Excludes `@oculusrep.com` and the caller's own address.
- Bulk-mail relays appear as candidates (e.g. a Constant Contact `…@shared1.ccsend.com` address for "Paul Rutledge"); you pick. The From address itself is never prefilled — only what the signature text says.
- Up to 200 emails scanned per sender, one model call (Sonnet 5, low effort) on the first with a signature; ~1–2 s of SQL on Mike's mailbox.
