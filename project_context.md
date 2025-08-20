# CRM Project Context - Updated August 20, 2025

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

## Database Migration Status

### Tables Successfully Migrated ✅
All tables use UPSERT pattern (preserves non-Salesforce records, updates existing, adds new):

1. **user** - From salesforce_User ✅
2. **contact_role** - Lookup table ✅
3. **deal_contact** - From salesforce_OpportunityContactRole ✅
4. **client** - From Account ✅
5. **contact** - From Contact ✅
6. **deal** - From Opportunity ✅
7. **property** - From Property__c ✅
8. **assignment** - From Assignment__c ✅
9. **property_unit** - From Property_Unit__c ✅
10. **site_submit** - From Site_Submits__c ✅
11. **broker** - Lookup table ✅
12. **commission_split** - From salesforce_Commission_Split__c ✅
13. **payment** - From salesforce_Payment__c ✅
14. **payment_split** - From salesforce_Payment_Split__c ✅

### Payment System Architecture ✅ (COMPLETE)

**Migration Results:**
- ✅ **4 Brokers** - Auto-created from Salesforce data
- ✅ **134 Commission Splits** - Deal-level commission templates  
- ✅ **174 Payments** - Individual payment records
- ✅ **328 Payment Splits** - Commission splits per payment

**System Components:**
- **Broker Table**: Simple name-based broker management
- **Commission Split (Deal Level)**: Master template for each broker per deal
- **Payment (Deal Level)**: Individual payment records with QB integration fields
- **Payment Split (Payment Level)**: Inherits commission template, allows overrides

**Trigger Functions Working:**
- `calculate_commission_split()` - Calculates USD amounts from percentages
- `calculate_payment_split()` - Inherits from commission templates, calculates per-payment amounts
- `generate_payments_for_deal()` - Creates payments with commission splits

## React Components Created/Updated

### Commission System UI ✅ (COMPLETE - PRODUCTION READY)

#### CommissionTab.tsx ✅
**Location**: `src/components/CommissionTab.tsx`
**Status**: Production ready with all TypeScript errors resolved

**Features**:
- **Deal-level commission fields** (editable):
  - Referral Fee % (editable input)
  - Referral Fee $ (calculated display)
  - Referral Payee (editable text input)
  - GCI (display)
  - AGCI (display)  
  - House % (editable input)
  - House $ (calculated display)
  - Origination % (editable input)
  - Origination $ (calculated display)
  - Site % (editable input)
  - Site $ (calculated display)
  - Deal % (editable input)
  - Deal $ (calculated display)
  - Number of Payments (editable - replaces legacy sf_multiple_payments)

- **Real-time commission calculations**:
  - Automatic recalculation when percentages change
  - Fee calculation from deal value and commission rate
  - GCI = Total fee
  - AGCI = GCI - Referral Fee
  - All broker amounts calculated from AGCI

- **Edit/Save functionality**:
  - Click-to-edit percentage inputs
  - Real-time field updates with auto-save
  - Database save operations with error handling
  - Form validation and warning system

- **Commission summary cards**:
  - Deal Fee (calculated)
  - Number of Payments (editable)
  - Commission Rate (from deal.commission_percent)

- **Validation system**:
  - Warns if broker splits total over 100%
  - Alerts for unusually high commission rates
  - Prevents referral fees over 100%

- **Broker commission splits table** (read-only):
  - Shows broker-level splits imported from Salesforce
  - Generate Payments button functionality
  - Displays percentage and dollar amounts per broker

#### DealDetailsPage.tsx ✅ (UPDATED)
**Location**: `src/pages/DealDetailsPage.tsx`
**Updates**:
- **Tabbed interface** added:
  - Overview tab (existing DealDetailsForm)
  - Commission tab (new CommissionTab component)
- **Tab navigation** with proper styling
- **State management** for active tab
- **Responsive design** maintained

## Type System Architecture ✅ (NEW - COMPLETE)

### Central Types Implementation ✅
**Location**: `src/lib/types.ts`
**Purpose**: Single source of truth for all data types across the project

**Key Interfaces**:
- **Deal**: Complete deal data with all commission fields (nullable for database compatibility)
- **DealCard**: Simplified version for Kanban display
- **CommissionSplit**: Broker-level commission breakdown
- **Broker**: Simple broker management
- **Payment/PaymentSplit**: Payment system types
- **Client/Contact/Property**: Core business entities
- **Utility Types**: DealUpdateHandler, ValidationWarning, ApiResponse

