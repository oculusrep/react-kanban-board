# Bugfix 2025-01-29: Commission Split Stale Values

## Summary
Fixed a bug where broker commission totals were showing incorrect/stale values in the Rob Report and Commission Tab. The stored `split_broker_total` values in the database were not being recalculated when individual percentage fields were updated, causing reports to display outdated amounts.

---

## Problem Description

### Symptoms
- On the deal "LCF - The Peach - Buckhead", Arty's net showed $120k instead of the correct $54k
- The Quick Summary in Commission Tab showed incorrect "Total Broker Amount"
- The 2025 Rob Report was pulling stale stored values for broker nets

### Root Cause
When editing a commission split percentage field (origination, site, or deal), only that specific USD field was being recalculated. The other USD fields retained their old values, and `split_broker_total` was calculated from a mix of fresh and stale values.

**Example:**
1. User updates `split_origination_percent` from 50% to 25%
2. Code recalculates `split_origination_usd` correctly
3. `split_site_usd` and `split_deal_usd` retain their OLD values
4. `split_broker_total` = new origination + OLD site + OLD deal = WRONG

---

## Fixes Applied

### 1. CommissionSplitSection.tsx - Recalculate ALL USD Values

**Location:** `src/components/CommissionSplitSection.tsx`

**Change:** When any percentage field is updated, now recalculates ALL three USD amounts from current base amounts before summing the total.

```typescript
// ALWAYS recalculate ALL USD amounts from current baseAmounts (fixes stale value bug)
updatedSplit.split_origination_usd = (updatedSplit.split_origination_percent || 0) / 100 * baseAmounts.originationUSD;
updatedSplit.split_site_usd = (updatedSplit.split_site_percent || 0) / 100 * baseAmounts.siteUSD;
updatedSplit.split_deal_usd = (updatedSplit.split_deal_percent || 0) / 100 * baseAmounts.dealUSD;

// Recalculate total from fresh USD values
updatedSplit.split_broker_total =
  updatedSplit.split_origination_usd +
  updatedSplit.split_site_usd +
  updatedSplit.split_deal_usd;
```

---

### 2. CommissionTab.tsx - On-the-Fly Calculation for Quick Summary

**Location:** `src/components/CommissionTab.tsx`

**Change:** The Quick Summary section now calculates "Total Broker Amount" on-the-fly from percentages instead of summing stored `split_broker_total` values.

```typescript
const { baseAmounts } = useCommissionCalculations(deal || propDeal, commissionSplits);

const calculatedBrokerTotal = useMemo(() => {
  return commissionSplits.reduce((sum, split) => {
    const origUSD = ((split.split_origination_percent || 0) / 100) * baseAmounts.originationUSD;
    const siteUSD = ((split.split_site_percent || 0) / 100) * baseAmounts.siteUSD;
    const dealUSD = ((split.split_deal_percent || 0) / 100) * baseAmounts.dealUSD;
    return sum + origUSD + siteUSD + dealUSD;
  }, 0);
}, [commissionSplits, baseAmounts]);
```

---

### 3. RobReport2025.tsx - On-the-Fly Calculation for Reports

**Location:** `src/components/reports/RobReport2025.tsx`

**Change:** The 2025 Rob Report now calculates all broker totals on-the-fly instead of using stored `split_broker_total` values.

**New helper function:**
```typescript
const calculateBrokerTotalForDeal = (dealId: string, brokerId: string): number => {
  const deal = dealsById.get(dealId);
  if (!deal) return 0;

  const splits = splitsByDeal.get(dealId) || [];
  const brokerSplit = splits.find(s => s.broker_id === brokerId);
  if (!brokerSplit) return 0;

  // Calculate base amounts (same logic as useCommissionCalculations)
  const gci = deal.fee || 0;
  const referralFeeUsd = deal.referral_fee_usd || 0;
  const houseUsd = deal.house_usd || 0;
  const agci = gci - referralFeeUsd - houseUsd;

  // Deal-level USD amounts
  const originationUSD = ((deal.origination_percent || 0) / 100) * agci;
  const siteUSD = ((deal.site_percent || 0) / 100) * agci;
  const dealUSD = ((deal.deal_percent || 0) / 100) * agci;

  // Calculate broker's share from percentages
  const originationSplitUSD = ((brokerSplit.split_origination_percent || 0) / 100) * originationUSD;
  const siteSplitUSD = ((brokerSplit.split_site_percent || 0) / 100) * siteUSD;
  const dealSplitUSD = ((brokerSplit.split_deal_percent || 0) / 100) * dealUSD;

  return originationSplitUSD + siteSplitUSD + dealSplitUSD;
};
```

**Updated helper functions to use on-the-fly calculation:**
- `sumBrokerSplitsForDeals()` - now calls `calculateBrokerTotalForDeal()`
- `getBrokerSplitForDeal()` - now calls `calculateBrokerTotalForDeal()`
- `countDealsWithoutGregSplit()` - uses calculated values
- `countDealsWithoutSplits()` - uses calculated values
- `buildDealDetails()` - calculates broker nets before building detail object

**Additional query fields added:**
- Deal table: `fee`, `referral_fee_usd`, `origination_percent`, `site_percent`, `deal_percent`
- Commission split table: `split_origination_percent`, `split_site_percent`, `split_deal_percent`

---

## Files Modified

| File | Change Type |
|------|-------------|
| `src/components/CommissionSplitSection.tsx` | Recalculate all USD values on percentage change |
| `src/components/CommissionTab.tsx` | On-the-fly calculation for Quick Summary |
| `src/components/reports/RobReport2025.tsx` | On-the-fly calculation for all broker totals |

---

## Commission Calculation Logic Reference

The correct calculation flow (matching `useCommissionCalculations.ts`):

```
GCI (deal.fee) = Total Commission
AGCI = GCI - referral_fee_usd - house_usd

Deal-Level Amounts (from AGCI):
  originationUSD = (origination_percent / 100) * AGCI
  siteUSD = (site_percent / 100) * AGCI
  dealUSD = (deal_percent / 100) * AGCI

Broker Split Amounts (from Deal-Level):
  broker_origination = (split_origination_percent / 100) * originationUSD
  broker_site = (split_site_percent / 100) * siteUSD
  broker_deal = (split_deal_percent / 100) * dealUSD

Broker Total = broker_origination + broker_site + broker_deal
```

---

## Testing Checklist

- [x] Edit commission split percentage - all USD values recalculate
- [x] Quick Summary shows correct Total Broker Amount
- [x] 2025 Rob Report shows correct broker nets
- [x] Expanded deal details in report show correct amounts
- [x] Build compiles without errors

---

## Production Status

✅ **Deployed to production** - Committed and pushed to main branch

**Commits:**
1. `fc4f5d4` - Fix 2025 Rob Report to calculate broker totals on-the-fly

---

## Future Considerations

The regular Rob Report (`RobReport.tsx`) may also benefit from this same fix if it experiences similar stale value issues. The same pattern of on-the-fly calculation can be applied.
