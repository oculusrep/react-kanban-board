# Rob Report: Missing Commission Splits Feature

**Status: IMPLEMENTED** (December 2024)

## Overview

This document outlines the implementation strategy for identifying and fixing deals without commission splits directly from the Rob Report.

## Problem Statement

Deals in the Rob Report (especially in Pipeline 50%+ category) often lack commission splits, which:
1. Shows $0 for all broker columns (Mike Net, Arty Net, Greg Net)
2. Throws off broker totals and projections
3. Requires navigating away from the report to fix

Currently, there's no way to distinguish between:
- Deals with **no splits assigned** (needs attention)
- Deals with splits but **intentionally $0** values

## Solution Summary

### Phase 1: Identification
- Add `hasSplits` and `missingSplitsCount` tracking
- Display "⚠️ Missing" column in Pipeline table
- Visual indicators on expanded deal rows without splits

### Phase 2: Quick Action
- Add "Edit Splits" button on deal rows
- Create `QuickCommissionSplitModal` component
- Enable inline editing without leaving the report

---

## Phase 1: Identification

### File Changes

#### 1. Update `RobReport.tsx`

**Location:** `src/components/reports/RobReport.tsx`

##### A. Update `DealDetail` Interface (around line 21)

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
  hasSplits: boolean;        // NEW: true if deal has any commission_split rows
  splitCount: number;        // NEW: number of broker splits assigned
}
```

##### B. Update `ReportRow` Interface (around line 34)

```typescript
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
  missingSplitsCount: number;  // NEW: count of deals with zero splits
}
```

##### C. Update `buildDealDetails` Helper (around line 227)

```typescript
const buildDealDetails = (dealList: any[]): DealDetail[] => {
  return dealList.map(d => {
    const dealSplits = splitsByDeal.get(d.id) || [];
    const hasSplits = dealSplits.length > 0;

    return {
      id: d.id,
      deal_name: d.deal_name || 'Unnamed Deal',
      stage_label: (d.stage as any)?.label || '',
      gci: d.gci || 0,
      agci: d.agci || 0,
      house: d.house_usd || 0,
      mikeNet: getBrokerSplitForDeal(d.id, BROKER_IDS.mike),
      artyNet: getBrokerSplitForDeal(d.id, BROKER_IDS.arty),
      gregNet: getBrokerSplitForDeal(d.id, BROKER_IDS.greg),
      dealValue: d.deal_value || 0,
      hasSplits,
      splitCount: dealSplits.length,
    };
  });
};
```

##### D. Add `countDealsWithoutSplits` Helper (after line 217)

```typescript
// Helper to count deals with NO commission splits at all
const countDealsWithoutSplits = (dealIds: string[]): number => {
  return dealIds.filter(dealId => {
    const splits = splitsByDeal.get(dealId) || [];
    return splits.length === 0;
  }).length;
};
```

##### E. Update Each ReportRow to Include `missingSplitsCount`

For `bookedClosedRow`, `ucContingentRow`, and `pipelineRow`:

```typescript
const bookedClosedRow: ReportRow = {
  // ... existing fields
  missingSplitsCount: countDealsWithoutSplits(bookedClosedIds),
};
```

For payment rows (which don't have deals):
```typescript
const collectedRow: ReportRow = {
  // ... existing fields
  missingSplitsCount: 0,  // N/A for payment rows
};
```

##### F. Update Table Header (around line 505)

Add new column after "Greg Net":

```tsx
<th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
  <span className="text-orange-600">⚠️ Missing</span>
</th>
```

##### G. Update Summary Row Cells (around line 550)

Add cell for missing splits count:

```tsx
<td className="px-4 py-3 text-sm text-right">
  {row.missingSplitsCount > 0 ? (
    <span className="text-orange-600 font-medium">
      {row.missingSplitsCount}
    </span>
  ) : (
    <span className="text-green-600">✓</span>
  )}
