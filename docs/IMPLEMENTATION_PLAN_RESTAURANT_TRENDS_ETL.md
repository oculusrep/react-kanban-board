# Restaurant Trends ETL - Implementation Plan

**Branch:** `feature/restaurant-trends`
**Created:** 2025-11-04
**Status:** Ready for Implementation

---

## Overview

Create a Python ETL system integrated within the react-kanban-board repository to process yearly Excel files (`YE##*.xlsx`) containing restaurant trend data and load them into two PostgreSQL/Supabase tables.

---

## Architecture Decisions

### 1. Repository Structure

```
/etl/
  ├── etl_restaurant_trends.py        # Main ETL script
  ├── utils/
  │   ├── __init__.py
  │   ├── mapping.py                  # Excel → DB column mappings
  │   ├── parsing.py                  # Year extraction, data type coercion
  │   └── cleaning.py                 # Data validation, null handling
  ├── loaders/
  │   ├── __init__.py
  │   └── postgres_loader.py          # Database upsert logic
  └── config.example.yaml             # Configuration template

/data/
  ├── incoming/                       # Excel files go here (gitignored)
  └── processed/                      # Output CSVs (gitignored)

/supabase/migrations/
  └── 20251104_create_restaurant_tables.sql
  └── 20251104_import_salesforce_verified_coords.sql
```

### 2. Database Schema

**Tables:**
- `restaurant_location` (singular, snake_case) - Static location data
- `restaurant_trend` (singular, snake_case) - Yearly trend data

**Key Design Decisions:**
- Use singular table names to match existing convention (`critical_date`, `deal`, etc.)
- Include standard `created_at`, `updated_at` timestamp fields
- Skip `created_by_id`, `updated_by_id` since this is bulk-loaded ETL data
- Add performance indexes on foreign keys and commonly queried fields
- Store verified coordinates with `verified_source` and `verified_at` tracking

### 3. Database Connection Strategy

**Primary Method:** Environment variable `DATABASE_URL`
**Fallback:** Config file (`config.yaml`)

**Rationale:**
- Standard PostgreSQL convention
- Easy local development with `.env` file
- Seamless GitHub Actions integration via secrets
- Flexible for different environments

### 4. Data Processing Strategy

**Upsert Behavior:**
- `restaurant_location`: **UPDATE** when newer data is loaded
  - Newer data is likely more accurate
  - Locations can change over time (address corrections, renovations)
  - Track updates via `updated_at` timestamp
- `restaurant_trend`: **UPSERT** on `(store_no, year)` unique constraint
  - Allow re-running same year to correct data

