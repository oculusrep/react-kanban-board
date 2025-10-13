#!/bin/bash

# Deploy Contact Roles Migrations
# This script runs the three migrations needed for the contact roles system

echo "================================================"
echo "Contact Roles System - Database Migration"
echo "================================================"
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

echo "Step 1: Running main contact roles migration..."
echo "This creates the tables, views, and indexes"
echo ""
psql "$DATABASE_URL" -f migrations/contact_roles_many_to_many.sql
if [ $? -ne 0 ]; then
    echo ""
    echo "ERROR: Main migration failed"
    exit 1
fi

echo ""
echo "Step 2: Running role list update migration..."
echo "This adds the specific roles you requested"
echo ""
psql "$DATABASE_URL" -f migrations/update_contact_roles.sql
if [ $? -ne 0 ]; then
    echo ""
    echo "WARNING: Role update migration had issues (this is OK if roles already exist)"
fi

echo ""
echo "Step 3: Running finalization migration..."
echo "This ensures only the 8 specified roles exist"
echo ""
psql "$DATABASE_URL" -f migrations/finalize_contact_roles.sql
if [ $? -ne 0 ]; then
    echo ""
    echo "ERROR: Finalization migration failed"
    exit 1
fi

echo ""
echo "================================================"
echo "✅ Migration Complete!"
echo "================================================"
echo ""
echo "Next steps:"
echo "1. Assign Site Selector roles to contacts for each client"
echo "2. Test sending a site submit email"
echo ""
echo "To assign roles, go to your app and:"
echo "  - Open a client sidebar"
echo "  - Find a contact"
echo "  - Click '+ Add Role'"
echo "  - Select 'Site Selector'"
echo ""
