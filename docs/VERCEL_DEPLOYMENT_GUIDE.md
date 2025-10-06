# Vercel Deployment Guide - Production Testing Environment

## Overview

This guide covers deploying the React Kanban Board application to Vercel for production user testing. The application uses:
- **Frontend**: React + Vite + TailwindCSS
- **Backend**: Supabase (PostgreSQL + Auth)
- **File Storage**: Dropbox API
- **Maps**: Google Maps API

## Prerequisites

- [x] Vercel account (free tier works for testing)
- [x] Supabase project configured and migrated
- [x] Dropbox API credentials (app key, secret, tokens)
- [x] Google Maps API key
- [x] GitHub repository connected to Vercel

## Step 1: Prepare Environment Variables

Create a `.env.production` file locally to organize your variables (DO NOT commit to git):

```bash
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here

# Dropbox API Configuration
VITE_DROPBOX_ACCESS_TOKEN=your_access_token
VITE_DROPBOX_REFRESH_TOKEN=your_refresh_token
VITE_DROPBOX_APP_KEY=your_app_key
VITE_DROPBOX_APP_SECRET=your_app_secret

# Google Maps API (if using)
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_key
```

**⚠️ Security Notes**:
- All variables for Vite MUST be prefixed with `VITE_`
- Never commit tokens to git
- Dropbox access tokens expire every 4 hours (app handles auto-refresh)
- Use Supabase Row Level Security (RLS) to protect data

## Step 2: Configure Vercel Project

### Option A: Deploy via Vercel CLI

```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Deploy to production
vercel --prod
```

### Option B: Deploy via Vercel Dashboard

1. Go to https://vercel.com/new
2. Import your GitHub repository
3. Configure project settings:

**Framework Preset**: Vite
**Build Command**: `npm run build`
**Output Directory**: `dist`
**Install Command**: `npm install`

## Step 3: Add Environment Variables in Vercel

### Via Vercel Dashboard:

1. Go to **Project Settings** → **Environment Variables**
2. Add each variable from your `.env.production` file:
   - **Name**: `VITE_SUPABASE_URL`
   - **Value**: `https://your-project.supabase.co`
   - **Environment**: Production, Preview, Development (select all)
3. Repeat for all variables

### Via Vercel CLI:

```bash
# Add variables one by one
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production
vercel env add VITE_DROPBOX_ACCESS_TOKEN production
vercel env add VITE_DROPBOX_REFRESH_TOKEN production
vercel env add VITE_DROPBOX_APP_KEY production
vercel env add VITE_DROPBOX_APP_SECRET production
```

## Step 4: Configure Supabase for Production

### Update Supabase CORS Settings:

1. Go to **Supabase Dashboard** → **Settings** → **API**
2. Add your Vercel domain to allowed origins:
   ```
   https://your-app.vercel.app
   https://your-app-*.vercel.app  # For preview deployments
   ```

### Verify RLS Policies:

Ensure Row Level Security is enabled on all tables:

```sql
-- Check RLS status
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';

-- Enable RLS on all tables if needed
ALTER TABLE client ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal ENABLE ROW LEVEL SECURITY;
ALTER TABLE property ENABLE ROW LEVEL SECURITY;
-- ... repeat for all tables
```

## Step 5: Configure Dropbox OAuth Redirect

1. Go to **Dropbox App Console**: https://www.dropbox.com/developers/apps
2. Select your app
3. Under **OAuth 2** → **Redirect URIs**, add:
   ```
   https://your-app.vercel.app
   https://your-app.vercel.app/callback  # If using OAuth flow
   ```

## Step 6: Deploy and Verify

### Initial Deployment:

```bash
# Deploy to production
vercel --prod

# You'll receive a URL like: https://your-app.vercel.app
```

### Verify Deployment:

1. **Check build logs** in Vercel dashboard
2. **Test authentication** - Login with test user
3. **Verify Supabase connection** - Load client/deal data
4. **Test Dropbox integration** - Upload/view files
5. **Check console for errors** - Open browser DevTools

## Step 7: Production Testing Checklist

### Core Functionality:
- [ ] User authentication (Supabase Auth)
- [ ] Client CRUD operations
- [ ] Deal CRUD operations
- [ ] Property CRUD operations
- [ ] Contact management
- [ ] Note creation and viewing
- [ ] Task management
- [ ] File upload/download (Dropbox)
- [ ] Commission calculations
- [ ] Payment tracking
- [ ] Google Maps integration (if enabled)

### Performance Testing:
- [ ] Initial page load < 3 seconds
- [ ] Data fetching responsive
- [ ] File uploads working
- [ ] No console errors
- [ ] Mobile responsiveness

### Data Integrity:
- [ ] No duplicate records
- [ ] Relationships preserved (deals → clients)
- [ ] Commission percentages correct
- [ ] Payment sequences unique per deal
- [ ] Notes attached to correct entities

