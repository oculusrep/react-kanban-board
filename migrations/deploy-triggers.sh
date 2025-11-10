#!/bin/bash

# Deploy the creator/updater tracking triggers to Supabase

echo "Deploying creator and updater tracking triggers..."

npx supabase db push --db-url "postgresql://postgres:esDrh3qdxgydD1Ea@db.rqbvcvwbziilnycqtmnc.supabase.co:6543/postgres" --file migrations/add_update_triggers_for_audit_fields.sql

echo "Done! Triggers have been deployed."
echo ""
echo "To test, create a new activity and check if created_by_id is set."