**Design Patterns**:
- All database fields properly typed as nullable (`number | null`)
- Type guards for runtime type checking
- Constants for validation rules and status values
- Export of utility types for component props

### File Updates for Central Types ✅
- **CommissionTab.tsx**: Updated to import from central types
- **KanbanBoard.tsx**: Removed duplicate DealCard interface, imports from central types
- **useKanbanData.ts**: Updated to use central DealCard and KanbanColumn types
- **Removed duplicate useDeals.ts**: Cleaned up conflicting file structure

## Commission Data Flow and Calculations

### Deal Table Fields (Editable in Commission Tab):
```sql
-- Commission rate and fee calculation
commission_percent NUMERIC(5,2)  -- User input percentage
fee NUMERIC(12,2)                -- Calculated from deal_value * commission_percent OR flat_fee_override

-- Deal-level commission breakdown  
referral_fee_percent NUMERIC(5,2)    -- Editable
referral_fee_usd NUMERIC(12,2)       -- Calculated: fee * (referral_fee_percent / 100)
referral_payee TEXT                   -- Editable
gci NUMERIC(12,2)                     -- Gross Commission Income = fee
agci NUMERIC(12,2)                    -- Adjusted GCI = gci - referral_fee_usd
house_percent NUMERIC(5,2)            -- Editable
house_usd NUMERIC(12,2)               -- Calculated: agci * (house_percent / 100)
origination_percent NUMERIC(5,2)      -- Editable  
origination_usd NUMERIC(12,2)         -- Calculated: agci * (origination_percent / 100)
site_percent NUMERIC(5,2)             -- Editable
site_usd NUMERIC(12,2)                -- Calculated: agci * (site_percent / 100)
deal_percent NUMERIC(5,2)             -- Editable
deal_usd NUMERIC(12,2)                -- Calculated: agci * (deal_percent / 100)

-- Payment configuration
number_of_payments INTEGER            -- Editable (replaces sf_multiple_payments)
sf_multiple_payments BOOLEAN          -- Legacy field, not shown in UI
```

### Commission Split Table (Broker Level - Read Only):
```sql
-- Per-broker commission breakdown (imported from Salesforce)
split_origination_percent NUMERIC(5,2)
split_origination_usd NUMERIC(12,2)
split_site_percent NUMERIC(5,2)
split_site_usd NUMERIC(12,2)  
split_deal_percent NUMERIC(5,2)
split_deal_usd NUMERIC(12,2)
split_broker_total NUMERIC(12,2)      -- Sum of all USD amounts
```

### Commission Calculation Logic ✅
1. **Fee Calculation**: `flat_fee_override ?? (deal_value * commission_percent / 100)`
2. **GCI (Gross Commission Income)**: `= fee`
3. **Referral Fee USD**: `fee * (referral_fee_percent / 100)`
4. **AGCI (Adjusted GCI)**: `gci - referral_fee_usd`
5. **Broker Amounts**: Each calculated as `agci * (broker_percent / 100)`

## UI Design Patterns Established

### Tabbed Interface Architecture ✅
- **Clean tab navigation** with active state styling
- **Conditional content rendering** based on active tab
- **Consistent spacing and typography**
- **Mobile responsive design**

### Commission Form Layout ✅
- **Grid-based responsive layout** (1-5 columns depending on row)
- **Click-to-edit percentage inputs** with inline editing
- **Read-only calculated fields** clearly distinguished from editable inputs
- **Number inputs** with proper step values (0.01 for percentages)
- **Currency formatting** for all dollar amounts
- **Percentage formatting** for all percentage fields
- **Auto-save functionality** with error handling

### Data Display Patterns ✅
- **Summary cards** for key metrics
- **Editable forms** with proper validation
- **Read-only tables** for reference data
- **Status indicators** (payment generation status)
- **Warning systems** with user-friendly messages
- **Hover states** and visual feedback for interactive elements

## TypeScript Architecture and Lessons Learned

### Key TypeScript Challenges Resolved ✅