## Step 8: Monitoring and Debugging

### Vercel Analytics:

Enable Web Analytics in Vercel dashboard:
1. Go to **Project Settings** → **Analytics**
2. Enable **Web Analytics**
3. Monitor real user metrics

### Error Tracking:

Check Vercel deployment logs:
```bash
# View logs
vercel logs your-app.vercel.app
```

### Common Issues:

**Issue**: "Failed to fetch" errors
- **Cause**: CORS not configured in Supabase
- **Fix**: Add Vercel domain to Supabase allowed origins

**Issue**: Dropbox authentication fails
- **Cause**: Redirect URI mismatch
- **Fix**: Add Vercel URL to Dropbox OAuth settings

**Issue**: Environment variables not loading
- **Cause**: Missing `VITE_` prefix
- **Fix**: Prefix all env vars with `VITE_` and redeploy

**Issue**: Build fails with dependency errors
- **Cause**: Package version mismatch
- **Fix**: Delete `node_modules`, run `npm install`, commit `package-lock.json`

## Step 9: Preview Deployments (Staging)

Vercel automatically creates preview deployments for each git branch:

```bash
# Create feature branch
git checkout -b feature/new-feature

# Push to GitHub
git push origin feature/new-feature

# Vercel creates preview URL: https://your-app-git-feature-new-feature.vercel.app
```

**Use preview deployments for**:
- Testing new features before production
- Sharing with stakeholders for feedback
- QA testing without affecting production

## Step 10: Custom Domain (Optional)

### Add Custom Domain:

1. Go to **Project Settings** → **Domains**
2. Add your domain: `crm.yourdomain.com`
3. Update DNS records as instructed by Vercel
4. SSL certificate auto-configured

### Update CORS and OAuth:

After adding custom domain, update:
- Supabase CORS settings
- Dropbox OAuth redirect URIs
- Environment variables (if domain-specific)

## Rollback Strategy

If deployment has critical issues:

```bash
# List deployments
vercel ls

# Rollback to previous deployment
vercel rollback [deployment-url]
```

Or via dashboard:
1. Go to **Deployments**
2. Find previous working deployment
3. Click **"..."** → **Promote to Production**

## Production Maintenance

### Regular Tasks:

**Daily**:
- Monitor error logs in Vercel dashboard
- Check user feedback

**Weekly**:
- Review Supabase database size (free tier: 500MB)
- Refresh Dropbox access token if needed: `npm run dropbox:refresh`

**Monthly**:
- Review and optimize bundle size
- Update dependencies: `npm update`
- Check Vercel usage limits (free tier)

### Updating Environment Variables:

```bash
# Update single variable
vercel env rm VITE_DROPBOX_ACCESS_TOKEN production
vercel env add VITE_DROPBOX_ACCESS_TOKEN production

# Redeploy to apply changes
vercel --prod
```

## Cost Considerations

### Vercel Free Tier Limits:
- **Bandwidth**: 100GB/month
- **Build execution**: 100 hours/month
- **Deployments**: Unlimited
- **Team size**: 1 (Hobby plan)

### When to Upgrade:
- More than 100GB bandwidth/month
- Need team collaboration
- Custom deployment protections
- Advanced analytics

## Security Best Practices

1. **Never expose service keys**: Only use `VITE_SUPABASE_ANON_KEY`, never service_role key
2. **Enable RLS**: All Supabase tables must have Row Level Security
3. **Use HTTPS only**: Vercel enforces this automatically
4. **Rotate tokens**: Refresh Dropbox tokens regularly
5. **Audit access**: Review Supabase auth logs periodically

## Support and Resources

- **Vercel Documentation**: https://vercel.com/docs
- **Vite Deployment**: https://vitejs.dev/guide/static-deploy.html
- **Supabase CORS**: https://supabase.com/docs/guides/api/cors
- **Dropbox OAuth**: https://developers.dropbox.com/oauth-guide

## Troubleshooting Commands

```bash
# Local production build test
npm run build
npm run preview

# Check environment variables
vercel env ls

# View deployment logs
vercel logs

# Force redeploy
vercel --prod --force

# Remove deployment
vercel remove [deployment-name]
```

---

## Quick Deployment Checklist

- [ ] Environment variables added to Vercel
- [ ] Supabase CORS configured for Vercel domain
- [ ] Dropbox OAuth redirects include Vercel URL
- [ ] Database migration completed successfully
- [ ] Build succeeds locally (`npm run build`)
- [ ] All tests passing
- [ ] Production deployment completed
- [ ] Authentication working
- [ ] Data loading correctly
- [ ] File uploads working
- [ ] No console errors
- [ ] Mobile responsive
- [ ] Share URL with test users
- [ ] Collect feedback
- [ ] Monitor error logs

---

**Status**: Ready for production testing deployment
**Last Updated**: October 2025
