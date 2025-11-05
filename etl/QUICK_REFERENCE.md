# Restaurant Trends ETL - Quick Reference

## One-Line Commands

### Process Single File with Database Load
```bash
# DATABASE_URL is auto-loaded from .env file
python3 etl/etl_restaurant_trends.py --in "Screen Shots/YE24 Oculus SG.xlsx" --out data/processed --load postgres
```

### Process All Files
```bash
# DATABASE_URL is auto-loaded from .env file
for file in "Screen Shots"/YE*.xlsx; do python3 etl/etl_restaurant_trends.py --in "$file" --out data/processed --load postgres; done
```

### CSV Only (No Database)
```bash
python3 etl/etl_restaurant_trends.py --in "Screen Shots/YE24 Oculus SG.xlsx" --out data/processed --load none
```

## Database Commands

### Count Records
```bash
PGPASSWORD='PASSWORD' psql -h aws-0-us-east-1.pooler.supabase.com -p 6543 -U postgres.PROJECT_REF -d postgres -c "SELECT COUNT(*) FROM restaurant_location; SELECT COUNT(*), year FROM restaurant_trend GROUP BY year ORDER BY year;"
```

### Import Verified Coordinates
```bash
PGPASSWORD='PASSWORD' psql -h aws-0-us-east-1.pooler.supabase.com -p 6543 -U postgres.PROJECT_REF -d postgres -f supabase/migrations/20251105_import_salesforce_verified_coords.sql
```

### Run Migrations
```bash
./deploy-restaurant-migrations.sh
```

## File Locations

| Item | Location |
|------|----------|
| ETL Script | `etl/etl_restaurant_trends.py` |
| Input Files | `data/incoming/` or `Screen Shots/` |
| Output CSVs | `data/processed/` |
| Migrations | `supabase/migrations/` |
| Documentation | `etl/README.md`, `etl/SYSTEM_OVERVIEW.md` |

## Command-Line Arguments

| Argument | Values | Description |
|----------|--------|-------------|
| `--in` | file path | Input Excel file |
| `--out` | directory | Output directory for CSVs |
| `--load` | none, postgres | Database load mode |
| `--log-level` | DEBUG, INFO, WARNING, ERROR | Logging verbosity |

## Environment Variables

```bash
# DATABASE_URL is automatically loaded from .env file (recommended)
# Your .env file should contain:
DATABASE_URL='postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres'

# Alternatively, export manually if not using .env:
export DATABASE_URL='postgresql://...'
```

> **Note:** The ETL script automatically loads environment variables from `.env` file using python-dotenv.

## Database Tables

| Table | Primary Key | Foreign Key | Purpose |
|-------|-------------|-------------|---------|
| `restaurant_location` | store_no | - | Static location data |
| `restaurant_trend` | trend_id | store_no → restaurant_location | Yearly trend data |

## Key Files to Modify

| Task | File to Edit |
|------|--------------|
| Add/change columns | `etl/utils/mapping.py` |
| Change data types | `etl/utils/parsing.py` |
| Change validation rules | `etl/utils/cleaning.py` |
| Modify database operations | `etl/loaders/postgres_loader.py` |
| Add database fields | `supabase/migrations/` (new migration) |

## Common Queries

### View Locations by Chain
```sql
SELECT chain, COUNT(*) as count FROM restaurant_location GROUP BY chain ORDER BY count DESC LIMIT 10;
```

### View Trends by Year
```sql
SELECT year, COUNT(*) as records FROM restaurant_trend GROUP BY year ORDER BY year;
```

### Find Locations with Verified Coordinates
```sql
SELECT store_no, chain, geocity, verified_latitude, verified_longitude 
FROM restaurant_location 
WHERE verified_latitude IS NOT NULL;
```

### Top Sales by Chain (Current Year)
```sql
SELECT l.chain, AVG(t.curr_annual_sls_k) as avg_sales 
FROM restaurant_location l 
JOIN restaurant_trend t ON l.store_no = t.store_no 
WHERE t.year = 2024 
GROUP BY l.chain 
ORDER BY avg_sales DESC 
LIMIT 10;
```

## Troubleshooting Quick Fixes

| Error | Quick Fix |
|-------|-----------|
| "integer out of range" | Already fixed in postgres_loader.py |
| "could not translate host name" | Use Shared Pooler (port 6543) not Dedicated Pooler |
| "No database connection string" | Set DATABASE_URL environment variable |
| "operator does not exist: text = integer" | Already fixed - store_no converted to string |

## Installation

```bash
# 1. Install Python dependencies
pip3 install -r requirements.txt

# 2. Set database connection
export DATABASE_URL='postgresql://...'

# 3. Run migrations
./deploy-restaurant-migrations.sh

# 4. Process files
python3 etl/etl_restaurant_trends.py --in "file.xlsx" --out data/processed --load postgres
```

## Success Indicators

✅ ETL completes with "ETL COMPLETED SUCCESSFULLY"  
✅ CSV files created in data/processed/  
✅ Database shows correct record counts  
✅ No "ERROR" messages in logs  
✅ Processing completes in ~10 seconds per file  

## Getting Help

- 📖 [README.md](README.md) - Full user guide
- 🏗️ [SYSTEM_OVERVIEW.md](SYSTEM_OVERVIEW.md) - Architecture details
- 📋 [IMPLEMENTATION_PLAN](../docs/IMPLEMENTATION_PLAN_RESTAURANT_TRENDS_ETL.md) - Design decisions
- 💬 Code comments and docstrings in all Python files

---

**Quick Start:** Set DATABASE_URL → Run migrations → Process files → Query database  
**Version:** 1.0.0
