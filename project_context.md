# CRM Project Context - Updated August 22, 2025 (Commission Calculations Centralization - RESTART WITH PROPER ARCHITECTURE)

## Project Overview
Building a custom CRM system to replace Salesforce for a commercial real estate brokerage. The system provides better customization, improved dashboards, UX, customer portals, and AI tool integration with the database.

## Tech Stack
- **Database**: Supabase (PostgreSQL)
- **Frontend**: React with TypeScript
- **IDE**: GitHub Codespaces (browser-based VS Code)
- **Data Migration**: Airbyte (Salesforce → Supabase staging tables)
- **Database Management**: DB Beaver (for schema downloads and mapping)
- **Version Control**: GitHub
- **Auth**: [TBD]
- **Developer Experience**: Non-coder friendly with step-by-step instructions required

## 🗂️ Component Architecture Philosophy

### Modular Component Strategy ⭐ IMPORTANT ⭐
**Always suggest breaking up components when files get large (200+ lines) or handle multiple responsibilities.**

**Break up components when:**
- Files exceed ~200 lines
- Multiple responsibilities exist in one component
- Logic could be reused elsewhere
- Different parts change for different reasons
- Scrolling is needed to find code sections

**Benefits achieved:**
- Single Responsibility Principle
- Better reusability and testability
- Easier debugging and maintenance
- Better team collaboration
- Reduced risk of breaking unrelated functionality

### Component Breakdown Examples
- Extract reusable input components (PercentageInput, AutocompleteInputs)
- Separate data fetching from UI components
- Pull out complex validation logic
- Create specialized display components
- Split large forms into focused sections
- **Extract reusable modals and confirmation dialogs**
- **Extract calculation logic into centralized hooks/utilities** ⭐ CURRENT PRIORITY ⭐

## 🔗 Database Schema Reference (Generated August 22, 2025)

### commission_split Table
```sql
CREATE TABLE commission_split (
  id: UUID PRIMARY KEY,
  deal_id: UUID REFERENCES deal(id),
  broker_id: UUID REFERENCES broker(id) NULLABLE,
  -- Commission split percentages (editable by users)
  split_origination_percent: number | null,
  split_site_percent: number | null, 
  split_deal_percent: number | null,
  -- Calculated USD amounts (auto-calculated from percentages)
  split_origination_usd: number | null,
  split_site_usd: number | null,
  split_deal_usd: number | null,
  split_broker_total: number | null,
  -- Metadata
  created_at: string,
  updated_at: string,
  created_by_id: UUID REFERENCES user(id),
  updated_by_id: UUID REFERENCES user(id)
);
```

### deal Table (Commission Fields)
```sql
CREATE TABLE deal (
  id: UUID PRIMARY KEY,
  -- Base commission amounts
  gci: number | null,                    -- Gross Commission Income
  agci: number | null,                   -- After GCI (calculated: gci - house_usd)
  house_usd: number | null,              -- House amount in USD
  house_percent: number | null,          -- House percentage
  -- Commission breakdown percentages
  origination_percent: number | null,     -- Origination percentage of AGCI
  site_percent: number | null,           -- Site percentage of AGCI  
  deal_percent: number | null,           -- Deal percentage of AGCI
  -- Calculated USD amounts (should be auto-calculated)
  origination_usd: number | null,        -- origination_percent × AGCI
  site_usd: number | null,              -- site_percent × AGCI
  deal_usd: number | null,              -- deal_percent × AGCI
  -- Other commission fields
  commission_percent: number | null,
  referral_fee_percent: number | null,
  referral_fee_usd: number | null,
  referral_payee_client_id: UUID REFERENCES client(id),
  number_of_payments: number | null,
  -- [other deal fields...]
);
```

### broker Table
```sql
CREATE TABLE broker (
  id: UUID PRIMARY KEY,
  name: string NOT NULL,
  -- Note: No 'active' column - fetch all brokers without filtering
  created_at: string,
  updated_at: string
);
```

## 📊 Current State Analysis (August 22, 2025)

### Working Components ✅

**CommissionDetailsSection.tsx** (375 lines)
- ✅ **Proper layout** - Section-based structure with help tooltips
- ✅ **Field organization** - Logical grouping of commission fields
- ✅ **User interaction** - PercentageInput components for editing
- ✅ **Display logic** - Shows calculated USD amounts from deal object
- ⚠️ **Issue**: Displays `deal.origination_usd` etc. from database (may be stale)

**CommissionSplitSection.tsx** (600+ lines)  
- ✅ **Full broker management** - Add/delete brokers, inline percentage editing
- ✅ **Validation system** - Total percentage validation with color coding
- ✅ **Error handling** - Foreign key constraint errors, loading states
- ✅ **Real-time calculations** - Local `calculateUsdAmounts()` function
- ⚠️ **Issue**: Local calculations may be inconsistent with deal-level calculations

### Database Architecture Issues Identified 🚨

**1. Calculation Logic Duplication**
- Deal-level USD amounts calculated somewhere (database triggers?)
- Broker split USD amounts calculated locally in components
- **Problem**: Two different calculation systems may use different formulas

**2. Potential Database Trigger Issues**
- If triggers calculate `deal.origination_usd` using old formulas (e.g., percentage × GCI instead of percentage × AGCI)
- **Impact**: Database overwrites correct frontend calculations with wrong values

**3. Field Name Clarity**
- Database uses `split_origination_percent` (confirmed from schema)
- Interface names in types.ts need to match exactly
- **Problem**: Previous attempts used `broker_origination_percent` (wrong field names)

