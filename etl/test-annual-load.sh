#!/bin/bash

# Annual Restaurant Trends ETL Test Script
# This script validates each step of the annual data load process
# Usage: ./etl/test-annual-load.sh "Screen Shots/YE24 Oculus SG.xlsx"

set -e  # Exit on any error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if file path was provided
if [ -z "$1" ]; then
    echo -e "${RED}❌ Error: No file path provided${NC}"
    echo "Usage: ./etl/test-annual-load.sh \"Screen Shots/YE24 Oculus SG.xlsx\""
    exit 1
fi

INPUT_FILE="$1"

echo "=============================================================================="
echo "  ANNUAL RESTAURANT TRENDS ETL TEST"
echo "=============================================================================="
echo ""

# Step 1: Check if file exists
echo -e "${YELLOW}Step 1: Checking if file exists...${NC}"
if [ ! -f "$INPUT_FILE" ]; then
    echo -e "${RED}❌ Error: File not found: $INPUT_FILE${NC}"
    exit 1
fi
echo -e "${GREEN}✅ File exists: $INPUT_FILE${NC}"
echo ""

# Step 2: Check if filename has YE## pattern
echo -e "${YELLOW}Step 2: Validating filename pattern...${NC}"
if [[ ! "$INPUT_FILE" =~ YE[0-9]{2} ]]; then
    echo -e "${RED}❌ Error: Filename must contain YE## pattern (like YE24, YE25)${NC}"
    exit 1
fi
YEAR=$(echo "$INPUT_FILE" | grep -o 'YE[0-9]\{2\}' | grep -o '[0-9]\{2\}')
FULL_YEAR=$((2000 + YEAR))
echo -e "${GREEN}✅ Filename is valid. Year detected: 20$YEAR${NC}"
echo ""

# Step 3: Check if DATABASE_URL is set
echo -e "${YELLOW}Step 3: Checking database connection...${NC}"
if [ -z "$DATABASE_URL" ]; then
    # Try to load from .env file
    if [ -f ".env" ]; then
        export $(grep "^DATABASE_URL=" .env | xargs)
    fi
fi

if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}❌ Error: DATABASE_URL not set${NC}"
    echo "Please set DATABASE_URL in your .env file or environment"
    exit 1
fi
echo -e "${GREEN}✅ Database connection configured${NC}"
echo ""

# Step 4: Check if Python dependencies are installed
echo -e "${YELLOW}Step 4: Checking Python dependencies...${NC}"
if ! python3 -c "import pandas, openpyxl, psycopg2" 2>/dev/null; then
    echo -e "${RED}❌ Error: Missing Python dependencies${NC}"
    echo "Run: pip3 install -r requirements.txt"
    exit 1
fi
echo -e "${GREEN}✅ Python dependencies installed${NC}"
echo ""

