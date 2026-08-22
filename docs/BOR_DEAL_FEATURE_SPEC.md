# Broker of Record (BOR) Deal — Feature Spec

**Status:** Draft (requirements confirmed with Mike 2026-08-18; pending implementation)
**Owner:** Mike
**Related:** [SITE_SUBMIT_DEAL_DATA_OWNERSHIP.md](SITE_SUBMIT_DEAL_DATA_OWNERSHIP.md), OVIS QuickBooks integration

---

## 1. Background & Problem

Oculus sometimes acts as **Broker of Record (BOR)** for out-of-state brokers who are not licensed to transact in Georgia. In these engagements Oculus:

1. Invoices and collects the **full commission** on the deal (as it would any commission), because the out-of-state broker legally cannot.
2. Keeps a **small flat fee** (the **BOR Fee** / "Oculus Fee") as compensation for lending the license.
3. **Passes the remainder** of the collected commission on to the referring (out-of-state) broker.

We need a fast way to record these as real deals — invoiced, collected, and disbursed through OVIS + QuickBooks like any other deal — **without** the pass-through commission polluting Oculus's sales metrics.

### The key modeling insight

The **existing OVIS referral-fee model is the inverse** of the BOR case:

| | Normal deal | BOR deal |
|---|---|---|
| Full commission | Oculus GCI (revenue) | **Pass-through** (not Oculus revenue) |
| Referral fee | small amount paid **out** | — |
| Oculus keeps | most of it | **only the flat BOR Fee** |

So the BOR Fee — not the full commission — is the only amount economically relevant to Oculus. The existing QB **disbursement plumbing** (mark-paid checkbox → QB Bill to a partner via `qb_commission_mapping`) maps cleanly onto "pass the money on to the referring broker." The parts that need new work are **income recognition** (only the BOR Fee is revenue) and **metrics exclusion**.

---

## 2. Confirmed Requirements (decisions locked 2026-08-18)

| # | Decision | Choice |
|---|----------|--------|
| 1 | **BOR Fee input** | **Flat dollar amount** (typed directly; not a %). |
| 2 | **Who is invoiced** | Full Calculated Fee is invoiced to a **separate Bill-To** (the actual paying party). `Client` field = the **Referral Partner (payee)**, so the payer must be entered separately. |
| 3 | **QB accounting model** | **Pass-through / split**: BOR Fee → real income account; the rest → a **liability/clearing** account. Broker's Bill draws down the liability. QB revenue never inflates. |
| 4 | **Pipeline & metrics** | BOR deals live on the **same Kanban board**; card + column totals show **only the BOR Fee**. Dashboards/GCI reports **filter out** the BOR transaction type so sales metrics aren't skewed. |
| 5 | **Payment structure** | **Mirror the underlying deal's schedule** — full multi-installment support; each installment separately invoiced/disbursed. |
| 6 | **BOR Fee timing across installments** | **Entered per payment manually** (deal-level BOR Fee is a default/total; each installment has its own editable BOR Fee). |
| 7 | **Customer-facing invoice** | **Single clean "Commission" line** for the full amount (booked to the clearing liability). BOR Fee is recognized as income **internally via a journal entry** at disbursement — the payer never sees Oculus's cut. |

---

## 3. Data Model

### 3.1 New transaction type

Insert one row into `transaction_type`:

```sql
INSERT INTO transaction_type (id, label, description, active, sort_order)
VALUES (gen_random_uuid(), 'BOR Referral Fee',
        'Broker of Record pass-through: Oculus invoices/collects full commission, keeps a flat BOR Fee, remits the rest to the referring broker.',
        true, <next sort_order>);
```

This `transaction_type_id` on `deal` is the single source of truth for "this is a BOR deal" and drives all conditional UI + metrics filtering.

### 3.2 New columns

Add BOR-specific columns rather than overloading the existing `referral_fee_*` / GCI fields — the normal commission-split math (`agci = fee - referral_fee_usd - house_usd`) must **not** be reused for BOR, to avoid corrupting existing calculations and metrics.

