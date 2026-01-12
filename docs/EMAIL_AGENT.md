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

**agent_corrections** (User feedback for Active Learning)
```sql
CREATE TABLE agent_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  incorrect_link_id UUID,                    -- The AI link that was wrong (null if AI missed)
  incorrect_object_type VARCHAR(50),         -- What AI linked to (or 'none' if missed)
  incorrect_object_id UUID,                  -- ID of wrong object
  correct_object_type VARCHAR(50) NOT NULL,  -- Correct object type (or 'none' if removal)
  correct_object_id UUID NOT NULL,           -- Correct object ID (null UUID if removal)
  feedback_text TEXT,                        -- User's explanation
  sender_email VARCHAR(255),                 -- For pattern matching
  email_subject TEXT,                        -- For keyword matching
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by_user_id UUID REFERENCES "user"(id)
);
```

**Three types of corrections captured:**
| Action | incorrect_object_type | correct_object_type | Meaning |
|--------|----------------------|---------------------|---------|
| Correct (pencil) | Original AI type | New correct type | AI linked to wrong object |
| Remove (trash) | Original AI type | `'none'` | AI shouldn't have linked |
| Add (plus) | `'none'` | New correct type | AI missed this link |

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

## Phase 2: Active Learning Feedback Loop (Completed)

### Overview

