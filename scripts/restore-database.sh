#!/bin/bash
# Database Restore Script for OVIS
# Restores a SQL dump to your Supabase database

# Configuration
BACKUP_DIR="./backups/database"

# Get database URL from environment
if [ -z "$SUPABASE_DB_URL" ]; then
    echo "Error: SUPABASE_DB_URL not set"
    echo "Get connection string from: Supabase Dashboard → Settings → Database → Connection String"
    exit 1
fi

# List available backups
echo "📦 Available backups:"
ls -lh "$BACKUP_DIR"/*.sql.gz 2>/dev/null || echo "No backups found in $BACKUP_DIR"

# Prompt for backup file
echo ""
read -p "Enter backup filename (e.g., ovis_backup_20251006_120000.sql.gz): " BACKUP_FILE

if [ ! -f "$BACKUP_DIR/$BACKUP_FILE" ]; then
    echo "❌ Backup file not found: $BACKUP_DIR/$BACKUP_FILE"
    exit 1
fi

# Confirm restore
echo ""
echo "⚠️  WARNING: This will OVERWRITE your current database!"
read -p "Are you sure you want to restore from $BACKUP_FILE? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "❌ Restore cancelled"
    exit 0
fi

# Decompress and restore
echo "📤 Decompressing backup..."
gunzip -c "$BACKUP_DIR/$BACKUP_FILE" > /tmp/restore_temp.sql

echo "🔄 Restoring database..."
psql "$SUPABASE_DB_URL" < /tmp/restore_temp.sql

# Clean up
rm /tmp/restore_temp.sql

echo "✅ Database restored from $BACKUP_FILE"
