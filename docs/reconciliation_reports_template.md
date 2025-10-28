# Reconciliation Reports - Template Documentation

## Overview
This document describes the architecture, patterns, and implementation details of the Deal and Payment Reconciliation reports. These reports serve as templates for building future reconciliation and comparison reports in the system.

**Last Updated:** October 28, 2025

---

## Purpose
The reconciliation reports compare data between two systems:
- **OVIS** (our internal database)
- **Salesforce** (external CRM system)

They identify variances, mismatches, and discrepancies to ensure data accuracy across both systems.

---

## Report Types

### 1. Deal Reconciliation Report
**Location:** `/reports/deal-reconciliation`
**Component:** `src/components/reports/DealReconciliationReport.tsx`
**Page Wrapper:** `src/pages/DealReconciliationPage.tsx`

**Purpose:** Compare deal-level data between OVIS and Salesforce

**Metrics Compared:**
- Deal Value
- Fee (Total Commission/GCI)
- Commission Rate (%)
- AGCI (Adjusted Gross Commission Income)
- House Dollars

### 2. Payment Reconciliation Report
**Location:** `/reports/payment-reconciliation`
**Component:** `src/components/payments/PaymentReconciliationReport.tsx`
**Page Wrapper:** `src/pages/PaymentReconciliationPage.tsx`

**Purpose:** Compare payment-level data between OVIS and Salesforce

**Metrics Compared:**
- Payment Amount
- AGCI
- House Dollars
- Broker commissions (Mike, Arty, Greg)

---

## Architecture Pattern

### File Structure
```
src/
├── pages/
│   ├── ReportsPage.tsx              # Landing page with report cards
│   ├── DealReconciliationPage.tsx   # Wrapper for deal report
│   └── PaymentReconciliationPage.tsx # Wrapper for payment report
├── components/
│   ├── reports/
│   │   └── DealReconciliationReport.tsx
│   └── payments/
│       └── PaymentReconciliationReport.tsx
└── types/
    └── payment-dashboard.ts          # Shared types
```

### Page Wrapper Pattern
Each report has a dedicated page wrapper that:
1. Wraps the report component in a clean container
2. Provides consistent page layout and spacing
3. Makes the report accessible via routing

**Example:**
```typescript
export default function DealReconciliationPage() {
  return (
    <div className="h-full overflow-hidden flex flex-col">
      <div className="flex-1 overflow-auto">
        <DealReconciliationReport />
      </div>
    </div>
  );
}
```

### Reports Landing Page
**Location:** `src/pages/ReportsPage.tsx`

Reports are organized as cards on a landing page for easy navigation:
```typescript
const reports = [
  {
    id: "deal-reconciliation",
    name: "Deal Reconciliation",
    description: "Compare OVIS deals with Salesforce at deal level...",
    route: "/reports/deal-reconciliation",
    icon: "📊"
  },
  {
    id: "payment-reconciliation",
    name: "Payment Reconciliation",
    description: "Compare OVIS payment data with Salesforce...",
    route: "/reports/payment-reconciliation",
    icon: "💰"
  }
];
```

---

## Core Components & Features

### 1. Data Fetching Pattern

#### Query Structure
```typescript
const fetchReconciliationData = async () => {
  setLoading(true);
  setError(null);

  try {
    // 1. Fetch OVIS data
    const { data: ovisData, error: ovisError } = await supabase
      .from('deal')  // or 'payment'
      .select(`...fields`)
      .in('stage_id', activeStageIds);

    // 2. Fetch Salesforce data
    const sfIds = ovisData?.map(d => d.sf_id).filter(id => id !== null);
    const { data: sfData, error: sfError } = await supabase
      .from('salesforce_Opportunity')  // or 'salesforce_Payment__c'
      .select(`...fields`)
      .in('Id', sfIds)
      .eq('IsDeleted', false);

    // 3. Build reconciliation rows comparing OVIS vs SF
    const rows = ovisData?.map(item => {
      const sfItem = sfData?.find(sf => sf.Id === item.sf_id);
      return {
        // OVIS values
        ovis_metric: item.metric || 0,
        // Salesforce values
        sf_metric: sfItem?.Metric__c || 0,
        // Variance
        metric_variance: ovisMetric - sfMetric
      };
    });

    setReconciliationData(rows);
  } catch (err) {
    setError(err.message);
  } finally {
    setLoading(false);
  }
};
```

