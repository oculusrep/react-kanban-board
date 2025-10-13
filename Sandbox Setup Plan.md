# Sandbox Setup Plan - Local Supabase Development

**Purpose:** Set up a local development database that mirrors production, allowing safe testing without risking production data.

**Cost:** FREE (requires Docker)

**Time Required:** ~30-45 minutes for initial setup

---

## Prerequisites

Before we begin, ensure you have:
- [ ] Admin access to your computer (to install software)
- [ ] At least 4GB of free disk space
- [ ] Stable internet connection for initial downloads

---

## Phase 1: Install Required Software

### Step 1: Install Docker Desktop

**What is Docker?**
Docker runs containers (isolated environments) on your computer. Supabase uses Docker to run a local PostgreSQL database, API, and all services.

**Installation:**

**For Mac:**
1. Go to https://www.docker.com/products/docker-desktop
2. Download Docker Desktop for Mac (Intel or Apple Silicon - check your Mac chip)
3. Open the downloaded `.dmg` file
4. Drag Docker to Applications folder
5. Open Docker Desktop from Applications
6. Follow the setup wizard
7. Verify installation: Open Terminal and run:
   ```bash
   docker --version
   ```
   You should see something like: `Docker version 24.0.x`

**For Windows:**
1. Go to https://www.docker.com/products/docker-desktop
2. Download Docker Desktop for Windows
3. Run the installer
4. Restart your computer when prompted
5. Open Docker Desktop
6. Verify installation: Open PowerShell and run:
   ```bash
   docker --version
   ```

**For Linux:**
1. Follow instructions at: https://docs.docker.com/engine/install/
2. Verify installation:
   ```bash
   docker --version
   ```

---

### Step 2: Install Supabase CLI

**What is Supabase CLI?**
Command-line tool for managing local Supabase projects and syncing with production.

**Installation:**

**For Mac (using Homebrew - recommended):**
```bash
brew install supabase/tap/supabase
```

If you don't have Homebrew, install it first:
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

**Alternative for Mac/Linux (using npm):**
```bash
npm install -g supabase
```

**For Windows (using npm):**
```bash
npm install -g supabase
```

**Verify installation:**
```bash
supabase --version
```
You should see version number like: `1.x.x`

---

## Phase 2: Initialize Local Supabase Project

### Step 3: Navigate to Your Project
```bash
cd /workspaces/react-kanban-board
```

### Step 4: Initialize Supabase
```bash
supabase init
```

**What this does:**
- Creates a `supabase/` folder in your project
- Sets up configuration files
- Prepares your project for local development

**Expected output:**
```
✔ Port for Supabase URL: · 54321
✔ Port for PostgreSQL database: · 54322
Finished supabase init.
```

---

## Phase 3: Start Local Supabase

### Step 5: Start Local Services
```bash
supabase start
```

**What this does:**
- Downloads Docker images (first time only - may take 5-10 minutes)
- Starts local PostgreSQL database
- Starts local Supabase Studio (UI dashboard)
- Starts local Auth, Storage, and API services

**Expected output:**
```
Started supabase local development setup.

         API URL: http://localhost:54321
          DB URL: postgresql://postgres:postgres@localhost:54322/postgres
      Studio URL: http://localhost:54323
    Inbucket URL: http://localhost:54324
      JWT secret: super-secret-jwt-token-with-at-least-32-characters-long
        anon key: eyJhbGc...
service_role key: eyJhbGc...
```

**IMPORTANT:** Save these credentials somewhere safe!

---

## Phase 4: Configure Your App for Local Development

### Step 6: Create Local Environment File

Create a new file: `.env.local`

```bash
# Local Supabase Configuration (for development)
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=<anon key from supabase start output>
```

**How to use:**
- When developing locally, copy `.env.local` to `.env`
- When deploying to production, use your production `.env` with production credentials
- NEVER commit `.env` to git (already in .gitignore)

---

## Phase 5: Seed Local Database with Production Data

### Step 7: Download Production Backup

1. Go to Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Navigate to: **Database > Backups > Scheduled backups**
4. Click **"Download"** on the most recent backup
5. Save the file (it will be named something like `backup-2025-10-13.sql.gz`)
6. Move it to your project folder

### Step 8: Extract the Backup
```bash
# If file is .gz compressed
gunzip backup-2025-10-13.sql.gz

# This creates: backup-2025-10-13.sql
```

