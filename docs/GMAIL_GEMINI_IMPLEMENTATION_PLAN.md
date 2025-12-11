# Gmail + Gemini Email Integration - Implementation Plan

## Overview

This document outlines the implementation plan for integrating Gmail email ingestion with Gemini AI-powered tagging into the OVIS CRM system.

### Goals
1. Automatically sync emails from connected Gmail accounts
2. Use AI to tag emails to CRM objects (Clients, Contacts, Deals, Properties)
3. Generate AI-powered Deal synopses from email + activity history
4. Provide a self-correcting feedback loop to improve AI accuracy over time

### Tech Stack
- **Backend**: Supabase Edge Functions (TypeScript/Deno)
- **Database**: PostgreSQL (Supabase)
- **Email API**: Gmail API (REST)
- **AI**: Google Gemini 1.5 Flash (tagging) + Gemini 1.5 Pro (synopsis)
- **Auth**: OAuth 2.0 per-user (similar to QuickBooks integration)

---

## Phase 1: Google Cloud Setup

### 1.1 Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" → "New Project"
3. Name: `ovis-crm-gmail` (or similar)
4. Click "Create"

### 1.2 Enable Required APIs

In the Google Cloud Console:

1. Navigate to "APIs & Services" → "Library"
2. Search and enable:
   - **Gmail API** - for email access
   - **Generative Language API** (Gemini) - for AI features

### 1.3 Configure OAuth Consent Screen

1. Go to "APIs & Services" → "OAuth consent screen"
2. Select "External" (or "Internal" if using Google Workspace)
3. Fill in required fields:
   - App name: `OVIS CRM`
   - User support email: your email
   - Developer contact: your email
4. Add scopes:
   - `https://www.googleapis.com/auth/gmail.readonly` - Read emails
   - `https://www.googleapis.com/auth/gmail.metadata` - Read metadata