#### Key Principles
- Always fetch OVIS data first
- Extract `sf_id` values to query Salesforce
- Use `.eq('IsDeleted', false)` on Salesforce queries
- Calculate variances in the mapping step
- Handle null/missing values with `|| 0` fallbacks

### 2. Salesforce Field Mapping

**CRITICAL:** Salesforce field names are different from OVIS field names. Always verify against `database-schema.ts`.

#### Deal-Level Fields (salesforce_Opportunity)
| OVIS Field | Salesforce Field | Description |
|------------|-----------------|-------------|
| `deal_value` | `Deal_Value__c` | Total deal value |
| `fee` | `Calculated_Amount__c` | Total commission/fee (GCI) |
| `commission_percent` | `Commission__c` | Commission percentage |
| `agci` | `AGCI__c` | Adjusted Gross Commission Income |
| `house_usd` | `House_Dollars__c` | House dollars |
| `referral_fee_usd` | `Referral_Fee__c` | Referral fee |
| `stage_id` | `StageName` | Deal stage |

#### Payment-Level Fields (salesforce_Payment__c)
| OVIS Field | Salesforce Field | Description |
|------------|-----------------|-------------|
| `payment_amount` | `Payment_Amount__c` | Payment amount |
| `agci` | `AGCI__c` | AGCI for payment |
| `house_usd` | `House_Dollars__c` | House dollars |
| Broker splits (calculated) | `Broker_Total_Mike__c`, `Broker_Total_Arty__c`, `Broker_Total_Greg__c` | Individual broker totals |

**Important Notes:**
- Use `Deal_Value__c` NOT `Amount` for deal value
- Use `Calculated_Amount__c` NOT `Commission__c` for fee
- Use `House_Dollars__c` NOT `House__c`
- Use `AGCI__c` directly, don't calculate `fee - referral_fee`
- Custom fields end with `__c`
- Standard fields don't have suffix

### 3. Filter System

#### Filter Types Implemented
1. **Stage Filter** - Multi-select checkboxes
2. **Closed Date Filter** - Dropdown with presets + custom range
3. **Booked Date Filter** - Dropdown with presets + custom range
4. **Estimated Payment Date Filter** - Dropdown with presets + custom range

#### Date Filter Presets
```typescript
const dateFilterOptions = [
  'current_year',    // 2025
  'last_2_years',    // 2024+
  'all_time',        // No filter
  'missing',         // Show records with missing dates (optional)
  'custom'           // Custom date range
];
```

#### Filter State Pattern
```typescript
// Filter type
const [closedDateFilter, setClosedDateFilter] = useState<'current_year' | 'last_2_years' | 'all_time' | 'missing' | 'custom'>('last_2_years');

// Custom date range (only used when filter is 'custom')
const [customClosedDateFrom, setCustomClosedDateFrom] = useState<string>('');
const [customClosedDateTo, setCustomClosedDateTo] = useState<string>('');

// Dropdown visibility
const [showClosedDateMenu, setShowClosedDateMenu] = useState(false);
const closedDateMenuRef = useRef<HTMLDivElement>(null);
```

#### Filter Logic Implementation
```typescript
// Filter by closed date
if (closedDateFilter === 'current_year') {
  filtered = filtered.filter(row => {
    if (row.ovis_stage === 'Closed Paid') {
      if (!row.closed_date) return false;
      const year = new Date(row.closed_date).getFullYear();
      return year === 2025;
    }
    return true; // Don't filter non-Closed Paid deals
  });
} else if (closedDateFilter === 'last_2_years') {
  filtered = filtered.filter(row => {
    if (row.ovis_stage === 'Closed Paid') {
      if (!row.closed_date) return false;
      const year = new Date(row.closed_date).getFullYear();
      return year >= 2024;
    }
    return true;
  });
} else if (closedDateFilter === 'missing') {
  filtered = filtered.filter(row => !row.closed_date);
}
```

