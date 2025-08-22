# CRM Project Context - Updated August 22, 2025 (Commission System COMPLETED ✅)

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
- **Extract calculation logic into centralized hooks/utilities** ✅ COMPLETED

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
  -- Calculated USD amounts (may contain stale Salesforce data)
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
  -- Calculated USD amounts (may contain stale Salesforce data)
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

## 📊 COMPLETED: Commission Calculation Architecture ✅

### Centralized Calculation Hook - IMPLEMENTED
**Location**: `src/hooks/useCommissionCalculations.ts`

**Business Logic (Confirmed Working)**:
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

### Data Strategy - HYBRID APPROACH ✅
**Problem Solved**: Deal-level amounts and broker split totals now match perfectly.

**Current Implementation**:
- ✅ **Display**: Real-time calculations using centralized hook (always correct)
- ✅ **Database**: Updated with correct calculations when user edits percentages
- ⚠️ **Legacy Data**: Salesforce imports retain original calculations (may be stale)
- ✅ **Manual Edits**: Database gets corrected with proper formulas when user touches any percentage

**Benefits**:
- **Immediate UX**: Users see correct calculations instantly
- **Data Integrity**: Original Salesforce data preserved for audit trail
- **Gradual Cleanup**: Database becomes more accurate over time through usage
- **Safe Migration**: No risk of "correcting" data that was actually right

### Components Updated ✅

**CommissionDetailsSection.tsx** (375 lines)
- ✅ **Uses centralized hook** - `baseAmounts` from `useCommissionCalculations`
- ✅ **Real-time calculations** - USD amounts update instantly when percentages change
- ✅ **Proper layout** - Section-based structure with help tooltips maintained
- ✅ **All existing functionality preserved** - PercentageInput components, validation, etc.

**CommissionSplitSection.tsx** (650+ lines)  
- ✅ **Uses centralized hook** - `baseAmounts` from `useCommissionCalculations`
- ✅ **Consistent calculations** - Broker splits now based on deal-level amounts
- ✅ **Real-time display** - Table shows calculated values, not stale database values
- ✅ **Database updates** - Saves correct calculations when percentages edited
- ✅ **All existing functionality preserved** - Broker management, validation, error handling
- ✅ **Perfect totals** - Broker split totals exactly match deal-level amounts
- ✅ **FORMATTING COMPLETED** - Consistent fonts, proper USD formatting, optimized layout

**useCommissionCalculations.ts** - NEW HOOK
- ✅ **Centralized logic** - Single source of truth for all commission calculations
- ✅ **Correct field names** - Uses exact database schema field names
- ✅ **AGCI-based formulas** - Proper business logic implementation
- ✅ **Validation helpers** - Percentage total validation with color coding
- ✅ **Real-time updates** - Recalculates automatically when deal or splits change

## 🎨 COMPLETED: UI/UX Enhancements ✅

### Font Size Standardization
- **Headers**: Consistent `text-lg font-medium` across all commission sections
- **Table headers**: Uniform `text-xs font-medium text-gray-500 uppercase tracking-wider`
- **Table data**: Standardized `text-sm` for all data cells
- **Broker names**: Optimized `text-xs` for better space utilization

### Professional Currency Formatting
- **formatUSD() helper**: Centralized currency formatting with commas and 2 decimals
- **Applied consistently**: All USD amounts display as `$12,345.67`
- **Null handling**: Graceful handling of null/undefined values (displays `$0.00`)
- **Visual hierarchy**: Totals emphasized with appropriate font weights

### Layout Optimizations
- **Broker column width**: Fixed `w-48` (192px) width prevents name wrapping
- **Single-line names**: `whitespace-nowrap` ensures broker names stay on one line
- **Responsive design**: `overflow-x-auto` maintains table usability on smaller screens
- **Consistent spacing**: Uniform padding and margins across all sections

## 🎯 Current Working State ✅

### Success Criteria - ALL MET
- ✅ **Phase 1**: Hook calculates correct amounts independently
- ✅ **Phase 2**: CommissionDetailsSection shows real-time calculated amounts  
- ✅ **Phase 3**: CommissionSplitSection uses centralized calculations
- ✅ **Phase 4**: Database saves correct formulas when edited
- ✅ **Phase 5**: No manual workarounds needed - all calculations automatic
- ✅ **Phase 6**: Professional formatting with consistent fonts and currency display
- ✅ **Phase 7**: Optimized layout for better readability and usability

### User Experience Achieved ✅
- **No manual refresh needed** - Everything updates in real-time
- **Perfect number matching** - Deal totals = broker split totals
- **Immediate feedback** - Change percentage, see instant USD updates
- **Consistent calculations** - Same formulas used everywhere
- **Preserved functionality** - All existing features still work
- **Professional appearance** - Consistent fonts, proper currency formatting
- **Optimized layout** - Better use of space, single-line broker names

## 📋 Technical Debt Logged

### Typography Refactoring - Future Enhancement
- **Priority**: After core CRM functionality is complete
- **Goal**: Replace scattered Tailwind font classes with centralized CSS classes
- **Approach**: Create reusable Typography components and design system
- **Benefits**: Better maintainability, consistent design language, easier theming