# Step 5: Test database connection
echo -e "${YELLOW}Step 5: Testing database connection...${NC}"
DB_TEST=$(python3 -c "
from etl.loaders.postgres_loader import test_connection
import sys
sys.exit(0 if test_connection() else 1)
" 2>&1)

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Error: Cannot connect to database${NC}"
    echo "$DB_TEST"
    exit 1
fi
echo -e "${GREEN}✅ Database connection successful${NC}"
echo ""

# Step 6: Check if tables exist
echo -e "${YELLOW}Step 6: Verifying database tables exist...${NC}"
TABLES_EXIST=$(PGPASSWORD='esDrh3qdxgydD1Ea' psql -h aws-0-us-east-1.pooler.supabase.com -p 6543 -U postgres.rqbvcvwbziilnycqtmnc -d postgres -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_name IN ('restaurant_location', 'restaurant_trend');" 2>&1)

if [[ ! "$TABLES_EXIST" =~ "2" ]]; then
    echo -e "${RED}❌ Error: Database tables not found${NC}"
    echo "Run: ./deploy-restaurant-migrations.sh"
    exit 1
fi
echo -e "${GREEN}✅ Database tables exist${NC}"
echo ""

# Step 7: Check if year already exists in database
echo -e "${YELLOW}Step 7: Checking if year $FULL_YEAR already exists...${NC}"
YEAR_EXISTS=$(PGPASSWORD='esDrh3qdxgydD1Ea' psql -h aws-0-us-east-1.pooler.supabase.com -p 6543 -U postgres.rqbvcvwbziilnycqtmnc -d postgres -t -c "SELECT COUNT(*) FROM restaurant_trend WHERE year = $FULL_YEAR;" 2>&1)

if [[ "$YEAR_EXISTS" =~ [1-9] ]]; then
    echo -e "${YELLOW}⚠️  Warning: Year $FULL_YEAR already has data (will be updated/merged)${NC}"
    read -p "Continue? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted by user"
        exit 0
    fi
else
    echo -e "${GREEN}✅ Year $FULL_YEAR is new (no existing data)${NC}"
fi
echo ""

# Step 8: Run the ETL process
echo -e "${YELLOW}Step 8: Running ETL process...${NC}"
echo "Command: python3 etl/etl_restaurant_trends.py --in \"$INPUT_FILE\" --out data/processed --load postgres"
echo ""

python3 etl/etl_restaurant_trends.py \
    --in "$INPUT_FILE" \
    --out data/processed \
    --load postgres

if [ $? -ne 0 ]; then
    echo ""
    echo -e "${RED}❌ ETL process failed${NC}"
    exit 1
fi
echo ""
echo -e "${GREEN}✅ ETL process completed successfully${NC}"
echo ""

# Step 9: Verify data was loaded
echo -e "${YELLOW}Step 9: Verifying data was loaded...${NC}"
RECORD_COUNT=$(PGPASSWORD='esDrh3qdxgydD1Ea' psql -h aws-0-us-east-1.pooler.supabase.com -p 6543 -U postgres.rqbvcvwbziilnycqtmnc -d postgres -t -c "SELECT COUNT(*) FROM restaurant_trend WHERE year = $FULL_YEAR;" 2>&1)

if [[ "$RECORD_COUNT" =~ ^[0-9]+$ ]] && [ "$RECORD_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✅ Data loaded successfully: $RECORD_COUNT records for year $FULL_YEAR${NC}"
else
    echo -e "${RED}❌ Error: No data found for year $FULL_YEAR${NC}"
    exit 1
fi
echo ""

# Step 10: Show summary
echo -e "${YELLOW}Step 10: Summary of all years in database...${NC}"
PGPASSWORD='esDrh3qdxgydD1Ea' psql -h aws-0-us-east-1.pooler.supabase.com -p 6543 -U postgres.rqbvcvwbziilnycqtmnc -d postgres -c "
SELECT
    year,
    COUNT(*) as records,
    COUNT(DISTINCT store_no) as unique_stores
FROM restaurant_trend
GROUP BY year
ORDER BY year;
"
echo ""

# Step 11: Ask about verified coordinates
echo -e "${YELLOW}Step 11: Import verified coordinates from Salesforce?${NC}"
echo "This adds more accurate GPS coordinates for ~184 locations."
read -p "Import verified coordinates? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    PGPASSWORD='esDrh3qdxgydD1Ea' psql -h aws-0-us-east-1.pooler.supabase.com -p 6543 -U postgres.rqbvcvwbziilnycqtmnc -d postgres -f supabase/migrations/20251105_import_salesforce_verified_coords.sql
    echo -e "${GREEN}✅ Verified coordinates imported${NC}"
else
    echo "Skipped verified coordinates import"
fi
echo ""

# Success!
echo "=============================================================================="
echo -e "${GREEN}🎉 SUCCESS! Annual data load completed${NC}"
echo "=============================================================================="
echo ""
echo "What was loaded:"
echo "  • Year: $FULL_YEAR"
echo "  • Records: $RECORD_COUNT trend records"
echo "  • File: $INPUT_FILE"
echo ""
echo "CSV files created in: data/processed/"
echo ""
echo "Next steps:"
echo "  • View data in your application"
echo "  • Run queries to analyze trends"
echo "  • Keep the Excel file for your records"
echo ""
echo "=============================================================================="