**Key Pattern:** Only filter "Closed Paid" deals by closed_date. Other stages are not affected by the closed date filter.

#### Filter Criteria Banner
Display active filters at the top for transparency:
```typescript
<div className="px-4 py-2 bg-blue-50 border-b border-blue-100">
  <div className="text-xs text-gray-700">
    <span className="font-semibold">Active Filters:</span>
    {' '}
    <span className="font-medium">Stages:</span> {selectedStages.length > 0 ? selectedStages.join(', ') : 'All'}
    {' • '}
    <span className="font-medium">Closed Date:</span> {getClosedDateFilterLabel()}
    {' • '}
    <span className="font-medium">Booked:</span> {getBookedDateFilterLabel()}
  </div>
</div>
```

### 4. Refresh Button

**Purpose:** Reload data while preserving filter state

```typescript
<button
  onClick={() => fetchReconciliationData()}
  disabled={loading}
  className="px-3 py-1.5 border border-gray-300 rounded-md shadow-sm bg-white text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
  title="Refresh data"
>
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
  {loading ? 'Refreshing...' : 'Refresh'}
</button>
```

**Features:**
- Circular arrow refresh icon
- Shows "Refreshing..." during load
- Disabled while loading
- All filters remain unchanged
- Positioned between filters and stats

### 5. Inline Editing

#### Closed Date Inline Editor
Allows direct editing of `closed_date` field from the report:

```typescript
const [editingClosedDateDealId, setEditingClosedDateDealId] = useState<string | null>(null);
const [editingClosedDateValue, setEditingClosedDateValue] = useState<string>('');

const handleClosedDateEdit = (dealId: string, currentDate: string | null) => {
  setEditingClosedDateDealId(dealId);
  setEditingClosedDateValue(currentDate || '');
};

const handleClosedDateSave = async (dealId: string) => {
  const { error } = await supabase
    .from('deal')
    .update({ closed_date: editingClosedDateValue || null })
    .eq('id', dealId);

  if (!error) {
    // Update local state
    setReconciliationData(prev => prev.map(row =>
      row.deal_id === dealId
        ? { ...row, closed_date: editingClosedDateValue || null }
        : row
    ));
  }

  setEditingClosedDateDealId(null);
  setEditingClosedDateValue('');
};
```

**UI Pattern:**
```typescript
{editingClosedDateDealId === row.deal_id ? (
  <div className="flex items-center space-x-1">
    <input type="date" value={editingClosedDateValue} onChange={...} />
    <button onClick={() => handleClosedDateSave(row.deal_id)}>✓</button>
    <button onClick={handleClosedDateCancel}>✕</button>
  </div>
) : (
  <button onClick={() => handleClosedDateEdit(row.deal_id, row.closed_date)}>
    {row.closed_date || '⚠️ Missing'}
  </button>
)}
```

### 6. Sortable Columns

```typescript
const [sortColumn, setSortColumn] = useState<string>('deal_name');
const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

const handleSort = (column: string) => {
  if (sortColumn === column) {
    setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
  } else {
    setSortColumn(column);
    setSortDirection('asc');
  }
};

// In useMemo for sorted data
const sorted = [...filtered].sort((a, b) => {
  const aVal = a[sortColumn];
  const bVal = b[sortColumn];

  if (aVal === null || aVal === undefined) return 1;
  if (bVal === null || bVal === undefined) return -1;

  if (typeof aVal === 'string') {
    return sortDirection === 'asc'
      ? aVal.localeCompare(bVal)
      : bVal.localeCompare(aVal);
  }

  return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
});
```

**Column Header:**
```typescript
<th
  onClick={() => handleSort('deal_name')}
  className="cursor-pointer hover:bg-gray-100"
>
  Deal Name {sortColumn === 'deal_name' && (sortDirection === 'asc' ? '↑' : '↓')}
</th>
```

### 7. Variance Display