The AI agent now learns from user corrections by querying the `agent_corrections` table before classifying each email. This creates a true feedback loop where human corrections improve future AI decisions.

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    User Correction Actions                          │
│  EmailClassificationReviewPage.tsx                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │ Correct (✏️) │  │ Remove (🗑️) │  │  Add (+)    │                 │
│  │ AI → Right  │  │ AI → None   │  │ None → Right│                 │
│  └─────────────┘  └─────────────┘  └─────────────┘                 │
│           │              │              │                           │
│           └──────────────┼──────────────┘                           │
│                          ▼                                          │
│              ┌───────────────────────┐                              │
│              │   agent_corrections   │                              │
│              │   table (training     │                              │
│              │   data store)         │                              │
│              └───────────────────────┘                              │
└─────────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  Active Learning Retrieval                          │
│  getRelevantCorrections() - "The Librarian"                        │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ PRIORITY 1: Exact Sender Match                               │   │
│  │ SELECT * FROM agent_corrections                              │   │
│  │ WHERE sender_email = 'john@acme.com'                        │   │
│  │ ORDER BY created_at DESC LIMIT 5                            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                          │                                          │
│                          ▼                                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ PRIORITY 2: Domain Match (Corporate Only)                    │   │
│  │ ⚠️ EXCLUDES: gmail.com, yahoo.com, outlook.com, icloud.com  │   │
│  │ SELECT * FROM agent_corrections                              │   │
│  │ WHERE sender_email ILIKE '%@acme.com'                       │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                          │                                          │
│                          ▼                                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ PRIORITY 3: Subject Keyword Match                            │   │
│  │ Only distinctive keywords: proper nouns, addresses, numbers │   │
│  │ SELECT * FROM agent_corrections                              │   │
│  │ WHERE email_subject ILIKE '%milledgeville%'                 │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                          │                                          │
│                          ▼                                          │
│              ┌───────────────────────┐                              │
│              │  Max 5 Corrections    │                              │
│              │  (context limit)      │                              │
│              └───────────────────────┘                              │
└─────────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Prompt Injection                                 │
│  formatCorrectionsForPrompt()                                       │
│                                                                     │
│  ### RELEVANT PAST CORRECTIONS (USER FEEDBACK)                     │
│  The following are past mistakes you made that the user corrected. │
│  Learn from these to avoid repeating errors:                       │
│                                                                     │
│  - On Dec 12: User REMOVED link to contact "John Smith" for email  │
│    from spam@example.com. AI should not have made this link.       │
│  - On Dec 11: User ADDED link to deal "JJ - Milledgeville" for     │
│    email from broker@realty.com (subject: "Re: Milledgeville, GA").│
│    AI missed this link.                                            │
│  - On Dec 10: User CORRECTED contact "John Doe" → client "Acme     │
│    Corp" for sales@acme.com.                                       │
│                                                                     │
│  IMPORTANT: Apply these corrections to similar emails.             │
└─────────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Gemini System Prompt                             │
│  Role: OVIS Autonomous Assistant...                                │
│                                                                     │
│  ${correctionsPrompt}   <-- Injected here                          │
│                                                                     │
│  AVAILABLE TOOLS:                                                  │
│  - search_rules...                                                 │
└─────────────────────────────────────────────────────────────────────┘
```

### Implementation Details

#### 1. Training Data Collection (`EmailClassificationReviewPage.tsx`)

Three user actions now log to `agent_corrections`:

**handleRemoveLink** - When user removes an AI link:
```typescript
if (email && link && link.link_source === 'ai_agent') {
  await supabase.from('agent_corrections').insert({
    email_id: emailId,
    incorrect_link_id: linkId,
    incorrect_object_type: link.object_type,
    incorrect_object_id: link.object_id,
    correct_object_type: 'none',  // Indicates removal
    correct_object_id: '00000000-0000-0000-0000-000000000000',
    feedback_text: `AI incorrectly linked to ${link.object_type} "${link.object_name}"`,
    sender_email: email.sender_email,
    email_subject: email.subject,
  });
}
```

**handleAddLink** - When user adds a link AI missed:
```typescript
if (email && email.ai_processed) {
  await supabase.from('agent_corrections').insert({
    email_id: emailId,
    incorrect_object_type: 'none',  // AI didn't link
    incorrect_object_id: '00000000-0000-0000-0000-000000000000',
    correct_object_type: object.type,
    correct_object_id: object.id,
    feedback_text: `AI missed linking to ${object.type} "${object.name}"`,
    sender_email: email.sender_email,
    email_subject: email.subject,
  });
}
```

**handleSaveCorrection** - When user corrects an AI link to different object:
```typescript
await supabase.from('agent_corrections').insert({
  email_id: emailId,
  incorrect_link_id: originalLinkId,
  incorrect_object_type: originalLink.object_type,
  incorrect_object_id: originalLink.object_id,
  correct_object_type: newObject.type,
  correct_object_id: newObject.id,
  feedback_text: userFeedback,
  sender_email: email.sender_email,
  email_subject: email.subject,
});
```

#### 2. Public Domain Exclusion List (`gemini-agent.ts`)

To prevent polluting the context with irrelevant domain matches, public email providers are excluded from domain-level retrieval:

```typescript
const PUBLIC_EMAIL_DOMAINS = new Set([
  // Major providers
  'gmail.com', 'googlemail.com', 'google.com',
  'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'rocketmail.com',
  'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'aim.com',
  'protonmail.com', 'proton.me',
  'zoho.com', 'zohomail.com',
  'mail.com', 'email.com',
  'gmx.com', 'gmx.net',
  'yandex.com', 'yandex.ru',
  'fastmail.com', 'fastmail.fm',
  'tutanota.com', 'tuta.io',
  // ISP providers
  'comcast.net', 'xfinity.com',
  'att.net', 'sbcglobal.net', 'bellsouth.net',
  'verizon.net',
  'charter.net', 'spectrum.net',
  'cox.net',
  'earthlink.net',
  // Regional/international
  'qq.com', '163.com', '126.com',
  'naver.com', 'daum.net',
  'web.de', 'freenet.de', 't-online.de',
  'libero.it', 'virgilio.it',
  'orange.fr', 'free.fr', 'laposte.net',
  'btinternet.com', 'sky.com', 'talktalk.net',
]);
```

#### 3. Correction Retrieval Function (`getRelevantCorrections`)

```typescript
export async function getRelevantCorrections(
  supabase: SupabaseClient,
  senderEmail: string,
  emailSubject: string
): Promise<PastCorrection[]>
```

**Retrieval Logic:**
1. **Priority 1 - Sender Match**: Always fetches corrections for exact sender email
2. **Priority 2 - Domain Match**: Only for private/corporate domains (checks `isPublicEmailDomain()`)
3. **Priority 3 - Subject Keywords**: Filters for distinctive terms:
   - Proper nouns (capitalized in original)
   - Contains numbers (addresses, file numbers)
   - 6+ characters (likely meaningful)

**Context Limit:** Max 5 corrections retrieved to prevent prompt bloat

**Name Resolution:** Object IDs are resolved to human-readable names:
```typescript
async function resolveObjectName(
  supabase: SupabaseClient,
  objectType: string,
  objectId: string
): Promise<string>
```

#### 4. Prompt Formatting Function (`formatCorrectionsForPrompt`)

Formats corrections for clear injection into the system prompt:

```typescript
export function formatCorrectionsForPrompt(corrections: PastCorrection[]): string {
  // Returns formatted string or empty string if no corrections
  // Format: "- On [Date]: User [ACTION] [details]"
}
```

**Output Example:**
```
### RELEVANT PAST CORRECTIONS (USER FEEDBACK)
The following are past mistakes you made that the user corrected. Learn from these to avoid repeating errors:

- On Dec 12: User REMOVED link to contact "John Smith" for email from spam@example.com. AI should not have made this link.
- On Dec 11: User ADDED link to deal "JJ - Milledgeville" for email from broker@realty.com (subject: "Re: Milledgeville, GA"). AI missed this link.
- On Dec 10: User CORRECTED contact "John Doe" → client "Acme Corp" for sales@acme.com. Person works for Acme.

IMPORTANT: Apply these corrections to similar emails. If the sender or context matches, use the user's preferred classification.
```

#### 5. Integration in Agent Loop (`runEmailTriageAgent`)

Corrections are fetched and injected before the AI processes each email:

```typescript
// ACTIVE LEARNING: Fetch relevant past corrections before calling AI
console.log(`[Agent] Fetching relevant past corrections for: ${email.sender_email}`);

const relevantCorrections = await getRelevantCorrections(
  supabase,
  email.sender_email,
  email.subject
);

const correctionsPrompt = formatCorrectionsForPrompt(relevantCorrections);

if (relevantCorrections.length > 0) {
  console.log(`[Agent] Found ${relevantCorrections.length} relevant past corrections`);
}

// THE BRAIN - System prompt with corrections injected
const systemPrompt = `Role: You are the OVIS Autonomous Assistant...

${correctionsPrompt}

AVAILABLE TOOLS:
...`;
```

### Key Design Decisions

1. **Retrieval Guardrails**: The "Librarian" approach prevents context pollution by:
   - Limiting to 5 corrections max
   - Excluding public domains from domain matching
   - Using distinctive keywords only (not common words)

2. **Human-Readable Format**: Object IDs are resolved to names so the AI can understand context (e.g., "John Smith" instead of a UUID)

3. **Section Header**: Using `### RELEVANT PAST CORRECTIONS (USER FEEDBACK)` makes it clear to the AI where the learned context comes from

4. **Action Types**: Three distinct formats (REMOVED, ADDED, CORRECTED) give the AI precise guidance on what went wrong

5. **Non-Blocking**: If correction retrieval fails, the agent continues without them (graceful degradation)

### Testing the Active Learning Loop

1. **Create a correction:**
   - Go to Email Classification Review
   - Find an AI-processed email
   - Add, remove, or correct a link

2. **Trigger a new email from same sender:**
   - Sync a new email from the same sender
   - Or reset an email for reprocessing:
   ```sql
   UPDATE emails SET ai_processed = false, ai_processed_at = NULL
   WHERE sender_email = 'test@example.com';
   ```

3. **Check Edge Function logs:**
   - Look for: `[Agent] Found X relevant past corrections`
   - Verify the correction was applied

