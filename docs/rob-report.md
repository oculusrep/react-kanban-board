# Rob Report

## Overview

The Rob Report is a deal pipeline and commission summary report that provides a high-level view of deals by stage and payment status, with broker net breakdowns for Mike Minihan, Arty Santos, and Greg Bennett.

## Access

- **Route**: `/reports/rob-report`
- **Permission Required**: `can_view_rob_report`
- **Default Access**: Restricted (must be explicitly granted)

---

## Report Sections

### Pipeline Section

Displays deal-level data organized by stage category:

| Row | Description | Date Filter |
|-----|-------------|-------------|
| **Booked/Closed** | Deals in Booked, Executed Payable, or Closed Paid stages | `booked_date` in current year |
| **UC/Contingent** | Deals in Under Contract / Contingent stage | No date filter |
| **Pipeline 50%+** | Deals in Negotiating LOI or At Lease/PSA stages | No date filter |

#### Pipeline Columns

- **Stage**: Category label (with missing splits warning count)
- **GCI**: Sum of `deal.gci`
- **AGCI**: Sum of `deal.agci`
- **House $**: Sum of `deal.house_usd`
- **Mike Net**: Sum of `commission_split.split_broker_total` for Mike Minihan
- **Arty Net**: Sum of `commission_split.split_broker_total` for Arty Santos
- **Greg Net**: Sum of `commission_split.split_broker_total` for Greg Bennett
- **# Deals**: Count of deals where Greg has NO split (or zero split)
- **Volume**: Sum of `deal.deal_value`

#### Expandable Pipeline Rows

Each pipeline row can be expanded by clicking to show individual deals with:
- Deal name (clickable - opens DealDetailsSlideout)
- Stage label
- All numeric columns (GCI, AGCI, House $, broker nets, Volume)
- Edit/Add Splits button for commission split management
- Subtotal row at the bottom of each expanded section

### Payments Section

Displays payment-level data:

| Row | Description | Filter Criteria |
|-----|-------------|-----------------|
| **Collected** | Payments that have been received | `payment_received_date` in current year |
| **Invoiced Payments** | Pending payments on booked deals | `payment_received_date` IS NULL AND `payment_received` = false, on Booked or Executed Payable stage deals |

#### Payments Columns

- **Category**: Row label (with overdue warning count for Invoiced Payments)
- **GCI**: Sum of `payment.payment_amount - payment.referral_fee_usd`
- **AGCI**: Sum of `payment.agci`
- **House $**: Sum of `payment.agci * deal.house_percent`
- **Mike Net**: Sum of `payment_split.split_broker_total` for Mike Minihan
- **Arty Net**: Sum of `payment_split.split_broker_total` for Arty Santos
- **Greg Net**: Sum of `payment_split.split_broker_total` for Greg Bennett
- **Date**: Payment received date (Collected) or estimated date (Invoiced)

Note: # Deals and Volume columns are not shown in the Payments section.

#### Expandable Payment Rows

Each payment row can be expanded by clicking to show individual payments with:
- Deal name (clickable - opens DealDetailsSlideout to Payments tab)
- Payment name with invoice number (e.g., "Payment 1 INV 12345" in green)
- All numeric columns (GCI, AGCI, House $, broker nets)
- Date column:
  - Collected: Shows payment received date (read-only)
  - Invoiced: Shows estimated date (editable inline - click to edit)
- Subtotal row at the bottom of each expanded section

---

## Interactive Features

### Missing Commission Splits Warning

Deals without commission splits (or with all $0 splits) are flagged with orange warnings:
- Warning count shown inline with category name: `Booked/Closed ⚠️ 2`
- Expanded rows have orange background and border
- Warning icon (⚠️) appears before deal name
- "+ Add Splits" button (orange) to quickly add splits

Exception: Deals marked as "House Only" are not flagged as missing splits.

### Overdue Payment Warning

Invoiced Payments with missing or past-due estimated dates are flagged:
- Warning count shown inline with category name: `Invoiced Payments ⚠️ 3`
- Expanded rows have orange background and border
- Warning icon (⚠️) appears before deal name
- Date field shows in orange text

A payment is considered overdue if:
- `payment_date_estimated` is NULL, OR
- `payment_date_estimated` is before today's date

### Inline Date Editing (Invoiced Payments)

The estimated payment date can be edited directly in the expanded rows:
1. Click on the date field
2. A date picker appears
3. Select new date
4. Press Enter or click away to save
5. Press Escape to cancel

### Deal Slideout Integration

Clicking on a deal name opens the DealDetailsSlideout:
- Pipeline rows: Opens to Overview tab
- Payment rows: Opens to Payments tab

### Quick Commission Split Modal

Clicking "Edit Splits" or "+ Add Splits" opens the QuickCommissionSplitModal for fast split management.

---