## 🎯 Commission Calculation Architecture Plan

### Current Business Logic (Confirmed from Working Code)
```typescript
// Deal-level calculations (AGCI-based):
const agci = gci - house_usd;                           // After GCI
const origination_usd = (origination_percent / 100) * agci;  // Not × gci
const site_usd = (site_percent / 100) * agci;          
const deal_usd = (deal_percent / 100) * agci;          

// Broker split calculations (based on deal-level amounts):
const originationSplitUSD = (split_origination_percent / 100) * origination_usd;
const siteSplitUSD = (split_site_percent / 100) * site_usd;
const dealSplitUSD = (split_deal_percent / 100) * deal_usd;
const totalUSD = originationSplitUSD + siteSplitUSD + dealSplitUSD;
```

### Problem: Manual Workarounds Needed ⚠️
**Current Issue**: User has to manually edit broker percentages to force number refresh
**Root Cause**: Database and frontend calculations are inconsistent

### Solution: Centralized Calculation Hook 🎯

**Phase 1: Create Centralized Hook** (15 minutes)
- Create `useCommissionCalculations(deal)` hook
- **Correct field names**: Use `split_origination_percent` etc. from schema
- **Correct formulas**: AGCI-based calculations
- Test hook independently before touching components

**Phase 2: Update CommissionDetailsSection** (10 minutes)  
- Replace `deal.origination_usd` with `baseAmounts.originationUSD` from hook
- Keep all existing UI, layout, and functionality
- **No other changes** - just swap data source

**Phase 3: Update CommissionSplitSection** (15 minutes)
- Replace local `calculateUsdAmounts()` with hook calculations  
- Keep all existing broker management, validation, error handling
- **No other changes** - just swap calculation logic

**Phase 4: Database Trigger Investigation** (10 minutes)
- Check if database triggers overwrite correct calculations
- Update triggers if they use wrong formulas
- **Critical**: Fix triggers before testing end-to-end

**Phase 5: Data Cleanup** (5 minutes)
- SQL script to recalculate existing records with correct formulas
- Run only after new calculation system is verified working

## 🚨 CRITICAL DEVELOPMENT PRINCIPLES

### Never Repeat These Mistakes ⚠️
1. **Never rewrite working components** - only replace specific calculation logic
2. **Never assume field names** - always reference database schema
3. **Never change multiple things at once** - micro-iterations only
4. **Never ignore TypeScript errors** - fix immediately or revert
5. **Never guess component interfaces** - check existing working code

### Mandatory Process for Database Changes 📋
**Anytime we change database schema:**
1. 🔄 **Download schema**: `supabase gen types typescript --project-id rqbvcvwbziilnycqtmnc > database-schema.ts`
2. 📤 **Upload to GitHub**: Commit to version control
3. 📋 **Upload to Claude**: Add to conversation for reference

### Development Rules 🎯
- **One change per phase** - test immediately after each change
- **Revert if broken** - never debug broken states, go back to working version
- **Keep working patterns** - preserve existing imports, exports, component structure
- **Schema first** - check database schema before writing any database code
- **User is non-technical** - provide step-by-step instructions, minimize TypeScript battles

## 📁 File Structure Status

```
src/
├── components/
│   ├── CommissionDetailsSection.tsx     ✅ Working (375 lines) - displays commission details with sections
│   ├── CommissionSplitSection.tsx       ✅ Working (600+ lines) - full broker split management  
│   ├── PercentageInput.tsx              ✅ Working - inline percentage editing
│   ├── ReferralPayeeAutocomplete.tsx    ✅ Working - client/broker selection
│   ├── DeleteConfirmationModal.tsx      ✅ Working - reusable confirmation
│   ├── CommissionTab.tsx                ✅ Working - orchestrates both sections
│   ├── PaymentTab.tsx                   ✅ Working - payment management
│   └── DealDetailsPage.tsx              ✅ Working - three-tab interface
├── hooks/
│   └── useCommissionCalculations.ts     🚧 TO CREATE - centralized calculation logic
├── lib/
│   ├── types.ts                         ⚠️ NEEDS UPDATE - fix field names to match schema
│   └── supabaseClient.ts                ✅ Working
├── database-schema.ts                   ✅ NEW - complete schema reference (299KB)
└── project_context.md                   ✅ UPDATED - this document
```

## Success Criteria ✅

**Phase 1 Success**: Hook calculates correct amounts independently
**Phase 2 Success**: CommissionDetailsSection shows real-time calculated amounts  
**Phase 3 Success**: CommissionSplitSection uses centralized calculations
**Phase 4 Success**: Database triggers use correct formulas
**Phase 5 Success**: No manual workarounds needed - all calculations automatic

## Next Session Plan 🚀

1. **Fix TypeScript interfaces** - Update types.ts to match database schema exactly
2. **Create calculation hook** - Centralized logic with correct field names  
3. **Update components incrementally** - One at a time, test each change
4. **Verify database triggers** - Ensure consistent calculation formulas
5. **Test end-to-end** - Verify no manual refresh workarounds needed

**Goal**: Automatic commission calculations without manual intervention in under 1 hour using micro-iterations.

## Current Working State Backup 💾

**Before ANY changes, the working components are:**
- CommissionDetailsSection.tsx - 375 lines with proper section layout
- CommissionSplitSection.tsx - 600+ lines with full broker management  
- Both components work but need centralized calculations for consistency

**If anything breaks during centralization, revert to these working versions immediately.**