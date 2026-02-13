# ADR-0001: Domain-Specific Activity Tables for AI-Readable Data

## Status
Accepted

## Date
2026-02-13

## Context

The application has two patterns for storing activity/interaction data:

### Legacy Pattern: Generic `activity` Table
Used for deals, contacts, and properties. This pattern uses:
- A polymorphic `activity` table with `activity_type_id` foreign key
- Separate `activity_type` lookup table for type definitions
- Generic fields that must accommodate all activity types
- Complex joins to resolve type names and related entities

### New Pattern: Domain-Specific Tables (Hunter/Prospecting)
Introduced with the Hunter prospecting system:
- `prospecting_activity` table with typed `activity_type` CHECK constraint
- `prospecting_note` table for running notes
- Direct foreign keys (`contact_id`, `target_id`) without polymorphism
- Domain-specific columns (`email_subject`, `notes`)

## Decision

**New features should use domain-specific activity tables** rather than extending the generic `activity` table.

### Schema Pattern

```sql
CREATE TABLE {domain}_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Direct foreign keys to related entities
  {entity}_id UUID REFERENCES {entity}(id) ON DELETE CASCADE,

  -- Typed activity classification
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'email',      -- Specific to this domain
    'call',
    'meeting',
    -- etc.
  )),

  -- Domain-specific fields
  notes TEXT,
  email_subject TEXT,  -- Only for email activities
  {other_domain_fields},

  -- Standard audit fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Separate notes table for running commentary
CREATE TABLE {domain}_note (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  {entity}_id UUID REFERENCES {entity}(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);
```

## Rationale

### 1. AI/Agent Readability
Domain-specific tables are significantly easier for AI tools to understand and query:

| Aspect | Generic Pattern | Domain-Specific Pattern |
|--------|-----------------|------------------------|
| Type Resolution | `JOIN activity_type ON activity_type_id` | `WHERE activity_type = 'email'` |
| Entity Links | Polymorphic, requires context | Direct FK, self-documenting |
| Field Semantics | Generic `description`, `metadata` | `email_subject`, `call_duration` |
| Query Complexity | 3-4 joins minimum | Single table or simple join |

**Example AI Query Comparison:**

Generic pattern:
```sql
SELECT a.*, at.name as type_name, c.first_name, c.last_name
FROM activity a
JOIN activity_type at ON a.activity_type_id = at.id
JOIN activity_object_link aol ON a.id = aol.activity_id
JOIN contact c ON aol.object_id = c.id AND aol.object_type = 'contact'
WHERE at.name = 'Email'
```

Domain-specific pattern:
```sql
SELECT pa.*, c.first_name, c.last_name
FROM prospecting_activity pa
JOIN contact c ON pa.contact_id = c.id
WHERE pa.activity_type = 'email'
```

### 2. Type Safety
CHECK constraints enforce valid activity types at the database level:
```sql
activity_type TEXT NOT NULL CHECK (activity_type IN ('email', 'call', 'linkedin', 'sms', 'voicemail', 'meeting'))
```

### 3. Domain-Specific Fields
Each activity type can have relevant columns without polluting a generic table:
- Email activities: `email_subject`, `gmail_message_id`, `gmail_thread_id`
- Call activities: `call_duration`, `call_outcome`
- Meeting activities: `meeting_location`, `attendees`

### 4. Simpler RLS Policies
Row-level security is more straightforward:
```sql
CREATE POLICY "prospecting_activity_select"
  ON prospecting_activity FOR SELECT TO authenticated
  USING (true);  -- Simple, domain-appropriate rules
```

### 5. Performance
- No polymorphic joins
- Indexes can be domain-optimized
- Smaller table sizes per domain

## Consequences

### Positive
- **AI-First Architecture**: Data structures are self-documenting
- **Clearer Code**: Frontend queries are simpler and more maintainable
- **Better Type Safety**: Database enforces valid states
- **Easier Testing**: Domain isolation makes unit testing straightforward
- **Performance**: Simpler queries, better index utilization

### Negative
- **More Tables**: Each domain has its own activity tables
- **Schema Divergence**: Similar concepts may have slightly different schemas
- **Migration Complexity**: Existing generic activity data harder to migrate

### Neutral
- **Existing System**: The generic `activity` table continues to serve existing features
- **Gradual Adoption**: New features use the new pattern; existing features unchanged

## Examples

### Current Domain-Specific Tables (Hunter)
- `prospecting_activity` - Outreach activities (email, call, linkedin, etc.)
- `prospecting_note` - Running notes on targets/contacts
- `target_signal` - Signal events for hunter targets

### Future Candidates
If building new features, consider domain-specific tables for:
- **Deal Activity**: `deal_activity` with deal-specific types (proposal_sent, negotiation, etc.)
- **Property Activity**: `property_activity` with property-specific types (tour, inspection, etc.)
- **Support Tickets**: `ticket_activity` with support-specific types (reply, escalation, etc.)

## Related Decisions
- Hunter prospecting system design (Feb 2026)
- Email templates and signatures system

## Notes
The generic `activity` table remains in use for existing functionality. This ADR recommends the domain-specific pattern for new development, not a mandatory migration of existing systems.
