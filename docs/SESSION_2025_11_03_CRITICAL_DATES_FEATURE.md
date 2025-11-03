# Critical Dates Feature - Session Summary
**Date**: November 3, 2025
**Branch**: `critical-dates`
**Status**: Database schema complete, UI implementation pending

---

## Overview

Implementing a Critical Dates feature for the Deal entity that allows users to track important milestones and deadlines with automated email reminders.

## Feature Requirements

### Core Functionality
- **Critical dates tab** on Deal Details page
- **Auto-populate default dates** based on deal type (Purchase vs Lease)
- **Email notifications** sent X days prior to critical dates
- **Flexible date management** - users can add custom dates beyond defaults
- **Email recipients**: Contacts with "Critical Dates Reminders" role + deal owner + admin

### Deal Types and Default Dates

**Purchase Deal Default Dates:**
- Contract X Date (Lease/PSA Effective Date)
- Delivery Date
- Contingency Date Expiration
- Booked Date
- Closed Date
- Estimated Open Date
- LOI Signed Date

**Lease Deal Default Dates:**
- Contract X Date (Lease/PSA Effective Date)
- Delivery Date
- Contingency Removal Date
- Lease Signed Date (Same as Contract X Date)
- LOI Signed Date
- Rent Commencement Date
- Estimated Open Date
- Closed Date

### User Workflow
1. User creates/edits a deal and selects **Deal Type** (Purchase or Lease)
2. System auto-creates default critical dates (empty/TBD) based on deal type
3. User can fill in dates, add descriptions, configure email reminders
4. User can add custom critical dates via "+ New Critical Date" button
5. User can delete critical dates via trash icon
6. Daily scheduled job sends reminder emails based on configuration
7. System auto-populates `sent_at` timestamp when email is sent