#### 1. Scattered Type Definitions (MAJOR ISSUE)
**Problem**: Multiple files defining their own interfaces for the same data
- `CommissionTab.tsx` had its own `Deal` interface
- `KanbanBoard.tsx` had its own `DealCard` interface
- `useKanbanData.ts` had its own interfaces
- Resulted in type conflicts and "never" type errors

**Solution**: Created centralized `src/lib/types.ts`
- Single source of truth for all interfaces
- Consistent nullable field definitions matching database schema
- Proper type exports and imports across all files

#### 2. Null Handling in Template Literals (PERSISTENT ISSUE)
**Problem**: TypeScript errors when using potentially null values in template strings
```typescript
// This caused "string not assignable to never" errors
warnings.push(`Total ${dealData.commission_percent}% seems high`);
```

**Solution**: Extract and convert values before template usage
```typescript
// Safe approach that resolved all errors
const commission = Number(dealData.commission_percent) || 0;
warnings.push('Commission rate ' + commission.toFixed(1) + '% seems high');
```

#### 3. Function Parameter Type Mismatches
**Problem**: `PercentageInput` onChange function expected `(v: number | null) => void` but `updateField` had different signature

**Solution**: Simplified by removing explicit type annotations
```typescript
// Changed from complex typing to simple inference
onChange={(v) => updateField('field_name', v)}
```

### TypeScript Best Practices Established ✅

1. **Central Type Management**: Always use `src/lib/types.ts` for shared interfaces
2. **Database-First Typing**: Match TypeScript types to database schema (nullable fields)
3. **Safe String Interpolation**: Use string concatenation or Number() conversion for template literals
4. **Type Inference**: Let TypeScript infer types when possible rather than over-specifying
5. **Consistent Imports**: Always import types from central location, never define locally

## Current File Structure

```
src/
├── components/
│   ├── CommissionTab.tsx ✅ (COMPLETE - Production Ready)
│   ├── DealDetailsForm.tsx ✅
│   ├── PropertySelector.tsx ✅
│   ├── PropertyUnitSelector.tsx ✅
│   ├── SiteSubmitSelector.tsx ✅
│   ├── KanbanBoard.tsx ✅ (Updated with central types)
│   ├── FloatingPanelManager.tsx ✅
│   ├── FloatingPanelContainer.tsx ✅
│   ├── FloatingContactPanel.tsx ✅
│   ├── EditDealPanel.tsx ✅
│   ├── FormattedInput.tsx ✅
│   └── Navbar.tsx ✅
├── hooks/
│   ├── useKanbanData.ts ✅ (Updated with central types)
│   ├── useDealContacts.ts ✅
│   └── useEditDealPanel.ts ✅
├── lib/
│   ├── supabaseClient.ts ✅
│   └── types.ts ✅ (NEW - Central type definitions)
├── pages/
│   ├── DealDetailsPage.tsx ✅ (Updated with Commission tab)
│   └── (other pages)
├── utils/
│   ├── format.ts ✅
│   └── stageProbability.ts ✅
└── App.tsx ✅
```

## Key Business Rules Implemented

1. **Deal-level commission structure** - Editable percentages with auto-calculated USD amounts
2. **Broker-level commission splits** - Read-only view of individual broker allocations imported from Salesforce
3. **Payment generation** - Creates payments based on commission splits and number_of_payments setting
4. **Real-time calculations** - All USD amounts update automatically when percentages change
5. **Validation system** - Warns users of potential data issues (splits over 100%, high rates, etc.)
6. **Auto-save functionality** - Changes saved immediately to database with error handling
7. **Legacy field handling** - sf_multiple_payments hidden, number_of_payments editable
8. **Commission rate display** - Shows user-input commission_percent, not calculated rate

## Session Accomplishments

### August 14, 2025 Session ✅ (COMPLETE)
- ✅ **Payment system migration** - Successfully migrated 4 tables with 134+ records
- ✅ **Commission Tab UI** - Complete editable interface matching Salesforce layout
- ✅ **Tabbed navigation** - Added Overview/Commission tabs to DealDetailsPage
- ✅ **Field mapping** - Identified all commission fields needed for editing
- ✅ **Edit functionality** - Working save/cancel with database updates
- ✅ **Data validation** - Proper TypeScript interfaces and field types
- ✅ **UI patterns** - Established responsive grid layout for commission forms
- ✅ **Legacy cleanup** - Replaced sf_multiple_payments with editable number_of_payments