## Data Sources

### Deal Data
- Table: `deal`
- Fields: `id`, `deal_name`, `gci`, `agci`, `house_usd`, `house_percent`, `deal_value`, `stage_id`, `booked_date`, `house_only`
- Excludes: Deals in "Lost" stage

### Commission Splits (Deal Level)
- Table: `commission_split`
- Fields: `deal_id`, `broker_id`, `split_broker_total`
- Filtered to: Mike, Arty, and Greg only

### Payments
- Table: `payment`
- Fields: `id`, `deal_id`, `payment_name`, `payment_amount`, `referral_fee_usd`, `agci`, `payment_received_date`, `payment_date_estimated`, `payment_received`, `orep_invoice`
- Filter: `is_active = true`
- Joined with deal for `stage_id` and `house_percent`

### Payment Splits
- Table: `payment_split`
- Fields: `payment_id`, `broker_id`, `split_broker_total`
- Filtered to: Mike, Arty, and Greg only

---

## Calculations

### Payment GCI
```
GCI = payment_amount - referral_fee_usd
```

### AGCI
```
AGCI = GCI - House Cut
```

### House $ (Payments)
```
House = payment.agci * (deal.house_percent / 100)
```

---

## Sorting

- **Collected Payments**: Sorted by `payment_received_date` ascending
- **Invoiced Payments**: Sorted by `payment_date_estimated` ascending

---

## Stage IDs Reference

| Stage | UUID |
|-------|------|
| Negotiating LOI | `89b7ce02-d325-434a-8340-fab04fa57b8c` |
| At Lease/PSA | `bd25eacc-e6c5-4e78-8d5f-25b4577ba5fd` |
| Under Contract / Contingent | `583507f5-1c53-474b-b7e6-deb81d1b89d2` |
| Booked | `0fc71094-e33e-49ba-b675-d097bd477618` |
| Executed Payable | `70d9449c-c589-4b92-ac5d-f84c5eaef049` |
| Closed Paid | `afa9a62e-9821-4c60-9db3-c0d51d009208` |
| Lost | `0e318cd6-a738-400a-98af-741479585057` |

## Broker IDs Reference

| Broker | UUID |
|--------|------|
| Mike Minihan | `38d4b67c-841d-4590-a909-523d3a4c6e4b` |
| Arty Santos | `1d049634-32fe-4834-8ca1-33f1cff0055a` |
| Greg Bennett | `dbfdd8d4-5241-4cc2-be83-f7763f5519bf` |

---

## Read-Only Mode

When `readOnly={true}` is passed (used for Coach Dashboard):
- Deal names are plain text (not clickable)
- No warning icons or counts displayed
- No Edit/Add Splits buttons
- No inline date editing
- No modals or slideouts

---

## Files

| File | Description |
|------|-------------|
| `src/components/reports/RobReport.tsx` | Main report component |
| `src/components/reports/QuickCommissionSplitModal.tsx` | Quick split editing modal |
| `src/components/DealDetailsSlideout.tsx` | Full deal editing slideout |
| `src/pages/RobReportPage.tsx` | Page wrapper |
| `src/App.tsx` | Route definition |
| `src/pages/ReportsPage.tsx` | Reports menu listing |

---

## Footer Notes

The report footer displays explanations for:
- **Booked/Closed**: Deals in Booked, Executed Payable, or Closed Paid stages with booked date in current year
- **UC/Contingent**: All deals in Under Contract / Contingent stage
- **Pipeline 50%+**: All deals in Negotiating LOI or At Lease/PSA stages
- **Collected**: Payments received in current year
- **Invoiced Payments**: Pending payments on Booked or Executed Payable deals
- **GCI (Payments)**: Payment Amount - Referral Fee
- **AGCI**: GCI - House Cut
- **⚠️ Missing**: Deals with no commission splits assigned
- **⚠️ Overdue**: Invoiced payments with no estimated date or past due
- **# Deals**: Deal count does not include any of Greg's deals

---

## Changelog

| Date | Change |
|------|--------|
| Dec 2024 | Initial Rob Report implementation |
| Dec 2024 | Added expandable rows for Pipeline section |
| Dec 2024 | Added missing splits warnings and quick edit modal |
| Dec 2024 | Added expandable rows for Payments section |
| Dec 2024 | Added payment sorting (ascending by date) |
| Dec 2024 | Added DealDetailsSlideout integration for payment rows |
| Dec 2024 | Updated payment GCI calculation: `payment_amount - referral_fee_usd` |
| Dec 2024 | Added footer notes for GCI and AGCI calculations |
| Dec 2024 | Added overdue payment warnings for Invoiced Payments |
| Dec 2024 | Added inline date editing for Invoiced Payments |
| Dec 2024 | Added invoice number display (INV #) in green text |

---

*Last Updated: December 2024*
