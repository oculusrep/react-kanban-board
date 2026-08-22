# BOR Deal — QuickBooks Online Setup Checklist

Click-by-click setup for the Broker of Record pass-through accounting. Build these in QBO **before** the OVIS edge functions are wired. Companion to [BOR_DEAL_FEATURE_SPEC.md](BOR_DEAL_FEATURE_SPEC.md) §5.

**Goal:** collect the full commission, keep a flat BOR Fee as income, pass the rest to the referring broker — with the pass-through money flowing through a liability so it never inflates revenue.

---

## What you're building

| # | Object | QBO type | Role |
|---|--------|----------|------|
| 1 | **BOR Pass-Through Clearing** | Account → Other Current Liability | Holding tank for collected commission you don't own |
| 2 | **BOR Referral Income** | Account → Income | Where your flat BOR Fee lands as real revenue |
| 3 | **BOR Commission (Pass-Through)** | Product/Service item | Invoice line that deposits money into account #1 |
| 4 | Each referring broker | Client + commission mapping **in OVIS** (not QBO) | OVIS auto-creates the QB vendor at first disbursement |

---

## Step 1 — Create the liability account

1. **Accounting → Chart of Accounts → New**.
2. **Account type:** `Other Current Liabilities`.
3. **Detail type:** `Trust Accounts - Liabilities` (or `Other Current Liabilities` if that detail type isn't offered).
4. **Name:** `BOR Pass-Through Clearing`.
5. **Description (optional):** "Commission collected as Broker of Record and owed onward to referring brokers. Nets to $0 per deal."
6. Save. Leave opening balance blank.

## Step 2 — Create the income account

1. **Chart of Accounts → New**.
2. **Account type:** `Income`.
3. **Detail type:** `Service/Fee Income`.
4. **Name:** `BOR Referral Income`.
5. **Description (optional):** "Oculus's flat Broker-of-Record fee. Administrative income; excluded from sales/GCI metrics."
6. Save.

## Step 3 — Create the pass-through invoice item

This is the one with the trick: its income account points at the **liability**, so invoicing deposits money into the holding tank instead of booking revenue.

1. **Sales → Products & Services → New → Service** (Non-inventory is fine too; Service is cleanest).
2. **Name:** `BOR Commission (Pass-Through)`.
3. Leave **Sales price/rate** blank (entered per invoice).
4. **Income account:** select **`BOR Pass-Through Clearing`** (the liability from Step 1).
   - QBO allows a liability account here — it's the same mechanism used for customer deposits/retainers. If the dropdown hides it, type the name to filter.
5. **Sales tax:** Nontaxable (a commission collection isn't a taxable sale) — confirm with your setup.
6. Save.

> ✅ **Verify:** create a $1 test invoice using this item to a dummy customer. Open **Reports → Transaction Journal** on that invoice — it should show **Dr Accounts Receivable / Cr BOR Pass-Through Clearing** (NOT a credit to any income account). Delete the test invoice after.

## Step 4 — Referring brokers: set up in OVIS, not QBO

You do **not** need to create these vendors in QuickBooks by hand. OVIS auto-creates the QB vendor the first time you disburse (via `findOrCreateVendor`). Instead, per broker (one-time each):

1. Add the out-of-state broker as a **Client** in OVIS (on a BOR deal, the Client field = the referring broker / payee).
2. Create a **commission mapping** (admin → CommissionMapping): entity type = **referral partner**, payment method = **bill**, vendor left blank (auto-created) or linked if it already exists.
3. **Debit account = BOR Pass-Through Clearing.** ⚠️ The current mapping UI lists only *expense* accounts in the debit dropdown, so the liability may not be selectable there. Per the spec, the **BOR edge-function branch forces the debit to the clearing liability**, so this is handled in code — you don't have to pick it in the UI. (Optionally 1099-track the broker on the auto-created vendor later.)

---

## How a live deal flows (reference — $100k commission, $5k fee)

| Step | You do in QBO (or OVIS triggers) | Result |
|------|----------------------------------|--------|
| 1 | Invoice payer, one line, item = **BOR Commission (Pass-Through)**, amount $100,000 | Dr A/R 100k / Cr Clearing 100k |
| 2 | Receive payment on the invoice | Dr Bank 100k / Cr A/R 100k |
| 3 | Bill the broker vendor $95,000, **Category = BOR Pass-Through Clearing**, then pay it | Clearing 100k → 5k; Bank +5k net |
| 4 | **Journal Entry:** Dr `BOR Pass-Through Clearing` 5,000 / Cr `BOR Referral Income` 5,000 | Clearing → 0; Income +5k |

**End state:** clearing liability **$0**, income **$5,000**, gross-commission accounts untouched.

### The journal entry (Step 4), field by field

**+ New → Journal Entry**, dated to the **cash receipt date** (recommended) or disbursement date:

| Line | Account | Debit | Credit |
|------|---------|-------|--------|
| 1 | BOR Pass-Through Clearing | 5,000.00 | |
| 2 | BOR Referral Income | | 5,000.00 |

Memo: `BOR fee — <deal name>`. Save.

---

## Cash-basis note

Oculus files on a cash basis; this setup is compatible:
- The invoice→liability mapping means **no revenue is recognized at collection** (the $100k never shows as income).
- The Step 4 JE touches a plain liability + income (not A/R/A/P), so it **appears on cash-basis reports on its date**.
- **Date the JE to when you receive/keep the cash** to avoid year-end straddle if a collection and disbursement fall in different tax years.

**One question for your accountant:** *For BOR pass-throughs, recognize our flat fee on the receipt date or the disbursement date?* (Affects only the JE date.)

---

## Setup checklist

- [ ] Account: `BOR Pass-Through Clearing` (Other Current Liability)
- [ ] Account: `BOR Referral Income` (Income)
- [ ] Item: `BOR Commission (Pass-Through)` → income account = the liability
- [ ] Verified via $1 test invoice's Transaction Journal, then deleted it
- [ ] Referring broker(s) added as Clients + commission mappings **in OVIS** (QB vendor auto-created at first disbursement — no manual QBO vendor needed)
- [ ] Noted the account names/IDs to hand to implementation for the BOR edge-function config (clearing liability + income account)
