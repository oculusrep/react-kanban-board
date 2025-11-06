# Timeline Sync Feature - Test Script

**Date**: November 6, 2025
**Feature**: Two-way sync between Deal Timeline fields and Critical Dates table

---

## Pre-Test Verification

### ✅ Step 1: Verify Migration Completed

Run this in **Supabase SQL Editor**:

```sql
-- Check if columns exist
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'critical_date'
  AND column_name IN ('is_timeline_linked', 'deal_field_name');

-- Count timeline critical dates
SELECT
  COUNT(*) as total_timeline_dates,
  COUNT(DISTINCT deal_id) as deals_with_timeline_dates
FROM critical_date
WHERE is_timeline_linked = TRUE;

-- Show sample timeline dates
SELECT deal_id, subject, deal_field_name, critical_date, is_timeline_linked
FROM critical_date
WHERE is_timeline_linked = TRUE
LIMIT 10;
```

**Expected Results:**
- ✅ Both columns exist
- ✅ `total_timeline_dates` = 5 × number of deals
- ✅ Each deal has exactly 5 timeline dates

---

## Test Suite

### 🧪 Test 1: Timeline Dates Appear in Critical Dates Tab

**Steps:**
1. Open any deal
2. Click **Critical Dates** tab
3. Look at the table

**Expected Results:**
- ✅ You see 5 dates at the TOP of the table:
  - Target Close Date
  - LOI X Date
  - Effective Date (Contract X)
  - Booked Date
  - Closed Date
- ✅ Each has a blue **"Timeline"** badge
- ✅ They appear in this order (fixed sorting)
- ✅ Any custom critical dates appear AFTER these 5

**Screenshot Location**: Top of Critical Dates table

---

### 🧪 Test 2: Timeline Dates Match Details Tab

**Steps:**
1. Go to **Details** tab
2. Scroll to **Timeline** section
3. Note the values for:
   - Target Close Date
   - LOI Signed Date
   - Contract X Date
   - Booked Date
   - Closed Date
4. Go to **Critical Dates** tab
5. Compare the values

**Expected Results:**
- ✅ All 5 dates match exactly between tabs
- ✅ If a field is empty on Details tab, it's "TBD" on Critical Dates tab

---

### 🧪 Test 3: Timeline Dates Cannot Be Deleted

**Steps:**
1. Go to **Critical Dates** tab
2. Click the **three-dot menu** on "Target Close Date"
3. Look at the menu options

**Expected Results:**
- ✅ Menu shows **"View Details"** option
- ✅ Menu does NOT show "Delete" option
- ✅ Repeat for all 5 timeline dates - none should have delete option

**Now test custom dates:**
4. Click three-dot menu on a non-timeline date (e.g., "Delivery Date")
5. **Expected**: Menu DOES show "Delete" option

---

### 🧪 Test 4: Timeline Date Subject Is Locked

**Steps:**
1. Go to **Critical Dates** tab
2. Click the **three-dot menu** on "LOI X Date"
3. Click **"View Details"**
4. Sidebar opens

**Expected Results:**
- ✅ Subject field shows "LOI X Date"
- ✅ Subject field is **gray/read-only** (not a dropdown)
- ✅ Blue **"Timeline-Linked"** badge appears next to "Subject" label
- ✅ At bottom: Message says "Timeline dates cannot be deleted, only cleared"
- ✅ No "Delete" button visible

**Now test custom dates:**
5. Open a custom critical date
6. **Expected**: Subject field IS a dropdown and CAN be changed

---

### 🧪 Test 5: Two-Way Sync - Critical Dates → Details Tab

**Steps:**
1. Go to **Critical Dates** tab
2. Click **"Target Close Date"** to open sidebar
3. Change the date to **March 15, 2026**
4. Wait 2 seconds (autosave)
5. ✅ Green checkmark appears (autosave indicator)
6. Close sidebar
7. Go to **Details** tab
8. Scroll to **Timeline** section
9. Look at **Target Close Date** field

**Expected Results:**
- ✅ Details Tab shows **March 15, 2026**
- ✅ Date synced automatically
- ✅ No page refresh needed

**Console Check:**
- Open browser DevTools → Console
- You should see:
  ```
  Syncing timeline-linked date to deal field: target_close_date
  Deal Timeline field updated successfully
  ```

---

### 🧪 Test 6: Two-Way Sync - Details Tab → Critical Dates