**Data Validation:** Lenient mode with detailed logging
- Skip invalid rows but log warnings with row numbers
- Continue processing good records when encountering bad data
- Report summary of skipped rows at end
- Fail only on critical errors (can't read file, zero valid rows)

**Rationale:** Real-world data is messy; don't let a few bad rows block hundreds of good ones

---

## ETL Flow

### Step-by-Step Process

1. **Parse Filename**
   - Extract year from filename: `YE##` pattern → `2000 + ##`
   - Example: `YE24 Oculus SG.xlsx` → year `2024`

2. **Read Excel File**
   - Read first sheet using pandas
   - Preserve all 48 columns from source

3. **Clean Data**
   - Drop completely empty rows
   - Drop rows where `STORE_NO` is null (required field)
   - Log how many rows were dropped and why

4. **Map Columns**
   - Rename Excel columns to database field names
   - Handle special characters in Excel headers (parentheses, slashes, etc.)

5. **Split Datasets**
   - **Location data:** Static fields, unique by `store_no`
   - **Trend data:** Yearly fields, add `year` column, unique by `(store_no, year)`

6. **Coerce Data Types**
   - Convert numeric strings to integers/floats
   - Handle nulls appropriately per field
   - Validate latitude/longitude ranges

7. **Export CSVs**
   - Save to `/data/processed/{basename}_{year}_locations.csv`
   - Save to `/data/processed/{basename}_{year}_trends.csv`

8. **Load to Database** (optional)
   - Upsert `restaurant_location` records
   - Upsert `restaurant_trend` records
   - Use PostgreSQL `ON CONFLICT` for idempotency

---

## Column Mapping

### Source: Excel File (48 columns)

```
CHAIN, GEOADDRESS, GEOCITY, GEOSTATE, GEOZIP, GEOZIP4, COUNTY,
DMA(MARKET), SEGMENT, SUBSEGMENT, CATEGORY, LATITUDE, LONGITUDE,
GEOQUALITY, STORE_NO, CHAIN_NO, DMA_NO, SEG_NO, SUBSEG_NO, CAT_NO,
COUNTY_NO, GEO_ST/CNTY_NO, YR_BUILT, CO/FR, CO/FR_NO, CURRENT_YRS,
CNG(CURR_NATL_GRADE), LABEL(CNG), CNI(CURR_NATL_INDEX),
CURR_ANNUAL_SLS($000), CMG(CURR_MKT_GRADE), LABEL(CNG/CMG),
LABEL(CNG<PNG), CMI(CURR_MKT_INDEX), SURVEY_YR(LAST/C),
SURVEY_YR(NEXT/C), TTL_NO_SURVEYS(C), PAST_YRS, PNG(PAST_NATL_GRADE),
LABEL(PNG), PNI(PAST_NATL_INDEX), PAST_ANNUAL_SLS($000),
PMG(PAST_MKT_GRADE), LABEL(PNG/PMG), PMI(PAST_MKT_INDEX),
SURVEY_YR(LAST/P), SURVEY_YR(NEXT/P), TTL_NO_SURVEYS(P)
```

### Target: restaurant_location (Static Fields)

```sql
store_no              ← STORE_NO (PK)
chain_no              ← CHAIN_NO
chain                 ← CHAIN
geoaddress            ← GEOADDRESS
geocity               ← GEOCITY
geostate              ← GEOSTATE
geozip                ← GEOZIP
geozip4               ← GEOZIP4
county                ← COUNTY
dma_market            ← DMA(MARKET)
dma_no                ← DMA_NO
segment               ← SEGMENT
subsegment            ← SUBSEGMENT
category              ← CATEGORY
latitude              ← LATITUDE
longitude             ← LONGITUDE
geoquality            ← GEOQUALITY
yr_built              ← YR_BUILT
co_fr                 ← CO/FR
co_fr_no              ← CO/FR_NO
seg_no                ← SEG_NO
verified_latitude     ← (null, populated via Salesforce migration)
verified_longitude    ← (null, populated via Salesforce migration)
verified_source       ← (null, populated via Salesforce migration)
verified_at           ← (null, populated via Salesforce migration)
created_at            ← NOW()
updated_at            ← NOW()
```

### Target: restaurant_trend (Yearly Fields)

```sql
trend_id                ← gen_random_uuid() (PK)
store_no                ← STORE_NO (FK)
year                    ← Extracted from filename
curr_natl_grade         ← CNG(CURR_NATL_GRADE)
curr_natl_index         ← CNI(CURR_NATL_INDEX)
curr_annual_sls_k       ← CURR_ANNUAL_SLS($000)
curr_mkt_grade          ← CMG(CURR_MKT_GRADE)
label_cng_cmg           ← LABEL(CNG/CMG)
label_cng_lt_png        ← LABEL(CNG<PNG)
curr_mkt_index          ← CMI(CURR_MKT_INDEX)
survey_yr_last_c        ← SURVEY_YR(LAST/C)
survey_yr_next_c        ← SURVEY_YR(NEXT/C)
ttl_no_surveys_c        ← TTL_NO_SURVEYS(C)
past_yrs                ← PAST_YRS
past_natl_grade         ← PNG(PAST_NATL_GRADE)
label_png               ← LABEL(PNG)
past_natl_index         ← PNI(PAST_NATL_INDEX)
past_annual_sls_k       ← PAST_ANNUAL_SLS($000)
past_mkt_grade          ← PMG(PAST_MKT_GRADE)
label_png_pmg           ← LABEL(PNG/PMG)
past_mkt_index          ← PMI(PAST_MKT_INDEX)
survey_yr_last_p        ← SURVEY_YR(LAST/P)
survey_yr_next_p        ← SURVEY_YR(NEXT/P)
ttl_no_surveys_p        ← TTL_NO_SURVEYS(P)
created_at              ← NOW()
updated_at              ← NOW()
```

**Unique Constraint:** `(store_no, year)`

---

## Database Migrations

### Migration 1: Create Tables

**File:** `supabase/migrations/20251104_create_restaurant_tables.sql`

Creates:
- `restaurant_location` table with primary key on `store_no`
- `restaurant_trend` table with foreign key to `restaurant_location`
- Performance indexes on foreign keys and lookup fields
- Triggers for `updated_at` timestamp maintenance
- Table and column comments for documentation

### Migration 2: Import Verified Coordinates

**File:** `supabase/migrations/20251104_import_salesforce_verified_coords.sql`

Updates `restaurant_location` with verified coordinates from Salesforce:
- Source: `salesforce_Restaurant_Trends__c` table
- Matches on `store_no` = `Store_Number__c`
- Only imports valid coordinates (latitude: -90 to 90, longitude: -180 to 180)
- Sets `verified_source = 'Salesforce'` and `verified_at = NOW()`

---

## Command-Line Interface

### Usage

```bash
python etl/etl_restaurant_trends.py \
  --in "data/incoming/YE24 Oculus SG.xlsx" \
  --out data/processed \
  --load [none|postgres]
```

### Parameters

- `--in` (required): Path to input Excel file
- `--out` (required): Directory for output CSV files
- `--load` (optional): Database loading mode
  - `none`: Only generate CSVs (default)
  - `postgres`: Generate CSVs and load to database

### Environment Variables

- `DATABASE_URL`: PostgreSQL connection string (priority)
- Or individual variables:
  - `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`

### Example Connection String

```
postgresql://postgres:password@db.example.supabase.co:5432/postgres
```

---

## Python Dependencies

**File:** `requirements.txt`

```
pandas>=2.0.0
openpyxl>=3.1.0          # Excel file reading
psycopg2-binary>=2.9.0   # PostgreSQL driver
python-dotenv>=1.0.0     # Environment variable management
pyyaml>=6.0              # Config file parsing
```

---

## Configuration File

**File:** `etl/config.example.yaml`

```yaml
# Database connection (optional, use DATABASE_URL env var instead)
database:
  host: db.example.supabase.co
  port: 5432
  database: postgres
  user: postgres
  password: your_password_here

# ETL settings
etl:
  validation_mode: lenient  # lenient | strict
  log_level: INFO           # DEBUG | INFO | WARNING | ERROR
```

---

## Implementation Checklist

### Phase 1: Setup (Current Session)
- [x] Create feature branch `feature/restaurant-trends`
- [x] Gather requirements and create implementation plan
- [ ] Document plan in `/docs/IMPLEMENTATION_PLAN_RESTAURANT_TRENDS_ETL.md`

### Phase 2: Database Setup (Next Session)
- [ ] Create project folder structure
- [ ] Write database migration for `restaurant_location` and `restaurant_trend` tables
- [ ] Write Salesforce verified coordinates migration
- [ ] Run migrations to create tables in Supabase
- [ ] Update `.gitignore` for data files

### Phase 3: Core ETL Development
- [ ] Create `requirements.txt`
- [ ] Implement `etl/utils/mapping.py` (column mappings)
- [ ] Implement `etl/utils/parsing.py` (year extraction, type coercion)
- [ ] Implement `etl/utils/cleaning.py` (validation, null handling)
- [ ] Implement `etl/loaders/postgres_loader.py` (database operations)
- [ ] Create `etl/config.example.yaml`

### Phase 4: Main Script
- [ ] Implement `etl/etl_restaurant_trends.py` (main orchestration)
- [ ] Add command-line argument parsing
- [ ] Add logging and error handling
- [ ] Add progress reporting

### Phase 5: Testing & Validation
- [ ] Test with sample file: `YE24 Oculus SG.xlsx`
- [ ] Verify CSV outputs are correct
- [ ] Verify database records are loaded correctly
- [ ] Check data type conversions
- [ ] Validate error handling with malformed data

### Phase 6: Bulk Processing
- [ ] Process remaining 8 Excel files (YE15-YE23)
- [ ] Verify all years loaded correctly
- [ ] Run Salesforce verified coordinates migration
- [ ] Validate final database state

### Phase 7: GitHub Actions (Future)
- [ ] Create `.github/workflows/run-etl.yml`
- [ ] Test workflow with manual trigger
- [ ] Document workflow usage

---

## Testing Strategy

### Test File
- Primary: `Screen Shots/YE24 Oculus SG.xlsx`
- Additional: 8 more files (YE15-YE23)

### Validation Checks
1. **File parsing:**
   - Year extraction from filename works correctly
   - All 48 columns are read properly

2. **Data cleaning:**
   - Empty rows are dropped
   - Rows with null `STORE_NO` are dropped
   - Warnings are logged for dropped rows

3. **Column mapping:**
   - All Excel columns map to correct database fields
   - Special characters in column names handled properly

4. **Data splitting:**
   - Location records are unique by `store_no`
   - Trend records include `year` field
   - No data loss during split

5. **Type coercion:**
   - Numeric fields convert correctly
   - Nulls are preserved appropriately
   - Invalid values are handled gracefully

6. **CSV output:**
   - Files are created in correct location
   - Filenames follow convention: `{basename}_{year}_locations.csv`
   - CSV structure matches database schema

7. **Database loading:**
   - Records insert successfully
   - Upserts work correctly on re-run
   - Foreign key relationships maintained
   - No orphaned trend records

8. **Salesforce migration:**
   - Verified coordinates imported correctly
   - Only valid lat/long values imported
   - `verified_source` and `verified_at` populated

---

## Data Files to Process

1. `YE24 Oculus SG.xlsx` (2024) ← Test with this first
2. YE23 file (2023)
3. YE22 file (2022)
4. YE21 file (2021)
5. YE20 file (2020)
6. YE19 file (2019)
7. YE18 file (2018)
8. YE17 file (2017)
9. YE16 file (2016)
10. YE15 file (2015)

**Note:** Exact filenames for years 15-23 to be confirmed.

---

## Future Enhancements (Not in Initial Scope)

1. **GitHub Actions Workflow**
   - Manual trigger with file URL input
   - Automatic CSV artifact upload
   - Slack/email notifications on completion

2. **Data Quality Dashboard**
   - Web UI to view ETL runs
   - Data quality metrics
   - Duplicate detection

3. **Incremental Loading**
   - Track which files have been processed
   - Skip already-loaded data
   - Delta detection

4. **Advanced Validation**
   - Cross-year consistency checks
   - Anomaly detection (unusual grade changes)
   - Geographic validation (city/state/zip alignment)

5. **Unit Tests**
   - Test suite for all utility modules
   - Mock database for testing
   - Sample data fixtures

---

## Key Files Reference

### New Files to Create
- `/docs/IMPLEMENTATION_PLAN_RESTAURANT_TRENDS_ETL.md` (this file)
- `/etl/etl_restaurant_trends.py`
- `/etl/utils/mapping.py`
- `/etl/utils/parsing.py`
- `/etl/utils/cleaning.py`
- `/etl/loaders/postgres_loader.py`
- `/etl/config.example.yaml`
- `/requirements.txt`
- `/supabase/migrations/20251104_create_restaurant_tables.sql`
- `/supabase/migrations/20251104_import_salesforce_verified_coords.sql`

### Existing Files to Modify
- `.gitignore` (add `/data/`, `/etl/config.yaml`)

### Sample Data
- `Screen Shots/YE24 Oculus SG.xlsx` (test file)

---

## Contact & Questions

For questions about this implementation, refer to:
- Original requirements: `Screen Shots/Restaurant_Trends_ETL_Instructions_for_Claude_Code.md`
- Database schema: `database-schema.ts` (for existing Salesforce tables)
- Migration examples: `supabase/migrations/20251103130930_create_critical_dates_table.sql`

---

## Status

**Ready to Begin Implementation**
Next session: Start with Phase 2 (Database Setup)
