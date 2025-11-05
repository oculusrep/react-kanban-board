# Restaurant Trends ETL - Testing Checklist

Use this checklist when testing the ETL system with new or multiple spreadsheet files.

---

## Pre-Testing Setup

### ✅ Environment Check
- [ ] Terminal open and navigated to project root
- [ ] DATABASE_URL set in `.env` file
- [ ] Python dependencies installed (`pip3 install -r requirements.txt`)
- [ ] Database tables created (ran `./deploy-restaurant-migrations.sh`)

### ✅ File Preparation
- [ ] Excel files placed in `Screen Shots/` folder
- [ ] Each file has `YE##` in the filename
- [ ] Files are valid .xlsx format (can open in Excel)

---

## Testing Single File

### File: `YE24 Oculus SG.xlsx`

**Test Method 1: Using Test Script (Recommended)**
```bash
./etl/test-annual-load.sh "Screen Shots/YE24 Oculus SG.xlsx"
```

Expected: Script runs 11 validation steps and prompts for verified coordinates import.

**Test Method 2: Manual Command**
```bash
python3 etl/etl_restaurant_trends.py --in "Screen Shots/YE24 Oculus SG.xlsx" --out data/processed --load postgres
```

Expected: Completes in ~10 seconds with "ETL COMPLETED SUCCESSFULLY"

### ✅ Validation Steps

After running either test method:

1. **Check for success message:**
   ```
   ETL COMPLETED SUCCESSFULLY
   ```

2. **Verify CSV files created:**
   ```bash
   ls -l data/processed/YE24*
   ```
   Expected: 2 files (locations.csv and trends.csv)

3. **Count database records:**
   ```bash
   PGPASSWORD="$DB_PASSWORD" psql -h aws-0-us-east-1.pooler.supabase.com -p 6543 -U postgres.rqbvcvwbziilnycqtmnc -d postgres -c "SELECT COUNT(*) FROM restaurant_trend WHERE year = 2024;"
   ```
   Expected: Should show the number of records loaded (e.g., 8752)

4. **Check for errors in output:**
   - [ ] No "ERROR" messages
   - [ ] No "FAILED" messages
   - [ ] No Python exceptions/tracebacks

5. **Verify year extracted correctly:**
   - [ ] Log shows "Year: 2024" (or appropriate year)

---

## Testing Multiple Files

### Batch Test All Files

```bash
for file in "Screen Shots"/YE*.xlsx; do
  echo "======================================"
  echo "Testing: $file"
  echo "======================================"
  ./etl/test-annual-load.sh "$file" <<< "y"
  echo ""
done
```

### ✅ Batch Validation

After batch processing:

1. **Check all years loaded:**
   ```bash
   PGPASSWORD="$DB_PASSWORD" psql -h aws-0-us-east-1.pooler.supabase.com -p 6543 -U postgres.rqbvcvwbziilnycqtmnc -d postgres -c "SELECT year, COUNT(*) as records FROM restaurant_trend GROUP BY year ORDER BY year;"
   ```

2. **Expected results:**
   - [ ] One row per year processed
   - [ ] Similar record counts per year (e.g., 8000-9000 each)
   - [ ] No duplicate years (unless intentionally reprocessed)

3. **Check CSV files:**
   ```bash
   ls -l data/processed/
   ```
   Expected: 2 files per year (locations and trends)

---

## Testing Edge Cases

### Test 1: Reprocessing Same Year

**Purpose:** Verify idempotent behavior (can safely rerun)

```bash
# First load
python3 etl/etl_restaurant_trends.py --in "Screen Shots/YE24 Oculus SG.xlsx" --out data/processed --load postgres

# Get record count
COUNT1=$(PGPASSWORD="$DB_PASSWORD" psql -h aws-0-us-east-1.pooler.supabase.com -p 6543 -U postgres.rqbvcvwbziilnycqtmnc -d postgres -t -c "SELECT COUNT(*) FROM restaurant_trend WHERE year = 2024;")

# Second load (same file)
python3 etl/etl_restaurant_trends.py --in "Screen Shots/YE24 Oculus SG.xlsx" --out data/processed --load postgres

# Get record count again
COUNT2=$(PGPASSWORD="$DB_PASSWORD" psql -h aws-0-us-east-1.pooler.supabase.com -p 6543 -U postgres.rqbvcvwbziilnycqtmnc -d postgres -t -c "SELECT COUNT(*) FROM restaurant_trend WHERE year = 2024;")

echo "First load: $COUNT1 records"
echo "Second load: $COUNT2 records"
```

**Expected:**
- [ ] Both loads complete successfully
- [ ] COUNT1 = COUNT2 (no duplicates created)
- [ ] Second load updates existing records (updated_at changes)

### Test 2: CSV-Only Mode (No Database)

**Purpose:** Verify CSV generation works without database

```bash
python3 etl/etl_restaurant_trends.py --in "Screen Shots/YE24 Oculus SG.xlsx" --out data/processed --load none
```

**Expected:**
- [ ] Completes successfully
- [ ] CSV files created in data/processed/
- [ ] No database operations attempted
- [ ] Log shows "Skipping database load (mode: none)"

