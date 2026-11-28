# "Paste signature" in the contact form — PLAN

**Status (2026-10-28):** LIVE — merged to main; edge function `ovis-knowledge-capture` redeployed from main. Decisions: (A) edit mode fills empty fields only and reports filled/skipped; (B) contacts screen (`ContactOverviewTab`) is the follow-on — not done; (C) deal- and client-sidebar attach bugs fixed; create mode overwrites only the fields found. Migration `20261026092943_intel_internal_contact_points_all_internal` applied + recorded (persona test `scripts/intel_contact_points_persona_test.sql`: 22/22).

A box inside `ContactFormModal`: paste a signature block and the form fills in. Same extraction as Intel and the same `verifyDetails()` rules, so only details literally in the pasted text are used. Nothing is filed; the user reviews and saves as normal.

## Where ContactFormModal opens (main @ `202eb894`)

Because the box lives inside `ContactFormModal`, it appears everywhere the form opens in **create** mode, with no per-screen work. What each screen does with the saved contact is unchanged — and that's where two existing bugs show up.

| # | Screen | File | Create / edit | New contact attaches to | Box works? |
|---|---|---|---|---|---|
| 1 | Property sidebar | `property/PropertySidebar.tsx` | both | property (`propertyId` → `property_contact`) | ✅ |
| 2 | Property contacts sidebar, "create new" | `property/StaticContactsSidebar.tsx` | create | property | ✅ |
| 3 | Add Contact to Property → create | `property/AddPropertyContactModal.tsx` (from `PropertyContactsTab`) | create | property | ✅ |
| 4 | Property contacts tab | `property/PropertyContactsTab.tsx` | **edit only** | — | see decision A |
| 5 | Map pin slideout | `mapping/slideouts/PinDetailsSlideout.tsx` | both | property | ✅ |
| 6 | Map page contact slideout | `pages/MappingPageNew.tsx` | both (no backdrop) | property | ✅ |
| 7 | Site submit contacts tab | `shared/SiteSubmitContactsTab.tsx` | both | property, or the **deal** when "create for deal" | ✅ |
| 8 | Deal sidebar, "create new" | `DealSidebar.tsx` | create | **nothing — existing bug** | ✅ box, ❌ attach |
| 9 | Client sidebar | `ClientSidebar.tsx` | both | **nothing — existing bug** | ✅ box, ❌ attach |
| 10 | Intel "Create contact" | `knowledgeCapture/KnowledgeCaptureLauncher.tsx` | create | Intel links it | ✅ (stacks with the email-lookup note) |
| — | **Contacts screen** (Navbar → New Contact) | `pages/ContactDetailsPage.tsx` → `ContactOverviewTab.tsx` | create | — | ❌ **doesn't use ContactFormModal** — see decision B |