4. **Query corrections table:**
   ```sql
   SELECT
     sender_email,
     incorrect_object_type,
     correct_object_type,
     feedback_text,
     created_at
   FROM agent_corrections
   ORDER BY created_at DESC
   LIMIT 10;
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
│   ├── gemini-agent.ts    # Autonomous agent with tools + rule override + thread inheritance
│   └── gmail.ts           # Gmail API helpers + label management
├── email-triage/
│   └── index.ts           # Edge function with delete logic + Gmail labels
├── gmail-sync/
│   └── index.ts           # Gmail sync with skip-deleted logic
└── backfill-gmail-labels/
    └── index.ts           # Apply OVIS-Linked labels to existing emails

supabase/migrations/
├── 20251211_gmail_gemini_integration.sql  # Base schema
└── 20251211_email_agent_phase1.sql        # processed_message_ids + pg_cron

src/
├── components/
│   ├── AIReasoningTrace.tsx    # Per-email classification display
│   └── EmailDetailModal.tsx    # Email view with tag management
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

## Phase 3: Enhanced Email Intelligence (Completed)

### Overview

Phase 3 introduces several major enhancements to make the email agent smarter and more user-friendly:

1. **Recipient Auto-Tagging** - All email recipients (To, CC, BCC) are matched to contacts
2. **Thread-Based Tag Inheritance** - Replies automatically inherit tags from earlier emails in the conversation
3. **Gmail Label Write-Back** - Emails linked in OVIS get an "OVIS-Linked" label in Gmail
4. **Enhanced Deal Name Matching** - Stronger subject/body scanning for deal references
5. **Tag Management in Email Detail Modal** - Users can add/remove tags directly from email view

### 1. Recipient Auto-Tagging

**Problem:** Only the sender was being matched to contacts. Recipients (To, CC, BCC) were ignored.

**Solution:** The agent now iterates through all recipients and matches them to contacts:

```typescript
// In gemini-agent.ts - runEmailTriageAgent()
if (email.recipient_list && email.recipient_list.length > 0) {
  const direction = email.direction || 'INBOUND';

  for (const recipient of email.recipient_list) {
    const recipientEmail = recipient.email?.toLowerCase();
    if (!recipientEmail) continue;

    // Skip internal domains for inbound emails
    if (direction === 'INBOUND') {
      const internalDomains = ['ovisre.com', 'ovis.com'];
      const emailDomain = recipientEmail.split('@')[1];
      if (internalDomains.some(d => emailDomain === d)) continue;
    }

    // Match recipient to contact and create link
    const { data: contactMatch } = await supabase
      .from('contact')
      .select('id, first_name, last_name')
      .ilike('email', recipientEmail)
      .limit(1)
      .single();

    if (contactMatch) {
      // Create email_object_link for this contact
    }
  }
}
```

**Behavior:**
- **Inbound emails**: Skip internal domains (ovisre.com, ovis.com) to avoid tagging internal recipients
- **Outbound emails**: Tag all external recipients to track who was contacted
- **Deduplication**: Checks for existing links before creating new ones

### 2. Thread-Based Tag Inheritance

**Problem:** When replying to an email thread, users had to manually re-tag each email even though they're all part of the same conversation.

**Solution:** Before AI processing, check if other emails in the same Gmail thread have been tagged, and inherit those tags:

```typescript
// In gemini-agent.ts - runEmailTriageAgent()
if (email.thread_id) {
  // Find other emails in the same thread that have been tagged
  const { data: threadEmails } = await supabase
    .from('emails')
    .select('id')
    .eq('thread_id', email.thread_id)
    .neq('id', email.id);

  if (threadEmails && threadEmails.length > 0) {
    const threadEmailIds = threadEmails.map(e => e.id);

    // Get all tags from emails in this thread
    const { data: threadTags } = await supabase
      .from('email_object_link')
      .select('object_type, object_id, reason')
      .in('email_id', threadEmailIds);

    if (threadTags && threadTags.length > 0) {
      console.log(`[Thread Inheritance] Found ${threadTags.length} tags from ${threadEmails.length} thread emails`);

      // Apply unique tags to this email
      const uniqueTags = new Map<string, any>();
      for (const tag of threadTags) {
        const key = `${tag.object_type}:${tag.object_id}`;
        if (!uniqueTags.has(key)) {
          uniqueTags.set(key, tag);
        }
      }

      // Insert inherited tags
      for (const [key, tag] of uniqueTags) {
        await supabase.from('email_object_link').upsert({
          email_id: email.id,
          object_type: tag.object_type,
          object_id: tag.object_id,
          confidence_score: 0.95,
          reasoning_log: `Inherited from thread: ${tag.reason || 'Previous email in thread was linked'}`,
          link_source: 'thread_inheritance',
        }, { onConflict: 'email_id,object_type,object_id' });
      }
    }
  }
}
```

**Key Points:**
- Uses Gmail's `thread_id` to identify conversation threads
- High confidence (0.95) since thread membership is reliable
- Link source marked as `thread_inheritance` for tracking
- Deduplicates tags from multiple thread emails

### 3. Gmail Label Write-Back

**Problem:** Users couldn't tell from Gmail which emails had been processed and linked in OVIS.

**Solution:** After successfully linking an email, apply an "OVIS-Linked" label in Gmail:

```typescript
// In email-triage/index.ts
const OVIS_LINKED_LABEL = 'OVIS-Linked';