</td>
```

##### H. Update Expanded Deal Rows (around line 563)

Style deals without splits differently:

```tsx
{row.deals.map((deal) => (
  <tr
    key={deal.id}
    className={`border-l-4 ${
      deal.hasSplits
        ? 'bg-gray-50 border-blue-400'
        : 'bg-orange-50 border-orange-400'
    }`}
  >
    <td className="px-4 py-2 text-sm text-gray-600 pl-10">
      <div className="flex flex-col">
        <span className="font-medium text-gray-800">
          {!deal.hasSplits && <span className="text-orange-500 mr-1">⚠️</span>}
          {deal.deal_name}
        </span>
        <span className="text-xs text-gray-500">{deal.stage_label}</span>
      </div>
    </td>
    {/* ... other cells ... */}

    {/* Broker columns - show warning if no splits */}
    <td className="px-4 py-2 text-sm text-right text-gray-600 bg-blue-50/50">
      {deal.hasSplits ? formatCurrency(deal.mikeNet) : (
        <span className="text-orange-400 text-xs">—</span>
      )}
    </td>
    {/* Similar for artyNet and gregNet */}
  </tr>
))}
```

##### I. Update Totals Row (around line 632)

Add missing splits total:

```tsx
<td className="px-4 py-3 text-sm text-right">
  {dealTotals.missingSplitsCount > 0 ? (
    <span className="text-orange-300 font-medium">
      {dealTotals.missingSplitsCount}
    </span>
  ) : (
    <span className="text-green-300">✓</span>
  )}
</td>
```

##### J. Update `dealTotals` Calculation (around line 391)

```typescript
const dealTotals = useMemo(() => {
  return dealRows.reduce((acc, row) => ({
    // ... existing fields
    missingSplitsCount: acc.missingSplitsCount + (row.missingSplitsCount || 0),
  }), {
    // ... existing initial values
    missingSplitsCount: 0,
  });
}, [dealRows]);
```

---

## Phase 2: Quick Action Modal

### New Component: `QuickCommissionSplitModal.tsx`

**Location:** `src/components/reports/QuickCommissionSplitModal.tsx`

This modal provides a streamlined interface for adding/editing commission splits directly from the Rob Report.

#### Component Structure

```typescript
interface QuickCommissionSplitModalProps {
  isOpen: boolean;
  onClose: () => void;
  dealId: string;
  dealName: string;
  onSplitsUpdated: () => void;  // Callback to refresh report data
}