### Step 9: Restore to Local Database
```bash
# Connect to local database and restore
psql postgresql://postgres:postgres@localhost:54322/postgres < backup-2025-10-13.sql
```

**Alternative method using Supabase CLI:**
```bash
supabase db reset --db-url postgresql://postgres:postgres@localhost:54322/postgres
# Then apply your backup
```

---

## Phase 6: Verify Everything Works

### Step 10: Access Local Supabase Studio
1. Open browser to: http://localhost:54323
2. You should see Supabase Studio (like your production dashboard)
3. Check that your tables have data from production

### Step 11: Test Your App Locally
1. Make sure `.env` is pointing to local Supabase:
   ```bash
   cp .env.local .env
   ```

2. Start your development server:
   ```bash
   npm run dev
   ```

3. Open your app and verify:
   - You can log in
   - Data loads (clients, properties, site submits)
   - Everything works as expected

---

## Daily Development Workflow

### Starting Your Day:
```bash
# 1. Make sure Docker is running (check Docker Desktop app)

# 2. Start Supabase (if not already running)
supabase start

# 3. Start your dev server
npm run dev
```

### Stopping Services:
```bash
# Stop Supabase (frees up memory)
supabase stop

# Docker will keep running in background (that's fine)
```

### Getting Fresh Production Data:
```bash
# 1. Download latest backup from Supabase dashboard
# 2. Extract and restore (see Phase 5)
```

### Switching Back to Production:
```bash
# Copy production credentials back
cp .env.production .env

# Or manually edit .env to use production URLs
```

---

## Troubleshooting

### Docker Issues
**Problem:** "Cannot connect to Docker daemon"
**Solution:**
- Make sure Docker Desktop is running
- Try restarting Docker Desktop

**Problem:** "Port already in use"
**Solution:**
```bash
supabase stop
# Wait 10 seconds
supabase start
```

### Database Issues
**Problem:** "Connection refused to localhost:54322"
**Solution:**
```bash
supabase stop
docker ps -a  # Check if containers are running
supabase start
```

### App Issues
**Problem:** "Invalid API key"
**Solution:**
- Check that `.env` has the correct `anon key` from `supabase start` output
- Restart your dev server after changing `.env`

---

## Benefits of This Setup

✅ **Safety:** Can't accidentally delete production data
✅ **Speed:** No network latency, everything runs locally
✅ **Cost:** Completely FREE
✅ **Flexibility:** Reset/destroy database anytime
✅ **Offline:** Can develop without internet (after initial setup)
✅ **Testing:** Test migrations, bulk deletes, schema changes safely

---

## Important Notes

1. **Local data is temporary** - treat it as disposable
2. **Refresh data weekly** - download new production backups regularly
3. **Keep production .env safe** - store it separately so you can switch back
4. **Docker uses resources** - stop Supabase when not developing to free memory
5. **Migrations** - test all database changes locally first before applying to production

---

## Migration Workflow (Bonus)

When you need to change the database schema:

```bash
# 1. Make changes in local Supabase Studio
# 2. Generate migration file
supabase db diff -f migration_name

# 3. Test migration locally
supabase db reset

# 4. If it works, apply to production
supabase db push --db-url "your_production_url"
```

---

## Next Steps After Setup

Once this is working, we can:
- [ ] Set up automated migration workflows
- [ ] Create seed data scripts for common test scenarios
- [ ] Configure pre-commit hooks to test locally before pushing
- [ ] Set up automated backup downloads

---

## Questions to Answer During Setup

1. Did Docker Desktop install successfully?
2. Can you run `supabase start` without errors?
3. Can you access http://localhost:54323 and see Supabase Studio?
4. Does your app connect to local database successfully?
5. Can you see production data in local database?

---

## Estimated Time Breakdown

- Install Docker: 10-15 minutes
- Install Supabase CLI: 2-3 minutes
- Initialize project: 1 minute
- First `supabase start` (downloads images): 5-10 minutes
- Configure app: 5 minutes
- Download and restore production data: 5-10 minutes
- Testing and verification: 5 minutes

**Total: ~30-45 minutes**

---

## When You're Ready

Ping me and say "Let's set up the sandbox" and we'll walk through this document step by step. I'll be here to help with any issues that come up!

---

**Document created:** October 13, 2025
**Last updated:** October 13, 2025
**Status:** Ready for implementation
