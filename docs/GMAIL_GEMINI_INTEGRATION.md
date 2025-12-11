# Gmail + Gemini AI Email Integration

## Overview

This integration allows OVIS CRM to:
1. Connect Gmail accounts via OAuth 2.0
2. Sync emails from Gmail (INBOX, SENT, and custom labels)
3. Store emails in Supabase database
4. Use Gemini AI to automatically tag emails to CRM objects (Contacts, Clients, Deals, Properties)
5. Generate AI-powered deal synopses based on email activity

## Architecture

### Database Tables (Supabase)

- `gmail_connection` - Stores OAuth tokens and sync state per user
- `emails` - Stores synced email content
- `email_visibility` - Links emails to users who can see them
- `email_object_tag` - Links emails to CRM objects (contacts, clients, deals, properties)
- `unmatched_email_queue` - Queue for emails that need manual contact matching

### Edge Functions (Supabase)

| Function | Purpose |
|----------|---------|
| `gmail-connect` | Initiates OAuth flow, returns Google auth URL |
| `gmail-callback` | Handles OAuth callback, exchanges code for tokens |
| `gmail-disconnect` | Revokes tokens and marks connection inactive |
| `gmail-sync` | Syncs emails from Gmail API (manual or CRON triggered) |
| `email-triage` | AI-powered email classification and tagging |
| `email-correction` | Allows users to correct AI tag mistakes |
| `deal-synopsis` | Generates AI summaries of deal email activity |

### Frontend Components

- `GmailSettingsPage.tsx` - Admin UI for managing Gmail connections

## Setup Requirements

### Google Cloud Console

1. Create a project at https://console.cloud.google.com/
2. Enable the Gmail API
3. Configure OAuth consent screen:
   - Add `gmail.readonly` to **Restricted Scopes** (CRITICAL!)
   - Add test users if in Testing mode
4. Create OAuth 2.0 credentials (Web application type)
5. Set authorized redirect URI to: `https://YOUR_SUPABASE_PROJECT.supabase.co/functions/v1/gmail-callback`

### Environment Variables (Supabase)

```
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=https://YOUR_PROJECT.supabase.co/functions/v1/gmail-callback
FRONTEND_URL=https://your-frontend-url.com
GEMINI_API_KEY=your_gemini_api_key
```

## Key Implementation Details

### OAuth Scopes

**IMPORTANT**: Only request `gmail.readonly` - do NOT include `gmail.metadata` in the same request.

```typescript
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');
```

The `gmail.readonly` scope is a superset of `gmail.metadata`. Requesting both causes Google's Granular Consent to potentially only grant the lesser scope, resulting in 403 errors when trying to fetch full message content.

### Sync Types

1. **Incremental Sync**: Uses Gmail History API to fetch only new messages since last sync
2. **Full Sync**: Fetches the most recent 50 messages (used on first sync or when history ID expires)
3. **Force Full Sync**: UI button to re-fetch latest 50 messages regardless of history

### Token Refresh

The system automatically refreshes expired OAuth tokens using the stored refresh_token before each sync operation.

### Email Deduplication

Emails are identified by their Gmail `message_id`. If an email already exists in the database (e.g., synced by another user), we only create an `email_visibility` record for the new user rather than duplicating the email content.

## Troubleshooting

### "Metadata scope doesn't allow format FULL" (403 Error)

**Cause**: The OAuth token was granted with only `gmail.metadata` scope instead of `gmail.readonly`.

**Solution**:
1. Remove `gmail.metadata` from the scopes list in `gmail-connect`
2. Add `gmail.readonly` to Google Cloud Console OAuth consent screen under "Restricted Scopes"
3. Delete the existing connection from the database
4. Have the user revoke app access at https://myaccount.google.com/permissions
5. Reconnect and approve all permissions

### No emails syncing (0 results)

**Cause**: Incremental sync returning 0 messages because no new emails since last sync.

**Solution**: Use "Full Sync" button to force a re-fetch of recent emails.

### Connection shows as "Error"

Check the `sync_error` field in the `gmail_connection` table for details about what failed.

## Google Workspace Considerations

For Google Workspace (business) accounts like `@oculusrep.com`:

1. The organization's Google Admin settings may block restricted scopes
2. You may need to whitelist the app in Google Admin Console:
   - Go to admin.google.com
   - Security → Access and data control → API controls
   - Manage Third-Party App Access
   - Find your app and set it to "Trusted"

## Development History (Dec 11, 2025)

### Issues Encountered & Fixed

1. **0 emails synced** - Discovered incremental sync was working correctly (no new emails), added Force Full Sync option

2. **403 scope error** - Root cause was requesting both `gmail.readonly` AND `gmail.metadata` scopes. Google's Granular Consent engine was only granting `gmail.metadata` when both were requested. Fixed by removing `gmail.metadata` from the scopes list.

3. **Buttons overflow on small screens** - Made action buttons smaller and added flex-wrap

### Key Learnings

- `gmail.readonly` is a "super scope" that includes `gmail.metadata` - never request both
- Google Workspace security policies can silently downgrade scope grants
- Always check the `scope` field in the token response to verify what was actually granted
- The OAuth consent screen in Google Cloud Console must explicitly list restricted scopes

## Future Enhancements

1. CRON job for automatic periodic sync (currently available but needs scheduling)
2. Webhook-based real-time sync using Gmail Push Notifications
3. Email thread grouping and display
4. Bulk email operations (tag multiple emails at once)
5. Email search functionality
