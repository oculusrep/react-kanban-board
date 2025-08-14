# CRM Project Context - Updated August 14, 2025

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
11. **broker** - Lookup table ✅ (NEW)
12. **commission_split** - From salesforce_Commission_Split__c ✅ (NEW)
13. **payment** - From salesforce_Payment__c ✅ (NEW)
14. **payment_split** - From salesforce_Payment_Split__c ✅ (NEW)

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

### Commission System UI ✅ (NEW - COMPLETE)

#### CommissionTab.tsx ✅
**Location**: `src/components/CommissionTab.tsx`
**Features**:
- **Deal-level commission fields** (editable):
  - Referral Fee % (editable input)
  - Referral Fee $ (calculated display)
  - Referral Payee (editable text)
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

- **Edit/Save functionality**:
  - Edit mode toggle
  - Real-time field updates
  - Database save operations
  - Form validation and error handling

- **Commission summary cards**:
  - Deal Fee
  - Number of Payments  
  - Commission Rate (from deal.commission_percent)

- **Broker commission splits table** (read-only):
  - Shows broker-level splits imported from Salesforce
  - Generate Payments button functionality

#### DealDetailsPage.tsx ✅ (UPDATED)
**Location**: `src/pages/DealDetailsPage.tsx`
**Updates**:
- **Tabbed interface** added:
  - Overview tab (existing DealDetailsForm)
  - Commission tab (new CommissionTab component)
- **Tab navigation** with proper styling
- **State management** for active tab
- **Responsive design** maintained

## Commission Data Sources and Calculations

### Deal Table Fields (Editable in Commission Tab):
```sql
-- Commission rate and fee calculation
commission_percent NUMERIC(5,2)  -- User input percentage
fee NUMERIC(12,2)                -- Calculated or manual override

-- Deal-level commission breakdown  
referral_fee_percent NUMERIC(5,2)    -- Editable
referral_fee_usd NUMERIC(12,2)       -- Calculated
referral_payee TEXT                   -- Editable
gci NUMERIC(12,2)                     -- Calculated/Display
agci NUMERIC(12,2)                    -- Calculated/Display
house_percent NUMERIC(5,2)            -- Editable
house_usd NUMERIC(12,2)               -- Calculated
origination_percent NUMERIC(5,2)      -- Editable  
origination_usd NUMERIC(12,2)         -- Calculated
site_percent NUMERIC(5,2)             -- Editable
site_usd NUMERIC(12,2)                -- Calculated
deal_percent NUMERIC(5,2)             -- Editable
deal_usd NUMERIC(12,2)                -- Calculated

-- Payment configuration
number_of_payments INTEGER            -- Editable (replaces sf_multiple_payments)
sf_multiple_payments BOOLEAN          -- Legacy field, not shown in UI
```

### Commission Split Table (Broker Level - Read Only):
```sql
-- Per-broker commission breakdown
split_origination_percent NUMERIC(5,2)
split_origination_usd NUMERIC(12,2)
split_site_percent NUMERIC(5,2)
split_site_usd NUMERIC(12,2)  
split_deal_percent NUMERIC(5,2)
split_deal_usd NUMERIC(12,2)
split_broker_total NUMERIC(12,2)      -- Sum of all USD amounts
```

## Known Data Field Questions (Next Session):
1. **Field Sources**: Where do GCI, AGCI, House $, Origination $, Site $, Deal $ get calculated from?
2. **Calculation Logic**: How are the USD amounts derived from percentages?
3. **Field Dependencies**: Which fields trigger recalculation of others?
4. **Salesforce Mapping**: Which Salesforce fields map to each deal table field?
5. **Trigger Integration**: Should commission field updates trigger payment regeneration?

## UI Design Patterns Established

### Tabbed Interface Architecture ✅
- **Clean tab navigation** with active state styling
- **Conditional content rendering** based on active tab
- **Consistent spacing and typography**
- **Mobile responsive design**

