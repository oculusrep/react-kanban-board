# OVIS Email Agent - Technical Documentation

## Overview

The OVIS Email Agent is an autonomous AI system that classifies incoming emails by linking them to CRM objects (deals, contacts, clients, properties). Built on Google's Gemini 2.5 Flash model with function calling, it operates as a true agent - making all semantic decisions autonomously while humans provide oversight through a feedback loop.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Gmail Integration                             │
│  Gmail API → gmail-sync Edge Function → emails table                │
│  ↓ Checks processed_message_ids to skip deleted emails              │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Email Triage Edge Function                       │
│  1. Check for RULE HARD-OVERRIDE (skip AI if rule matches)          │
│  2. Run Gemini agent for remaining emails                            │
│  3. Execute action: KEEP (link/flag) or DELETE (remove from DB)     │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Gemini Autonomous Agent                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ System Prompt (The Brain)                                    │   │
│  │ - Role definition: OVIS CRM assistant                        │   │
│  │ - Protocol: Check rules → Analyze → Verify → Act → Finish   │   │
│  │ - DELETE POLICY: Personal/spam → delete, Business → keep    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│                              ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Agent Loop (max 5 iterations)                                │   │
│  │ 1. Call Gemini with tools                                    │   │
│  │ 2. Execute function calls                                    │   │
│  │ 3. Return results to Gemini                                  │   │
│  │ 4. Repeat until done() is called with action                 │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Database Tables                              │
│  email_object_link: Stores AI classifications with reasoning        │
│  unmatched_email_queue: Flagged emails for human review             │
│  agent_rules: User-defined rules (including exclusions)             │
│  processed_message_ids: Tracks deleted emails to prevent re-fetch   │
│  ai_correction_log: User feedback for AI learning                   │
│  activity: CRM activity records created from linked emails          │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       Feedback Loop UI                               │
│  - Suggested Contacts: Review flagged emails, teach AI              │
│  - Email Classification Review: Correct/remove AI decisions        │
│  - Agent Rules: Create exclusions and mappings                      │
│  - AI Reasoning Trace: View confidence scores and reasoning        │
└─────────────────────────────────────────────────────────────────────┘
```

## Phase 1 Improvements (Completed)

### 1. RLS Bug Fix
**Problem:** Flagged emails weren't visible in the UI because `gmail_connection_id` wasn't being passed to the `unmatched_email_queue` table.

**Solution:**
- Updated `flagForReview()` to accept `gmailConnectionId` parameter
- Updated `executeToolCall()` to pass it through
- Updated `runEmailTriageAgent()` interface to include `gmail_connection_id`
- Updated `email-triage/index.ts` to extract from `email_visibility` join

### 2. Rule Hard-Override
**Problem:** Rules were just context for the AI, not enforced.

**Solution:** Rules are now checked BEFORE calling the AI agent:
- **Exclusion rules** (`rule_type = 'exclusion'`): Immediately return `action: 'delete'`
- **Mapping rules** (with `target_object_type` + `target_object_id`): Immediately link and return
- Agent loop is completely skipped when rules match
- Response includes `rule_override: true` to track when rules took over

### 3. Hard Delete Policy
**Problem:** Non-business emails (spam, personal) were kept in the database, just marked as "not relevant".

**Solution:** Implemented true deletion:
- `done()` tool now requires `action: 'keep' | 'delete'`
- System prompt includes clear DELETE POLICY
- When `action === 'delete'`:
  1. Store `message_id` in `processed_message_ids` table
  2. Delete email row from `emails` table (cascade handles related records)
- Gmail sync checks `processed_message_ids` before inserting to prevent re-fetch

**DELETE POLICY (in system prompt):**
- Business emails with CRM links → `keep`
- Business emails flagged for review → `keep`
- Personal emails (school, family) → `delete`
- Spam/marketing/promotional → `delete`
- Package tracking (UPS, FedEx) → `delete`
- Social media notifications → `delete`
- Unknown sender, no business connection → `delete`

### 4. Processed Message IDs Table
New table to prevent re-fetching deleted emails:
```sql
CREATE TABLE processed_message_ids (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id VARCHAR(500) UNIQUE NOT NULL,
    gmail_connection_id UUID REFERENCES gmail_connection(id),
    action VARCHAR(20) NOT NULL DEFAULT 'deleted',
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 5. Improved Flagged Email Queue UI
Complete redesign of `/admin/flagged-emails`:

**Layout Changes:**
- Contact name on first line (prominent)
- Email address on second line (full, no truncation)
- Subject on third line
- Yellow left border for pending items

**New Quick Actions (visible without expanding):**
- "Add Contact" - Opens link search
- "Not Business" - Deletes email AND creates exclusion rule

**Expanded View Features:**
- "Why AI flagged this" - Yellow callout with match reason
- Multi-object linking - Add multiple contacts/deals/clients/properties
- "Teach the AI" textarea - Explain reasoning for AI learning
- Search for CRM objects with type badges
- "Create New Contact" - Pre-filled form
- "Keep but ignore" - Dismiss without deleting

**"Not Business" Button Behavior:**
1. Confirms action with user
2. Creates exclusion rule for sender's domain
3. Records message_id to prevent re-fetch
4. Deletes email from queue and emails table
5. Future emails from domain auto-deleted

### 6. AI Learning from Corrections
When users link objects with reasoning:
- Links saved to `email_object_link` with reasoning
- Correction logged to `ai_correction_log` with explanation
- Data available for future AI improvements

## Components

### 1. Gemini Agent (`supabase/functions/_shared/gemini-agent.ts`)

The core autonomous agent with 8 tools:

| Tool | Purpose |
|------|---------|
| `search_rules` | Check user-defined rules FIRST before any analysis |
| `search_deals` | Search active deals by name, address, city, client |
| `search_contacts` | Search contacts by name, email, company |
| `search_clients` | Search client companies by name |
| `search_properties` | Search properties by address, name, city |
| `get_deal_participants` | Verify sender involvement in a deal |
| `link_object` | Link email to CRM object with confidence + reasoning |
| `flag_for_review` | Flag uncertain emails for human review (with gmail_connection_id) |
| `done` | Signal completion with summary, is_business_relevant, and action |

**Agent Protocol:**
1. CHECK RULES: Always call `search_rules` first
2. ANALYZE SENDER: Search for sender in contacts
3. ANALYZE CONTENT: Extract entities, search for matches
4. VERIFY: Use `get_deal_participants` to verify connections
5. ACT: Link (≥0.7 confidence), flag (uncertain), or delete (spam)
6. FINISH: Call `done()` with summary and action

**Key Design Decisions:**
- Temperature 0.1 for consistent, predictable behavior
- Max 5 iterations to prevent runaway loops
- Confidence thresholds: 0.9+ certain, 0.7-0.9 likely, <0.7 flag for review
- All reasoning is stored in `reasoning_log` for transparency
- Rules are hard overrides - checked before AI runs

### 2. Email Triage Edge Function (`supabase/functions/email-triage/index.ts`)

Orchestrates batch processing:
- Fetches 5 unprocessed emails per invocation
- **NEW:** Checks rules for hard-override before calling agent
- Runs agent for each email (if no rule match)
- **NEW:** Deletes emails when `action === 'delete'`
- Creates activity records for linked emails
- Marks emails as processed (if kept)
- Returns detailed results including `deleted` and `rule_overrides` counts

**Response Format:**
```json
{
  "success": true,
  "duration_ms": 25458,
  "processed": 3,
  "total_tags": 2,
  "total_tool_calls": 27,
  "flagged_for_review": 0,
  "deleted": 2,
  "rule_overrides": 0,
  "results": [...]
}
```

### 3. Gmail Sync Edge Function (`supabase/functions/gmail-sync/index.ts`)

**NEW:** Now checks `processed_message_ids` before inserting:
- Queries table for each message_id
- Skips emails that were previously deleted
- Tracks `skipped_deleted` count in response

### 4. Database Schema

**email_object_link** (AI classifications)
```sql
- email_id: UUID (FK to emails)
- object_type: 'deal' | 'contact' | 'property' | 'client'
- object_id: UUID
- confidence_score: numeric(3,2)
- reasoning_log: text (AI's explanation)
- link_source: 'ai_agent' | 'manual' | 'rule'
```

**agent_rules** (User-defined rules)
```sql
- rule_text: text (natural language instruction)
- rule_type: 'sender_mapping' | 'domain_mapping' | 'keyword' | 'exclusion'
- match_pattern: text (regex or literal match)
- target_object_type: text (optional - for auto-linking)
- target_object_id: UUID (optional - for auto-linking)
- priority: integer (higher = more important)
- is_active: boolean
```

**unmatched_email_queue** (Flagged for review)
```sql
- email_id: UUID
- gmail_connection_id: UUID (NEW - for RLS)
- sender_email: text
- suggested_contact_name: text (AI suggestion)
- suggested_company: text (AI suggestion)
- match_reason: text (why flagged)
- status: 'pending' | 'resolved' | 'dismissed'
```

**processed_message_ids** (NEW - prevents re-fetching deleted emails)
```sql
- message_id: VARCHAR(500) UNIQUE
- gmail_connection_id: UUID
- action: VARCHAR(20) ('deleted', 'processed')
- processed_at: TIMESTAMPTZ
```

**ai_correction_log** (User feedback for learning)
```sql
- email_id: UUID
- correction_type: 'added_tag' | 'removed_tag' | 'wrong_object'
- object_type: text
- correct_object_id: UUID
- sender_email: text
- reasoning_hint: text (user's explanation)
```

### 5. Feedback Loop UI

**Suggested Contacts** (`/admin/flagged-emails`)
- Review emails from unknown senders
- Multi-object linking with search
- "Teach the AI" feedback textarea
- "Not Business" button for exclusion + delete
- "Keep but ignore" for dismissal without deletion

**Email Classification Review** (`/admin/email-review`)
- View all AI-processed emails with classifications
- Filter: All | With Links | No Links
- Actions: Remove link, Add link, Create rule from classification
- Shows confidence scores (color-coded) and AI reasoning

**Agent Rules Page** (`/admin/agent-rules`)
- Create/edit/delete rules
- Rule types: exclusion, sender_mapping, domain_mapping, keyword
- Priority ordering
- Target object linking for auto-classification

**AI Reasoning Trace** (component in email view)
- Expandable panel showing classifications
- Confidence scores, reasoning, source

### 6. Model Configuration

```typescript
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const model = 'gemini-2.5-flash';

const body = {
  systemInstruction: { parts: [{ text: systemPrompt }] },
  contents: messages,
  tools: [{ functionDeclarations: OVIS_TOOLS }],
  toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
  generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
};
```

## Test Results

Processing 3 test emails:

| Email | Tags | Tool Calls | Action | Summary |
|-------|------|------------|--------|---------|
| UPS Package Delivery | 0 | 4 | delete | Generic shipping notification |
| Re: Milledgeville, GA | 2 | 21 | keep | Linked to deal + client |
| Seesaw updates | 0 | 2 | delete | Personal/school notification |

- Total processing time: ~25 seconds for 3 emails
- Agent correctly identified spam/personal emails and marked for deletion
- Agent found deal by searching for location in subject line
- Agent made 27 total tool calls demonstrating autonomous exploration

## Remaining Limitations

1. **No automatic scheduling**: Email triage must be triggered manually or via pg_cron (SQL provided in migration)

2. **Batch size**: Fixed at 5 emails per invocation to manage API costs

3. **Rule matching**: Currently uses simple text matching. Could be enhanced with semantic similarity

4. **No automatic rule creation**: When users correct classifications, rules must be created manually

## pg_cron Setup (Optional)

The migration file includes SQL for pg_cron automation. To enable:

```sql
-- 1. Enable pg_cron in Supabase Dashboard: Settings > Extensions > pg_cron

-- 2. Set app secrets (run in SQL editor):
ALTER DATABASE postgres SET app.settings.supabase_url = 'https://[project].supabase.co';
ALTER DATABASE postgres SET app.settings.service_role_key = 'YOUR_SERVICE_ROLE_KEY';

-- 3. Schedule the job (run after enabling pg_cron):
SELECT cron.schedule(
    'email-triage-job',
    '*/10 * * * *',  -- Every 10 minutes
    'SELECT trigger_email_triage()'
);

-- View scheduled jobs:
SELECT * FROM cron.job;

-- Unschedule if needed:
SELECT cron.unschedule('email-triage-job');
```

## API Reference

### Invoke Email Triage

```bash
curl -X POST "https://[project].supabase.co/functions/v1/email-triage" \
  -H "Authorization: Bearer [anon-key]" \
  -H "Content-Type: application/json"
```

**Response:**
```json
{
  "success": true,
  "duration_ms": 25458,
  "processed": 3,
  "total_tags": 2,
  "total_tool_calls": 27,
  "flagged_for_review": 0,
  "deleted": 2,
  "rule_overrides": 0,
  "results": [
    {
      "email_id": "uuid",
      "subject": "Re: Milledgeville, GA",
      "tags_added": 2,
      "flagged_for_review": false,
      "is_relevant": true,
      "action": "keep",
      "rule_override": false,
      "tool_calls": 21,
      "summary": "Linked to deal 'JJ - Milledgeville - Amos' and client 'Sullivan Wickley'"
    }
  ]
}
```

### Reset Emails for Reprocessing

```sql
UPDATE emails
SET ai_processed = false, ai_processed_at = NULL
WHERE id IN (
  SELECT id FROM emails
  ORDER BY received_at DESC
  LIMIT 10
);
```

### Clear Processed Message IDs (to allow re-fetch)

```sql
DELETE FROM processed_message_ids
WHERE processed_at < NOW() - INTERVAL '30 days';
```

## File Structure

```
supabase/functions/
├── _shared/
│   ├── gemini-agent.ts    # Autonomous agent with tools + rule override
│   └── gmail.ts           # Gmail API helpers
├── email-triage/
│   └── index.ts           # Edge function with delete logic
└── gmail-sync/
    └── index.ts           # Gmail sync with skip-deleted logic

supabase/migrations/
├── 20251211_gmail_gemini_integration.sql  # Base schema
└── 20251211_email_agent_phase1.sql        # processed_message_ids + pg_cron

src/
├── components/
│   └── AIReasoningTrace.tsx    # Per-email classification display
└── pages/
    ├── AgentRulesPage.tsx              # Rule management
    ├── EmailClassificationReviewPage.tsx # Review/correct AI
    ├── FlaggedEmailQueuePage.tsx       # Suggested contacts with feedback
    └── GmailSettingsPage.tsx           # Gmail settings + links

docs/
└── EMAIL_AGENT.md              # This documentation
```

## Environment Variables

```
GEMINI_API_KEY=your-gemini-api-key  # In Supabase Edge Function secrets
```

## Next Steps (Proposed)

### Phase 2: Enhanced Rule System
1. Auto-rule creation when users correct classifications
2. Semantic rule matching with embeddings
3. Rule testing preview
4. Rule analytics (trigger counts)

### Phase 3: Learning from Feedback
1. Use `ai_correction_log` to improve prompts
2. Confidence calibration based on correction rates
3. Pattern detection for auto-rule suggestions

### Phase 4: Advanced Features
1. Email threading (link entire threads)
2. Attachment analysis (PDFs, images)
3. Proactive suggestions (create task, update deal stage)

### Phase 5: Observability
1. Agent dashboard with metrics
2. Cost tracking per email
3. Performance optimization
4. Audit log for compliance

---

*Document updated: December 11, 2025*
*Phase 1 improvements completed*
*System: OVIS CRM with Gemini 2.5 Flash autonomous agent*