### Email System
- **Send Email checkbox**: User must check to enable reminder
- **Send Email Days Prior**: Required field when Send Email is checked
- **Sent At**: Auto-populated timestamp when email is sent
- **Recipients**:
  - Contacts with "Critical Dates Reminders" role on the client
  - Deal owner (always CC'd)
  - Admin (always CC'd)

---

## Completed Work

### ✅ Database Schema Migration

**File**: `supabase/migrations/20251103130930_create_critical_dates_table.sql`

Created `critical_date` table with the following structure:

```sql
CREATE TABLE critical_date (
  id UUID PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES deal(id) ON DELETE CASCADE,

  -- Critical Date Information
  subject TEXT NOT NULL,
  critical_date DATE,
  description TEXT,

  -- Email Notification Settings
  send_email BOOLEAN DEFAULT FALSE,
  send_email_days_prior INTEGER,
  sent_at TIMESTAMPTZ,

  -- Metadata
  is_default BOOLEAN DEFAULT FALSE,

  -- Salesforce Integration
  sf_id TEXT UNIQUE,
  sf_opportunity_id TEXT,

  -- Audit Fields
  created_by_id UUID,
  updated_by_id UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

**Key Features:**
- Constraint ensures `send_email_days_prior` is set when `send_email = TRUE`
- Indexes optimized for email job queries
- `updated_at` trigger for automatic timestamp updates
- Cascading delete when deal is deleted

### ✅ Data Migration from Salesforce

Migrated existing critical dates from `salesforce_Critical_Date__c` table:
- Field mapping: `Subject__c`, `Critical_Date__c`, `Description__c`, etc.
- Handled data inconsistencies (send_email=TRUE but days_prior=NULL)
- Proper quoting for case-sensitive PostgreSQL identifiers
- Migration summary report with counts

### ✅ Added "Critical Dates Reminders" Role

Inserted new role into `contact_client_role_type` table:
- `role_name`: "Critical Dates Reminders"
- `sort_order`: Auto-calculated (max + 10)
- `is_active`: TRUE

### ✅ Updated TypeScript Schema

Regenerated `database-schema.ts` with new `critical_date` table types:
- Proper TypeScript interfaces for Row, Insert, Update operations
- Nullable fields correctly typed
- Foreign key relationships defined

### ✅ Updated Development Standards

**File**: `docs/DEVELOPMENT_STANDARDS.md`

Added **CRITICAL RULE #6: Database Query Standards** documenting:
- PostgreSQL case sensitivity for Salesforce tables/columns
- When to quote identifiers vs when not to
- Examples of correct vs incorrect query syntax
- Common pitfalls and red flags

---

## Pending Work

### 🔲 UI Components

#### 1. Add Deal Type Selector to Deal Details Form
- **Location**: Deal Details form (DealDetailsForm component)
- **Field**: `deal_type_id` dropdown
- **Data Source**: `deal_type` table
- **Requirement**: Must be visible and required when creating/editing deals
- **Note**: Currently not visible in UI even though field exists in database

#### 2. Create Critical Dates Tab Component
- **Location**: Deal Details page tabs
- **Component Name**: `CriticalDatesTab.tsx`
- **Layout**: Table view with columns:
  - Subject
  - Critical Date
  - Description
  - Send Email Days Prior
  - Send Email (checkbox)
  - Actions (trash icon)
- **Features**:
  - Inline editing (click-to-edit fields)
  - Sort by date
  - "+ New Critical Date" button
  - Empty state when no dates exist

#### 3. Implement Auto-Creation of Default Critical Dates
- **Trigger**: When deal is created with a `deal_type_id` selected
- **Logic**:
  - Check deal type (Purchase or Lease)
  - Insert default critical date records with `is_default = TRUE`
  - All dates initially NULL (TBD)
  - `send_email = FALSE` by default
- **Location**: Could be database trigger OR application logic (decide based on architecture)

#### 4. Build Critical Dates Table UI
- **Use**: Existing inline editable field patterns from the codebase
- **Reference**: PropertyDetailsSlideoutContent, DealDetailsForm
- **Fields**:
  - Subject: Text input or dropdown
  - Critical Date: Date picker
  - Description: Text area
  - Send Email Days Prior: Number input (only enabled if Send Email checked)
  - Send Email: Checkbox
- **Actions**:
  - Inline save (autosave pattern)
  - Delete with confirmation

#### 5. Implement New Critical Date Modal/Form
- **Component Name**: `NewCriticalDateModal.tsx`
- **Trigger**: "+ New Critical Date" button
- **Fields** (from Salesforce screenshot):
  - Subject dropdown (with "Create Custom" option)
  - Critical Date picker
  - Description text area
  - Send Email checkbox
  - Send Email Days Prior number input
  - Opportunity (read-only, pre-filled)
- **Actions**:
  - Cancel button
  - Save button

#### 6. Handle Deal Type Changes
- **Scenario**: User changes deal type on existing deal
- **Prompt**: "Changing the deal type will delete existing default critical dates and create new ones. Custom dates will be preserved. Continue?"
- **Options**:
  - "Keep existing dates" - Don't change anything
  - "Replace default dates" - Delete `is_default = TRUE` dates, create new ones
  - "Cancel" - Revert deal type change

### 🔲 Backend Logic

#### 7. Create Scheduled Email Job
- **Frequency**: Daily (e.g., 8:00 AM)
- **Query**:
  ```sql
  SELECT cd.*, d.deal_name, d.owner_id
  FROM critical_date cd
  JOIN deal d ON d.id = cd.deal_id
  WHERE cd.send_email = TRUE
    AND cd.sent_at IS NULL
    AND cd.critical_date IS NOT NULL
    AND cd.critical_date - cd.send_email_days_prior = CURRENT_DATE
  ```
- **Process**:
  1. Find all critical dates that need emails sent today
  2. For each critical date:
     - Get deal owner email
     - Get client contacts with "Critical Dates Reminders" role
     - Get admin emails
     - Send email with deal info, critical date subject/description
     - Update `sent_at` timestamp
- **Email Template**: To be designed
- **Implementation**: Supabase Edge Function or similar scheduled job

---

## Technical Notes

### PostgreSQL Case Sensitivity
**IMPORTANT**: Salesforce table and column names are case-sensitive in PostgreSQL.

Always use quoted identifiers:
```sql
-- ✅ CORRECT
SELECT "Subject__c", "Opportunity__c"
FROM "salesforce_Critical_Date__c"

-- ❌ WRONG (will fail)
SELECT Subject__c, Opportunity__c
FROM salesforce_Critical_Date__c
```

### Data Constraint
The `check_send_email_days_prior` constraint ensures:
- If `send_email = FALSE`, `send_email_days_prior` can be NULL
- If `send_email = TRUE`, `send_email_days_prior` must be NOT NULL and >= 0

This prevents invalid data like "send email but didn't specify when."

### Migration Handling
During Salesforce data migration, we encountered records with `send_email = TRUE` but `send_email_days_prior = NULL`. These were handled by setting `send_email = FALSE` to comply with the constraint.

---

## File Changes

### New Files
- `supabase/migrations/20251103130930_create_critical_dates_table.sql`
- `docs/SESSION_2025_11_03_CRITICAL_DATES_FEATURE.md` (this file)

### Modified Files
- `database-schema.ts` - Added critical_date table types
- `docs/DEVELOPMENT_STANDARDS.md` - Added Rule #6 for database queries

---

## Next Steps

1. **Add Deal Type field to UI** - Make `deal_type_id` visible and functional
2. **Create Critical Dates tab** - New tab on Deal Details page
3. **Implement auto-creation logic** - Default dates based on deal type
4. **Build table UI** - Inline editing with FormattedField components
5. **Create New Critical Date modal** - For adding custom dates
6. **Implement email job** - Scheduled task for sending reminders
7. **Handle deal type changes** - Prompt user about replacing defaults

---

## Questions/Decisions Needed

- [ ] Should default critical date creation be a database trigger or application logic?
- [ ] Email template design and content
- [ ] Should we validate that critical dates aren't in the past?
- [ ] Should we prevent sending duplicate emails if `sent_at` is already set?
- [ ] What happens to critical dates when a deal is deleted? (Currently: CASCADE DELETE)

---

## Salesforce Field Mapping

| Our Field | Salesforce Field |
|-----------|------------------|
| `subject` | `Subject__c` |
| `critical_date` | `Critical_Date__c` |
| `description` | `Description__c` |
| `send_email` | `Send_Email__c` |
| `send_email_days_prior` | `Send_Email_Days_Prior__c` |
| `sent_at` | `Send_Email_Date__c` |
| `deal_id` | `Opportunity__c` (via SF ID lookup) |
| `sf_id` | `Id` |

---

**Session End**: Database schema complete. Ready to proceed with UI implementation.
