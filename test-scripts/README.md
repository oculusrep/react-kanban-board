# Test Scripts

This folder contains automated and manual testing resources for the OVIS application.

## Available Tests

### 1. Payment Lifecycle Testing Script
**File**: `test-payment-lifecycle.js`

Automated test script for payment lifecycle management features (archive/restore payments based on deal stage).

#### Prerequisites
```bash
npm install dotenv @supabase/supabase-js
```

#### Usage
```bash
node test-scripts/test-payment-lifecycle.js
```

#### What it tests
- ✅ Database schema has soft delete columns (`is_active`, `deleted_at`)
- ✅ Unpaid payments are archived when deal moves to "Lost"
- ✅ Paid payments are preserved when deal moves to "Lost"
- ✅ Payments are regenerated when deal moves from "Lost" to active stage

#### Example Output
```
╔════════════════════════════════════════════════════════════╗
║          Payment Lifecycle Testing Script                 ║
╚════════════════════════════════════════════════════════════╝

=== Step 1: Finding a deal with payments for testing... ===

✅ Found test deal: "BM - Brookhaven | OVIS" with 2 active payment(s)
ℹ️  Current stage: Booked

=== Step 2: Test: Archive unpaid payments when moving to "Lost" ===

ℹ️  Initial payment status:
   Total Payments:  2
   Paid:            1
   Unpaid:          1

✅ Archived 1 unpaid payment(s)
✅ ✓ Unpaid payments archived correctly
✅ ✓ Paid payments preserved (1 remaining)

=== Step 3: Test: Regenerate payments when moving from "Lost" to active ===

✅ Payments regenerated successfully
✅ ✓ 2 payment(s) regenerated (expected: 2)

=== Test Summary ===

Test 1 - Archive Unpaid Payments:     PASSED ✓
Test 2 - Regenerate Payments:         PASSED ✓

✅ All tests passed! 🎉
```

---

### 2. Manual Testing Checklist
**File**: `MANUAL_TESTING_CHECKLIST.md`

Comprehensive manual testing guide with step-by-step instructions for UI testing.

#### How to use
1. Open `MANUAL_TESTING_CHECKLIST.md`
2. Follow each test case sequentially
3. Check off ✅ boxes as you complete each verification step
4. Note any failures or unexpected behavior

#### Test Cases Included
1. Archive unpaid payments when moving to "Lost"
2. No confirmation when no unpaid payments exist
3. Regenerate payments when moving from "Lost" to active
4. No broker splits display
5. Payment amount display (2 decimal places)
6. Edge cases (no payments, already lost, cancel modal)
7. Console log verification
8. Regression testing

---

## Environment Setup

The automated test script requires environment variables. Ensure your `.env` file contains:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

---

## Running All Tests

### Automated Test
```bash
# Run the payment lifecycle test
node test-scripts/test-payment-lifecycle.js
```

### Manual Tests
Follow the checklist in `MANUAL_TESTING_CHECKLIST.md`

---

## Test Data Setup

For best results, create test data with:
1. A deal with 2+ payments
2. At least one payment marked as "Received" (paid)
3. At least one payment NOT marked as received (unpaid)
4. Deal in an active stage (not "Lost")

You can create this through the UI:
1. Create or edit a deal
2. Set commission fee and number of payments
3. Go to Payments tab → Generate Payments
4. Mark one payment as "Received"
5. Leave other payment(s) as "Pending"

---

## Troubleshooting

### "Missing Supabase credentials in .env file"
**Solution**: Create or update `.env` file with Supabase credentials

### "No deals with payments found"
**Solution**: Create a deal with payments through the UI first

### "Column 'is_active' does not exist"
**Solution**: Run database migration:
```bash
npx supabase db push
```

### Test script errors with ES modules
**Solution**: Ensure `package.json` has `"type": "module"` or rename script to `.mjs`

---

## CI/CD Integration (Future)

These tests can be integrated into a CI/CD pipeline:

```yaml
# Example GitHub Actions workflow
- name: Run Payment Lifecycle Tests
  run: node test-scripts/test-payment-lifecycle.js
  env:
    VITE_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
    VITE_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
```

---

## Adding New Tests

To add new test scripts:

1. Create a new `.js` file in this folder
2. Follow the naming convention: `test-[feature-name].js`
3. Include clear console output with colors
4. Document usage in this README
5. Add corresponding manual test cases if needed

---

## Support

If you encounter issues with these tests:
1. Check the browser console for errors
2. Verify database schema is up to date
3. Ensure test data is set up correctly
4. Review the manual checklist for additional context