5. Add test users (your email, Arty's email)
6. Save

### 1.4 Create OAuth 2.0 Credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. Application type: "Web application"
4. Name: `OVIS CRM Gmail Integration`
5. Authorized redirect URIs:
   - Development: `http://localhost:54321/functions/v1/gmail-callback`
   - Production: `https://<your-project>.supabase.co/functions/v1/gmail-callback`
6. Click "Create"
7. Save the **Client ID** and **Client Secret**

### 1.5 Create Gemini API Key

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Click "Create API Key"
3. Select your project (`ovis-crm-gmail`)
4. Copy and save the API key

### 1.6 Environment Variables

Add to Supabase project secrets:

```bash
# Gmail OAuth
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=https://<your-project>.supabase.co/functions/v1/gmail-callback

# Gemini AI
GEMINI_API_KEY=your_gemini_api_key
```

---

## Phase 2: Database Schema

### 2.1 New Tables

```sql
-- Gmail OAuth connections (per-user)
CREATE TABLE gmail_connection (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    google_email VARCHAR(255) NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_expires_at TIMESTAMPTZ NOT NULL,
    last_history_id VARCHAR(50),  -- Gmail sync cursor
    last_sync_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id),
    UNIQUE(google_email)
);

-- Email content (deduplicated - stored once per unique email)
CREATE TABLE emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id VARCHAR(255) UNIQUE NOT NULL,  -- Gmail Message-ID header
    gmail_id VARCHAR(50) NOT NULL,            -- Gmail's internal ID
    thread_id VARCHAR(50),                    -- Gmail Thread ID
    in_reply_to VARCHAR(255),                 -- Parent Message-ID
    references_header TEXT,                   -- Full conversation chain
    direction VARCHAR(10) NOT NULL,           -- 'INBOUND' or 'OUTBOUND'
    subject TEXT,
    body_text TEXT,                           -- Plain text body
    body_html TEXT,                           -- HTML body (optional)
    snippet TEXT,                             -- First 200 chars
    sender_email VARCHAR(255) NOT NULL,
    sender_name VARCHAR(255),
    recipient_list JSONB,                     -- Array of {email, name, type: to/cc/bcc}
    received_at TIMESTAMPTZ NOT NULL,
    ai_processed BOOLEAN DEFAULT false,
    ai_processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User visibility to emails (links users to emails they can see)
CREATE TABLE email_visibility (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    gmail_connection_id UUID REFERENCES gmail_connection(id) ON DELETE SET NULL,
    folder_label VARCHAR(50),                 -- 'INBOX' or 'SENT'
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(email_id, user_id)
);

-- Email to CRM object links (many-to-many)
CREATE TABLE email_object_link (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    object_type VARCHAR(50) NOT NULL,         -- 'contact', 'client', 'deal', 'property'
    object_id UUID NOT NULL,
    link_source VARCHAR(50) NOT NULL,         -- 'email_match', 'ai_tag', 'manual'
    confidence_score NUMERIC(3,2),            -- AI confidence (0.00-1.00)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by_user_id UUID REFERENCES "user"(id),
    UNIQUE(email_id, object_type, object_id)
);

-- AI correction logs (for self-correcting feedback loop)
CREATE TABLE ai_correction_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "user"(id),
    email_id UUID REFERENCES emails(id) ON DELETE SET NULL,
    correction_type VARCHAR(50) NOT NULL,     -- 'removed_tag', 'added_tag', 'wrong_object'
    object_type VARCHAR(50),                  -- 'contact', 'client', 'deal', 'property'
    incorrect_object_id UUID,                 -- What AI suggested (if removing)
    correct_object_id UUID,                   -- What user selected (if adding)
    email_snippet TEXT,                       -- Context for learning
    sender_email VARCHAR(255),
    reasoning_hint TEXT,                      -- User's explanation (optional)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unmatched emails queue (business-relevant but no contact match)
CREATE TABLE unmatched_email_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    gmail_connection_id UUID REFERENCES gmail_connection(id) ON DELETE SET NULL,
    sender_email VARCHAR(255) NOT NULL,
    sender_name VARCHAR(255),
    subject TEXT,
    snippet TEXT,
    received_at TIMESTAMPTZ NOT NULL,
    -- AI-extracted suggestions
    suggested_contact_name VARCHAR(255),
    suggested_company VARCHAR(255),
    matched_object_type VARCHAR(50),          -- What CRM object was referenced
    matched_object_id UUID,
    matched_object_name VARCHAR(255),         -- For display
    match_reason TEXT,                        -- Why AI thinks this is relevant
    -- Review status
    status VARCHAR(20) DEFAULT 'pending',     -- 'pending', 'approved', 'dismissed'
    reviewed_by_user_id UUID REFERENCES "user"(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Deal synopsis cache
CREATE TABLE deal_synopsis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id UUID NOT NULL REFERENCES deal(id) ON DELETE CASCADE,
    ball_in_court VARCHAR(100),               -- Who owes next action
    ball_in_court_type VARCHAR(50),           -- 'us', 'them', 'landlord', 'tenant', etc.
    status_summary TEXT,
    key_document_status TEXT,                 -- LOI, Lease status
    alert_level VARCHAR(10),                  -- 'green', 'yellow', 'red'
    alert_reason TEXT,
    last_activity_at TIMESTAMPTZ,
    days_since_activity INTEGER,
    stalled_threshold_days INTEGER DEFAULT 7,
    synopsis_json JSONB,                      -- Full AI response
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(deal_id)
);

-- Indexes for performance
CREATE INDEX idx_emails_message_id ON emails(message_id);
CREATE INDEX idx_emails_sender ON emails(sender_email);
CREATE INDEX idx_emails_received ON emails(received_at DESC);
CREATE INDEX idx_email_visibility_user ON email_visibility(user_id);
CREATE INDEX idx_email_object_link_email ON email_object_link(email_id);
CREATE INDEX idx_email_object_link_object ON email_object_link(object_type, object_id);
CREATE INDEX idx_ai_correction_sender ON ai_correction_log(sender_email);
CREATE INDEX idx_unmatched_queue_status ON unmatched_email_queue(status);
CREATE INDEX idx_gmail_connection_user ON gmail_connection(user_id);
```

### 2.2 Extend Activity Table

```sql
-- Add email-related columns to activity table
ALTER TABLE activity ADD COLUMN IF NOT EXISTS email_id UUID REFERENCES emails(id);
ALTER TABLE activity ADD COLUMN IF NOT EXISTS direction VARCHAR(10);  -- 'INBOUND', 'OUTBOUND'

CREATE INDEX idx_activity_email ON activity(email_id);
```

### 2.3 Add Email Activity Type

```sql
-- Insert new activity type for emails
INSERT INTO activity_type (name, icon, color, is_system)
VALUES ('Email', 'envelope', 'blue', true)
ON CONFLICT (name) DO NOTHING;
```

---

## Phase 3: Supabase Edge Functions

### 3.1 Shared Utilities

#### `supabase/functions/_shared/gmail.ts`

Gmail API client with token refresh handling:
- `getGmailClient(connection)` - Create authenticated Gmail client
- `refreshAccessToken(connection)` - Refresh expired tokens
- `listMessages(client, query, historyId)` - Fetch messages with pagination
- `getMessage(client, messageId)` - Get full message content
- `parseEmailHeaders(message)` - Extract headers (From, To, Subject, Message-ID, etc.)
- `extractEmailBody(message)` - Get plain text body from MIME parts

#### `supabase/functions/_shared/gemini.ts`

Gemini AI client:
- `analyzeEmailForTags(email, crmContext, corrections)` - Triage Agent
- `checkBusinessRelevance(email, crmObjects)` - Filter unmatched emails
- `generateDealSynopsis(activities, corrections)` - Deal Synopsis Agent
- `extractContactInfo(email)` - Extract name/company from unknown sender

### 3.2 OAuth Functions

#### `supabase/functions/gmail-connect/index.ts`

Initiates OAuth flow:
1. Generate state token (store in DB or JWT)
2. Build Google OAuth URL with scopes
3. Return redirect URL to frontend

#### `supabase/functions/gmail-callback/index.ts`

Handles OAuth callback:
1. Verify state token
2. Exchange code for tokens
3. Fetch user's Gmail address
4. Store in `gmail_connection` table
5. Redirect to frontend success page

#### `supabase/functions/gmail-disconnect/index.ts`

Disconnects Gmail:
1. Revoke Google tokens
2. Set `is_active = false` in `gmail_connection`
3. Optionally: delete synced emails for that user

### 3.3 Ingestion Function

#### `supabase/functions/gmail-sync/index.ts`

CRON-triggered (every 5 minutes):

```
1. Fetch all active gmail_connections
2. For each connection:
   a. Refresh access token if needed
   b. Try incremental sync via history.list:
      - If last_history_id exists: call history.list(startHistoryId)
      - CRITICAL: Wrap in try/catch for 404 handling (see below)
   c. For each message:
      - Check if message_id exists in emails table
      - If new: parse and insert into emails
      - Insert email_visibility for this user
      - If duplicate: just add email_visibility link
   d. Update last_history_id and last_sync_at
3. Return summary of synced emails
```

**CRITICAL: History ID 404 Handling**

The Gmail History API returns a `404 Not Found` when:
- The `historyId` is too old (Google only retains ~30 days of history)
- The `historyId` is invalid or corrupted
- The user's mailbox was migrated

```typescript
async function syncEmails(connection: GmailConnection) {
  try {
    if (connection.last_history_id) {
      // Try incremental sync
      const history = await gmail.users.history.list({
        userId: 'me',
        startHistoryId: connection.last_history_id,
        historyTypes: ['messageAdded'],
        labelId: ['INBOX', 'SENT']
      });
      return processHistoryResponse(history);
    }
  } catch (error) {
    if (error.status === 404) {
      // History ID expired or invalid - reset sync cursor
      console.log(`History ID expired for ${connection.google_email}, performing full resync`);
      // Fall through to full sync below
    } else {
      throw error; // Re-throw other errors
    }
  }

  // Full sync: fetch last 50 messages (first sync OR history reset)
  const messages = await gmail.users.messages.list({
    userId: 'me',
    maxResults: 50,
    labelIds: ['INBOX', 'SENT']
  });

  // Get the latest historyId from the first message to set new cursor
  if (messages.data.messages?.length > 0) {
    const firstMsg = await gmail.users.messages.get({
      userId: 'me',
      id: messages.data.messages[0].id,
      format: 'metadata'
    });
    // Store this as the new history cursor
    newHistoryId = firstMsg.data.historyId;
  }

  return processMessagesResponse(messages, newHistoryId);
}
```

Batch processing:
- Process max 50 messages per run (avoid timeout)
- Use Gmail's `history.list` for incremental sync
- Handle rate limits with exponential backoff
- **Always handle 404 by falling back to messages.list**

### 3.4 Triage Agent Function

#### `supabase/functions/email-triage/index.ts`

Processes untagged emails:

```
1. Fetch emails where ai_processed = false (batch of 10)
2. For each email:
   a. STEP 1: Email Address Matching
      - Match sender_email against contact.email, contact.personal_email
      - If match found: create email_object_link (source: 'email_match')
      - Also link to contact's client if exists

   b. STEP 2: AI Content Analysis (if matches found OR always)
      - Fetch recent corrections from ai_correction_log for context
      - Build prompt with email content + CRM object names
      - Call Gemini to identify references to:
        - Properties (addresses, property names)
        - Deals (deal names, transaction references)
        - Clients (company names)
      - Create email_object_link for AI matches (source: 'ai_tag')

   c. STEP 3: Handle Unmatched
      - If no contact match but AI found CRM references:
        - Add to unmatched_email_queue with context
      - If no matches at all:
        - Quick relevance check: is this business email?
        - If not relevant: discard (don't store)

   d. STEP 4: Create Activity Record
      - If email has at least one link:
        - Create activity record (type: 'Email')
        - Link to primary deal/contact

   e. Mark email as ai_processed = true
```

### 3.5 Deal Synopsis Function

#### `supabase/functions/deal-synopsis/index.ts`

On-demand or scheduled:

```
1. Accept deal_id as parameter (or process all active deals)
2. Fetch all activities for deal:
   - Tasks (open and completed)
   - Logged calls
   - Emails (via email_object_link)
3. Build chronological transcript
4. Fetch relevant corrections from ai_correction_log
5. Call Gemini 1.5 Pro with full context
6. Parse response:
   - ball_in_court: Who owes next action
   - status_summary: Current deal state
   - alert_level: green/yellow/red
   - alert_reason: Why this level
7. Upsert into deal_synopsis table
8. Return synopsis
```

### 3.6 Correction Logging Function

#### `supabase/functions/email-correction/index.ts`

Called when user corrects a tag:

```
1. Accept: email_id, correction_type, object details, reasoning_hint
2. If removing tag:
   - Delete from email_object_link
   - Log to ai_correction_log
3. If adding tag:
   - Insert into email_object_link (source: 'manual')
   - Log to ai_correction_log
4. Return success
```

---

## Phase 4: Frontend Components

### 4.1 Gmail Settings Page

#### `src/pages/GmailSettingsPage.tsx`

Admin page for managing Gmail connections:
- List connected accounts (user, email, last sync, status)
- "Connect Gmail" button → OAuth flow
- "Disconnect" button per account
- Sync status indicators
- Manual "Sync Now" button

Location: Add to hamburger menu under QuickBooks (admin only)

### 4.2 Email Display in Activity Tab

#### Update `src/components/ActivityItem.tsx`

Add email-specific rendering:
- Email icon for type
- Direction indicator (→ outbound, ← inbound)
- Sender/recipient display
- Subject as title
- Snippet preview
- "View Full Email" expansion
- Tag chips showing linked objects
- Correction actions (remove tag, help AI learn)

#### Update `src/components/GenericActivityTab.tsx`

- Add "Email" to filter options
- Handle email activity type in sorting

### 4.3 Email Correction UI

#### `src/components/EmailTagCorrection.tsx`

Inline correction component:
- Shows current tags as removable chips
- "Add tag" button → search modal for objects
- Expandable "Help AI learn" section:
  - Text input for reasoning hint
  - Submit button

### 4.4 Suggested Contacts Queue

#### `src/pages/SuggestedContactsPage.tsx`

Review queue for unmatched emails:
- List view: sender, subject, matched CRM object, reason
- Click to expand: full email preview
- Actions per item:
  - "Add Contact" → pre-filled contact form
  - "Dismiss" → removes from queue
  - "Not Relevant" → dismisses and logs for AI learning

#### Update `src/components/Navbar.tsx`

Add to Contacts dropdown:
```typescript
const contactsItems = [
  { label: "Add New Contact", action: () => navigate('/contact/new') },
  { label: "Search Contacts", action: () => setSearchModals(...) },
  { label: "Suggested Contacts", action: () => navigate('/contacts/suggested') }  // NEW
];
```

Optional: Badge showing pending count

### 4.5 Deal Synopsis Display

#### `src/components/DealSynopsis.tsx`

Card component for deal detail page:
- Ball in Court indicator (with icon)
- Status summary (2-3 sentences)
- Alert level badge (color-coded)
- Last updated timestamp
- "Refresh" button

#### Update `src/pages/DealDetailsPage.tsx`

Add synopsis card above Activity tab

#### Update `src/components/KanbanBoard.tsx` (Deal cards)

Add subtle indicator:
- Small colored dot (3-4px) in corner
- Green = healthy, Yellow = needs attention, Red = stalled
- Tooltip on hover showing brief status

---

## Phase 5: Testing Plan

### 5.1 Unit Tests

- Gmail token refresh logic
- Email parsing (headers, body extraction)
- Deduplication logic (same email, multiple users)
- AI prompt construction
- Correction log queries

### 5.2 Integration Tests

- Full OAuth flow (connect → callback → store)
- Email sync with mock Gmail API
- Triage agent with sample emails
- Synopsis generation with sample activities

### 5.3 Manual Testing Checklist

- [ ] Connect Gmail account (your account)
- [ ] Verify initial sync fetches recent emails
- [ ] Confirm emails appear in Activity tab on relevant Deals
- [ ] Test email matching by known contact
- [ ] Test AI tagging for property/deal references
- [ ] Test unmatched queue with new sender
- [ ] Test correction flow (remove tag)
- [ ] Test "Help AI learn" feedback
- [ ] Verify synopsis generation
- [ ] Check Kanban indicators update
- [ ] Add Arty's account and verify deduplication

---

## Phase 6: Deployment Checklist

### 6.1 Google Cloud
- [ ] Create production Google Cloud project
- [ ] Enable Gmail API and Generative Language API
- [ ] Configure OAuth consent screen
- [ ] Add production redirect URI
- [ ] Create production OAuth credentials
- [ ] Generate Gemini API key

### 6.2 Supabase
- [ ] Add environment secrets (GOOGLE_CLIENT_ID, etc.)
- [ ] Run database migrations
- [ ] Deploy Edge Functions
- [ ] Configure CRON for gmail-sync (every 5 minutes)
- [ ] Test functions in production

### 6.3 Frontend
- [ ] Build and deploy updated frontend
- [ ] Verify Gmail settings page accessible
- [ ] Test OAuth flow in production

---

## Implementation Order

### Sprint 1: Foundation
1. Google Cloud setup (Phase 1)
2. Database schema (Phase 2)
3. Shared utilities - gmail.ts, gemini.ts (Phase 3.1)
4. OAuth functions - connect, callback, disconnect (Phase 3.2)
5. Gmail Settings Page (Phase 4.1)

### Sprint 2: Ingestion
1. gmail-sync Edge Function (Phase 3.3)
2. Email Activity rendering in ActivityItem (Phase 4.2)
3. Test end-to-end sync with your account

### Sprint 3: AI Tagging
1. email-triage Edge Function (Phase 3.4)
2. Unmatched queue table and logic
3. Suggested Contacts page (Phase 4.4)
4. Email correction UI (Phase 4.3)
5. email-correction Edge Function (Phase 3.6)

### Sprint 4: Synopsis & Polish
1. deal-synopsis Edge Function (Phase 3.5)
2. Deal Synopsis component (Phase 4.5)
3. Kanban card indicators
4. Testing and bug fixes (Phase 5)

### Sprint 5: Production
1. Deployment checklist (Phase 6)
2. Connect Arty's account
3. Monitor and iterate

---

## Cost Estimates

### Gmail API
- Free tier: 1 billion quota units/day
- Email read: ~5 units per message
- Effectively unlimited for this use case

### Gemini API
- Gemini 1.5 Flash: $0.075 per 1M input tokens
- Gemini 1.5 Pro: $1.25 per 1M input tokens
- Estimated: ~$5-20/month depending on email volume

### Supabase
- Edge Function invocations included in plan
- Database storage: minimal increase (~1KB per email)

---

## Security Considerations

1. **Token Storage**: Access/refresh tokens stored in database (consider encryption at rest)
2. **Scope Limitation**: Only request `gmail.readonly` - cannot send or modify emails
3. **User Consent**: Each user explicitly authorizes their own account
4. **Data Retention**: Consider policy for old emails (archive after X days?)
5. **RLS Policies**: Ensure users can only see their own email_visibility records

---

## Future Enhancements (Phase 2+)

1. **Prospecting Agent** - Research leads using Google Search grounding
2. **Email Compose** - Send emails directly from CRM (requires additional scope)
3. **Attachment Handling** - Extract and store relevant attachments
4. **Calendar Integration** - Sync meeting invites to activities
5. **Multi-provider Support** - Outlook/Microsoft 365 integration