#### Color Coding Pattern
```typescript
const getVarianceColor = (variance: number, threshold: number = 0.01) => {
  if (Math.abs(variance) < threshold) return 'text-gray-600';
  return variance > 0 ? 'text-green-600' : 'text-red-600';
};

const formatVariance = (variance: number) => {
  const sign = variance > 0 ? '+' : '';
  return `${sign}${formatCurrency(variance)}`;
};
```

**Table Cell:**
```typescript
<td className={`px-2 py-1.5 text-xs ${getVarianceColor(row.deal_value_variance)} text-right font-medium`}>
  {formatVariance(row.deal_value_variance)}
</td>
```

#### Variance Colors
- **Green** (`text-green-600`): Positive variance (OVIS > SF)
- **Red** (`text-red-600`): Negative variance (OVIS < SF)
- **Gray** (`text-gray-600`): No significant variance (within threshold)

### 8. Totals Row

```typescript
const totals = useMemo(() => {
  return filteredAndSortedData.reduce((acc, row) => ({
    ovisDealValue: acc.ovisDealValue + row.ovis_deal_value,
    sfDealValue: acc.sfDealValue + row.sf_deal_value,
    ovisFee: acc.ovisFee + row.ovis_fee,
    sfFee: acc.sfFee + row.sf_fee,
    // ... other totals
  }), {
    ovisDealValue: 0,
    sfDealValue: 0,
    ovisFee: 0,
    sfFee: 0,
    // ... initial values
  });
}, [filteredAndSortedData]);
```

**Render:**
```typescript
<tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
  <td className="px-2 py-1.5 text-xs">TOTALS</td>
  <td></td>
  <td></td>
  <td className="px-2 py-1.5 text-xs text-right">{formatCurrency(totals.ovisDealValue)}</td>
  <td className="px-2 py-1.5 text-xs text-right">{formatCurrency(totals.sfDealValue)}</td>
  <td className={`px-2 py-1.5 text-xs text-right ${getVarianceColor(totals.dealValueVariance)}`}>
    {formatVariance(totals.dealValueVariance)}
  </td>
</tr>
```

### 9. Integration with Detail Views

#### Deal Details Slideout
Clicking a deal name opens the full deal details in a slideout:

```typescript
import DealDetailsSlideout from '../DealDetailsSlideout';

const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
const [isSlideoutOpen, setIsSlideoutOpen] = useState(false);

// In table row
<button
  onClick={() => {
    setSelectedDealId(row.deal_id);
    setIsSlideoutOpen(true);
  }}
  className="text-blue-600 hover:underline"
>
  {row.deal_name}
</button>

// At bottom of component
<DealDetailsSlideout
  dealId={selectedDealId}
  isOpen={isSlideoutOpen}
  onClose={() => {
    setIsSlideoutOpen(false);
    setSelectedDealId(null);
  }}
  onDealUpdated={() => {
    fetchReconciliationData(); // Refresh report data
  }}
/>
```

**Features:**
- 45% width slideout
- Full deal details with tabs (Details, Commission, Payments, Activity, Files)
- Edit capability
- Auto-refreshes report when deal is updated

#### Payment Detail Sidebar
Similar pattern for payments:

```typescript
import PaymentDetailSidebar from './PaymentDetailSidebar';
import { PaymentDashboardRow } from '../../types/payment-dashboard';

const [showPaymentSidebar, setShowPaymentSidebar] = useState(false);
const [selectedPayment, setSelectedPayment] = useState<PaymentDashboardRow | null>(null);

const handleOpenPaymentSidebar = async (row: PaymentReconciliationRow) => {
  // Fetch full payment data including splits
  const { data: payment } = await supabase
    .from('payment')
    .select('*')
    .eq('id', row.payment_id)
    .single();

  const { data: splits } = await supabase
    .from('payment_split')
    .select(`*, broker:broker_id(name)`)
    .eq('payment_id', row.payment_id);

  // Map to PaymentDashboardRow format
  const paymentData: PaymentDashboardRow = {
    payment_id: payment.id,
    deal_name: row.deal_name,
    payment_amount: payment.payment_amount,
    broker_splits: splits?.map(s => ({ ... })),
    // ... other fields
  };

  setSelectedPayment(paymentData);
  setShowPaymentSidebar(true);
};

// Icon button in table
<button
  onClick={(e) => {
    e.stopPropagation();
    handleOpenPaymentSidebar(row);
  }}
  className="text-blue-600 hover:text-blue-800"
  title="View Payment Details"
>
  💰→
</button>

// Sidebar component
<PaymentDetailSidebar
  payment={selectedPayment}
  isOpen={showPaymentSidebar}
  onClose={() => {
    setShowPaymentSidebar(false);
    setSelectedPayment(null);
  }}
  onUpdate={() => fetchReconciliationData()}
/>
```

