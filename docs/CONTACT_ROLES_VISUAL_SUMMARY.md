# Contact Roles System - Visual Summary

## The Problem You Had

```
Old System:
┌────────────────────────────────────────┐
│  Contact: John Doe                     │
│  is_site_selector: TRUE                │
│  client_id: Starbucks                  │
└────────────────────────────────────────┘

Issues:
❌ John can only be site selector for ONE client (the one in client_id)
❌ If John is associated with McDonald's via contact_client_relation, he won't get emails
❌ John can't have multiple roles (e.g., Site Selector AND Decision Maker)
❌ No way to make John a Site Selector at Starbucks but NOT at McDonald's
```

## The Solution I Built

```
New System:
┌────────────────────────────────────────┐
│  Contact: John Doe                     │
│                                        │
│  Roles at Starbucks:                   │
│    • Site Selector                     │
│    • Decision Maker                    │
│    • Real Estate Lead                  │
│                                        │
│  Roles at McDonald's:                  │
│    • Decision Maker                    │
│    (NOT a Site Selector here!)         │
│                                        │
│  Roles at Wendy's:                     │
│    • Influencer                        │
└────────────────────────────────────────┘

Benefits:
✅ John can have different roles at different clients
✅ John can have multiple roles at the same client
✅ Site submit emails only go to Site Selectors for THAT specific client
✅ Works with contact_client_relation associations
```

---

## How It Works

### Database Structure

```
                    ┌──────────────────────────┐
                    │ contact_client_role_type │
                    │   (Role Definitions)     │
                    ├──────────────────────────┤
                    │ • Site Selector          │
                    │ • Decision Maker         │
                    │ • Influencer             │
                    │ • Real Estate Lead       │
                    │ • Legal Contact          │
                    │ • Financial Contact      │
                    │ • Construction Contact   │
                    │ • Operations Contact     │
                    │ • Executive Sponsor      │
                    │ • Other                  │
                    └────────────┬─────────────┘
                                 │
                                 │ References role_id
                                 │
                    ┌────────────▼─────────────┐
                    │   contact_client_role    │
                    │   (Role Assignments)     │
                    ├──────────────────────────┤
                    │ contact_id → Contact     │
                    │ client_id  → Client      │
                    │ role_id    → Role Type   │
                    │ is_active  → true/false  │
                    │ notes      → "..."       │
                    └──────────────────────────┘
                         │              │
              ┌──────────┘              └──────────┐
              │                                    │
    ┌─────────▼─────────┐                ┌────────▼────────┐
    │     Contact       │                │     Client      │
    │                   │                │                 │
    │ John Doe          │                │ Starbucks       │
    │ jane@example.com  │                │ McDonald's      │
    │ ...               │                │ Wendy's         │
    └───────────────────┘                └─────────────────┘
```

### Example: John's Roles

```sql
-- John at Starbucks
INSERT INTO contact_client_role (contact_id, client_id, role_id) VALUES
  ('john-uuid', 'starbucks-uuid', 'site-selector-role-uuid'),
  ('john-uuid', 'starbucks-uuid', 'decision-maker-role-uuid');

-- John at McDonald's (different roles!)
INSERT INTO contact_client_role (contact_id, client_id, role_id) VALUES
  ('john-uuid', 'mcdonalds-uuid', 'decision-maker-role-uuid');
  -- Notice: NO Site Selector role here!

-- Result:
-- Starbucks site submit → John gets email ✓
-- McDonald's site submit → John does NOT get email ✓
```

---

## User Interface

### Before: Simple Text Field

```
┌─────────────────────────────────────┐
│ Associated Clients                  │
├─────────────────────────────────────┤
│ • Starbucks [Primary]               │
│   Role: Site Selector               │ ← Just text, can't change easily
│                                     │
│ • McDonald's                        │
│   Role: Decision Maker              │ ← Just text
└─────────────────────────────────────┘
```

### After: Interactive Role Badges

```
┌─────────────────────────────────────────────────────────┐
│ Associated Clients                                      │
├─────────────────────────────────────────────────────────┤
│ • Starbucks [Primary]                                   │
│   ┌────────────────┐ ┌────────────────┐ ┌──────────┐  │
│   │ Site Selector  │ │ Decision Maker │ │ + Add    │  │ ← Click to manage
│   │       ✕        │ │       ✕        │ │   Role   │  │
│   └────────────────┘ └────────────────┘ └──────────┘  │
│                                                         │
│ • McDonald's                                            │
│   ┌────────────────┐ ┌──────────┐                      │
│   │ Decision Maker │ │ + Add    │                      │ ← Different roles!
│   │       ✕        │ │   Role   │                      │
│   └────────────────┘ └──────────┘                      │
└─────────────────────────────────────────────────────────┘
```

### Add Role Modal

