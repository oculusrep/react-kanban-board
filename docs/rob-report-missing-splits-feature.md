# Rob Report: Missing Commission Splits Feature

**Status: IMPLEMENTED** (December 2024)

## Overview

This document outlines the implementation for identifying and fixing deals without commission splits directly from the Rob Report.

## Problem Statement

Deals in the Rob Report (especially in Pipeline 50%+ category) often lack commission splits, which:
1. Shows $0 for all broker columns (Mike Net, Arty Net, Greg Net)
2. Throws off broker totals and projections
3. Requires navigating away from the report to fix

## What Counts as "Missing Splits"

A deal is flagged as missing splits if:
- **No commission_split rows exist** for the deal, OR
- **All commission_split rows have $0 totals** (e.g., splits were added but percentages are all zero)

**Exception:** Deals marked as "House Only" are never flagged as missing splits, even if they have no broker splits. This is for deals where 100% goes to the house (e.g., referral fees).

This ensures deals like referral fees that have $0 broker splits are still flagged for review, unless explicitly marked as house-only.

---

## Current Implementation

### Visual Indicators

#### Category Row
- Warning icon and count displayed inline with category name: `Booked/Closed ⚠️ 1`
- Only shows when `missingSplitsCount > 0`

#### Expanded Deal Rows
| State | Background | Border | Icon |
|-------|-----------|--------|------|
| Has valid splits | `bg-gray-50` | `border-blue-400` (left) | None |
| Missing splits | `bg-orange-50` | `border-orange-400` (left) | ⚠️ |

#### Broker Columns (Mike Net, Arty Net, Greg Net)
- Deals with splits: Shows formatted currency with colored background
- Deals without splits: Shows "—" dash in orange text

#### Action Buttons
- Deals with splits: "Edit Splits" button (gray styling)
- Deals without splits: "+ Add Splits" button (orange styling)

#### TOTALS Row
- Warning icon and total count displayed inline: `TOTALS ⚠️ 3`

### Key Features

1. **Click Deal Name** - Opens DealDetailsSlideout for full deal editing
2. **Edit/Add Splits Button** - Opens QuickCommissionSplitModal for quick split editing
3. **Quick Setup** - Adds Mike and Arty with default 0% splits (Greg excluded by design)
4. **Real-time Refresh** - Report data refreshes after modal closes

---

## Technical Implementation

### Interfaces

```typescript
interface DealDetail {
  id: string;
  deal_name: string;
  stage_label: string;
  gci: number;
  agci: number;
  house: number;
  mikeNet: number;
  artyNet: number;
  gregNet: number;
  dealValue: number;
  hasSplits: boolean;    // false if no splits OR all splits have $0 totals
  splitCount: number;    // number of broker splits assigned
}

interface ReportRow {
  category: string;
  gci: number;
  agci: number;
  house: number;
  mikeNet: number;
  artyNet: number;
  gregNet: number;
  dealCount: number | null;
  volume: number | null;
  deals?: DealDetail[];
  missingSplitsCount: number;  // count of deals flagged as missing
}
```

### Helper Functions

```typescript
// Count deals with NO commission splits or all $0 splits (excluding house_only deals)
const countDealsWithoutSplits = (dealIds: string[]): number => {
  return dealIds.filter(dealId => {
    const deal = dealsById.get(dealId);
    // Don't flag house_only deals as missing splits
    if (deal?.house_only === true) return false;

    const splits = splitsByDeal.get(dealId) || [];
    if (splits.length === 0) return true;
    // Also flag deals where all splits have $0 totals
    const totalSplitValue = splits.reduce((sum, s) => sum + (s.split_broker_total || 0), 0);
    return totalSplitValue === 0;
  }).length;
};

// Build deal details with hasSplits check
const buildDealDetails = (dealList: any[]): DealDetail[] => {
  return dealList.map(d => {
    const dealSplits = splitsByDeal.get(d.id) || [];
    // hasSplits is true if:
    // 1. Deal is marked as house_only, OR
    // 2. Has splits with non-zero totals
    const totalSplitValue = dealSplits.reduce((sum, s) => sum + (s.split_broker_total || 0), 0);
    const hasSplits = d.house_only === true || (dealSplits.length > 0 && totalSplitValue > 0);
    // ...
  });
};
```

### Broker IDs

```typescript
const BROKER_IDS = {
  mike: '38d4b67c-841d-4590-a909-523d3a4c6e4b',    // Mike Minihan
  arty: '1d049634-32fe-4834-8ca1-33f1cff0055a',    // Arty Santos
  greg: 'dbfdd8d4-5241-4cc2-be83-f7763f5519bf',    // Greg Bennett
};
```

---

## QuickCommissionSplitModal

**Location:** `src/components/reports/QuickCommissionSplitModal.tsx`