// After successful tagging
if (agentResult.links_created > 0 && email.gmail_id && gmailConnectionId) {
  const { data: connection } = await supabase
    .from('gmail_connection')
    .select('*')
    .eq('id', gmailConnectionId)
    .single();

  if (connection) {
    // Refresh token if needed
    let accessToken = connection.access_token;
    if (isTokenExpired(connection.token_expires_at)) {
      const newTokens = await refreshAccessToken(
        connection.refresh_token,
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET
      );
      accessToken = newTokens.access_token;
      // Update token in database
    }

    // Apply the OVIS-Linked label
    const labelResult = await applyLabelToMessage(
      accessToken,
      email.gmail_id,
      OVIS_LINKED_LABEL
    );

    result.gmail_label_applied = labelResult.success;
  }
}
```

**New Gmail Label Functions** (`_shared/gmail.ts`):
- `listLabels()` - List all Gmail labels
- `createLabel()` - Create a new label
- `findLabelByName()` - Find label by name (case-insensitive)
- `getOrCreateLabel()` - Get existing or create new label
- `modifyMessageLabels()` - Add/remove labels from a message
- `applyLabelToMessage()` - High-level helper that handles errors gracefully

**Permissions:** Requires `gmail.modify` scope. Falls back gracefully if not available.

**Backfill Function:** A `backfill-gmail-labels` edge function is available to apply labels to previously processed emails.

### 4. Enhanced Deal Name Matching

**Problem:** AI was missing deals mentioned in email subject lines and body text because it wasn't scanning thoroughly.

**Solution:** Enhanced the system prompt with explicit instructions to scan for deal references:

```typescript
const systemPrompt = `
CRITICAL - DEAL NAME MATCHING:
- ALWAYS extract keywords from the email subject AND body before finishing.
- Deal names in OVIS often contain location information (city, state, street name, area).
- When you see a location in the subject or body, search for deals containing that location.
- Search by partial name: If subject says "Milledgeville", search_deals("Milledgeville").
- Search by city: If email mentions "Atlanta project", search_deals("Atlanta").
- Search by street: If email mentions "123 Main St", search_deals("Main").
- Multiple search calls are OK - make sure to search for each distinct keyword.
- NEVER skip deal search just because you found a contact match - deals are equally important.
- If an email discusses a property, lease, LOI, or transaction, ALWAYS search for deals.

COMMON MISTAKES TO AVOID:
- DO NOT assume an email is spam just because sender is unknown
- DO NOT skip deal search because you already found contacts
- DO NOT finish without searching both contacts AND deals
- DO NOT ignore location names in the subject line
`;
```

### 5. Tag Management in Email Detail Modal

**Problem:** Users could only view tags in the email detail modal. To add or remove tags, they had to go to the Email Classification Review page.

**Solution:** Added full tag management directly in `EmailDetailModal.tsx`:

**UI Components:**
- **"Add Tag" button** - Opens search interface
- **Search input** - Searches deals, contacts, clients, properties
- **Search results dropdown** - Click to add tag
- **Remove button (X)** - Appears on hover for each tag
- **AI indicator** - Shows sparkle icon for AI-added tags

**Functions Added:**

```typescript
// Search for CRM objects
const handleSearch = async (query: string) => {
  // Search deals, contacts, clients, properties
  // Returns combined results with type badges
};

// Add a tag with AI training feedback
const handleAddTag = async (object: CRMSearchResult) => {
  // Create email_object_link
  // Log to agent_corrections (AI missed this link)
  // Create activity record if linking to deal
  // Update local state
};

// Remove a tag with AI training feedback
const handleRemoveTag = async (linkedObject: LinkedObject) => {
  // Delete from email_object_link
  // Log to agent_corrections if was AI-added (AI was wrong)
  // Update local state
};
```

**AI Training Integration:**
- **Adding a tag**: Logs as "AI missed linking to [type]"
- **Removing an AI tag**: Logs as "AI incorrectly linked to [type]"
- These corrections feed into the Active Learning system

**Visual Indicators:**
- Tags now show a sparkle icon if `linkSource === 'ai_agent'`
- Remove button appears on hover with red highlight
- Loading spinner during add/remove operations

### Updated Response Format

The email triage response now includes Gmail label status:

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
  "gmail_labels_applied": 1,
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
      "summary": "Linked to deal and client",
      "gmail_label_applied": true,
      "gmail_label_error": null
    }
  ]
}
```