**On `deal`:**
- `bor_fee_usd` (numeric, nullable) — the flat BOR Fee (total / default). This is the value shown on the Kanban card.

**On `payment`:**
- `bor_fee_usd` (numeric, nullable) — the BOR Fee taken from **this** installment (manually entered). Defaults from the deal-level value for a single-payment deal; entered per installment for multi-payment deals.
- **Semantics for BOR:** `payment.payment_amount` = the **full commission installment collected** (not an Oculus-GCI share, as on normal deals — because on a BOR deal Oculus collects the whole commission).
- Derived per payment: **pass-through to the broker** = `payment.payment_amount − payment.bor_fee_usd`. This is a subtraction, **not** the percentage calc the current disbursement path uses (see §5.2).

**Reused as-is:**
- `deal.deal_value`, `deal.commission_percent`, `deal.flat_fee_override`, `deal.calculated_fee`, `deal.fee` — the "Calculated Fee" = **full commission collected** (Deal Value × Commission %, or Flat Fee Override). Displayed exactly like today.
- `deal.client_id` — repurposed as the **Referral Partner (payee)** for BOR deals.
- `deal.referral_payee_client_id` — **set equal to `client_id`** on BOR deal save. The existing disbursement flow ([usePaymentDisbursement.ts](../src/hooks/usePaymentDisbursement.ts) → `quickbooks-create-referral-entry`) looks the payee up here, so setting it lets us reuse that flow verbatim. *(Resolved: reuse `referral_payee_client_id` rather than re-keying off `client_id`.)*
- `deal.deal_team_id` — FK to the `deal_team` lookup; purely informational (no commission math). BOR deals **always default to the "Mike" deal team** = `6574f79d-0127-4c6f-b832-cd2e666cd8b9` (label `Mike`; not "Mike & Arty" / "Mike & Greg"). Prefilled on create, still editable. No schema change.
- Bill-To fields (`bill_to_company_name`, `bill_to_contact_name`, `bill_to_email`, …) — the **paying party** for the invoice. Captured on the invoice/payment section, **not** the minimal details form.

### 3.3 What BOR deals do NOT use

- **No `commission_split` rows** (no brokers). All AGCI concepts are inapplicable.
- **No** house/origination/site/deal split percentages — hidden on the form.

---

## 4. UX / Front-End

### 4.1 Deal menu — "New BOR Deal"

In [src/components/Navbar.tsx](../src/components/Navbar.tsx) (~line 365, the "Add New Deal" item), add a sibling **"New BOR Deal"** item. It navigates to the deal-new route with a flag, e.g. `/deal/new?type=bor` (handled in [src/pages/DealDetailsPage.tsx](../src/pages/DealDetailsPage.tsx)), which pre-selects `transaction_type = 'BOR Referral Fee'` and renders the minimal BOR form variant.

### 4.2 Minimal BOR details form

Same underlying deal form ([src/components/DealDetailsForm.tsx](../src/components/DealDetailsForm.tsx)) with a **BOR variant that hides fields** based on `transaction_type`. Shown fields:

**Details:**
- **Deal Name**
- **Client** — labeled **"Referral Partner"** in BOR mode (the out-of-state broker / payee)
- **Property** (optional)
- **Deal Team** — **always defaults to "Mike"** (`deal_team_id = 6574f79d-0127-4c6f-b832-cd2e666cd8b9`); prefilled on create, editable

**Financials:**
- **Deal Value**
- **Commission %**
- **Flat Fee Override**
- **Calculated Fee** — full commission collected (unchanged behavior)
- **BOR Fee** *(new, flat $)* — Oculus's kept compensation; the Kanban value

**Hidden in BOR mode:** referral %, house/origination/site/deal splits, broker split editor.

### 4.3 Kanban

