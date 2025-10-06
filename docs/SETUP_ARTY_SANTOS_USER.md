# Setting Up Arty Santos User Account

## Overview
This guide walks through creating a Supabase authentication account for Arty Santos that links to his existing Salesforce user record in OVIS.

## Background
- Arty Santos is a Salesforce user whose records were migrated to OVIS
- His user record exists in the `public.user` table with his Salesforce ID (`sf_id`)
- He needs a Supabase auth account to log in to OVIS
- The auth account will be linked to his user record via email matching

## Steps

### 1. Find Arty's User Information

Run the SQL query script to find Arty's email and details:

```bash
psql -f setup_arty_santos_user.sql
```

This will show you:
- All existing users from Salesforce
- Arty Santos' specific record (email, name, sf_id)
- Current Supabase auth users

### 2. Create Supabase Auth Account

**Option A: Via Supabase Dashboard (Recommended)**

1. Go to: https://supabase.com/dashboard/project/YOUR_PROJECT_ID/auth/users
2. Click **"Add user"** → **"Create new user"**
3. Enter Arty's email address (from the query results)
4. Choose one of:
   - **Set a temporary password** and send it to Arty
   - **Enable "Auto Confirm User"** if you want to skip email verification
5. Click **"Create user"**

**Option B: Via SQL (if you prefer)**

```sql
-- This requires admin privileges
-- Contact Supabase support or use the Dashboard instead
```

### 3. Send Credentials to Arty

**If you set a temporary password:**
1. Send Arty his login credentials
2. Tell him to visit: https://ovis.oculusrep.com
3. Have him log in with his email and the temporary password
4. Direct him to use "Forgot Password" to set his own password

**If you enabled auto-confirm:**
1. Send Arty a password reset link
2. He can set his own password immediately

### 4. Verify the Setup

After Arty's account is created, verify the linkage:

```sql
-- Check that auth user and public.user are linked by email
SELECT
  auth.email as auth_email,
  u.name as user_name,
  u.email as user_email,
  u.sf_id,
  u.id as user_id
FROM auth.users auth
LEFT JOIN "user" u ON u.email = auth.email
ORDER BY auth.created_at;
```

You should see both your account and Arty's account, with the `user_name` column populated.

### 5. Test Attribution

To verify "Last Updated By" and other user attribution works correctly:

1. Have Arty log in to OVIS
2. Have him edit a deal or property
3. Check that the "Last Updated By" field shows his name
4. The system should automatically:
   - Identify Arty by his email
   - Link to his `user.id` in the database
   - Display his name from the `user` table

## How It Works

### Email-Based Linking
- Supabase auth users are identified by `auth.users.email`
- Public user records have matching `user.email`
- App code joins these tables on email to get user details

### Salesforce Attribution
- When records were migrated, `updated_by_id` fields were populated
- These IDs point to `user.id` in the public.user table
- The `user` table has `sf_id` linking back to Salesforce users
- This preserves historical "who did what" information

### Example Query
```sql
-- See who last updated a deal
SELECT
  d.deal_name,
  d.updated_at,
  u.name as updated_by_name,
  u.email as updated_by_email
FROM deal d
LEFT JOIN "user" u ON d.updated_by_id = u.id
WHERE d.deal_id = 'some-deal-uuid';
```

## Troubleshooting

### Arty can't log in
- Verify the email in auth.users matches the email in public.user table
- Check if the account is confirmed (confirmed_at should not be null)
- Try sending a password reset email

### Attribution not showing correctly
- Check that `user.email` matches between auth and public tables
- Verify migrated records have `updated_by_id` populated
- Check that the app code is fetching user details correctly

### Email doesn't match
If the auth email differs from the user table email:
```sql
-- Update the user table email to match auth
UPDATE "user"
SET email = 'correct-email@example.com'
WHERE sf_id = 'ARTY_SALESFORCE_ID';
```

## Security Notes

- Never share database credentials
- Always use individual user accounts (no shared passwords)
- Arty should set his own password via the reset flow
- Enable MFA (multi-factor authentication) for admin accounts