**Steps:**
1. Go to **Details** tab
2. Scroll to **Timeline** section
3. Click on **LOI Signed Date** field
4. Change the date to **January 10, 2026**
5. Click outside the field (blur/save)
6. Wait 1 second
7. Go to **Critical Dates** tab
8. Look at **"LOI X Date"** row

**Expected Results:**
- ✅ Critical Dates tab shows **January 10, 2026** for "LOI X Date"
- ✅ Date synced automatically
- ✅ No page refresh needed

---

### 🧪 Test 7: Clearing a Timeline Date

**Steps:**
1. Go to **Critical Dates** tab
2. Click **"Booked Date"** to open sidebar
3. Click the date field
4. Clear the date (delete it)
5. Leave the field empty
6. Wait 2 seconds (autosave)
7. Close sidebar
8. Go to **Details** tab → **Timeline** section
9. Look at **Booked Date** field

**Expected Results:**
- ✅ Details Tab **Booked Date** is now empty
- ✅ Critical Dates tab shows "TBD" for Booked Date
- ✅ Record still exists (not deleted, just date cleared)

---

### 🧪 Test 8: Multiple Timeline Dates Update

**Steps:**
1. Go to **Details** tab → **Timeline** section
2. Change multiple dates:
   - **Target Close Date**: April 1, 2026
   - **Contract X Date**: March 1, 2026
   - **Closed Date**: May 1, 2026
3. Save the deal (or wait for autosave if enabled)
4. Go to **Critical Dates** tab

**Expected Results:**
- ✅ All 3 dates updated correctly in Critical Dates table
- ✅ Other timeline dates unchanged
- ✅ Custom critical dates unaffected

---

### 🧪 Test 9: Timeline Dates Sorting

**Steps:**
1. Go to **Critical Dates** tab
2. Add a custom critical date with a very early date (e.g., January 1, 2020)
3. Click any column header to sort
4. Observe the order

**Expected Results:**
- ✅ Timeline dates ALWAYS appear first, regardless of sorting
- ✅ Timeline dates are in fixed order:
  1. Target Close Date
  2. LOI X Date
  3. Effective Date (Contract X)
  4. Booked Date
  5. Closed Date
- ✅ Custom critical dates appear after timeline dates
- ✅ Custom dates ARE affected by column sorting

---

### 🧪 Test 10: New Deal Gets Timeline Dates

**Steps:**
1. Create a new deal (or convert an assignment to a deal)
2. Immediately go to **Critical Dates** tab

**Expected Results:**
- ✅ 5 timeline dates are auto-created instantly
- ✅ All show "TBD" (no dates set yet)
- ✅ All have blue "Timeline" badge
- ✅ Cannot be deleted

---

### 🧪 Test 11: Email Reminders Work with Timeline Dates

**Steps:**
1. Go to **Critical Dates** tab
2. Click **"Closed Date"** to open sidebar
3. Set a date: **June 1, 2026**
4. Check **"Send email reminder"** checkbox
5. Set **"Days Prior"**: 7
6. Click **"Preview Email"** button

**Expected Results:**
- ✅ Email preview modal opens
- ✅ Shows correct subject: "Critical Date Reminder: Closed Date - [Deal Name]"
- ✅ Shows correct recipients
- ✅ Email content shows the date and days prior correctly

---

### 🧪 Test 12: Inline Editing in Table

**Steps:**
1. Go to **Critical Dates** tab
2. Click directly on the **date cell** for "Target Close Date" (not the three-dot menu)
3. Date picker should appear

**Expected Results:**
- ✅ Can edit date inline in table
- ✅ Changes save automatically
- ✅ Details tab updates after inline edit
- ✅ Subject field is NOT editable inline (locked)

---

### 🧪 Test 13: Description and Other Fields

**Steps:**
1. Open "Effective Date (Contract X)" in sidebar
2. Add a description: "Contract signed with landlord"
3. Check "Send email reminder"
4. Set "Days Prior": 5
5. Close sidebar
6. Reopen the same critical date