### Email Detail Modal - Link Sources

The system now tracks and displays how each link was created:

| Link Source | Display | Meaning |
|-------------|---------|---------|
| `ai_agent` | Sparkle icon | AI automatically linked |
| `manual` | No icon | User manually added |
| `thread_inheritance` | No icon | Inherited from thread |
| `rule` | No icon | Created by rule match |

### Testing Phase 3 Features

**Test Recipient Tagging:**
1. Send an email to multiple recipients who exist as contacts
2. Run email triage
3. Verify all recipients were tagged

**Test Thread Inheritance:**
1. Tag an email to a deal manually
2. Send/receive a reply to that thread
3. Run email triage on the reply
4. Verify the reply inherited the deal tag

**Test Gmail Labels:**
1. Process an email that gets linked
2. Check Gmail for "OVIS-Linked" label
3. Run `backfill-gmail-labels` for existing emails

**Test Tag Management:**
1. Open an email in the detail modal
2. Click "Add Tag" and search for a deal
3. Add the tag, verify it appears with correct icon
4. Remove a tag, verify it's deleted
5. Check `agent_corrections` table for training data

---

## Next Steps (Proposed)

### Phase 4: Enhanced Rule System
1. Auto-rule creation when users correct classifications
2. Semantic rule matching with embeddings
3. Rule testing preview
4. Rule analytics (trigger counts)

### Phase 5: Advanced Features
1. Attachment analysis (PDFs, images via vision)
2. Proactive suggestions (create task, update deal stage)
3. Confidence calibration based on correction rates
4. Email summary generation

### Phase 6: Observability
1. Agent dashboard with metrics
2. Cost tracking per email
3. Performance optimization
4. Audit log for compliance

---

## Phase 4: Shared Email Visibility (January 12, 2026)

### Overview

Updated RLS policies so that tagged emails are visible to all team members, enabling true collaboration on deal/client communications.

### Visibility Rules

| Email State | Who Can See |
|-------------|-------------|
| **Untagged** | Only the user who synced it (via `email_visibility`) |
| **Tagged to CRM object** | All authenticated users |

### Deduplication

The system prevents duplicate emails through existing constraints:
- `emails.message_id` UNIQUE - Same Gmail message stored only once
- `email_object_link` UNIQUE(email_id, object_type, object_id) - Can't double-tag

**Example scenario:**
1. Both Mike and Arty receive the same email (CC'd together)
2. Mike syncs his Gmail → Email stored with `message_id = "abc123"`
3. Arty syncs his Gmail → Email already exists (same `message_id`), only `email_visibility` record created
4. Mike tags email to Deal X → `email_object_link` created
5. Arty opens Deal X → Sees the email (shared via tag)
6. Arty tries to tag same email to Deal X → Blocked by unique constraint (already tagged)
7. Result: One email, one tag, visible to both

### Migration

File: `supabase/migrations/20260112_email_shared_visibility.sql`

Changes:
- Updated `emails_select` policy: Shows emails with tags to all authenticated users
- Updated `email_object_link_select` policy: All authenticated users can see tags
- Updated `email_object_link_insert` policy: Can tag own emails or already-tagged emails
- Updated `email_object_link_delete` policy: Can remove tags you created or on your own emails
- Added `email_object_link_update` policy (was missing)

### Tagging Permissions

| Action | Permission |
|--------|------------|
| Tag your own synced email | ✅ Allowed |
| Add tags to already-tagged email | ✅ Allowed |
| Remove tag you created | ✅ Allowed |
| Remove tag on your own email | ✅ Allowed |
| Remove someone else's tag on shared email | ❌ Blocked |

---

*Document updated: January 12, 2026*
*Phase 1 improvements completed*
*Phase 2 Active Learning completed*
*Phase 3 Enhanced Email Intelligence completed*
*Phase 4 Shared Email Visibility completed*
*System: OVIS CRM with Gemini 2.5 Flash autonomous agent*