### Test 3: Invalid Filename

**Purpose:** Verify proper error handling

```bash
# Copy file with invalid name
cp "Screen Shots/YE24 Oculus SG.xlsx" "Screen Shots/Restaurant Trends 2024.xlsx"

# Try to process
python3 etl/etl_restaurant_trends.py --in "Screen Shots/Restaurant Trends 2024.xlsx" --out data/processed --load postgres
```

**Expected:**
- [ ] Fails with clear error message
- [ ] Error mentions: "Could not extract year from filename"
- [ ] Suggests using YE## pattern

---

## Data Quality Checks

After loading data, verify quality:

### Check 1: Verify Store Numbers Match Locations

```sql
-- All trends should have matching locations
SELECT COUNT(*) as orphaned_trends
FROM restaurant_trend t
LEFT JOIN restaurant_location l ON t.store_no = l.store_no
WHERE l.store_no IS NULL;
```

**Expected:** 0 orphaned trends

### Check 2: Check for NULL Values in Key Fields

```sql
-- Locations
SELECT
    COUNT(*) as total,
    COUNT(store_no) as has_store_no,
    COUNT(chain) as has_chain,
    COUNT(geocity) as has_city
FROM restaurant_location;

-- Trends
SELECT
    COUNT(*) as total,
    COUNT(store_no) as has_store_no,
    COUNT(year) as has_year
FROM restaurant_trend;
```

**Expected:**
- [ ] total = has_store_no = has_year (all non-null)
- [ ] Most records have chain and city data

### Check 3: Verify Coordinate Ranges

```sql
SELECT
    MIN(latitude) as min_lat,
    MAX(latitude) as max_lat,
    MIN(longitude) as min_long,
    MAX(longitude) as max_long
FROM restaurant_location
WHERE latitude IS NOT NULL;
```

**Expected:**
- [ ] Latitude between 24 and 50 (US range)
- [ ] Longitude between -125 and -65 (US range)

### Check 4: Check Chain Distribution

```sql
SELECT chain, COUNT(*) as count
FROM restaurant_location
GROUP BY chain
ORDER BY count DESC
LIMIT 10;
```

**Expected:**
- [ ] Reasonable distribution across chains
- [ ] No chain dominates excessively
- [ ] Chain names look correct (no weird characters)

---

## Performance Benchmarks

Track these metrics for each test:

| File | Records | Processing Time | CSV Time | DB Time |
|------|---------|----------------|----------|---------|
| YE24 | 8,752 | ~10 sec | ~1 sec | ~9 sec |
| YE23 | TBD | TBD | TBD | TBD |
| YE22 | TBD | TBD | TBD | TBD |

**Warning signs:**
- 🚨 Processing takes > 30 seconds
- 🚨 Memory usage spikes above 1GB
- 🚨 Database connection timeouts

---

## Troubleshooting During Tests

### Issue: "No database connection string provided"

**Fix:**
```bash
# Check .env file
cat .env | grep DATABASE_URL

# If missing, add it
echo "DATABASE_URL='postgresql://postgres.rqbvcvwbziilnycqtmnc:$DB_PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres'" >> .env
```

### Issue: "integer out of range"

**Status:** Should be fixed in code already (postgres_loader.py)

**If you see this:**
- Check if code was modified
- Verify math.isnan() conversion is present in postgres_loader.py

### Issue: "Could not translate host name"

**Fix:** Use Shared Pooler connection string (port 6543), not Dedicated Pooler

### Issue: Tables don't exist

**Fix:**
```bash
./deploy-restaurant-migrations.sh
```

---

## Test Results Log

Use this section to record your test results:

### Date: 2025-11-05

**Files Tested:**
- [x] YE24 Oculus SG.xlsx

**Results:**
- ✅ Single file test passed
- ✅ CSV generation successful
- ✅ Database load successful
- ✅ Data quality checks passed
- ✅ Performance within benchmarks

**Issues Found:**
- None

**Notes:**
- Initial implementation validated with YE24 data
- 8,752 locations and trends loaded
- 184 locations have verified coordinates from Salesforce

---

### Date: [Next Test Date]

**Files Tested:**
- [ ] YE25 Oculus SG.xlsx
- [ ] [Add other files]

**Results:**
- [ ] Single file tests
- [ ] Batch processing test
- [ ] Edge case tests
- [ ] Data quality checks

**Issues Found:**
- [Record any issues here]

**Notes:**
- [Add notes about this test run]

---

## Sign-Off Checklist

Before considering testing complete:

- [ ] All available files processed successfully
- [ ] Database contains expected years
- [ ] CSV files generated for all years
- [ ] No ERROR messages in any logs
- [ ] Data quality checks passed
- [ ] Performance within acceptable ranges
- [ ] Verified coordinates imported
- [ ] Edge cases tested (reprocessing, CSV-only, invalid filename)
- [ ] Documentation reviewed and accurate

**Tested By:** _______________
**Date:** _______________
**Status:** ☐ PASSED  ☐ FAILED  ☐ NEEDS REVIEW

---

**Last Updated:** 2025-11-05
