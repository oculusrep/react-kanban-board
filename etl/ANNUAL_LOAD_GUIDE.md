# Annual Restaurant Trends Data Load Guide

**Use this guide once per year when you receive new Restaurant Trends spreadsheets.**

---

## Before You Start

**What you need:**
- ✅ New Excel file(s) named like `YE24 Oculus SG.xlsx` (must have YE## in the name)
- ✅ Terminal/Command prompt open
- ✅ 10-15 minutes of time

**What you'll do:**
1. Put the file in the right place
2. Run one command to process it
3. Verify it worked

---

## Step 1: Place Your Excel File

Put your new Excel file in the `Screen Shots` folder:

```
react-kanban-board/
  └── Screen Shots/
      └── YE24 Oculus SG.xlsx  ← Put your file here
```

> **Note:** The file MUST have `YE##` in the name (like YE24, YE25, etc.) so the system knows what year it is.

---

## Step 2: Open Terminal

1. Open your terminal/command prompt
2. Navigate to the project folder:

```bash
cd /Users/mike/Documents/GitHub/react-kanban-board
```

---

## Step 3: Run the ETL Process

Copy and paste this entire command (it's all one line):

```bash
python3 etl/etl_restaurant_trends.py --in "Screen Shots/YE24 Oculus SG.xlsx" --out data/processed --load postgres
```

> **Important:** Replace `YE24 Oculus SG.xlsx` with your actual filename if it's different!

---

## Step 4: Watch for Success

The process takes about 10-15 seconds. You should see output like this:

```
2025-11-05 10:32:54 - __main__ - INFO - ================================================================================
2025-11-05 10:32:54 - __main__ - INFO - ETL COMPLETED SUCCESSFULLY
2025-11-05 10:32:54 - __main__ - INFO - Processed 8,752 locations, 8,752 trend records
2025-11-05 10:32:54 - __main__ - INFO - Year: 2024
2025-11-05 10:32:54 - __main__ - INFO - Elapsed time: 10.41 seconds
2025-11-05 10:32:54 - __main__ - INFO - ================================================================================
```

**✅ If you see "ETL COMPLETED SUCCESSFULLY" - you're done!**

---

## Step 5: Verify the Data Loaded

Run this command to check the database:

```bash
PGPASSWORD='esDrh3qdxgydD1Ea' psql -h aws-0-us-east-1.pooler.supabase.com -p 6543 -U postgres.rqbvcvwbziilnycqtmnc -d postgres -c "SELECT COUNT(*), year FROM restaurant_trend GROUP BY year ORDER BY year;"
```

You should see your new year in the list:

```
 count | year
-------+------
  8752 | 2024  ← Your new year should appear here
  8752 | 2025  ← If you just loaded YE25
```

---

## Step 6: Import Verified Coordinates (Optional but Recommended)

This adds more accurate GPS coordinates from Salesforce:

```bash
PGPASSWORD='esDrh3qdxgydD1Ea' psql -h aws-0-us-east-1.pooler.supabase.com -p 6543 -U postgres.rqbvcvwbziilnycqtmnc -d postgres -f supabase/migrations/20251105_import_salesforce_verified_coords.sql
```

You should see something like:

```
NOTICE:  Restaurant locations updated: 184
```

---

## 🎉 You're Done!

The data is now loaded and ready to use in your application.

---

## Processing Multiple Years at Once

If you have several years to load (YE20, YE21, YE22, etc.), you can process them all at once:

```bash
for file in "Screen Shots"/YE*.xlsx; do
  echo "Processing $file..."
  python3 etl/etl_restaurant_trends.py --in "$file" --out data/processed --load postgres
done
```

This will process every file that starts with "YE" and ends with ".xlsx" in the Screen Shots folder.

---

## Troubleshooting

### "No database connection string provided"

The DATABASE_URL isn't set. It should be in your `.env` file. If you see this error, contact technical support.

### "Could not extract year from filename"

Your file must have `YE##` in the name (like YE24, YE25). Rename the file and try again.

Examples:
- ✅ `YE25 Oculus SG.xlsx`
- ✅ `YE25_Data.xlsx`
- ✅ `YE25.xlsx`
- ❌ `Restaurant Trends 2025.xlsx` (missing YE##)

### "integer out of range" or "text = integer"

These errors are already fixed in the code. If you see them, the code may have been modified. Contact technical support.

### Process Takes Too Long (More than 2 minutes)

The file might be corrupted or too large. Check that:
- File is a valid Excel file (.xlsx)
- File opens normally in Excel
- File contains the expected data

---

## What Gets Created

After running the process, you'll have:

1. **CSV Files** (in `data/processed/`)
   - `YE24 Oculus SG_2024_locations.csv`
   - `YE24 Oculus SG_2024_trends.csv`

2. **Database Records**
   - Location data in `restaurant_location` table
   - Trend data in `restaurant_trend` table

---

## Quick Command Reference

### Load One File
```bash
cd /Users/mike/Documents/GitHub/react-kanban-board
python3 etl/etl_restaurant_trends.py --in "Screen Shots/YE25 Oculus SG.xlsx" --out data/processed --load postgres
```

### Check What Years Are Loaded
```bash
PGPASSWORD='esDrh3qdxgydD1Ea' psql -h aws-0-us-east-1.pooler.supabase.com -p 6543 -U postgres.rqbvcvwbziilnycqtmnc -d postgres -c "SELECT year, COUNT(*) FROM restaurant_trend GROUP BY year ORDER BY year;"
```

### Import Verified Coordinates
```bash
PGPASSWORD='esDrh3qdxgydD1Ea' psql -h aws-0-us-east-1.pooler.supabase.com -p 6543 -U postgres.rqbvcvwbziilnycqtmnc -d postgres -f supabase/migrations/20251105_import_salesforce_verified_coords.sql
```

---

## Need Help?

- 📖 See [README.md](README.md) for more details
- 📋 See [QUICK_REFERENCE.md](QUICK_REFERENCE.md) for advanced commands
- 🏗️ See [SYSTEM_OVERVIEW.md](SYSTEM_OVERVIEW.md) for technical architecture

---

**Last Updated:** 2025-11-05
**For Year:** 2024 and beyond