---

## Table Design Pattern

### Column Structure
Reports use a grouped column header pattern:

```typescript
<thead className="bg-gray-50">
  {/* First header row - metric groups */}
  <tr>
    <th>Deal</th>
    <th>Client</th>
    <th>Property</th>
    <th>Stage</th>
    <th>Closed</th>
    <th colSpan={3} className="bg-blue-50">Deal Value</th>
    <th colSpan={3} className="bg-green-50">Fee</th>
    <th colSpan={3} className="bg-purple-50">Comm %</th>
    <th colSpan={3} className="bg-orange-50">AGCI</th>
    <th colSpan={3} className="bg-red-50">House $</th>
  </tr>

  {/* Second header row - OVIS/SF/Variance */}
  <tr>
    <th></th> {/* Empty cells for info columns */}
    <th></th>
    <th></th>
    <th></th>
    <th></th>
    <th className="bg-blue-50">OVIS</th>
    <th className="bg-blue-50">SF</th>
    <th className="bg-blue-50">Var</th>
    <th className="bg-green-50">OVIS</th>
    <th className="bg-green-50">SF</th>
    <th className="bg-green-50">Var</th>
    {/* ... repeat for each metric */}
  </tr>
</thead>
```

### Styling Classes
```css
/* Compact spacing */
px-2 py-1.5 text-xs

/* Column backgrounds (use consistent colors) */
bg-blue-50    /* Deal Value */
bg-green-50   /* Fee */
bg-purple-50  /* Commission % */
bg-orange-50  /* AGCI */
bg-red-50     /* House $ */
bg-yellow-50  /* Broker commissions */
bg-pink-50    /* Other metrics */

/* Alignment */
text-left     /* Text/deal names */
text-right    /* Numbers/currency */
text-center   /* Headers */

/* Interactive */
hover:bg-gray-50      /* Row hover */
cursor-pointer        /* Sortable columns */
hover:bg-gray-100     /* Column header hover */
```

---

## Utility Functions

### Currency Formatting
```typescript
const formatCurrency = (value: number | null) => {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};
```

### Percentage Formatting
```typescript
const formatPercent = (value: number | null) => {
  if (value === null || value === undefined) return '-';
  return `${value.toFixed(2)}%`;
};
```

### Date Formatting
```typescript
const formatDate = (dateString: string | null) => {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};
```

---

## Performance Considerations

### 1. useMemo for Expensive Operations
```typescript
// Filter and sort data
const filteredAndSortedData = useMemo(() => {
  let filtered = [...reconciliationData];

  // Apply filters
  if (selectedStages.length > 0) {
    filtered = filtered.filter(row => selectedStages.includes(row.ovis_stage));
  }

  // Apply date filters
  // ... filter logic

  // Sort
  const sorted = filtered.sort((a, b) => {
    // ... sort logic
  });

  return sorted;
}, [reconciliationData, selectedStages, sortColumn, sortDirection, closedDateFilter, /* ... other deps */]);

// Calculate totals
const totals = useMemo(() => {
  return filteredAndSortedData.reduce((acc, row) => ({
    // ... calculations
  }), { /* initial values */ });
}, [filteredAndSortedData]);
```

### 2. Click Outside Handler
Close dropdowns when clicking outside:

