#!/bin/bash

# Deploy Restaurant Trends Migrations
# This script runs the two migrations needed for the Restaurant Trends ETL system

echo "========================================================"
echo "Restaurant Trends ETL - Database Migration"
echo "========================================================"
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "ERROR: DATABASE_URL environment variable is not set"
    echo ""
    echo "Please set it using:"
    echo "  export DATABASE_URL='your-postgres-connection-string'"
    echo ""
    echo "You can find your connection string in:"
    echo "  Supabase Dashboard > Project Settings > Database > Connection String"
    echo ""
    exit 1
fi

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "ERROR: psql command not found"
    echo "Please install PostgreSQL client tools"
    exit 1
fi

echo "Step 1: Creating restaurant_location and restaurant_trend tables..."
echo ""
psql "$DATABASE_URL" -f supabase/migrations/20251105_create_restaurant_tables.sql
if [ $? -ne 0 ]; then
    echo ""
    echo "ERROR: Table creation migration failed"
    exit 1
fi

echo ""
echo "Step 2: Importing verified coordinates from Salesforce..."
echo "(This step is optional and will skip if Salesforce table doesn't exist)"
echo ""
psql "$DATABASE_URL" -f supabase/migrations/20251105_import_salesforce_verified_coords.sql
if [ $? -ne 0 ]; then
    echo ""
    echo "WARNING: Salesforce import had issues (this is OK if Salesforce table doesn't exist yet)"
fi

echo ""
echo "========================================================"
echo "✅ Migration Complete!"
echo "========================================================"
echo ""
echo "Database tables created:"
echo "  - restaurant_location (static location data)"
echo "  - restaurant_trend (yearly trend data)"
echo ""
echo "Next steps:"
echo "1. Run the ETL script to process Excel files:"
echo "   python3 etl/etl_restaurant_trends.py \\"
echo "     --in 'Screen Shots/YE24 Oculus SG.xlsx' \\"
echo "     --out data/processed \\"
echo "     --load postgres"
echo ""
echo "2. Process additional years (YE15-YE23) as needed"
echo ""