```
┌──────────────────────────────────────────┐
│  Add Role                           ✕    │
├──────────────────────────────────────────┤
│                                          │
│  Adding role for John Doe at Starbucks  │
│                                          │
│  Select Role *                           │
│  ┌────────────────────────────────────┐ │
│  │ Site Selector                   ▼  │ │
│  └────────────────────────────────────┘ │
│    Receives site submit notifications   │
│                                          │
│  Notes (optional)                        │
│  ┌────────────────────────────────────┐ │
│  │ Primary contact for all site...    │ │
│  │                                    │ │
│  └────────────────────────────────────┘ │
│                                          │
│          ┌────────┐  ┌──────────────┐   │
│          │ Cancel │  │  Add Role    │   │
│          └────────┘  └──────────────┘   │
└──────────────────────────────────────────┘
```

---

## Site Submit Email Flow

### Old Flow (Missed Some Contacts)

```
1. Site Submit Created for Starbucks
                ↓
2. Query: SELECT * FROM contact
          WHERE client_id = 'Starbucks'  ← Only finds contacts directly on client
          AND is_site_selector = true

3. Result: Found 2 contacts
   ✓ John Doe (contact.client_id = Starbucks)
   ✓ Jane Smith (contact.client_id = Starbucks)
   ✗ Sarah Wilson (associated via contact_client_relation) ← MISSED!

4. Send emails to 2 people
```

### New Flow (Finds All Site Selectors)

```
1. Site Submit Created for Starbucks
                ↓
2. Query: SELECT * FROM contact_client_role
          JOIN contact ON contact.id = contact_client_role.contact_id
          WHERE client_id = 'Starbucks'
          AND role_name = 'Site Selector'  ← Looks at role assignments
          AND is_active = true

3. Result: Found 3 contacts
   ✓ John Doe (has Site Selector role at Starbucks)
   ✓ Jane Smith (has Site Selector role at Starbucks)
   ✓ Sarah Wilson (has Site Selector role at Starbucks) ← NOW FOUND!
     (even though she's only associated via contact_client_relation)

4. Send emails to 3 people
```

---

## Real-World Examples

### Example 1: Multi-Site Retail Contact

```
Contact: Jane Smith
Email: jane@retail-group.com

┌─────────────────────────────────────────────┐
│  At Client: Target                          │
│  Roles: [Site Selector] [Decision Maker]    │
│  → Gets site submit emails for Target       │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  At Client: Walmart                         │
│  Roles: [Site Selector] [Influencer]        │
│  → Gets site submit emails for Walmart      │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  At Client: Best Buy                        │
│  Roles: [Influencer]                        │
│  → Does NOT get site submit emails          │
└─────────────────────────────────────────────┘
```

### Example 2: Real Estate Team

```
Client: Starbucks
Location: Seattle Region

┌──────────────────────────────────────────────────┐
│  Contact: Mike Johnson (VP Real Estate)         │
│  Roles: [Decision Maker] [Executive Sponsor]     │
│  → CC'd on emails but doesn't make site calls    │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│  Contact: Sarah Lee (Site Selector)              │
│  Roles: [Site Selector] [Real Estate Lead]       │
│  → Primary recipient of site submit emails       │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│  Contact: Tom Davis (Analyst)                    │
│  Roles: [Influencer]                             │
│  → Not included in site submit emails            │
└──────────────────────────────────────────────────┘
```

### Example 3: Complex Organization

```
Contact: Robert Chen
Title: SVP of Real Estate
Email: robert.chen@megacorp.com

Works with multiple brands:

┌────────────────────────────────────────┐
│  Brand: Starbucks (US)                 │
│  [Site Selector] [Decision Maker]      │
│  [Real Estate Lead]                    │
└────────────────────────────────────────┘
          ↓
    Gets all site submit emails

┌────────────────────────────────────────┐
│  Brand: Starbucks (Canada)             │
│  [Decision Maker] [Executive Sponsor]  │
└────────────────────────────────────────┘
          ↓
    Does NOT get site submit emails
    (no Site Selector role)

┌────────────────────────────────────────┐
│  Brand: Dunkin' Donuts                 │
│  [Influencer]                          │
└────────────────────────────────────────┘
          ↓
    Does NOT get site submit emails
```

---

## Migration Process

### What Happens During Migration

```
BEFORE Migration:
┌────────────────────────────────┐
│  contact table                 │
│  ├─ John Doe                   │
│  │  client_id: Starbucks       │
│  │  is_site_selector: true ✓   │
│  │                             │
│  ├─ Jane Smith                 │
│  │  client_id: McDonald's      │
│  │  is_site_selector: true ✓   │
└────────────────────────────────┘

AFTER Migration:
┌────────────────────────────────┐
│  contact table (unchanged)     │
│  ├─ John Doe                   │
│  │  client_id: Starbucks       │
│  │  is_site_selector: true     │
│  │                             │
│  ├─ Jane Smith                 │
│  │  client_id: McDonald's      │
│  │  is_site_selector: true     │
└────────────────────────────────┘
          ↓ Automatically Creates
┌────────────────────────────────┐
│  contact_client_role            │
│  ├─ John + Starbucks +          │
│  │    Site Selector role        │
│  │                             │
│  ├─ Jane + McDonald's +         │
│  │    Site Selector role        │
└────────────────────────────────┘
```