In [src/components/KanbanColumn.tsx](../src/components/KanbanColumn.tsx) / [src/hooks/useKanbanData.ts](../src/hooks/useKanbanData.ts): when `transaction_type = 'BOR Referral Fee'`, the card value renders `deal.bor_fee_usd` (the Oculus Fee) instead of `deal.deal_value`. Column subtotals reflect the same. BOR deals flow through the **same stage columns** as normal deals (no new stages). *(Optional nicety: a subtle "BOR" tag on the card — not required per decision #4, which chose no badge.)*

### 4.4 Files & Contacts

Unchanged — reuse existing Dropbox [FileManager](../src/components/FileManager/FileManager.tsx) (`entityType='deal'`) and `contact_deal_role` contacts exactly as on normal deals. No brokers are associated; the referral partner is a `client` (payee). **No new contact role** — if the broker is added as a deal contact, use an existing role (e.g. Broker/Agent). (Resolved: reuse existing roles, don't add a "Referral Partner" role.)

---

## 5. QuickBooks Flow (pass-through accounting)

### 5.1 One-time QB setup

1. **Income account:** `BOR Referral Income` (Income) — where Oculus's BOR Fee lands.
2. **Clearing account:** `BOR Pass-Through Clearing` (Other Current Liability) — holds collected commission that isn't Oculus revenue.
3. An **invoice item** mapped to the clearing liability account (so the invoice line credits the liability, not income).
4. Per referring broker: add them as a **Client** in OVIS + a `qb_commission_mapping` row (`entity_type='referral_partner'`, `client_id` = the partner, `payment_method='bill'`). The QB **vendor is auto-created** at first disbursement via `findOrCreateVendor` ([_shared/quickbooks.ts:723](../supabase/functions/_shared/quickbooks.ts#L723)) — no manual QBO vendor needed.
   - ⚠️ **Debit account = the clearing liability**, but the existing `CommissionMappingAdmin` debit dropdown lists only *expense* accounts, so the liability isn't selectable there. **The BOR edge-function branch forces the debit to `BOR Pass-Through Clearing`** (config/constant), ignoring the mapping's debit field. No mapping-UI change required. *(Alternative: extend the UI to offer liability accounts for BOR partners — not chosen.)*

### 5.2 Per-installment lifecycle

For each `payment`:

1. **Invoice (single clean line).** Create a QB Invoice to the **Bill-To** party for this installment's full commission share, as **one "Commission" line booked to the clearing liability**. Payer sees only the total; no BOR-Fee breakdown.
   - Extends the existing invoice-creation edge function with a BOR variant (line item → clearing-liability item).
2. **Collect.** Payment received → cash in, clearing liability up. (Standard AR receipt.)
3. **Disburse (the checkbox).** Mark the payment's **"Pay Referral Partner"** checkbox → reuse [usePaymentDisbursement.ts](../src/hooks/usePaymentDisbursement.ts) `createQBReferralEntry` flow (writes `payment.referral_fee_paid` + date, invokes `quickbooks-create-referral-entry`; payee = `deal.referral_payee_client_id`) to create a **QB Bill to the broker (vendor)** for the **pass-through amount**, **debiting the clearing liability**.
   - ⚠️ **Amount-calc change required.** The current edge function computes the payout as `payment_amount × deal.referral_fee_percent / 100`. BOR is **not** percentage-based — add a BOR branch: **pass-through = `payment.payment_amount − payment.bor_fee_usd`**.
   - The BOR branch **forces the Bill's debit account to `BOR Pass-Through Clearing`** (not the mapping's expense-only debit field; see §5.1.4). The QB vendor is auto-created from the client if not yet linked.
4. **Recognize BOR Fee income.** At disbursement (the moment the checkbox fires — confirmed recognition point), also post a **Journal Entry**: debit clearing liability, credit `BOR Referral Income`, for `payment.bor_fee_usd`.
   - Net effect on the clearing liability per installment = 0 (up by full commission at invoice; down by pass-through + BOR Fee). Oculus income recognized = BOR Fee only.

New/edited edge functions:
- Invoice creation — BOR variant (single line → clearing-liability item).
- `quickbooks-create-referral-entry` (or a BOR sibling) — BOR branch: Bill to broker for `payment_amount − bor_fee_usd` debiting the clearing liability, **plus** the BOR-Fee income journal entry.

### 5.3 Accounting mechanics (worked entries)

Example: **$100,000** commission collected, **$5,000** BOR Fee, **$95,000** passed through.

Oculus is an **agent/conduit** on the $95k — money collected but owed onward is a **liability**, not revenue. Only the $5k fee is income. The clearing liability is a holding tank that returns to **$0** once each deal is fully settled.

| Step | Trigger | Debit | Credit |
|------|---------|-------|--------|
| 1. Invoice payer (single line, pass-through item) | Invoice created | Accounts Receivable 100,000 | BOR Pass-Through Clearing 100,000 |
| 2. Payer pays | Payment received | Bank 100,000 | Accounts Receivable 100,000 |
| 3a. Bill the broker | "Pay Referral Partner" checkbox | BOR Pass-Through Clearing 95,000 | Accounts Payable 95,000 |
| 3b. Pay the bill | Bill paid | Accounts Payable 95,000 | Bank 95,000 |
| 4. **Recognize BOR Fee (the JE)** | At recognition date (see below) | **BOR Pass-Through Clearing 5,000** | **BOR Referral Income 5,000** |

Ending balances: clearing liability **0**, bank **+5,000**, BOR Referral Income **+5,000**. Gross-commission income accounts are never touched.

Per installment the same pattern runs with `payment.payment_amount` = the full commission installment and `payment.bor_fee_usd` = that installment's fee; pass-through Bill = `payment_amount − bor_fee_usd`.

### 5.4 Cash-basis handling

Oculus files taxes on a **cash basis**. This structure is fully cash-basis compatible:

- **No phantom income at collection.** The Step 1 invoice line maps to the *liability*, so when the payer pays (Step 2) nothing hits the income statement — the $100k never appears as revenue. ✅
- **The Step 4 JE posts to cash-basis reports.** It touches a regular liability + an income account (neither A/R nor A/P), so QBO shows it on the cash-basis P&L on the JE's **date**.
- **Recognition date = the JE date.** Set it to **when the cash is received/kept** (recommended) so recognition aligns with when Oculus actually holds the money and avoids year-end ambiguity when a collection and its disbursement straddle Dec 31. Mechanically identical JE; only the date differs.

**Open accountant question (one line):** *For BOR pass-throughs, recognize our flat fee on the receipt date or the disbursement date?* This only affects the JE date, not the account setup.

---

## 6. Metrics & Reporting

- All GCI / Gross Commission dashboards and pipeline-value metrics must **exclude** deals where `transaction_type = 'BOR Referral Fee'`. Add the filter wherever commission metrics are computed (see the GCI consumers noted in research: commission calc hooks, breakdown bars, pipeline/velocity dashboards).
- BOR deals stay "on the radar" via the **Kanban** (card shows the incoming BOR Fee) and, optionally, a small **BOR income** widget/report that sums `bor_fee_usd`. The BOR Fee is treated as **administrative income**, not earned sales commission, so it is intentionally kept out of sales KPIs.

---

## 7. Worked Example

- Full commission collected: **$100,000** (Deal Value × Commission %, or Flat Fee Override → `calculated_fee`).
- BOR Fee (flat): **$5,000** (`deal.bor_fee_usd`).
- Single installment for simplicity.

| Step | QB effect | Oculus revenue |
|------|-----------|----------------|
| Invoice payer, 1 line "Commission" $100k → clearing liability | AR $100k / Clearing +$100k | $0 |
| Collect | Cash +$100k / AR −$100k | $0 |
| Pay broker (checkbox): Bill $95k, debit clearing | Clearing −$95k / A/P $95k → paid | $0 |
| Recognize BOR Fee: JE debit clearing $5k, credit BOR Referral Income | Clearing −$5k / Income +$5k | **$5,000** |
| **Net** | Clearing $0 | **$5,000** |

Kanban card shows **$5,000**. GCI dashboards show **$0** from this deal (filtered out).

---

## 8. Implementation Checklist

- [x] Migration: add `transaction_type` row `'BOR Referral Fee'` (fixed id `71c1b4eb…`, applied).
- [x] Migration: `deal.bor_fee_usd`, `payment.bor_fee_usd` (applied — `20260819100000_bor_deal_support.sql`).
- [x] Navbar: "Add New BOR Deal" menu item → `/deal/new?type=bor`.
- [x] DealDetailsPage: prefill BOR transaction type + Deal Team = Mike; "New BOR Deal" title.
- [x] DealDetailsForm BOR variant: relabel Client→"Referral Partner", hide Property Unit / Site Submit / Transaction Type, add **BOR Fee** field (persisted in all save/insert payloads). Shared constants in `src/lib/bor.ts`.
- [x] Overview tab slimmed for BOR: hide Forecasting section + LOI Written/Signed + Contract X Date fields (kept Stage, Target Close, Booked, Closed, Loss Reason).
- [x] Commission tab BOR variant: `CommissionSplitSection` hidden; `CommissionDetailsSection` slim view (full commission, commission %, BOR Fee, computed pass-through, # payments) for BOR.
- [x] Kanban: card amount + column totals use `bor_fee_usd` for BOR deals (`kanbanAmount` helper in KanbanBoard); deal-value line hidden on BOR cards.
- [ ] Payment tab: per-installment editable BOR Fee; derived pass-through; "Pay Referral Partner" checkbox. (Note: "Payment Management" section on the Commission tab still says "based on commission splits" — reword for BOR here.)
- [ ] QB: create `BOR Referral Income` (income) + `BOR Pass-Through Clearing` (liability) accounts + clearing invoice item.
- [ ] Edge fn: BOR invoice variant (clearing-liability line).
- [ ] On BOR deal save: set `referral_payee_client_id = client_id`; prefill `deal_team_id` = Mike.
- [ ] Edge fn: disbursement BOR branch — Bill to broker for `payment_amount − bor_fee_usd` (debit clearing) + BOR-Fee income journal entry.
- [ ] `qb_commission_mapping` setup per referral partner (debit = clearing liability).
- [ ] Metrics: exclude `'BOR Referral Fee'` transaction type from all GCI/pipeline commission metrics.
- [ ] (Optional) BOR income widget/report summing `bor_fee_usd`.

---

## 9. Refinements (resolved 2026-08-18)

1. **Disbursement key** — ✅ Reuse `deal.referral_payee_client_id` (set = `client_id` on BOR save); reuse the existing `quickbooks-create-referral-entry` flow, changing only the amount calc to `payment_amount − bor_fee_usd` (§5.2).
2. **"Deal Team"** — ✅ `deal.deal_team_id`, a FK to `deal_team`, purely informational (no commission math). BOR deals **always default to "Mike"** (`6574f79d-0127-4c6f-b832-cd2e666cd8b9`); prefilled on create, editable. No schema change.
3. **BOR income recognition timing** — ✅ At **disbursement** (the "Pay Referral Partner" checkbox), via the journal entry in §5.2 step 4.
4. **Contact role** — ✅ No new role. Referral partner is the `client`/payee; if added as a deal contact, use an existing role.

### Still to confirm (not blocking build)

- **JE recognition date (accountant, one line):** recognize the BOR Fee on the **receipt date** or the **disbursement date**? Affects only the Step 4 JE date, not the account structure (§5.4). Recommended: receipt date, to avoid year-end straddle.
- **1099 treatment of the $95k pass-through** — whether Oculus 1099s the broker for the forwarded commission, or the broker reports it themselves. Using a Vendor Bill (Step 3) preserves either option.

QBO account structure is settled (§5.1, §5.3) — see [BOR_QBO_SETUP_CHECKLIST.md](BOR_QBO_SETUP_CHECKLIST.md) to build it.