### Existing bugs found (not caused by this feature)
- **Deal sidebar (#8):** "create new" saves the contact, then only re-reads `deal_contact`. Nothing inserts a `deal_contact` row, so the new contact isn't attached to the deal and doesn't appear on it.
- **Client sidebar (#9):** passes `clientId={clientId}`, but `ContactFormModal` has no `clientId` prop (it's silently ignored — Vite doesn't typecheck). The contact saves with `client_id = null` unless the user picks the client in the form's dropdown; then the page reloads.

"The contact still attaches to whatever record I opened it from" is already false on these two screens. See decision C.

## How it works

- **Box:** a collapsible "Paste signature" textarea at the top of the form, create mode only by default. A **Fill form** button sends the text to the server.
- **Server:** a new `parse_signature` action on `ovis-knowledge-capture`, behind the same `is_internal_user()` gate (403 otherwise). It reuses:
  - the Intel signature prompt (adapted: no known sender);
  - `verifyDetails()` against the pasted text exactly — literal email, digit-run phones with the 7-digit floor, word-boundary short fields like state;
  - `dropOurOwnDetails()` — never an `@oculusrep.com` address, "Oculus" company, or an internal user's phone.
- **Name too:** the form needs first and last name, which `verifyDetails()` doesn't cover. Add a name check: the proposed name must appear literally in the paste, then split as Intel already does.
- **Address:** the form has mailing street/city/state/zip, so the verified address fields fill those.
- **More than one signature in the paste** (e.g. a pasted thread): the form fills nothing and asks the user to paste just one. It doesn't guess whose signature is meant.
- **Nothing written:** no `knowledge_entry`, no correction row. It only sets form state. Saving and attaching are unchanged.
- **UI gate:** the box only renders for internal roles (same list as Intel). Portal and coach users never see it.

### One database change needed
`intel_internal_contact_points()` (the Oculus filter's data) is currently gated by the **email-lookup allowlist — Mike only**. For everyone else the filter would fail closed (403), so paste would break for Arty and the VA. Change its gate to `is_internal_user()`; the data is internal users' own emails and phones, which internal users can see anyway. Migration file + psql + record, per CLAUDE.md. A rolled-back persona test will show it's allowed for Mike, Arty and the VA, refused for portal and coach, and denied for anon.

## Effort

| piece | est. |
|---|---|
| `parse_signature` action + name verification + multi-signature check; unit tests on real signature shapes | 2–3 h |
| Migration: re-gate `intel_internal_contact_points()` + rolled-back persona test | 1 h |
| Box in `ContactFormModal`: role gate, fill behaviour, source note, loading/error | 2 h |
| Check all 10 entry points render it sensibly (narrow slideouts, map page with no backdrop, Intel stacking) | 1 h + Mike's browser pass |
| **Subtotal (ContactFormModal screens)** | **~1 day** |
| Contacts screen `/contact/new` (different form, `ContactOverviewTab`) — if wanted | +2–3 h |
| Fix the deal-sidebar and client-sidebar attach bugs — if wanted | +1–2 h |

Cost: one Sonnet call per paste, well under a cent.

## Decisions needed

- **A. Edit mode.** Show the box when editing an existing contact? Recommendation: **create only** for v1. If wanted in edit mode, it should fill **empty fields only**, so a paste can't silently overwrite good data.
- **B. Contacts screen.** "Contacts screen" (Navbar → New Contact) uses a different form. Include it (+2–3 h), or ship the ContactFormModal screens first? Recommendation: **ship first, add after**.
- **C. The two attach bugs.** Fix them in this branch (+1–2 h), or separately? Recommendation: **fix here**, since "attaches to whatever record I opened it from" is part of the ask and is currently false for deals and clients.
- **Fill behaviour (create mode):** recommendation — a paste overwrites the fields it found and leaves the rest alone, and a note lists what it filled so you can check before saving.

## Follow-on: contacts screen + company fill (2026-10-29, branch feature/contacts-screen-paste-signature — NOT merged)

- **Contacts screen.** `ContactOverviewTab` (Navbar → New Contact, and the contact detail page) now renders the same `PasteSignatureBox`, calling the same `parse_signature` action. Same rules: a new contact takes every found field; an existing contact fills empty fields only, and the note lists filled vs skipped. Because this screen auto-saves, an existing contact's filled fields are written in ONE update (not one per field).
- **Company not filling.** Production rows couldn't be read to confirm the failing email, so the fix covers the shapes signatures actually use, all still literal-text-verified:
  - company on the title line ("Vice President | Acme Realty") — the prompt now says to split it out;
  - company only in a logo — Gmail's plain text shows it as `[image: Acme Realty]`; the prompt now uses it, and `verifyCompany()` drops a trailing "Logo" and rejects generic labels (`logo`, `image001.png`);
  - punctuation differences ("Acme Realty Partners LLC" vs "…, LLC") no longer fail verification — company is compared word-by-word, whole words only.
  - Never derived from the email domain. The Oculus filter is unchanged.
  - Applies to Intel "Look up in my email", Paste signature, and note filing (all use `verifyDetails`). Needs an `ovis-knowledge-capture` deploy to take effect.