export default function QuickCommissionSplitModal({
  isOpen,
  onClose,
  dealId,
  dealName,
  onSplitsUpdated
}: QuickCommissionSplitModalProps) {
  // State
  const [deal, setDeal] = useState<Deal | null>(null);
  const [commissionSplits, setCommissionSplits] = useState<CommissionSplit[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch deal and splits on open
  useEffect(() => {
    if (isOpen && dealId) {
      fetchData();
    }
  }, [isOpen, dealId]);

  const fetchData = async () => {
    // Fetch deal, commission_split rows, and brokers
  };

  const addBrokerSplit = async (brokerId: string) => {
    // Add new split row
  };

  const updateSplit = async (splitId: string, field: string, value: number) => {
    // Update split percentage
  };

  const deleteSplit = async (splitId: string) => {
    // Remove split row
  };

  const handleClose = () => {
    onSplitsUpdated();  // Trigger report refresh
    onClose();
  };

  // Render modal with CommissionSplitSection-like UI
}
```

#### Key Features

1. **Auto-add Principal Brokers**: If no splits exist, offer a "Quick Setup" button that adds Mike, Arty, and Greg with default percentages

2. **Simplified UI**: Focus only on the three split types (Origination, Site, Deal) with real-time total calculation

3. **Deal Context**: Show deal name, AGCI, and stage at the top for context

4. **Validation**: Warn if percentages don't add up to 100%

5. **Save & Close**: Single action to save all changes and refresh the report

### Integration with RobReport.tsx

#### A. Add State for Modal (after line 89)

```typescript
const [selectedDealForSplits, setSelectedDealForSplits] = useState<{
  id: string;
  name: string;
} | null>(null);
```

#### B. Add Click Handler for Deals Without Splits

In the expanded deal row, add an onClick or button:

```tsx
{!deal.hasSplits && (
  <button
    onClick={(e) => {
      e.stopPropagation();
      setSelectedDealForSplits({ id: deal.id, name: deal.deal_name });
    }}
    className="ml-2 text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded hover:bg-orange-200"
  >
    + Add Splits
  </button>
)}
```

#### C. Add Modal Component (before closing `</div>`)

```tsx
{selectedDealForSplits && (
  <QuickCommissionSplitModal
    isOpen={!!selectedDealForSplits}
    onClose={() => setSelectedDealForSplits(null)}
    dealId={selectedDealForSplits.id}
    dealName={selectedDealForSplits.name}
    onSplitsUpdated={fetchReportData}
  />
)}
```

---

## UI/UX Details

### Color Coding

| State | Background | Border | Icon |
|-------|-----------|--------|------|
| Has splits | `bg-gray-50` | `border-blue-400` | None |
| Missing splits | `bg-orange-50` | `border-orange-400` | ⚠️ |
| All complete | — | — | ✓ (green) |

### Missing Column Display

| Value | Display |
|-------|---------|
| 0 | ✓ (green checkmark) |
| 1+ | Orange number with warning styling |

### Modal Behavior

1. Opens centered on screen with overlay
2. Shows loading state while fetching data
3. Pre-populates if splits already exist
4. "Quick Setup" button adds all three brokers at once
5. Real-time calculation of totals
6. Percentage validation with visual feedback
7. Save button disabled while saving
8. Auto-closes and refreshes report on successful save

---

## Testing Checklist

### Phase 1 - COMPLETED
- [x] `hasSplits` correctly identifies deals without any commission_split rows
- [x] `missingSplitsCount` accurately counts per category
- [x] Missing column displays in header
- [x] Missing count shows in each row
- [x] Total missing count shows in TOTALS row
- [x] Expanded deals without splits have orange styling
- [x] Warning icon appears on deals without splits
- [x] Deals WITH splits still display correctly

### Phase 2 - COMPLETED
- [x] Modal opens when clicking "+ Add Splits" or "Edit Splits" button
- [x] Modal loads deal data correctly
- [x] Can add broker splits
- [x] Can edit percentages
- [x] Can delete splits
- [x] "Quick Setup" adds all three principal brokers
- [x] Totals calculate correctly in real-time
- [x] Validation shows when percentages != 100%
- [x] Save persists data to database
- [x] Report refreshes after modal closes
- [x] Missing count updates after adding splits

---

## Future Enhancements

1. **Bulk Actions**: Select multiple deals and apply the same split template
2. **Templates**: Save common split configurations (e.g., "Standard 50/25/25")
3. **Filters**: Filter to show only deals missing splits
4. **Export**: Export list of deals needing attention
5. **Notifications**: Alert when new pipeline deals are missing splits

---

## Related Files

- `src/components/reports/RobReport.tsx` - Main report component
- `src/components/CommissionSplitSection.tsx` - Existing split editing UI (reference)
- `src/components/SlideOutPanel.tsx` - Slideout pattern (reference)
- `src/lib/supabaseClient.ts` - Database client
- `src/lib/supabaseHelpers.ts` - Insert/update helpers
- `src/lib/types.ts` - Type definitions
- `src/hooks/useCommissionCalculations.ts` - Commission calculation logic

---

## Implementation Order

1. **Phase 1A**: Update interfaces and data fetching
2. **Phase 1B**: Add missing column to table
3. **Phase 1C**: Style expanded rows with warnings
4. **Phase 2A**: Create `QuickCommissionSplitModal` component
5. **Phase 2B**: Integrate modal with RobReport
6. **Phase 2C**: Test full workflow

---

*Last Updated: December 2024*