**Expected Results:**
- ✅ Description is saved
- ✅ Email settings are saved
- ✅ Subject is still locked (can't change it)
- ✅ Date can be changed and syncs to Details tab

---

## Edge Cases & Error Handling

### 🧪 Test 14: Concurrent Edits

**Steps:**
1. Open deal in two browser tabs
2. In **Tab 1**: Go to Details tab, change Target Close Date to March 1
3. In **Tab 2**: Go to Critical Dates tab, look at Target Close Date
4. Wait a few seconds

**Expected Results:**
- ✅ Tab 2 shows the updated date (real-time sync)
- ✅ No data loss
- ✅ No conflicts

---

### 🧪 Test 15: Invalid Date Format

**Steps:**
1. Open "Booked Date" in sidebar
2. Try to enter invalid date (if possible)
3. Or clear and save with empty value

**Expected Results:**
- ✅ Empty/null dates are handled gracefully
- ✅ No errors in console
- ✅ Shows "TBD" in table

---

## Performance Tests

### 🧪 Test 16: Large Deal List

**Steps:**
1. Go to Deals page with many deals
2. Open a deal with Critical Dates tab
3. Observe load time

**Expected Results:**
- ✅ Critical Dates tab loads quickly
- ✅ No performance degradation
- ✅ Timeline dates appear instantly

---

## Regression Tests

### 🧪 Test 17: Custom Critical Dates Still Work

**Steps:**
1. Click **"+ New Critical Date"** button
2. Select "Delivery Date" from dropdown
3. Set a date and description
4. Save

**Expected Results:**
- ✅ Custom date is created
- ✅ Appears AFTER timeline dates
- ✅ CAN be deleted
- ✅ Subject CAN be changed

---

### 🧪 Test 18: Existing Non-Timeline Critical Dates

**Steps:**
1. Find a deal that already had custom critical dates before migration
2. Go to Critical Dates tab

**Expected Results:**
- ✅ Old custom dates still appear
- ✅ They appear after the 5 timeline dates
- ✅ Can still be edited and deleted
- ✅ No data loss

---

## Browser Console Checks

Throughout testing, monitor the **browser console** (F12 → Console tab):

**Should NOT see:**
- ❌ Any error messages
- ❌ "Failed to sync to deal Timeline"
- ❌ "Invalid API key"
- ❌ 500 errors

**Should see (when editing):**
- ✅ "Updating critical date: [id]"
- ✅ "Critical date updated successfully"
- ✅ "Syncing timeline-linked date to deal field: [field_name]"
- ✅ "Deal Timeline field updated successfully"

---

## Rollback Test

### 🧪 Test 19: Verify Rollback Works (If Needed)

Only run this if you need to rollback:

```sql
-- Rollback SQL
ALTER TABLE critical_date
DROP COLUMN IF EXISTS is_timeline_linked,
DROP COLUMN IF EXISTS deal_field_name;

DROP INDEX IF EXISTS idx_critical_date_timeline_linked;
DROP TRIGGER IF EXISTS after_deal_insert_create_timeline_dates ON deal;
DROP TRIGGER IF EXISTS after_deal_update_sync_timeline ON deal;
```

---

## Test Summary Checklist

After completing all tests, check off:

- [ ] ✅ Migration completed successfully
- [ ] ✅ Timeline dates appear in Critical Dates tab
- [ ] ✅ Timeline dates cannot be deleted
- [ ] ✅ Subject field is locked for timeline dates
- [ ] ✅ Two-way sync works (Critical Dates → Details)
- [ ] ✅ Two-way sync works (Details → Critical Dates)
- [ ] ✅ Timeline dates always sort first
- [ ] ✅ New deals get timeline dates automatically
- [ ] ✅ Email reminders work with timeline dates
- [ ] ✅ Custom critical dates still work normally
- [ ] ✅ No console errors during testing
- [ ] ✅ Performance is acceptable

---

## Known Behaviors (Not Bugs)

1. **Timeline dates cannot be deleted** - This is intentional. Users can only clear the date value.
2. **Subject is locked** - Timeline dates have fixed subjects that match the deal fields.
3. **Always appear first** - Timeline dates ignore user sorting and always stay at top.
4. **"TBD" for empty dates** - Empty timeline dates show "TBD" instead of blank.

---

## Reporting Issues

If you find any issues during testing:

1. **Note the test number** (e.g., "Test 5 failed")
2. **Describe what happened** vs what was expected
3. **Check browser console** for errors
4. **Take a screenshot** if visual issue
5. **Note the deal ID** if specific to one deal

---

**Testing Time Estimate**: 30-45 minutes for full test suite

**Quick Smoke Test** (5 minutes):
- Tests 1, 3, 5, 6, 10 cover the core functionality
