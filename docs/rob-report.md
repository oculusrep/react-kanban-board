# Rob Report

## Overview

The Rob Report is a deal pipeline and commission summary report that provides a high-level view of deals by stage and payment status, with broker net breakdowns for Mike Minihan, Arty Santos, and Greg Bennett.

## Access

- **Route**: `/reports/rob-report`
- **Permission Required**: `can_view_rob_report`
- **Default Access**: Restricted (must be explicitly granted)

## Report Sections

### Pipeline Section

Displays deal-level data organized by stage category:

| Row | Description | Date Filter |
|-----|-------------|-------------|
| **Booked/Closed** | Deals in Booked, Executed Payable, or Closed Paid stages | `booked_date` in current year |
| **UC/Contingent** | Deals in Under Contract / Contingent stage | No date filter |
| **Pipeline 50%+** | Deals in Negotiating LOI or At Lease/PSA stages | No date filter |

#### Pipeline Columns

- **Stage**: Category label
- **GCI**: Sum of `deal.gci`
- **AGCI**: Sum of `deal.agci`
- **House $**: Sum of `deal.house_usd`
- **Mike Net**: Sum of `commission_split.split_broker_total` for Mike Minihan
- **Arty Net**: Sum of `commission_split.split_broker_total` for Arty Santos
- **Greg Net**: Sum of `commission_split.split_broker_total` for Greg Bennett
- **# Deals**: Count of deals where Greg has NO split (or zero split)
- **Volume**: Sum of `deal.deal_value`

#### Expandable Rows

Each pipeline row can be expanded by clicking to show individual deals with:
- Deal name and stage label
- All numeric columns (GCI, AGCI, House $, broker nets, Volume)
- Subtotal row at the bottom of each expanded section

### Payments Section

Displays payment-level data:

| Row | Description | Filter Criteria |
|-----|-------------|-----------------|
| **Collected** | Payments that have been received | `payment_received_date` in current year |
| **Invoiced Payments** | Pending payments on booked deals | `payment_received_date` IS NULL AND `payment_received` = false, on Booked or Executed Payable stage deals |

#### Payments Columns

- **Category**: Row label
- **GCI**: Sum of `payment.payment_amount`
- **AGCI**: Sum of `payment.agci`
- **House $**: Sum of `payment.agci * deal.house_percent`
- **Mike Net**: Sum of `payment_split.split_broker_total` for Mike Minihan
- **Arty Net**: Sum of `payment_split.split_broker_total` for Arty Santos
- **Greg Net**: Sum of `payment_split.split_broker_total` for Greg Bennett

Note: # Deals and Volume columns are not shown in the Payments section.

## Data Sources

### Deal Data
- Table: `deal`
- Fields: `id`, `deal_name`, `gci`, `agci`, `house_usd`, `house_percent`, `deal_value`, `stage_id`, `booked_date`
- Excludes: Deals in "Lost" stage

### Commission Splits (Deal Level)
- Table: `commission_split`
- Fields: `deal_id`, `broker_id`, `split_broker_total`
- Filtered to: Mike, Arty, and Greg only

### Payments
- Table: `payment`
- Fields: `id`, `deal_id`, `payment_amount`, `agci`, `payment_received_date`, `payment_received`
- Filter: `is_active = true`
- Joined with deal for `stage_id` and `house_percent`

### Payment Splits
- Table: `payment_split`
- Fields: `payment_id`, `broker_id`, `split_broker_total`
- Filtered to: Mike, Arty, and Greg only

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

## Files

- **Component**: `src/components/reports/RobReport.tsx`
- **Page**: `src/pages/RobReportPage.tsx`
- **Route**: Defined in `src/App.tsx`
- **Reports Menu**: Listed in `src/pages/ReportsPage.tsx`
- **Permission**: Defined in `src/types/permissions.ts`