### Commission Form Layout ✅
- **Grid-based responsive layout** (1-5 columns depending on row)
- **Edit mode toggle** with save/cancel functionality
- **Read-only calculated fields** clearly distinguished from editable inputs
- **Number inputs** with proper step values (0.01 for percentages)
- **Currency formatting** for all dollar amounts
- **Percentage formatting** for all percentage fields

### Data Display Patterns ✅
- **Summary cards** for key metrics
- **Editable forms** with proper validation
- **Read-only tables** for reference data
- **Status indicators** (payment generation status)
- **Error handling** with user-friendly messages

## Next Priorities

### Immediate (Next Session):
1. **Map commission field sources** - Document where each field comes from and how it's calculated
2. **Field calculation logic** - Understand the relationship between percentages and USD amounts
3. **Payments Tab** - Create individual payment management interface
4. **Field validation** - Add proper validation rules for commission percentages

### Phase 2:
1. **Payment management UI** - Record payments, mark as received, QB sync
2. **Commission calculation triggers** - Auto-update USD amounts when percentages change
3. **Payment regeneration** - Handle commission changes after payments are generated
4. **Advanced overrides** - Payment-level commission adjustments

### Phase 3:
1. **Reporting** - Commission statements and payment tracking
2. **QB Integration** - Sync payments with QuickBooks Online
3. **Workflow automation** - Payment reminders and notifications
4. **Audit trail** - Track all commission and payment changes

## Current File Structure

```
src/
├── components/
│   ├── CommissionTab.tsx ✅ (NEW - COMPLETE)
│   ├── DealDetailsForm.tsx ✅
│   ├── PropertySelector.tsx ✅
│   ├── PropertyUnitSelector.tsx ✅
│   ├── SiteSubmitSelector.tsx ✅
│   ├── KanbanBoard.tsx ✅
│   ├── FloatingPanelManager.tsx ✅
│   ├── FloatingPanelContainer.tsx ✅
│   ├── FloatingContactPanel.tsx ✅
│   ├── EditDealPanel.tsx ✅
│   ├── FormattedInput.tsx
│   └── Navbar.tsx
├── hooks/
│   ├── useDeals.ts ✅
│   ├── useKanbanData.ts ✅
│   ├── useDealContacts.ts ✅
│   └── useEditDealPanel.ts ✅
├── lib/
│   ├── supabaseClient.ts ✅
│   └── types.ts
├── pages/
│   ├── DealDetailsPage.tsx ✅ (UPDATED with tabs)
│   └── (other pages)
├── utils/
│   ├── format.ts ✅
│   └── stageProbability.ts ✅
└── App.tsx ✅
```

## Key Business Rules Implemented

1. **Deal-level commission structure** - Editable percentages with calculated USD amounts
2. **Broker-level commission splits** - Read-only view of individual broker allocations  
3. **Payment generation** - Creates payments based on commission splits and number_of_payments
4. **Edit mode safety** - Proper save/cancel with validation
5. **Legacy field handling** - sf_multiple_payments hidden, number_of_payments editable
6. **Commission rate display** - Shows user-input commission_percent, not calculated rate

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

**Status**: Commission Tab is complete and production-ready. Next session will focus on understanding field calculation logic and building the Payments Tab.

## Testing Status
- ✅ **Payment system backend** - All triggers and functions tested and working
- ✅ **Commission UI** - Basic functionality tested, saves to database
- 🔄 **Field calculations** - Need to understand and test USD amount calculations
- ⏳ **Payment Tab** - Not yet built
- ⏳ **End-to-end workflows** - Commission changes → Payment regeneration

## Critical Notes for Next Session
1. **Commission field sources** - Need to map where GCI, AGCI, etc. come from
2. **Calculation triggers** - Should percentage changes auto-update USD amounts?
3. **Field dependencies** - Which fields are derived vs. user-input?
4. **Payment regeneration** - How to handle commission changes after payments exist?