### August 20, 2025 Session ✅ (COMPLETE)
- ✅ **TypeScript Architecture Overhaul** - Implemented centralized type system
- ✅ **Type Error Resolution** - Fixed all TypeScript compilation errors
- ✅ **Code Quality Improvements** - Eliminated duplicate interfaces and conflicting types
- ✅ **Commission Calculation Logic** - Documented and implemented proper calculation flow
- ✅ **File Structure Cleanup** - Removed duplicate files, standardized imports
- ✅ **Production Readiness** - Commission Tab now fully functional and error-free
- ✅ **Developer Experience** - Established patterns for future component development

**Key Lessons Learned:**
1. **Central type management is critical** for TypeScript projects
2. **Database schema should drive TypeScript interfaces** (nullable fields)
3. **Template literal type safety** requires careful null handling
4. **Duplicate file cleanup** prevents confusion and type conflicts
5. **Incremental type adoption** works better than trying to fix everything at once

## Next Priorities

### Phase 1: Payments Management (Next Session)
1. **Payments Tab** - Create individual payment management interface
2. **Payment status tracking** - Mark payments as sent/received
3. **Payment date management** - Schedule and track payment dates
4. **QuickBooks integration preparation** - Fields and data structure

### Phase 2: Enhanced Features
1. **Advanced commission overrides** - Payment-level commission adjustments
2. **Bulk payment operations** - Generate payments for multiple deals
3. **Commission reporting** - Statements and payment tracking dashboards
4. **Workflow automation** - Payment reminders and notifications

### Phase 3: Integration and Optimization
1. **QuickBooks Online integration** - Sync payments with accounting system
2. **Advanced reporting** - Commission analytics and broker performance
3. **Mobile optimization** - Touch-friendly commission editing
4. **Audit trail system** - Track all commission and payment changes
5. **Performance optimization** - Lazy loading and data caching

## Testing Status
- ✅ **Payment system backend** - All triggers and functions tested and working
- ✅ **Commission UI** - Full functionality tested, saves to database correctly
- ✅ **Type system** - All TypeScript errors resolved, no compilation issues
- ✅ **Commission calculations** - Mathematical logic verified and working
- ✅ **Auto-save functionality** - Database updates working with error handling
- ⏳ **End-to-end workflows** - Commission changes → Payment regeneration (next phase)
- ⏳ **Cross-browser testing** - Not yet performed
- ⏳ **Mobile responsive testing** - Basic responsive design in place, needs testing

## Development Environment Setup

### Required Steps for New Developers:
1. **GitHub Codespaces** - Browser-based VS Code environment
2. **Supabase connection** - Database access and API keys
3. **Central types import** - Always import from `src/lib/types.ts`
4. **TypeScript strict mode** - Project uses strict TypeScript compilation
5. **Database schema familiarity** - Understand nullable fields and calculation logic

### Code Quality Standards Established:
- **Central type definitions** - Never create local interfaces for shared data
- **Null-safe operations** - Always handle potentially null database values
- **Auto-save patterns** - Immediate database updates with error handling
- **Responsive design** - Mobile-first approach with progressive enhancement
- **Component isolation** - Self-contained components with clear prop interfaces

## Critical Notes for Future Sessions

### Commission System:
- ✅ **Commission field sources mapped** - All calculations documented and implemented
- ✅ **Calculation logic established** - Mathematical relationships working correctly
- ✅ **Field dependencies documented** - Clear understanding of derived vs. user-input fields
- ✅ **Auto-save implemented** - Changes persist immediately with proper error handling

### Technical Debt Resolved:
- ✅ **Type system centralized** - No more scattered interface definitions
- ✅ **Duplicate files removed** - Clean file structure established
- ✅ **Import consistency** - All components use central types
- ✅ **TypeScript compilation** - Zero errors, production ready

### Areas for Future Enhancement:
1. **Performance optimization** - Consider React.memo for complex calculations
2. **Offline capability** - Handle network interruptions gracefully
3. **Advanced validation** - Business rule validation beyond current warnings
4. **Accessibility improvements** - ARIA labels and keyboard navigation
5. **Internationalization** - Currency and number formatting for different locales

**Status**: Commission Tab system is complete and production-ready. TypeScript architecture is solid and scalable. Ready to proceed with Payments Tab development in next session.