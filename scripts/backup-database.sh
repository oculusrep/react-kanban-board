#!/bin/bash
# Database Backup Script for OVIS
# Creates a timestamped SQL dump of your Supabase database

# Configuration
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="./backups/database"
BACKUP_FILE="ovis_backup_${TIMESTAMP}.sql"

# Get database URL from environment
if [ -z "$SUPABASE_DB_URL" ]; then
    echo "Error: SUPABASE_DB_URL not set"
    echo "Get connection string from: Supabase Dashboard → Settings → Database → Connection String"
    exit 1
fi

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Create SQL dump
echo "Creating database backup: $BACKUP_FILE"
pg_dump "$SUPABASE_DB_URL" > "$BACKUP_DIR/$BACKUP_FILE"

# Compress the backup
gzip "$BACKUP_DIR/$BACKUP_FILE"

echo "✅ Backup completed: $BACKUP_DIR/$BACKUP_FILE.gz"
echo "💾 Backup size: $(du -h "$BACKUP_DIR/$BACKUP_FILE.gz" | cut -f1)"

# Optional: Keep only last 30 days of backups
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +30 -delete
echo "🗑️  Cleaned up backups older than 30 days"