### Rationale for Deferring
- Current Tailwind approach is working well and consistent across codebase
- Non-technical user focused on functionality over architecture
- Risk/reward favors completing core features first
- Can be refactored systematically after MVP is complete

## 🚨 CRITICAL DEVELOPMENT PRINCIPLES

### Never Repeat These Mistakes ⚠️
1. **Never rewrite working components** - only replace specific calculation logic ✅ FOLLOWED
2. **Never assume field names** - always reference database schema ✅ FOLLOWED
3. **Never change multiple things at once** - micro-iterations only ✅ FOLLOWED
4. **Never ignore TypeScript errors** - fix immediately or revert ✅ FOLLOWED
5. **Never guess component interfaces** - check existing working code ✅ FOLLOWED
6. **Never create new implementations when minimal edits work** - preserve existing functionality ✅ LEARNED

### Mandatory Process for Database Changes 📋
**Anytime we change database schema:**
1. 📄 **Download schema**: `supabase gen types typescript --project-id rqbvcvwbziilnycqtmnc > database-schema.ts`
2. 📤 **Upload to GitHub**: Commit to version control
3. 📋 **Upload to Claude**: Add to conversation for reference

### Development Rules 🎯
- **One change per phase** - test immediately after each change ✅ USED
- **Revert if broken** - never debug broken states, go back to working version ✅ USED
- **Keep working patterns** - preserve existing imports, exports, component structure ✅ USED
- **Schema first** - check database schema before writing any database code ✅ USED
- **User is non-technical** - provide step-by-step instructions, minimize TypeScript battles ✅ USED
- **Minimal edits over rewrites** - when possible, provide specific line changes rather than full rewrites ✅ LEARNED

## 📁 File Structure Status

```
src/
├── components/
│   ├── CommissionDetailsSection.tsx     ✅ COMPLETED - centralized calculations, consistent formatting
│   ├── CommissionSplitSection.tsx       ✅ COMPLETED - centralized calculations, professional formatting
│   ├── PercentageInput.tsx              ✅ Working - inline percentage editing
│   ├── ReferralPayeeAutocomplete.tsx    ✅ Working - client/broker selection
│   ├── DeleteConfirmationModal.tsx      ✅ Working - reusable confirmation
│   ├── CommissionTab.tsx                ✅ Working - orchestrates both sections
│   ├── PaymentTab.tsx                   🎯 NEXT TARGET - payment management
│   └── DealDetailsPage.tsx              ✅ Working - three-tab interface
├── hooks/
│   └── useCommissionCalculations.ts     ✅ COMPLETED - centralized calculation logic
├── lib/
│   ├── types.ts                         ✅ Working - TypeScript interfaces
│   └── supabaseClient.ts                ✅ Working
├── database-schema.ts                   ✅ Current - complete schema reference (299KB)
└── project_context.md                   ✅ UPDATED - this document
```

## 🚀 Next Session Plan: Payment Tab Analysis

### Current Status: Commission System Complete 🎯
**The commission calculation and formatting system is now fully complete and professional.** Ready to focus on payment management.

### PaymentTab.tsx Analysis Needed
1. **Understand current payment structure** - How payments relate to deals and commission splits
2. **Identify payment calculation logic** - Similar centralization opportunity?
3. **Check payment-commission consistency** - Do payment amounts match commission calculations?
4. **Review payment workflow** - Generation, editing, tracking, status management
5. **Assess formatting consistency** - Apply same professional standards as commission sections

### Payment Schema Reference
From database schema, key payment tables:
- **payment** table - Main payment records with amounts and dates
- **payment_split** table - How payments are split among brokers
- **commission_split** table - Templates for payment generation

### Success Pattern to Follow
- ✅ **Micro-iterations** - Small, testable changes
- ✅ **Preserve working code** - Don't rewrite, only enhance
- ✅ **Centralized calculations** - Extract payment logic into hooks if needed
- ✅ **Real-time updates** - Consistent user experience
- ✅ **Database accuracy** - Save correct calculations when edited
- ✅ **Professional formatting** - Consistent fonts, proper currency display
- ✅ **Minimal edits approach** - Provide specific changes rather than rewrites

## Current Working State Backup 💾

**COMMISSION SYSTEM IS NOW COMPLETE AND PRODUCTION-READY:**
- CommissionDetailsSection.tsx - Real-time calculations with centralized hook, professional formatting
- CommissionSplitSection.tsx - Consistent totals that match deal amounts, optimized layout
- useCommissionCalculations.ts - Single source of truth for all commission math

**All commission functionality works perfectly:**
- Real-time percentage editing with immediate USD updates
- Automatic calculations using centralized business logic
- Perfect total matching between deal-level and broker split amounts
- Database consistency when percentages are edited
- Legacy Salesforce data preservation for audit trail
- Professional formatting with consistent fonts and currency display
- Optimized layout with proper spacing and column widths

**Technical debt properly documented and prioritized for post-MVP refactoring.**

**Ready to proceed to Payment Tab analysis and enhancement with full confidence in commission foundation.**