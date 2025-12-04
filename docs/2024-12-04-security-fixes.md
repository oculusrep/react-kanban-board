# Security Fixes - December 4, 2024

## Overview

Addressed 69 Supabase security alerts related to Row Level Security (RLS) being disabled on public tables.

## Changes Made

### 1. Archived Unused Salesforce Tables

Moved 46 unused Salesforce sync tables from `public` schema to a new `salesforce_archive` schema. These tables were imported via Airbyte during the Salesforce migration but are no longer actively used by the application.

**Tables moved to `salesforce_archive`:**
- salesforce_Account
- salesforce_AccountContactRelation
- salesforce_ActivityFieldHistory
- salesforce_Assignment__c
- salesforce_Commission_Split__Share
- salesforce_Contact
- salesforce_ContentDocument
- salesforce_ContentDocumentLink
- salesforce_ContentDocumentLink_airbyte_tmp
- salesforce_ContentNote
- salesforce_ContentVersion
- salesforce_Critical_Date__Share
- salesforce_Critical_Date__c
- salesforce_J_Property_2_Account__c
- salesforce_J_Property_2_Contacts__c
- salesforce_J_Property_2_Opportunity__History
- salesforce_J_Property_2_Opportunity__c
- salesforce_Lead
- salesforce_LeadFeed
- salesforce_LeadStatus
- salesforce_Note
- salesforce_OpportunityContactRole
- salesforce_OpportunityFeed
- salesforce_Opportunity_Broker_Total__mdt
- salesforce_Payment_Broker_Total__mdt
- salesforce_Payment_Split__History
- salesforce_Payment_Split__Share
- salesforce_Payment_Split__c
- salesforce_Property_Contacts__History
- salesforce_Property_Contacts__c
- salesforce_Property_Unit_Opportunities__c
- salesforce_Property_Unit__History
- salesforce_Property_Unit__c
- salesforce_Property__History
- salesforce_Restaurant_Trends__History
- salesforce_Restaurant_Trends__c
- salesforce_Site_Submit_Opportunities__c
- salesforce_Site_Submits__History
- salesforce_Site_Submits__c
- salesforce_Task
- salesforce_TaskFeed
- salesforce_TaskPriority
- salesforce_TaskRelation
- salesforce_TaskStatus
- salesforce_TaskWhoRelation
- salesforce_User

**To restore a table if needed:**
```sql
ALTER TABLE salesforce_archive."tablename" SET SCHEMA public;
```

### 2. Secured Remaining Salesforce Tables

Kept 5 Salesforce tables in `public` schema (used by reconciliation reports) and added RLS policies:

| Table | Purpose |
|-------|---------|
| salesforce_Opportunity | Deal reconciliation reports |
| salesforce_Payment__c | Payment reconciliation reports |
| salesforce_Property__c | Property data quality reports |
| salesforce_Commission_Split__c | Commission comparison |
| salesforce_RecordType | Reference data for joins |

**Policy added:** Read-only access for operations users (`can_manage_operations()`)

### 3. Fixed App Tables Missing RLS

Enabled RLS and added appropriate policies for 12 application tables:

| Table | Policy |
|-------|--------|
| user | Enabled RLS (policies already existed) |
| role | Read: all authenticated, Modify: admin only |
| broker | Read: operations, Modify: admin only |
| deal_team | Read: operations, Modify: operations |
| critical_date | Read: operations, Modify: operations |
| contact_contact_type | Read: all, Modify: admin only |
| contact_lead_list | Read: operations, Modify: operations |
| site_submit_deal_type | Read: all, Modify: admin only |
| dropbox_sync_cache | Full access: operations |
| note_backup | Full access: admin only |
| restaurant_trend | Read: operations |
| restaurant_location | Read: operations |
| property_special_layer | Read: operations, Modify: operations |

### 4. Fixed Security Definer Views

Recreated 7 views with `SECURITY INVOKER` to ensure RLS policies on underlying tables are respected:

| View | Tables Joined |
|------|---------------|
| deal_with_stage | deal + deal_stage |
| property_with_stage | property + property_stage |
| property_with_type | property + property_type |
| property_with_deal_type | property + deal_type |
| v_contact_client_roles | contact_client_role + contact + client + contact_client_role_type |
| v_contact_deal_roles | contact_deal_role + contact + deal + contact_deal_role_type |
| v_site_selectors_by_client | contact_client_role + contact + client + contact_client_role_type |

These views were previously using the default `SECURITY DEFINER` mode (which bypasses RLS), but this was unintentional. They are now set to `SECURITY INVOKER` so that RLS policies are enforced based on the querying user.

### 5. Fixed Function Search Path Warnings

Added `SET search_path = public` to all 50 database functions to prevent potential search_path hijacking attacks. This ensures functions always reference the intended schema.

Functions fixed include:
- RLS helper functions: `is_admin`, `is_broker`, `is_assistant`, `can_manage_operations`, `has_full_access`, `get_user_role`
- Trigger functions: `update_updated_at_column`, `set_audit_fields`, `set_creator_fields`, etc.
- Business logic functions: `calculate_commission_split`, `generate_payments_for_deal`, `create_payment_splits_for_payment`, etc.

### 6. Fixed Materialized View API Access

Revoked anonymous access to `restaurant_latest_trends` materialized view. Authenticated users can still access it.

## Remaining Manual Steps

The following require manual action in the Supabase Dashboard:

1. **Enable Leaked Password Protection**
   - Go to Authentication → Providers → Email → Password Settings
   - Enable "Leaked Password Protection"

2. **Upgrade Postgres Version**
   - Go to Project Settings → Infrastructure
   - Apply available security patches

## Results

- **Before:** 69 errors + 55 warnings
- **After:** 0 errors, 2 warnings (require dashboard action)
- All tables have RLS enabled
- All views use SECURITY INVOKER
- All functions have search_path set
