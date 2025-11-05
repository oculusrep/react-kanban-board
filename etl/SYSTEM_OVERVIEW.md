# Restaurant Trends ETL - System Overview

## What This System Does

Processes yearly Excel files containing restaurant trend data and loads them into a PostgreSQL/Supabase database for analysis and visualization.

## Input

- **Format:** Excel files (.xlsx)
- **Naming:** Must follow `YE##*.xlsx` pattern (e.g., `YE24 Oculus SG.xlsx`)
- **Content:** 48 columns of restaurant location and trend data
- **Location:** Place files in `data/incoming/` or reference directly

## Output

### CSV Files
- `{filename}_{year}_locations.csv` - Location data (one per store)
- `{filename}_{year}_trends.csv` - Trend data (one per store per year)
- **Location:** `data/processed/`

### Database Tables
- `restaurant_location` - 8,752 unique restaurant locations
- `restaurant_trend` - Yearly trend data (8,752 records per year)

## Architecture

```
┌─────────────────┐
│  Excel Files    │
│  (YE##*.xlsx)   │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  ETL Pipeline                           │
│  ┌─────────────────────────────────┐   │
│  │ 1. Parse Year from Filename     │   │
│  │ 2. Read Excel (pandas)          │   │
│  │ 3. Clean Data                   │   │
│  │ 4. Split Location/Trend Data    │   │
│  │ 5. Map Columns to DB Schema     │   │
│  │ 6. Coerce Data Types            │   │
│  │ 7. Export to CSV                │   │
│  │ 8. Upsert to PostgreSQL         │   │
│  └─────────────────────────────────┘   │
└─────────────────┬───────────────────────┘
                  │
         ┌────────┴────────┐
         ▼                 ▼
    ┌─────────┐     ┌──────────────┐
    │   CSV   │     │  PostgreSQL  │
    │  Files  │     │  (Supabase)  │
    └─────────┘     └──────────────┘
```

## Key Components

### Python Modules

1. **etl_restaurant_trends.py** - Main orchestration script
   - Command-line interface
   - Coordinates all ETL steps
   - Handles logging and error reporting

2. **utils/mapping.py** - Column mappings
   - Maps 48 Excel columns to database fields
   - Separates location vs. trend columns

3. **utils/parsing.py** - Data parsing
   - Extracts year from filename (regex: `YE(\d{2})`)
   - Type coercion (numeric, integer, text)
   - Coordinate validation

4. **utils/cleaning.py** - Data cleaning
   - Drops empty rows and null store numbers
   - Validates coordinate ranges
   - Removes duplicates
   - Detailed logging of cleaning operations

5. **loaders/postgres_loader.py** - Database operations
   - Context manager for connection handling
   - Upsert operations with ON CONFLICT
   - Foreign key verification
   - NaN to NULL conversion for INTEGER columns

### Database Schema

**restaurant_location** (Primary table)
- `store_no` TEXT PRIMARY KEY
- Location fields (chain, address, city, state, zip)
- Coordinates (latitude, longitude)
- Verified coordinates from Salesforce
- DMA market information
- Segment and category classifications

**restaurant_trend** (Yearly data)
- `trend_id` UUID PRIMARY KEY
- `store_no` TEXT (FK → restaurant_location)
- `year` INTEGER
- Current year metrics (grades, indexes, sales)
- Past year metrics
- Survey information
- UNIQUE constraint on (store_no, year)

## Data Flow Details

### Column Mapping Example
```
Excel Column          →  Database Column         Table
----------------         ------------------       ---------
STORE_NO             →  store_no                 location
CHAIN                →  chain                    location
GEOADDRESS           →  geoaddress               location
CNG(CURR_NATL_GRADE) →  curr_natl_grade          trend
CY_AN_SLS(000)       →  curr_annual_sls_k        trend
```

### Type Conversions
- **TEXT:** store_no, chain, grades, labels
- **DOUBLE PRECISION:** indexes, sales, coordinates
- **INTEGER:** year, past_yrs, survey years, survey counts
- **NULL Handling:** Pandas NaN → Python None → PostgreSQL NULL

### Upsert Logic
- **Locations:** UPDATE on conflict (newer data preferred)
- **Trends:** UPSERT on (store_no, year) constraint
- **Idempotent:** Safe to re-run same file multiple times

## Performance

- **Processing Speed:** ~10 seconds per 8,752-row file
- **Batch Insert:** Uses `execute_values()` for efficiency
- **Indexes:** Optimized for common queries (chain, state, city, coordinates)

## Error Handling

1. **Validation Mode:** Lenient (skip bad rows, log warnings)
2. **Critical Failures:** File not found, zero valid rows, database connection errors
3. **Non-Critical:** Invalid coordinates, duplicate rows (logged but skipped)
4. **Transaction Safety:** Rollback on errors, commit on success

## Dependencies

```
pandas>=2.0.0        # Data processing
openpyxl>=3.1.0      # Excel file reading
psycopg2-binary>=2.9.0  # PostgreSQL driver
python-dotenv>=1.0.0    # Environment variable loading
pyyaml>=6.0          # Config file parsing
```

## Configuration

**Environment Variable:**
```bash
DATABASE_URL='postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres'
```

**Command-Line Arguments:**
- `--in` - Input Excel file path
- `--out` - Output directory for CSV files
- `--load` - Database load mode (none, postgres)
- `--log-level` - Logging verbosity (DEBUG, INFO, WARNING, ERROR)

## Usage Examples

### Basic Usage
```bash
python3 etl/etl_restaurant_trends.py \
  --in "Screen Shots/YE24 Oculus SG.xlsx" \
  --out data/processed \
  --load postgres
```

### CSV Only
```bash
python3 etl/etl_restaurant_trends.py \
  --in "Screen Shots/YE24 Oculus SG.xlsx" \
  --out data/processed \
  --load none
```

### Batch Processing
```bash
for file in "Screen Shots"/YE*.xlsx; do
  python3 etl/etl_restaurant_trends.py --in "$file" --out data/processed --load postgres
done
```

## Success Metrics

**YE24 Initial Load:**
- ✅ 8,752 locations processed
- ✅ 8,752 trend records loaded
- ✅ 184 locations enriched with Salesforce coordinates
- ✅ 0 errors, all data validated
- ✅ 10.41 seconds processing time

## Future Enhancements

1. **GitHub Actions Workflow** - Automated ETL on file upload
2. **Data Quality Dashboard** - Visualization of cleaning statistics
3. **Email Notifications** - Alert on ETL completion/failure
4. **Incremental Loading** - Process only changed records
5. **Data Validation Rules** - Configurable business rules

## Documentation

- **README.md** - Quick start guide and common tasks
- **IMPLEMENTATION_PLAN_RESTAURANT_TRENDS_ETL.md** - Detailed architecture and design decisions
- **SYSTEM_OVERVIEW.md** - This file
- **Code Docstrings** - Inline documentation in all Python modules

## Troubleshooting

See [README.md](README.md#troubleshooting) for common issues and solutions.

## Maintenance

- **Database Migrations:** Add new migrations to `supabase/migrations/`
- **Column Changes:** Update `utils/mapping.py`
- **Type Changes:** Update `utils/parsing.py`
- **Validation Rules:** Update `utils/cleaning.py`

---

**Last Updated:** 2025-11-05  
**Status:** Production Ready  
**Version:** 1.0.0
