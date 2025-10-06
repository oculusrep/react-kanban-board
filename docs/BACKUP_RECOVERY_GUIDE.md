# OVIS Backup & Recovery Guide

## Overview

This guide covers backup and recovery strategies for both **code** and **database** to ensure you can always revert to a working state.

---

## Code Backups (Automatic)

### Where Your Code is Backed Up

✅ **GitHub** (Primary - Automatic)
- Every `git push` creates a backup
- Infinite version history
- Enterprise-grade redundancy

✅ **Vercel** (Secondary - Automatic)
- Every deployment is saved
- Can rollback instantly
- Kept indefinitely

✅ **Local Git** (Tertiary - Automatic)
- Every commit saved locally
- Works offline

---

## Code Recovery Scenarios

### Scenario 1: Undo Local Changes (Not Committed)

```bash
# Discard all uncommitted changes
git checkout .

# Discard changes to specific file
git checkout src/components/ClientForm.tsx

# See what changed
git status
git diff
```

### Scenario 2: Undo Last Commit (Not Pushed)

```bash
# Keep changes, undo commit
git reset --soft HEAD~1

# Discard changes AND commit
git reset --hard HEAD~1

# Undo last 3 commits
git reset --hard HEAD~3
```

### Scenario 3: Revert Bad Code in Production

**Method A: Git Revert (Recommended)**
```bash
# Find the bad commit
git log --oneline

# Revert it (creates new commit that undoes changes)
git revert abc123

# Push to trigger auto-deploy
git push origin main
```

**Method B: Vercel Rollback (Fastest)**
```bash
# Via CLI
vercel ls                    # List deployments
vercel rollback [url]        # Rollback to specific deployment

# Via Dashboard
# 1. Go to vercel.com → Project → Deployments
# 2. Find last working deployment
# 3. Click "..." → "Promote to Production"
# ⏱️ Takes 30 seconds
```

**Method C: Force Reset (Nuclear Option)**
```bash
# ⚠️ WARNING: This rewrites history!
# Only use if you're the only developer

# Find the good commit
git log --oneline

# Reset to that commit
git reset --hard abc123

# Force push (overwrites remote)
git push --force origin main
```

### Scenario 4: Complete Disaster Recovery

```bash
# Your local copy is broken? Clone fresh from GitHub
git clone https://github.com/yourusername/ovis.git
cd ovis
npm install
npm run dev

# ✅ Your code is safe on GitHub!
```

---

## Database Backups (Manual Required)

### Supabase Backup Tiers

| Tier | Auto Backups | Point-in-Time Recovery | Cost |
|------|--------------|------------------------|------|
| Free | ❌ None | ❌ None | $0 |
| Pro | ✅ Daily (7 days) | ✅ Available | $25/mo |
| Team | ✅ Daily (14 days) | ✅ Available | $599/mo |

**Free Tier Users**: You must create manual backups (see below)

---

## Creating Database Backups

### Setup: Get Database Connection String

1. Go to **Supabase Dashboard** → **Settings** → **Database**
2. Copy **Connection String** (choose "URI" format)
3. Add to your `.env` file:
   ```bash
   SUPABASE_DB_URL=postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres
   ```

### Method 1: Automated Script (Recommended)

```bash
# Set environment variable (add to .env)
export SUPABASE_DB_URL="your-connection-string"

# Run backup
./scripts/backup-database.sh

# Creates: ./backups/database/ovis_backup_20251006_120000.sql.gz
```

**Add to your workflow**:
```bash
# Backup before major changes
./scripts/backup-database.sh
git commit -m "Added new feature"
git push
```

### Method 2: Manual Backup

```bash
# Install PostgreSQL tools (if not installed)
# macOS: brew install postgresql
# Ubuntu: sudo apt-get install postgresql-client

# Create backup
pg_dump "your-supabase-connection-string" > backup.sql

# Compress it
gzip backup.sql

# Creates: backup.sql.gz
```

### Method 3: Supabase Dashboard Export

1. Go to **Supabase Dashboard** → **Database** → **Backups**
2. Click **"Download Backup"** (if on Pro plan)
3. Or use **SQL Editor** to export tables:
   ```sql
   -- Export all data as CSV
   COPY client TO STDOUT WITH CSV HEADER;
   COPY deal TO STDOUT WITH CSV HEADER;
   -- Repeat for each table
   ```

---

## Restoring Database Backups

### Restore from Automated Backup

```bash
# List available backups
ls -lh ./backups/database/

# Run restore script
./scripts/restore-database.sh

# Follow prompts:
# - Select backup file
# - Confirm restore (⚠️ overwrites current data)
```

### Manual Restore

```bash
# Decompress backup
gunzip backup.sql.gz

# Restore to database
psql "your-supabase-connection-string" < backup.sql

# ✅ Database restored
```

### Restore Specific Tables Only

```bash
# Extract specific table from backup
pg_restore -t client backup.sql | psql "connection-string"
pg_restore -t deal backup.sql | psql "connection-string"
```

---

## Recommended Backup Schedule

### Development Phase (Current)
- **Code**: Auto-backed up with every `git push`
- **Database**: Manual backup before major changes
  ```bash
  # Before running migrations
  ./scripts/backup-database.sh
  npm run migrate
  ```