```typescript
useEffect(() => {
  const handleClickOutside = (event: MouseEvent) => {
    if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target as Node)) {
      setShowStageFilter(false);
    }
    if (closedDateMenuRef.current && !closedDateMenuRef.current.contains(event.target as Node)) {
      setShowClosedDateMenu(false);
    }
  };

  if (showStageFilter || showClosedDateMenu) {
    document.addEventListener('mousedown', handleClickOutside);
  }

  return () => document.removeEventListener('mousedown', handleClickOutside);
}, [showStageFilter, showClosedDateMenu]);
```

---

## Error Handling

### 1. Loading States
```typescript
if (loading) {
  return (
    <div className="p-4 text-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
      <p className="mt-2 text-xs text-gray-600">Loading reconciliation data...</p>
    </div>
  );
}
```

### 2. Error Display
```typescript
if (error) {
  return (
    <div className="p-4">
      <div className="bg-red-50 border border-red-200 rounded-lg p-3">
        <p className="text-xs text-red-800">Error loading data: {error}</p>
      </div>
    </div>
  );
}
```

### 3. Null/Missing Data Handling
```typescript
// Always use fallback values
const value = data?.field || 0;
const text = data?.field || '-';

// Highlight missing data
{row.closed_date || '⚠️ Missing'}

// Special filter for missing data
if (closedDateFilter === 'missing') {
  filtered = filtered.filter(row => !row.closed_date);
}
```

---

## Testing Checklist

When building a new reconciliation report, test these scenarios:

### Data Loading
- [ ] Initial load shows loading state
- [ ] Data loads successfully
- [ ] Error state displays if query fails
- [ ] Empty state shows when no data

### Filters
- [ ] All stage options appear in dropdown
- [ ] Stage multi-select works correctly
- [ ] Date presets filter correctly (This Year, Last 2 Years, All Time)
- [ ] Custom date range works
- [ ] Missing date filter works
- [ ] Multiple filters work together
- [ ] Filter criteria banner shows correct active filters
- [ ] Filter state persists when refreshing data

### Sorting
- [ ] Click column header to sort ascending
- [ ] Click again to sort descending
- [ ] Sort indicator (↑/↓) appears correctly
- [ ] Null values sort to bottom
- [ ] Numeric columns sort numerically
- [ ] Text columns sort alphabetically

### Display
- [ ] Currency formats correctly ($1,234,567)
- [ ] Percentages format correctly (5.25%)
- [ ] Dates format correctly (Jan 15, 2025)
- [ ] Variance colors are correct (green/red/gray)
- [ ] Totals row calculates correctly
- [ ] Stage mismatches highlighted
- [ ] Missing data indicators show (⚠️)

### Interactions
- [ ] Refresh button reloads data
- [ ] Refresh preserves filter state
- [ ] Refresh button disabled while loading
- [ ] Inline editor opens on click
- [ ] Inline editor saves successfully
- [ ] Inline editor cancels without saving
- [ ] Deal name opens slideout
- [ ] Payment icon opens payment sidebar
- [ ] Slideout auto-refreshes data on save
- [ ] Dropdowns close when clicking outside

### Edge Cases
- [ ] Deals without Salesforce IDs show OVIS data only
- [ ] Handles deals with null/missing fields
- [ ] Large datasets (1000+ rows) perform well
- [ ] Filters with no matching results show empty state
- [ ] Concurrent edits don't cause data loss

---

## Common Pitfalls & Solutions

### 1. Wrong Salesforce Field Names
**Problem:** Using intuitive field names that don't match Salesforce schema
**Solution:** Always check `database-schema.ts` for exact field names

**Example:**
```typescript
// ❌ WRONG
sf_house: sfData?.House__c

// ✅ CORRECT
sf_house: sfData?.House_Dollars__c
```

### 2. Calculating Instead of Using Direct Fields
**Problem:** Calculating values that exist as fields in the database
**Solution:** Use the actual database field

**Example:**
```typescript
// ❌ WRONG - Calculates GCI, not AGCI
const ovisAGCI = ovisFee - ovisReferralFee;

// ✅ CORRECT - Uses actual AGCI field
const ovisAGCI = deal.agci || 0;
```

### 3. Filter Logic on Wrong Field
**Problem:** Applying closed_date filter to all deals instead of just "Closed Paid"
**Solution:** Check stage before applying date filter

