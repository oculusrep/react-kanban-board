# Bug Fix: Critical Date 409 Error for Non-Admin Users

**Date:** December 1, 2025
**Severity:** HIGH
**Affects:** Non-admin users (e.g., Arty Santos) where `user.id` ≠ `user.auth_user_id`
**Symptom:** 409 Conflict error when clicking "Create" button for custom critical dates

## Problem Summary

User Arty Santos reported that clicking the "+ New Critical Date" button and then "Create" did nothing. Console showed multiple 409 Conflict errors:

```
POST /rest/v1/critical_date?columns=... status 409 (Conflict)
Uncaught (in promise) Object
```

Admin user (Mike) could create critical dates without issue.

## Root Cause

The `CriticalDateSidebar.tsx` component was explicitly setting `created_by_id` and `updated_by_id` using `userTableId` from `AuthContext`:

```typescript
// OLD CODE - BROKEN
const { userTableId } = useAuth();  // Returns user.id

payload.created_by_id = userTableId || null;  // Passes user.id
payload.updated_by_id = userTableId || null;  // Passes user.id
```

However, the `critical_date` table has foreign key constraints that reference `user(auth_user_id)`:

```sql
FOREIGN KEY (created_by_id) REFERENCES "user"(auth_user_id)
FOREIGN KEY (updated_by_id) REFERENCES "user"(auth_user_id)
```

### Why It Worked for Admin (Mike)

For Mike's account, `user.id` happens to equal `user.auth_user_id`:
```
user.id          = fe6e516f-11e1-4a3b-b914-910d59d9e8df
user.auth_user_id = fe6e516f-11e1-4a3b-b914-910d59d9e8df  ← Same!
```

### Why It Failed for Arty Santos

For Arty's account, these values are different:
```
user.id          = c0e5fde5-9412-4a62-8711-9a6bf74d6e99
user.auth_user_id = 5d126739-bd85-4e90-8f43-9458b162c3cc  ← Different!
```

When the code passed `user.id` as `created_by_id`, the FK constraint failed because that UUID doesn't exist in the `user.auth_user_id` column.

## The Solution

**Removed explicit `created_by_id` and `updated_by_id` assignments from the code.**

The database already has:
1. **Column defaults:** `DEFAULT auth.uid()` for both fields
2. **Triggers:** `set_creator_fields()` on INSERT and `update_audit_fields()` on UPDATE

These automatically set the correct `auth.uid()` value, which matches the FK constraints.

### Code Changes

**File:** `src/components/CriticalDateSidebar.tsx`

```typescript
// NEW CODE - FIXED
// Note: We intentionally don't use userTableId here.
// The created_by_id and updated_by_id fields use database defaults (auth.uid())
// because the FK constraint references user(auth_user_id), not user(id).

const payload: any = {
  deal_id: dealId,
  subject: finalSubject,
  critical_date: data.criticalDateValue || null,
  description: data.description.trim() || null,
  send_email: data.sendEmail,
  send_email_days_prior: data.sendEmail && data.sendEmailDaysPrior ? parseInt(data.sendEmailDaysPrior) : null,
  updated_at: new Date().toISOString()
  // created_by_id and updated_by_id NOT set - handled by database
};
```

### Database Triggers That Handle Audit Fields

```sql
-- On INSERT: set_creator_fields()
IF auth.uid() IS NOT NULL AND NEW.created_by_id IS NULL THEN
  NEW.created_by_id = auth.uid();
END IF;

-- On UPDATE: update_audit_fields()
NEW.updated_at = NOW();
IF auth.uid() IS NOT NULL THEN
  NEW.updated_by_id = auth.uid();
END IF;
```

## Verification

After the fix:
- ✅ Arty Santos can create custom critical dates
- ✅ `created_by_id` correctly stores `auth.uid()` (which equals `user.auth_user_id`)
- ✅ `updated_by_id` correctly updates on each save
- ✅ FK constraints are satisfied

## Related Documentation

- [BUGFIX_2025_11_10_FOREIGN_KEY_MISMATCH.md](./BUGFIX_2025_11_10_FOREIGN_KEY_MISMATCH.md) - Original discovery of this pattern
- [SESSION_2025_11_03_CRITICAL_DATES_FEATURE.md](./SESSION_2025_11_03_CRITICAL_DATES_FEATURE.md) - Critical dates feature overview

## Lessons Learned

1. **Never pass `userTableId` (user.id) to `created_by_id`/`updated_by_id` fields** - These FK constraints reference `user.auth_user_id`

2. **Let database triggers handle audit fields** - The `set_creator_fields()` and `update_audit_fields()` triggers correctly use `auth.uid()`

3. **Test with non-admin users** - Admin accounts may have matching `id` and `auth_user_id` values, hiding FK issues

4. **409 errors can indicate FK violations** - Not just duplicate records

## Commit

```
fix: remove explicit created_by_id/updated_by_id from CriticalDateSidebar

The code was passing userTableId (user.id) for these fields, but the FK
constraints reference user(auth_user_id). This caused 409 errors for users
like Arty Santos where user.id != user.auth_user_id.

Database triggers (set_creator_fields, update_audit_fields) automatically
set these fields using auth.uid(), which correctly matches the FK constraints.
```