### Props

```typescript
interface QuickCommissionSplitModalProps {
  isOpen: boolean;
  onClose: () => void;
  dealId: string;
  dealName: string;
  onSplitsUpdated: () => void;  // Callback to refresh report data
}
```

### Features

1. **Deal Context Header** - Shows deal name, stage, AGCI, and Fee
2. **House Only Checkbox** - Mark deals as 100% house (no broker splits needed)
3. **Quick Setup Button** - Adds Mike and Arty (not Greg) with 0% default percentages
4. **Broker Dropdown** - Add any available broker not already assigned
5. **Split Percentage Inputs** - Origination %, Site %, Deal % for each broker
6. **Real-time Totals** - Shows calculated USD amounts per broker
7. **Validation Warnings** - Alerts when percentages don't total 100%
8. **Delete Split** - Remove individual broker splits
9. **Auto-refresh** - Triggers report refresh when modal closes

### House Only Checkbox

The "House Only Deal" checkbox:
- Appears at the top of the modal, below the deal info
- When checked, marks the deal as `house_only = true` in the database
- Prevents the deal from being flagged as "missing splits" in the report
- Use this for referral fees or other deals where 100% goes to the house
- The checkbox state persists immediately when toggled

### Quick Setup Behavior

The "Quick Setup (Add Mike & Arty)" button:
- Only appears if Mike and Arty are not both already added
- Adds both brokers with 0% splits (user must fill in percentages)
- Greg is intentionally excluded from quick setup

---

## DealDetailsSlideout Integration

Clicking on a deal name in the expanded rows opens the full DealDetailsSlideout, allowing:
- Full deal editing
- Commission split management via CommissionSplitSection
- Payment management
- Critical dates management

---

## Testing Checklist

### Identification (Phase 1) - COMPLETED
- [x] `hasSplits` correctly identifies deals without any commission_split rows
- [x] `hasSplits` correctly identifies deals with all $0 splits
- [x] `missingSplitsCount` accurately counts per category
- [x] Missing count shows inline with category name
- [x] Total missing count shows inline in TOTALS row
- [x] Expanded deals without splits have orange styling
- [x] Warning icon appears on deals without splits
- [x] Deals WITH valid splits display correctly

### Quick Action (Phase 2) - COMPLETED
- [x] Modal opens when clicking "+ Add Splits" or "Edit Splits" button
- [x] Modal loads deal data correctly
- [x] Can add broker splits
- [x] Can edit percentages
- [x] Can delete splits
- [x] "Quick Setup" adds Mike and Arty (not Greg)
- [x] Totals calculate correctly in real-time
- [x] Validation shows when percentages != 100%
- [x] Save persists data to database
- [x] Report refreshes after modal closes
- [x] Missing count updates after adding splits

### Deal Slideout Integration - COMPLETED
- [x] Clicking deal name opens DealDetailsSlideout
- [x] Slideout loads deal data correctly
- [x] Report refreshes when slideout closes

### House Only Feature - COMPLETED
- [x] `house_only` column added to deal table
- [x] QuickCommissionSplitModal fetches and displays house_only checkbox
- [x] Checking house_only saves immediately to database
- [x] RobReport excludes house_only deals from missing splits count
- [x] house_only deals show as "has splits" (not flagged with warning)

---

## Future Enhancements

1. **Bulk Actions**: Select multiple deals and apply the same split template
2. **Templates**: Save common split configurations (e.g., "Standard 50/50")
3. **Filters**: Filter to show only deals missing splits
4. **Export**: Export list of deals needing attention
5. **Notifications**: Alert when new pipeline deals are missing splits

---

## Related Files

| File | Description |
|------|-------------|
| `src/components/reports/RobReport.tsx` | Main report component |
| `src/components/reports/QuickCommissionSplitModal.tsx` | Quick split editing modal |
| `src/components/DealDetailsSlideout.tsx` | Full deal editing slideout |
| `src/components/CommissionSplitSection.tsx` | Existing split editing UI |
| `src/hooks/useCommissionCalculations.ts` | Commission calculation logic |
| `src/lib/supabaseClient.ts` | Database client |
| `src/lib/supabaseHelpers.ts` | Insert/update helpers |

---

## Changelog

| Date | Change |
|------|--------|
| Dec 2024 | Initial implementation of missing splits feature |
| Dec 2024 | Changed Quick Setup to only add Mike and Arty (not Greg) |
| Dec 2024 | Moved missing count from separate column to inline with category |
| Dec 2024 | Added $0 split detection (treats all-zero splits as missing) |
| Dec 2024 | Added DealDetailsSlideout integration |
| Dec 2024 | Added "House Only" checkbox to exclude deals from missing splits warning |

---

*Last Updated: December 2024*