### Production Phase (After Launch)
- **Code**: Auto-backed up with every `git push`
- **Database**:
  - **Option 1**: Upgrade to Supabase Pro ($25/mo) for daily auto-backups
  - **Option 2**: Set up cron job for daily backups:
    ```bash
    # Add to crontab (runs daily at 2 AM)
    0 2 * * * /path/to/scripts/backup-database.sh
    ```

---

## Backup Storage

### Where to Store Backups

**Option 1: Local Storage** (Current scripts)
- Stored in `./backups/database/`
- Easy to access
- ⚠️ Only safe if you have offsite backup (e.g., Time Machine, iCloud)

**Option 2: Cloud Storage** (Recommended for Production)
```bash
# Add to backup script to upload to cloud
# Example: Upload to Dropbox
./scripts/backup-database.sh
cp ./backups/database/latest.sql.gz ~/Dropbox/OVIS-Backups/

# Or use AWS S3, Google Drive, etc.
```

**Option 3: GitHub** (Not Recommended)
- ❌ Don't commit database backups to git
- Too large, contains sensitive data
- Use .gitignore:
  ```
  backups/
  *.sql
  *.sql.gz
  ```

---

## Testing Your Backups

⚠️ **Critical**: Backups are worthless if they don't work!

### Monthly Backup Test

```bash
# 1. Create a test backup
./scripts/backup-database.sh

# 2. Create a test database (Supabase free project)
# Go to supabase.com → New Project → "ovis-test"

# 3. Restore to test database
export SUPABASE_DB_URL="test-database-connection-string"
./scripts/restore-database.sh

# 4. Verify data looks correct
# - Connect to test database
# - Run queries to check data
# - Test application against test database

# 5. Delete test project when done
```

---

## Recovery Time Estimates

| Scenario | Recovery Time | Steps |
|----------|---------------|-------|
| Undo local changes | 10 seconds | `git checkout .` |
| Rollback deployment | 30 seconds | Vercel dashboard rollback |
| Revert code commit | 2 minutes | `git revert` + push |
| Restore database | 5-15 minutes | Run restore script |
| Complete disaster recovery | 30-60 minutes | Clone repo + restore DB |

---

## Emergency Recovery Checklist

### Code is Broken in Production

- [ ] Check Vercel deployment logs: `vercel logs`
- [ ] Identify last working deployment
- [ ] Rollback via Vercel dashboard (fastest)
- [ ] OR revert git commit and push
- [ ] Verify production site works
- [ ] Fix bug locally, test, then redeploy

### Database is Corrupted

- [ ] STOP all writes to database immediately
- [ ] Identify last good backup
- [ ] Test restore on staging database first
- [ ] If test successful, restore to production
- [ ] Verify data integrity
- [ ] Resume operations

### Both Code AND Database Broken

- [ ] Stay calm ☕
- [ ] Restore database from backup
- [ ] Clone fresh code from GitHub
- [ ] Deploy to Vercel
- [ ] Verify everything works
- [ ] Document what went wrong

---

## Automation Options

### GitHub Actions (Auto-backup on Schedule)

Create `.github/workflows/backup-database.yml`:

```yaml
name: Database Backup
on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM UTC
  workflow_dispatch:  # Manual trigger

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Install PostgreSQL
        run: sudo apt-get install postgresql-client
      - name: Create Backup
        env:
          SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}
        run: |
          ./scripts/backup-database.sh
      - name: Upload to Artifact
        uses: actions/upload-artifact@v3
        with:
          name: database-backup
          path: ./backups/database/*.sql.gz
          retention-days: 30
```

**Setup**:
1. Add `SUPABASE_DB_URL` to GitHub Secrets
2. Commit workflow file
3. Backups run automatically and stored in GitHub

---

## Best Practices

### Do's ✅
- ✅ Test backups monthly
- ✅ Backup before major changes
- ✅ Keep backups offsite (cloud storage)
- ✅ Use git branches for risky changes
- ✅ Verify restore works before disaster strikes
- ✅ Document your backup process

### Don'ts ❌
- ❌ Don't commit database backups to git
- ❌ Don't skip backups because "nothing will go wrong"
- ❌ Don't delete old backups without testing new ones
- ❌ Don't give database backups public access (sensitive data)
- ❌ Don't assume Supabase free tier has backups (it doesn't)

---

## Quick Reference Commands

```bash
# Code: Undo local changes
git checkout .

# Code: Revert production
vercel rollback [deployment-url]

# Database: Create backup
./scripts/backup-database.sh

# Database: Restore backup
./scripts/restore-database.sh

# View backup history
ls -lh ./backups/database/

# Test backup integrity
gunzip -t backup.sql.gz  # No output = good
```

---

## When to Upgrade to Paid Backups

Consider **Supabase Pro** ($25/mo) when:
- ✅ You have real users (not just testing)
- ✅ Data loss would be critical
- ✅ You can't run daily manual backups
- ✅ You need point-in-time recovery
- ✅ Peace of mind is worth $25/mo

**Pro Tier Includes**:
- Daily automatic backups (7 days retention)
- Point-in-time recovery
- 8GB database (vs 500MB free)
- Better performance
- Email support

---

## Support Resources

- **Git Recovery**: https://dangitgit.com/
- **Vercel Rollbacks**: https://vercel.com/docs/deployments/rollbacks
- **Supabase Backups**: https://supabase.com/docs/guides/platform/backups
- **PostgreSQL Backup**: https://www.postgresql.org/docs/current/backup.html

---

**Last Updated**: October 2025
**Status**: Production Ready