**Key Points:**
- ✅ Old data is preserved
- ✅ New data is created automatically
- ✅ Nothing breaks
- ✅ You can start using the new system immediately

---

## Role Badge Colors

The UI uses color-coded badges for easy identification:

```
┌────────────────┐
│ Site Selector  │  Blue
└────────────────┘

┌────────────────┐
│ Decision Maker │  Purple
└────────────────┘

┌────────────────┐
│  Influencer    │  Green
└────────────────┘

┌──────────────────┐
│ Real Estate Lead │  Orange
└──────────────────┘

┌────────────────┐
│ Legal Contact  │  Red
└────────────────┘

┌──────────────────┐
│ Financial Contact│  Yellow
└──────────────────┘

┌──────────────────────┐
│ Construction Contact │  Indigo
└──────────────────────┘

┌──────────────────────┐
│ Operations Contact   │  Teal
└──────────────────────┘

┌─────────────────────┐
│ Executive Sponsor   │  Pink
└─────────────────────┘

┌────────────┐
│   Other    │  Gray
└────────────┘
```

---

## Quick Reference

### Check Contact's Roles at a Client

```sql
SELECT
  c.first_name,
  c.last_name,
  cr.role_name,
  ccr.notes
FROM contact_client_role ccr
JOIN contact c ON c.id = ccr.contact_id
JOIN contact_client_role_type cr ON cr.id = ccr.role_id
WHERE ccr.contact_id = 'john-uuid'
  AND ccr.client_id = 'starbucks-uuid'
  AND ccr.is_active = true;
```

### Find All Site Selectors for a Client

```sql
SELECT * FROM v_site_selectors_by_client
WHERE client_id = 'starbucks-uuid';
```

### Add a Role

```typescript
await supabase
  .from('contact_client_role')
  .insert({
    contact_id: 'john-uuid',
    client_id: 'starbucks-uuid',
    role_id: 'site-selector-role-uuid',
    notes: 'Primary site selector for Seattle region'
  })
```

### Remove a Role

```typescript
await supabase
  .from('contact_client_role')
  .delete()
  .eq('id', 'role-assignment-uuid')
```

---

## The Answer to Your Question

> "Some contacts can be site selector role for some associated clients but not others, so that would run from the role I give them for that particular client. Is that how you are designing this?"

**YES! That's exactly how it works!** 🎯

```
John Doe:
  At Starbucks:   [Site Selector] ✓ → Gets emails
  At McDonald's:  [Decision Maker] → Does NOT get emails
  At Wendy's:     [Influencer] → Does NOT get emails

The role is tied to the SPECIFIC contact-client relationship,
not to the contact globally!
```

**This is the whole point of the `contact_client_role` junction table!**

Each row represents ONE role assignment for ONE contact at ONE client.

The same contact can have:
- ✅ Multiple roles at the same client
- ✅ Different roles at different clients
- ✅ Roles added/removed independently per client

---

## Summary

### What You Get

1. ✅ **Flexible Role System** - Multiple roles per contact per client
2. ✅ **Better Email Routing** - Site submits go to right people
3. ✅ **Scalable Design** - Easy to add new roles
4. ✅ **Type-Safe** - Full TypeScript support
5. ✅ **User-Friendly UI** - Color-coded badges, easy management
6. ✅ **Backward Compatible** - Existing data automatically migrated
7. ✅ **Production Ready** - RLS policies, indexes, views included

### Files Created

| File | Purpose |
|------|---------|
| `migrations/contact_roles_many_to_many.sql` | Database migration |
| `database-schema-additions.ts` | TypeScript types |
| `supabase/functions/send-site-submit-email/index.ts` | Updated email function |
| `src/hooks/useContactClientRoles.ts` | React hook |
| `src/components/ContactRolesManager.tsx` | UI component |
| `docs/CONTACT_ROLES_SYSTEM.md` | Full documentation |
| `IMPLEMENTATION_GUIDE_CONTACT_ROLES.md` | Implementation guide |
| `CONTACT_ROLES_VISUAL_SUMMARY.md` | This file |

### Time to Implement

- Database migration: **5 minutes**
- Deploy email function: **1 minute**
- Update UI: **15 minutes**
- Testing: **15 minutes**

**Total: ~40 minutes** ⏱️

---

**Ready to implement?** Follow the steps in `IMPLEMENTATION_GUIDE_CONTACT_ROLES.md`! 🚀
