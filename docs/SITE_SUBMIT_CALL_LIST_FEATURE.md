# Site Submit Call List Feature

## Overview

The Site Submit Call List is a new tab on the Site Submit Dashboard that groups site submits by broker contact(s) for efficient calling and outreach. This enables users to see all properties for the same broker(s) together, facilitating more efficient phone calls and email follow-ups.

## Date Implemented

2026-03-10

## Features

### 1. Broker Grouping

Site submits are grouped by the broker contact(s) associated with each property:

- **Single broker properties**: Grouped under that broker
- **Multiple broker properties**: Properties with the same set of brokers are grouped together
- **Unassigned properties**: Properties without broker contacts shown in a separate section

#### Grouping Logic

Properties are grouped by a composite key of sorted broker IDs. For example:
- Property A has brokers: Ed, Mindy
- Property B has brokers: Mindy, Ed (same set, different order)
- Both properties appear in the same group labeled "Ed & Mindy"

### 2. Contact Actions

Each broker group displays:

- **Phone numbers**: Click-to-call links for each broker's phone
- **Email button**: Opens Gmail compose modal for all brokers in the group

### 3. Gmail API Integration

The Email button opens a compose modal that sends emails via Gmail API:

- **Recipients**: Auto-populated with broker email addresses
- **CC**: Default CC list (mike@oculusrep.com, asantos@oculusrep.com)
- **Subject**: Auto-generated from property names (e.g., "Following up - Property A, Property B and 3 more")
- **Body**: Pre-written template with property list
- **Signature**: User's default email signature from `user_email_signature` table
- **Attachments**: Optional file attachments

#### Greeting Logic

The greeting adapts to the number of recipients:
- 1 broker: "Hi Ed,"
- 2 brokers: "Hi Ed and Mindy,"
- 3+ brokers: "Hi Ed, Mindy, and John,"

### 4. Expandable Property Details

Each broker group is expandable to show detailed property information:

| Column | Description |
|--------|-------------|
| Property | Property name with click-to-open link |
| Location | City, State |
| Client | Client name |
| Stage | Current site submit stage |
| Submitted | Date submitted |
| Notes | Truncated notes field |

### 5. Activity Logging

When an email is sent, activities are logged for each broker contact:
- Type: Email
- Subject: "Sent: [email subject]"
- Description: Recipients and property count
- Date: Current date

## Files Created/Modified

### New Files

| File | Description |
|------|-------------|
| `src/components/sitesubmit/SiteSubmitCallList.tsx` | Main Call List component |
| `src/components/sitesubmit/BrokerEmailModal.tsx` | Gmail compose modal for broker outreach |

### Modified Files

| File | Change |
|------|--------|
| `src/pages/SiteSubmitDashboardPage.tsx` | Added "Call List" tab |

## Technical Implementation

### Query Batching

Property contacts are fetched in batches of 50 to avoid URL length limits:

```typescript
const BATCH_SIZE = 50;
for (let i = 0; i < propertyIds.length; i += BATCH_SIZE) {
  const batch = propertyIds.slice(i, i + BATCH_SIZE);
  const { data } = await supabase
    .from('property_contact')
    .select(`...`)
    .in('property_id', batch);
}
```

### Foreign Key Join Syntax

Uses explicit FK naming for Supabase joins:

```typescript
.select(`
  property_id,
  contact!property_contact_contact_id_fkey (
    id, first_name, last_name, email, phone, mobile_phone, company, title
  )
`)
```

### Email Sending

Uses the existing `hunter-send-outreach` Supabase Edge Function:

```typescript
const response = await supabase.functions.invoke('hunter-send-outreach', {
  body: {
    user_email: userData?.email || user.email,
    to: toRecipients,
    cc: ccRecipients,
    subject,
    body_html: htmlBody,
    attachments: attachments
  }
});
```

### Signature Fetching

Fetches user's default signature on modal open:

```typescript
const { data: signature } = await supabase
  .from('user_email_signature')
  .select('signature_html')
  .eq('user_id', userData.id)
  .eq('is_default', true)
  .single();
```

## User Interface

### Call List Tab Location

The Call List is accessible from the Site Submit Dashboard:
1. Navigate to `/site-submits`
2. Click "Call List" tab (alongside "Dashboard" and "Client Submit Report")

### Summary Header

Displays:
- Number of broker groups
- Total site submits
- Count of properties without broker contacts

### Broker Group Card

```
┌─────────────────────────────────────────────────────────────────┐
│ [▶] Ed Smith & Mindy Jones   [3 properties] [2 brokers]        │
│     CBRE & JLL                    📞 (555) 123-4567  [Email]   │
├─────────────────────────────────────────────────────────────────┤
│ Property      │ Location  │ Client    │ Stage   │ Submitted    │
│ 123 Main St   │ Dallas, TX│ Target    │ LOI     │ Mar 5, 2026  │
│ 456 Oak Ave   │ Houston   │ Target    │ Review  │ Mar 3, 2026  │
└─────────────────────────────────────────────────────────────────┘
```

### Email Compose Modal

```
┌─────────────────────────────────────────────────────────────────┐
│ Email Broker                                              [X]   │
│ Ed Smith, Mindy Jones                                          │
├─────────────────────────────────────────────────────────────────┤
│ To:  [ed@cbre.com] [mindy@jll.com]                             │
│ CC:  [mike@oculusrep.com] [asantos@oculusrep.com]              │
│ Subject: Following up - 123 Main St, 456 Oak Ave and 1 more   │
│                                                                 │
│ Hi Ed and Mindy,                                               │
│                                                                 │
│ I wanted to touch base with you regarding the following        │
│ properties:                                                     │
│                                                                 │
│ • 123 Main St (Dallas, TX)                                     │
│ • 456 Oak Ave (Houston, TX)                                    │
│ • 789 Pine Rd (Austin, TX)                                     │
│                                                                 │
│ Please let me know if you have any updates or availability     │
│ for a quick call.                                              │
│                                                                 │
│ [Attach Files]                                                 │
├─────────────────────────────────────────────────────────────────┤
│ 3 properties • 2 recipients      [Cancel] [Send]               │
└─────────────────────────────────────────────────────────────────┘
```

## Commits

```
a486771e Add Gmail API integration to Site Submit Call List
ce4e64ad Update BrokerEmailModal greeting and add signature
```

## Related Documentation

- [Site Submit Email System](./SITE_SUBMIT_EMAIL_SYSTEM.md)
- [Email System Setup](./EMAIL_SYSTEM_SETUP.md)
- [Property Contacts](./PROPERTY_CONTACTS.md)
