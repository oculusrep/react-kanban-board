# 🚀 Quick Test Guide - Payment Lifecycle

## TL;DR - Quick Testing Steps

### 1️⃣ Automated Test (2 minutes)
```bash
node test-scripts/test-payment-lifecycle.js
```
✅ Should show all green checkmarks

---

### 2️⃣ Manual UI Test (5 minutes)

#### Setup: Create Test Deal
1. Open a deal with 2+ payments
2. Mark one payment as "Received" ✅
3. Leave one payment as "Pending" ⏳

#### Test A: Move to Lost
1. Details tab → Change stage to **"Lost"**
2. Enter loss reason → Save
3. **Confirmation dialog** should appear
4. Click "Continue"
5. ✅ Unpaid payments disappear
6. ✅ Paid payments remain

#### Test B: Restore from Lost
1. Details tab → Change stage to **"Booked"**
2. Enter booked date → Save
3. ✅ Payments regenerated automatically
4. ✅ Count matches "Number of Payments"

---

## 🐛 Quick Troubleshooting

| Issue | Fix |
|-------|-----|
| Script errors | `npm install dotenv @supabase/supabase-js` |
| Schema errors | `npx supabase db push` |
| No test data | Create deal with payments in UI |
| Modal not appearing | Check console for errors |

---

## ✅ Success Checklist

- [ ] Automated test passes
- [ ] Unpaid payments archived when → Lost
- [ ] Paid payments preserved when → Lost
- [ ] Payments regenerate when Lost → Active
- [ ] No broker splits display correctly
- [ ] Amounts show 2 decimals

---

## 📊 What You Should See

### Console Logs
```
🗄️ Deal moved to Lost - archiving unpaid payments...
✅ Archived 1 unpaid payment(s)
```

### Archive Modal
```
Archive Unpaid Payments?

Moving "BM - Brookhaven | OVIS" to "Lost"
will archive 2 unpaid payment(s).

Note: Paid payments will remain in the system...

[Cancel]  [Continue]
```

---

## 📁 Files Reference

- **Automated Test**: `test-payment-lifecycle.js`
- **Full Manual Guide**: `MANUAL_TESTING_CHECKLIST.md`
- **Documentation**: `README.md`

---

## 🔍 Database Quick Check

```sql
-- See all payments (including archived)
SELECT
  payment_sequence,
  payment_amount,
  payment_received,
  is_active,
  deleted_at
FROM payment
WHERE deal_id = 'YOUR_DEAL_ID'
ORDER BY payment_sequence;
```

**Expected**:
- Unpaid → `is_active = false`, has `deleted_at`
- Paid → `is_active = true`, `deleted_at = NULL`

---

## 🎯 One-Command Full Test

```bash
# Run automated test
node test-scripts/test-payment-lifecycle.js

# If passes, manually test UI with steps above
```

That's it! 🎉
