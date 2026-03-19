# Arty Commission Draw System

## Overview

This document describes the commission processing system for Arty Santos, who operates on a "draw" arrangement. Arty receives regular draw payments (advances against future commissions), and when a commission is earned, the draw balance is offset before any net payment is made.

## Key Concepts

### Draw Account
- **Account**: "Santos Real Estate Commission Draw" (liability account in QuickBooks)
- **Purpose**: Tracks the running balance of draws taken vs commissions earned
- **Positive balance**: Arty owes the company (draws exceed commissions)
- **Negative balance**: Company owes Arty (commissions exceed draws)

### Commissions Paid Out Account
- **Account**: "Commissions Paid Out: Santos Real Estate Partners LLC" (expense account)
- **Purpose**: Records actual commission expense when payments are processed

## How Commission Processing Works (Option A)

When Arty earns a commission, the system creates two QBO entries:

### 1. Journal Entry (clears the draw balance)
Only created if there's a draw balance to clear.

| Account | Debit | Credit | Description |
|---------|-------|--------|-------------|
| Commissions Paid Out: Santos Real Estate Partners LLC | $669.03 | | Commission expense for draw offset |
| Santos Real Estate Commission Draw | | $669.03 | Credits the draw account to zero it out |

**Result**: The draw account balance goes from $669.03 to $0.00

### 2. Bill (net payment to Arty)
Only created if net payment > $0.

| Vendor | Amount | Account | Description |
|--------|--------|---------|-------------|
| Santos Real Estate Partners LLC | $1,169.62 | Commissions Paid Out: Santos Real Estate Partners LLC | Net commission payment |

**Result**: Creates an Accounts Payable entry for the net payment

## Example Calculation

Given:
- **Draw balance**: $669.03 (Arty owes the company)
- **Commission earned**: $1,838.65

Calculation:
- Net payment = $1,838.65 - $669.03 = **$1,169.62**
- JE amount = $669.03 (clears the draw)
- Bill amount = $1,169.62 (net payment to Arty)

Total expense = $669.03 (JE) + $1,169.62 (Bill) = **$1,838.65** (equals gross commission)

## Arty Draw Report

Located at `/reports/arty-draw`, this report shows:
- **Draws** (purple column): Money paid to Arty from the draw account
- **Commissions Earned** (green column): Credits to the draw account from commissions
- **Running Balance**: Current draw account balance

The report pulls data directly from QuickBooks' General Ledger report for the draw account.

## Edge Cases

### No Draw Balance
If Arty has no outstanding draw (balance = $0 or negative):
- **No JE created** - nothing to clear
- **Bill created for full commission amount**

### Draw Exceeds Commission
If the draw balance is greater than the commission earned:
- **JE created for partial offset** (only up to commission amount)
- **No Bill created** - no net payment owed
- **Remaining draw balance carries forward**

### No Net Payment
If commission exactly equals draw balance:
- **JE created to clear the draw**
- **No Bill created** - balance is zeroed out with no payment

## Technical Implementation

### Edge Function
`supabase/functions/process-arty-commission/index.ts`

Key steps:
1. Fetch payment split from OVIS database
2. Get draw balance from QBO (account CurrentBalance)
3. Look up "Commissions Paid Out: Santos Real Estate Partners LLC" account
4. Create JE if draw balance > 0
5. Create Bill if net payment > 0
6. Mark payment split as paid
7. Send email notification to Arty

### UI Components
- **BrokerPaymentRow.tsx**: "Net Pay" button triggers the process
- **ArtyDrawReport.tsx**: Displays the draw account activity

### Account Lookups
Both the JE and Bill use the same expense account:
- Query: `SELECT * FROM Account WHERE FullyQualifiedName LIKE '%Commissions Paid Out%Santos Real Estate%'`
- Fallback: Search for any "Commissions Paid Out" account

## Configuration

### QBO Commission Mapping
In Settings > QuickBooks, Arty's commission mapping should have:
- **Payment Method**: Journal Entry
- **Credit Account**: Santos Real Estate Commission Draw
- **Vendor**: Santos Real Estate Partners LLC

## Workflow

1. Deal closes and payment is received
2. Admin goes to Payment Dashboard
3. Clicks "Net Pay" button on Arty's payment split
4. System shows preview with draw balance and net payment
5. Admin confirms to process
6. System creates JE (if needed) and Bill
7. Email sent to Arty with breakdown
8. Payment split marked as paid

## Date: March 2026

This system was implemented to replace the previous "Option B" approach which credited the full commission to the draw account and then had the bill debit it back out. Option A is cleaner because:
- The draw account shows only draws and their offsets (zeros out cleanly)
- The Bill represents only the actual cash payment to Arty
- Both entries use the same expense account for consistency