**Example:**
```typescript
// ❌ WRONG - Filters all deals
filtered = filtered.filter(row => {
  if (!row.closed_date) return false;
  const year = new Date(row.closed_date).getFullYear();
  return year >= 2024;
});

// ✅ CORRECT - Only filters Closed Paid deals
filtered = filtered.filter(row => {
  if (row.ovis_stage === 'Closed Paid') {
    if (!row.closed_date) return false;
    const year = new Date(row.closed_date).getFullYear();
    return year >= 2024;
  }
  return true; // Keep all non-Closed Paid deals
});
```

### 4. Not Handling IsDeleted in Salesforce
**Problem:** Querying deleted Salesforce records
**Solution:** Always add `.eq('IsDeleted', false)`

**Example:**
```typescript
// ❌ WRONG
.from('salesforce_Opportunity')
.select('...')
.in('Id', sfIds);

// ✅ CORRECT
.from('salesforce_Opportunity')
.select('...')
.in('Id', sfIds)
.eq('IsDeleted', false);
```

### 5. Missing Refresh After Updates
**Problem:** Inline edits or slideout saves don't update the report
**Solution:** Call fetch function in onUpdate/onDealUpdated callbacks

**Example:**
```typescript
// ❌ WRONG - No refresh
<DealDetailsSlideout
  dealId={selectedDealId}
  isOpen={isSlideoutOpen}
  onClose={() => setIsSlideoutOpen(false)}
/>

// ✅ CORRECT - Refreshes data
<DealDetailsSlideout
  dealId={selectedDealId}
  isOpen={isSlideoutOpen}
  onClose={() => setIsSlideoutOpen(false)}
  onDealUpdated={() => fetchReconciliationData()}
/>
```

---

## Future Enhancements

### Potential Features to Add
1. **Export to Excel** - Download filtered data as spreadsheet
2. **Saved Filter Presets** - Save custom filter combinations
3. **Variance Threshold Settings** - Customize what variance is "significant"
4. **Auto-sync Toggle** - Automatically sync variances back to Salesforce
5. **Audit Trail** - Show history of changes made via inline editing
6. **Batch Operations** - Update multiple records at once
7. **Email Reports** - Schedule and email report snapshots
8. **Custom Metric Columns** - Let users choose which metrics to display
9. **Comparison Date Range** - Compare data between two time periods
10. **Drill-down Charts** - Visual representations of variances

---

## Related Components

### Components Used
- `DealDetailsSlideout` - Full deal details with tabs
- `PaymentDetailSidebar` - Payment details view
- `SlideOutPanel` - Reusable slideout container
- `DealDetailsForm` - Deal editing form

### Shared Types
- `PaymentDashboardRow` - Payment data structure (in `types/payment-dashboard.ts`)

---

## Changelog

### 2025-10-28
- Fixed OVIS AGCI to use `deal.agci` field instead of calculating `fee - referral_fee`
- Fixed Salesforce field mappings:
  - Fee: Use `Calculated_Amount__c`
  - Commission %: Use `Commission__c`
  - House $: Use `House_Dollars__c`
  - AGCI: Use `AGCI__c`
- Added refresh button to preserve filter state
- Added tabs to DealDetailsSlideout
- Reduced DealDetailsSlideout width to 45%
- Replaced PaymentAmountOverrideModal with PaymentDetailSidebar
- Added comprehensive debugging and documentation

### 2025-10-27
- Initial creation of Deal Reconciliation Report
- Created Payment Reconciliation Report
- Added multi-select stage filters
- Implemented date filter dropdowns with presets
- Added inline closed_date editing
- Integrated slideouts for drill-down viewing

---

## Questions & Support

For questions about implementing new reconciliation reports using this template, refer to:
1. This documentation
2. Existing report implementations in `src/components/reports/` and `src/components/payments/`
3. Database schema in `database-schema.ts`
4. Salesforce field mappings documented above

**Key Contacts:**
- Architecture questions: Review this doc and existing implementations
- Salesforce field names: Check `database-schema.ts`
- UX/design patterns: Follow existing report patterns for consistency
