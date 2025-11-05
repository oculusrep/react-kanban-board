# Restaurant Trends ETL

Python ETL system for processing yearly Excel files (YE##*.xlsx) and loading them into PostgreSQL/Supabase.

## Quick Start

### 1. Install Dependencies

```bash
pip3 install -r requirements.txt
```

### 2. Run Database Migrations

First, set your DATABASE_URL environment variable:

```bash
export DATABASE_URL='postgresql://user:password@host:port/database'
```

Then run the migration script:

```bash
./deploy-restaurant-migrations.sh
```

This creates two tables:
- `restaurant_location` - Static location data
- `restaurant_trend` - Yearly trend data

### 3. Process Excel Files

**CSV Only (no database):**
```bash
python3 etl/etl_restaurant_trends.py \
  --in "Screen Shots/YE24 Oculus SG.xlsx" \
  --out data/processed \
  --load none
```

**CSV + Database Load:**
```bash
python3 etl/etl_restaurant_trends.py \
  --in "Screen Shots/YE24 Oculus SG.xlsx" \
  --out data/processed \
  --load postgres
```

### 4. Import Verified Coordinates (Optional)

After loading your data, you can enrich it with verified coordinates from Salesforce:

```bash
psql "$DATABASE_URL" -f supabase/migrations/20251105_import_salesforce_verified_coords.sql
```

## File Structure

```
etl/
├── etl_restaurant_trends.py    # Main ETL script
├── utils/
│   ├── mapping.py               # Excel → DB column mappings
│   ├── parsing.py               # Year extraction, type coercion
│   └── cleaning.py              # Data validation, cleaning
├── loaders/
│   └── postgres_loader.py       # Database operations
└── config.example.yaml          # Configuration template

data/
├── incoming/                    # Place Excel files here
└── processed/                   # Generated CSV outputs
```

## Excel File Format

Files must follow the naming convention: `YE##*.xlsx`

Examples:
- `YE24 Oculus SG.xlsx` → Year 2024
- `YE19 O'Brien SG.xlsx` → Year 2019
- `YE15_Data.xlsx` → Year 2015

The ETL extracts the year from the filename and processes the first sheet.

## Database Tables

### restaurant_location
Static location information (one row per store):
- `store_no` (PK) - Unique store identifier
- Chain, address, city, state, zip
- Geographic coordinates (latitude, longitude)
- Verified coordinates from Salesforce
- DMA market info, segment, category

### restaurant_trend
Yearly trend data (one row per store per year):
- `trend_id` (PK) - Auto-generated UUID
- `store_no` (FK) - References restaurant_location
- `year` - Data year (from filename)
- Current year metrics (grades, indexes, sales)
- Past year metrics
- Survey information

Unique constraint on `(store_no, year)` allows idempotent re-runs.

## Data Processing Flow

1. **Extract Year**: Parse filename (YE24 → 2024)
2. **Read Excel**: Load first sheet with pandas
3. **Clean Data**: Drop empty rows, null STORE_NO, duplicates
4. **Split Data**: Separate location vs. trend columns
5. **Map Columns**: Rename Excel columns to database fields
6. **Coerce Types**: Convert numerics, integers appropriately
7. **Export CSV**: Save to `data/processed/`
8. **Load Database** (optional): Upsert to PostgreSQL

## Processing Multiple Years

To process all 9 years (YE15-YE24):

```bash
for file in "Screen Shots"/YE*.xlsx; do
  echo "Processing $file..."
  python3 etl/etl_restaurant_trends.py \
    --in "$file" \
    --out data/processed \
    --load postgres
done
```

## Output Files

CSV files are created in `data/processed/`:

```
YE24 Oculus SG_2024_locations.csv    # Location data
YE24 Oculus SG_2024_trends.csv       # Trend data
```

File format: `{basename}_{year}_{type}.csv`

## Implementation Plan

Full implementation details: [docs/IMPLEMENTATION_PLAN_RESTAURANT_TRENDS_ETL.md](../docs/IMPLEMENTATION_PLAN_RESTAURANT_TRENDS_ETL.md)
